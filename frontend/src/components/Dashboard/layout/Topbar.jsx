import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { FiBell, FiHelpCircle, FiMenu, FiUser } from "react-icons/fi";

const LABELS = [
  ["/dashboard/practice-lab", "PreGen"],
  ["/dashboard/assignments", "PreGen"],
  ["/dashboard/history", "PreGen"],
  ["/dashboard/quizzes", "PreGen"],
  ["/dashboard/materials", "PreGen"],
  ["/dashboard/announcements", "PreGen"],
  ["/dashboard/grades", "PreGen"],
  ["/dashboard/ai-tutor", "PreGen"],
  ["/dashboard/teacher", "PreGen"],
  ["/dashboard/admin", "PreGen"],
  ["/dashboard/superadmin", "PreGen"],
];

export default function Topbar({ onMenu }) {
  const location = useLocation();
  const label = useMemo(() => {
    const match = LABELS.find(([path]) => location.pathname.startsWith(path));
    return match?.[1] || "PreGen";
  }, [location.pathname]);

  return (
    <header className="pg-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="pg-icon-button pg-mobile-menu" type="button" onClick={onMenu} aria-label="Open navigation">
          <FiMenu />
        </button>
        <p className="pg-topbar__label">{label}</p>
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
