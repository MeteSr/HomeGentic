import React, { useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { neighborReferralService } from "@/services/neighborReferral";
import { Helmet } from "react-helmet-async";
import { CSS } from "./landingStyles";

const TRUST_BADGES = [
  { bg: "#F0FDF4", color: "#16A34A", icon: "🛡️", title: "Blockchain Verified", sub: "Every record is cryptographically signed and stored on-chain — tamper-proof forever." },
  { bg: "#FEFCE8", color: "#CA8A04", icon: "🔒", title: "Secure & Private",     sub: "You own your data. Nothing is public until you choose to share it." },
  { bg: "#EFF6FF", color: "#2563EB", icon: "✍️", title: "Dual-Signature",       sub: "Both homeowner and contractor must sign every completed job record." },
  { bg: "#F5F3FF", color: "#7C3AED", icon: "∞",  title: "Internet Computer",    sub: "Built on the ICP blockchain — no servers, no downtime, no single point of failure." },
];

const ROLES = [
  {
    bg: "#F0FDF4", icon: "🏠", title: "For Homeowners",
    desc: "Register properties, log maintenance jobs, and build a verified home history that pays off at resale.",
    link: "/login",
  },
  {
    bg: "#EFF6FF", icon: "👷", title: "For Contractors",
    desc: "Sign verified job completions, receive leads from local homeowners, and build your on-chain reputation.",
    link: "/login",
  },
  {
    bg: "#FFF7ED", icon: "🏢", title: "For Realtors / Admins",
    desc: "Access verified property histories to streamline transactions and build buyer trust from day one.",
    link: "/login",
  },
];

const FEATURES = [
  { bg: "#F0FDF4", icon: "📅", title: "Smart Maintenance",       desc: "AI-generated seasonal schedules based on your home's age and system history." },
  { bg: "#EFF6FF", icon: "📡", title: "IoT Integration",         desc: "Connect Nest, Ecobee, Moen Flo, Ring, and 8+ more smart devices automatically." },
  { bg: "#FFF7ED", icon: "💬", title: "Get Quotes",              desc: "Post a job and receive competing bids from verified, background-checked contractors." },
  { bg: "#F5F3FF", icon: "✍️", title: "Dual-Signature Jobs",    desc: "Both parties sign every job — creating a tamper-proof, legally credible work record." },
  { bg: "#FFF1F2", icon: "🏷️", title: "FSBO Listings",          desc: "List your home as FSBO with showing management, sealed-bid offers, and agent matching." },
  { bg: "#F0FDF4", icon: "🌐", title: "360° Panorama Viewer",   desc: "Attach room-by-room 360° walkthroughs to your FSBO listing for remote buyers." },
  { bg: "#EFF6FF", icon: "🎤", title: "AI Voice Agent",          desc: "Ask your home anything out loud — maintenance history, upcoming tasks, or repair costs." },
  { bg: "#FFF7ED", icon: "📋", title: "Immutable Reports",      desc: "Generate a shareable, blockchain-backed home biography that buyers and agents trust." },
];

const PLANS = [
  { tier: "Basic",          sub: "1 Property",          price: 10, tag: null as string | null,   features: ["1 property", "5 photos/job", "3 open quotes", "Maintenance record", "AI scheduling"] },
  { tier: "Pro",            sub: "Up to 5 Properties",  price: 20, tag: null,                    features: ["5 properties", "10 photos/job", "10 open quotes", "FSBO listings", "AI Voice Agent"] },
  { tier: "Premium",        sub: "Up to 20 Properties", price: 40, tag: "Most Popular",          features: ["20 properties", "30 photos/job", "Unlimited quotes", "360° Panorama", "Priority support"] },
  { tier: "Contractor",     sub: "Free Forever",        price:  0, tag: null,                    features: ["Accept job leads", "Sign work records", "Build reputation", "5 photos/job", "Unlimited quotes"] },
  { tier: "ContractorPro",  sub: "Unlimited Leads",     price: 30, tag: null,                    features: ["Unlimited properties", "50 photos/job", "Unlimited quotes", "Premium placement", "Analytics"] },
];

const INTEGRATIONS = ["Nest", "ecobee", "Moen Flo", "Ring", "Schneider Electric", "myQ", "August", "Rachio", "Emporia Vue", "SmartThings", "+8 more"];

export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = React.useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) neighborReferralService.capturePendingRefCode(ref);
  }, [searchParams]);

  useEffect(() => {
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

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <Helmet>
        <title>HomeGentic — Verified Home Maintenance Records on ICP</title>
        <meta name="description" content="HomeGentic gives homeowners a verified, blockchain-backed record of every repair, upgrade, and inspection — boosting home value and buyer confidence." />
        <meta property="og:title" content="HomeGentic — Verified Home Maintenance Records" />
        <meta property="og:description" content="Manage. Maintain. Protect. Your Home. Built on the Internet Computer." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "HomeGentic",
          "url": "https://homegentic.app/",
          "description": "Verified home maintenance records on the Internet Computer blockchain.",
        })}</script>
      </Helmet>
      <style>{CSS}</style>
      <div className="hfl">

        {/* ── Nav ───────────────────────────────────────────────────────── */}
        <nav className="hfl-nav">
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <a href="/" className="hfl-logo">
              <span>🏠</span>Home<span>Gentic</span>
            </a>
            <ul className="hfl-nav-links">
              <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features-section"); }}>Features</a></li>
              <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-roles-section"); }}>For Homeowners</a></li>
              <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-roles-section"); }}>For Contractors</a></li>
              <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-pricing-section"); }}>Pricing</a></li>
              <li><a onClick={(e) => { e.preventDefault(); navigate("/invite"); }}>Invite a Neighbor</a></li>
            </ul>
          </div>
          <div className="hfl-nav-actions">
            <button className="hfl-nav-signin" onClick={() => navigate("/login")}>Log In</button>
            <button className="hfl-nav-pill" onClick={() => navigate("/login")}>Get Started</button>
            <button
              className={`hfl-hamburger${menuOpen ? " hfl-menu-open" : ""}`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span /><span /><span />
            </button>
          </div>
        </nav>

        <main>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="hfl-hero">
          <div>
            <div className="hfl-hero-badge">
              ∞ BUILT ON THE INTERNET COMPUTER (ICP)
            </div>
            <h1>
              Manage. Maintain.<br />
              <span className="green">Protect. Your Home.</span>
            </h1>
            <p>
              HomeGentic is the verified home record platform built on the ICP blockchain.
              Every repair, upgrade, and inspection — signed, stored, and shareable forever.
            </p>
            <div className="hfl-actions">
              <button className="hfl-btn-main" onClick={() => navigate("/login")}>Get Started</button>
              <button className="hfl-btn-soft" onClick={() => scrollTo("hfl-pricing-section")}>
                ▶ See Plans
              </button>
            </div>
          </div>
          <div className="hfl-hero-img-wrap">
            <img src="/hero_home.png" alt="HomeGentic dashboard" className="hfl-hero-img" />
          </div>
        </section>

        {/* ── Trust Badges ──────────────────────────────────────────────── */}
        <div className="hfl-trust">
          <div className="hfl-trust-inner">
            {TRUST_BADGES.map((b) => (
              <div key={b.title} className="hfl-trust-item">
                <div className="hfl-trust-icon" style={{ background: b.bg, color: b.color }}>
                  {b.icon}
                </div>
                <div>
                  <div className="hfl-trust-text-title">{b.title}</div>
                  <div className="hfl-trust-text-sub">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Roles ─────────────────────────────────────────────────────── */}
        <section id="hfl-roles-section" className="hfl-roles">
          <div className="hfl-section-header">
            <h2>Built for every role</h2>
          </div>
          <div className="hfl-roles-grid">
            {ROLES.map((r) => (
              <div key={r.title} className="hfl-role-card">
                <div className="hfl-role-icon" style={{ background: r.bg }}>{r.icon}</div>
                <div className="hfl-role-title">{r.title}</div>
                <div className="hfl-role-desc">{r.desc}</div>
                <button className="hfl-role-link" onClick={() => navigate(r.link)}>
                  Learn more →
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section id="hfl-features-section" className="hfl-features">
          <div className="hfl-section-header">
            <h2>Everything you need</h2>
          </div>
          <div className="hfl-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="hfl-feat-card">
                <div className="hfl-feat-icon" style={{ background: f.bg }}>{f.icon}</div>
                <div className="hfl-feat-title">{f.title}</div>
                <div className="hfl-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust Strip ───────────────────────────────────────────────── */}
        <div className="hfl-strip">
          <div className="hfl-strip-inner">
            <div className="hfl-strip-col">
              <div className="hfl-strip-logo">🏘️</div>
              <div>
                <div className="hfl-strip-title">Quorum HOA Members</div>
                <div className="hfl-strip-desc">HOA members on Quorum save 10% on any HomeGentic plan.</div>
                <div><span className="hfl-strip-code">QUORUM10</span></div>
              </div>
            </div>
            <div className="hfl-strip-col">
              <div className="hfl-strip-logo">🤝</div>
              <div>
                <div className="hfl-strip-title">Invite a Neighbor</div>
                <div className="hfl-strip-desc">You and your neighbor each earn $10 credit when they join.</div>
                <button className="hfl-strip-link" onClick={() => navigate("/invite")}>
                  Learn how it works →
                </button>
              </div>
            </div>
            <div className="hfl-strip-col">
              <div className="hfl-strip-logo">∞</div>
              <div>
                <div className="hfl-strip-title">Built on ICP</div>
                <div className="hfl-strip-desc">Your records live on the Internet Computer — no servers, no downtime, no middlemen. Yours forever.</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Integrations ──────────────────────────────────────────────── */}
        <div className="hfl-integrations">
          <h3>Works with your smart home devices</h3>
          <div className="hfl-integ-logos">
            {INTEGRATIONS.map((name) => (
              <span key={name} className="hfl-integ-logo">{name}</span>
            ))}
          </div>
        </div>

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <section id="hfl-pricing-section" className="hfl-pricing">
          <div className="hfl-pricing-header">
            <h2>Simple, transparent pricing</h2>
            <p>Start at $10/mo. Your verified home record pays for itself at resale.</p>
          </div>
          <div className="hfl-pricing-grid">
            {PLANS.map((p) => (
              <div key={p.tier} className={`hfl-plan-card${p.tag ? " hfl-plan-featured" : ""}`}>
                {p.tag && <div className="hfl-plan-badge">{p.tag}</div>}
                <div className="hfl-plan-tier">{p.tier}</div>
                <div className="hfl-plan-sub">{p.sub}</div>
                <div className="hfl-plan-price">
                  {p.price === 0 ? "Free" : `$${p.price}`}
                  {p.price > 0 && <span>/mo</span>}
                </div>
                <ul className="hfl-plan-features">
                  {p.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <button className="hfl-plan-cta" onClick={() => navigate("/login")}>
                  {p.price === 0 ? "Join free" : "Get started"}
                </button>
              </div>
            ))}
          </div>
          <p className="hfl-pricing-guarantee">
            <span>🔒</span> Cancel anytime · Your blockchain records remain yours forever
          </p>
        </section>

        </main>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer className="hfl-footer">
          <div className="hfl-footer-inner">
            <div className="hfl-footer-left">
              <div className="hfl-footer-icp-logo">∞</div>
              <div>
                <div className="hfl-footer-icp-title">HomeGentic · Built on ICP</div>
                <div className="hfl-footer-icp-sub">
                  Verified home records on the Internet Computer blockchain.
                  No servers. No downtime. Your data lives forever.
                </div>
                <div className="hfl-footer-quorum">
                  Quorum HOA members save 10% ·
                  <span className="hfl-footer-quorum-code">QUORUM10</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <Link to="/privacy" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>Privacy</Link>
              <Link to="/terms"   style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>Terms</Link>
              <button className="hfl-footer-btn" onClick={() => window.open("https://internetcomputer.org", "_blank", "noopener,noreferrer")}>
                Learn About ICP
              </button>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
