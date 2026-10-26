import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
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
    a: "When a contractor completes a job on HomeGentic, both the homeowner and the contractor sign off on the record from their own accounts. Once both have signed, the job is locked: nobody can edit it. Reports and score certificates built from your record are signed by HomeGentic, so a buyer or lender can check a copy hasn't been altered at homegentic.app/verify-record.",
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
    a: "You can export your full record as a file at any time from Settings → Privacy, so keep a copy. Your records live in canisters that HomeGentic runs and pays for on the Internet Computer, so they depend on HomeGentic keeping those canisters running.",
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
    a: "The HomeGentic Score is a 0–100 grade built from your job record in three parts. Maintenance Coverage (40%): whether each key system (HVAC, roof, plumbing, electrical, windows, plus any other trade) has work on record. A system counts once, from its best job: full weight when the job is verified, less when it is self-reported or unsigned, so many small jobs on one system can't outweigh work on another. System Modernization (35%): how much rated life your major systems have left, counted from the last replacement or major job you logged on each, or from the year the house was built. Verification Depth (25%): the share of your jobs that are verified. Scores are graded A+ through F. Score certificates and reports use exactly this formula. Your dashboard can also show points lost to lapsed warranties, overdue maintenance and long gaps without verified work, listed in the Property panel. Your score is private by default: it is only visible to you and in the reports, certificates and listings you choose to share.",
  },
  {
    q: "What subscription tier do I need?",
    a: "HomeGentic has one paid plan: Pro, $59/year. It covers up to 20 properties, 30 photos per job, and unlimited quote requests. See the full feature list on our Pricing page.",
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
      <PageHead>
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
      </PageHead>

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
            Home<span style={{ color: C.yellowText }}>Gentic</span>
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
