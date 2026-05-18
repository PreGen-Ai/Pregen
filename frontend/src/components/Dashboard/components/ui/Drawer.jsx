import React, { useEffect } from "react";
import { FiX } from "react-icons/fi";
import IconButton from "./IconButton";

export default function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
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
    <div className="pg-drawer-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="pg-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pg-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="pg-drawer__header">
          <div>
            <h2 id="pg-drawer-title" className="pg-drawer__title">
              {title}
            </h2>
            {subtitle ? <p className="pg-drawer__subtitle">{subtitle}</p> : null}
          </div>
          <IconButton label="Close drawer" onClick={onClose}>
            <FiX />
          </IconButton>
        </header>
        <div className="pg-drawer__body">{children}</div>
        {footer ? <footer className="pg-drawer__footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
