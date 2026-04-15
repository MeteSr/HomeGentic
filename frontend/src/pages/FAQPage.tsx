import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { COLORS, FONTS } from "@/theme";

const UI = {
  paper:    COLORS.white,
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  sageLight: COLORS.sageLight,
  blush:    COLORS.blush,
  butter:   COLORS.butter,
  serif:    FONTS.serif,
  sans:     FONTS.sans,
  mono:     FONTS.mono,
};

interface FaqItem { q: string; a: string; }

const FAQS: FaqItem[] = [
  {
    q: "How do I prove my home maintenance history to buyers?",
    a: "HomeGentic creates a blockchain-backed record of every repair, inspection, and upgrade you complete. Share a verified report link with any buyer — no login required on their end.",
  },
  {
    q: "What are home maintenance records and why do they matter for sale?",
    a: "Home maintenance records are documented proof of repairs and system upkeep. Homes with verified maintenance history sell faster and command higher prices because buyers can confirm the property's condition.",
  },
  {
    q: "How does verified contractor work history work?",
    a: "When a contractor completes a job on HomeGentic, both the homeowner and contractor digitally sign the record. This dual-signature makes the entry tamper-proof and verifiable by third parties.",
  },
  {
    q: "Can I use HomeGentic to track DIY home repairs?",
    a: "Yes. Homeowners can log DIY jobs themselves. These are marked as self-verified and still appear in your maintenance timeline — giving you a complete picture of your home's history.",
  },
  {
    q: "How does HomeGentic help with home insurance claims?",
    a: "An up-to-date maintenance record demonstrates due diligence. HomeGentic's Insurance Defense report compiles your verified job history into a shareable document insurers can reference during claims.",
  },
  {
    q: "Is my maintenance data private?",
    a: "Your data lives on the Internet Computer blockchain under your control. You choose what to share and with whom. Reports are only accessible to people you give the link to.",
  },
  {
    q: "What happens to my data if HomeGentic shuts down?",
    a: "Because your records are stored on the Internet Computer blockchain, they remain readable at their on-chain address regardless of HomeGentic's operational status. No company can delete them.",
  },
  {
    q: "How is HomeGentic different from a spreadsheet or Google Drive folder?",
    a: "Spreadsheets are self-reported and editable — buyers can't verify them. HomeGentic records are dual-signed by homeowner and contractor, timestamped on-chain, and linked to contractor credentials. That's what makes them verifiable.",
  },
  {
    q: "Can I get a job verified if my contractor isn't on HomeGentic?",
    a: "Yes. Log the job yourself and HomeGentic generates a single-use co-sign link. Send it to your contractor — they don't need an account. They open the link, review the job details, and sign off. Once both parties have signed, the record becomes fully dual-verified. The link expires after 48 hours, so it's worth sending right after the work is done. If the contractor doesn't sign in time, the record stays in your timeline as homeowner-verified — still useful, just not dual-signed.",
  },
  {
    q: "What is the HomeGentic Score and how is it calculated?",
    a: "The HomeGentic Score is a 0–100 grade that reflects the overall documented condition of your property. It's made up of three dimensions: Maintenance Coverage (40%) measures how consistently you've logged service across key systems like HVAC, roof, plumbing, and electrical; System Modernization (35%) weighs how current your major systems are relative to their expected lifespan; and Verification Depth (25%) reflects how many of your records are dual-signed by both you and a contractor rather than self-reported. Scores are graded A through F. Your score is private by default — it's only visible to you and appears in reports you choose to share. It never becomes public.",
  },
  {
    q: "What subscription tier do I need?",
    a: "Basic ($10/mo) covers one property with up to 5 photos per job and 3 open quote requests — enough to get started. Pro ($20/mo) supports 5 properties and 10 photos per job. Premium ($35/mo) scales to 20 properties. See the full comparison on our Pricing page.",
  },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderTop: `1px solid ${UI.rule}`,
        cursor: "pointer",
      }}
      onClick={() => setOpen((o) => !o)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "20px 0",
        }}
      >
        <p
          style={{
            fontFamily: UI.sans,
            fontWeight: 700,
            fontSize: "1rem",
            color: UI.ink,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {item.q}
        </p>
        <span
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: UI.sage,
            fontSize: 20,
            fontWeight: 300,
            transition: "transform .2s",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          +
        </span>
      </div>
      {open && (
        <p
          style={{
            fontFamily: UI.sans,
            fontWeight: 400,
            fontSize: "0.9rem",
            color: UI.inkLight,
            margin: "0 0 20px",
            lineHeight: 1.7,
            maxWidth: 680,
          }}
        >
          {item.a}
        </p>
      )}
    </div>
  );
}

