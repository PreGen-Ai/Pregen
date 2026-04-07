import React, { Suspense, lazy } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/sidebar/Sidebar";
import "./DashboardShell.css";
const NavBar = lazy(() => import("../../Home/Navbar")); // adjust path if needed

export default function DashboardLayout() {
  return (
    <>
      <Suspense fallback={null}>
        <NavBar />
      </Suspense>

      <div className="dash-shell">
        <Sidebar />

        <div className="dashboard-main">
          <main className="dash-main">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
