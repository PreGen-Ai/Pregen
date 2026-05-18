import React, { useState } from "react";
import Sidebar from "../components/sidebar/Sidebar";
import Topbar from "./Topbar";
import "./DashboardShell.css";
import "../components/ui/designSystem.css";

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className={`dash-shell ${collapsed ? "is-collapsed" : ""} ${
        mobileOpen ? "is-mobile-open" : ""
      }`}
    >
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen ? (
        <button
          className="dash-drawer-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <div className="dashboard-main">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}
