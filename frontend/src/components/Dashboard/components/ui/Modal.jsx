import React, { useEffect } from "react";
import { FiX } from "react-icons/fi";

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="pg-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`pg-modal ${wide ? "pg-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="pg-modal__header">
          <h2 className="pg-modal__title">{title}</h2>
          <button className="pg-modal__close" type="button" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </header>
        <div className="pg-modal__body">{children}</div>
        {footer ? <footer className="pg-modal__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
