import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

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
        borderTop: `1px solid ${C.border}`,
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
            fontFamily: F.body,
            fontWeight: 700,
            fontSize: "1rem",
            color: C.ink,
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
            color: open ? C.blue : C.muted,
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
            fontFamily: F.body,
            fontWeight: 400,
            fontSize: "0.9rem",
            color: C.muted,
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

      <div style={{ background: C.paper, minHeight: "100vh", fontFamily: F.body }}>

        {/* Nav */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 56px", height: 64, borderBottom: `1px solid ${C.border}`,
          background: C.paper, position: "sticky", top: 0, zIndex: 100,
        }}>
          <Link
            to="/"
            style={{
              fontFamily: F.display, fontSize: 20, fontWeight: 800,
              color: C.ink, textDecoration: "none", letterSpacing: "-0.5px",
            }}
          >
            Home<span style={{ color: C.yellow }}>Gentic</span>
          </Link>
          <Link
            to="/login"
            style={{
              fontFamily: F.body, fontSize: 14, fontWeight: 600,
              color: C.paper, background: C.blue, textDecoration: "none",
              padding: "10px 22px", borderRadius: 100,
              boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
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
            fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.blue,
            marginBottom: 20,
          }}>
            Support / FAQ
          </div>
          <h1 style={{
            fontFamily: F.display, fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 800, color: C.ink, letterSpacing: "-1.5px",
            lineHeight: 1.05, margin: "0 0 20px",
          }}>
            Frequently Asked Questions
          </h1>
          <p style={{
            fontFamily: F.body, fontSize: 17, color: C.muted,
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
          <div style={{ borderTop: `1px solid ${C.border}` }} />

          {/* Still have questions */}
          <div style={{
            marginTop: 64, padding: "40px 48px",
            background: C.lblue,
            border: `1px solid ${C.border}`,
            borderRadius: 24, textAlign: "center",
          }}>
            <p style={{
              fontFamily: F.display, fontSize: 22, fontWeight: 800,
              color: C.ink, margin: "0 0 10px",
            }}>
              Still have questions?
            </p>
            <p style={{
              fontFamily: F.body, fontSize: 15, color: C.muted,
              margin: "0 0 24px", lineHeight: 1.6,
            }}>
              Our support team is happy to help.
            </p>
            <Link
              to="/support"
              style={{
                display: "inline-block",
                fontFamily: F.body, fontSize: 14, fontWeight: 600,
                color: C.paper, background: C.blue, textDecoration: "none",
                padding: "10px 28px", borderRadius: 100,
                boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
              }}
            >
              Contact Support
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ background: C.ink, padding: "32px 56px", fontFamily: F.body }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 16,
          }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
              © 2025 HomeGentic
            </span>
            <div style={{ display: "flex", gap: 24 }}>
              {[["Security", "/privacy#security"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Contact", "/support"]].map(([label, href]) => (
                <Link key={label} to={href} style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
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
