import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastCtx = createContext(null);

const DEFAULT_MS = 2600;
const ACTION_MS = 7000; // a toast you can act on (e.g. Undo) stays long enough to read and click

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const timers = useRef(new Map()); // id -> { handle, ms }

  const cancel = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t.handle);
  }, []);
  const dismiss = useCallback((id) => {
    cancel(id);
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, [cancel]);
  const schedule = useCallback((id, ms) => {
    cancel(id);
    timers.current.set(id, { handle: setTimeout(() => dismiss(id), ms), ms });
  }, [cancel, dismiss]);
  // Hovering or focusing a toast holds it (WCAG 2.2.1); leaving restarts the full timer.
  const hold = useCallback((id) => cancel(id), [cancel]);
  const release = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) schedule(id, t.ms);
  }, [schedule]);
  useEffect(() => {
    const all = timers.current;
    return () => { all.forEach((t) => clearTimeout(t.handle)); all.clear(); };
  }, []);

  // push(message, type?, { action: { label, onClick }, duration }?)
  // `action` adds a button to the toast — used for "Undo" after a reversible change.
  const push = useCallback((message, type = 'default', opts = {}) => {
    const id = ++idRef.current;
    const action = opts.action || null;
    setToasts((t) => [...t, { id, message, type, action }]);
    schedule(id, opts.duration ?? (action ? ACTION_MS : DEFAULT_MS));
    return id;
  }, [schedule]);

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type === 'error' ? 'error' : ''}`}
            role={t.type === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => hold(t.id)}
            onMouseLeave={() => release(t.id)}
            onFocus={() => hold(t.id)}
            onBlur={() => release(t.id)}
          >
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
