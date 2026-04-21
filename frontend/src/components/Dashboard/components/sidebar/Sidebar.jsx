import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { clearActiveTenantId } from "../../../../services/api/http.js";
import { useAuthContext } from "../../../../context/AuthContext";
import useActiveTenantScope from "../../hooks/useActiveTenantScope.js";
import { dashboardNav } from "../../nav/dashboardNav";
import { ROLES, normalizeRole } from "../../nav/roles";

import "./Sidebar.css";

function SidebarSection({ section, activeTenantId, onNavigate }) {
  return (
    <div className="dash-sec">
      <div className="dash-sec-title">{section.section}</div>
      {section.helper ? (
        <div className="dash-sec-helper">{section.helper}</div>
      ) : null}

      {section.items.map((item) => {
        const isDisabled = item.requiresActiveTenant && !activeTenantId;

        if (isDisabled) {
          return (
            <div
              key={item.key}
              className="dash-link is-disabled"
              aria-disabled="true"
              title="Select a school from Schools to unlock this area"
            >
              {item.label}
            </div>
          );
        }

        return (
          <NavLink
            key={item.key}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `dash-link ${isActive ? "is-active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuthContext();
  const role = normalizeRole(user?.role);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

  const sections = useMemo(() => {
    return dashboardNav
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          (item.allowedRoles || []).includes(role),
        ),
      }))
      .filter((section) => section.items.length);
  }, [role]);

  const selectedSchoolLabel = activeTenantName || activeTenantId || "";
  const isSuperAdmin = role === ROLES.SUPERADMIN;

  const closeDrawer = () => setOpen(false);

  const clearSchoolContext = () => {
    clearActiveTenantId();
    closeDrawer();
    navigate("/dashboard/superadmin/analytics");
  };

  const goToSchools = () => {
    closeDrawer();
    navigate("/dashboard/superadmin/tenants");
  };

  return (
    <>
      <button
        className="dash-burger"
        onClick={() => setOpen(true)}
        type="button"
        aria-label="Open dashboard navigation"
      >
        Menu
      </button>

      <aside className="dash-sidebar">
        <div className="dash-brand">PreGen LMS</div>

        {isSuperAdmin ? (
          <div className="dash-context-card">
            <div className="dash-context-eyebrow">Selected School</div>
            {activeTenantId ? (
              <>
                <div className="dash-context-title">{selectedSchoolLabel}</div>
                <div className="dash-context-meta">
                  {activeTenantName ? activeTenantId : "School-scoped tools are active."}
                </div>
                <div className="dash-context-actions">
                  <NavLink
                    to="/dashboard/admin/users"
                    className="dash-context-link"
                  >
                    Open School Tools
                  </NavLink>
                  <button
                    type="button"
                    className="dash-context-clear"
                    onClick={clearSchoolContext}
                  >
                    Return to Platform
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="dash-context-title">No school selected</div>
                <div className="dash-context-meta">
                  Choose a school to unlock school-scoped administration, AI
                  controls, branding, and analytics.
                </div>
                <button
                  type="button"
                  className="dash-context-link dash-context-link-button"
                  onClick={goToSchools}
                >
                  Choose a School
                </button>
              </>
            )}
          </div>
        ) : null}

        <nav className="dash-nav">
          {sections.map((section) => (
            <SidebarSection
              key={section.section}
              section={section}
              activeTenantId={activeTenantId}
              onNavigate={closeDrawer}
            />
          ))}
        </nav>
      </aside>

      <div className={`dash-drawer ${open ? "is-open" : ""}`}>
        <div className="dash-drawer-card">
          <div className="dash-drawer-head">
            <div className="dash-brand">PreGen LMS</div>
            <button
              className="dash-x"
              onClick={closeDrawer}
              type="button"
              aria-label="Close dashboard navigation"
            >
              Close
            </button>
          </div>

          {isSuperAdmin ? (
            <div className="dash-context-card dash-context-card-mobile">
              <div className="dash-context-eyebrow">Selected School</div>
              {activeTenantId ? (
                <>
                  <div className="dash-context-title">{selectedSchoolLabel}</div>
                  <div className="dash-context-meta">
                    {activeTenantName ? activeTenantId : "School-scoped tools are active."}
                  </div>
                  <div className="dash-context-actions">
                    <NavLink
                      to="/dashboard/admin/users"
                      onClick={closeDrawer}
                      className="dash-context-link"
                    >
                      Open School Tools
                    </NavLink>
                    <button
                      type="button"
                      className="dash-context-clear"
                      onClick={clearSchoolContext}
                    >
                      Return to Platform
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="dash-context-title">No school selected</div>
                  <div className="dash-context-meta">
                    Choose a school before editing school-scoped settings.
                  </div>
                  <button
                    type="button"
                    className="dash-context-link dash-context-link-button"
                    onClick={goToSchools}
                  >
                    Choose a School
                  </button>
                </>
              )}
            </div>
          ) : null}

          <nav className="dash-nav">
            {sections.map((section) => (
              <SidebarSection
                key={section.section}
                section={section}
                activeTenantId={activeTenantId}
                onNavigate={closeDrawer}
              />
            ))}
          </nav>
        </div>
        <div className="dash-drawer-backdrop" onClick={closeDrawer} />
      </div>
    </>
  );
}
