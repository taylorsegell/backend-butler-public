import { useEffect, useMemo, useRef } from 'react';
import { openMoreInfo, useCardConfig, useHass, useStore } from '../hass/context';
import type { Hass } from '../hass/store';
import { recentlyChanged, useActedOnEntities } from '../lib/acted-on';
import { buildTiles, formatState, friendlyName, iconFor, isActive, tapService } from '../lib/entities';
import { useExposedEntities } from '../lib/exposed';
import { useServiceAction } from '../lib/service-action';
import type { ToolCall } from '../lib/tool-feed';

/**
 * A horizontal rail of live, controllable device tiles from `hass.states`, filtered to
 * voice-exposed entities and ranked by relevance (acted-on devices pinned first). Tap
 * toggles a controllable device; long-press / right-click opens HA's more-info dialog.
 */
export function DeviceTiles({
  hidden = false,
  agentAreas,
  toolCalls,
  query,
  showRecent,
}: {
  /** Collapse the rail while keeping its acted-on tracking alive for when it is shown again. */
  hidden?: boolean;
  agentAreas: string[];
  toolCalls: ToolCall[];
  query: string;
  /** Pin devices changed within `recent_minutes`; off while no conversation is live. */
  showRecent: boolean;
}) {
  const hass = useHass();
  const config = useCardConfig();
  const host = useStore().host;
  const exposed = useExposedEntities(hass);
  const actedOn = useActedOnEntities(hass, exposed, toolCalls);
  const recentMinutes = showRecent ? (config.recent_minutes ?? 60) : 0;
  const recent = useMemo(
    () => (hass ? recentlyChanged(hass, exposed, recentMinutes) : []),
    [hass, exposed, recentMinutes]
  );

  const tiles = useMemo(
    () =>
      hass ? buildTiles(hass, config, { agentAreas, actedOn, exposed, query, recent }) : [],
    [hass, config, agentAreas, actedOn, exposed, query, recent]
  );

  // When the agent acts, the target is pinned to the front — scroll the rail back to the
  // start so the newly-pinned lead tile is actually in view (it's a horizontal scroller).
  const rail = useRef<HTMLDivElement>(null);
  const lead = tiles.find((t) => t.touched)?.entityId;
  useEffect(() => {
    if (lead) rail.current?.scrollTo({ left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [lead]);

  if (hidden || !hass || tiles.length === 0) return null;

  return (
    <section className="lk-devices" aria-label={`Devices, ${tiles.length} ${tiles.length === 1 ? 'control' : 'controls'}`}>
      <div className="lk-devices-head">
        <h2>Devices</h2>
        <span className="lk-devices-count" aria-hidden="true">{tiles.length}</span>
      </div>
      <div className="lk-tiles" ref={rail}>
        {tiles.map((t) => (
          <Tile key={t.entityId} entityId={t.entityId} touched={t.touched} hass={hass} host={host} />
        ))}
      </div>
    </section>
  );
}

function Tile({
  entityId,
  touched,
  hass,
  host,
}: {
  entityId: string;
  touched: boolean;
  hass: Hass;
  host: HTMLElement | null;
}) {
  const entity = hass.states[entityId];
  const action = useServiceAction(entityId);
  const longPressed = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { window.clearTimeout(timer.current); start.current = null; };
  useEffect(() => {
    window.addEventListener('blur', clear);
    return () => { clear(); window.removeEventListener('blur', clear); };
  }, []);
  if (!entity) return null;

  const active = isActive(entity);
  const moreInfo = () => openMoreInfo(host, entityId);

  const onClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const svc = tapService(entityId);
    if (svc) void action.run(svc.domain, svc.service, { entity_id: entityId }, 'Could not change this device. Check its connection and try again.');
    else moreInfo();
  };

  const onPointerDown = (event: React.PointerEvent) => {
    clear();
    longPressed.current = false;
    if (!event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY };
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      moreInfo();
    }, 500);
  };

  return (
    <div className="lk-tile-wrap" data-error={action.error ? '1' : '0'}>
      <button
        className="lk-tile"
        disabled={action.busy}
        aria-busy={action.busy}
        data-active={active ? '1' : '0'}
        data-touched={touched ? '1' : '0'}
        title={friendlyName(hass, entityId)}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) clear();
        }}
        onPointerCancel={clear}
        onLostPointerCapture={clear}
        onPointerUp={clear}
        onPointerLeave={clear}
        onContextMenu={(e) => {
          e.preventDefault();
          clear();
          if (!longPressed.current) moreInfo();
          longPressed.current = true;
        }}
      >
        <span className="lk-tile-icon">
          <ha-icon icon={iconFor(hass, entityId)} />
        </span>
        <span className="lk-tile-state">{formatState(entity)}</span>
        <span className="lk-tile-name">{friendlyName(hass, entityId)}</span>
      </button>
      {action.busy && <span className="lk-sr-only" role="status">Updating device…</span>}
      {action.error && <div ref={action.feedbackRef} className="lk-service-error" role="alert" aria-label={`Device action failed: ${friendlyName(hass, entityId)}`}>
        <p>{action.error}</p>
        <button className="lk-btn" onClick={() => void action.retry()} disabled={action.busy}>Retry device action</button>
      </div>}
    </div>
  );
}
