import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Sidebar from "../components/Dashboard/components/sidebar/Sidebar.jsx";

const mockUseAuthContext = jest.fn();
const mockUseActiveTenantScope = jest.fn();
const mockClearActiveTenantId = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock("../components/Dashboard/hooks/useActiveTenantScope.js", () => ({
  __esModule: true,
  default: () => mockUseActiveTenantScope(),
}));

jest.mock("../services/api/http.js", () => ({
  clearActiveTenantId: () => mockClearActiveTenantId(),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("dashboard nav scope clarity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthContext.mockReturnValue({
      user: { role: "SUPERADMIN" },
    });
    mockUseActiveTenantScope.mockReturnValue({
      tenantId: "",
      tenantName: "",
    });
  });

  test("superadmin sees platform and selected-school groupings without feature flags in primary nav", () => {
    renderSidebar();

    expect(screen.getAllByText("Platform").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Selected School").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Platform Analytics").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Schools").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Platform AI Controls").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI Usage & Cost").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Audit Logs").length).toBeGreaterThan(0);
    expect(screen.queryByText("Feature Flags")).not.toBeInTheDocument();
  });

  test("selected-school tools stay visibly gated until a school is chosen", () => {
    renderSidebar();

    expect(screen.getAllByText("No school selected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choose a School").length).toBeGreaterThan(0);
    expect(screen.getAllByText("School Users")[0]).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("School Analytics")[0]).toHaveAttribute("aria-disabled", "true");
  });

  test("selected-school tools unlock once a school context exists", () => {
    mockUseActiveTenantScope.mockReturnValue({
      tenantId: "north-ridge",
      tenantName: "North Ridge Academy",
    });

    renderSidebar();

    expect(screen.getAllByText("North Ridge Academy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Return to Platform").length).toBeGreaterThan(0);
    expect(screen.getAllByText("School Users").length).toBeGreaterThan(0);
    expect(screen.getAllByText("School Analytics").length).toBeGreaterThan(0);
  });
});
