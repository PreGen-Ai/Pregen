import React from "react";

export function FormField({
  id,
  label,
  helper,
  error,
  success,
  children,
  className = "",
}) {
  const message = error || success || helper;

  return (
    <div className={`pg-field ${className}`.trim()}>
      {label ? (
        <label className="pg-field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      {message ? (
        <div
          className={`pg-field__help ${
            error ? "is-error" : success ? "is-success" : ""
          }`}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={`pg-input ${className}`.trim()} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`pg-input ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`pg-input ${className}`.trim()} {...props} />;
}

export default FormField;
