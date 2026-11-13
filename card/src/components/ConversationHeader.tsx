export interface ConversationHeaderProps {
  title: string;
  stateLabel: string;
  connected: boolean;
  orbState: string;
  announceState?: boolean;
  onHistory: () => void;
  onSettings: () => void;
  onUpcoming: () => void;
  upcomingCount: number;
}

/** One conversation identity, with secondary destinations revealed only when requested. */
export function ConversationHeader({ title, stateLabel, connected, orbState, announceState = true,
  onHistory, onSettings, onUpcoming, upcomingCount }: ConversationHeaderProps) {
  const count = Number.isFinite(upcomingCount) ? Math.max(0, Math.floor(upcomingCount)) : 0;
  return (
    <header className="lk-conversation-header">
      <div className="lk-conversation-identity">
        <span className="lk-conversation-dot" data-connected={connected ? '1' : '0'} data-phase={orbState} aria-hidden="true" />
        <div className="lk-conversation-heading">
          <span className="lk-conversation-title">{title}</span>
          <span className="lk-conversation-status" role={announceState ? 'status' : undefined}
            aria-live={announceState ? 'polite' : 'off'} aria-atomic="true">{stateLabel}</span>
        </div>
      </div>
      <nav className="lk-conversation-actions" aria-label="Conversation options">
        <button type="button" className="lk-conversation-upcoming" onClick={onUpcoming}
          aria-label={`Upcoming tasks, ${count} ${count === 1 ? 'task' : 'tasks'}`} title="Upcoming tasks">
          <ha-icon icon="mdi:calendar-clock-outline" aria-hidden="true" />
          <span className="lk-conversation-upcoming-label">Upcoming</span>
          <span className="lk-conversation-count" aria-hidden="true">{count}</span>
        </button>
        <button type="button" className="lk-conversation-action" onClick={onHistory} aria-label="Conversation history" title="Conversation history">
          <ha-icon icon="mdi:history" aria-hidden="true" />
        </button>
        <button type="button" className="lk-conversation-action" onClick={onSettings} aria-label="Settings" title="Settings">
          <ha-icon icon="mdi:cog-outline" aria-hidden="true" />
        </button>
      </nav>
    </header>
  );
}
