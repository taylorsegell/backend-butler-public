import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { useHass, useStore } from '../hass/context';
import { httpStatus } from './errors';
import { useRoomDataTopic } from './room-data';

export interface Approval {
  id: string;
  chat_id: string;
  title: string;
  summary: string;
  preview: { kind: 'yaml'; text: string } | { kind: 'diff'; lines: { op: string; text: string }[] };
  outline?: { label: string; items: string[] }[];
  expires_at: string;
  status: 'pending' | 'approved' | 'denied' | 'unavailable';
}

const PATH = 'backend_butler/chat/approvals';

/** Polling recovers missed callbacks and decisions made by voice or another card. */
export function useApprovals(room?: Room) {
  const store = useStore();
  const hass = useHass();
  const identity = hass?.user?.id;
  const [items, setItems] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const api = store.getSnapshot().hass;
    if (!api) return;
    const at = epoch.current;
    const request = ++requestId.current;
    try {
      const data = await api.callApi<{ items: Approval[] }>('GET', PATH);
      if (!mounted.current || at !== epoch.current || request !== requestId.current) return;
      setItems(data.items);
      setFresh(true);
      setError(null);
    } catch (e) {
      if (!mounted.current || at !== epoch.current || request !== requestId.current) return;
      setFresh(false);
      setError(httpStatus(e) === 403 ? 'Link your Home Assistant login to a person in Settings to review Butler requests.' : 'Could not refresh Butler requests. Try again.');
    }
  }, [store]);

  useEffect(() => {
    mounted.current = true;
    epoch.current++;
    setItems([]);
    setFresh(false);
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { mounted.current = false; epoch.current++; clearInterval(timer); };
  }, [refresh, identity]);
  const invalidate = useCallback(() => { void refresh(); }, [refresh]);
  useRoomDataTopic(room, 'ha.butler_approval', invalidate);

  const decide = useCallback(async (id: string, allow: boolean) => {
    if (inFlight.current || !fresh) return;
    inFlight.current = true;
    requestId.current++;
    setSending(id);
    const at = epoch.current;
    try {
      await store.getSnapshot().hass!.callApi('POST', PATH, { id, allow });
      if (mounted.current && at === epoch.current) {
        setItems((rows) => rows.map((row) => row.id === id ? { ...row, status: allow ? 'approved' : 'denied' } : row));
      }
    } catch (e) {
      if (mounted.current && at === epoch.current) {
        setFresh(false);
        setError(httpStatus(e) === 404 ? 'This request is no longer pending. Refresh to see its status.' : 'The decision could not be confirmed. Refresh before trying again.');
      }
      return;
    } finally {
      inFlight.current = false;
      if (mounted.current && at === epoch.current) setSending(null);
    }
    await refresh();
  }, [store, fresh, refresh]);

  return { items, error, fresh, sending, decide, refresh };
}
