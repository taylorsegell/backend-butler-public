import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHass, useStore } from '../hass/context';

// Card <-> integration settings proxy (forwards to the scheduler's /settings). A
// persistent_notification is ALWAYS raised by the worker; these are the extra notify.*
// services (e.g. a phone via the HA Companion app) it also pushes to.
const PATH = 'backend_butler/settings';

export interface NotifyTarget {
  /** notify service name, e.g. "mobile_app_iphone" (stored value). */
  service: string;
  /** Friendly label for the chip. */
  label: string;
}

/** A family member with their own memory, conversation and notification devices. */
export interface Person {
  /** Fixed once set; every service knows the person by it. The scheduler fills it in. */
  id?: string;
  name: string;
  /** The HA account that resolves to this person on the card and in voice sessions. */
  ha_user_id: string | null;
  notify_targets: string[];
  /** Restricted MCP servers the agent may use for this person; not edited here. */
  servers?: string[];
}

/** An MCP server the agent offers a person only when their entry lists it. */
export interface RestrictedServer {
  id: string;
  title: string;
}

/** An HA login that can be linked to a person. */
export interface HaAccount {
  id: string;
  name: string;
}

export interface NotifySettingsApi {
  available: NotifyTarget[];
  users: Person[];
  /** The servers a person can be given, from the worker's mcp.yaml. */
  servers: RestrictedServer[];
  /** HA logins for the account picker; null when the viewer cannot list them. */
  accounts: HaAccount[] | null;
  saving: boolean;
  loading: boolean;
  ready: boolean;
  reload: () => void;
  error: string | null;
  /** Add a person; returns an error message when the name is empty or taken. */
  addUser: (name: string) => string | null;
  removeUser: (name: string) => void;
  updateUser: (name: string, patch: Partial<Omit<Person, 'name'>>) => void;
}

function labelFor(service: string): string {
  const base = service.startsWith('mobile_app_')
    ? service.slice('mobile_app_'.length)
    : service;
  return base.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function toPeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u) => u && typeof u.name === 'string')
    .map((u) => ({
      // fields this tab does not edit, such as id and servers, are saved back as they came
      ...u,
      name: u.name,
      ha_user_id: typeof u.ha_user_id === 'string' && u.ha_user_id ? u.ha_user_id : null,
      notify_targets: Array.isArray(u.notify_targets) ? u.notify_targets : [],
    }));
}

/**
 * The Settings tab's state: the notify.* services HA exposes (minus the always-on
 * persistent_notification and the catch-all `notify`), the people loaded from the scheduler,
 * and optimistic edits that save each change.
 */
