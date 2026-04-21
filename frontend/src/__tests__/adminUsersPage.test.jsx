import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AdminUsersPage from "../components/Dashboard/pages/AdminUsersPage.jsx";
import api from "../services/api/api.js";

const mockUseAuthContext = jest.fn();
const mockUseActiveTenantScope = jest.fn();
const mockSetActiveTenantContext = jest.fn();

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

jest.mock("../services/api/http.js", () => ({
  setActiveTenantContext: (...args) => mockSetActiveTenantContext(...args),
}));

jest.mock("../services/api/api.js", () => ({
  __esModule: true,
  default: {
    admin: {
      createUser: jest.fn(),
      inviteUser: jest.fn(),
      listSystemUsers: jest.fn(),
      listTenants: jest.fn(),
      listUsers: jest.fn(),
      resetUserPassword: jest.fn(),
      setUserRole: jest.fn(),
      setUserStatus: jest.fn(),
    },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuthContext.mockReturnValue({
      user: { role: "SUPERADMIN", tenantId: "platform" },
    });
    mockUseActiveTenantScope.mockReturnValue({ tenantId: "", tenantName: "" });

    api.admin.listTenants.mockResolvedValue({
      items: [{ tenantId: "north-ridge", name: "North Ridge Academy" }],
    });
    api.admin.listSystemUsers.mockResolvedValue({
      items: [
        {
          _id: "user-1",
          tenantId: "north-ridge",
          tenantName: "North Ridge Academy",
          email: "teacher@example.com",
          firstName: "Casey",
          lastName: "Teacher",
          role: "TEACHER",
          enabled: true,
        },
      ],
      total: 1,
    });
    api.admin.inviteUser.mockResolvedValue({
      user: { email: "newuser@example.com", tenantId: "north-ridge" },
      tempPassword: "TempPass123",
    });
  });

  test("shows a platform directory while gating mutations behind school selection", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Platform User Management")).toBeInTheDocument();
    });

    expect(screen.getByText(/Select a school before creating users/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create User" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Temp Password User" })).toBeDisabled();
    expect(screen.getAllByText("North Ridge Academy").length).toBeGreaterThan(0);
  });

  test("shows one-time temporary password messaging once a school is selected", async () => {
    mockUseActiveTenantScope.mockReturnValue({
      tenantId: "north-ridge",
      tenantName: "North Ridge Academy",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Temp Password User" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Temp Password User" }));
    fireEvent.change(screen.getByPlaceholderText("user@example.com"), {
      target: { value: "newuser@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Temporary Password User" }));

    await waitFor(() => {
      expect(api.admin.inviteUser).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Temporary password shown once/i)).toBeInTheDocument();
    });
    expect(screen.getByText("TempPass123")).toBeInTheDocument();
  });
});
