import React from "react";
import { Link } from "react-router-dom";
import { Fingerprint, Lock } from "lucide-react";
import { Button } from "@/components/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

// Simple inline SVG icons for auth providers
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="18" viewBox="0 0 17 18" fill="none" aria-hidden="true">
      <path d="M13.769 9.523c-.02-2.075 1.694-3.079 1.771-3.128-.966-1.411-2.466-1.604-2.999-1.624-1.275-.13-2.496.756-3.143.756-.647 0-1.645-.739-2.706-.718-1.386.02-2.67.808-3.384 2.046C1.69 9.186 2.74 13.4 4.325 15.773c.79 1.163 1.726 2.463 2.951 2.415 1.188-.049 1.634-.77 3.07-.77 1.437 0 1.843.77 3.094.746 1.278-.021 2.086-1.18 2.866-2.35.911-1.347 1.285-2.659 1.304-2.726-.028-.014-2.497-.962-2.52-3.565h-.321z" fill="currentColor"/>
      <path d="M11.617 3.17c.653-.806 1.094-1.918.974-3.028-.941.039-2.088.632-2.764 1.422-.603.7-1.136 1.826-.994 2.907 1.052.08 2.127-.537 2.784-1.3z" fill="currentColor"/>
    </svg>
  );
}

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
            Home<span style={{ color: COLORS.sage }}>Gentic</span>
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
          <p style={{ fontWeight: 300, fontSize: "0.9rem", lineHeight: 1.7, color: COLORS.plumMid, marginBottom: "1.75rem" }}>
            Sign in securely — no password needed.
            Use your Google account, Apple ID, or your device's built-in biometrics.
          </p>

          {/* Provider hints */}
          <div style={{
            display: "flex",
            gap: "0.625rem",
            marginBottom: "1.75rem",
          }}>
            {[
              { icon: <GoogleIcon />, label: "Google" },
              { icon: <AppleIcon />, label: "Apple" },
              { icon: <Fingerprint size={17} color={COLORS.plumMid} />, label: "Touch ID / Face ID" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                title={label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.625rem 0.5rem",
                  border: `1px solid ${COLORS.rule}`,
                  borderRadius: RADIUS.sm,
                  color: COLORS.plumMid,
                  fontSize: "0.65rem",
                  fontFamily: FONTS.mono,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  userSelect: "none",
                }}
              >
                {icon}
                <span style={{ lineHeight: 1.2, textAlign: "center" }}>{label}</span>
              </div>
            ))}
          </div>

          <Button size="lg" loading={isLoading} onClick={login} style={{ width: "100%", marginBottom: "1rem" }}>
            Continue →
          </Button>

          <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plumMid, textAlign: "center" }}>
            No account?{" "}
            <span onClick={login} style={{ color: COLORS.sage, fontWeight: 600, cursor: "pointer" }}>
              Create one free →
            </span>
          </p>

          {/* Security note */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "center",
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: `1px solid ${COLORS.rule}`,
          }}>
            <Lock size={11} color={COLORS.plumMid} />
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 300, color: COLORS.plumMid, margin: 0 }}>
              Secured by Internet Identity — no passwords stored
            </p>
          </div>

          {import.meta.env.DEV && (
            <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${COLORS.rule}`, paddingTop: "1.25rem" }}>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 300, color: COLORS.plumMid, marginBottom: "0.625rem" }}>
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