export function useNotifySettings(): NotifySettingsApi {
  const hass = useHass();
  const store = useStore();
  const hasHass = !!hass;
  const [users, setUsers] = useState<Person[]>([]);
  const [servers, setServers] = useState<RestrictedServer[]>([]);
  const [accounts, setAccounts] = useState<HaAccount[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);
  const accountsLoaded = useRef(false);
  // the latest people list, so quick successive edits build on each other
  const usersRef = useRef<Person[]>([]);

  // The device list stays live: HA replaces `hass` on every registry change, so a device
  // added / removed (or a notify service appearing/disappearing) recomputes this memo.
  // phones by the name they have in HA now; their service ids keep the registered name
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  const available = useMemo<NotifyTarget[]>(() => {
    const svc = hass?.services?.notify;
    if (!svc) return [];
    // Exclude non-device services: the always-on persistent_notification (shown as its own
    // row), the legacy catch-all `notify`, and the generic `send_message` action (needs a
    // target entity, so it isn't a pickable destination on its own).
    const skip = new Set(['persistent_notification', 'notify', 'send_message']);
    return Object.keys(svc)
      .filter((s) => !skip.has(s))
      .map((s) => ({ service: s, label: deviceNames[s] ?? labelFor(s) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [hass, deviceNames]);

  // Read from the stable store: HA state pushes must not cancel an in-flight load.
  const reload = useCallback(() => {
    const current = store.getSnapshot().hass;
    if (!current || loadingRef.current || savingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setReady(false);
    setError(null);
    current.callApi<{ users?: unknown; device_names?: Record<string, string>; servers?: RestrictedServer[] }>('GET', PATH)
      .then((data) => {
        if (!mounted.current) return;
        if (!Array.isArray(data?.users)) throw new Error('Invalid settings');
        setDeviceNames(data.device_names && typeof data.device_names === 'object' ? data.device_names : {});
        setServers(Array.isArray(data.servers) ? data.servers
          .filter((server) => server && typeof server.id === 'string')
          .map((server) => ({ id: server.id, title: typeof server.title === 'string' ? server.title : server.id })) : []);
        usersRef.current = toPeople(data.users);
        setUsers(usersRef.current);
        setReady(true);
      })
      .catch(() => {
        if (mounted.current) setError('Could not load notification settings. Retry before making changes.');
      })
      .finally(() => {
        loadingRef.current = false;
        if (mounted.current) setLoading(false);
      });
  }, [store]);

  useEffect(() => {
    mounted.current = true;
    if (hasHass) reload();
    return () => { mounted.current = false; };
  }, [hasHass, reload]);

  // HA lets only admins list logins; anyone else sees linked accounts read-only.
  useEffect(() => {
    if (!hass?.user?.is_admin || !hass.callWS || accountsLoaded.current) return;
    accountsLoaded.current = true;
    hass
      .callWS<any[]>({ type: 'config/auth/list' })
      .then((list) =>
        setAccounts(
          (Array.isArray(list) ? list : [])
            .filter((u) => u && !u.system_generated)
            .map((u) => ({ id: u.id, name: u.name || u.username || u.id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setAccounts(null));
  }, [hass]);

  const saveUsers = useCallback(
    (next: Person[]) => {
      if (!hass || !ready || savingRef.current) return;
      savingRef.current = true;
      const prev = usersRef.current;
      usersRef.current = next;
      setUsers(next);
      setSaving(true);
      setError(null);
      hass
        .callApi<{ users?: unknown }>('PUT', PATH, { users: next })
        .then((data) => {
          // Retain server-normalized IDs and fields for the next full-list write.
          if (Array.isArray(data?.users)) {
            usersRef.current = toPeople(data.users);
            if (mounted.current) setUsers(usersRef.current);
          }
        })
        .catch(() => {
          setError('Could not save. Try again.');
          // roll back only when no newer edit replaced this one meanwhile
          if (usersRef.current === next) {
            usersRef.current = prev;
            setUsers(prev);
          }
        })
        .finally(() => { savingRef.current = false; if (mounted.current) setSaving(false); });
    },
    [hass, ready],
  );

  const addUser = useCallback(
    (raw: string) => {
      if (!ready || savingRef.current) return 'Wait for settings to finish loading or saving.';
      const name = raw.trim();
      if (!name) return 'Enter a name.';
      if (usersRef.current.some((u) => sameName(u.name, name))) return `${name} is already listed.`;
      saveUsers([...usersRef.current, { name, ha_user_id: null, notify_targets: [] }]);
      return null;
    },
    [saveUsers, ready],
  );

  const removeUser = useCallback(
    (name: string) => saveUsers(usersRef.current.filter((u) => !sameName(u.name, name))),
    [saveUsers],
  );

  const updateUser = useCallback(
    (name: string, patch: Partial<Omit<Person, 'name'>>) =>
      saveUsers(usersRef.current.map((u) => (sameName(u.name, name) ? { ...u, ...patch } : u))),
    [saveUsers],
  );

  return {
    available,
    users,
    servers,
    accounts,
    saving,
    loading,
    ready,
    reload,
    error,
    addUser,
    removeUser,
    updateUser,
  };
}
