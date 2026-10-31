import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Where Tab should land to keep focus inside a dialog with `count` focusable
// controls, given the index of the currently focused one (-1 = outside).
// Returns null when the browser's own movement is already fine, -1 when there
// is nothing focusable (focus the dialog itself).
export function nextTabTarget(count, current, shift) {
  if (count === 0) return -1;
  if (current === -1) return shift ? count - 1 : 0;
  if (!shift && current === count - 1) return 0;
  if (shift && current === 0) return count - 1;
  return null;
}

// Makes an open drawer/modal behave as an accessible dialog: Escape closes,
// focus moves in on open, Tab stays inside, and focus returns to the opener.
export function useDialogA11y(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const node = ref.current;
    const controls = () => (node ? [...node.querySelectorAll(FOCUSABLE)] : []);
    if (node) {
      // Skip the close button so typing starts in the form, not on "x".
      const first = controls().find((el) => !el.classList.contains('close-btn')) || node;
      first.focus();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const list = controls();
      const target = nextTabTarget(list.length, list.indexOf(document.activeElement), e.shiftKey);
      if (target === null) return;
      e.preventDefault();
      (target === -1 ? node : list[target]).focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open]);

  return ref;
}
