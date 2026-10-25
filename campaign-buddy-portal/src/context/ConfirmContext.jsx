import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmCtx = createContext(null);

// A designed replacement for window.confirm. `await confirm({ ... })` resolves
// true (confirmed) or false (cancelled, Esc, or a click outside). Keyboard
// friendly: focus moves into the dialog, Tab stays inside it, Esc cancels, and
// focus returns to whatever opened it. For a destructive action (tone: 'danger')
// the safe button (Cancel) has initial focus so a stray Enter can't delete.
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { opts, resolve }
  const returnFocusRef = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    returnFocusRef.current = document.activeElement;
    setState({ opts: opts || {}, resolve });
  }), []);

  const close = useCallback((result) => {
    setState((s) => {
      s?.resolve(result);
      return null;
    });
    const el = returnFocusRef.current;
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0);
  }, []);

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      {state ? <ConfirmDialog opts={state.opts} onClose={close} /> : null}
    </ConfirmCtx.Provider>
  );
}

function ConfirmDialog({ opts, onClose }) {
  const {
    title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default',
  } = opts;
  const danger = tone === 'danger';
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    (danger ? cancelRef : confirmRef).current?.focus();
  }, [danger]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(false); return; }
    if (e.key !== 'Tab') return;
    const focusables = rootRef.current?.querySelectorAll('button');
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <>
      <div className="overlay confirm-overlay" onClick={() => onClose(false)} />
      <div
        ref={rootRef}
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
        onKeyDown={onKeyDown}
      >
        <div id="confirm-title" className="confirm-title h-display">{title}</div>
        {message ? <div id="confirm-message" className="confirm-message">{message}</div> : null}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => onClose(false)}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
