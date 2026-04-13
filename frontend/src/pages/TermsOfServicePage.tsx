import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { COLORS, FONTS, RADIUS } from "@/theme";

const S = {
  paper:    COLORS.white,
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  sageLight: COLORS.sageLight,
  butter:   COLORS.butter,
  serif:    FONTS.serif,
  sans:     FONTS.sans,
  mono:     FONTS.mono,
};

const EFFECTIVE_DATE = "April 9, 2026";

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    body: (
      <p>By creating a HomeGentic account or using any HomeGentic service, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use HomeGentic. These Terms form a binding agreement between you and HomeGentic, Inc. ("HomeGentic", "we", "us", "our"), a Florida corporation.</p>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility",
    body: (
      <>
        <p>You must be at least 18 years old and capable of entering a legally binding contract to use HomeGentic. By registering, you represent that you meet these requirements. HomeGentic is intended for use in the United States. We make no representation that the service is appropriate or available for use in other jurisdictions.</p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and Registration",
    body: (
      <>
        <p>HomeGentic uses Internet Identity for authentication — a decentralized, passwordless system operated by the DFINITY Foundation. You are responsible for maintaining the security of your device and any passkeys used to access your account.</p>
        <p>You may register as a Homeowner, Contractor, or Realtor. You agree to provide accurate information and to update it as necessary. You may not create accounts for others without their express consent or operate multiple accounts to circumvent tier limits.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    body: (
      <>
        <p>You agree to use HomeGentic only for its intended purpose: managing residential property records, maintenance history, contractor relationships, and home transactions. You agree not to:</p>
        <ul>
          <li>Scrape, crawl, or systematically extract data from HomeGentic by automated means.</li>
          <li>Use HomeGentic to store or transmit illegal content, or content that infringes third-party intellectual property rights.</li>
          <li>Attempt to gain unauthorized access to any canister, system, or account.</li>
          <li>Interfere with or disrupt the integrity or performance of the service.</li>
          <li>Upload content that is false, misleading, defamatory, or fraudulent — including fraudulent property records or job completions.</li>
          <li>Use HomeGentic for any commercial purpose not expressly permitted, including reselling access or data.</li>
        </ul>
        <p>We reserve the right to suspend or terminate accounts that violate these rules.</p>
      </>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions and Billing",
    body: (
      <>
        <p>HomeGentic offers the following subscription tiers:</p>
        <ul>
          <li><strong>Basic</strong> — 1 property, 5 photos per job, 3 open quote requests. $10/month.</li>
          <li><strong>Pro</strong> — 5 properties, 10 photos per job, 10 open quote requests. $20/month.</li>
          <li><strong>Premium</strong> — 20 properties, 30 photos per job, unlimited quote requests. $35/month.</li>
          <li><strong>ContractorPro</strong> — Unlimited properties, 50 photos per job, unlimited quote requests. $30/month.</li>
        </ul>
        <p><strong>Auto-renewal.</strong> Paid subscriptions renew automatically at the end of each billing period (monthly or annual, depending on plan) unless cancelled before the renewal date.</p>
        <p><strong>Cancellation.</strong> You may cancel at any time from your Settings page. Cancellation takes effect at the end of the current paid period. Access to paid features continues through that date.</p>
        <p><strong>Refund policy.</strong> All subscription fees are non-refundable. Because access continues through the end of the paid period, we do not issue partial-period refunds. If you believe you were charged in error, contact us at <a href="mailto:billing@homegentic.app" style={{ color: S.sage }}>billing@homegentic.app</a> within 30 days.</p>
        <p><strong>Price changes.</strong> We may change subscription prices on 30 days' notice. Continued use after a price change constitutes acceptance of the new price.</p>
      </>
    ),
  },
  {
    id: "user-content",
    title: "Your Content",
    body: (
      <>
        <p>You retain ownership of property records, photos, job logs, and other content you upload to HomeGentic ("Your Content"). By uploading content, you grant HomeGentic a limited, non-exclusive license to store, display, and process Your Content solely to provide the service to you.</p>
        <p>You represent that you have the right to upload Your Content and that it does not violate any law or third-party rights. You are solely responsible for the accuracy of property records and maintenance histories you create.</p>
        <p>Because Your Content is stored on the Internet Computer Protocol blockchain, it is replicated across decentralized nodes and cannot be fully erased from the protocol's history. See our <Link to="/privacy" style={{ color: S.sage }}>Privacy Policy</Link> for details.</p>
      </>
    ),
  },
  {
    id: "ai-disclaimer",
    title: "AI-Generated Content and Recommendations",
    body: (
      <>
        <p>HomeGentic's voice agent, HomeGentic Score, predictive maintenance suggestions, and market intelligence features are powered by artificial intelligence. <strong>These outputs are informational only and do not constitute legal, financial, engineering, or professional advice.</strong></p>
        <p>You should not rely solely on AI-generated recommendations for decisions involving significant financial expenditure, safety-critical repairs, or legal obligations. HomeGentic is not liable for decisions made based on AI-generated content.</p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    body: (
      <p>HomeGentic and its logos, design, software, and content (excluding Your Content) are owned by HomeGentic, Inc. and protected by US and international intellectual property laws. You may not copy, modify, distribute, or create derivative works from HomeGentic's software or content without our written permission.</p>
    ),
  },
  {
    id: "dmca",
    title: "DMCA / Copyright Agent",
    body: (
      <>
        <p>If you believe content on HomeGentic infringes your copyright, you may submit a takedown notice to our designated DMCA agent:</p>
        <p style={{ fontFamily: S.mono, fontSize: "0.8rem", lineHeight: 1.8 }}>
          HomeGentic, Inc. — DMCA Agent<br />
          <a href="mailto:dmca@homegentic.app" style={{ color: S.sage }}>dmca@homegentic.app</a>
        </p>
        <p>Your notice must include: (1) identification of the copyrighted work; (2) identification of the allegedly infringing material and its location; (3) your contact information; (4) a statement of good faith belief; (5) a statement of accuracy under penalty of perjury; and (6) your signature.</p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <>
        <p>HOMEGENTIC IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.</p>
        <p>HOMEGENTIC DOES NOT GUARANTEE THE ACCURACY, COMPLETENESS, OR TIMELINESS OF ANY PROPERTY DATA, MARKET ESTIMATES, OR CONTRACTOR INFORMATION ON THE PLATFORM.</p>
      </>
    ),
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    body: (
      <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, HOMEGENTIC AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL HOMEGENTIC'S TOTAL LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO HOMEGENTIC IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) $100 USD.</p>
    ),
  },
  {
    id: "indemnification",
    title: "Indemnification",
    body: (
      <p>You agree to indemnify, defend, and hold harmless HomeGentic, Inc. and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or in any way connected with your use of the service, Your Content, or your violation of these Terms.</p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing Law and Dispute Resolution",
    body: (
      <>
        <p>These Terms are governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict of law principles. You consent to the exclusive jurisdiction of the state and federal courts located in Florida for any dispute arising under these Terms.</p>
        <p>Before filing any legal action, you agree to first contact us at <a href="mailto:legal@homegentic.app" style={{ color: S.sage }}>legal@homegentic.app</a> and attempt to resolve the dispute informally for at least 30 days.</p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <p>We may suspend or terminate your account at any time for violation of these Terms, at our sole discretion, with or without notice. Upon termination, your right to use the service ceases immediately. Provisions that by their nature should survive termination (including intellectual property, disclaimers, limitation of liability, and governing law) will survive.</p>
    ),
  },
  {
    id: "changes",
    title: "Changes to These Terms",
    body: (
      <p>We may update these Terms from time to time. We will notify you of material changes by updating the "Effective date" above and, where appropriate, by email. Continued use of HomeGentic after changes become effective constitutes your acceptance of the revised Terms.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact Us",
    body: (
      <p>HomeGentic, Inc. · <a href="mailto:legal@homegentic.app" style={{ color: S.sage }}>legal@homegentic.app</a> · For support inquiries, visit our <Link to="/support" style={{ color: S.sage }}>Support page</Link>. For privacy questions, see our <Link to="/privacy" style={{ color: S.sage }}>Privacy Policy</Link>.</p>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <>
      <Helmet>
        <title>Terms of Service — HomeGentic</title>
        <meta name="description" content="HomeGentic's Terms of Service: acceptable use, subscriptions, billing, AI disclaimers, and your legal rights." />
        <link rel="canonical" href="https://homegentic.app/terms" />
        <meta property="og:title" content="Terms of Service — HomeGentic" />
        <meta property="og:description" content="HomeGentic's Terms of Service." />
        <meta property="og:url" content="https://homegentic.app/terms" />
      </Helmet>

      <div style={{ minHeight: "100vh", background: S.paper, fontFamily: S.sans }}>
        {/* Nav */}
        <header style={{ borderBottom: `1px solid ${S.rule}`, position: "sticky", top: 0, background: S.paper, zIndex: 50 }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: S.serif, fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.5px", color: S.ink }}>
              Home<span style={{ color: S.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
            </Link>
            <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.06em", color: S.inkLight }}>PRICING</Link>
              <Link to="/support" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.06em", color: S.inkLight }}>SUPPORT</Link>
            </nav>
          </div>
        </header>

        <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>

          {/* Header */}
          <div style={{ marginBottom: "3rem", paddingBottom: "2rem", borderBottom: `1px solid ${S.rule}` }}>
            <div style={{ display: "inline-flex", alignItems: "center", background: S.butter, color: S.ink, padding: "5px 16px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 700, fontFamily: S.mono, letterSpacing: "0.06em", marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)` }}>
              LEGAL
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.05, color: S.ink, marginBottom: "0.75rem" }}>
              Terms of Service
            </h1>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
              Effective date: {EFFECTIVE_DATE}
            </p>
          </div>

          {/* Table of contents */}
          <nav aria-label="Table of contents" style={{ background: S.sageLight, padding: "1.25rem 1.5rem", borderRadius: RADIUS.sm, marginBottom: "3rem", border: `1px solid ${COLORS.sageMid}` }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.75rem", fontWeight: 700 }}>CONTENTS</p>
            <ol style={{ margin: 0, padding: "0 0 0 1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink, textDecoration: "none", fontWeight: 500 }}>
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            {SECTIONS.map((section, i) => (
              <section key={section.id} id={section.id}>
                <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink, marginBottom: "1rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, letterSpacing: "0.06em" }}>{String(i + 1).padStart(2, "0")}</span>
                  {section.title}
                </h2>
                <div style={{ fontFamily: S.sans, fontSize: "0.9375rem", lineHeight: 1.75, color: S.inkLight, fontWeight: 300, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  {section.body}
                </div>
                {i < SECTIONS.length - 1 && (
                  <div style={{ marginTop: "2.5rem", borderBottom: `1px solid ${S.rule}` }} />
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${S.rule}`, padding: "2rem 1.5rem", textAlign: "center" }}>
          <div style={{ maxWidth: "52rem", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", color: S.ink }}>
              Home<span style={{ color: S.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
            </Link>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              <Link to="/privacy" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>PRIVACY</Link>
              <Link to="/support" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>SUPPORT</Link>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>PRICING</Link>
            </div>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight }}>© 2026 HomeGentic Inc.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
