// src/pages/superadmin/FeatureFlagsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../../../../services/api/api.js";
import { FaExclamationTriangle, FaSyncAlt } from "react-icons/fa";

/**
 * MVP behavior:
 * - GET flags from: /api/admin/system/super/feature-flags
 * - UI is read-only until you add PATCH endpoints
 */

const Pill = ({ children, tone = "neutral" }) => {
  const cls =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-950/40 dark:text-yellow-200"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          : "border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";

  return (
    <span className={`px-2 py-1 rounded-full text-xs border ${cls}`}>
      {children}
    </span>
  );
};

const Toggle = ({ checked, disabled = true }) => (
  <button
    type="button"
    disabled={disabled}
    aria-disabled={disabled}
    className={[
      "relative inline-flex h-6 w-11 items-center rounded-full border transition",
      "dark:border-gray-800",
      checked ? "bg-gray-900 dark:bg-white" : "bg-gray-200 dark:bg-gray-800",
      disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
    ].join(" ")}
    title={
      disabled ? "Read-only until backend update endpoints exist" : "Toggle"
    }
  >
    <span
      className={[
        "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
        "dark:bg-gray-950",
        checked ? "translate-x-5" : "translate-x-1",
      ].join(" ")}
    />
  </button>
);

const ErrorPanel = ({ message }) => {
  if (!message) return null;
  return (
    <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-700">
      <div className="font-semibold flex items-center gap-2">
        <FaExclamationTriangle /> {message}
      </div>
      <div className="text-xs opacity-80 mt-2">
        Expected endpoint: <code>/api/admin/system/super/feature-flags</code>
      </div>
      <div className="text-xs opacity-80 mt-1">
        If this is 401, confirm request has{" "}
        <code>Authorization: Bearer ...</code>.
      </div>
    </div>
  );
};

export default function FeatureFlagsPage() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState([]);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");

  const [sortKey, setSortKey] = useState("updatedAt"); // updatedAt | key | overrides
  const [sortDir, setSortDir] = useState("desc");

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      // ✅ Backend: GET /api/admin/system/super/feature-flags
      const data = await api.admin.listFeatureFlags();

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];

      setFlags(items);
    } catch (e) {
      setError(e?.message || "Unable to load feature flags.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const s = scope.toLowerCase();

    return flags.filter((f) => {
      const okScope =
        s === "all" ? true : String(f.scope || "").toLowerCase() === s;

      const okQuery =
        !needle ||
        String(f.key || "")
          .toLowerCase()
          .includes(needle) ||
        String(f.description || "")
          .toLowerCase()
          .includes(needle);

      return okScope && okQuery;
    });
  }, [flags, q, scope]);

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortKey === "overrides") {
        return (
          ((a.tenantOverridesCount || 0) - (b.tenantOverridesCount || 0)) * mul
        );
      }

      if (sortKey === "updatedAt") {
        const ad = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bd = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return (ad - bd) * mul;
      }

      // key
      return String(a.key || "").localeCompare(String(b.key || "")) * mul;
    });
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    let globalCount = 0;
    let tenantCount = 0;
    let enabledDefaults = 0;

    for (const f of flags) {
      const sc = String(f.scope || "").toLowerCase();
      if (sc === "global") globalCount += 1;
      if (sc === "tenant") tenantCount += 1;
      if (f.defaultEnabled) enabledDefaults += 1;
    }

    return { globalCount, tenantCount, enabledDefaults };
  }, [flags]);

  const onSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    setSortDir(sortDir === "desc" ? "asc" : "desc");
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text));
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Feature Flags</h1>
          <p className="opacity-80 text-sm">
            Safe rollouts and tenant-based configuration.
          </p>

          <div className="flex flex-wrap gap-2 mt-2">
            <Pill>{stats.globalCount} global</Pill>
            <Pill>{stats.tenantCount} tenant</Pill>
            <Pill>{stats.enabledDefaults} default enabled</Pill>
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950"
          disabled={loading}
        >
          <FaSyncAlt />
          Refresh
        </button>
      </div>

      <div className="p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex gap-2 flex-col md:flex-row md:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
              placeholder="Search by key or description"
            />

            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
            >
              <option value="all">All scopes</option>
              <option value="global">Global</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <Pill>{sorted.length} shown</Pill>
            <Pill>{flags.length} total</Pill>
          </div>
        </div>

        <ErrorPanel message={error} />

        {loading ? (
          <div className="opacity-70">Loading…</div>
        ) : (
          <div className="overflow-auto rounded-xl border dark:border-gray-800">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="opacity-70 bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th
                    className="text-left p-2 cursor-pointer select-none"
                    onClick={() => onSort("key")}
                  >
                    Key{" "}
                    {sortKey === "key" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                  </th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-left p-2">Default</th>
                  <th
                    className="text-right p-2 cursor-pointer select-none"
                    onClick={() => onSort("overrides")}
                  >
                    Overrides{" "}
                    {sortKey === "overrides"
                      ? sortDir === "desc"
                        ? "↓"
                        : "↑"
                      : ""}
                  </th>
                  <th className="text-left p-2">Scope</th>
                  <th
                    className="text-left p-2 cursor-pointer select-none"
                    onClick={() => onSort("updatedAt")}
                  >
                    Updated{" "}
                    {sortKey === "updatedAt"
                      ? sortDir === "desc"
                        ? "↓"
                        : "↑"
                      : ""}
                  </th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {sorted.map((f) => {
                  const sc = String(f.scope || "").toLowerCase();
                  const scopeTone =
                    sc === "global"
                      ? "neutral"
                      : sc === "tenant"
                        ? "warning"
                        : "neutral";

                  return (
                    <tr key={f.key} className="border-t dark:border-gray-800">
                      <td className="p-2">
                        <div className="font-semibold">{f.key}</div>
                        <div className="text-xs opacity-70">{sc || "-"}</div>
                      </td>

                      <td className="p-2">{f.description || "-"}</td>

                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Toggle checked={!!f.defaultEnabled} disabled />
                          <Pill tone={f.defaultEnabled ? "success" : "danger"}>
                            {f.defaultEnabled ? "enabled" : "disabled"}
                          </Pill>
                        </div>
                      </td>

                      <td className="p-2 text-right">
                        {f.tenantOverridesCount ?? 0}
                      </td>

                      <td className="p-2">
                        <Pill tone={scopeTone}>{f.scope || "-"}</Pill>
                      </td>

                      <td className="p-2">
                        {f.updatedAt
                          ? new Date(f.updatedAt).toLocaleString()
                          : "-"}
                      </td>

                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => copy(f.key)}
                          className="text-sm font-semibold underline"
                          title="Copy key"
                        >
                          Copy
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {sorted.length === 0 ? (
                  <tr>
                    <td className="p-3 opacity-70" colSpan={7}>
                      No flags match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs opacity-70">
          Updates (default enable, tenant overrides, kill switches) should be
          wired after backend PATCH endpoints exist.
        </div>
      </div>
    </div>
  );
}
