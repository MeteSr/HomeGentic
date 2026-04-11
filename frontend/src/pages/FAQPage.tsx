import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { COLORS, FONTS } from "@/theme";

const S = {
  paper:    COLORS.white,
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  sageLight: COLORS.sageLight,
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
    q: "Do contractors need to be on HomeGentic to log work?",
    a: "Contractors need a HomeGentic account to co-sign a job record. However, homeowners can log jobs independently as self-verified entries for any work performed by off-platform providers.",
  },
  {
    q: "What subscription tier do I need?",
    a: "The Free tier covers one property with up to 2 photos per job and 3 open quote requests — enough to get started. Pro ($10/mo) supports 5 properties and 10 photos per job. Premium ($20/mo) scales to 20 properties. See the full comparison on our Pricing page.",
  },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderTop: `1px solid ${S.rule}`,
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
            fontFamily: S.sans,
            fontWeight: 700,
            fontSize: "1rem",
            color: S.ink,
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
            color: S.sage,
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
            fontFamily: S.sans,
            fontWeight: 400,
            fontSize: "0.9rem",
            color: S.inkLight,
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

      <div style={{ background: S.paper, minHeight: "100vh", fontFamily: S.sans }}>

        {/* Nav */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 56px", height: 64, borderBottom: `1px solid ${S.rule}`,
          background: S.paper, position: "sticky", top: 0, zIndex: 100,
        }}>
          <Link
            to="/"
            style={{
              fontFamily: S.serif, fontSize: 20, fontWeight: 900,
              color: S.ink, textDecoration: "none", letterSpacing: "-0.5px",
            }}
          >
            Home<span style={{ color: S.sage }}>Gentic</span>
          </Link>
          <Link
            to="/login"
            style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700,
              letterSpacing: "1px", textTransform: "uppercase",
              color: S.ink, textDecoration: "none",
              border: `1px solid ${S.ink}`, padding: "8px 20px",
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
            fontFamily: S.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "2px", textTransform: "uppercase",
            color: S.sage, marginBottom: 20,
          }}>
            ✦ FAQ
          </div>
          <h1 style={{
            fontFamily: S.serif, fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 900, color: S.ink, letterSpacing: "-1.5px",
            lineHeight: 1.05, margin: "0 0 20px",
          }}>
            Frequently Asked<br />
            <em style={{ fontStyle: "italic", fontWeight: 300, color: S.sage }}>Questions</em>
          </h1>
          <p style={{
            fontFamily: S.sans, fontSize: 17, color: S.inkLight,
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
          <div style={{ borderTop: `1px solid ${S.rule}` }} />

          {/* Still have questions */}
          <div style={{
            marginTop: 64, padding: "40px 48px",
            background: "#F7F5F0", border: `1px solid ${S.rule}`,
            textAlign: "center",
          }}>
            <p style={{
              fontFamily: S.serif, fontSize: 22, fontWeight: 700,
              color: S.ink, margin: "0 0 10px",
            }}>
              Still have questions?
            </p>
            <p style={{
              fontFamily: S.sans, fontSize: 15, color: S.inkLight,
              margin: "0 0 24px", lineHeight: 1.6,
            }}>
              Our support team is happy to help.
            </p>
            <Link
              to="/support"
              style={{
                display: "inline-block",
                fontFamily: S.mono, fontSize: 12, fontWeight: 700,
                letterSpacing: "1px", textTransform: "uppercase",
                color: S.paper, background: S.ink, textDecoration: "none",
                padding: "14px 32px",
              }}
            >
              Contact Support →
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${S.rule}`, padding: "28px 56px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: S.mono, fontSize: 11, color: S.inkLight,
          flexWrap: "wrap", gap: 12,
        }}>
          <span>© 2026 HomeGentic Inc.</span>
          <div style={{ display: "flex", gap: 24 }}>
            <Link to="/privacy" style={{ color: S.inkLight, textDecoration: "none" }}>Privacy</Link>
            <Link to="/terms"   style={{ color: S.inkLight, textDecoration: "none" }}>Terms</Link>
            <Link to="/support" style={{ color: S.inkLight, textDecoration: "none" }}>Support</Link>
          </div>
        </div>

      </div>
    </>
  );
}
