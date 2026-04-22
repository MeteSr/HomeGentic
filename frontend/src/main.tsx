import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
import { errorTracker } from "@/services/errorTracker";
import { useAuthStore } from "@/store/authStore";

// Install global error handlers (unhandledrejection, window.onerror,
// click/console breadcrumb capture). Idempotent — safe to call multiple times.
errorTracker.init();

// Keep error-report context in sync with auth state changes.
// Runs outside React so every captured error carries the right principal/tier
// regardless of where in the component tree it originates.
useAuthStore.subscribe((state) => {
  errorTracker.setContext({
    principal: state.principal  ?? undefined,
    tier:      state.tier       ?? undefined,
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
