import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { AppearanceSettings } from './AppearanceSettings';
import { useHass } from '../hass/context';
import {
  useNotifySettings,
  type HaAccount,
  type NotifyTarget,
  type Person,
  type RestrictedServer,
} from '../lib/settings-api';

// The in-HA persistent notification, presented as the first (default-on) channel.
const PERSISTENT = 'persistent_notification';
const TEST_MESSAGE = 'Test notification from Backend Butler.';

interface Row {
  service: string;
  label: string;
  icon: string;
}

type TestState = 'idle' | 'sending' | 'sent' | 'error';

function Checklist({
  rows,
  selected,
  onToggle,
  label,
  liveTarget,
}: {
  rows: Row[];
  selected: string[];
  onToggle: (service: string) => void;
  label: string;
  liveTarget?: string;
}) {
  return (
    <div className="lk-checklist" role="group" aria-label={label}>
      {rows.map((r) => {
        const on = selected.includes(r.service);
        return (
          <button
            key={r.service}
            className="lk-checkrow"
            data-on={on ? '1' : '0'}
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(r.service)}
          >
            <span className="lk-check">
              <ha-icon icon="mdi:check" />
            </span>
            <span className="lk-checkrow-ic">
              <ha-icon icon={r.icon} />
            </span>
            <span className="lk-checkrow-label">{r.label}</span>
            {r.service === liveTarget && <span className="lk-tag">Live</span>}
          </button>
        );
      })}
    </div>
  );
}

