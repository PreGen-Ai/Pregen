import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import api from "../services/api/api.js";
import AdminAIControlsPage from "../components/Dashboard/pages/AdminAIControlsPage.jsx";
import AdminAnalyticsPage from "../components/Dashboard/pages/AdminAnalyticsPage.jsx";
import AICostPage from "../components/Dashboard/pages/SuperAdmin/AICostPage.jsx";
import AuditLogsPage from "../components/Dashboard/pages/SuperAdmin/AuditLogsPage.jsx";
import FeatureFlagsPage from "../components/Dashboard/pages/SuperAdmin/FeatureFlagsPage.jsx";
import SuperAdminAIControlsPage from "../components/Dashboard/pages/SuperAdmin/AIControlsPage.jsx";
import SuperDashboardPage from "../components/Dashboard/pages/SuperAdmin/SuperDashboardPage.jsx";

const mockUseAuthContext = jest.fn();
const mockUseActiveTenantScope = jest.fn();

jest.mock("react-toastify", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("../context/AuthContext.js", () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock("../components/Dashboard/hooks/useActiveTenantScope.js", () => ({
  __esModule: true,
  default: () => mockUseActiveTenantScope(),
}));

jest.mock("../services/api/api.js", () => ({
  __esModule: true,
  default: {
    admin: {
      exportAnalytics: jest.fn(),
      getAiSettings: jest.fn(),
      getAiRequestsSummary: jest.fn(),
      getAICost: jest.fn(),
      getAnalyticsSummary: jest.fn(),
      listAiRequests: jest.fn(),
      listAuditLogs: jest.fn(),
      listFeatureFlags: jest.fn(),
      listTenants: jest.fn(),
      superOverview: jest.fn(),
      updateAiSettings: jest.fn(),
    },
  },
}));

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("admin and superadmin analytics pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuthContext.mockReturnValue({
      user: { role: "SUPERADMIN", tenantId: "platform" },
      isAuthenticated: true,
    });
    mockUseActiveTenantScope.mockReturnValue({ tenantId: "", tenantName: "" });

    api.admin.exportAnalytics.mockResolvedValue(new Blob(["test"]));
    api.admin.getAiSettings.mockResolvedValue({
      settings: {
        enabled: true,
        feedbackTone: "neutral",
        softCapDaily: 50000,
        softCapWeekly: 250000,
        features: {
          aiGrading: true,
          aiQuizGen: true,
          aiTutor: true,
          aiSummaries: true,
        },
      },
    });
    api.admin.listTenants.mockResolvedValue({
      items: [{ tenantId: "north-ridge", name: "North Ridge Academy" }],
    });
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
        estimatedCost: {
          value: null,
          state: "logging_inactive",
          label: "Cost logging not available yet",
        },
      },
      charts: {
        requestsOverTime: { state: "no_data", label: "No AI activity yet", points: [] },
        costOverTime: {
          state: "logging_inactive",
          label: "Cost logging not available yet",
          points: [],
        },
        latencyOverTime: { state: "no_data", label: "No latency data yet", points: [] },
        usageByTenant: { state: "no_data", label: "No school usage data yet", points: [] },
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
        errors24h: {
          value: null,
          state: "logging_inactive",
          label: "Audit logging has no events yet",
        },
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
    api.admin.getAnalyticsSummary.mockResolvedValue({
      generatedAt: "2026-04-21T10:00:00.000Z",
      summary: {
        avgScore: { value: null, state: "no_data", label: "No grading data yet" },
        aiGraded: { value: null, state: "no_data", label: "No AI grading activity yet" },
        aiRequests: { value: null, state: "no_data", label: "No AI activity yet" },
        activeTeachers: { value: null, state: "no_data", label: "No teacher activity in this range" },
      },
    });
  });

  test("AdminAnalyticsPage renders school-scoped no-data labels instead of zeros", async () => {
    mockUseAuthContext.mockReturnValue({
      user: { role: "ADMIN", tenantId: "north-ridge", tenantName: "North Ridge Academy" },
      isAuthenticated: true,
    });

    renderWithRouter(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No grading data yet").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("No teacher activity in this range").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0%$/)).not.toBeInTheDocument();
  });

  test("AdminAIControlsPage keeps school controls gated until a school is selected", async () => {
    renderWithRouter(<AdminAIControlsPage />);

    await waitFor(() => {
      expect(screen.getByText("School AI Controls")).toBeInTheDocument();
    });

    expect(screen.getByText(/Choose a school before editing school-scoped AI controls/i)).toBeInTheDocument();
    expect(screen.getByText(/School AI controls are intentionally separated from platform AI controls/i)).toBeInTheDocument();
  });

  test("SuperAdmin AI controls clearly render platform-default copy", async () => {
    renderWithRouter(<SuperAdminAIControlsPage />);

    await waitFor(() => {
      expect(screen.getByText("Platform AI Controls")).toBeInTheDocument();
    });

    expect(screen.getByText(/Set platform-wide defaults first/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Platform defaults/i).length).toBeGreaterThan(0);
  });

  test("AICostPage shows truthful empty-state labels for missing telemetry", async () => {
    renderWithRouter(<AICostPage />);

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
    renderWithRouter(<FeatureFlagsPage />);

    await waitFor(() => {
      expect(screen.getByText("Read-only mode")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Create flags in the backend first, then return here for limited operational visibility/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/update and rollout endpoints are not wired yet/i)).toBeInTheDocument();
  });

  test("SuperDashboardPage surfaces partial telemetry instead of healthy defaults", async () => {
    renderWithRouter(<SuperDashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No AI activity yet").length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Platform is up, but telemetry is only partially available/i)).toBeInTheDocument();
    expect(screen.getByText("No AI telemetry observed yet")).toBeInTheDocument();
  });

  test("AuditLogsPage shows audit empty state instead of a fake populated table", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No audit logs recorded yet").length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Audit logging has not recorded matching events yet\./i)).toBeInTheDocument();
  });
});
