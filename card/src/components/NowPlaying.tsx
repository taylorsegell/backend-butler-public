import { useEffect, useRef, useState } from 'react';
import { openMoreInfo, useCardConfig, useHass, useStore } from '../hass/context';
import { useServiceAction } from '../lib/service-action';
import type { Hass } from '../hass/store';

/** The music server's player, added by this integration when a music server is set up. */
function musicEntity(hass: Hass, configured?: string): string | null {
  if (configured) return hass.states[configured] ? configured : null;
  for (const [id, reg] of Object.entries(hass.entities ?? {})) {
    if (id.startsWith('media_player.') && reg?.platform === 'backend_butler') return id;
  }
  return null;
}

/** Seconds into the track now, from the position HA last reported and when. */
function livePosition(attrs: Record<string, any>, playing: boolean): number | null {
  const at = attrs.media_position;
  if (typeof at !== 'number') return null;
  if (!playing || !attrs.media_position_updated_at) return at;
  const since = (Date.now() - Date.parse(attrs.media_position_updated_at)) / 1000;
  return Math.min(at + Math.max(since, 0), attrs.media_duration ?? Infinity);
}

/**
 * What the music player is playing, with play/pause, previous/next, stop and volume. Shown
 * only while a track is playing or paused, so stopping it hides the bar; tapping the title
 * opens HA's more-info dialog.
 */
export function NowPlaying() {
  const hass = useHass();
  const config = useCardConfig();
  const host = useStore().host;
  const entityId = hass ? musicEntity(hass, config.music_entity) : null;
  const entity = entityId ? hass?.states[entityId] : undefined;
  const playing = entity?.state === 'playing';
  const action = useServiceAction(entityId ?? '');
  // the volume slider follows the player except while it is being dragged
  const [dragging, setDragging] = useState<number | null>(null);
  const [, tick] = useState(0);
  const pointer = useRef<number | null>(null);
  const cancelVolume = () => { pointer.current = null; setDragging(null); };
  useEffect(() => {
    window.addEventListener('blur', cancelVolume);
    return () => window.removeEventListener('blur', cancelVolume);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  if (!hass || !entityId || !entity || (entity.state !== 'playing' && entity.state !== 'paused'))
    return null;

  const attrs = entity.attributes;
  const call = (service: string, data: Record<string, any> = {}) =>
    action.run('media_player', service, { entity_id: entityId, ...data }, 'Could not control this player. Check its connection and try again.');
  const volume = Math.round((dragging ?? attrs.volume_level ?? 0) * 100);
  const position = livePosition(attrs, playing);
  const duration = attrs.media_duration;
  const progress = position !== null && duration ? Math.min(position / duration, 1) : null;
  const subtitle = [attrs.media_artist, attrs.source].filter(Boolean).join(' · ');

  return (
    <div className="lk-music" aria-busy={action.busy} data-playing={playing ? '1' : '0'}>
      <div className="lk-music-row">
        <span className="lk-music-icon">
          <ha-icon icon="mdi:music-note" />
        </span>
        <button className="lk-music-meta" onClick={() => openMoreInfo(host, entityId)}>
          <span className="lk-music-title">{attrs.media_title || 'Music'}</span>
          {subtitle && <span className="lk-music-sub">{subtitle}</span>}
        </button>
        <button className="lk-iconbtn" disabled={action.busy} aria-label="Previous" title="Previous" onClick={() => call('media_previous_track')}>
          <ha-icon icon="mdi:skip-previous" />
        </button>
        <button
          className="lk-iconbtn lk-music-play"
          disabled={action.busy}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          onClick={() => call(playing ? 'media_pause' : 'media_play')}
        >
          <ha-icon icon={playing ? 'mdi:pause' : 'mdi:play'} />
        </button>
        <button className="lk-iconbtn" disabled={action.busy} aria-label="Next" title="Next" onClick={() => call('media_next_track')}>
          <ha-icon icon="mdi:skip-next" />
        </button>
        <button className="lk-iconbtn" disabled={action.busy} aria-label="Stop" title="Stop" onClick={() => call('media_stop')}>
          <ha-icon icon="mdi:stop" />
        </button>
      </div>
      <div className="lk-music-row lk-music-vol">
        <ha-icon icon={volume === 0 ? 'mdi:volume-off' : 'mdi:volume-medium'} />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          aria-label="Volume"
          disabled={action.busy}
          style={{ '--lk-fill': `${volume}%` } as React.CSSProperties}
          onChange={(e) => setDragging(Number(e.currentTarget.value) / 100)}
          onPointerDown={(event) => {
            if (!event.isPrimary || pointer.current !== null) { event.preventDefault(); return; }
            pointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerCancel={cancelVolume}
          onLostPointerCapture={cancelVolume}
          onBlur={cancelVolume}
          onPointerUp={(e) => {
            if (pointer.current !== e.pointerId) return;
            pointer.current = null;
            call('volume_set', { volume_level: Number(e.currentTarget.value) / 100 });
            setDragging(null);
          }}
          onKeyUp={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return;
            call('volume_set', { volume_level: Number(e.currentTarget.value) / 100 });
            setDragging(null);
          }}
        />
        <span className="lk-music-num">{volume}</span>
      </div>
      {action.busy && <span className="lk-sr-only" role="status">Updating player…</span>}
      {action.error && <div ref={action.feedbackRef} className="lk-service-error" role="alert">
        <p>{action.error}</p>
        <button className="lk-btn" onClick={() => void action.retry()} disabled={action.busy}>Retry player action</button>
      </div>}
      {progress !== null && (
        <div className="lk-music-progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
