/** Top-layer settings/history/upcoming sheet; palette follows the hosting Butler card. */
export const CONVERSATION_DRAWER_STYLES = `
  .lk-conversation-drawer {
    position: fixed; inset-block: 0; inset-inline-start: auto; inset-inline-end: 0;
    width: min(460px, calc(100vw - 24px)); max-width: none;
    height: 100dvh; max-height: 100dvh; margin: 0; padding: 0;
    border: 0; border-inline-start: 1px solid var(--lk-line); border-radius: 0;
    background: var(--lk-surface); color: var(--lk-fg); font-family: var(--lk-sans);
    overflow: hidden;
  }
  .lk-conversation-drawer:not([open]) { display: none; }
  .lk-conversation-drawer::backdrop { background: rgb(0 0 0 / .4); }
  .lk-conversation-drawer-shell { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  .lk-conversation-drawer-head {
    flex: none; display: flex; align-items: center; gap: 12px;
    padding: max(12px, env(safe-area-inset-top)) 16px 12px;
    border-bottom: 1px solid var(--lk-line);
  }
  .lk-conversation-drawer-head h2 { flex: 1; min-width: 0; margin: 0; font-size: 1.125rem; line-height: 1.35; font-weight: 650; overflow-wrap: anywhere; }
  .lk-conversation-drawer-head button { flex: none; min-width: 44px; min-height: 44px; }
  .lk-conversation-drawer-head svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; }
  .lk-conversation-drawer-body {
    flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column;
    overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
    padding-bottom: env(safe-area-inset-bottom); scrollbar-width: thin;
  }
  .lk-conversation-drawer-body > * { min-width: 0; }
  @media (max-width: 600px) {
    .lk-conversation-drawer { width: calc(100vw - 12px); }
  }
`;
