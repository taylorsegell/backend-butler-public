import { type Dispatch, type SetStateAction, useMemo, useRef, useState } from 'react';
import { lastUserText } from '../lib/conversation';
import { SCHEDULING_TOOLS, type Task } from '../lib/tasks';
import type { TasksApi } from '../lib/tasks-api';
import type { TextChatApi, TokenUsage } from '../lib/text-chat';
import { Conversation } from './Conversation';
import { NowPlaying } from './NowPlaying';
import { DeviceTiles } from './DeviceTiles';
import { Composer } from './Dock';
import { ScheduledTasks } from './ScheduledTasks';
import { RecoveryNotice } from './RecoveryNotice';
import { TextHistory } from './TextHistory';

// shown as the schedules rail and the chips instead of as inline action rows
const HIDDEN_TOOLS = new Set([...SCHEDULING_TOOLS, 'suggest_replies']);

// 950, 12.3k, 1.2M
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function UsageLabel({ usage }: { usage: TokenUsage }) {
  const full = (n: number) => n.toLocaleString('en');
  return (
    <span className="lk-usage" aria-label={`Token usage: ${full(usage.input)} input, ${full(usage.cached)} cached, ${full(usage.output)} output`}
      title={`Model tokens: ${full(usage.input)} input · ${full(usage.cached)} cached · ${full(usage.output)} output`}>
      Tokens · {compact.format(usage.input)} in · {compact.format(usage.output)} out
    </span>
  );
}

/** Saved Chat shared with the phone. Voice is a separate live session; both keep their
 *  drafts in CardShell so changing tabs does not discard an unsent message. */
export function TextTab({
  api,
  tasksApi,
  showTiles,
  onOpenTask,
  onSeeAllTasks,
  draft,
  onDraftChange,
  onSettings,
}: {
  api: TextChatApi;
  draft?: string;
  onDraftChange?: Dispatch<SetStateAction<string>>;
  onSettings?: () => void;
  tasksApi: TasksApi;
  showTiles: boolean;
  onOpenTask: (t: Task) => void;
  onSeeAllTasks: () => void;
}) {
  const { items, toolCalls, agentAreas, suggestions, usage, busy, canStop, stopping, forceStop, error, sendFailed, stop, send, renew, refresh } = api;
  const dockRef = useRef<HTMLDivElement>(null);
  const [localText, setLocalText] = useState('');
  const text = draft ?? localText;
  const setText = onDraftChange ?? setLocalText;
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [history, setHistory] = useState(false);
  const canSend = !busy && !submitting && text.trim().length > 0;
  const shown = useMemo(
    () => items.filter((i) => i.kind !== 'action' || !HIDDEN_TOOLS.has(i.name)),
    [items],
  );

  if (history) return <TextHistory api={api} onClose={() => setHistory(false)} />;

  const submit = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setText((current) => current.trim() === message ? current : message);
    try {
      if (await send(message)) setText((current) => current.trim() === message ? '' : current);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  const choosePrompt = (prompt: string) => {
    setText(prompt);
    requestAnimationFrame(() => dockRef.current?.querySelector('textarea')?.focus());
  };

  return (
    <>
      <div className="lk-search">
        <div className="lk-texthead">
          <span className="lk-chat-description">Saved Chat · Shared with your phone</span>
          <span className="lk-textstatus">
            {(stopping ? 'Stopping…' : forceStop ? 'Still working in the background' : busy ? 'Working…' : '')}
          </span>
          {usage && <UsageLabel usage={usage} />}
        </div>
        <button className="lk-iconbtn" onClick={() => void refresh()} aria-label="Refresh">
          <ha-icon icon="mdi:refresh" />
        </button>
        <button
          className="lk-iconbtn"
          onClick={() => setHistory(true)}
          aria-label="Conversations"
          title="Conversations"
        >
          <ha-icon icon="mdi:history" />
        </button>
        <button
          className="lk-iconbtn"
          onClick={() => void renew()}
          disabled={busy}
          aria-label="New conversation"
          title="New conversation"
        >
          <ha-icon icon="mdi:message-plus-outline" />
        </button>
      </div>
      <Conversation before={<div className="lk-context" role="region" aria-label="Home controls">
        <NowPlaying />
        <DeviceTiles
          hidden={!showTiles}
          agentAreas={agentAreas}
          toolCalls={toolCalls}
          query={lastUserText(items)}
          showRecent
        />
        <ScheduledTasks
          tasks={tasksApi.tasks}
          freshId={tasksApi.freshId}
          onOpen={onOpenTask}
          onSeeAll={onSeeAllTasks}
        />
      </div>} approvals items={shown} startAtEnd reflowKey={suggestions.length} onPrompt={choosePrompt} unavailable={Boolean(error)}
        notice={error && <RecoveryNotice title={sendFailed ? 'Your message wasn’t sent' : 'Chat is unavailable'} message={error}
          retryLabel={sendFailed && text.trim() ? 'Retry message' : 'Retry connection'} busy={busy || submitting}
          onRetry={() => sendFailed && text.trim() ? void submit(text) : void refresh()} onSettings={onSettings} />} />
      <div className="lk-dock" ref={dockRef}>
        {suggestions.length > 0 && (
          <div className="lk-suggest">
            {suggestions.map((reply, i) => (
              <button key={`${i}-${reply}`} className="lk-chip" onClick={() => void submit(reply)} disabled={busy || submitting}>
                {reply}
              </button>
            ))}
          </div>
        )}
        <div className="lk-bar">
          <Composer
            value={text}
            placeholder="Message…"
            onChange={setText}
            onSubmit={() => void submit(text)}
            onFocus={api.warm}
            disabled={submitting}
          />
          {busy ? (
            <button
              className="lk-send lk-send--accent lk-stop"
              title={stopping ? 'Stopping…' : forceStop ? 'Force stop: also cancel background work' : 'Stop'}
              aria-label={stopping ? 'Stopping' : forceStop ? 'Force stop' : 'Stop'}
              data-stopping={stopping ? '1' : '0'}
              data-force={forceStop ? '1' : '0'}
              onClick={() => void stop()}
              disabled={!canStop}
            >
              {stopping ? <span className="lk-spin" aria-hidden="true" /> : <span className="lk-stop-sq" aria-hidden="true" />}
            </button>
          ) : (
            <button
              className="lk-send lk-send--accent"
              title="Send"
              aria-label="Send"
              onClick={() => void submit(text)}
              disabled={!canSend}
            >
              <ha-icon icon="mdi:arrow-up" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
