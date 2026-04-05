import React from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

export default function LoginPage() {
  const { login, devLogin } = useAuth();
  const { isLoading } = useAuthStore();

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: COLORS.sageLight,
      padding: "1.5rem",
      fontFamily: FONTS.sans,
    }}>
      <div style={{ width: "100%", maxWidth: "26rem" }}>
        {/* Logo */}
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <div style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", letterSpacing: "-0.5px", color: COLORS.plum }}>
            Home<span style={{ color: COLORS.sage }}>Fax</span>
          </div>
        </div>

        {/* Card */}
        <div style={{
          borderRadius: RADIUS.card,
          padding: "2.5rem",
          background: COLORS.white,
          boxShadow: SHADOWS.modal,
          border: `1px solid ${COLORS.rule}`,
        }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: COLORS.butter,
            color: COLORS.plum,
            padding: "5px 14px",
            borderRadius: 100,
            fontSize: "0.75rem",
            fontWeight: 600,
            marginBottom: "1.25rem",
            border: `1px solid rgba(46,37,64,0.1)`,
          }}>
            <span style={{ width: 7, height: 7, background: COLORS.sage, borderRadius: "50%" }} />
            Sign In
          </div>

          <h1 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1.1, marginBottom: "0.75rem", color: COLORS.plum }}>
            Welcome back.
          </h1>
          <p style={{ fontWeight: 300, fontSize: "0.9rem", lineHeight: 1.7, color: COLORS.plumMid, marginBottom: "2rem" }}>
            Sign in with Internet Identity — no passwords, no emails.
            Your identity is secured by the Internet Computer Protocol.
          </p>

          {/* II info */}
          <div style={{
            background: COLORS.sageLight,
            border: `1px solid ${COLORS.sageMid}`,
            borderRadius: RADIUS.sm,
            padding: "0.875rem 1rem",
            marginBottom: "1.75rem",
            display: "flex",
            gap: "0.75rem",
          }}>
            <Shield size={16} color={COLORS.sage} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plum, marginBottom: "0.375rem" }}>
                What is Internet Identity?
              </p>
              <p style={{ fontSize: "0.8rem", color: COLORS.plumMid, fontWeight: 300, lineHeight: 1.6 }}>
                A secure, privacy-preserving authentication system built into ICP.
                Uses biometrics or hardware keys — no personal data stored.
              </p>
            </div>
          </div>

          <Button size="lg" loading={isLoading} onClick={login} style={{ width: "100%", marginBottom: "1rem" }}>
            Sign in with Internet Identity
          </Button>

          <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plumMid, textAlign: "center" }}>
            No account?{" "}
            <span onClick={login} style={{ color: COLORS.sage, fontWeight: 600, cursor: "pointer" }}>
              Create one free →
            </span>
          </p>

          {import.meta.env.DEV && (
            <div style={{ marginTop: "1.5rem", borderTop: `1px solid ${COLORS.rule}`, paddingTop: "1.25rem" }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.625rem" }}>
                Local dev only
              </p>
              <Button
                variant="outline"
                onClick={devLogin}
                style={{ width: "100%" }}
              >
                ⚡ Dev Login (skip Internet Identity)
              </Button>
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <Link to="/" style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plumMid, textDecoration: "none" }}>
            ← Back to HomeGentic
          </Link>
        </div>
      </div>
    </div>
  );
}
