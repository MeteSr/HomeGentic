import React from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
  sans:  "'IBM Plex Sans', sans-serif" as const,
};

export default function LoginPage() {
  const { login, devLogin } = useAuth();
  const { isLoading } = useAuthStore();

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: S.paper, padding: "1.5rem", fontFamily: S.sans,
    }}>
      <div style={{ width: "100%", maxWidth: "26rem" }}>
        {/* Logo */}
        <div style={{ marginBottom: "2.5rem", textAlign: "center" }}>
          <div style={{ fontFamily: S.mono, fontWeight: 500, fontSize: "1rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Home<span style={{ color: S.rust }}>Fax</span>
          </div>
        </div>

        {/* Card */}
        <div style={{ border: `1px solid ${S.rule}`, padding: "2.5rem", background: "#fff" }}>
          {/* Eyebrow */}
          <div style={{
            fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em",
            textTransform: "uppercase", color: S.rust, marginBottom: "1.25rem",
            display: "flex", alignItems: "center", gap: "0.625rem",
          }}>
            <span style={{ display: "block", width: "20px", height: "1px", background: S.rust }} />
            Sign In
          </div>

          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1.1, marginBottom: "0.75rem" }}>
            Welcome back.
          </h1>
          <p style={{ fontWeight: 300, fontSize: "0.875rem", lineHeight: 1.7, color: S.inkLight, marginBottom: "2rem" }}>
            Sign in with Internet Identity — no passwords, no emails.
            Your identity is secured by the Internet Computer Protocol.
          </p>

          {/* II info */}
          <div style={{
            border: `1px solid ${S.rule}`, padding: "1rem",
            marginBottom: "1.75rem", display: "flex", gap: "0.75rem",
          }}>
            <Shield size={16} color={S.rust} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.ink, marginBottom: "0.375rem" }}>
                What is Internet Identity?
              </p>
              <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300, lineHeight: 1.6 }}>
                A secure, privacy-preserving authentication system built into ICP.
                Uses biometrics or hardware keys — no personal data stored.
              </p>
            </div>
          </div>

          <Button size="lg" loading={isLoading} onClick={login} style={{ width: "100%", marginBottom: "1rem" }}>
            Sign in with Internet Identity
          </Button>

          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight, textAlign: "center" }}>
            No account?{" "}
            <span onClick={login} style={{ color: S.rust, cursor: "pointer" }}>
              Create one free →
            </span>
          </p>

          {import.meta.env.DEV && (
            <div style={{ marginTop: "1.5rem", borderTop: `1px solid ${S.rule}`, paddingTop: "1.25rem" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.625rem" }}>
                Local dev only
              </p>
              <button
                onClick={devLogin}
                style={{
                  width: "100%", padding: "0.625rem",
                  background: S.paper, border: `1px solid ${S.rule}`,
                  fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
                  textTransform: "uppercase", color: S.ink, cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = S.ink; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = S.rule; }}
              >
                ⚡ Dev Login (skip Internet Identity)
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <Link to="/" style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", color: S.inkLight, textDecoration: "none" }}>
            ← Back to HomeFax
          </Link>
        </div>
      </div>
    </div>
  );
}
