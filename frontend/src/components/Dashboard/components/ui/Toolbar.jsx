import React from "react";
import { FiFilter, FiSearch } from "react-icons/fi";
import Button from "./Button";

export default function Toolbar({
  dateValue,
  onDateChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search",
  onFilter,
  left,
  right,
}) {
  return (
    <div className="pg-toolbar">
      <div className="pg-toolbar__left">
        {left}
        {onDateChange ? (
          <input
            className="pg-input"
            type="date"
            value={dateValue || ""}
            onChange={(event) => onDateChange(event.target.value)}
            aria-label="Select date range"
          />
        ) : null}
      </div>
      <div className="pg-toolbar__right">
        {onSearchChange ? (
          <div style={{ position: "relative" }}>
            <FiSearch
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 10,
                top: 10,
                color: "var(--pg-text-muted)",
                width: 15,
                height: 15,
              }}
            />
            <input
              className="pg-search"
              style={{ paddingLeft: 32 }}
              type="search"
              value={searchValue || ""}
              placeholder={searchPlaceholder}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        ) : null}
        {right}
        {onFilter ? (
          <Button variant="secondary" onClick={onFilter}>
            <FiFilter />
            Filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
