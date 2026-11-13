import { type ReactNode, useEffect, useRef } from 'react';
import { BUTLER_JACKET_PATHS, BUTLER_LOGO_VIEWBOX, BUTLER_TIE_PATH } from '../lib/logo';

export type VoiceFeedbackPhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'reconnecting' | 'error';

export interface VoiceFeedbackProps {
  phase: VoiceFeedbackPhase;
  label: string;
  detail: string;
  getInputLevel: () => number;
  getOutputLevel: () => number;
  onInterrupt?: () => void;
  interrupting?: boolean;
  onEnd?: () => void;
  onEnableAudio?: () => void;
  /** Dashboard-only identity; full-page feedback keeps its existing strip. */
  companionTitle?: string;
  controls?: ReactNode;
}

/** Active-session feedback. Reading levels never acquires a microphone or renders React frames. */
export function VoiceFeedback({ phase, label, detail, getInputLevel, getOutputLevel, onInterrupt, interrupting = false, onEnd, onEnableAudio, companionTitle, controls }: VoiceFeedbackProps) {
  const root = useRef<HTMLElement>(null);
  const levels = useRef({ getInputLevel, getOutputLevel });
  levels.current = { getInputLevel, getOutputLevel };

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let frame = 0;
    let smoothed = 0;
    let last = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      smoothed = 0;
      last = 0;
      element.style.setProperty('--lk-voice-level', '0');
    };
    const sample = (now: number) => {
      const getter = phase === 'listening' ? levels.current.getInputLevel : levels.current.getOutputLevel;
      const raw = getter();
      const target = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      const delta = last ? Math.min(100, now - last) : 16;
      last = now;
      // Quick attack and a slightly softer release keep transport-level updates legible.
      const time = target > smoothed ? 45 : 140;
      smoothed += (target - smoothed) * (1 - Math.exp(-delta / time));
      element.style.setProperty('--lk-voice-level', smoothed.toFixed(3));
      frame = requestAnimationFrame(sample);
    };
    const update = () => {
      reset();
      const moving = visible && !document.hidden && !reducedMotion.matches;
      element.dataset.motion = moving ? '1' : '0';
      if (moving && (phase === 'listening' || phase === 'speaking')) frame = requestAnimationFrame(sample);
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer?.observe(element);
    document.addEventListener('visibilitychange', update);
    reducedMotion.addEventListener('change', update);
    update();
    return () => {
      reset();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      reducedMotion.removeEventListener('change', update);
    };
  }, [phase]);

  return (
    <section ref={root} className={`lk-voice-feedback${companionTitle ? ' lk-companion' : ''}`} data-phase={phase} data-motion="0" aria-label="Voice session feedback">
      {companionTitle && <div className="lk-companion-identity"><h2 className="lk-companion-name" title={companionTitle}>{companionTitle}</h2>
        <p className="lk-voice-label" role="status" aria-live="polite" aria-atomic="true">{phase === 'idle' ? 'Ready when you are' : label}</p></div>}
      <div className="lk-voice-visual" aria-hidden="true">
        {companionTitle ? <svg className="lk-companion-mark" viewBox={BUTLER_LOGO_VIEWBOX} focusable="false">
          {/* Approved dark-surface brand mark: never inherit the UI accent or session status color. */}
          {BUTLER_JACKET_PATHS.map((d, i) => <path key={i} d={d} fill="#f2f2f3" />)}<path d={BUTLER_TIE_PATH} fill="#FC6B02" />
        </svg> : <svg viewBox="0 0 64 64" focusable="false">
          <circle className="lk-voice-ring lk-voice-ring-outer" cx="32" cy="32" r="27" />
          <circle className="lk-voice-ring lk-voice-ring-inner" cx="32" cy="32" r="20" />
          <circle className="lk-voice-connecting" cx="32" cy="32" r="27" />
          <circle className="lk-voice-core" cx="32" cy="32" r="12" />
          <path className="lk-voice-paused" d="M29 27v10m6-10v10" />
          <path className="lk-voice-error" d="M32 26v8m0 4h.01" />
        </svg>}
      </div>
      <div className="lk-voice-copy">
        {companionTitle ? phase === 'idle' && <p className="lk-companion-prompt">At your service.</p>
          : <p className="lk-voice-label" role="status" aria-live="polite" aria-atomic="true">{label}</p>}
        {detail && <p className="lk-voice-detail">{companionTitle && phase === 'idle' ? 'What can I help with?' : detail}</p>}
      </div>
      {(controls || onEnd || onEnableAudio || (phase === 'speaking' && onInterrupt)) && (
        <div className="lk-voice-actions">
          {controls}
          {onEnableAudio && <button type="button" className="lk-voice-interrupt" onClick={onEnableAudio}>Enable reply audio</button>}
          {phase === 'speaking' && onInterrupt && (
            <button type="button" className="lk-voice-interrupt" onClick={onInterrupt} disabled={interrupting} aria-busy={interrupting} title="Mute this reply. Home actions continue.">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
              <span>{interrupting ? 'Muting…' : 'Stop reply audio'}</span>
            </button>
          )}
          {onEnd && <button type="button" className="lk-voice-end lk-iconbtn" onClick={onEnd} aria-label="End voice session" title="End voice session">
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>}
        </div>
      )}
    </section>
  );
}
