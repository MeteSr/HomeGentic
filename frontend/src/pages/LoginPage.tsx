import { useId } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";

// ─── Tokens ────────────────────────────────────────────────────────────────────

const C = {
  blue:      "#2B34FF",
  yellow:    "#FFD23F",
  coral:     "#FF5C39",
  ink:       "#0B0D1A",
  paper:     "#FCFCFD",
  muted:     "#6B7080",
  border:    "#EDEEF2",
  white:     "#FFFFFF",
  blueFg:    "#F3F4FF",
};

const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

// ─── Icons ─────────────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2L3 5.5V10c0 4.418 3.346 8.55 8 9.5 4.654-.95 8-5.082 8-9.5V5.5L11 2z" stroke="#FFD23F" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7.5 11l2.5 2.5 4.5-4.5" stroke="#FFD23F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M8.5 13.5l5-5" stroke="#FFD23F" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6.5 11.5l-2 2a3.182 3.182 0 0 0 4.5 4.5l2-2" stroke="#FFD23F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15.5 10.5l2-2a3.182 3.182 0 0 0-4.5-4.5l-2 2" stroke="#FFD23F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M12 2L9 11h7L8 20" stroke="#FFD23F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M3 9.5L11 3l8 6.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#FFD23F" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 20v-7h6v7" stroke="#FFD23F" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

