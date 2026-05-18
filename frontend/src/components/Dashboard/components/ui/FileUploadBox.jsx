import React from "react";
import { FiUploadCloud } from "react-icons/fi";

export default function FileUploadBox({
  id,
  multiple = false,
  accept,
  onChange,
  fileNames,
}) {
  const names = Array.isArray(fileNames) ? fileNames.filter(Boolean) : [];

  return (
    <label className="pg-upload-box" htmlFor={id}>
      <span className="pg-upload-box__icon">
        <FiUploadCloud />
      </span>
      <span className="pg-upload-box__title">
        {names.length ? names.join(", ") : "Browse or drag and drop files"}
      </span>
      <span className="pg-upload-box__meta">PNG, JPG, DOCX, PDF max 10MB</span>
      <input
        id={id}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={onChange}
      />
    </label>
  );
}
