import { useEffect, useState } from 'react';
import type { Room } from 'livekit-client';
import { useApprovals, type Approval } from '../lib/approvals';

function previewText(preview: Approval['preview']): string {
  return preview.kind === 'yaml' ? preview.text : preview.lines.map((line) => `${line.op}${line.text}`).join('\n');
}

/** Shared by current text and voice conversations; historical views stay read-only. */
export function ButlerApprovals({ room }: { room?: Room }) {
  const api = useApprovals(room);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!api.items.length && !api.error) return null;
  return (
    <section className="lk-approvals" aria-label="Butler requests">
      {api.items.map((item) => {
        const expiry = Date.parse(item.expires_at);
        const expired = !Number.isFinite(expiry) || expiry <= now;
        const pending = item.status === 'pending' && !expired;
        const sending = api.sending === item.id;
        const status = sending ? 'Sending decision…' : item.status === 'approved' ? 'Approved' : item.status === 'denied' ? 'Not approved' : expired ? 'Expired' : pending ? 'Awaiting your decision' : 'No longer pending';
        return (
          <article key={item.id} className="lk-approval">
            <h3>{item.title}</h3>
            <div className="lk-approval-meta"><span>Butler request</span><span className="lk-approval-status" role="status">{status}</span></div>
            <p>{item.summary}</p>
            {item.outline?.map((section, i) => (
              <div key={i}><strong>{section.label}</strong><ul>{section.items.map((text, n) => <li key={n}>{text}</li>)}</ul></div>
            ))}
            <details><summary>Review {item.preview.kind === 'diff' ? 'changes' : 'YAML'}</summary><pre>{previewText(item.preview)}</pre></details>
            <div className="lk-approval-actions">
              <button className="lk-btn lk-btn-accent" disabled={!pending || !api.fresh || api.sending !== null} onClick={() => void api.decide(item.id, true)} aria-label={`Approve: ${item.title}`}>Approve</button>
              <button className="lk-chip" disabled={!pending || !api.fresh || api.sending !== null} onClick={() => void api.decide(item.id, false)} aria-label={`Deny: ${item.title}`}>Deny</button>
            </div>
          </article>
        );
      })}
      {api.error && <div className="lk-approval-error" role="alert">{api.error} <button className="lk-chip" onClick={() => void api.refresh()}>Refresh</button></div>}
    </section>
  );
}
