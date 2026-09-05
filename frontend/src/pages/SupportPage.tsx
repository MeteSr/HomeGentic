import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronDown, ChevronUp, Mail, FileText, Settings, CreditCard, Shield } from "lucide-react";

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

interface FaqItem { q: string; a: React.ReactNode; }

const FAQS: FaqItem[] = [
  {
    q: "Can I cancel my subscription at any time?",
    a: "Yes — cancel any time from Settings → Subscription. Your cancellation takes effect at the end of your current billing period. If you're on a monthly plan and cancel five days in, you keep full access to all paid features for the remaining days of that month. If you're on an annual plan, access continues through the end of your paid year.",
  },
  {
    q: "Do you offer refunds?",
    a: "We don't offer partial refunds on subscription fees. Because you retain full paid-tier access through the end of your billing period, charges for that period are final. If you believe there was a billing error, contact us at support@homegentic.app and we'll investigate within 2 business days.",
  },
  {
    q: "What happens to my data after I cancel?",
    a: (
      <>
        Your property records and maintenance history on the Internet Computer Protocol (ICP) blockchain remain readable and downloadable — they're yours forever. Tier-gated features (additional properties, extra photos, more quote slots) revert to Free limits. If you later resubscribe, your full history is waiting for you exactly as you left it.
      </>
    ),
  },
  {
    q: "How does Internet Identity sign-in work?",
    a: "HomeGentic uses Internet Identity — a passkey-based, passwordless auth system built on ICP. Your identity is anchored to your device's hardware security key or biometrics. No password is ever set, stored, or transmitted. You can add multiple devices (phone + laptop + hardware key) in your Internet Identity settings at identity.ic0.app.",
  },
  {
    q: "I lost access to my Internet Identity. Can you help?",
    a: "We don't control Internet Identity — it's a decentralized protocol. If you've lost access to all your registered devices, recovery depends on whether you set up a recovery phrase or backup device during Internet Identity setup. Visit identity.ic0.app and follow the recovery flow, or contact the DFINITY Foundation directly. We strongly recommend adding at least two devices to your Internet Identity before you need them.",
  },
  {
    q: "How do I upgrade or downgrade my subscription tier?",
    a: "Go to Settings → Subscription and select a new plan. Upgrades take effect immediately — you're prorated for the remainder of the current period. Downgrades take effect at the start of your next billing period, so you keep your current tier's features until then.",
  },
  {
    q: "Why is my HomeGentic Score lower than I expected?",
    a: "Your score reflects documented, verified maintenance records — jobs without receipts or contractor signatures carry less weight. To improve your score: add photos and receipts to existing jobs, ask your contractor to co-sign completed work, and fill in your home system ages (HVAC install year, roof replace year, etc.) in Property → Systems.",
  },
  {
    q: "Can I share my HomeGentic Report without sharing everything?",
    a: "Yes. When you generate a report from your property dashboard, you choose the visibility level: Public (anyone with the link), Link-only (no search indexing), or Private (only you). You can revoke a share link at any time. Individual jobs can be excluded from the shared report before you generate it.",
  },
  {
    q: "How does the voice assistant work? Is my conversation stored?",
    a: "The voice assistant sends your message and a snapshot of your property context to Anthropic's Claude API to generate a response. HomeGentic does not store your conversations after the call completes. Anthropic's API usage is governed by their privacy policy. The assistant requires an active internet connection and works best on Chrome, Edge, and Safari.",
  },
  {
    q: "I'm a contractor — how do I appear in the contractor directory?",
    a: "Sign up for a ContractorPro subscription ($40/month), then complete your contractor profile under Contractor → Profile. Your profile goes live in the directory immediately. Homeowners can leave reviews only after a completed job — you cannot solicit or purchase reviews.",
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Email <a href="mailto:privacy@homegentic.app" style={{ color: C.blue }}>privacy@homegentic.app</a> with the subject "Account Deletion Request". We'll remove your profile and application-layer data within 30 days. Note that records already written to the ICP blockchain cannot be fully erased from the protocol's history — see our <Link to="/privacy#icp-blockchain" style={{ color: C.blue }}>Privacy Policy</Link> for details.
      </>
    ),
  },
];

const QUICK_LINKS = [
  { icon: <Settings size={18} />, label: "Account Settings", href: "/settings", description: "Profile, notifications, subscription" },
  { icon: <CreditCard size={18} />, label: "Billing & Plans", href: "/pricing", description: "Compare tiers, upgrade, cancel" },
  { icon: <FileText size={18} />, label: "Privacy Policy", href: "/privacy", description: "Data collection, ICP blockchain, your rights" },
  { icon: <Shield size={18} />, label: "Security", href: "/privacy#security", description: "Internet Identity, data encryption" },
];

