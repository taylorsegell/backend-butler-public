import { useEffect, useId, useRef, useState } from 'react';
import { type Task, toLocalInput, localInputToIso } from '../lib/tasks';

type Kind = 'reminder' | 'instruction';

/** The task's action as the editor shows it; an older task's replayed reminder reads as one. */
function initialAction(task: Task): { kind: Kind; text: string } {
  const e = task.execution ?? {};
  if (e.notification) return { kind: 'reminder', text: e.notification.message };
  if (e.instruction) return { kind: 'instruction', text: e.instruction };
  const reminder = (e.steps ?? []).find((st) => st.tool === 'send_notification');
  const message = reminder?.args?.message;
  return typeof message === 'string'
    ? { kind: 'reminder', text: message }
    : { kind: 'instruction', text: '' };
}

/**
 * Modal editor for a single task. Edits everything — description, schedule (once time or
 * recurring cron), the action (a reminder sent as is, or an instruction the agent carries
 * out in the person's conversation), and enabled — plus delete. One-shot edits use the
 * browser's local timezone and are sent as instants; recurring schedules retain their zone.
 */
export function TaskEditor({
  task,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const timezoneHintId = useId();
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [returnFocus] = useState(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active instanceof HTMLElement ? active : null;
  });
  const inFlight = useRef(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      requestAnimationFrame(() => { if (returnFocus?.isConnected) returnFocus.focus(); });
    };
  }, [returnFocus]);
  const [description, setDescription] = useState(task.description);
  const [schedType, setSchedType] = useState<'once' | 'recurring'>(task.schedule_type);
  const [initialRunAt] = useState(() => toLocalInput(task.run_at ?? task.next_run_at));
  const [runAt, setRunAt] = useState(initialRunAt);
  const [cron, setCron] = useState(task.cron ?? '');
  const [action] = useState(() => initialAction(task));
  const [kind, setKind] = useState<Kind>(action.kind);
  const [actionText, setActionText] = useState(action.text);
  const [enabled, setEnabled] = useState(task.enabled);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const buildPatch = (): Record<string, unknown> => {
    if (!description.trim()) throw new Error('Enter a description.');
    const patch: Record<string, unknown> = { description: description.trim(), enabled };
    if (schedType === 'once') {
      if (!runAt) throw new Error('Pick a date and time.');
      if (schedType !== task.schedule_type || runAt !== initialRunAt) {
        patch.schedule = { type: 'once', run_at: localInputToIso(runAt), timezone: task.timezone };
      }
    } else {
      if (!cron.trim()) throw new Error('Enter a cron expression.');
      if (schedType !== task.schedule_type || cron.trim() !== (task.cron ?? '').trim()) {
        patch.schedule = { type: 'recurring', cron: cron.trim(), timezone: task.timezone };
      }
    }

    const text = actionText.trim();
    if (!text) {
      throw new Error(kind === 'reminder' ? 'Enter the reminder.' : 'Enter the instruction.');
    }
    patch.execution = kind === 'reminder' ? { notification: { message: text } } : { instruction: text };
    return patch;
  };

  const handleSave = async () => {
    if (inFlight.current) return;
    setError(null);
    let patch: Record<string, unknown>;
    try {
      patch = buildPatch();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await onSave(patch);
      onClose();
    } catch {
      setError('Save failed. Check the scheduler and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (inFlight.current) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch {
      setError('Delete failed. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="lk-editor" aria-labelledby={titleId} aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex="0"]')]
          .filter((element) => !element.matches(':disabled') && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        const active = (dialog.getRootNode() as ShadowRoot).activeElement;
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); if (!inFlight.current) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !inFlight.current) onClose(); }}>
      <div className="lk-editor-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lk-editor-head">
          <h2 id={titleId}>Edit schedule</h2>
          <button className="lk-iconbtn" onClick={onClose} disabled={busy} aria-label="Close">
            <ha-icon icon="mdi:close" />
          </button>
        </div>

        <div className="lk-editor-body">
          <fieldset className="lk-editor-fields" disabled={busy}>
            <legend className="lk-sr-only">Task details</legend>
            <label className="lk-field">
              <span className="lk-field-label">Description</span>
              <input
                className="lk-in"
                aria-label="Description"
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <div className="lk-field">
              <span className="lk-field-label">Schedule</span>
              <div className="lk-seg">
                <button aria-pressed={schedType === 'once'} data-on={schedType === 'once' ? '1' : '0'} onClick={() => setSchedType('once')}>
                  Once
                </button>
                <button
                  aria-pressed={schedType === 'recurring'} data-on={schedType === 'recurring' ? '1' : '0'}
                  onClick={() => setSchedType('recurring')}
                >
                  Recurring
                </button>
              </div>
              {schedType === 'once' ? (
                <input
                  className="lk-in"
                  type="datetime-local"
                  aria-label="Date and time"
                  aria-describedby={timezoneHintId}
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                />
              ) : (
                <>
                  <input
                    className="lk-in lk-mono"
                    aria-label="Cron expression"
                    aria-describedby={timezoneHintId}
                    placeholder="0 8 * * 1-5"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                  />
                  <span className="lk-hint">min hour day-of-month month day-of-week</span>
                </>
              )}
              <span className="lk-hint lk-timezone-hint" id={timezoneHintId}>{schedType === 'once' ? `Times shown in ${browserZone}.` : `Recurring times use ${task.timezone}.`}</span>
            </div>

            <div className="lk-field">
              <span className="lk-field-label">Action</span>
              <div className="lk-seg">
                <button aria-pressed={kind === 'reminder'} data-on={kind === 'reminder' ? '1' : '0'} onClick={() => setKind('reminder')}>
                  Reminder
                </button>
                <button
                  aria-pressed={kind === 'instruction'} data-on={kind === 'instruction' ? '1' : '0'}
                  onClick={() => setKind('instruction')}
                >
                  Instruction
                </button>
              </div>
              <textarea
                className="lk-in lk-ta"
                aria-label={kind === 'reminder' ? 'Reminder text' : 'Instruction text'}
                rows={2}
                placeholder={kind === 'reminder' ? 'e.g. Time to leave' : 'e.g. Turn off the bedroom AC'}
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
              />
              <span className="lk-hint">
                {kind === 'reminder'
                  ? 'Sent as is to your devices.'
                  : 'Sent to your conversation when it fires, and the agent carries it out.'}
              </span>
            </div>

            <label className="lk-switch">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>Enabled</span>
            </label>

            {error && <div ref={errorRef} className="lk-editor-error" role="alert">{error}</div>}
          </fieldset>
        </div>

        <div className="lk-editor-actions">
          <button className="lk-btn lk-btn-danger" onClick={handleDelete} disabled={busy}>
            {confirmDel ? 'Confirm delete schedule' : 'Delete schedule'}
          </button>
          <span className="lk-spacer" />
          <button className="lk-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="lk-btn lk-btn-accent" onClick={handleSave} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </dialog>
  );
}
