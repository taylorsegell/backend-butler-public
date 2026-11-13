import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../hass/context';

interface ServiceRequest {
  scope: string;
  domain: string;
  service: string;
  data: Record<string, unknown>;
  failureMessage: string;
}

/** A visible control owns its pending command and can retry a handled failure. */
export function useServiceAction(scope: string) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const owner = useRef(scope);
  const last = useRef<ServiceRequest | null>(null);
  owner.current = scope;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { last.current = null; setError(null); }, [scope]);

  useEffect(() => {
    if (!error) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const feedback = feedbackRef.current;
        const control = feedback?.parentElement;
        if (!feedback || !control) return;
        const ownerBounds = control.getBoundingClientRect();
        let top = 0, left = 0, right = window.innerWidth, bottom = window.innerHeight;
        // Intersect both scrollers: a tile can be vertically visible but offscreen
        // horizontally. Resizing must not pull a user back to that tile.
        for (const clipper of [feedback.closest('.lk-convo, .lk-tasklist'), feedback.closest('.lk-tiles')]) {
          if (!clipper) continue;
          const bounds = clipper.getBoundingClientRect();
          top = Math.max(top, bounds.top); left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right); bottom = Math.min(bottom, bounds.bottom);
        }
        if (ownerBounds.bottom <= top || ownerBounds.top >= bottom || ownerBounds.right <= left || ownerBounds.left >= right) return;
        feedback.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };
    const viewport = feedbackRef.current?.closest('.lk-convo, .lk-tasklist');
    // Run again after the conversation's own resize/scroll restoration settles.
    const observer = new ResizeObserver(reveal);
    if (viewport) observer.observe(viewport);
    reveal();
    window.addEventListener('resize', reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
    };
  }, [error]);

  const execute = useCallback(async (request: ServiceRequest): Promise<boolean> => {
    if (pending.current || request.scope !== owner.current) return false;
    pending.current = true;
    last.current = request;
    setBusy(true);
    setError(null);
    try {
      const hass = store.getSnapshot().hass;
      if (!hass) throw new Error('Home Assistant is unavailable');
      await hass.callService(request.domain, request.service, request.data);
      return true;
    } catch {
      if (mounted.current && request.scope === owner.current) {
        last.current = request;
        setError(request.failureMessage);
      }
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [store]);

  const run = useCallback((domain: string, service: string, data: Record<string, unknown>, failureMessage: string) =>
    execute({ scope, domain, service, data, failureMessage }), [scope, execute]);
  const retry = useCallback(() => last.current ? execute(last.current) : Promise.resolve(false), [execute]);
  return { busy, error, run, retry, feedbackRef };
}