const RESPONSE_TIMES = [
  { tier: "Free",          time: "3–5 business days", highlight: false },
  { tier: "Basic",         time: "2–3 business days", highlight: false },
  { tier: "Pro",           time: "1–2 business days", highlight: true },
  { tier: "Premium",       time: "Next business day", highlight: true },
  { tier: "ContractorPro", time: "Next business day", highlight: true },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "none", border: "none", cursor: "pointer", padding: "1.125rem 0", textAlign: "left", gap: "1rem",
        }}
        aria-expanded={open}
      >
        <span style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.9375rem", color: C.ink, lineHeight: 1.5 }}>
          {item.q}
        </span>
        {open
          ? <ChevronUp size={16} color={C.blue} style={{ flexShrink: 0 }} />
          : <ChevronDown size={16} color={C.muted} style={{ flexShrink: 0 }} />
        }
      </button>
      {open && (
        <div style={{ paddingBottom: "1.25rem", fontFamily: F.body, fontSize: "0.9rem", lineHeight: 1.75, color: C.muted, fontWeight: 400 }}>
          {item.a}
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <>
      <Helmet>
        <title>Support — HomeGentic</title>
        <meta name="description" content="Get help with HomeGentic: billing, cancellation, Internet Identity, sharing reports, and more. Find answers or contact our support team." />
        <link rel="canonical" href="https://homegentic.app/support" />
        <meta property="og:title" content="Support — HomeGentic" />
        <meta property="og:description" content="Answers to common questions about HomeGentic, plus how to reach our team." />
        <meta property="og:url" content="https://homegentic.app/support" />
      </Helmet>

      <div style={{ minHeight: "100vh", background: C.paper, fontFamily: F.body }}>

        {/* Nav */}
        <header style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.paper, zIndex: 50 }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: F.display, fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.5px", color: C.ink }}>
              Home<span style={{ color: C.yellowText }}>Gentic</span>
            </Link>
            <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: F.mono, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>PRICING</Link>
              <Link to="/privacy" style={{ textDecoration: "none", fontFamily: F.mono, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>PRIVACY</Link>
            </nav>
          </div>
        </header>

        <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: C.blueFg, color: C.blue,
              padding: "5px 16px", borderRadius: 100,
              fontSize: "0.65rem", fontWeight: 700, fontFamily: F.mono,
              letterSpacing: "0.12em", textTransform: "uppercase" as const,
              marginBottom: "1.25rem", border: `1px solid ${C.border}`,
            }}>
              SUPPORT
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.05, color: C.ink, marginBottom: "0.875rem" }}>
              How can we help?
            </h1>
            <p style={{ fontFamily: F.body, fontSize: "1rem", color: C.muted, lineHeight: 1.7, maxWidth: "36rem", margin: "0 auto", fontWeight: 400 }}>
              Browse common questions below. Can't find what you need? Email us and we'll get back to you based on your plan.
            </p>
          </div>

          {/* Quick links */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.875rem", marginBottom: "3.5rem" }}>
            {QUICK_LINKS.map(link => (
              <Link
                key={link.label}
                to={link.href}
                style={{
                  textDecoration: "none", display: "flex", alignItems: "flex-start",
                  gap: "0.875rem", padding: "1.125rem 1.25rem",
                  background: C.blueFg, borderRadius: 18,
                  border: `1px solid ${C.border}`, transition: "box-shadow 0.15s",
                }}
              >
                <span style={{ color: C.blue, flexShrink: 0, marginTop: "2px" }}>{link.icon}</span>
                <div>
                  <p style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: C.ink, marginBottom: "0.2rem" }}>{link.label}</p>
                  <p style={{ fontFamily: F.body, fontSize: "0.8rem", color: C.muted, fontWeight: 400 }}>{link.description}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* FAQ */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.5rem", color: C.ink, marginBottom: "0.25rem" }}>
              Frequently asked questions
            </h2>
            <p style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "1.75rem" }}>
              {FAQS.length} QUESTIONS
            </p>
            <div>
              {FAQS.map(item => <FaqRow key={item.q} item={item} />)}
            </div>
          </section>

          {/* Response times */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.5rem", color: C.ink, marginBottom: "1.25rem" }}>
              Support response times
            </h2>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.blueFg }}>
                    {["Plan", "Response time"].map(h => (
                      <th key={h} style={{ padding: "0.75rem 1.25rem", textAlign: "left", fontFamily: F.mono, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted, fontWeight: 700 }}>
                        {h.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESPONSE_TIMES.map((row, i) => (
                    <tr key={row.tier} style={{ borderBottom: i < RESPONSE_TIMES.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <td style={{ padding: "0.875rem 1.25rem", fontFamily: F.mono, fontSize: "0.75rem", fontWeight: 700, color: C.ink }}>{row.tier}</td>
                      <td style={{ padding: "0.875rem 1.25rem", fontFamily: F.body, fontSize: "0.875rem", color: row.highlight ? C.blue : C.muted, fontWeight: 500 }}>{row.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Contact CTA */}
          <section style={{ background: C.ink, borderRadius: 24, padding: "2.5rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, background: "rgba(43,52,255,0.15)", borderRadius: 14 }}>
                <Mail size={22} color={C.blue} />
              </span>
            </div>
            <h2 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.5rem", color: C.white, marginBottom: "0.625rem" }}>
              Still have a question?
            </h2>
            <p style={{ fontFamily: F.body, fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: "1.75rem", fontWeight: 400 }}>
              Email us and we'll get back to you. Include your account email and a description of the issue.
            </p>
            <a
              href="mailto:support@homegentic.app"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                background: C.blue, color: C.white, padding: "12px 28px",
                borderRadius: 100, fontFamily: F.body, fontWeight: 700, fontSize: "0.9375rem",
                textDecoration: "none", transition: "opacity 0.15s",
                boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
              }}
            >
              support@homegentic.app
            </a>
            <p style={{ fontFamily: F.mono, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>
              FOR BILLING ERRORS OR SECURITY ISSUES, INCLUDE "BILLING" OR "SECURITY" IN THE SUBJECT LINE
            </p>
          </section>

        </div>

        {/* Footer */}
        <footer style={{ background: C.ink, padding: "32px 1.5rem", fontFamily: F.body }}>
          <div style={{ maxWidth: "56rem", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              © 2025 HomeGentic
            </span>
            <div style={{ display: "flex", gap: 24 }}>
              {[["Security", "/privacy#security"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Contact", "/support"]].map(([label, href]) => (
                <Link key={label} to={href} style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
