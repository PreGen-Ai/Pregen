import React, { Suspense, lazy } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/sidebar/Sidebar";
import "./DashboardShell.css";
const NavBar = lazy(() => import("../../Home/Navbar")); // adjust path if needed

export default function DashboardLayout() {
  return (
    <div className="dash-shell">
      <Sidebar />

      <div className="dashboard-main">
        <Suspense fallback={null}>
          <NavBar />
        </Suspense>

        <main className="dash-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
