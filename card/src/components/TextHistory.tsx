import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvItem } from '../lib/conversation';
import type { ConversationSummary, TextChatApi } from '../lib/text-chat';
import { NowPlaying } from './NowPlaying';
import { Conversation } from './Conversation';

function when(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/** The person's past text conversations: open one to read it, continue it to make it the
 *  current one, or delete it. The current conversation is listed but never deleted. */
export function TextHistory({ api, onClose, onContinue, active = true }: { api: TextChatApi; onClose: () => void; active?: boolean; onContinue?: (id: string, items: ConvItem[]) => Promise<void> }) {
  const { listConversations, readConversation, switchConversation, deleteConversation, busy } = api;
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // the one row whose delete is armed (two-tap confirm)
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [open, setOpen] = useState<ConversationSummary | null>(null);
  const [items, setItems] = useState<ConvItem[] | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const viewRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listConversations();
      setRows(data.conversations);
      setCurrent(data.current);
      setError(null);
    } catch {
      setError('Could not load conversations.');
    } finally {
      setLoading(false);
    }
  }, [listConversations]);

  useEffect(() => { if (active) void load(); }, [load, active]);

  const view = async (row: ConversationSummary) => {
    setConfirmId(null);
    if (row.id === current) {
      onClose();
      return;
    }
    const request = ++viewRequest.current;
    setError(null);
    setOpen(row);
    setItems(null);
    try {
      const data = await readConversation(row.id);
      if (request === viewRequest.current) setItems(data);
    } catch {
      if (request === viewRequest.current) { setItems([]); setError('Could not load this conversation.'); }
    }
  };

  const onDelete = async (row: ConversationSummary) => {
    if (deletingRef.current) return;
    if (confirmId !== row.id) {
      setConfirmId(row.id);
      return;
    }
    setConfirmId(null);
    deletingRef.current = true;
    setDeleting(true);
    setActionError(null);
    try {
      if (!(await deleteConversation(row.id))) setActionError('This conversation is in use; try again shortly.');
    } catch {
      setActionError('Could not delete the conversation.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
    await load();
  };

  const [resuming, setResuming] = useState(false);
  const resume = async () => {
    if (!open || resuming) return;
    setResuming(true);
    try {
      if (onContinue) await onContinue(open.id, items ?? []);
      else { if (!(await switchConversation(open.id, items ?? []))) throw new Error('A reply is still running. Try again when it ends.'); onClose(); }
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not resume this conversation. Try again.'); }
    finally { setResuming(false); }
  };

  if (open) {
    return (
      <>
        <div className="lk-search">
          <button className="lk-iconbtn" onClick={() => { viewRequest.current++; setOpen(null); setError(null); }} aria-label="Back to conversations">
            <ha-icon icon="mdi:arrow-left" />
          </button>
          <span className="lk-texthead">{open.title || 'New conversation'}</span>
        </div>
        {error ? (
          <div className="lk-tasks-empty">
            <h2>Conversation unavailable</h2>
            <p role="alert">{error} Retry, or go back to choose another conversation.</p>
            <button className="lk-btn" onClick={() => void view(open)}>Retry conversation</button>
          </div>
        ) : items === null ? (
          <div className="lk-tasks-empty">
            <span>Loading…</span>
          </div>
        ) : (
          <Conversation before={<NowPlaying />} items={items} startAtEnd />
        )}
        <div className="lk-dock" ref={dockRef}>
          {actionError && <p className="lk-set-err" role="alert">{actionError}</p>}
          <button className="lk-listen-send lk-resume" onClick={resume} disabled={busy || resuming || items === null || !!error}>
            <ha-icon icon="mdi:message-reply-text-outline" />
            {resuming ? 'Opening…' : 'Continue this conversation'}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="lk-schedtab">
      <div className="lk-search">
        <button className="lk-iconbtn" onClick={onClose} aria-label="Back to the conversation">
          <ha-icon icon="mdi:arrow-left" />
        </button>
        <span className="lk-texthead" role={error ? 'alert' : undefined}>{error ?? 'Conversations'}</span>
        <button className="lk-iconbtn" onClick={() => void load()} aria-label="Refresh">
          <ha-icon icon="mdi:refresh" />
        </button>
      </div>
      {actionError && <p className="lk-set-err lk-action-error" role="alert">{actionError}</p>}
      <div className="lk-tasklist" aria-busy={loading || deleting}>
        <NowPlaying />
        {rows.length === 0 ? (
          <div className="lk-tasks-empty">
            <ha-icon icon="mdi:message-text-outline" />
            <h2>{loading ? 'Loading conversations…' : error ? 'Conversations unavailable' : 'No conversations yet'}</h2>
            {error && <button className="lk-btn" onClick={() => void load()}>Retry conversations</button>}
          </div>
        ) : (
          rows.map((row) => {
            const isCurrent = row.id === current;
            return (
              <div key={row.id} className="lk-taskrow" data-status={isCurrent ? 'scheduled' : 'past'}>
                <button className="lk-taskrow-main" onClick={() => void view(row)}>
                  <span className="lk-taskrow-icon">
                    <ha-icon icon="mdi:message-text-outline" />
                  </span>
                  <span className="lk-taskrow-body">
                    <span className="lk-taskrow-desc">{row.title || 'New conversation'}</span>
                    <span className="lk-taskrow-when">{when(row.updated)}</span>
                  </span>
                  {isCurrent && (
                    <span className="lk-taskrow-tags">
                      <span className="lk-tag">current</span>
                    </span>
                  )}
                </button>
                {!isCurrent && (
                  <div className="lk-taskrow-acts">
                    <button
                      className="lk-iconbtn lk-taskrow-del"
                      data-armed={row.id === confirmId ? '1' : '0'}
                      disabled={deleting}
                      onClick={() => void onDelete(row)}
                      aria-label={row.id === confirmId ? 'Confirm delete conversation' : 'Delete conversation'}
                    >
                      <ha-icon icon={row.id === confirmId ? 'mdi:check' : 'mdi:trash-can-outline'} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
