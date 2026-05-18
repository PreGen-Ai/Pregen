import React from "react";
import { Outlet } from "react-router-dom";
import AppShell from "./AppShell";

export default function DashboardLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
