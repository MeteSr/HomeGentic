import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { COLORS, FONTS, RADIUS } from "@/theme";

const UI = {
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

const EFFECTIVE_DATE = "April 5, 2026";

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <>
        <p>HomeGentic ("we", "us", "our") operates homegentic.app. This Privacy Policy explains what information we collect, how we use it, and what choices you have. We built HomeGentic on the Internet Computer Protocol (ICP) — a decentralized, blockchain-based cloud platform — which means your property records are stored on-chain rather than in a traditional database we own and control.</p>
        <p>If you have questions or concerns, contact us at <a href="mailto:privacy@homegentic.app" style={{ color: UI.sage }}>privacy@homegentic.app</a>.</p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    body: (
      <>
        <p><strong>Account information.</strong> When you sign in with Internet Identity, we receive a pseudonymous principal (a cryptographic identifier) tied to your device. We do not receive your name, email address, or password — Internet Identity issues no passwords and stores no personal identifiers on our servers.</p>
        <p><strong>Profile data you provide.</strong> You may choose to add a display name, contact email, and role (Homeowner, Contractor, or Realtor) to your HomeGentic profile. This data is stored in the <code>auth</code> canister on ICP.</p>
        <p><strong>Property and job records.</strong> Addresses, photos, maintenance job descriptions, contractor details, receipts, and related data you upload are stored in ICP canisters. These records are replicated across ICP subnet nodes worldwide and governed by a decentralized protocol — no single company, including HomeGentic, can unilaterally delete them.</p>
        <p><strong>Billing information.</strong> Subscription payments are processed by our payment provider. We store only your subscription tier and expiry date. We never see or store full card numbers, bank account numbers, or other raw payment credentials.</p>
        <p><strong>Usage data.</strong> We log server-side events (route hits, error rates, canister call latency) for reliability monitoring. These logs do not contain property record content. We do not use third-party behavioral analytics or ad-tracking pixels.</p>
        <p><strong>Voice agent interactions.</strong> If you use the voice assistant, your message and property context are sent to Anthropic's Claude API to generate a response. These requests are not stored by HomeGentic beyond the duration of the API call. Review Anthropic's <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: UI.sage }}>Privacy Policy</a> for how they handle API data.</p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How We Use Your Information",
    body: (
      <ul>
        <li>Providing and improving the HomeGentic platform and its features.</li>
        <li>Processing subscription payments and managing tier access.</li>
        <li>Generating your HomeGentic Score, maintenance recommendations, and shared reports.</li>
        <li>Responding to support requests you initiate.</li>
        <li>Monitoring service reliability, debugging errors, and preventing abuse.</li>
        <li>Sending transactional communications (subscription receipts, cancellation confirmations) where you have provided an email address.</li>
      </ul>
    ),
  },
  {
    id: "icp-blockchain",
    title: "Your Data on the ICP Blockchain",
    body: (
      <>
        <p>Property records, maintenance jobs, photos, and reports written to ICP canisters are replicated across multiple independent node providers globally. This design gives you strong guarantees against data loss, but it also means that on-chain records cannot be fully erased in the traditional sense — the protocol's history is immutable.</p>
        <p>Practically, this means:</p>
        <ul>
          <li>Your records remain readable even if HomeGentic as a company ceases to operate.</li>
          <li>HomeGentic cannot unilaterally delete a record once it has been finalized on-chain.</li>
          <li>We can mark records as deleted in our application layer (making them invisible in the UI), but the underlying canister history persists.</li>
        </ul>
        <p>We consider this a feature, not a limitation — your maintenance history is a financial asset that should outlast any single company.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Information Sharing and Disclosure",
    body: (
      <>
        <p><strong>We do not sell your personal data.</strong></p>
        <p>We share data only in the following limited circumstances:</p>
        <ul>
          <li><strong>With your consent.</strong> When you generate a shareable HomeGentic Report, you choose whether it is public, link-only, or private. You control who sees it.</li>
          <li><strong>Service providers.</strong> We use Anthropic (AI), a payment processor, and infrastructure providers. Each is bound by data processing agreements that prohibit them from using your data for their own purposes.</li>
          <li><strong>Legal requirements.</strong> We may disclose information if required by law, subpoena, or to protect the rights, property, or safety of HomeGentic, our users, or the public.</li>
          <li><strong>Business transfers.</strong> If HomeGentic is acquired or merges with another company, your data may be transferred. We will notify you via email or a prominent notice on the site before your data is transferred and becomes subject to a different privacy policy.</li>
        </ul>
      </>
    ),
  },
  {
    id: "subscriptions-billing",
    title: "Subscriptions and Billing",
    body: (
      <>
        <p>HomeGentic offers paid subscription tiers: Basic ($10/month), Pro ($20/month), Premium ($35/month), and ContractorPro ($30/month).</p>
        <p><strong>Cancellation.</strong> You may cancel your subscription at any time from your account Settings page. Cancellation takes effect at the end of your current billing period — you will retain full access to your paid tier's features until that date. If you cancel five days into a monthly billing cycle, you can continue using all paid features for the remaining days of that month.</p>
        <p><strong>No refunds.</strong> We do not offer partial-month or partial-year refunds on subscription fees. Because access continues through the end of the paid period, charges for the current period are non-refundable.</p>
        <p><strong>Blockchain records after cancellation.</strong> Your property records and maintenance history on ICP remain accessible and downloadable regardless of subscription status. Tier-gated features (additional properties, photos, quote slots) revert to Free limits, but all data you entered remains yours.</p>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "Data Retention and Deletion",
    body: (
      <>
        <p><strong>Account and profile data.</strong> If you delete your HomeGentic account, we remove your profile information and disassociate your principal from application-layer records within 30 days.</p>
        <p><strong>On-chain records.</strong> As described above, records written to ICP canisters cannot be fully erased from the blockchain's history. We will mark them as deleted in our application index, making them inaccessible via the HomeGentic interface.</p>
        <p><strong>Server logs.</strong> Infrastructure logs are retained for up to 90 days for reliability and security purposes, then deleted.</p>
        <p>To request deletion of your account, email <a href="mailto:privacy@homegentic.app" style={{ color: UI.sage }}>privacy@homegentic.app</a>. We will respond within 30 days.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>We use Internet Identity for authentication, which means no passwords are stored — your identity is secured by your device's hardware key or passkey. Data in transit is encrypted via TLS. ICP canister data is replicated and integrity-protected by the protocol. We conduct periodic security reviews and follow responsible disclosure practices. If you discover a security vulnerability, please report it to <a href="mailto:security@homegentic.app" style={{ color: UI.sage }}>security@homegentic.app</a>.</p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and Tracking",
    body: (
      <p>HomeGentic does not use advertising cookies or third-party tracking pixels. We use a small number of first-party, session-only cookies and localStorage entries (e.g., sidebar state, draft form data). We do not use Google Analytics, Meta Pixel, or similar behavioral tracking services.</p>
    ),
  },
  {
    id: "children",
    title: "Children's Privacy",
    body: (
      <p>HomeGentic is not directed at children under 13. We do not knowingly collect personal information from children under 13. If we learn that we have inadvertently collected such information, we will delete it promptly.</p>
    ),
  },
  {
    id: "your-rights",
    title: "Your Privacy Rights",
    body: (
      <>
        <p>Depending on your location, you may have rights to access, correct, port, or delete your personal data. To exercise any of these rights, contact us at <a href="mailto:privacy@homegentic.app" style={{ color: UI.sage }}>privacy@homegentic.app</a>. We will respond within 30 days. Note that on-chain records are subject to the immutability constraints described above.</p>
        <p>If you are in the European Economic Area, you may also have the right to lodge a complaint with your local data protection authority.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    body: (
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Effective date" at the top of this page and, where appropriate, by email. Continued use of HomeGentic after changes become effective constitutes your acceptance of the revised policy.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact Us",
    body: (
      <p>HomeGentic, Inc. · <a href="mailto:privacy@homegentic.app" style={{ color: UI.sage }}>privacy@homegentic.app</a> · For support inquiries, visit our <Link to="/support" style={{ color: UI.sage }}>Support page</Link>.</p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy — HomeGentic</title>
        <meta name="description" content="HomeGentic's Privacy Policy: how we collect, use, and protect your data, including your rights around ICP blockchain records and subscription cancellation." />
        <link rel="canonical" href="https://homegentic.app/privacy" />
        <meta property="og:title" content="Privacy Policy — HomeGentic" />
        <meta property="og:description" content="How HomeGentic collects, uses, and protects your data." />
        <meta property="og:url" content="https://homegentic.app/privacy" />
      </Helmet>

      <div style={{ minHeight: "100vh", background: UI.paper, fontFamily: UI.sans }}>
        {/* Nav */}
        <header style={{ borderBottom: `1px solid ${UI.rule}`, position: "sticky", top: 0, background: UI.paper, zIndex: 50 }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: UI.serif, fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.5px", color: UI.ink }}>
              Home<span style={{ color: UI.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
            </Link>
            <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: UI.mono, fontSize: "0.7rem", letterSpacing: "0.06em", color: UI.inkLight }}>PRICING</Link>
              <Link to="/support" style={{ textDecoration: "none", fontFamily: UI.mono, fontSize: "0.7rem", letterSpacing: "0.06em", color: UI.inkLight }}>SUPPORT</Link>
            </nav>
          </div>
        </header>

        <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>

          {/* Header */}
          <div style={{ marginBottom: "3rem", paddingBottom: "2rem", borderBottom: `1px solid ${UI.rule}` }}>
            <div style={{ display: "inline-flex", alignItems: "center", background: UI.butter, color: UI.ink, padding: "5px 16px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 700, fontFamily: UI.mono, letterSpacing: "0.06em", marginBottom: "1.25rem", border: `1px solid rgba(46,37,64,0.1)` }}>
              LEGAL
            </div>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.05, color: UI.ink, marginBottom: "0.75rem" }}>
              Privacy Policy
            </h1>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
              Effective date: {EFFECTIVE_DATE}
            </p>
          </div>

          {/* Table of contents */}
          <nav aria-label="Table of contents" style={{ background: UI.sageLight, padding: "1.25rem 1.5rem", borderRadius: RADIUS.sm, marginBottom: "3rem", border: `1px solid ${COLORS.sageMid}` }}>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.75rem", fontWeight: 700 }}>CONTENTS</p>
            <ol style={{ margin: 0, padding: "0 0 0 1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.ink, textDecoration: "none", fontWeight: 500 }}>
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
                <h2 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.25rem", color: UI.ink, marginBottom: "1rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, letterSpacing: "0.06em" }}>{String(i + 1).padStart(2, "0")}</span>
                  {section.title}
                </h2>
                <div style={{ fontFamily: UI.sans, fontSize: "0.9375rem", lineHeight: 1.75, color: UI.inkLight, fontWeight: 300, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  {section.body}
                </div>
                {i < SECTIONS.length - 1 && (
                  <div style={{ marginTop: "2.5rem", borderBottom: `1px solid ${UI.rule}` }} />
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${UI.rule}`, padding: "2rem 1.5rem", textAlign: "center" }}>
          <div style={{ maxWidth: "52rem", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: UI.serif, fontWeight: 900, fontSize: "1rem", color: UI.ink }}>
              Home<span style={{ color: UI.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
            </Link>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              <Link to="/support" style={{ textDecoration: "none", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>SUPPORT</Link>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>PRICING</Link>
            </div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.inkLight }}>© 2026 HomeGentic Inc.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
