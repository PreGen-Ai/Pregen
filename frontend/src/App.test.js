import { render } from "@testing-library/react";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ChatProvider } from "./context/ChatContext";

jest.mock("./services/api/http", () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { user: null, token: null } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  normalizeApiError: jest.fn(() => "mocked error"),
  getAuthToken: jest.fn(() => null),
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));

test("renders the app shell", () => {
  render(
    <AuthProvider>
      <ThemeProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </ThemeProvider>
    </AuthProvider>,
  );

  expect(document.body).toBeInTheDocument();
});