function PersonRow({
  person,
  rows,
  targets,
  servers,
  users,
  accounts,
  open,
  armed,
  onOpen,
  onDelete,
  onUpdate,
}: {
  person: Person;
  rows: Row[];
  targets: NotifyTarget[];
  servers: RestrictedServer[];
  users: Person[];
  accounts: HaAccount[] | null;
  open: boolean;
  armed: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Omit<Person, 'name'>>) => void;
}) {
  const hass = useHass();
  const [test, setTest] = useState<TestState>('idle');
  const linked = person.ha_user_id;
  const account = accounts?.find((a) => a.id === linked);
  // the worker sends this person's phone progress to their first phone in the saved order
  const live = person.notify_targets.find((s) => s.startsWith('mobile_app_'));
  const deviceNames = person.notify_targets.map((s) =>
    s === PERSISTENT ? 'Home Assistant' : (targets.find((t) => t.service === s)?.label ?? s),
  );
  const summary = [
    deviceNames.length ? deviceNames.join(', ') : 'No destinations selected',
    linked ? (account ? `@${account.name}` : 'linked') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const granted = person.servers ?? [];
  const toggleServer = (id: string) =>
    onUpdate({ servers: granted.includes(id) ? granted.filter((s) => s !== id) : [...granted, id] });

  const toggle = (service: string) =>
    onUpdate({
      notify_targets: person.notify_targets.includes(service)
        ? person.notify_targets.filter((s) => s !== service)
        : [...person.notify_targets, service],
    });

  const sendTest = async () => {
    if (!hass || person.notify_targets.length === 0 || test === 'sending') return;
    setTest('sending');
    try {
      await Promise.all(
        person.notify_targets.map((ch) =>
          ch === PERSISTENT
            ? hass.callService('persistent_notification', 'create', { title: 'Backend Butler', message: TEST_MESSAGE })
            : hass.callService('notify', ch, { title: 'Backend Butler', message: TEST_MESSAGE }),
        ),
      );
      setTest('sent');
    } catch {
      setTest('error');
    }
    setTimeout(() => setTest('idle'), 2800);
  };

  return (
    <div className="lk-person" data-open={open ? '1' : '0'}>
      <div className="lk-person-head">
        <button className="lk-person-main" onClick={onOpen} aria-expanded={open}>
          <span className="lk-person-av">{person.name.slice(0, 1).toUpperCase()}</span>
          <span className="lk-person-body">
            <span className="lk-person-name">{person.name}</span>
            <span className="lk-person-sum">{summary}</span>
          </span>
          <ha-icon className="lk-person-chev" icon="mdi:chevron-down" />
        </button>
        <button
          className="lk-iconbtn lk-taskrow-del"
          data-armed={armed ? '1' : '0'}
          onClick={onDelete}
          aria-label={armed ? `Confirm remove ${person.name}` : `Remove ${person.name}`}
        >
          <ha-icon icon={armed ? 'mdi:check' : 'mdi:trash-can-outline'} />
        </button>
      </div>

      {open && (
        <div className="lk-person-detail">
          {accounts ? (
            <label className="lk-field">
              <span className="lk-field-label">Home Assistant account</span>
              <select
                className="lk-in lk-person-sel"
                value={linked ?? ''}
                onChange={(e) => onUpdate({ ha_user_id: e.target.value || null })}
              >
                <option value="">Not linked</option>
                {linked && !account && <option value={linked}>Unknown account ({linked.slice(0, 8)})</option>}
                {accounts.map((a) => {
                  const owner = users.find((u) => u.ha_user_id === a.id && u.name !== person.name);
                  return (
                    <option key={a.id} value={a.id} disabled={!!owner}>
                      {owner ? `${a.name} (${owner.name})` : a.name}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : (
            linked && (
              <div className="lk-field">
                <span className="lk-field-label">Home Assistant account</span>
                <span className="lk-person-id">{linked}</span>
              </div>
            )
          )}

          <div className="lk-field">
            <span className="lk-field-label">Notification destinations</span>
            <Checklist
              rows={rows}
              selected={person.notify_targets}
              onToggle={toggle}
              label={`${person.name}'s notification channels`}
              liveTarget={live}
            />
            <p className="lk-set-hint lk-person-hint">
              Live progress (Live Activity) goes to the first selected phone{live ? ', marked Live' : ''}.
            </p>
            <button
              className="lk-testbtn"
              data-sent={test === 'sent' ? '1' : '0'}
              disabled={person.notify_targets.length === 0 || test === 'sending'}
              onClick={sendTest}
            >
              <ha-icon icon={test === 'sent' ? 'mdi:check' : 'mdi:send'} />
              {test === 'sending' ? 'Sending…' : test === 'sent' ? 'Test sent' : test === 'error' ? 'Retry test notification' : 'Send test notification'}
            </button>
            {test === 'error' && <p className="lk-set-err">Could not send the test notification. Check the selected destinations and try again.</p>}
          </div>

          {servers.length > 0 && (
            <div className="lk-field">
              <span className="lk-field-label">Allowed tools</span>
              <Checklist
                rows={servers.map((s) => ({ service: s.id, label: s.title, icon: 'mdi:console' }))}
                selected={granted}
                onToggle={toggleServer}
                label={`Tools ${person.name} may use`}
              />
              <p className="lk-set-hint lk-person-hint">
                Selected tools become available to this person in their next conversation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Settings tab: each family member's own devices and, optionally, the HA account that
 * identifies them on the card. Anyone not listed gets only the HA persistent notification.
 */
export function SettingsTab({voicePreferences}: {voicePreferences?: ReactNode} = {}) {
  const newPersonId = useId();
  const { available, users, servers, accounts, saving, loading, ready, reload, error, addUser, removeUser, updateUser } =
    useNotifySettings();
  const [openName, setOpenName] = useState<string | null>(null);
  // the one person whose remove is armed (two-tap confirm); any other interaction clears it
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const addingName = useRef<string | null>(null);
  useEffect(() => {
    if (saving || !addingName.current) return;
    const added = addingName.current;
    if (!error) setDraft((current) => current.trim() === added ? '' : current);
    addingName.current = null;
  }, [saving, error]);

  const rows: Row[] = [
    { service: PERSISTENT, label: 'Home Assistant', icon: 'mdi:bell-outline' },
    ...available.map((t) => ({ service: t.service, label: t.label, icon: 'mdi:cellphone' })),
  ];

  const add = () => {
    const err = addUser(draft);
    setAddError(err);
    setConfirmName(null);
    if (!err) {
      addingName.current = draft.trim();
      setOpenName(draft.trim());
    }
  };

  const onDelete = (name: string) => {
    if (confirmName !== name) {
      setConfirmName(name); // first tap: arm
      return;
    }
    setConfirmName(null); // second tap: confirm + remove
    if (openName === name) setOpenName(null);
    removeUser(name);
  };

  return (
    <div className="lk-settings">
      <div className="lk-settings-scroll">
        {voicePreferences}
        <AppearanceSettings />
        <section className="lk-set-sec" aria-busy={loading || saving}>
          {loading && <p role="status">Loading notification settings…</p>}
          {error && <p className="lk-set-err" role="alert">{error}</p>}
          {!ready && !loading && <button className="lk-btn" onClick={reload}>Retry loading settings</button>}
          <fieldset className="lk-settings-fields" disabled={!ready || loading || saving}>
            <legend className="lk-sr-only">People and notification settings</legend>
            <div className="lk-set-sechead">
              <h2 className="lk-set-title">People</h2>
              {saving && <span className="lk-set-saving" role="status">Saving…</span>}
            </div>
            <p className="lk-set-desc">
              Each person has their own memory and conversation. Use the name sent by their iPhone
              Shortcut, then link their Home Assistant account to identify them in Chat and Voice.
              Anyone not listed receives only Home Assistant notifications.
            </p>

            {users.length > 0 && (
              <div className="lk-people">
                {users.map((u) => (
                  <PersonRow
                    key={u.name}
                    person={u}
                    rows={rows}
                    servers={servers}
                    targets={available}
                    users={users}
                    accounts={accounts}
                    open={openName === u.name}
                    armed={confirmName === u.name}
                    onOpen={() => {
                      setConfirmName(null);
                      setOpenName(openName === u.name ? null : u.name);
                    }}
                    onDelete={() => onDelete(u.name)}
                    onUpdate={(patch) => {
                      setConfirmName(null);
                      updateUser(u.name, patch);
                    }}
                  />
                ))}
              </div>
            )}

            <label className="lk-person-add-label" htmlFor={newPersonId}>Person’s name</label>
            <form
              className="lk-person-add"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                className="lk-search-in"
                id={newPersonId}
                placeholder="e.g. Mia"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setAddError(null);
                }}
                aria-label="New person's name"
              />
              <button className="lk-testbtn lk-person-addbtn" type="submit" disabled={!draft.trim()}>
                <ha-icon icon="mdi:plus" />
                Add
              </button>
            </form>
            {addError && <p className="lk-set-err" role="alert">{addError}</p>}
          </fieldset>
        </section>
      </div>
    </div>
  );
}
