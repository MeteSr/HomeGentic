import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";

// ─── SVG Assets ────────────────────────────────────────────────────────────────

function HouseLogoSvg({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 56 48" fill="none" aria-label="HomeGentic">
      <polygon points="28,2 54,22 2,22" fill="#16A34A" />
      <rect x="2" y="22" width="24" height="24" fill="#F97316" />
      <rect x="26" y="22" width="28" height="24" fill="#2563EB" />
      <rect x="21" y="30" width="14" height="16" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

function NavHouseLogo() {
  return (
    <svg width="32" height="28" viewBox="0 0 32 28" fill="none" aria-hidden="true">
      <polygon points="16,1 31,13 1,13" fill="#16A34A" />
      <rect x="1" y="13" width="14" height="14" fill="#F97316" />
      <rect x="15" y="13" width="16" height="14" fill="#2563EB" />
      <rect x="12" y="18" width="8" height="9" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

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

function IcpInfinityIcon({ size = 20 }: { size?: number }) {
  const id = `icp-login-${size}`;
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="50%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>
      </defs>
      <path d="M30 18C30 18 20 2 10 2C2 2 2 18 10 18C2 18 2 34 10 34C20 34 30 18 30 18Z" fill={`url(#${id})`} />
      <path d="M30 18C30 18 40 2 50 2C58 2 58 18 50 18C58 18 58 34 50 34C40 34 30 18 30 18Z" fill={`url(#${id})`} />
    </svg>
  );
}

// ─── Colours ───────────────────────────────────────────────────────────────────

const C = {
  navy:       "#0A1628",
  navyMid:    "#1E293B",
  green:      "#16A34A",
  greenBg:    "#F0FDF4",
  blue:       "#1D4ED8",
  blueBg:     "#EFF6FF",
  muted:      "#64748B",
  border:     "#E2E8F0",
  bg:         "#F8FAFC",
  white:      "#FFFFFF",
  purple:     "#7C3AED",
  purpleBg:   "#F5F3FF",
  orange:     "#EA580C",
  orangeBg:   "#FFF7ED",
};

const FEATURES = [
  { bg: C.greenBg,  color: C.green,  emoji: "🛡️", title: "Secure & Private",    sub: "Your data is encrypted and stored on the Internet Computer (ICP)." },
  { bg: C.purpleBg, color: C.purple, emoji: "✓",  title: "Blockchain Verified", sub: "Immutable records you can trust. Verified by ICP." },
  { bg: C.blueBg,   color: C.blue,   emoji: "🧠", title: "AI-Powered Insights", sub: "Get answers, recommendations, and insights about your home." },
  { bg: C.orangeBg, color: C.orange, emoji: "👥", title: "Built for Homeowners", sub: "Everything you need to maintain, protect, and grow your property value." },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, devLogin } = useAuth();
  const { isLoading } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', 'IBM Plex Sans', sans-serif", display: "flex", flexDirection: "column" }}>

      {/* ── Nav ── */}
      <nav style={{
        background: C.white,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2.5rem",
        height: "64px",
        flexShrink: 0,
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: "0.625rem", textDecoration: "none" }}>
          <NavHouseLogo />
          <span style={{ fontWeight: 700, fontSize: "1.125rem", color: C.navy, letterSpacing: "-0.3px" }}>
            Home<span style={{ color: C.green }}>Gentic</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.875rem", color: C.muted }}>New to HomeGentic?</span>
          <button
            onClick={() => navigate("/register")}
            style={{
              padding: "0.5rem 1.125rem",
              border: `1.5px solid ${C.blue}`,
              borderRadius: "6px",
              background: "transparent",
              color: C.blue,
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Main two-column ── */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "5fr 6fr",
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%",
        padding: "3rem 2.5rem",
        gap: "3rem",
        alignItems: "start",
      }}>

        {/* ── Left column ── */}
        <div>
          <h1 style={{ fontWeight: 700, fontSize: "2.25rem", color: C.navy, lineHeight: 1.15, marginBottom: "0.25rem" }}>
            Welcome back!
          </h1>
          <h2 style={{ fontWeight: 700, fontSize: "2.25rem", color: C.green, lineHeight: 1.15, marginBottom: "1.25rem" }}>
            Let's protect what<br />matters most.
          </h2>
          <p style={{ fontSize: "0.9375rem", color: C.muted, lineHeight: 1.7, marginBottom: "2rem", maxWidth: "360px" }}>
            Log in to manage your property, track maintenance, access important documents, and get AI-powered insights — all in one secure place.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.125rem", marginBottom: "2.5rem" }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
                <div style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: f.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.125rem",
                  flexShrink: 0,
                }}>
                  <span style={{ color: f.color }}>{f.emoji}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: C.navy, marginBottom: "0.2rem" }}>{f.title}</div>
                  <div style={{ fontSize: "0.8125rem", color: C.muted, lineHeight: 1.5 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* House image */}
          <div style={{ borderRadius: "16px", overflow: "hidden", position: "relative", maxHeight: "260px" }}>
            <img
              src="/hero_home.png"
              alt="A well-maintained home"
              style={{ width: "100%", height: "260px", objectFit: "cover", display: "block" }}
            />
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, transparent 50%, rgba(248,250,252,0.6) 100%)",
            }} />
          </div>
        </div>

        {/* ── Right column — login card ── */}
        <div style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: "16px",
          padding: "2.5rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
            <HouseLogoSvg size={56} />
          </div>

          <h2 style={{ fontWeight: 700, fontSize: "1.5rem", color: C.navy, textAlign: "center", marginBottom: "0.375rem" }}>
            Log in to your account
          </h2>
          <p style={{ fontSize: "0.875rem", color: C.muted, textAlign: "center", marginBottom: "2rem" }}>
            Select your preferred sign-in method.
          </p>

          {/* Provider buttons — all open Internet Identity (which handles Google/Apple/WebAuthn) */}
          {[
            { icon: <GoogleIcon />,              label: "Continue with Google" },
            { icon: <AppleIcon />,               label: "Continue with Apple" },
            { icon: <IcpInfinityIcon size={22} />, label: "Continue with Internet Computer" },
          ].map(({ icon, label }) => (
            <button
              key={label}
              onClick={login}
              disabled={isLoading}
              data-tid={label === "Continue with Internet Computer" ? "login-button" : undefined}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.625rem",
                padding: "0.75rem",
                border: `1.5px solid ${C.border}`,
                borderRadius: "8px",
                background: C.white,
                fontSize: "0.9375rem",
                fontWeight: 500,
                color: C.navyMid,
                cursor: isLoading ? "not-allowed" : "pointer",
                marginBottom: "0.75rem",
                transition: "background 0.12s",
                opacity: isLoading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = C.bg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.white; }}
            >
              {icon}
              {label}
            </button>
          ))}

          {/* Sign up link */}
          <p style={{ textAlign: "center", fontSize: "0.875rem", color: C.muted, marginTop: "1.25rem" }}>
            Don't have an account?{" "}
            <span
              onClick={() => navigate("/register")}
              style={{ color: C.blue, fontWeight: 600, cursor: "pointer" }}
            >
              Get Started
            </span>
          </p>

          {/* Security note */}
          <div style={{
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}>
            <span style={{ fontSize: "0.75rem", color: C.muted }}>🔒</span>
            <span style={{ fontSize: "0.75rem", color: C.muted }}>Secured by Internet Identity — no passwords stored</span>
          </div>

          {import.meta.env.DEV && (
            <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${C.border}`, paddingTop: "1.25rem" }}>
              <p style={{ fontSize: "0.75rem", color: C.muted, marginBottom: "0.5rem", textAlign: "center" }}>Local dev only</p>
              <button
                onClick={devLogin}
                style={{
                  width: "100%",
                  padding: "0.625rem",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: "8px",
                  background: C.white,
                  fontSize: "0.875rem",
                  color: C.muted,
                  cursor: "pointer",
                }}
              >
                ⚡ Dev Login (skip Internet Identity)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Trust section ── */}
      <div style={{
        background: C.white,
        borderTop: `1px solid ${C.border}`,
        padding: "3rem 2.5rem",
        textAlign: "center",
      }}>
        <h3 style={{ fontWeight: 700, fontSize: "1.25rem", color: C.navy, marginBottom: "1.75rem" }}>
          Your trust is our foundation
        </h3>
        <div style={{ display: "flex", justifyContent: "center", gap: "3rem", marginBottom: "2.5rem", flexWrap: "wrap" }}>
          {[
            { icon: "🛡️", title: "Built on ICP",          sub: "Decentralized.\nScalable. Unstoppable." },
            { icon: "🔒", title: "Your Data, Yours",       sub: "You own your data.\nAlways." },
            { icon: "✓",  title: "Verified & Immutable",  sub: "Every important record\nis permanently verified." },
          ].map((b) => (
            <div key={b.title} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", maxWidth: "220px", textAlign: "left" }}>
              <div style={{
                width: "36px", height: "36px",
                border: `1.5px solid ${C.border}`,
                borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1rem",
                flexShrink: 0,
              }}>
                <span style={{ color: C.blue }}>{b.icon}</span>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: C.navy }}>{b.title}</div>
                <div style={{ fontSize: "0.8125rem", color: C.muted, whiteSpace: "pre-line", lineHeight: 1.5 }}>{b.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Testimonial */}
        <div style={{ maxWidth: "540px", margin: "0 auto", textAlign: "left" }}>
          <div style={{ fontSize: "2rem", color: C.blue, lineHeight: 1, marginBottom: "0.5rem" }}>"</div>
          <p style={{ fontSize: "1rem", color: C.navyMid, lineHeight: 1.7, fontStyle: "italic", marginBottom: "0.75rem" }}>
            HomeGentic gives me peace of mind knowing my home is protected and my records are secure.
          </p>
          <p style={{ fontSize: "0.875rem", color: C.muted, fontWeight: 500 }}>— Austin Homeowner</p>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        background: "#0A1628",
        padding: "1.5rem 2.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "1rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <IcpInfinityIcon size={32} />
          <div>
            <div style={{ color: C.white, fontWeight: 600, fontSize: "0.9375rem" }}>Built on the Internet Computer Protocol (ICP)</div>
            <div style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>Your data is yours. Permanently stored. Tamper-proof. Future-proof.</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.white, fontWeight: 600, fontSize: "0.9375rem" }}>Quorum HOA members save 10%</div>
          <div style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>
            Use code:{" "}
            <span style={{ color: "#F97316", fontWeight: 700, letterSpacing: "0.05em" }}>QUORUM10</span>
          </div>
        </div>
        <button
          onClick={() => window.open("https://internetcomputer.org", "_blank", "noopener,noreferrer")}
          style={{
            padding: "0.625rem 1.25rem",
            border: "1.5px solid #334155",
            borderRadius: "8px",
            background: "transparent",
            color: C.white,
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Learn More
        </button>
      </footer>

      {/* ── Sub-footer ── */}
      <div style={{
        background: "#0A1628",
        borderTop: "1px solid #1E293B",
        padding: "1rem 2.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          {["Security", "Privacy", "Terms of Service", "Contact Us"].map((t) => (
            <span key={t} style={{ fontSize: "0.8125rem", color: "#94A3B8", cursor: "pointer" }}>{t}</span>
          ))}
        </div>
        <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>© 2025 HomeGentic. All rights reserved.</span>
      </div>
    </div>
  );
}
