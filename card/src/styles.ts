// Visual system. Derives from Home Assistant theme variables so it belongs in any theme,
// with a designed type pairing (Manrope + JetBrains Mono for device data) and one
// signature: the voice orb + a floating dock with a separate push-to-talk button.
import { FONT_CSS } from './font';
import { CONVERSATION_HEADER_STYLES } from './conversation-header-styles';
import { CONVERSATION_DRAWER_STYLES } from './conversation-drawer-styles';
import { VOICE_FEEDBACK_STYLES } from './voice-feedback-styles';

export const CARD_STYLES =
  FONT_CSS +
  `
  :host {
    --lk-accent: var(--primary-color, #4c8dff);
    --lk-on-accent: var(--text-primary-color, #fff);
    --lk-on-danger: var(--text-primary-color, #fff);
    --lk-accent-ink: var(--lk-accent);
    --lk-danger-ink: var(--lk-danger);
    --lk-focus: var(--lk-accent);
    --lk-fg: var(--primary-text-color, #e9eaee);
    --lk-muted: var(--secondary-text-color, #9aa1ac);
    --lk-surface: var(--card-background-color, var(--ha-card-background, #16181d));
    --lk-elevated: var(--secondary-background-color, rgba(140,140,150,0.10));
    --lk-line: var(--divider-color, rgba(140,140,150,0.20));
    --lk-danger: var(--error-color, #f0483e);
    --lk-ok: var(--success-color, #21b573);
    --lk-sans: "Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --lk-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --lk-h: 540px;
    display: block;
    container-type: inline-size;
  }
  :host([data-fullpage]) { height: var(--lk-available-h, 100dvh); min-height: 0; }
  .lk-panel { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
  .lk-panel[hidden] { display: none; }
  .lk-root { height: 100%; min-height: 0; }
  :host([data-fullpage]) ha-card { height: 100%; max-height: none; border: none; border-radius: 0; }
  * { box-sizing: border-box; }
  * { scrollbar-color: var(--lk-line) transparent; }
  ::selection { background: var(--lk-accent); color: var(--lk-on-accent); }
  input, textarea { caret-color: var(--lk-accent-ink); }
  :is(button, summary, a, input, textarea, select):focus-visible {
    outline: 2px solid var(--lk-focus); outline-offset: 3px;
  }
  .lk-input:focus-visible, .lk-in:focus-visible { outline: 2px solid var(--lk-focus); outline-offset: 3px; }
  time, .lk-approval-status, .lk-act-note { font-variant-numeric: tabular-nums; }
  button { font-family: inherit; color: inherit; min-inline-size: 44px; min-block-size: 44px; }
  summary { min-block-size: 44px; min-inline-size: 44px; }
  .lk-context { flex: none; min-width: 0; margin-bottom: 4px; }
  .lk-context:empty { display: none; }

  ha-card {
    position: relative;
    background: var(--lk-surface);
    /* Content-sized: shrinks to fit (idle = just header + tiles + composer, no dead space)
       and grows with the conversation up to the cap, then the timeline scrolls inside. */
    height: auto;
    max-height: min(var(--lk-h), calc(100dvh - 148px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--ha-card-border-radius, 12px);
    font-family: var(--lk-sans);
    color: var(--lk-fg);
    -webkit-font-smoothing: antialiased;
  }
  /* Schedules tab / editor: a definite height (not content-sized) so the list scrolls in a
     stable viewport and the editor sheet has room. */
  ha-card[data-tall="1"] {
    height: min(var(--lk-h), calc(100dvh - 148px));
  }

  ha-card[data-voice-card="1"] { height: var(--lk-h); max-height: none; }
  ha-card[data-voice-card="1"] .lk-convo { padding-inline: 18px; }
  ha-card[data-voice-card="1"] .lk-dock { padding: 0 18px 14px; background: transparent; }
  ha-card[data-voice-card="1"] .lk-dock > :first-child { border-top: 1px solid var(--lk-line); padding-top: 10px; }
  ha-card[data-voice-card="1"] .lk-bar { border: 0; border-radius: 0; box-shadow: none; background: transparent; }
  ha-card[data-voice-card="1"] .lk-starters { display: none; }
  ha-card[data-voice-idle="1"] { height: auto; }
  ha-card[data-voice-idle="1"] .lk-convo { flex: none; padding-block: 0; max-height: 320px; }

  /* ---- header ---- */
  .lk-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 14px 4px; flex: none; }
  .lk-titlewrap { flex: 1 1 10rem; min-width: 0; min-height: 50px; display: flex; flex-direction: column; justify-content: center; gap: 1px; }
  .lk-title { min-width: 0; font-size: 1.04rem; font-weight: 700; line-height: 1.15; letter-spacing: -0.02em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* live agent phase under the title: connecting / connected / listening / thinking / speaking */
  .lk-state { font-family: var(--lk-mono); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--lk-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: color .2s; }
  .lk-state[data-state="listening"], .lk-state[data-state="speaking"], .lk-state[data-state="thinking"] { color: var(--lk-accent-ink); }

  /* Auto | Manual segmented toggle (shown when connected, in place of the status pill) */
  .lk-modeswitch { flex: none; display: inline-flex; gap: 0; }
  .lk-modeswitch button { display: flex; align-items: center; border: 0; cursor: pointer; background: transparent;
    color: var(--lk-muted); font-family: var(--lk-sans); font-size: .75rem; font-weight: 500; line-height: 1.2;
    padding: 0; border-radius: 8px; min-height: 44px; }
  .lk-modeswitch button span { display: block; width: 100%; padding: 6px 10px; border: 1px solid var(--lk-line);
    background: var(--lk-surface); transition: background-color .15s, color .15s; }
  .lk-modeswitch button:first-child span { border-radius: 8px 0 0 8px; }
  .lk-modeswitch button:last-child span { border-radius: 0 8px 8px 0; border-inline-start: 0; }
  .lk-modeswitch button[data-on="1"] { color: var(--lk-accent-ink); font-weight: 650; }
  .lk-modeswitch button[data-on="1"] span { background: color-mix(in srgb, var(--lk-accent) 12%, var(--lk-surface)); }
  .lk-modeswitch button:not([data-on="1"]):hover { color: var(--lk-fg); }
  .lk-modeswitch button:not([data-on="1"]):hover span { background: var(--lk-elevated); }

  .lk-iconbtn {
    flex: none; width: 44px; height: 44px; border-radius: 10px; border: none; cursor: pointer;
    background: transparent; color: var(--lk-muted); display: grid; place-items: center; --mdc-icon-size: 19px;
  }
  .lk-iconbtn:hover { background: var(--lk-elevated); color: var(--lk-fg); }
  .lk-iconbtn[data-on="1"] { color: var(--lk-accent-ink); }

  /* ---- voice orb ---- */
  .lk-orb { position: relative; width: 26px; height: 26px; flex: none; display: grid; place-items: center; }
  .lk-orb::before { content: ""; position: absolute; inset: -4px; border-radius: 50%; opacity: 0;
    background: radial-gradient(circle, color-mix(in srgb, var(--lk-accent) 48%, transparent), transparent 68%); }
  .lk-orb-core { width: 13px; height: 13px; border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--lk-accent) 55%, #fff), var(--lk-accent));
    box-shadow: none; }
  .lk-orb[data-state="idle"] .lk-orb-core { background: var(--lk-muted); box-shadow: none; }
  /* dozing: connected but STT torn down to save cost — alive (slow, faint breathe) but not listening */
  .lk-orb[data-state="dozing"] .lk-orb-core { background: var(--lk-muted); box-shadow: none; opacity: .55;
    animation: lk-breathe 3.6s ease-in-out infinite; }
  /* Connected and quiet remains visibly alive without suggesting microphone capture. */
  .lk-orb[data-connected="1"]:is([data-state="idle"], [data-state="dozing"]) .lk-orb-core {
    background: var(--lk-accent); opacity: 1; animation: none;
  }
  .lk-orb[data-connected="1"]:is([data-state="idle"], [data-state="dozing"])::before { opacity: .2; }
  .lk-orb[data-state="connecting"] .lk-orb-core { animation: lk-breathe 1.1s ease-in-out infinite; }
  .lk-orb[data-state="listening"] .lk-orb-core { animation: lk-breathe 2.4s ease-in-out infinite; }
  .lk-orb[data-state="listening"]::before { opacity: .7; animation: lk-halo 2.4s ease-in-out infinite; }
  .lk-orb[data-state="thinking"] .lk-orb-core { animation: lk-breathe .8s ease-in-out infinite; }
  .lk-orb[data-state="thinking"]::before { opacity: .5; animation: lk-halo .8s ease-in-out infinite; }
  .lk-orb[data-state="speaking"] .lk-orb-core { animation: lk-speak .5s ease-in-out infinite; }
  .lk-orb[data-state="speaking"]::before { opacity: .9; }
  @keyframes lk-breathe { 0%,100% { transform: scale(.82); } 50% { transform: scale(1.18); } }
  @keyframes lk-speak { 0%,100% { transform: scale(.78); } 50% { transform: scale(1.3); } }
  @keyframes lk-halo { 0%,100% { transform: scale(.9); opacity: .35; } 50% { transform: scale(1.3); opacity: .8; } }

  /* ---- device tiles (horizontal rail) ---- */
  .lk-devices { flex: none; }
  .lk-devices-head { display: flex; align-items: center; gap: 8px; padding: 4px 0 0; }
  .lk-devices-head h2 { margin: 0; font-size: .875rem; font-weight: 650; line-height: 1.4; color: var(--lk-fg); }
  .lk-devices-count { font-size: .75rem; line-height: 1.4; color: var(--lk-muted); font-variant-numeric: tabular-nums; }
  /* ---- now playing ---- */
  .lk-music { flex: none; position: relative; margin: 2px 14px 8px; padding: 8px 8px 6px 10px;
    border-radius: 13px; overflow: hidden; border: 1px solid var(--lk-line);
    background: var(--lk-surface); display: flex; flex-direction: column; gap: 2px; }
  .lk-music[data-playing="1"] { border-color: transparent;
    background: color-mix(in srgb, var(--lk-accent) 10%, var(--lk-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lk-accent) 32%, transparent); }
  .lk-music-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
  .lk-music-icon { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid;
    place-items: center; --mdc-icon-size: 19px; background: var(--lk-elevated); color: var(--lk-muted); }
  .lk-music[data-playing="1"] .lk-music-icon { color: var(--lk-accent-ink);
    background: color-mix(in srgb, var(--lk-accent) 16%, transparent); }
  .lk-music-meta { flex: 1 1 10rem; min-width: 0; display: flex; flex-direction: column; gap: 1px;
    padding: 0 6px; border: none; background: none; text-align: left; cursor: pointer; }
  .lk-music-title { font-size: 14px; font-weight: 650; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }
  .lk-music-sub { font-size: 12px; color: var(--lk-muted); white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }
  .lk-music-play { color: var(--lk-fg); --mdc-icon-size: 23px; }
  .lk-music-vol { gap: 8px; padding: 0 2px 2px 8px; color: var(--lk-muted); --mdc-icon-size: 16px; }
  .lk-music-vol input { flex: 1; min-width: 0; height: 44px; margin: 0; appearance: none;
    -webkit-appearance: none; cursor: pointer; background: transparent; touch-action: pan-y; }
  .lk-music-vol input::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(
    to right, var(--lk-accent) var(--lk-fill), color-mix(in srgb, var(--lk-fg) 16%, transparent) var(--lk-fill)); }
  .lk-music-vol input::-moz-range-track { height: 4px; border-radius: 2px; background: linear-gradient(
    to right, var(--lk-accent) var(--lk-fill), color-mix(in srgb, var(--lk-fg) 16%, transparent) var(--lk-fill)); }
  .lk-music-vol input::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px;
    margin-top: -8px; border-radius: 50%; background: var(--lk-fg); border: none; }
  .lk-music-vol input::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%;
    background: var(--lk-fg); border: none; }
  .lk-music-num { flex: none; width: 26px; text-align: right; font: 500 11px var(--lk-mono); }
  .lk-music-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
    background: color-mix(in srgb, var(--lk-fg) 8%, transparent); }
  .lk-music-progress span { display: block; height: 100%; background: var(--lk-accent); }

  .lk-tiles { flex: none; display: flex; gap: 8px; overflow-x: auto; padding: 6px 0 12px;
    scroll-snap-type: x proximity; scrollbar-width: none; }
  .lk-tiles::-webkit-scrollbar { display: none; }
  .lk-tile-wrap { flex: 0 0 104px; min-width: 0; scroll-snap-align: start; }
  .lk-tile-wrap[data-error="1"] { flex-basis: min(260px, 100%); }
  .lk-tile {
    width: 100%;
    text-align: left; cursor: pointer; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 6px; min-height: 84px;
    padding: 8px; border-radius: 13px; overflow: hidden;
    border: 1px solid var(--lk-line); background: var(--lk-surface); color: var(--lk-fg);
    transition: border-color .18s, background-color .18s, box-shadow .18s, transform .06s;
  }
  .lk-tile-name { grid-column: 1 / -1; }
  .lk-tile:disabled { cursor: wait; opacity: .6; }
  .lk-service-error { color: var(--lk-danger-ink); font-size: .875rem; overflow-wrap: anywhere; }
  .lk-service-error p { margin: 8px 0; }
  .lk-service-error .lk-btn { margin-block: 0 8px; }
  .lk-tile:hover { border-color: color-mix(in srgb, var(--lk-fg) 26%, var(--lk-line)); }
  .lk-tile:active { transform: scale(.97); }
  .lk-tile[data-active="1"] { border-color: transparent;
    background: color-mix(in srgb, var(--lk-accent) 14%, var(--lk-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lk-accent) 40%, transparent); }
  .lk-tile[data-touched="1"] { border-color: transparent;
    background: color-mix(in srgb, var(--lk-accent) 14%, var(--lk-surface));
    box-shadow: inset 0 0 0 2px var(--lk-accent); }
  .lk-tile-icon { --mdc-icon-size: 16px; width: 27px; height: 27px; border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--lk-elevated); color: var(--lk-muted); transition: background-color .18s, color .18s; }
  .lk-tile[data-active="1"] .lk-tile-icon { background: var(--lk-accent); color: var(--lk-on-accent); }
  .lk-tile-state { font-family: var(--lk-mono); font-size: 0.9rem; font-weight: 600; line-height: 1.05;
    letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-tile-name { font-size: 0.72rem; line-height: 1.2; color: var(--lk-muted);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lk-more { align-self: center; cursor: pointer; --mdc-icon-size: 16px; display: inline-flex; align-items: center; gap: 3px;
    background: transparent; border: none; padding: 3px 10px; border-radius: 999px; color: var(--lk-muted); font-size: 0.8rem; font-weight: 600; }
  .lk-more:hover { color: var(--lk-fg); background: var(--lk-elevated); }

  /* ---- scheduled tasks (vertical list, above the conversation) ---- */
  .lk-sched { flex: none; display: flex; flex-direction: column; gap: 6px; padding: 10px 14px 8px; }
  .lk-sched-head { display: inline-flex; align-items: center; gap: 6px; --mdc-icon-size: 14px;
    font-family: var(--lk-mono); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.11em;
    text-transform: uppercase; color: var(--lk-muted); }
  .lk-sched-item { display: flex; align-items: center; gap: 10px; padding: 8px 11px; border-radius: 12px;
    border: 1px solid var(--lk-line); background: var(--lk-surface); animation: lk-rise .22s ease both; }
  .lk-sched-item[data-fresh="1"] { border-color: transparent;
    background: color-mix(in srgb, var(--lk-accent) 12%, var(--lk-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lk-accent) 42%, transparent); }
  .lk-sched-icon { flex: none; --mdc-icon-size: 16px; width: 30px; height: 30px; border-radius: 9px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--lk-elevated); color: var(--lk-muted); }
  .lk-sched-item[data-fresh="1"] .lk-sched-icon { background: var(--lk-accent); color: var(--lk-on-accent); }
  .lk-sched-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .lk-sched-desc { font-size: 0.9rem; font-weight: 600; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-sched-when { font-family: var(--lk-mono); font-size: 0.72rem; color: var(--lk-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-sched-badge { flex: none; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.02em;
    text-transform: uppercase; padding: 3px 8px; border-radius: 999px;
    color: var(--lk-accent-ink); background: color-mix(in srgb, var(--lk-accent) 14%, transparent); }
  .lk-sched-more { align-self: flex-start; cursor: pointer; border: none; background: transparent; color: var(--lk-muted);
    font-family: var(--lk-sans); font-size: 0.76rem; font-weight: 600; padding: 4px 8px; border-radius: 8px; }
  .lk-sched-more:hover { color: var(--lk-fg); background: var(--lk-elevated); }

  /* ---- tabs (Chat | Voice | Schedules | Settings) ---- */
  .lk-tabs { flex: none; display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 14px 0; border-bottom: 1px solid var(--lk-line); }
  .lk-tab { flex: 0 0 auto; border: none; background: transparent; cursor: pointer; color: var(--lk-muted);
    font-family: var(--lk-sans); font-size: 0.82rem; font-weight: 700; padding: 8px 8px 9px;
    border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s; }
  .lk-tab[data-on="1"] { color: var(--lk-fg); border-bottom-color: var(--lk-accent-ink); }
  .lk-tab:not([data-on="1"]):hover { color: var(--lk-fg); }

  /* ---- schedules tab (search + full list) ---- */
  .lk-schedtab { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .lk-texthead { flex: 1; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--lk-muted); }
  .lk-textstatus, .lk-usage { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lk-textstatus { flex: none; max-width: 60%; }
  .lk-textstatus:empty { display: none; }
  .lk-texthead > .lk-usage { font-size: .72rem; }
  .lk-usage-details { min-width: 0; }
  .lk-usage-details summary { cursor: pointer; padding-block: 4px; }
  .lk-usage-details .lk-usage { display: block; white-space: normal; overflow-wrap: anywhere; }
  .lk-usage { font-variant-numeric: tabular-nums; }
  .lk-search { flex: none; display: flex; align-items: center; gap: 4px; padding: 0 16px;
    --mdc-icon-size: 18px; color: var(--lk-muted); }
  .lk-schedtab > .lk-search { padding-block: 16px 12px; gap: 8px; }
  .lk-search-in { flex: 1; min-width: 0; min-height: 44px; height: auto; border: 1px solid var(--lk-line); background: var(--lk-surface);
    border-radius: 10px; padding: 0 12px; color: var(--lk-fg); font: inherit; font-size: 0.9rem; }
  .lk-search-in:focus { border-color: var(--lk-focus); }
  .lk-search-in::placeholder { color: var(--lk-muted); }
  .lk-tasklist { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column;
    gap: 12px; padding: 4px 16px 24px; scrollbar-width: thin; }
  .lk-tasks-empty { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: var(--lk-muted); font-size: 0.85rem; text-align: center; max-width: 250px; --mdc-icon-size: 22px; padding: 26px 0; }
  .lk-taskrow { display: flex; flex-wrap: wrap; align-items: center;
    border-radius: 12px; border: 1px solid var(--lk-line); background: var(--lk-surface); color: var(--lk-fg);
    animation: lk-rise .2s ease both; transition: border-color .15s, background-color .15s; }
  .lk-taskrow:hover { border-color: color-mix(in srgb, var(--lk-fg) 22%, var(--lk-line)); }
  .lk-taskrow[data-fresh="1"] { border-color: transparent; background: color-mix(in srgb, var(--lk-accent) 12%, var(--lk-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lk-accent) 42%, transparent); }
  .lk-taskrow[data-status="cancelled"], .lk-taskrow[data-status="completed"], .lk-taskrow[data-status="missed"] { opacity: .62; }
  /* clickable body (opens the editor); the action buttons live outside it so they aren't nested in a button */
  .lk-taskrow-main { flex: 1 1 15rem; min-width: 0; display: flex; align-items: center; gap: 10px; text-align: left;
    cursor: pointer; border: none; background: transparent; color: inherit; padding: 9px 4px 9px 11px; }
  .lk-taskrow-main:last-child { padding-right: 12px; }
  .lk-taskrow-acts { margin-inline-start: auto; flex: none; display: flex; align-items: center; gap: 2px; padding: 0 6px 0 2px; }
  .lk-taskrow-acts .lk-iconbtn { width: 44px; height: 44px; --mdc-icon-size: 17px; }
  .lk-taskrow-del:hover { color: var(--lk-danger-ink); background: color-mix(in srgb, var(--lk-danger) 14%, transparent); }
  .lk-taskrow-del[data-armed="1"], .lk-taskrow-del[data-armed="1"]:hover { color: var(--lk-on-danger); background: var(--lk-danger); }
  .lk-taskrow-icon { flex: none; --mdc-icon-size: 16px; width: 30px; height: 30px; border-radius: 9px;
    display: inline-flex; align-items: center; justify-content: center; background: var(--lk-elevated); color: var(--lk-muted); }
  .lk-taskrow[data-status="scheduled"] .lk-taskrow-icon { color: var(--lk-accent-ink); }
  .lk-taskrow-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .lk-taskrow-desc { font-size: 0.9rem; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-taskrow-when { font-family: var(--lk-mono); font-size: 0.7rem; color: var(--lk-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-taskrow-exec { font-size: 0.75rem; color: var(--lk-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-taskrow-tags { flex: none; display: flex; align-items: center; gap: 5px; --mdc-icon-size: 13px; }
  .lk-tag { display: inline-flex; align-items: center; gap: 3px; font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.03em; padding: 3px 7px; border-radius: 999px; color: var(--lk-accent-ink);
    background: color-mix(in srgb, var(--lk-accent) 14%, transparent); }
  .lk-tag-muted { color: var(--lk-muted); background: var(--lk-elevated); }

  /* ---- settings tab (channel checkbox list) ---- */
  .lk-settings-fields { border: 0; margin: 0; padding: 0; min-width: 0; }
  .lk-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  .lk-action-error { margin: 8px 14px; overflow-wrap: anywhere; }
  .lk-person-name, .lk-person-sum, .lk-checkrow-label { overflow-wrap: anywhere; }
  .lk-settings { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .lk-settings-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 24px max(16px, calc((100% - 800px) / 2)); scrollbar-width: thin; }
  .lk-set-sec { display: flex; flex-direction: column; }
  .lk-appearance { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--lk-line); }
  .lk-appearance-mode { border: 0; padding: 0; margin: 12px 0; display: flex; flex-wrap: wrap; gap: 8px 24px; min-width: 0; }
  .lk-appearance-mode legend { padding: 0; margin-bottom: 8px; }
  .lk-appearance-option { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; }
  .lk-appearance-option input { width: 20px; height: 20px; flex: none; accent-color: var(--lk-accent); }
  .lk-appearance-editor { display: grid; grid-template-columns: minmax(64px,80px) minmax(0,1fr); gap: 12px; max-width: 440px; min-width: 0; }
  .lk-appearance-picker input { width: 100%; height: 44px; border: 1px solid var(--lk-line); border-radius: 8px; padding: 4px; background: var(--lk-surface); cursor: pointer; }
  .lk-appearance-hex { min-width: 0; }
  .lk-appearance-hint, .lk-appearance-reset, .lk-appearance-editor > .lk-set-err { grid-column: 1 / -1; }
  .lk-appearance-reset { justify-self: start; }
  .lk-appearance-status { font-size: .875rem; line-height: 1.4; color: var(--lk-muted); min-height: 1.4em; }
  @container (max-width: 400px) {
    .lk-appearance-editor { grid-template-columns: minmax(0,1fr); }
    .lk-appearance-picker input { width: 80px; }
  }
  .lk-set-sechead { display: flex; align-items: center; gap: 8px; }
  .lk-set-title { margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--lk-fg); }
  .lk-set-saving { margin-left: auto; font-family: var(--lk-mono); font-size: 0.6rem; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--lk-muted); }
  .lk-set-desc { max-inline-size: 75ch; margin: 8px 0 16px; font-size: .875rem; color: var(--lk-muted); line-height: 1.5; }
  .lk-checklist { display: flex; flex-direction: column; gap: 5px; }
  .lk-checkrow { display: flex; align-items: center; gap: 10px; cursor: pointer; text-align: left;
    padding: 7px 11px; border-radius: 10px; border: 1px solid var(--lk-line); background: var(--lk-surface);
    color: var(--lk-fg); transition: border-color .15s, background-color .15s; }
  .lk-checkrow:hover { border-color: color-mix(in srgb, var(--lk-fg) 22%, var(--lk-line)); }
  .lk-checkrow[data-on="1"] { border-color: color-mix(in srgb, var(--lk-accent) 42%, transparent);
    background: color-mix(in srgb, var(--lk-accent) 10%, var(--lk-surface)); }
  .lk-check { flex: none; width: 19px; height: 19px; border-radius: 6px; display: grid; place-items: center;
    border: 1.5px solid var(--lk-line); color: var(--lk-on-accent); --mdc-icon-size: 13px;
    transition: background-color .15s, border-color .15s; }
  .lk-checkrow[data-on="1"] .lk-check { background: var(--lk-accent); border-color: var(--lk-accent-ink); }
  .lk-checkrow[data-on="0"] .lk-check ha-icon { opacity: 0; }
  .lk-checkrow-ic { flex: none; color: var(--lk-muted); --mdc-icon-size: 17px; display: grid; place-items: center; }
  .lk-checkrow-label { flex: 1; min-width: 0; font-size: 0.85rem; font-weight: 600; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-testbtn { margin-top: 12px; align-self: flex-start; display: inline-flex; align-items: center; gap: 7px;
    cursor: pointer; font-family: var(--lk-sans); font-size: 0.8rem; font-weight: 700; padding: 8px 14px;
    border-radius: 10px; border: 1px solid var(--lk-line); background: var(--lk-surface); color: var(--lk-fg);
    --mdc-icon-size: 16px; transition: border-color .15s, background-color .15s, color .15s; }
  .lk-testbtn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--lk-accent) 52%, var(--lk-line)); color: var(--lk-accent-ink); }
  .lk-testbtn:disabled { opacity: .5; cursor: default; }
  .lk-testbtn[data-sent="1"] { color: var(--lk-ok); border-color: color-mix(in srgb, var(--lk-ok) 42%, transparent); }
  .lk-set-hint { margin: 9px 2px 0; font-size: 0.72rem; color: var(--lk-muted); line-height: 1.4; }
  .lk-set-err { margin: 9px 2px 0; font-size: 0.72rem; color: var(--lk-danger-ink); }
  .lk-checkrow .lk-tag { flex: none; }
  .lk-people { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
  .lk-person { border-radius: 12px; border: 1px solid var(--lk-line); background: var(--lk-surface);
    transition: border-color .15s; }
  .lk-person[data-open="1"] { border-color: color-mix(in srgb, var(--lk-fg) 22%, var(--lk-line)); }
  .lk-person-head { display: flex; align-items: center; padding-right: 6px; }
  .lk-person-head .lk-iconbtn { width: 44px; height: 44px; --mdc-icon-size: 17px; }
  .lk-person-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer;
    border: none; background: transparent; color: var(--lk-fg); padding: 8px 4px 8px 10px; font: inherit; }
  .lk-person-av { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
    font-size: 0.8rem; font-weight: 700; color: var(--lk-accent-ink); background: color-mix(in srgb, var(--lk-accent) 14%, transparent); }
  .lk-person-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .lk-person-name { font-size: 0.88rem; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-person-sum { font-size: 0.72rem; color: var(--lk-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-person-chev { flex: none; color: var(--lk-muted); --mdc-icon-size: 18px; transition: transform .15s; }
  .lk-person[data-open="1"] .lk-person-chev { transform: rotate(180deg); }
  .lk-person-detail { display: flex; flex-direction: column; gap: 11px; padding: 4px 10px 11px; }
  .lk-person-sel { padding: 7px 10px; font-size: 0.85rem; }
  .lk-person-id { font-family: var(--lk-mono); font-size: 0.72rem; color: var(--lk-muted); overflow-wrap: anywhere; }
  .lk-person-hint { margin-top: 2px; }
  .lk-person-detail .lk-testbtn { margin-top: 10px; }
  .lk-person-add-label { display: block; margin-block: 16px 8px; font-size: .85rem; }
  .lk-tasks-empty h2 { margin: 0; font-size: 1.125rem; font-weight: 650; line-height: 1.3; color: var(--lk-fg); }
  .lk-tasks-empty p { max-width: 42ch; margin: 0; text-align: center; overflow-wrap: anywhere; }
  .lk-person-add { display: flex; align-items: center; gap: 8px; }
  .lk-person-add .lk-search-in { height: 34px; }
  .lk-person-addbtn { margin-top: 0; height: 34px; padding: 0 12px; }

  /* ---- task editor (slide-up sheet) ---- */
  .lk-editor { position: fixed; inset: auto 0 0; margin: 0 auto; padding: 0; border: 0;
    width: min(680px, 100%); max-width: 100%; max-height: 100dvh; color: var(--lk-fg);
    background: transparent; overflow: hidden; font-family: var(--lk-sans); }
  .lk-editor[open] { display: flex; }
  .lk-editor::backdrop { background: color-mix(in srgb, #000 46%, transparent); }
  @keyframes lk-fade { from { opacity: 0; } to { opacity: 1; } }
  .lk-editor-panel { width: 100%; max-height: 100dvh; display: flex; flex-direction: column; background: var(--lk-surface);
    border-top-left-radius: var(--ha-card-border-radius, 12px); border-top-right-radius: var(--ha-card-border-radius, 12px);
    border-top: 1px solid var(--lk-line);
    box-shadow: 0 -14px 40px -18px #000; animation: lk-rise .2s ease both; }
  .lk-editor-head { flex: none; display: flex; align-items: center; justify-content: space-between;
    padding: 11px 8px 8px 16px; font-weight: 700; font-size: 0.98rem; }
  /* overflow-x: hidden is required — with overflow-y:auto, overflow-x would otherwise compute
     to 'auto', and iOS's datetime-local input (intrinsically wide) then scrolls it sideways. */
  .lk-editor-fields { border: 0; padding: 0; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 13px; }
  .lk-editor-head h2 { margin: 0; font: inherit; }
  .lk-editor-body { margin: 0; border: 0; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 16px 8px;
    display: flex; flex-direction: column; gap: 13px; scrollbar-width: thin; }
  .lk-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .lk-field-label { font-family: var(--lk-sans); font-size: 0.875rem; font-weight: 600; letter-spacing: 0;
    text-transform: none; color: var(--lk-muted); }
  /* min-width:0 lets the input shrink to the container (flex items default to min-width:auto =
     content width, which iOS date/time inputs report far wider than the panel). */
  .lk-in { width: 100%; min-width: 0; max-width: 100%; border: 1px solid var(--lk-line);
    background: var(--lk-elevated); color: var(--lk-fg);
    border-radius: 10px; padding: 9px 11px; font: inherit; font-size: 0.9rem; }
  /* iOS gives datetime-local a wide native control that ignores width:100% (its right edge then
     spills out of the panel). Dropping the native appearance makes it a normal box that fits;
     tapping still opens the iOS date/time picker. */
  input.lk-in[type="datetime-local"] { -webkit-appearance: none; appearance: none;
    text-align: left; min-height: 38px; }
  .lk-in:focus { border-color: var(--lk-focus); }
  .lk-ta { resize: vertical; min-height: 38px; line-height: 1.35; }
  .lk-mono { font-family: var(--lk-mono); font-size: 0.82rem; }
  .lk-hint.lk-timezone-hint { font-family: var(--lk-sans); font-size: .875rem; line-height: 1.4; overflow-wrap: anywhere; }
  .lk-hint { font-family: var(--lk-mono); font-size: 0.64rem; color: var(--lk-muted); }
  .lk-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; border: 1px solid var(--lk-line);
    background: var(--lk-elevated); align-self: flex-start; }
  .lk-seg button { border: none; cursor: pointer; background: transparent; color: var(--lk-muted); font-family: var(--lk-sans);
    font-size: 0.76rem; font-weight: 700; padding: 5px 12px; border-radius: 8px; transition: background-color .15s, color .15s; }
  .lk-seg button[data-on="1"] { background: var(--lk-accent); color: var(--lk-on-accent); }
  .lk-iconbtn:disabled { opacity: .3; cursor: default; background: transparent; }
  .lk-switch { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
  .lk-switch input { width: 18px; height: 18px; accent-color: var(--lk-accent); }
  .lk-editor-error { color: var(--lk-danger-ink); font-size: 0.8rem; font-weight: 600; }
  .lk-editor-actions { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 16px max(14px, env(safe-area-inset-bottom)); border-top: 1px solid var(--lk-line); }
  .lk-spacer { flex: 1; }
  .lk-btn { max-inline-size: 100%; overflow-wrap: anywhere; border: 1px solid var(--lk-line); background: var(--lk-elevated); color: var(--lk-fg); cursor: pointer;
    font-family: var(--lk-sans); font-size: 0.86rem; font-weight: 700; padding: 9px 15px; border-radius: 11px;
    transition: transform .06s, opacity .15s, background-color .15s; }
  .lk-btn:active { transform: scale(.97); }
  .lk-btn:disabled { opacity: .5; cursor: default; }
  .lk-btn-accent { background: var(--lk-accent); color: var(--lk-on-accent); border-color: transparent; }
  .lk-btn-danger { background: transparent; border-color: transparent; color: var(--lk-danger-ink); }
  .lk-btn-danger:hover { background: color-mix(in srgb, var(--lk-danger) 14%, transparent); }

  /* ---- independently scrolling conversation ---- */
  /* The transcript scrolls independently; the composer stays in the next flex row. */
  .lk-convo { flex: 1; min-height: 0; overflow-y: auto; padding: 8px max(16px, calc((100% - 800px) / 2));
    overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; }
  .lk-empty { margin: auto; padding-block: 32px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;
    color: var(--lk-muted); font-size: 1rem; line-height: 1.5; max-width: 560px; --mdc-icon-size: 28px; }
  .lk-empty h2 { color: var(--lk-fg); font-size: 1.5rem; line-height: 1.25; letter-spacing: -.02em; margin: 0; text-wrap: balance; }
  .lk-empty p { margin: 0; }
  .lk-starters { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
  .lk-starters button { min-height: 44px; }
  .lk-state { font-variant-numeric: tabular-nums; }
  .lk-modehint { flex: none; margin: 0; padding: 4px max(16px, calc((100% - 800px) / 2)); color: var(--lk-muted); font-size: .8rem; }
  .lk-recovery { flex: none; padding: 12px 14px; border: 1px solid var(--lk-danger-ink); border-radius: 12px; background: var(--lk-surface); }
  .lk-recovery strong { display: block; font-size: .9rem; }
  .lk-recovery p { font-size: .85rem; line-height: 1.4; margin: 4px 0 10px; }
  .lk-recovery-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .lk-recovery button { min-height: 44px; }

  .lk-msg { display: flex; animation: lk-rise .22s ease both; }
  .lk-msg[data-role="user"] { justify-content: flex-end; }
  .lk-msg-col { display: flex; flex-direction: column; align-items: flex-start; max-width: 84%; min-width: 0; }
  .lk-msg[data-role="user"] .lk-msg-col { align-items: flex-end; }
  .lk-time { margin: 3px 7px 0; font-size: 0.66rem; line-height: 1; color: var(--lk-muted); font-variant-numeric: tabular-nums; }
  .lk-bubble { max-width: 100%; padding: 8px 13px; border-radius: 16px; font-size: 0.92rem; line-height: 1.4;
    white-space: pre-wrap; word-break: break-word; }
  .lk-msg[data-role="user"] .lk-bubble { background: var(--lk-accent); color: var(--lk-on-accent); border-bottom-right-radius: 5px; }
  .lk-msg[data-role="agent"] .lk-bubble { background: color-mix(in srgb, var(--lk-fg) 6%, var(--lk-surface)); color: var(--lk-fg); border-bottom-left-radius: 5px; }
  /* what was said and what a tool got and returned can be copied, whatever the dashboard
     around the card sets; a long press on iOS then offers Copy */
  .lk-bubble, .lk-act-details { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
  /* agent replies rendered from Markdown */
  .lk-md { white-space: normal; }
  .lk-md :where(p, ul, ol, pre, blockquote, hr, .lk-md-table) { margin: 0; }
  .lk-md > * + *, .lk-md blockquote > * + * { margin-top: 8px; }
  .lk-md li > * + * { margin-top: 2px; }
  .lk-md ul, .lk-md ol { padding-left: 1.3em; }
  .lk-md li + li { margin-top: 2px; }
  .lk-md li::marker { color: var(--lk-muted); }
  .lk-md-h { font-weight: 700; letter-spacing: -0.01em; }
  .lk-md strong { font-weight: 700; }
  .lk-md a { color: var(--lk-accent-ink); text-decoration: underline; text-decoration-thickness: 1px;
    text-underline-offset: 2px; overflow-wrap: anywhere; }
  .lk-md code { font-family: var(--lk-mono); font-size: 0.84em; padding: 1px 5px; border-radius: 5px;
    background: color-mix(in srgb, var(--lk-fg) 9%, transparent); }
  .lk-md pre { padding: 8px 10px; border-radius: 9px; overflow-x: auto; white-space: pre; scrollbar-width: thin;
    background: color-mix(in srgb, var(--lk-fg) 7%, transparent); }
  .lk-md pre code { padding: 0; background: none; font-size: 0.8rem; line-height: 1.45; }
  .lk-md blockquote { padding-left: 10px; border-left: 1px solid var(--lk-line); color: var(--lk-muted); }
  .lk-md hr { border: none; border-top: 1px solid var(--lk-line); }
  .lk-md-table { overflow-x: auto; scrollbar-width: thin; }
  .lk-md table { border-collapse: collapse; font-size: 0.86em; }
  .lk-md th, .lk-md td { padding: 4px 10px 4px 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--lk-line); }
  .lk-md th { font-weight: 700; }
  .lk-md tr:last-child td { border-bottom: none; }
  /* a tool call: a tappable pill that expands into its arguments and output */
  .lk-act-row { align-self: flex-start; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
    max-width: 100%; min-width: 0; animation: lk-rise .22s ease both; }
  .lk-act-row[data-open="1"] { align-self: stretch; }
  .lk-act { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; margin: 0;
    padding: 3px 8px; border-radius: 8px; font: inherit; font-size: 0.8rem; text-align: left; cursor: pointer;
    --mdc-icon-size: 13px; border: 0; background: transparent; color: var(--lk-muted);
    transition: border-color .15s ease, background .15s ease; }
  .lk-act-badge { flex: none; font-size: .7rem; font-weight: 700; }
  .lk-act-text { min-width: 0; overflow-wrap: anywhere; }
  .lk-act-reason { padding-inline: 10px; font-size: .76rem; color: var(--lk-fg); overflow-wrap: anywhere; }
  .lk-act:hover { border-color: color-mix(in srgb, var(--lk-fg) 22%, transparent); }
  .lk-act:focus-visible { outline: 2px solid var(--lk-focus); outline-offset: 2px; }
  .lk-act-chev { --mdc-icon-size: 15px; flex: none; margin-left: -1px; opacity: .6; transition: transform .18s ease; }
  .lk-act[aria-expanded="true"] .lk-act-chev { transform: rotate(180deg); }
  .lk-act-details { width: 100%; min-width: 0; padding: 9px 10px 10px; border-radius: 12px;
    border: 1px solid var(--lk-line); background: var(--lk-surface); font-size: 0.78rem; color: var(--lk-fg); }
  .lk-act-status { display: flex; align-items: center; gap: 7px; font-weight: 700; }
  .lk-act-update { white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
  .lk-act-status[data-status="running"] .lk-act-dot { background: var(--lk-accent); animation: lk-blink 1s ease-in-out infinite; }
  .lk-act-status[data-status="done"] .lk-act-dot { background: var(--lk-ok); }
  .lk-act-status[data-status="error"], .lk-act-status[data-status="cancelled"] { color: var(--lk-danger-ink); }
  .lk-act-status[data-status="error"] .lk-act-dot, .lk-act-status[data-status="cancelled"] .lk-act-dot { background: var(--lk-danger); }
  .lk-act-name { margin-left: auto; font-family: var(--lk-mono); font-weight: 400; font-size: 0.72rem; color: var(--lk-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .lk-act-label { margin: 10px 0 4px; font-size: 0.68rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--lk-muted); }
  .lk-act-note { font-weight: 500; letter-spacing: 0; text-transform: none; }
  .lk-act-code { margin: 0; padding: 7px 9px; max-height: 200px; overflow: auto; white-space: pre; scrollbar-width: thin;
    border-radius: 8px; font-family: var(--lk-mono); font-size: 0.72rem; line-height: 1.5; color: var(--lk-fg);
    background: color-mix(in srgb, var(--lk-fg) 6%, transparent); }
  .lk-act-code[data-error="1"] { white-space: pre-wrap; word-break: break-word; color: var(--lk-danger-ink);
    background: color-mix(in srgb, var(--lk-danger) 9%, transparent); }
  .lk-act-none { color: var(--lk-muted); font-style: italic; }
  .lk-act[data-kind="action"] { color: var(--lk-fg);
    border-color: color-mix(in srgb, var(--lk-accent) 34%, transparent);
    background: color-mix(in srgb, var(--lk-accent) 9%, var(--lk-surface)); }
  .lk-act[data-status="error"] { color: var(--lk-fg); border-color: var(--lk-danger-ink);
    background: color-mix(in srgb, var(--lk-danger) 12%, var(--lk-surface)); }
  .lk-act[data-status="cancelled"] { border-style: dashed; color: var(--lk-fg); }
  .lk-act[data-status="running"] { color: var(--lk-fg); border-color: var(--lk-accent-ink); }
  .lk-act-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-act-target { color: var(--lk-muted); }
  .lk-act[data-kind="action"] .lk-act-target { color: var(--lk-fg); font-weight: 700; }
  .lk-act-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--lk-muted); }
  .lk-act[data-status="running"] .lk-act-dot { background: var(--lk-accent); animation: lk-blink 1s ease-in-out infinite; }
  .lk-act[data-status="done"] .lk-act-dot { background: var(--lk-ok); }
  .lk-act[data-status="error"] .lk-act-dot, .lk-act[data-status="cancelled"] .lk-act-dot { background: var(--lk-danger); }
  @keyframes lk-rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @keyframes lk-blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

  /* Composer stays in flow, below the independently scrolling transcript. */
  .lk-dock { position: relative; flex: none; margin-top: auto;
    padding: 8px max(16px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    display: flex; flex-direction: column; align-items: center; gap: 8px; background: var(--lk-surface); }
  .lk-dock > * { width: 100%; max-width: 800px; }

  /* ---- one-tap quick replies the agent offers, above the composer ---- */
  .lk-suggest { width: 100%; display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
  .lk-chip { flex: 0 1 auto; max-width: 100%; overflow-wrap: anywhere; border-radius: 16px; padding: 6px 14px; cursor: pointer;
    font: inherit; font-size: 0.85rem; font-weight: 600; line-height: 1.2; color: var(--lk-fg);
    background: var(--lk-surface); border: 1px solid color-mix(in srgb, var(--lk-accent) 42%, var(--lk-line));
    transition: background-color .15s, border-color .15s, transform .06s; }
  .lk-chip:hover { background: color-mix(in srgb, var(--lk-accent) 12%, var(--lk-surface));
    border-color: color-mix(in srgb, var(--lk-accent) 60%, var(--lk-line)); }
  .lk-chip:active { transform: scale(.95); }
  .lk-chip:disabled { cursor: default; opacity: .55; }

  /* ---- manual turn: the composer becomes a listening bar (Cancel · meter · Send) ---- */
  .lk-listen { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 8px;
    padding: 7px 7px 7px 10px; border-radius: 26px;
    background: color-mix(in srgb, var(--lk-accent) 12%, var(--lk-surface));
    border: 1px solid color-mix(in srgb, var(--lk-accent) 42%, transparent);
    box-shadow: none; }
  .lk-listen-cancel { flex: none; width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
    --mdc-icon-size: 20px; display: grid; place-items: center; background: transparent; color: var(--lk-muted);
    transition: background-color .15s, color .15s, transform .06s; }
  .lk-listen-cancel:hover { color: var(--lk-danger-ink); background: color-mix(in srgb, var(--lk-danger) 15%, transparent); }
  .lk-listen-cancel:active { transform: scale(.92); }
  .lk-listen-mid { flex: 1; min-width: 0; display: flex; align-items: center; gap: 11px; padding-left: 4px; }
  .lk-listen-label { font-size: 0.85rem; font-weight: 600; color: var(--lk-fg); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  /* live input meter — the card's voice signature, echoing the orb */
  .lk-eq { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 20px; }
  .lk-eq i { width: 3px; height: 18px; border-radius: 2px; background: var(--lk-accent);
    transform: scaleY(.28); transform-origin: center; animation: lk-eq 1s ease-in-out infinite; }
  .lk-eq i:nth-child(1) { animation-delay: -.9s; }
  .lk-eq i:nth-child(2) { animation-delay: -.5s; }
  .lk-eq i:nth-child(3) { animation-delay: -.2s; }
  .lk-eq i:nth-child(4) { animation-delay: -.7s; }
  .lk-eq i:nth-child(5) { animation-delay: -.4s; }
  @keyframes lk-eq { 0%,100% { transform: scaleY(.28); } 50% { transform: scaleY(1); } }
  /* Cold-start spinner shown while the mic is being acquired (App.tsx openTurn). Uses
     currentColor: accent in the listening bar (matching the EQ it replaces), on-accent on the
     round auto-resume button. */
  .lk-spin { flex: none; box-sizing: border-box; width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 26%, transparent); border-top-color: currentColor;
    animation: lk-spin .7s linear infinite; }
  .lk-listen-mid .lk-spin { color: var(--lk-accent-ink); }
  @keyframes lk-spin { to { transform: rotate(360deg); } }
  .lk-listen-send { flex: none; display: inline-flex; align-items: center; gap: 5px; min-height: 44px; padding: 0 14px 0 16px;
    border: none; border-radius: 20px; cursor: pointer; --mdc-icon-size: 18px;
    font-family: var(--lk-sans); font-size: 0.9rem; font-weight: 700; letter-spacing: -0.01em;
    background: var(--lk-accent); color: var(--lk-on-accent); transition: transform .06s, opacity .15s; }
  .lk-listen-send:hover { opacity: .95; }
  .lk-listen-send:active { transform: scale(.96); }
  .lk-listen-send:disabled { opacity: .45; cursor: default; }
  .lk-listen-send:disabled:active { transform: none; }

  .lk-bar { width: 100%; min-height: 48px; display: flex; align-items: flex-end; gap: 7px; padding: 3px 3px 3px 15px;
    border-radius: 24px; border: 1px solid var(--lk-line); background: var(--lk-surface);
    box-shadow: none; }
  .lk-bar:has(.lk-input:focus-visible) { outline: 2px solid var(--lk-focus); outline-offset: 3px; }
  .lk-bar:has(.lk-input:focus-visible) .lk-input:focus-visible { outline: none; }
  .lk-bar:focus-within { border-color: color-mix(in srgb, var(--lk-accent) 52%, var(--lk-line)); }
  .lk-bar[data-paused="1"] { border-style: dashed; border-color: color-mix(in srgb, var(--lk-muted) 45%, var(--lk-line)); }
  .lk-input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--lk-fg);
    font: inherit; font-size: 1rem; line-height: 1.4; padding: 9px 0; margin: 0; resize: none; display: block;
    box-sizing: border-box; max-height: 128px; overflow-y: auto; scrollbar-width: thin; }
  .lk-input::placeholder { color: var(--lk-muted); }
  .lk-send { flex: none; width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer; --mdc-icon-size: 20px;
    display: grid; place-items: center; background: var(--lk-elevated); color: var(--lk-fg); transition: background-color .15s, transform .06s; }
  .lk-send:active { transform: scale(.93); }
  .lk-send[data-on="1"], .lk-send--accent { background: var(--lk-accent); color: var(--lk-on-accent); }
  .lk-send:disabled { cursor: default; }
  .lk-send:disabled:active { transform: none; }
  /* A live microphone has a visible halo; paused, send and busy controls do not. */
  .lk-send[data-on="1"] {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--lk-accent) 16%, transparent),
      0 0 24px 10px color-mix(in srgb, var(--lk-accent) 32%, transparent);
    animation: lk-dictation-glow 1.8s ease-in-out infinite;
  }
  @keyframes lk-dictation-glow {
    0%, 100% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--lk-accent) 16%, transparent), 0 0 24px 10px color-mix(in srgb, var(--lk-accent) 32%, transparent); }
    50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--lk-accent) 22%, transparent), 0 0 30px 13px color-mix(in srgb, var(--lk-accent) 42%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .lk-send[data-on="1"] { animation: none; }
  }
  /* stop replaces send while a text turn runs; dimmed until the turn's task id is known */
  .lk-stop:disabled { opacity: .45; }
  .lk-stop[data-stopping="1"]:disabled { opacity: 1; }
  .lk-stop-sq { width: 12px; height: 12px; border-radius: 3px; background: currentColor; }
  /* the second press cancels the background work too, so it reads as a warning */
  .lk-stop[data-force="1"] { background: var(--lk-danger); color: var(--lk-on-danger); }

  .lk-start { cursor: pointer; width: 100%; padding: 13px; border: none; border-radius: 16px; --mdc-icon-size: 20px;
    display: inline-flex; align-items: center; justify-content: center; gap: 9px;
    font-family: var(--lk-sans); font-size: 0.96rem; font-weight: 700; letter-spacing: -0.01em;
    background: var(--lk-accent); color: var(--lk-on-accent);
    box-shadow: 0 14px 34px -18px color-mix(in srgb, var(--lk-accent) 90%, transparent); transition: transform .06s, opacity .2s; }
  .lk-start:hover { opacity: .95; }
  .lk-start:active { transform: scale(.985); }
  .lk-start:disabled { opacity: .5; cursor: default; box-shadow: none; }

  .lk-settings-scroll > .lk-set-sec { width: 100%; max-width: 800px; margin-inline: auto; }
  .lk-search, .lk-tasklist { width: 100%; max-width: 832px; align-self: center; }
  .lk-tasks-empty { flex: none; }
  @container (max-width: 600px) {
    .lk-tabs { padding-inline: 8px; }
    .lk-tab { flex: 1 0 auto; padding-inline: 4px; }
    .lk-music-meta { flex-basis: calc(100% - 44px); }
    .lk-music-row > .lk-iconbtn { flex: 1 0 44px; }
    .lk-taskrow-desc, .lk-taskrow-exec { white-space: normal; overflow-wrap: anywhere; }
    .lk-set-desc { font-size: .875rem; line-height: 1.5; }
    .lk-tab, .lk-person-name, .lk-taskrow-desc, .lk-sched-desc, .lk-music-title,
    .lk-bubble, .lk-btn, .lk-chip, .lk-listen-label { font-size: 1rem; }
    .lk-person-sum, .lk-taskrow-exec, .lk-taskrow-when, .lk-sched-when, .lk-music-sub { font-size: .875rem; }
    .lk-in, .lk-search-in, .lk-person-sel { font-size: max(1rem, 16px); }
  }
  @media (max-width: 600px) {
    .lk-input, .lk-in, .lk-search-in { font-size: max(1rem, 16px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .lk-orb-core, .lk-orb::before, .lk-act-dot, .lk-msg, .lk-act-row { animation: none !important; }
    .lk-editor-panel, .lk-editor, .lk-taskrow, .lk-sched-item, .lk-spin { animation: none !important; }
    .lk-eq i { animation: none !important; transform: scaleY(.6); }
  }
  .lk-approvals { display: grid; gap: 12px; margin-block: 12px; min-width: 0; }
  .lk-approval { padding: 16px; border: 1px solid var(--lk-line); border-radius: 12px; background: var(--lk-elevated); min-width: 0; overflow-wrap: anywhere; }
  .lk-approval-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; color: var(--lk-muted); font-size: 12px; }
  .lk-approval h3 { font-size: 15px; margin: 0 0 8px; }
  .lk-approval p { margin: 8px 0; }
  .lk-approval details { margin-block: 12px; }
  .lk-approval summary { cursor: pointer; padding-block: 8px; }
  .lk-approval pre { white-space: pre; overflow: auto; max-height: 320px; padding: 12px; background: var(--lk-surface); font: 12px/1.5 var(--lk-mono); }
  .lk-approval-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .lk-approval-actions button, .lk-approval-error button { min-height: 44px; padding-inline: 16px; }
  .lk-approval button:disabled { opacity: .5; cursor: default; }
  .lk-approval :is(button, summary):focus-visible { outline: 2px solid var(--lk-focus); outline-offset: 3px; }
  .lk-approval-error { color: var(--lk-danger-ink); }
  .lk-caption-state { margin: 4px 7px 0; color: var(--lk-muted); font-size: .75rem; line-height: 1.4; }
  .lk-msg[data-interim="1"] .lk-bubble { border: 1px dashed var(--lk-line); }
  .lk-voice-preferences { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--lk-line); gap: 8px; }
  .lk-voice-preferences .lk-modeswitch { align-self: flex-start; }
  .lk-history-actions { padding: 12px 16px; }
  .lk-conversation-drawer .lk-settings-scroll { padding: 20px 16px; }
` + VOICE_FEEDBACK_STYLES + CONVERSATION_HEADER_STYLES + CONVERSATION_DRAWER_STYLES;
