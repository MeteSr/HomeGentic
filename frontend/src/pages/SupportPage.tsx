import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronDown, ChevronUp, Mail, FileText, Settings, CreditCard, Smartphone, Shield } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  paper:     COLORS.white,
  ink:       COLORS.plum,
  inkLight:  COLORS.plumMid,
  rule:      COLORS.rule,
  sage:      COLORS.sage,
  sageLight: COLORS.sageLight,
  sageMid:   COLORS.sageMid,
  butter:    COLORS.butter,
  blush:     COLORS.blush,
  serif:     FONTS.serif,
  sans:      FONTS.sans,
  mono:      FONTS.mono,
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
    a: "Sign up for a ContractorPro subscription ($49/month), then complete your contractor profile under Contractor → Profile. Your profile goes live in the directory immediately. Homeowners can leave reviews only after a completed job — you cannot solicit or purchase reviews.",
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Email <a href="mailto:privacy@homegentic.app" style={{ color: S.sage }}>privacy@homegentic.app</a> with the subject "Account Deletion Request". We'll remove your profile and application-layer data within 30 days. Note that records already written to the ICP blockchain cannot be fully erased from the protocol's history — see our <Link to="/privacy#icp-blockchain" style={{ color: S.sage }}>Privacy Policy</Link> for details.
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
  { tier: "Free", channel: "Email", time: "3–5 business days", color: S.inkLight },
  { tier: "Pro", channel: "Email", time: "1–2 business days", color: S.sage },
  { tier: "Premium", channel: "Priority email", time: "Next business day", color: S.sage },
  { tier: "ContractorPro", channel: "Priority email", time: "Next business day", color: S.sage },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${S.rule}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "none", border: "none", cursor: "pointer", padding: "1.125rem 0", textAlign: "left", gap: "1rem",
        }}
        aria-expanded={open}
      >
        <span style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.9375rem", color: S.ink, lineHeight: 1.5 }}>
          {item.q}
        </span>
        {open
          ? <ChevronUp size={16} color={S.inkLight} style={{ flexShrink: 0 }} />
          : <ChevronDown size={16} color={S.inkLight} style={{ flexShrink: 0 }} />
        }
      </button>
      {open && (
        <div style={{ paddingBottom: "1.25rem", fontFamily: S.sans, fontSize: "0.9rem", lineHeight: 1.75, color: S.inkLight, fontWeight: 300 }}>
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

      <div style={{ minHeight: "100vh", background: S.paper, fontFamily: S.sans }}>
        {/* Nav */}
        <header style={{ borderBottom: `1px solid ${S.rule}`, position: "sticky", top: 0, background: S.paper, zIndex: 50 }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: S.serif, fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.5px", color: S.ink }}>
              Home<span style={{ color: S.sage }}>Gentic</span>
            </Link>
            <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.06em", color: S.inkLight }}>PRICING</Link>
              <Link to="/privacy" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.06em", color: S.inkLight }}>PRIVACY</Link>
            </nav>
          </div>
        </header>

        <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 700, fontFamily: S.mono, letterSpacing: "0.06em", marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)` }}>
              SUPPORT
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.05, color: S.ink, marginBottom: "0.875rem" }}>
              How can we help?
            </h1>
            <p style={{ fontFamily: S.sans, fontSize: "1rem", color: S.inkLight, lineHeight: 1.7, maxWidth: "36rem", margin: "0 auto", fontWeight: 300 }}>
              Browse common questions below. Can't find what you need? Email us and we'll get back to you based on your plan.
            </p>
          </div>

          {/* Quick links */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.875rem", marginBottom: "3.5rem" }}>
            {QUICK_LINKS.map(link => (
              <Link
                key={link.label}
                to={link.href}
                style={{ textDecoration: "none", display: "flex", alignItems: "flex-start", gap: "0.875rem", padding: "1.125rem 1.25rem", background: S.sageLight, borderRadius: RADIUS.sm, border: `1px solid ${S.sageMid}`, transition: "box-shadow 0.15s" }}
              >
                <span style={{ color: S.sage, flexShrink: 0, marginTop: "2px" }}>{link.icon}</span>
                <div>
                  <p style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.875rem", color: S.ink, marginBottom: "0.2rem" }}>{link.label}</p>
                  <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>{link.description}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* FAQ */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink, marginBottom: "0.25rem" }}>
              Frequently asked questions
            </h2>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "1.75rem" }}>
              {FAQS.length} QUESTIONS
            </p>
            <div>
              {FAQS.map(item => <FaqRow key={item.q} item={item} />)}
            </div>
          </section>

          {/* Response times */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink, marginBottom: "1.25rem" }}>
              Support response times
            </h2>
            <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.sm, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rule}`, background: S.sageLight }}>
                    {["Plan", "Channel", "Response time"].map(h => (
                      <th key={h} style={{ padding: "0.75rem 1.25rem", textAlign: "left", fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.07em", color: S.inkLight, fontWeight: 700 }}>
                        {h.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESPONSE_TIMES.map((row, i) => (
                    <tr key={row.tier} style={{ borderBottom: i < RESPONSE_TIMES.length - 1 ? `1px solid ${S.rule}` : "none" }}>
                      <td style={{ padding: "0.875rem 1.25rem", fontFamily: S.mono, fontSize: "0.75rem", fontWeight: 700, color: S.ink }}>{row.tier}</td>
                      <td style={{ padding: "0.875rem 1.25rem", fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, fontWeight: 300 }}>{row.channel}</td>
                      <td style={{ padding: "0.875rem 1.25rem", fontFamily: S.sans, fontSize: "0.875rem", color: row.color, fontWeight: 500 }}>{row.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Contact CTA */}
          <section style={{ background: S.ink, borderRadius: RADIUS.card, padding: "2.5rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, background: "rgba(122,175,118,0.15)", borderRadius: RADIUS.sm }}>
                <Mail size={22} color={S.sage} />
              </span>
            </div>
            <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", color: COLORS.white, marginBottom: "0.625rem" }}>
              Still have a question?
            </h2>
            <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: "rgba(253,252,250,0.6)", lineHeight: 1.7, marginBottom: "1.75rem", fontWeight: 300 }}>
              Email us and we'll get back to you. Include your account email and a description of the issue.
            </p>
            <a
              href="mailto:support@homegentic.app"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                background: S.sage, color: COLORS.white, padding: "12px 28px",
                borderRadius: 100, fontFamily: S.sans, fontWeight: 700, fontSize: "0.9375rem",
                textDecoration: "none", transition: "opacity 0.15s",
              }}
            >
              support@homegentic.app
            </a>
            <p style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.06em", color: "rgba(253,252,250,0.35)", marginTop: "1rem" }}>
              FOR BILLING ERRORS OR SECURITY ISSUES, INCLUDE "BILLING" OR "SECURITY" IN THE SUBJECT LINE
            </p>
          </section>

        </div>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${S.rule}`, padding: "2rem 1.5rem" }}>
          <div style={{ maxWidth: "56rem", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", color: S.ink }}>
              Home<span style={{ color: S.sage }}>Gentic</span>
            </Link>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              <Link to="/privacy" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>PRIVACY</Link>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>PRICING</Link>
            </div>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight }}>© 2026 HomeGentic Inc.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
