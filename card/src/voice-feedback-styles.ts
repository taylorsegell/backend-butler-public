/** Compact voice stage; amplitude is updated on the element without React renders. */
export const VOICE_FEEDBACK_STYLES = `
  .lk-voice-feedback {
    --lk-voice-level: 0;
    display: flex; align-items: center; gap: 12px; flex: none; min-width: 0;
    width: 100%; max-width: 832px; align-self: center;
    padding: 8px 16px 0; color: var(--lk-fg);
  }
  .lk-voice-visual { flex: 0 0 64px; width: 64px; height: 64px; color: var(--lk-accent-ink); }
  .lk-voice-visual svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .lk-voice-ring { fill: none; stroke: currentColor; stroke-width: 1; transform-origin: 32px 32px; opacity: .18; }
  .lk-voice-ring-inner { opacity: .32; }
  .lk-voice-core { fill: currentColor; transform-origin: 32px 32px; transition: fill 160ms ease, opacity 160ms ease; }
  .lk-voice-copy { flex: 1 1 10rem; min-width: 0; }
  .lk-voice-label { margin: 0; font-size: .9375rem; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
  .lk-voice-detail { margin: 4px 0 0; font-size: .8125rem; line-height: 1.4; color: var(--lk-muted); overflow-wrap: anywhere; }
  .lk-voice-connecting { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 38 132;
    transform-origin: 32px 32px; display: none; }
  .lk-voice-paused, .lk-voice-error { display: none; fill: none; stroke: var(--lk-surface); stroke-width: 2.5; stroke-linecap: round; }
  .lk-voice-actions { display: flex; flex: none; align-items: center; gap: 4px; }
  .lk-voice-actions button { min-height: 44px; min-width: 44px; cursor: pointer; }
  .lk-voice-interrupt { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--lk-line);
    border-radius: 10px; padding: 8px 10px; background: var(--lk-surface); color: var(--lk-fg); font: inherit; font-size: .8125rem; line-height: 1.25; }
  .lk-voice-interrupt svg { width: 16px; height: 16px; flex: none; fill: currentColor; }
  .lk-voice-end svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; }
  .lk-voice-interrupt:hover { background: var(--lk-elevated); }
  .lk-voice-interrupt:disabled { opacity: .65; cursor: wait; }

  .lk-voice-feedback[data-phase="listening"] .lk-voice-ring-outer { transform: scale(calc(1 - var(--lk-voice-level) * .2)); opacity: calc(.18 + var(--lk-voice-level) * .5); }
  .lk-voice-feedback[data-phase="listening"] .lk-voice-ring-inner { transform: scale(calc(1 - var(--lk-voice-level) * .15)); opacity: calc(.32 + var(--lk-voice-level) * .4); }
  .lk-voice-feedback[data-phase="listening"] .lk-voice-core { transform: scale(calc(1 + var(--lk-voice-level) * .16)); }
  .lk-voice-feedback[data-phase="speaking"] .lk-voice-ring-outer { transform: scale(calc(.8 + var(--lk-voice-level) * .2)); opacity: calc(.18 + var(--lk-voice-level) * .5); }
  .lk-voice-feedback[data-phase="speaking"] .lk-voice-ring-inner { transform: scale(calc(.85 + var(--lk-voice-level) * .15)); opacity: calc(.32 + var(--lk-voice-level) * .4); }
  .lk-voice-feedback[data-phase="speaking"] .lk-voice-core { transform: scale(calc(.92 + var(--lk-voice-level) * .16)); }
  .lk-voice-feedback:is([data-phase="connecting"], [data-phase="reconnecting"]) .lk-voice-connecting { display: block; }
  .lk-voice-feedback:is([data-phase="connecting"], [data-phase="reconnecting"]) .lk-voice-core { opacity: .5; transform: scale(.65); }
  .lk-voice-feedback:is([data-phase="connecting"], [data-phase="reconnecting"])[data-motion="1"] .lk-voice-connecting { animation: lk-voice-connect 1.4s linear infinite; }
  .lk-voice-feedback[data-phase="thinking"] .lk-voice-core { transform: scale(.65); }
  .lk-voice-feedback[data-phase="thinking"] .lk-voice-ring { opacity: .24; }
  .lk-voice-feedback:is([data-phase="idle"], [data-phase="paused"]) .lk-voice-visual { color: var(--lk-muted); }
  .lk-voice-feedback[data-phase="paused"] .lk-voice-ring { opacity: .12; }
  .lk-voice-feedback[data-phase="paused"] .lk-voice-paused { display: block; }
  .lk-voice-feedback[data-phase="error"] .lk-voice-visual { color: var(--lk-danger-ink); }
  .lk-voice-feedback[data-phase="error"] .lk-voice-error { display: block; }
  .lk-voice-feedback[data-phase="error"] .lk-voice-ring { opacity: .12; }
  @keyframes lk-voice-connect { to { transform: rotate(360deg); } }

  /* House companion: the same live signals, given Butler's own identity. */
  .lk-companion { display: grid; grid-template-columns: minmax(0, 1fr) 56px; align-items: start;
    gap: 10px 16px; padding: 18px 18px 12px; }
  .lk-companion-identity { min-width: 0; align-self: center; }
  .lk-companion-name { margin: 0 0 5px; color: var(--lk-fg); font-size: .9375rem;
    font-weight: 700; line-height: 1.3; letter-spacing: -.02em; overflow-wrap: anywhere; }
  .lk-companion .lk-voice-label { display: flex; align-items: center; gap: 6px;
    color: var(--lk-muted); font-size: .75rem; font-weight: 500; }
  .lk-companion .lk-voice-label::before { content: ''; width: 6px; height: 6px; flex: none;
    border-radius: 50%; background: currentColor; }
  .lk-companion:not([data-phase="idle"]):not([data-phase="error"]):not([data-phase="paused"]) .lk-voice-label::before { background: var(--lk-accent-ink); }
  .lk-voice-feedback.lk-companion .lk-voice-visual { width: 56px; height: 56px; color: var(--lk-accent-ink); }
  .lk-companion:not([data-phase="idle"]) { padding-top: 14px; gap: 8px 16px; }
  .lk-companion:not([data-phase="idle"]) .lk-voice-visual { width: 44px; height: 44px; }
  .lk-companion .lk-companion-mark { transform-origin: 50% 65%; }
  .lk-companion[data-phase="listening"] .lk-companion-mark { transform: rotate(calc(var(--lk-voice-level) * -4deg)) scale(calc(1 + var(--lk-voice-level) * .05)); }
  .lk-companion[data-phase="speaking"] .lk-companion-mark { transform: scale(calc(1 + var(--lk-voice-level) * .08)); }
  .lk-companion[data-phase="thinking"] .lk-companion-mark { transform: rotate(-5deg); }
  .lk-companion:is([data-phase="connecting"], [data-phase="reconnecting"]) .lk-companion-mark { opacity: .6; }
  .lk-voice-feedback.lk-companion[data-phase="error"] .lk-voice-visual { color: var(--lk-danger-ink); }
  .lk-companion .lk-voice-copy { grid-column: 1 / -1; }
  .lk-companion-prompt { margin: 0; color: var(--lk-fg); font-size: 1.4375rem; font-weight: 650;
    line-height: 1.25; letter-spacing: -.025em; text-wrap: balance; }
  .lk-companion .lk-voice-detail { margin: 0; }
  .lk-companion[data-phase="idle"] .lk-voice-detail { margin-top: 7px; }
  .lk-companion .lk-voice-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
  .lk-companion .lk-voice-actions .lk-modeswitch { margin-inline-end: auto; }
  .lk-companion .lk-voice-interrupt { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
  .lk-companion .lk-voice-end { margin-inline-start: auto; }

  @container (max-width: 600px) {
    .lk-voice-feedback { gap: 8px; }
    .lk-voice-visual { flex-basis: 48px; width: 48px; height: 48px; }
  }
  @container (max-width: 420px) {
    .lk-voice-feedback { flex-wrap: wrap; }
    .lk-voice-copy { flex-basis: calc(100% - 56px); }
    .lk-voice-actions { margin-left: auto; }
  }
  @media (prefers-reduced-motion: reduce) {
    .lk-voice-visual * { animation: none !important; transition: none !important; }
    .lk-voice-feedback:is([data-phase="listening"], [data-phase="speaking"]) .lk-voice-ring,
    .lk-voice-feedback:is([data-phase="listening"], [data-phase="speaking"]) .lk-voice-core { transform: none; }
    .lk-companion .lk-companion-mark { transform: none !important; }
  }
`;
