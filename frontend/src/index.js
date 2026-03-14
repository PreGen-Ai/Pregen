import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ChatProvider } from "./context/ChatContext";
import { DashboardProvider } from "./context/DashboardContext";

// ✅ Modular Data Contexts (new structure)

import "bootstrap/dist/css/bootstrap.min.css";

// ===== Create root container =====
const container = document.getElementById("root");
const root = createRoot(container);

// ===== Render App with Contexts =====
root.render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <DashboardProvider>
                <ChatProvider>
                  <App />
                </ChatProvider>
        </DashboardProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);

// ===== Optional Performance Logging =====
reportWebVitals();
