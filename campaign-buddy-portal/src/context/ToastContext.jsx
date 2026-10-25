import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(null);

const DEFAULT_MS = 2600;
const ACTION_MS = 7000; // a toast you can act on (e.g. Undo) stays long enough to read and click

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // push(message, type?, { action: { label, onClick }, duration }?)
  // `action` adds a button to the toast — used for "Undo" after a reversible change.
  const push = useCallback((message, type = 'default', opts = {}) => {
    const id = ++idRef.current;
    const action = opts.action || null;
    setToasts((t) => [...t, { id, message, type, action }]);
    setTimeout(() => dismiss(id), opts.duration ?? (action ? ACTION_MS : DEFAULT_MS));
    return id;
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => { dismiss(t.id); t.action.onClick(); }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
