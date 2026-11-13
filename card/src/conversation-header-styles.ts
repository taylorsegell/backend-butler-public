/** Conversation-first header: stable controls and a quiet identity, without tab navigation. */
export const CONVERSATION_HEADER_STYLES = `
  .lk-conversation-header { flex: none; display: flex; align-items: center; gap: 12px; min-width: 0;
    padding: 12px max(16px, calc((100% - 800px) / 2)); }
  .lk-conversation-identity { flex: 1 1 auto; display: flex; align-items: center; gap: 10px; min-width: 0; }
  .lk-conversation-dot { flex: none; display: block; width: 10px; height: 10px; border-radius: 50%; position: relative;
    color: var(--lk-muted); background: currentColor; transition: background-color 160ms ease, color 160ms ease; }
  .lk-conversation-dot::before { content: ""; position: absolute; inset: -7px; border-radius: 50%; opacity: 0;
    background: radial-gradient(circle, color-mix(in srgb, var(--lk-accent) 24%, transparent), transparent 70%); }
  .lk-conversation-dot[data-connected="1"] { color: var(--lk-accent); }
  .lk-conversation-dot[data-connected="1"]::before { opacity: .35; }
  .lk-conversation-dot[data-phase="error"] { color: var(--lk-danger-ink); }
  .lk-conversation-dot[data-phase="error"]::before { opacity: 0; }
  .lk-conversation-heading { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .lk-conversation-title { color: var(--lk-fg); font-size: 1rem; font-weight: 650; line-height: 1.35;
    overflow-wrap: anywhere; }
  .lk-conversation-status { color: var(--lk-muted); font-size: .75rem; line-height: 1.4; overflow-wrap: anywhere; }
  .lk-conversation-actions { display: flex; align-items: center; flex: none; gap: 4px; }
  .lk-conversation-action, .lk-conversation-upcoming { min-height: 44px; min-width: 44px; display: inline-flex;
    align-items: center; justify-content: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 10px;
    background: transparent; color: var(--lk-muted); cursor: pointer; font: inherit; font-size: .8125rem;
    line-height: 1.4; --mdc-icon-size: 19px; }
  .lk-conversation-action:hover, .lk-conversation-upcoming:hover { background: var(--lk-elevated); color: var(--lk-fg); }
  .lk-conversation-count { font-size: .75rem; font-variant-numeric: tabular-nums; min-width: 2ch; text-align: center; }
  .lk-conversation-upcoming-label { white-space: nowrap; }
  @container (max-width: 600px) {
    .lk-conversation-header { gap: 8px; }
    .lk-conversation-upcoming-label { display: none; }
    .lk-conversation-actions { gap: 0; }
    .lk-conversation-upcoming { padding-inline: 6px; gap: 4px; }
  }
  @media (prefers-reduced-motion: reduce) { .lk-conversation-dot { transition: none; } }
`;
