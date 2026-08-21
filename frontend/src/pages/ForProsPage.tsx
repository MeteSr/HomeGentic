import React from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { type PlanTier, type BillingCycle } from "@/services/planConstants";

const C = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#6B7080",
  border: "#EDEEF2",
  white:  "#FFFFFF",
  blueFg: "#F3F4FF",
};
const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

const CONTRACTOR_PLANS = [
  {
    tier: "Contractor Free",
    planTier: "ContractorFree" as PlanTier,
    price: "$0",
    tag: null as string | null,
    fee: "+ $15 referral fee per verified job",
    features: [
      "Contractor profile listing",
      "5 photos per job",
      "Receive leads from HomeGentic homeowners",
      "Basic trust score",
      "Job completion certificates",
    ],
    cta: "Join free",
  },
  {
    tier: "Contractor Pro",
    planTier: "ContractorPro" as PlanTier,
    price: "$30/mo",
    tag: "Most Popular",
    fee: "No referral fees",
    features: [
      "Everything in Contractor Free",
      "Lead notifications",
      "50 photos per job",
      "Trust score display",
      "Customer reviews",
      "Earnings dashboard",
    ],
    cta: "Go Pro",
  },
];

// Minimal responsive CSS — only media-query rules, no design colors
const RESPONSIVE_CSS = `
  @media (max-width: 768px) {
    .fpro-nav-links { display: none !important; }
    .fpro-nav-links.open {
      display: flex !important; flex-direction: column;
      position: fixed; top: 72px; left: 0; right: 0;
      background: #FCFCFD; padding: 24px 32px; z-index: 99;
      border-bottom: 1px solid #EDEEF2; gap: 20px;
    }
    .fpro-hamburger { display: flex !important; }
    .fpro-nav-signin, .fpro-nav-join { display: none !important; }
    .fpro-hero { padding: 100px 24px 60px !important; }
    .fpro-section-pad { padding: 56px 24px !important; }
    .fpro-plans-grid { grid-template-columns: 1fr !important; max-width: 100% !important; }
    .fpro-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
  }
  @media (min-width: 769px) {
    .fpro-hamburger { display: none !important; }
  }
`;

