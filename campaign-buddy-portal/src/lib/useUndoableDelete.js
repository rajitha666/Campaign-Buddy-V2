import { useCallback } from 'react';
import { useToast } from '../context/ToastContext';

// Which deletes still ask "Are you sure?" first (#112). Reversible deletes act at once and
// offer Undo; a resource asks first when its config says so (`confirmDelete`: campaigns and
// clients, whose dependants disappear with them) or when it has no restore route to offer.
export function needsConfirm(config) {
  return Boolean(config?.confirmDelete) || typeof config?.restoreItem !== 'function';
}

// Plain-language failure for an Undo that did not work. Never exposes error codes.
export function restoreFailureMessage(err, name) {
  const label = name ? `"${name}"` : 'it';
  if (err?.status === 404) return `${label} was already restored or no longer exists.`;
  const why = err?.message ? ` ${err.message}` : '';
  return `Couldn't restore ${label}.${why}`.trim();
}

// act -> toast with Undo. The row is only reported removed after the delete succeeded (a
// failing delete throws to the caller, which shows the server's message). `remove()` may
// return data (e.g. the removed access grant) that is handed to `restore`.
//   removedText / restoredText override the default `Removed "X"` / `Restored "X"` wording.
export function useUndoableDelete() {
  const { push } = useToast();
  return useCallback(async ({ name, remove, restore, onChange, removedText, restoredText }) => {
    const removed = await remove();
    onChange?.();
    // The row the user clicked is gone; keep keyboard focus on the page rather than <body>.
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) {
        const main = document.querySelector('main, [role="main"]');
        if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
      }
    }, 300);
    let used = false;
    push(removedText || (name ? `Removed "${name}"` : 'Removed'), 'default', {
      action: {
        label: 'Undo',
        onClick: async () => {
          if (used) return; // double-click / double-Enter must never restore twice
          used = true;
          try {
            await restore(removed);
            push(restoredText || (name ? `Restored "${name}"` : 'Restored'));
          } catch (e) {
            push(restoreFailureMessage(e, name), 'error');
          } finally {
            onChange?.();
          }
        },
      },
    });
  }, [push]);
}
