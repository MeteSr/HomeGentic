/**
 * ErrorBoundary
 *
 * Class component — required by React's error boundary API.
 * Catches render/lifecycle exceptions in the subtree and shows a
 * recovery UI instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary>          — per-route (reset on navigation)
 *   <ErrorBoundary global>   — root fallback (full-page error)
 */

import React from "react";
import { COLORS, FONTS, RADIUS } from "@/theme";
import { reportFrontendError } from "@/services/errorReporting";

interface Props {
  children: React.ReactNode;
  /** When true, renders a full-page fallback; otherwise an inline card. */
  global?: boolean;
  /** Optional label for the section, e.g. "Dashboard" — shown in the error UI. */
  section?: string;
}

interface State {
  error:     Error | null;
  errorInfo: React.ErrorInfo | null;
}

const UI = {
  ink:    COLORS.plum,
  muted:  COLORS.plumMid,
  rule:   COLORS.rule,
  rust:   "#C94C2E",
  serif:  FONTS.serif,
  mono:   FONTS.mono,
  sans:   FONTS.sans,
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
    reportFrontendError(error, errorInfo.componentStack ?? null);
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    const { error } = this.state;
    const { children, global: isGlobal, section } = this.props;

    if (!error) return <>{children}</>;

    const label = section ? `${section} — ` : "";

    if (isGlobal) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: COLORS.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust, marginBottom: "1rem" }}>
              Application Error
            </p>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", color: UI.ink, marginBottom: "0.75rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontFamily: UI.sans, fontSize: "0.9375rem", color: UI.muted, marginBottom: "2rem", lineHeight: 1.6 }}>
              {label}An unexpected error occurred. Your data is safe — reload to continue.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: UI.ink, color: COLORS.white,
                  border: "none", borderRadius: RADIUS.pill,
                  fontFamily: UI.sans, fontSize: "0.875rem", fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reload page
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "none", color: UI.muted,
                  border: `1px solid ${UI.rule}`, borderRadius: RADIUS.pill,
                  fontFamily: UI.sans, fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
            {import.meta.env.DEV && (
              <pre style={{
                marginTop: "2rem", padding: "1rem",
                background: "#FFF5F3", border: `1px solid #F5C6BD`,
                borderRadius: RADIUS.sm, textAlign: "left",
                fontFamily: UI.mono, fontSize: "0.7rem", color: UI.rust,
                overflow: "auto", maxHeight: 200,
              }}>
                {error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    // Inline card — used per-route so the nav stays intact
    return (
      <div style={{
        margin: "2rem auto", maxWidth: 560, padding: "2rem",
        border: `1px solid ${UI.rule}`, borderRadius: RADIUS.card,
        background: COLORS.white,
      }}>
        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
          {label}Error
        </p>
        <p style={{ fontFamily: UI.sans, fontSize: "0.9375rem", color: UI.ink, marginBottom: "1.25rem", lineHeight: 1.6 }}>
          This section encountered an unexpected error.
        </p>
        <button
          onClick={this.handleReset}
          style={{
            padding: "0.5rem 1.25rem",
            background: UI.ink, color: COLORS.white,
            border: "none", borderRadius: RADIUS.pill,
            fontFamily: UI.sans, fontSize: "0.875rem", fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {import.meta.env.DEV && (
          <pre style={{
            marginTop: "1rem", padding: "0.75rem",
            background: "#FFF5F3", border: `1px solid #F5C6BD`,
            borderRadius: RADIUS.sm,
            fontFamily: UI.mono, fontSize: "0.65rem", color: UI.rust,
            overflow: "auto", maxHeight: 160,
          }}>
            {error.message}
          </pre>
        )}
      </div>
    );
  }
}
