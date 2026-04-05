import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import AdminRoute from "./AdminRoute";

jest.mock("../../context/AuthContext", () => ({
  useAuthContext: jest.fn(),
}));

import { useAuthContext } from "../../context/AuthContext";

function renderWithRouter(ui, initialEntries = ["/secure"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Home</div>} />
        <Route path="/secure" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ProtectedRoute redirects unauthenticated users to login", () => {
    useAuthContext.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
    });

    renderWithRouter(
      <ProtectedRoute>
        <div>Secret Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  test("ProtectedRoute renders children for authenticated users", () => {
    useAuthContext.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { role: "STUDENT" },
    });

    renderWithRouter(
      <ProtectedRoute>
        <div>Secret Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Secret Content")).toBeInTheDocument();
  });

  test("AdminRoute redirects non-admin users to dashboard", () => {
    useAuthContext.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { role: "TEACHER" },
    });

    renderWithRouter(
      <AdminRoute>
        <div>Admin Area</div>
      </AdminRoute>,
    );

    expect(screen.getByText("Dashboard Home")).toBeInTheDocument();
  });

  test("AdminRoute renders children for admin users", () => {
    useAuthContext.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { role: "ADMIN" },
    });

    renderWithRouter(
      <AdminRoute>
        <div>Admin Area</div>
      </AdminRoute>,
    );

    expect(screen.getByText("Admin Area")).toBeInTheDocument();
  });
});
