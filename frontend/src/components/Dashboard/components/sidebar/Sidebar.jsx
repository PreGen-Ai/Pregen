import React, { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  FiAward,
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiCpu,
  FiFlag,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiPenTool,
  FiShield,
  FiSliders,
  FiUsers,
} from "react-icons/fi";

import { clearActiveTenantId } from "../../../../services/api/http.js";
import { useAuthContext } from "../../../../context/AuthContext";
import useActiveTenantScope from "../../hooks/useActiveTenantScope.js";
import { dashboardNav } from "../../nav/dashboardNav";
import { ROLES, normalizeRole } from "../../nav/roles";

const ICONS = {
  practiceLab: FiPenTool,
  assignmentsTake: FiClipboard,
  quizzesTake: FiAward,
  materials: FiBookOpen,
  assignmentsManage: FiClipboard,
  quizzesManage: FiAward,
  announcements: FiBell,
  gradebook: FiBarChart2,
  aiTutor: FiCpu,
  users: FiUsers,
  workspace: FiLayers,
  subjects: FiBookOpen,
  branding: FiSliders,
  tenantAiControls: FiCpu,
  schoolAnalytics: FiBarChart2,
  platformAnalytics: FiGrid,
  tenants: FiShield,
  platformAiControls: FiCpu,
  aiCost: FiBarChart2,
  audit: FiFlag,
  selectedSchoolUsers: FiUsers,
  selectedSchoolWorkspace: FiLayers,
  selectedSchoolSubjects: FiBookOpen,
  selectedSchoolBranding: FiSliders,
  selectedSchoolAiControls: FiCpu,
  selectedSchoolAnalytics: FiBarChart2,
};

function formatRole(role) {
  if (role === ROLES.SUPERADMIN) return "Super Admin";
  if (!role) return "Student";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function userInitials(user) {
  const source =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.username ||
    user?.email ||
    "PG";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function displayName(user) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.username ||
    user?.email ||
    "PreGen User"
  );
}

function SidebarSection({ section, activeTenantId, collapsed, onNavigate }) {
  return (
    <div className="pg-sidebar__section">
      <div className="pg-sidebar__section-title">{section.section}</div>
      {section.helper ? (
        <div className="pg-sidebar__helper">{section.helper}</div>
      ) : null}

      {section.items.map((item) => {
        const Icon = ICONS[item.key] || FiGrid;
        const isDisabled = item.requiresActiveTenant && !activeTenantId;

        if (isDisabled) {
          return (
            <span
              key={item.key}
              className="pg-nav-item is-disabled"
              role="link"
              aria-disabled="true"
              title="Select a school from Schools to unlock this area"
            >
              <span className="pg-nav-item__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="pg-nav-item__text">{item.label}</span>
            </span>
          );
        }

        return (
          <NavLink
            key={item.key}
            to={item.to}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `pg-nav-item ${isActive ? "is-active" : ""}`
            }
          >
            <span className="pg-nav-item__icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="pg-nav-item__text">{item.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}) {
  const { user, logout } = useAuthContext();
  const role = normalizeRole(user?.role);
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

  const isSuperAdmin = role === ROLES.SUPERADMIN;
  const selectedSchoolLabel = activeTenantName || activeTenantId || "";

  const clearSchoolContext = () => {
    clearActiveTenantId();
    onNavigate?.();
    navigate("/dashboard/superadmin/analytics");
  };

  const goToSchools = () => {
    onNavigate?.();
    navigate("/dashboard/superadmin/tenants");
  };

  return (
    <aside className="pg-sidebar" aria-label="Dashboard navigation">
      <div className="pg-sidebar__brand">
        <span className="pg-sidebar__mark" aria-hidden="true">
          P
        </span>
        <span className="pg-sidebar__wordmark">PreGen LMS</span>
      </div>

      <div className="pg-sidebar__profile">
        <span className="pg-avatar" aria-hidden="true">
          {userInitials(user)}
        </span>
        <div className="pg-sidebar__user">
          <div className="pg-sidebar__name">{displayName(user)}</div>
          <div className="pg-sidebar__role">{formatRole(role)}</div>
        </div>
        <span className="pg-plan-badge">LMS</span>
      </div>

      {isSuperAdmin ? (
        <div className="pg-school-scope">
          <div className="pg-school-scope__label">Selected School</div>
          {activeTenantId ? (
            <>
              <div className="pg-school-scope__title">{selectedSchoolLabel}</div>
              <div className="pg-school-scope__meta">
                {activeTenantName ? activeTenantId : "School tools active"}
              </div>
              <button
                type="button"
                className="pg-school-scope__button"
                onClick={clearSchoolContext}
              >
                Return to Platform
              </button>
            </>
          ) : (
            <>
              <div className="pg-school-scope__title">No school selected</div>
              <button
                type="button"
                className="pg-school-scope__button"
                onClick={goToSchools}
              >
                Choose School
              </button>
            </>
          )}
        </div>
      ) : null}

      <nav className="pg-sidebar__nav">
        {sections.map((section) => (
          <SidebarSection
            key={section.section}
            section={section}
            activeTenantId={activeTenantId}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="pg-sidebar__footer">
        <button
          className="pg-sidebar__logout"
          type="button"
          onClick={logout}
          title={collapsed ? "Sign out" : undefined}
        >
          <FiLogOut aria-hidden="true" />
          <span>Sign out</span>
        </button>
        <button
          className="pg-sidebar__collapse"
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
          <span>{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </div>
    </aside>
  );
}
