import React from "react";

export default function Tabs({ tabs, value, onChange }) {
  return (
    <div className="pg-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`pg-tab ${value === tab.value ? "is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
