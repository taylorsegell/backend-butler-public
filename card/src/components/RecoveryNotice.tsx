/** Keep a failed operation and its recovery beside the composer that owns the draft. */
export function RecoveryNotice({ title, message, retryLabel, busy = false, onRetry, onSettings }: {
  title: string;
  message: string;
  retryLabel: string;
  busy?: boolean;
  onRetry: () => void;
  onSettings?: () => void;
}) {
  return (
    <section className="lk-recovery" aria-label="Connection recovery">
      <div role="alert"><strong>{title}</strong><p>{message}</p></div>
      <div className="lk-recovery-actions">
        <button type="button" className="lk-btn lk-btn-accent" onClick={onRetry} disabled={busy}>
          {busy ? 'Trying again…' : retryLabel}
        </button>
        {onSettings && <button type="button" className="lk-btn" onClick={onSettings}>Connection settings</button>}
      </div>
    </section>
  );
}