function IcpLogoIcon({ size = 22 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const gradA = `icp-a-${uid}`;
  const gradB = `icp-b-${uid}`;
  const w = Math.round(size * (236.26 / 115.26));
  return (
    <svg width={w} height={size} viewBox="0 0 236.26 115.26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradA} x1="148.81" y1="8.35" x2="227.82" y2="90.17" gradientUnits="userSpaceOnUse">
          <stop offset=".21" stopColor="#f15a24"/><stop offset=".68" stopColor="#fbb03b"/>
        </linearGradient>
        <linearGradient id={gradB} x1="-1244.74" y1="-1414.65" x2="-1165.72" y2="-1332.83" gradientTransform="translate(-1157.28 -1307.74) rotate(-180)" gradientUnits="userSpaceOnUse">
          <stop offset=".21" stopColor="#ed1e79"/><stop offset=".89" stopColor="#522785"/>
        </linearGradient>
      </defs>
      <path fill={`url(#${gradA})`} d="M178.88,0c-13.19,0-27.6,6.99-42.81,20.76-7.21,6.53-13.45,13.51-18.14,19.11,0,0,.02.02.02.03.01-.01.02-.02.02-.02,0,0,7.4,8.32,15.53,17.22,4.38-5.38,10.71-12.72,17.99-19.3,13.53-12.25,22.36-14.82,27.39-14.82,18.97,0,34.41,15.55,34.41,34.65s-15.44,34.54-34.43,34.65c-.86,0-1.98-.11-3.35-.42,5.53,2.48,11.48,4.25,17.14,4.25,34.78,0,41.57-23.45,42.04-25.11,1.03-4.3,1.58-8.77,1.58-13.37,0-31.78-25.74-57.63-57.38-57.63Z"/>
      <path fill="#29abe2" d="M192.59,95.53c-17.81-.45-36.31-14.96-40.09-18.57-9.75-9.32-19-19.87-19-19.87-8.14-8.9-15.53-17.22-15.53-17.22,0,0,0,.01-.02.02,0,0-.02-.02-.02-.03-2.63,3.14-15.43,17.75-15.43,17.75,0,0,8.56,9.16,9.28,10.04,16.81,20.43,42.05,47.59,67.11,47.59h.06c27.01-.14,49.71-19.04,55.75-44.25-.46,1.66-9.42,25.36-42.1,24.53Z"/>
      <path fill={`url(#${gradB})`} d="M57.38,115.26c13.19,0,27.6-6.99,42.81-20.76,7.21-6.53,13.45-13.51,18.14-19.11,0,0-.02-.02-.02-.03-.01.01-.02.02-.02.02,0,0-7.4-8.32-15.53-17.22-4.38,5.38-10.71,12.72-17.99,19.3-13.53,12.25-22.36,14.82-27.39,14.82-18.97,0-34.41-15.55-34.41-34.65s15.44-34.54,34.43-34.65c.86,0,1.98.11,3.35.42-5.53-2.48-11.48-4.25-17.14-4.25C8.83,19.15,2.04,42.59,1.58,44.25c-1.03,4.3-1.58,8.77-1.58,13.37,0,31.78,25.74,57.63,57.38,57.63Z"/>
      <path fill="#29abe2" d="M43.59,19.53c17.81.45,36.4,15.15,40.18,18.76,9.75,9.32,19,19.87,19,19.87,8.14,8.9,15.53,17.22,15.53,17.22,0,0,0-.01.02-.02,0,0,.02.02.02.03,2.63-3.14,15.43-17.75,15.43-17.75,0,0-8.56-9.16-9.28-10.04C107.69,27.16,82.44,0,57.38,0h-.06C30.32.14,7.61,19.04,1.58,44.25c.46-1.66,9.34-25.55,42.01-24.72Z"/>
    </svg>
  );
}

// ─── Feature data ──────────────────────────────────────────────────────────────

const FEATURES = [
  { Icon: ShieldIcon, title: "Secure & Private",     sub: "Your data is encrypted and stored on the Internet Computer (ICP)." },
  { Icon: ChainIcon,  title: "Blockchain Verified",  sub: "Immutable records you can trust. Verified by ICP." },
  { Icon: SparkIcon,  title: "AI-Powered Insights",  sub: "Get answers, recommendations, and insights about your home." },
  { Icon: HomeIcon,   title: "Built for Homeowners", sub: "Everything you need to maintain, protect, and grow your property value." },
];

const ROLE_CONTEXT: Record<string, { heading: string; sub: string }> = {
  homeowner:  { heading: "Welcome, homeowner",  sub: "Sign in to manage your property records and maintenance history." },
  contractor: { heading: "Welcome, contractor", sub: "Sign in to view quote requests, log jobs, and grow your reputation." },
  realtor:    { heading: "Welcome, realtor",    sub: "Sign in to access listings, client properties, and market insights." },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, devLogin } = useAuth();
  const { isLoading } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") ?? "";
  const ctx = ROLE_CONTEXT[role];

  return (
    <div style={{ minHeight: "100vh", background: C.paper, fontFamily: F.body, display: "flex", flexDirection: "column" }}>

      {/* ── Full-viewport split ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>

        {/* ── Left: blue hero panel ── */}
        <div style={{
          background: C.blue,
          display: "flex",
          flexDirection: "column",
          padding: "3.5rem 3rem",
          overflow: "hidden",
        }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", marginBottom: "4rem" }}>
            <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.25rem", color: C.white, letterSpacing: "-0.3px" }}>
              Home<span style={{ color: C.yellow }}>Gentic</span>
            </span>
          </Link>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p style={{ fontFamily: F.mono, fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.white, marginBottom: "1rem" }}>
              SIGN IN
            </p>
            <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "2.625rem", color: C.white, lineHeight: 1.1, marginBottom: "0.375rem" }}>
              Welcome back!
            </h1>
            <h2 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "2.625rem", color: C.yellow, lineHeight: 1.1, marginBottom: "1.5rem" }}>
              Let's protect what<br />matters most.
            </h2>
            <p style={{ fontSize: "0.9375rem", color: C.white, lineHeight: 1.7, marginBottom: "2.5rem", maxWidth: "360px" }}>
              Log in to manage your property, track maintenance, access important documents, and get AI-powered insights — all in one secure place.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "3rem" }}>
              {FEATURES.map((f) => (
                <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <f.Icon />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: C.white, marginBottom: "0.2rem" }}>{f.title}</div>
                    <div style={{ fontSize: "0.8125rem", color: C.white, lineHeight: 1.5 }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: "1.5rem" }}>
              <p style={{ fontSize: "0.9375rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.7, fontStyle: "italic", marginBottom: "0.75rem" }}>
                "HomeGentic gives me peace of mind knowing my home is protected and my records are secure."
              </p>
              <p style={{ fontFamily: F.mono, fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.white }}>
                — AUSTIN HOMEOWNER
              </p>
            </div>
          </div>
        </div>

        {/* ── Right: card panel ── */}
        <div style={{
          background: C.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 2.5rem",
        }}>
          <div style={{ width: "100%", maxWidth: "460px" }}>
            <div style={{
              background: C.white,
              borderRadius: "28px",
              padding: "2.5rem",
              boxShadow: "0 4px 32px rgba(43,52,255,0.08), 0 1px 3px rgba(0,0,0,0.05)",
            }}>
              <h2 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.625rem", color: C.ink, textAlign: "center", marginBottom: "0.5rem", lineHeight: 1.2 }}>
                {ctx ? ctx.heading : "Log in"}
              </h2>
              <p style={{ fontSize: "0.875rem", color: C.muted, textAlign: "center", marginBottom: "1.5rem", lineHeight: 1.6 }}>
                {ctx ? ctx.sub : "No password. Use Google, Apple, a passkey, or a hardware key."}
              </p>

              <button
                onClick={login}
                disabled={isLoading}
                data-tid="login-button"
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem",
                  padding: "0.9rem 1.25rem", border: "none", borderRadius: "100px",
                  background: isLoading ? "#8890ff" : C.blue,
                  fontSize: "0.9375rem", fontFamily: F.body, fontWeight: 600, color: C.white,
                  cursor: isLoading ? "not-allowed" : "pointer", marginBottom: "0.75rem",
                  transition: "background 0.15s",
                  boxShadow: isLoading ? "none" : "0 4px 18px rgba(43,52,255,0.28)",
                }}
              >
                <IcpLogoIcon size={18} />
                {isLoading ? "Connecting…" : "Sign in with Internet Identity"}
              </button>

              <p style={{ textAlign: "center", fontSize: "0.75rem", marginBottom: "1.75rem" }}>
                <a href="https://identity.ic0.app" target="_blank" rel="noopener noreferrer"
                   style={{ color: C.blue, fontWeight: 500, textDecoration: "none" }}>
                  What's Internet Identity?
                </a>
              </p>

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "1.25rem", display: "flex", justifyContent: "center", gap: "0.5rem", fontSize: "0.875rem", color: C.muted }}>
                <span>New here?</span>
                <button type="button" onClick={() => navigate("/register")}
                  style={{ color: C.blue, fontWeight: 600, cursor: "pointer", background: "none", border: "none", padding: 0, fontFamily: F.body, fontSize: "0.875rem" }}>
                  Get started
                </button>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => navigate("/demo")}
                  style={{ color: C.blue, fontWeight: 500, cursor: "pointer", background: "none", border: "none", padding: 0, fontFamily: F.body, fontSize: "0.875rem" }}>
                  Try the demo
                </button>
              </div>

              {import.meta.env.DEV && (
                <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${C.border}`, paddingTop: "1.25rem" }}>
                  <p style={{ fontFamily: F.mono, fontSize: "0.63rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem", textAlign: "center" }}>
                    Local dev only
                  </p>
                  <button
                    onClick={devLogin}
                    style={{
                      width: "100%",
                      padding: "0.625rem",
                      border: `1.5px solid ${C.border}`,
                      borderRadius: "100px",
                      background: C.white,
                      fontFamily: F.body,
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

            <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem" }}>
              <span style={{ fontSize: "0.8125rem", color: C.muted }}>
                Back to{" "}
                <Link to="/" style={{ color: C.blue, fontWeight: 600, textDecoration: "none" }}>
                  HomeGentic
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Trust section ── */}
      <div style={{ background: C.ink, padding: "4rem 3rem" }}>
        <h3 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.75rem", color: C.white, textAlign: "center", marginBottom: "2.5rem" }}>
          Your trust is our foundation
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", maxWidth: "900px", margin: "0 auto 2.5rem" }}>
          {[
            { kicker: "INFRASTRUCTURE", title: "Built on ICP",        sub: "Decentralized. Scalable. Unstoppable." },
            { kicker: "OWNERSHIP",      title: "Your Data, Yours",     sub: "You own your data. Always." },
            { kicker: "INTEGRITY",      title: "Verified & Immutable", sub: "Every important record is permanently verified." },
          ].map((b) => (
            <div key={b.title} style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px",
              padding: "1.5rem",
            }}>
              <p style={{ fontFamily: F.mono, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.yellow, marginBottom: "0.625rem" }}>
                {b.kicker}
              </p>
              <p style={{ fontWeight: 700, fontSize: "1rem", color: C.white, marginBottom: "0.375rem" }}>{b.title}</p>
              <p style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.6 }}>{b.sub}</p>
            </div>
          ))}
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: "900px",
          margin: "0 auto",
          padding: "1.5rem",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
          flexWrap: "wrap",
          gap: "1.5rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <IcpLogoIcon size={28} />
            <div>
              <div style={{ color: C.white, fontWeight: 600, fontSize: "0.9375rem" }}>Built on the Internet Computer Protocol (ICP)</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.8125rem" }}>Your data is yours. Permanently stored. Tamper-proof. Future-proof.</div>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.white, fontWeight: 600, fontSize: "0.9375rem" }}>Quorum HOA members save 10%</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.8125rem" }}>
              Use code:{" "}
              <span style={{ color: C.yellow, fontWeight: 700, letterSpacing: "0.05em" }}>QUORUM10</span>
            </div>
          </div>
          <button
            onClick={() => window.open("https://internetcomputer.org", "_blank", "noopener,noreferrer")}
            style={{
              padding: "0.625rem 1.5rem",
              border: "1.5px solid rgba(255,255,255,0.2)",
              borderRadius: "100px",
              background: "transparent",
              color: C.white,
              fontFamily: F.body,
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Learn More
          </button>
        </div>
      </div>

      {/* ── Sub-footer ── */}
      <div style={{
        background: C.ink,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "1rem 3rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          {["Security", "Privacy", "Terms of Service", "Contact Us"].map((t) => (
            <span key={t} style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.65)", cursor: "pointer" }}>{t}</span>
          ))}
        </div>
        <span style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.65)" }}>© 2025 HomeGentic. All rights reserved.</span>
      </div>
    </div>
  );
}
