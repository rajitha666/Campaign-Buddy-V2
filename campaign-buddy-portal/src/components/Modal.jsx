import { ICONS } from './Icons';

// Lightweight centered modal. Overlay click + close button both dismiss.
export default function Modal({ open, title, subtitle, onClose, children, width = 560 }) {
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-card" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="modal-title h-display">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <div className="close-btn" onClick={onClose}>{ICONS.close}</div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}
