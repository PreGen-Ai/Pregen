import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { dashboardNav } from "../../nav/dashboardNav";
import { normalizeRole } from "../../nav/roles";
import { useAuthContext } from "../../../../context/AuthContext";
import "./Sidebar.css";

export default function Sidebar() {
  const { user } = useAuthContext();
  const role = normalizeRole(user?.role);
  const [open, setOpen] = useState(false);

  const sections = useMemo(() => {
    return dashboardNav
      .map((sec) => {
        const items = sec.items.filter((it) =>
          (it.allowedRoles || []).includes(role),
        );
        return { ...sec, items };
      })
      .filter((s) => s.items.length);
  }, [role]);

  return (
    <>
      <button className="dash-burger" onClick={() => setOpen(true)} type="button">
        ☰
      </button>

      <aside className="dash-sidebar">
        <div className="dash-brand">PreGen</div>
        <nav className="dash-nav">
          {sections.map((sec) => (
            <div key={sec.section} className="dash-sec">
              <div className="dash-sec-title">{sec.section}</div>
              {sec.items.map((it) => (
                <NavLink key={it.key} to={it.to} className={({isActive}) => `dash-link ${isActive ? "is-active" : ""}` }>
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile drawer */}
      <div className={`dash-drawer ${open ? "is-open" : ""}`}>
        <div className="dash-drawer-card">
          <div className="dash-drawer-head">
            <div className="dash-brand">PreGen</div>
            <button className="dash-x" onClick={() => setOpen(false)} type="button">×</button>
          </div>
          <nav className="dash-nav">
            {sections.map((sec) => (
              <div key={sec.section} className="dash-sec">
                <div className="dash-sec-title">{sec.section}</div>
                {sec.items.map((it) => (
                  <NavLink
                    key={it.key}
                    to={it.to}
                    onClick={() => setOpen(false)}
                    className={({isActive}) => `dash-link ${isActive ? "is-active" : ""}`}
                  >
                    {it.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="dash-drawer-backdrop" onClick={() => setOpen(false)} />
      </div>
    </>
  );
}
