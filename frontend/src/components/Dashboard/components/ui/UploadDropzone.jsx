import React, { useState } from "react";
import { FiUploadCloud, FiX } from "react-icons/fi";
import IconButton from "./IconButton";

function formatSize(file) {
  if (!file?.size) return "";
  if (file.size < 1024 * 1024) return `${Math.round(file.size / 1024)} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadDropzone({
  id,
  accept,
  multiple = false,
  files = [],
  onChange,
  onRemove,
  state = "empty",
  error,
  helper = "Up to 5 files. Max file size: 10 MB each.",
}) {
  const [dragging, setDragging] = useState(false);
  const safeFiles = Array.isArray(files) ? files : files ? [files] : [];
  const tone = error ? "error" : dragging ? "dragging" : state;

  const handleFiles = (fileList) => {
    onChange?.(multiple ? Array.from(fileList || []) : fileList?.[0] || null);
  };

  return (
    <div className={`pg-upload-dropzone is-${tone}`}>
      <label
        className="pg-upload-dropzone__target"
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <span className="pg-upload-dropzone__icon">
          <FiUploadCloud />
        </span>
        <span className="pg-upload-dropzone__title">
          Browse or drag and drop files
        </span>
        <span className="pg-upload-dropzone__helper">{error || helper}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </label>

      {safeFiles.length ? (
        <div className="pg-upload-dropzone__files">
          {safeFiles.map((file, index) => (
            <div className="pg-upload-file" key={`${file.name}-${index}`}>
              <div>
                <div className="pg-upload-file__name">{file.name}</div>
                <div className="pg-upload-file__meta">
                  {[file.type || "File", formatSize(file)].filter(Boolean).join(" · ")}
                </div>
              </div>
              {onRemove ? (
                <IconButton
                  label={`Remove ${file.name}`}
                  onClick={() => onRemove(file, index)}
                >
                  <FiX />
                </IconButton>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
