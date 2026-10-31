import { ICONS } from './Icons';
import { useDialogA11y } from '../lib/dialogFocus';

// Lightweight centered modal. Overlay click + close button both dismiss.
export default function Modal({ open, title, subtitle, onClose, children, width = 560 }) {
  const ref = useDialogA11y(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-card" ref={ref} tabIndex={-1} style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div>
            <div className="modal-title h-display" id="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <div className="close-btn" role="button" tabIndex={0} aria-label="Close" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}>{ICONS.close}</div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}
