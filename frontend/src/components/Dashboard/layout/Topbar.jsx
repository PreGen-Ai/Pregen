import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiLogOut, FiMenu, FiUser } from "react-icons/fi";
import { useAuthContext } from "../../../context/AuthContext";

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
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const label = useMemo(() => {
    const match = LABELS.find(([path]) => location.pathname.startsWith(path));
    return match?.[1] || "Dashboard";
  }, [location.pathname]);

  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.username ||
    user?.email ||
    "PreGen User";

  useEffect(() => {
    const closeMenu = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setProfileOpen(false);
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const handleSignOut = async () => {
    setProfileOpen(false);
    await logout?.();
    navigate("/login", { replace: true });
  };

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
        <div className="pg-topbar__menu-wrap" ref={profileMenuRef}>
          <button
            className="pg-icon-button"
            type="button"
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((value) => !value)}
          >
            <FiUser />
          </button>
          {profileOpen ? (
            <div className="pg-profile-menu" role="menu">
              <div className="pg-profile-menu__header">
                <span className="pg-profile-menu__label">Profile</span>
                <strong>{userName}</strong>
                {user?.email ? <span>{user.email}</span> : null}
              </div>
              <button
                className="pg-profile-menu__item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  navigate("/dashboard");
                }}
              >
                <FiUser aria-hidden="true" />
                Profile
              </button>
              <button
                className="pg-profile-menu__item is-destructive"
                type="button"
                role="menuitem"
                onClick={handleSignOut}
              >
                <FiLogOut aria-hidden="true" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