export default function FAQPage() {
  return (
    <>
      <Helmet>
        <title>FAQ — HomeGentic</title>
        <meta name="description" content="Answers to common questions about HomeGentic's verified home maintenance records, blockchain data ownership, subscription tiers, and more." />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": FAQS.map((f) => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a },
          })),
        })}</script>
      </Helmet>

      <div style={{ background: UI.paper, minHeight: "100vh", fontFamily: UI.sans }}>

        {/* Nav */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 56px", height: 64, borderBottom: `1px solid ${UI.rule}`,
          background: UI.paper, position: "sticky", top: 0, zIndex: 100,
        }}>
          <Link
            to="/"
            style={{
              fontFamily: UI.serif, fontSize: 20, fontWeight: 900,
              color: UI.ink, textDecoration: "none", letterSpacing: "-0.5px",
            }}
          >
            Home<span style={{ color: UI.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </Link>
          <Link
            to="/login"
            style={{
              fontFamily: UI.sans, fontSize: 14, fontWeight: 600,
              color: UI.paper, background: UI.ink, textDecoration: "none",
              padding: "10px 22px", borderRadius: 100,
            }}
          >
            Sign In
          </Link>
        </nav>

        {/* Hero */}
        <div style={{
          maxWidth: 860, margin: "0 auto", padding: "72px 56px 0",
          textAlign: "center",
        }}>
          <div style={{
            display: "inline-block",
            fontFamily: UI.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "2px", textTransform: "uppercase",
            color: UI.sage, marginBottom: 20,
          }}>
            ✦ FAQ
          </div>
          <h1 style={{
            fontFamily: UI.serif, fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 900, color: UI.ink, letterSpacing: "-1.5px",
            lineHeight: 1.05, margin: "0 0 20px",
          }}>
            Frequently Asked<br />
            <em style={{ fontStyle: "italic", fontWeight: 300, color: UI.sage }}>Questions</em>
          </h1>
          <p style={{
            fontFamily: UI.sans, fontSize: 17, color: UI.inkLight,
            lineHeight: 1.7, maxWidth: 560, margin: "0 auto 64px",
          }}>
            Everything you need to know about HomeGentic's verified home records,
            data ownership, and subscription plans.
          </p>
        </div>

        {/* FAQ list */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 56px 100px" }}>
          {FAQS.map((item) => (
            <FaqRow key={item.q} item={item} />
          ))}
          <div style={{ borderTop: `1px solid ${UI.rule}` }} />

          {/* Still have questions */}
          <div style={{
            marginTop: 64, padding: "40px 48px",
            background: `linear-gradient(135deg, ${UI.blush}, ${UI.butter})`,
            borderRadius: 24, textAlign: "center",
          }}>
            <p style={{
              fontFamily: UI.serif, fontSize: 22, fontWeight: 700,
              color: UI.ink, margin: "0 0 10px",
            }}>
              Still have questions?
            </p>
            <p style={{
              fontFamily: UI.sans, fontSize: 15, color: UI.inkLight,
              margin: "0 0 24px", lineHeight: 1.6,
            }}>
              Our support team is happy to help.
            </p>
            <Link
              to="/support"
              style={{
                display: "inline-block",
                fontFamily: UI.sans, fontSize: 14, fontWeight: 600,
                color: UI.paper, background: UI.ink, textDecoration: "none",
                padding: "10px 28px", borderRadius: 100,
              }}
            >
              Contact Support
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ background: "#1E1928", padding: "64px 56px 32px", fontFamily: UI.sans }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 48, marginBottom: 52 }}>
            <div>
              <span style={{ fontFamily: UI.serif, fontSize: 24, fontWeight: 900, color: "white", marginBottom: 14, display: "block" }}>
                Home<span style={{ color: UI.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
              </span>
              <p style={{ fontSize: 14, color: "rgba(253,252,250,0.45)", lineHeight: 1.65, maxWidth: 220, margin: "0 0 24px" }}>
                The verified maintenance record that makes your home worth more and easier to sell.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(253,252,250,0.35)", marginBottom: 20 }}>Product</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[["Pricing", "/pricing"], ["Gift a Sub", "/gift"], ["FAQ", "/faq"]].map(([label, href]) => (
                  <li key={label}><Link to={href} style={{ fontSize: 14, color: "rgba(253,252,250,0.6)", textDecoration: "none" }}>{label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(253,252,250,0.35)", marginBottom: 20 }}>Free Tools</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[["Report Lookup", "/check"], ["System Forecast", "/instant-forecast"], ["Price Lookup", "/prices"], ["Systems Estimator", "/home-systems"]].map(([label, href]) => (
                  <li key={label}><Link to={href} style={{ fontSize: 14, color: "rgba(253,252,250,0.6)", textDecoration: "none" }}>{label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(253,252,250,0.35)", marginBottom: 20 }}>Company</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Support", "/support"]].map(([label, href]) => (
                  <li key={label}><Link to={href} style={{ fontSize: 14, color: "rgba(253,252,250,0.6)", textDecoration: "none" }}>{label}</Link></li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(253,252,250,0.08)", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "rgba(253,252,250,0.35)" }}>
            <span>© 2026 HomeGentic Inc.</span>
            <div style={{ display: "flex", gap: 24 }}>
              <Link to="/privacy" style={{ color: "rgba(253,252,250,0.35)", textDecoration: "none" }}>Privacy</Link>
              <Link to="/terms"   style={{ color: "rgba(253,252,250,0.35)", textDecoration: "none" }}>Terms</Link>
              <Link to="/support" style={{ color: "rgba(253,252,250,0.35)", textDecoration: "none" }}>Support</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
