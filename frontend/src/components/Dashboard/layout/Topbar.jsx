import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { FiBell, FiHelpCircle, FiMenu, FiUser } from "react-icons/fi";

const LABELS = [
  ["/dashboard/practice-lab", "Practice Lab"],
  ["/dashboard/assignments", "Assignments"],
  ["/dashboard/teacher/assignments", "Assignments"],
  ["/dashboard/quizzes", "Quizzes"],
  ["/dashboard/teacher/quizzes", "Quiz Builder"],
  ["/dashboard/materials", "Materials"],
  ["/dashboard/announcements", "Announcements"],
  ["/dashboard/grades", "Grades"],
  ["/dashboard/ai-tutor", "AI Tutor"],
  ["/dashboard/teacher", "Teacher Dashboard"],
  ["/dashboard/admin/users", "Users"],
  ["/dashboard/admin/workspace", "Academic Structure"],
  ["/dashboard/admin/subjects", "Subjects"],
  ["/dashboard/admin/branding", "Branding"],
  ["/dashboard/admin/ai-controls", "LLM Settings"],
  ["/dashboard/admin/analytics", "Reports"],
  ["/dashboard/superadmin/tenants", "Schools"],
  ["/dashboard/superadmin/ai-controls", "Platform LLM"],
  ["/dashboard/superadmin/ai-cost", "AI Usage"],
  ["/dashboard/superadmin/audit", "Audit Logs"],
  ["/dashboard/superadmin/analytics", "Platform Analytics"],
];

export default function Topbar({ onMenu }) {
  const location = useLocation();
  const label = useMemo(() => {
    const match = LABELS.find(([path]) => location.pathname.startsWith(path));
    return match?.[1] || "Dashboard";
  }, [location.pathname]);

  return (
    <header className="pg-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="pg-icon-button pg-mobile-menu" type="button" onClick={onMenu} aria-label="Open navigation">
          <FiMenu />
        </button>
        <p className="pg-topbar__label">
          <span>PreGen</span>
          <span aria-hidden="true">/</span>
          <strong>{label}</strong>
        </p>
      </div>
      <div className="pg-topbar__actions" aria-label="Account tools">
        <button className="pg-icon-button" type="button" aria-label="Notifications">
          <FiBell />
        </button>
        <button className="pg-icon-button" type="button" aria-label="Help">
          <FiHelpCircle />
        </button>
        <button className="pg-icon-button" type="button" aria-label="Profile">
          <FiUser />
        </button>
      </div>
    </header>
  );
}
