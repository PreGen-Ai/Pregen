// src/components/Dashboard/nav/Sidebar.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuthContext } from "../../../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Offcanvas } from "react-bootstrap";

import {
  FaRobot,
  FaChartLine,
  FaClipboardList,
  FaGraduationCap,
  FaTasks,
  FaBrain,
  FaUsers,
  FaUserShield,
  FaBuilding,
  FaFileAlt,
  FaPalette,
  FaFlag,
  FaMoneyBillWave,
  FaServer,
  FaCog,
} from "react-icons/fa";
import { BsBookHalf } from "react-icons/bs";
import { FiMenu, FiLogOut } from "react-icons/fi";

import "../../styles/Sidebar.css";

// ✅ match backend canonical roles: STUDENT, TEACHER, ADMIN, SUPERADMIN, PARENT
const normalizeRole = (raw) => {
  const up = String(raw || "STUDENT")
    .trim()
    .toUpperCase();

  if (up === "SUPER_ADMIN" || up === "SUPERADMIN" || up === "SUPER-ADMIN") {
    return "SUPERADMIN";
  }

  return up;
};

const Sidebar = () => {
  const { user, isAuthenticated, loading, logout } = useAuthContext();
  const location = useLocation();

  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = useMemo(() => normalizeRole(user?.role), [user?.role]);
  const isSuperAdmin = role === "SUPERADMIN";
  const isAdmin = role === "ADMIN";
  const isTeacher = role === "TEACHER";
  const isParent = role === "PARENT";
  const isAdminMode = isAdmin || isSuperAdmin;

  const isActive = useCallback(
    (path) =>
      location.pathname === path || location.pathname.startsWith(path + "/"),
    [location.pathname],
  );

  const displayName = useMemo(() => {
    if (!user?.username && !user?.email) return "Guest";
    return (user?.username || user?.name || "User").replace(/^./, (c) =>
      String(c).toUpperCase(),
    );
  }, [user]);

  const formattedRole = useMemo(() => {
    if (!role) return "Guest";
    if (role === "SUPERADMIN") return "Super Admin";
    return role.charAt(0) + role.slice(1).toLowerCase();
  }, [role]);

  // close mobile drawer on route change
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ===== Links (wired to your actual pages) =====
  const navLinks = useMemo(() => {
    // Superadmin + Admin
    if (isAdminMode) {
      const adminBase = [
        { label: "Users", icon: <FaUsers />, path: "/dashboard/admin/users" },
        {
          label: "Workspace",
          icon: <FaBuilding />,
          path: "/dashboard/admin/workspace",
        },
        {
          label: "Branding",
          icon: <FaPalette />,
          path: "/dashboard/admin/branding",
        },
        {
          label: "AI Controls",
          icon: <FaRobot />,
          path: "/dashboard/admin/ai-controls",
        },
        {
          label: "Analytics",
          icon: <FaChartLine />,
          path: "/dashboard/admin/analytics",
        },
      ];

      if (isSuperAdmin) {
        return [
          {
            label: "Super Dashboard",
            icon: <FaUserShield />,
            path: "/dashboard/superadmin/dashboard",
          },
          ...adminBase,
          {
            label: "Tenants",
            icon: <FaBuilding />,
            path: "/dashboard/superadmin/tenants",
          },
          {
            label: "AI Cost",
            icon: <FaMoneyBillWave />,
            path: "/dashboard/superadmin/ai-cost",
          },
          {
            label: "Feature Flags",
            icon: <FaFlag />,
            path: "/dashboard/superadmin/feature-flags",
          },
          {
            label: "Audit Logs",
            icon: <FaServer />,
            path: "/dashboard/superadmin/audit",
          },
          {
            label: "Quiz Report PDF",
            icon: <FaFileAlt />,
            path: "/dashboard/reports/quiz",
          },
          {
            label: "Settings",
            icon: <FaCog />,
            path: "/dashboard/settings",
          },
        ];
      }

      // Admin only
      return [
        ...adminBase,
        {
          label: "Quiz Report PDF",
          icon: <FaFileAlt />,
          path: "/dashboard/reports/quiz",
        },
        {
          label: "Settings",
          icon: <FaCog />,
          path: "/dashboard/settings",
        },
      ];
    }

    // Parent
    if (isParent) {
      return [
        {
          label: "Portal",
          icon: <FaGraduationCap />,
          path: "/dashboard/parent",
        },
        { label: "Settings", icon: <FaCog />, path: "/dashboard/settings" },
      ];
    }

    // Teacher
    if (isTeacher) {
      return [
        {
          label: "Portal",
          icon: <FaGraduationCap />,
          path: "/dashboard/teacher",
        },
        {
          label: "Assignments",
          icon: <FaTasks />,
          path: "/dashboard/teacher/assignments",
        },
        {
          label: "Quizzes",
          icon: <FaClipboardList />,
          path: "/dashboard/teacher/quizzes",
        },
        { label: "AI Tutor", icon: <FaRobot />, path: "/dashboard/ai-tutor" },
        {
          label: "My Classes",
          icon: <BsBookHalf />,
          path: "/dashboard/my-classes",
        },
        {
          label: "Quiz Report PDF",
          icon: <FaFileAlt />,
          path: "/dashboard/reports/quiz",
        },
        { label: "Settings", icon: <FaCog />, path: "/dashboard/settings" },
      ];
    }

    // Student (and guest fallback)
    const studentBase = [
      { label: "Home", icon: <FaGraduationCap />, path: "/dashboard" },
      {
        label: "My Classes",
        icon: <BsBookHalf />,
        path: "/dashboard/my-classes",
      },
      { label: "AI Tutor", icon: <FaRobot />, path: "/dashboard/ai-tutor" },
      {
        label: "Assignments",
        icon: <FaTasks />,
        path: "/dashboard/assignments",
      },
      {
        label: "Quizzes",
        icon: <FaClipboardList />,
        path: "/dashboard/quizzes",
      },
      {
        label: "Practice Lab",
        icon: <FaBrain />,
        path: "/dashboard/practice-lab",
      },
      { label: "Settings", icon: <FaCog />, path: "/dashboard/settings" },
    ];

    if (!isAuthenticated) {
      // Guest: keep only safe pages
      return studentBase.filter((l) => ["Home", "AI Tutor"].includes(l.label));
    }

    return studentBase;
  }, [isAuthenticated, isAdminMode, isParent, isTeacher, isSuperAdmin]);

  // ===== Animations =====
  const sidebarVariants = {
    open: {
      width: 250,
      transition: { type: "spring", stiffness: 220, damping: 20 },
    },
    closed: {
      width: 72,
      transition: { type: "spring", stiffness: 220, damping: 20 },
    },
  };

  const itemVariants = { hover: { scale: 1.01 }, tap: { scale: 0.98 } };

  if (loading) {
    return (
      <aside className="pg-sidebar pg-sidebar--loading">
        <div className="pg-skeleton">
          <div className="pg-skeleton__line w70" />
          <div className="pg-skeleton__line w50" />
          <div className="pg-skeleton__line w85" />
          <div className="pg-skeleton__line w60" />
        </div>
      </aside>
    );
  }

  const renderInner = ({ isMobile = false } = {}) => (
    <>
      {/* Header */}
      <div className="pg-sidebar__header">
        {open && !isMobile ? (
          <>
            <div className="pg-sidebar__identity">
              <div className="pg-sidebar__name">
                {isAuthenticated ? displayName : "Guest"}
              </div>
              <div className="pg-sidebar__sub">
                {isAuthenticated ? `Role: ${formattedRole}` : "Not logged in"}
              </div>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="pg-sidebar__toggle"
              aria-label="Collapse sidebar"
              type="button"
            >
              <FiMenu size={20} />
            </button>
          </>
        ) : !isMobile ? (
          <button
            onClick={() => setOpen(true)}
            className="pg-sidebar__toggle pg-sidebar__toggle--full"
            aria-label="Expand sidebar"
            type="button"
          >
            <FiMenu size={20} />
          </button>
        ) : (
          <div className="pg-sidebar__identity pg-sidebar__identity--mobile">
            <div className="pg-sidebar__name">
              {isAuthenticated ? displayName : "Guest"}
            </div>
            <div className="pg-sidebar__sub">
              {isAuthenticated ? `Role: ${formattedRole}` : "Not logged in"}
            </div>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="pg-sidebar__nav">
        {isAdminMode && (open || isMobile) ? (
          <div className="pg-sidebar__sectionLabel">
            <FaUserShield className="pg-sidebar__sectionIcon" />
            <span>{isSuperAdmin ? "Super Admin" : "Admin"}</span>
          </div>
        ) : null}

        <div className="pg-sidebar__menu">
          {navLinks.map((item) => {
            const active = isActive(item.path);

            return (
              <motion.div
                key={item.label}
                variants={itemVariants}
                whileHover="hover"
                whileTap="tap"
                className={`pg-sidebar__item ${active ? "active" : ""}`}
              >
                <NavLink
                  to={item.path}
                  className="pg-sidebar__link"
                  onClick={() => isMobile && setMobileOpen(false)}
                >
                  <span className="pg-sidebar__icon">{item.icon}</span>

                  <AnimatePresence>
                    {(open || isMobile) && (
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="pg-sidebar__text"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>

                {active ? (
                  <motion.span
                    layoutId={
                      isMobile
                        ? "pg-sidebar-active-indicator-mobile"
                        : "pg-sidebar-active-indicator"
                    }
                    className="pg-sidebar__activeBar"
                  />
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="pg-sidebar__footer">
        {isAuthenticated ? (
          <motion.button
            variants={itemVariants}
            whileHover="hover"
            whileTap="tap"
            className="pg-sidebar__logout"
            type="button"
            onClick={logout}
            title="Logout"
          >
            <span className="pg-sidebar__icon">
              <FiLogOut />
            </span>

            <AnimatePresence>
              {(open || isMobile) && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="pg-sidebar__text"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        ) : null}

        <div className="pg-sidebar__copyright">
          {open || isMobile ? "© 2026 PreGen" : "©"}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={open ? "open" : "closed"}
        variants={sidebarVariants}
        className={`pg-sidebar d-none d-lg-flex ${open ? "is-open" : "is-closed"}`}
      >
        {renderInner({ isMobile: false })}
      </motion.aside>

      {/* Mobile sidebar (Offcanvas) */}
      <Offcanvas
        show={mobileOpen}
        onHide={() => setMobileOpen(false)}
        placement="start"
        className="pg-sidebar-offcanvas d-lg-none"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Menu</Offcanvas.Title>
        </Offcanvas.Header>

        <Offcanvas.Body className="pg-sidebar-offcanvas-body">
          <div className="pg-sidebar pg-sidebar--mobile">
            {renderInner({ isMobile: true })}
          </div>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default React.memo(Sidebar);
