import React, { useEffect, useRef, useState } from "react";
import { FiMoreVertical } from "react-icons/fi";

export default function DropdownMenu({ items, label = "Actions" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="pg-dropdown" ref={ref}>
      <button
        className="pg-icon-button"
        type="button"
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <FiMoreVertical />
      </button>
      {open ? (
        <div className="pg-dropdown__menu" role="menu">
          {items
            .filter(Boolean)
            .map((item) => (
              <button
                key={item.label}
                className="pg-dropdown__item"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
