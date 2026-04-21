import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import api from "../services/api/api.js";
import AICostPage from "../components/Dashboard/pages/SuperAdmin/AICostPage.jsx";
import AuditLogsPage from "../components/Dashboard/pages/SuperAdmin/AuditLogsPage.jsx";
import FeatureFlagsPage from "../components/Dashboard/pages/SuperAdmin/FeatureFlagsPage.jsx";
import SuperDashboardPage from "../components/Dashboard/pages/SuperAdmin/SuperDashboardPage.jsx";
import AnalyticsReportsPage from "../pages/tools/AnalyticsReportsPage.jsx";

jest.mock("react-toastify", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("../services/api/api.js", () => ({
  __esModule: true,
  default: {
    admin: {
      getAnalyticsSummary: jest.fn(),
      exportAnalytics: jest.fn(),
      listTenants: jest.fn(),
      getAiRequestsSummary: jest.fn(),
      listAiRequests: jest.fn(),
      getAICost: jest.fn(),
      listFeatureFlags: jest.fn(),
      superOverview: jest.fn(),
      listAuditLogs: jest.fn(),
    },
  },
}));

describe("superadmin analytics pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    api.admin.listTenants.mockResolvedValue({ items: [] });
    api.admin.getAiRequestsSummary.mockResolvedValue({
      summary: {
        requests: { value: null, state: "no_data", label: "No AI activity yet" },
        totalTokens: { value: null, state: "no_data", label: "No token data yet" },
        avgLatencyMs: { value: null, state: "no_data", label: "No latency data yet" },
        cacheHitRate: { value: null, state: "no_data", label: "No cache data" },
      },
      sourceStatus: {},
    });
    api.admin.listAiRequests.mockResolvedValue({
      state: "logging_inactive",
      label: "No AI activity yet",
      items: [],
      meta: { total: 0, limit: 50, skip: 0 },
    });
    api.admin.getAICost.mockResolvedValue({
      summary: {
        requests: { value: null, state: "no_data", label: "No AI activity yet" },
        totalTokens: { value: null, state: "no_data", label: "No token data yet" },
        estimatedCost: { value: null, state: "logging_inactive", label: "Cost logging not available yet" },
      },
      charts: {
        requestsOverTime: { state: "no_data", label: "No AI activity yet", points: [] },
        costOverTime: { state: "logging_inactive", label: "Cost logging not available yet", points: [] },
        latencyOverTime: { state: "no_data", label: "No latency data yet", points: [] },
        usageByTenant: { state: "no_data", label: "No tenant usage data yet", points: [] },
      },
      byTenant: [],
      byFeature: [],
      sourceStatus: {},
    });
    api.admin.listFeatureFlags.mockResolvedValue({
      state: "no_data",
      label: "No feature flags have been created yet",
      items: [],
      meta: { updatesSupported: false },
    });
    api.admin.superOverview.mockResolvedValue({
      metrics: {
        activeTenants: { value: 3, state: "ok", label: "Active tenants available" },
        totalStudents: { value: 120, state: "ok", label: "Student totals available" },
        aiCalls24h: { value: null, state: "logging_inactive", label: "No AI activity yet" },
        costToday: { value: null, state: "logging_inactive", label: "Cost logging not available yet" },
        costMTD: { value: null, state: "logging_inactive", label: "Cost logging not available yet" },
        p95LatencyMs: { value: null, state: "no_data", label: "No latency data yet" },
        errors24h: { value: null, state: "logging_inactive", label: "Audit logging has no events yet" },
      },
      health: {
        state: "partial_telemetry",
        label: "Platform is up, but telemetry is only partially available",
      },
      sourceStatus: {
        aiProvider: { state: "ok", label: "AI provider connected" },
        aiLogging: { state: "logging_inactive", label: "No AI telemetry observed yet" },
        auditLogging: { state: "logging_inactive", label: "No audit events observed yet" },
      },
      alerts: { state: "no_data", label: "No recent spikes detected", items: [] },
    });
    api.admin.listAuditLogs.mockResolvedValue({
      state: "logging_inactive",
      label: "No audit logs recorded yet",
      items: [],
      meta: { totalAuditLogs: 0 },
    });
  });

  test("AnalyticsReportsPage renders no-data labels instead of zeros", async () => {
    api.admin.getAnalyticsSummary.mockResolvedValue({
      generatedAt: "2026-04-21T10:00:00.000Z",
      summary: {
        avgScore: { value: null, state: "no_data", label: "No grading data yet" },
        aiGraded: { value: null, state: "no_data", label: "No AI grading activity yet" },
        aiRequests: { value: null, state: "no_data", label: "No AI activity yet" },
        activeTeachers: { value: null, state: "no_data", label: "No teacher activity in this range" },
      },
    });

    render(<AnalyticsReportsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No grading data yet").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("No teacher activity in this range").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0%$/)).not.toBeInTheDocument();
  });

  test("AICostPage shows truthful empty-state labels for missing telemetry", async () => {
    render(<AICostPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No AI activity yet").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("No cache data").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Generate a quiz, run AI grading, or open AI tutor, then refresh after activity\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("0 ms")).not.toBeInTheDocument();
  });

  test("FeatureFlagsPage keeps empty state explicit and read-only", async () => {
    render(<FeatureFlagsPage />);

    await waitFor(() => {
      expect(screen.getByText("Read-only mode")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText("No feature flags have been created yet").length).toBeGreaterThan(0);
    });
    expect(
      screen.getByText(/Update and rollout endpoints are not wired yet/i),
    ).toBeInTheDocument();
  });

  test("SuperDashboardPage surfaces partial telemetry instead of healthy defaults", async () => {
    render(
      <MemoryRouter>
        <SuperDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("No AI activity yet").length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Platform is up, but telemetry is only partially available/i)).toBeInTheDocument();
    expect(screen.getByText("No AI telemetry observed yet")).toBeInTheDocument();
  });

  test("AuditLogsPage shows audit empty state instead of a fake populated table", async () => {
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No audit logs recorded yet").length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Audit logging has not recorded matching events yet\./i)).toBeInTheDocument();
  });
});
