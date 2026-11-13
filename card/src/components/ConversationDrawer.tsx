import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';

interface ConversationDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function focusedElement(root: Document | ShadowRoot): HTMLElement | null {
  const active = root.activeElement;
  if (active?.shadowRoot) return focusedElement(active.shadowRoot);
  return active instanceof HTMLElement ? active : null;
}

/** A top-layer sheet. Children remain mounted so closing it does not lose their drafts. */
export function ConversationDrawer({ open, title, onClose, children }: ConversationDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const programmaticClose = useRef(false);
  const backdropPress = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const headingId = useId();

  const restoreFocus = useCallback(() => {
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected && !target.closest('dialog:not([open])')) target.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.isConnected) return;
    if (open && !dialog.open) {
      opener.current = focusedElement(document);
      dialog.showModal();
    } else if (!open && dialog.open) {
      programmaticClose.current = true;
      dialog.close();
      restoreFocus();
    }
  }, [open, restoreFocus]);

  useEffect(() => () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      programmaticClose.current = true;
      dialog.close();
      restoreFocus();
    }
  }, [restoreFocus]);

  const outside = (event: { clientX: number; clientY: number }) => {
    const bounds = dialogRef.current?.getBoundingClientRect();
    return Boolean(bounds && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom));
  };

  return (
    <dialog
      ref={dialogRef}
      className="lk-conversation-drawer"
      aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); onCloseRef.current(); }}
      onClose={() => {
        const expected = programmaticClose.current;
        programmaticClose.current = false;
        // A queued close event from a rapid close/reopen must not steal modal focus.
        if (dialogRef.current?.open) return;
        if (!expected && openRef.current) onCloseRef.current();
        restoreFocus();
      }}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget && outside(event); }}
      onPointerCancel={() => { backdropPress.current = false; }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget && outside(event)) onCloseRef.current();
        backdropPress.current = false;
      }}
    >
      <div className="lk-conversation-drawer-shell">
        <header className="lk-conversation-drawer-head">
          <h2 id={headingId}>{title}</h2>
          <button className="lk-iconbtn" type="button" aria-label={`Close ${title}`} title={`Close ${title}`} onClick={() => onCloseRef.current()} autoFocus>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </header>
        <div className="lk-conversation-drawer-body">{children}</div>
      </div>
    </dialog>
  );
}