export default function ForProsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 80);
  }, [location.hash]);

  const { login, devLogin } = useAuth();
  const handleLogin = import.meta.env.DEV ? devLogin : login;
  const { isAuthenticated } = useAuthStore();

  async function handleUpgrade(tier: PlanTier) {
    if (tier === "ContractorFree") {
      await handleLogin();
      return;
    }
    const billing: BillingCycle = "Monthly";
    if (!isAuthenticated) {
      await handleLogin();
      return;
    }
    navigate(`/checkout?tier=${tier}&billing=${billing}`);
  }

  React.useEffect(() => {
    if (!document.getElementById("hf-cobalt-fonts")) {
      const link = document.createElement("link");
      link.id = "hf-cobalt-fonts";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap";
      document.head.appendChild(link);
    }
    return () => { document.getElementById("hf-cobalt-fonts")?.remove(); };
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <Helmet>
        <title>For Contractors — Join the HomeGentic Network</title>
        <meta name="description" content="Contractors: grow your business with HomeGentic. Get leads from verified homeowners, auto-log completed work, and build a trusted profile." />
        <link rel="canonical" href="https://homegentic.app/for-pros" />
      </Helmet>
      <style>{RESPONSIVE_CSS}</style>

      <div style={{ background: C.paper, minHeight: "100vh", fontFamily: F.body }}>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          background: C.paper, borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 56px", height: "72px",
        }}>
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate("/"); }}
            style={{ textDecoration: "none", fontFamily: F.display, fontWeight: 800, fontSize: "22px", letterSpacing: "-0.5px", color: C.ink }}
          >
            Home<span style={{ color: C.yellow }}>Gentic</span>
          </a>

          <ul
            className={`fpro-nav-links${menuOpen ? " open" : ""}`}
            style={{ display: "flex", listStyle: "none", margin: 0, padding: 0, gap: "2rem", alignItems: "center" }}
          >
            <li>
              <a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/"); }}
                style={{ fontFamily: F.body, fontSize: "0.9rem", color: C.muted, textDecoration: "none", cursor: "pointer" }}>
                Home
              </a>
            </li>
            <li>
              <a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/pricing"); }}
                style={{ fontFamily: F.body, fontSize: "0.9rem", color: C.muted, textDecoration: "none", cursor: "pointer" }}>
                Pricing
              </a>
            </li>
            <li>
              <a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/for-pros"); }}
                style={{ fontFamily: F.body, fontSize: "0.9rem", color: C.blue, fontWeight: 700, textDecoration: "none", cursor: "pointer" }}>
                For Pros
              </a>
            </li>
          </ul>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              className="fpro-nav-signin"
              onClick={() => navigate("/login")}
              style={{
                fontFamily: F.body, fontSize: "0.9rem", fontWeight: 500,
                color: C.ink, background: "none", border: "none", cursor: "pointer",
                padding: "8px 16px",
              }}
            >
              Sign in
            </button>
            <button
              className="fpro-nav-join"
              onClick={() => navigate("/login")}
              style={{
                fontFamily: F.body, fontSize: "0.9rem", fontWeight: 700,
                color: C.white, background: C.blue, border: "none", cursor: "pointer",
                padding: "10px 22px", borderRadius: "100px",
                boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
              }}
            >
              Join Now
            </button>
            <button
              className="fpro-hamburger"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                display: "none", flexDirection: "column", gap: "5px",
                background: "none", border: "none", cursor: "pointer", padding: "8px",
              }}
            >
              <span style={{ display: "block", width: 22, height: 2, background: C.ink, borderRadius: 2, transition: "all .2s", transform: menuOpen ? "rotate(45deg) translateY(7px)" : "none" }} />
              <span style={{ display: "block", width: 22, height: 2, background: C.ink, borderRadius: 2, opacity: menuOpen ? 0 : 1, transition: "opacity .2s" }} />
              <span style={{ display: "block", width: 22, height: 2, background: C.ink, borderRadius: 2, transition: "all .2s", transform: menuOpen ? "rotate(-45deg) translateY(-7px)" : "none" }} />
            </button>
          </div>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section
          className="fpro-hero"
          style={{ paddingTop: "140px", paddingBottom: "80px", paddingLeft: "56px", paddingRight: "56px", textAlign: "center", background: C.paper }}
        >
          <h1 style={{ fontFamily: F.display, fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 800, color: C.ink, lineHeight: 1.1, marginBottom: "1.25rem" }}>
            Grow your business<br />
            <span style={{ fontWeight: 400, color: C.blue }}>with HomeGentic.</span>
          </h1>
          <p style={{ fontFamily: F.body, fontSize: "1.1rem", color: C.muted, maxWidth: 560, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
            Join a network of trusted contractors connected directly to motivated homeowners. No cold outreach. No bidding wars. Verified work auto-logged to permanent records.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => document.getElementById("contractor-plans")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                fontFamily: F.body, fontSize: "1rem", fontWeight: 700,
                padding: "14px 32px", borderRadius: "100px",
                background: C.blue, color: C.white, border: "none", cursor: "pointer",
                boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
              }}
            >
              Join the network
            </button>
            <button
              onClick={() => navigate("/")}
              style={{
                fontFamily: F.body, fontSize: "1rem", fontWeight: 600,
                padding: "14px 32px", borderRadius: "100px",
                background: "transparent", color: C.ink,
                border: `1.5px solid ${C.border}`, cursor: "pointer",
              }}
            >
              Learn about HomeGentic
            </button>
          </div>
        </section>

        {/* ── Why Join ────────────────────────────────────────────────────── */}
        <section
          className="fpro-section-pad"
          style={{ background: C.ink, padding: "72px 56px" }}
        >
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <h2 style={{ fontFamily: F.display, fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 800, color: C.white, textAlign: "center", marginBottom: "0.75rem" }}>
              Why professionals choose HomeGentic
            </h2>
            <p style={{ fontFamily: F.body, fontSize: "1rem", color: "rgba(252,252,253,0.55)", textAlign: "center", marginBottom: "3rem", maxWidth: 520, margin: "0 auto 3rem" }}>
              3,400+ verified homeowners actively seeking trusted service providers — and every job you complete builds your permanent reputation.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem" }}>
              {[
                { icon: "🎯", title: "Warm leads only", body: "Homeowners on HomeGentic are actively maintaining their homes and requesting quotes — no cold calls, no wasted pitches." },
                { icon: "✅", title: "Auto-logged work", body: "Every completed job is auto-recorded to the homeowner's blockchain record. Your reputation grows with every project." },
                { icon: "⭐", title: "Verified reviews", body: "Rate-limited, verified reviews from real clients. No fake stars. Your trust score is earned, not gamed." },
                { icon: "📊", title: "Earnings dashboard", body: "Track jobs, completed bids, and revenue — all in one place. See exactly where your business stands." },
              ].map((c) => (
                <div key={c.title} style={{
                  background: "rgba(252,252,253,0.05)", border: "1px solid rgba(252,252,253,0.1)",
                  borderRadius: "22px", padding: "1.5rem",
                }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{c.icon}</div>
                  <div style={{ fontFamily: F.display, fontSize: "1rem", fontWeight: 700, color: C.white, marginBottom: "0.5rem" }}>{c.title}</div>
                  <div style={{ fontFamily: F.body, fontSize: "0.875rem", color: "rgba(252,252,253,0.5)", lineHeight: 1.6 }}>{c.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contractor Plans ─────────────────────────────────────────────── */}
        <section style={{ padding: "80px 56px", background: C.paper }} id="contractor-plans">
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
              <h2 style={{ fontFamily: F.display, fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 800, color: C.ink, marginBottom: "0.75rem" }}>
                Start free.<br /><span style={{ fontWeight: 400, color: C.blue }}>Scale when you're ready.</span>
              </h2>
              <p style={{ fontFamily: F.body, fontSize: "1rem", color: C.muted, maxWidth: 520, margin: "0 auto" }}>
                Join the network at no cost and pay a small referral fee per job — or upgrade to Pro and keep everything you earn.
              </p>
            </div>

            <div
              className="fpro-plans-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem", maxWidth: 720, margin: "0 auto" }}
            >
              {CONTRACTOR_PLANS.map((plan) => {
                const isFeatured = !!plan.tag;
                return (
                  <div
                    key={plan.tier}
                    style={{
                      padding: "2rem", borderRadius: "24px",
                      background: C.white,
                      border: `${isFeatured ? "2px" : "1.5px"} solid ${isFeatured ? C.blue : C.border}`,
                      boxShadow: isFeatured ? "0 8px 32px rgba(43,52,255,0.14)" : "0 2px 12px rgba(11,13,26,0.06)",
                      position: "relative",
                    }}
                  >
                    {plan.tag && (
                      <div style={{
                        display: "inline-flex", alignItems: "center",
                        background: C.blue, color: C.white,
                        padding: "3px 12px", borderRadius: 100,
                        fontSize: "0.65rem", fontWeight: 700,
                        marginBottom: "0.75rem", fontFamily: F.mono,
                        letterSpacing: "0.08em", textTransform: "uppercase",
                      }}>
                        {plan.tag}
                      </div>
                    )}
                    <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: C.muted, marginBottom: "0.5rem" }}>
                      {plan.tier}
                    </div>
                    <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: "2.25rem", lineHeight: 1, color: C.ink, marginBottom: "0.5rem" }}>
                      {plan.price}
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: "0.8rem", color: isFeatured ? C.blue : C.muted, marginBottom: "1.5rem", fontWeight: 600 }}>
                      {plan.fee}
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                      {plan.features.map((f) => (
                        <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: F.body, fontSize: "0.875rem", color: C.muted }}>
                          <span style={{ color: C.blue, flexShrink: 0, fontWeight: 700 }}>✓</span> {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleUpgrade(plan.planTier)}
                      style={{
                        width: "100%", padding: "13px 0", borderRadius: "100px",
                        fontFamily: F.body, fontSize: "1rem", fontWeight: 700,
                        background: isFeatured ? C.blue : "transparent",
                        color: isFeatured ? C.white : C.ink,
                        border: isFeatured ? "none" : `1.5px solid ${C.border}`,
                        cursor: "pointer",
                        boxShadow: isFeatured ? "0 4px 18px rgba(43,52,255,0.28)" : "none",
                      }}
                    >
                      {plan.cta}
                    </button>
                  </div>
                );
              })}
            </div>

            <p style={{
              textAlign: "center", fontFamily: F.body, fontSize: "0.9rem",
              color: C.muted, marginTop: "1.75rem", lineHeight: 1.7,
              maxWidth: 680, margin: "1.75rem auto 0",
            }}>
              * Plans billed monthly. Cancel anytime — access ends at the close of your current billing period. Referral fees are charged per verified completed job and are non-refundable.
            </p>
          </div>
        </section>

        {/* ── BidToList cross-sell ─────────────────────────────────────────── */}
        <section
          className="fpro-section-pad"
          style={{ padding: "72px 56px", background: C.ink }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(252,252,253,0.4)", marginBottom: "1rem" }}>
              🏡 Real Estate Agents
            </div>
            <h2 style={{ fontFamily: F.display, fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 800, color: C.white, marginBottom: "1rem" }}>
              Competing for listings?<br /><span style={{ fontWeight: 400, color: C.yellow }}>Try BidToList.</span>
            </h2>
            <p style={{ fontFamily: F.body, fontSize: "1rem", color: "rgba(252,252,253,0.55)", maxWidth: 520, margin: "0 auto 2rem", lineHeight: 1.7 }}>
              HomeGentic focuses on home maintenance records. For agents looking to win seller listings through competitive proposals, our sister platform BidToList is built exactly for that.
            </p>
            <a
              href="https://bidtolist.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", textDecoration: "none",
                fontFamily: F.body, fontSize: "1rem", fontWeight: 700,
                padding: "14px 32px", borderRadius: "100px",
                background: C.yellow, color: C.ink,
              }}
            >
              Go to BidToList →
            </a>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────────── */}
        <section style={{ background: C.blue, padding: "80px 56px", textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2 style={{ fontFamily: F.display, fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, color: C.white, marginBottom: "1rem", lineHeight: 1.1 }}>
              Join 3,400+ homeowners<br />already on the network.
            </h2>
            <p style={{ fontFamily: F.body, fontSize: "1rem", color: "rgba(255,255,255,0.7)", marginBottom: "2rem", lineHeight: 1.7 }}>
              Set up your profile in minutes. Leads start flowing as soon as you're verified.
            </p>
            <button
              onClick={() => navigate("/login")}
              style={{
                fontFamily: F.body, fontSize: "1rem", fontWeight: 700,
                padding: "16px 40px", borderRadius: "100px",
                background: C.yellow, color: C.ink, border: "none", cursor: "pointer",
                marginBottom: "1.25rem",
              }}
            >
              Create your profile
            </button>
            <div style={{ fontFamily: F.body, fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
              Free to join · No credit card required · Cancel anytime
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{ background: C.ink, padding: "64px 56px 32px", fontFamily: F.body }}>
          <div
            className="fpro-footer-grid"
            style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: "48px", marginBottom: "52px" }}
          >
            <div>
              <span style={{ fontFamily: F.display, fontSize: "24px", fontWeight: 800, color: C.white, marginBottom: "14px", display: "block" }}>
                Home<span style={{ color: C.yellow }}>Gentic</span>
              </span>
              <p style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.45)", lineHeight: 1.65, maxWidth: 220, margin: 0 }}>
                The verified maintenance record that makes your home worth more and easier to sell.
              </p>
            </div>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(252,252,253,0.35)", marginBottom: "20px" }}>
                For Pros
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                <li>
                  <a
                    onClick={(e) => { e.preventDefault(); document.getElementById("contractor-plans")?.scrollIntoView({ behavior: "smooth" }); }}
                    style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none", cursor: "pointer" }}
                  >
                    Contractor Plans
                  </a>
                </li>
                <li>
                  <a href="https://bidtolist.com" target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>
                    Real Estate Agents →
                  </a>
                </li>
                <li>
                  <a onClick={() => navigate("/login")}
                    style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none", cursor: "pointer" }}>
                    Create Profile
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: "11px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(252,252,253,0.35)", marginBottom: "20px" }}>
                Company
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                <li><Link to="/faq"     style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>FAQ</Link></li>
                <li><Link to="/pricing" style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>Full Pricing</Link></li>
                <li><Link to="/privacy" style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>Privacy Policy</Link></li>
                <li><Link to="/terms"   style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>Terms of Service</Link></li>
                <li><Link to="/support" style={{ fontFamily: F.body, fontSize: "14px", color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>Support</Link></li>
              </ul>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(252,252,253,0.08)", paddingTop: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: F.body, fontSize: "13px", color: "rgba(252,252,253,0.35)" }}>
            <span>© 2026 HomeGentic Inc.</span>
            <div style={{ display: "flex", gap: "24px" }}>
              <Link to="/privacy" style={{ color: "rgba(252,252,253,0.35)", textDecoration: "none" }}>Privacy</Link>
              <Link to="/terms"   style={{ color: "rgba(252,252,253,0.35)", textDecoration: "none" }}>Terms</Link>
              <Link to="/support" style={{ color: "rgba(252,252,253,0.35)", textDecoration: "none" }}>Support</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
