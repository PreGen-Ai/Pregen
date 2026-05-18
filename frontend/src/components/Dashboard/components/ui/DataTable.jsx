import React, { useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

export default function DataTable({
  columns,
  rows,
  loading = false,
  emptyMessage = "No data available.",
  getRowKey,
  pageSize = 10,
  itemLabel = "rows",
}) {
  const [page, setPage] = useState(1);
  const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const pageCount = Math.max(1, Math.ceil(safeRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return safeRows.slice(start, start + pageSize);
  }, [currentPage, pageSize, safeRows]);

  const shown = Math.min(currentPage * pageSize, safeRows.length);

  return (
    <section className="pg-table-card">
      <div className="pg-table-scroll">
        <table className="pg-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          {!loading && safeRows.length ? (
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={getRowKey ? getRowKey(row) : row._id || row.id || index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render ? column.render(row, index) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      </div>

      {loading ? (
        <div className="pg-table-loading">Loading {itemLabel}...</div>
      ) : !safeRows.length ? (
        <div className="pg-table-empty">{emptyMessage}</div>
      ) : null}

      <footer className="pg-table-footer">
        <span>
          Show {shown} of {safeRows.length} {itemLabel}
        </span>
        <div className="pg-pagination" aria-label="Pagination">
          <button
            className="pg-page-btn"
            type="button"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <FiChevronLeft />
          </button>
          {Array.from({ length: pageCount }).slice(0, 5).map((_, index) => {
            const pageNumber = index + 1;
            return (
              <button
                key={pageNumber}
                className={`pg-page-btn ${currentPage === pageNumber ? "is-active" : ""}`}
                type="button"
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            );
          })}
          {pageCount > 5 ? <span className="pg-table__muted">...</span> : null}
          <button
            className="pg-page-btn"
            type="button"
            aria-label="Next page"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            <FiChevronRight />
          </button>
        </div>
      </footer>
    </section>
  );
}
