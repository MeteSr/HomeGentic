import React from "react";
import { Link } from "react-router-dom";
import { PageHead } from "@/components/PageHead";

const C = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  yellowText: "#8A6D00",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#62677A",
  border: "#EDEEF2",
  white:  "#FFFFFF",
  blueFg: "#F3F4FF",
};
const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

const EFFECTIVE_DATE = "October 31, 2026";

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

interface Recipient { who: string; gets: string; why: string }

/** Every outside service that receives user data. Keep in step with the code. */
const RECIPIENTS: Recipient[] = [
  { who: "DFINITY / Internet Computer node providers", gets: "Everything stored in HomeGentic's canisters (profile, properties, jobs, photos, documents, bills, reports)", why: "Hosting. Our canisters run on independent node machines on the Internet Computer." },
  { who: "Anthropic (Claude)", gets: "Your questions to the assistant with your property and job context; documents, bills and photos you ask us to read; addresses and claims for a Buyer's Truth Kit; insurer-discount inputs", why: "AI answers and document extraction" },
  { who: "Stripe", gets: "Payment details (entered directly with Stripe), your email, your HomeGentic account ID, gift recipient details; for identity checks, your ID document images, a selfie and the name on your ID", why: "Card payments, subscriptions, gifts and identity verification" },
  { who: "Cloudflare", gets: "Your IP address and request details for calls to our AI, payment, email and notification services; Turnstile bot checks on our lead form", why: "Runs those services (Workers) and blocks abuse" },
  { who: "Resend", gets: "Email addresses and message content (invites, gift emails, notifications, lead-form messages)", why: "Sending email" },
  { who: "Twilio", gets: "Your phone number and text message content", why: "Text alerts and phone-number verification" },
  { who: "Sentry (Functional Software, Inc.)", gets: "Crash reports from the mobile app: the error, the screen it happened on, device model and OS version. No name, email or IP address, and share or invite links are removed first", why: "Finding and fixing app crashes" },
  { who: "Apple (APNs), Google (FCM) and Expo", gets: "Push-notification tokens and notification content", why: "Push notifications" },
  { who: "ATTOM and RentCast", gets: "Property addresses", why: "Property records, valuations and rent estimates" },
  { who: "OpenPermit and city/county permit portals", gets: "Property addresses", why: "Building-permit lookups" },
  { who: "OpenStreetMap (Nominatim)", gets: "Addresses you type", why: "Turning an address into map coordinates" },
  { who: "Google (Places API)", gets: "The street address you type when adding a home (sent from our servers, not your browser)", why: "Address suggestions" },
  { who: "Google Fonts", gets: "Your IP address and browser details when a page loads", why: "Web fonts" },
  { who: "Smart-home vendors you connect (e.g. Nest, Ecobee, Moen, Honeywell, Rheem, Sense, Emporia, Rachio, SmartThings, Home Assistant)", gets: "The sign-in authorisation you grant; we receive device readings and alerts back", why: "Device monitoring you turn on" },
  { who: "Contractors and real-estate agents on HomeGentic", gets: "Your property address and job or listing details when you request quotes, invite a contractor or list a home", why: "Quotes, job confirmation and Bid to List" },
  { who: "People you share a report with", gets: "Whatever the report includes, at the visibility you choose", why: "Sharing your home's record" },
];

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <>
        <p>HomeGentic ("we", "us", "our") operates homegentic.app and the HomeGentic mobile app. This Privacy Policy explains what information we collect, who we share it with, how long we keep it, and how to delete it. HomeGentic runs on the Internet Computer (ICP): your records are stored in HomeGentic's own canisters (programs with their own storage) running on independent node machines, rather than in a conventional cloud database.</p>
        <p>If you have questions or concerns, contact us at <a href="mailto:privacy@homegentic.app" style={{ color: C.blue }}>privacy@homegentic.app</a>.</p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    body: (
      <>
        <p><strong>Sign-in.</strong> You sign in with Internet Identity, which gives us a pseudonymous account ID (a "principal"). Internet Identity uses passkeys, so we never handle a password.</p>
        <p><strong>Profile.</strong> Your role (Homeowner, Contractor, Realtor or Builder) and an email address are required to create an account. A phone number is optional and used only for text alerts. Contractors and agents also give us business details such as name, licence number, brokerage and service area.</p>
        <p><strong>Property and home records.</strong> Property addresses, details about the home, maintenance jobs, photos, receipts, scanned documents, utility bills, recurring services, rooms and fixtures, smart-home device readings, quote requests and listings that you or people you invite add.</p>
        <p><strong>Ownership and identity checks.</strong> To verify a property you upload an ownership document, and you may complete an identity check with Stripe. Stripe collects your ID images and selfie and keeps them; HomeGentic stores only the result, the Stripe session reference and the name on your ID.</p>
        <p><strong>Billing.</strong> Card payments go directly to Stripe; we never see your full card number. We store your plan, its expiry and cancellation date, gift details (recipient name, email and message), credit balances, and records of platform and referral fees.</p>
        <p><strong>AI assistant.</strong> When you use the assistant or ask us to read a document, the request and the context needed to answer it are sent to Anthropic. We count your requests to enforce plan limits but do not keep the conversation.</p>
        <p><strong>Report alerts.</strong> If you ask on the address lookup page to be told when a public report appears, we keep that address and your email on our notification server, send one email when a public report exists, and then delete the request. Requests that never match are deleted after 180 days. You don't need an account for this.</p>
        <p><strong>Showing requests.</strong> If you ask to see a home listed for sale by its owner, the name, email or phone number and preferred time you enter are stored on the HomeGentic platform and shown to the seller, who contacts you directly. If you aren't signed in, your browser keeps a random key that signs the request, so we can limit how many requests one visitor sends; it isn't linked to an account. The request is deleted when the seller takes the listing down or deletes their account.</p>
        <p><strong>Device and usage data.</strong> Our services log requests (time, route, errors, IP address) for reliability and abuse prevention. The mobile app stores a push-notification token if you turn notifications on. We do not use advertising trackers or third-party behavioural analytics.</p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How We Use Your Information",
    body: (
      <ul>
        <li>Running HomeGentic: storing your records, showing them to you and the people you share them with.</li>
        <li>Charging for and managing subscriptions, gifts, credits and fees.</li>
        <li>Verifying property ownership, contractor and agent details, and identity.</li>
        <li>Generating your HomeGentic Score, maintenance recommendations, reports and AI answers.</li>
        <li>Sending emails, texts and push notifications you have turned on, and transactional messages such as receipts.</li>
        <li>Responding to support requests, keeping the service reliable, and preventing fraud and abuse.</li>
      </ul>
    ),
  },
  {
    id: "where-data-lives",
    title: "Where Your Data Is Stored",
    body: (
      <>
        <p>Your records are stored in HomeGentic's canisters on the Internet Computer. Each canister's data is replicated across several independent node machines, which protects against data loss. HomeGentic controls these canisters: we can update, correct and delete the records in them, and we pay to keep them running.</p>
        <p>The Internet Computer is not a public ledger of your records: other people cannot browse them. Only you, the people you share with, and HomeGentic's own services can read them. You can export your records as a file at any time from Settings → Privacy.</p>
        <p><strong>Public by design.</strong> A property's street address is visible to other users while it is being claimed, so that two people can't claim the same home. Reports and listings you choose to share are visible to whoever has the link or, for public listings, to anyone.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who We Share Data With",
    body: (
      <>
        <p><strong>We do not sell your personal data</strong>, and we don't share it for advertising.</p>
        <p>We send data to the following services only as needed to run the features you use:</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                {["Recipient", "What they receive", "Why"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "0.5rem", borderBottom: `1px solid ${C.border}`, color: C.ink }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECIPIENTS.map((r) => (
                <tr key={r.who}>
                  <th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "0.5rem", borderBottom: `1px solid ${C.border}`, color: C.ink, fontWeight: 600 }}>{r.who}</th>
                  <td style={{ verticalAlign: "top", padding: "0.5rem", borderBottom: `1px solid ${C.border}` }}>{r.gets}</td>
                  <td style={{ verticalAlign: "top", padding: "0.5rem", borderBottom: `1px solid ${C.border}` }}>{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Each company handles this data under its own privacy policy. Public map and permit services receive only an address. We may also disclose information when required by law, to protect the safety of our users or the public, or as part of a merger or acquisition, in which case we will tell you before your data becomes subject to a different privacy policy.</p>
      </>
    ),
  },
  {
    id: "subscriptions-billing",
    title: "Subscriptions and Billing",
    body: (
      <>
        <p>HomeGentic offers paid plans: Pro ($59/year) and ContractorPro ($40/month or yearly). Paid plans bought by card renew automatically until you cancel.</p>
        <p><strong>Cancellation.</strong> Cancel any time from Settings → Subscription. We stop the renewal with Stripe straight away, so you won't be charged again, and you keep your paid features until the end of the period you've paid for. Then your account moves to the Free plan.</p>
        <p><strong>Refunds.</strong> We do not offer partial-month or partial-year refunds.</p>
        <p><strong>Gifts.</strong> A gift is a one-time payment for one year of Pro. It does not renew. We email the recipient a link to redeem it.</p>
        <p><strong>After cancelling.</strong> Your records stay in your account and you can still export them. Paid limits (number of properties, photos, quote requests) go back to the Free limits.</p>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "Data Retention and Deletion",
    body: (
      <>
        <p><strong>Deleting your account.</strong> You can delete your account yourself in Settings → Privacy (on the web; the mobile app links there). This stops your subscription from renewing and removes your profile, properties, jobs, photos, documents, bills, reports and share links, quote requests, smart-home devices, listings and contractor or agent profile from our canisters straight away. You can also ask us by emailing <a href="mailto:privacy@homegentic.app" style={{ color: C.blue }}>privacy@homegentic.app</a>; we will respond within 30 days.</p>
        <p><strong>What we keep.</strong> Payment, gift, credit, platform-fee and referral records, and our log of administrative actions, which we need for tax, accounting and fraud prevention. Jobs a contractor logged on someone else's home stay on that home's record. Photos, bills and schedule entries that someone you invited added to your home are tied to their account, so they stay until that person deletes them. Confirmations you gave on other people's records (such as photo approvals) stay with them. Stripe, Anthropic and the other services listed above keep data under their own retention policies; Stripe keeps identity-check images under its policy.</p>
        <p><strong>Logs.</strong> Service logs are kept for up to 90 days.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>Internet Identity means there is no password to steal; your account is secured by your device's passkey. Data in transit is encrypted with TLS, and canister data is replicated across independent machines. We review our security regularly. If you discover a vulnerability, please report it to <a href="mailto:security@homegentic.app" style={{ color: C.blue }}>security@homegentic.app</a>.</p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and Local Storage",
    body: (
      <p>HomeGentic does not use advertising cookies or tracking pixels, and we don't use Google Analytics, Meta Pixel or similar services. Your browser keeps some HomeGentic data in local storage: your sign-in session, and conveniences such as drafts, dismissed tips and recent score history. Some of it stays until you sign out or clear your browser data. Loading our pages also fetches fonts from Google Fonts, which sees your IP address.</p>
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
        <p>Depending on where you live, you may have rights to access, correct, export or delete your personal data. You can export and delete your data yourself in Settings → Privacy, or contact us at <a href="mailto:privacy@homegentic.app" style={{ color: C.blue }}>privacy@homegentic.app</a> and we will respond within 30 days.</p>
        <p>If you are in the European Economic Area or the UK, you may also have the right to lodge a complaint with your local data protection authority.</p>
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
      <p>HomeGentic, Inc. · <a href="mailto:privacy@homegentic.app" style={{ color: C.blue }}>privacy@homegentic.app</a> · For support inquiries, visit our <Link to="/support" style={{ color: C.blue }}>Support page</Link>.</p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHead>
        <title>Privacy Policy — HomeGentic</title>
        <meta name="description" content="HomeGentic's Privacy Policy: what we collect, who we share it with, how long we keep it, and how to export or delete your data." />
        <link rel="canonical" href="https://homegentic.app/privacy" />
        <meta property="og:title" content="Privacy Policy — HomeGentic" />
        <meta property="og:description" content="How HomeGentic collects, uses, and protects your data." />
        <meta property="og:url" content="https://homegentic.app/privacy" />
      </PageHead>

      <div style={{ minHeight: "100vh", background: C.paper, fontFamily: F.body }}>

        {/* Nav */}
        <header style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.paper, zIndex: 50 }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
            <Link to="/" style={{ textDecoration: "none", fontFamily: F.display, fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.5px", color: C.ink }}>
              Home<span style={{ color: C.yellowText }}>Gentic</span>
            </Link>
            <nav style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <Link to="/pricing" style={{ textDecoration: "none", fontFamily: F.mono, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>PRICING</Link>
              <Link to="/support" style={{ textDecoration: "none", fontFamily: F.mono, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>SUPPORT</Link>
            </nav>
          </div>
        </header>

        <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>

          {/* Header */}
          <div style={{ marginBottom: "3rem", paddingBottom: "2rem", borderBottom: `1px solid ${C.border}` }}>
            <div style={{
              display: "inline-block",
              fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.12em",
              textTransform: "uppercase" as const, color: C.blue,
              marginBottom: "1rem",
            }}>
              Legal
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.05, color: C.ink, marginBottom: "0.75rem" }}>
              Privacy Policy
            </h1>
            <p style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.muted }}>
              Effective date: {EFFECTIVE_DATE}
            </p>
          </div>

          {/* Table of contents */}
          <nav aria-label="Table of contents" style={{ background: C.blueFg, padding: "1.25rem 1.5rem", borderRadius: 18, marginBottom: "3rem", border: `1px solid ${C.border}` }}>
            <p style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.blue, marginBottom: "0.75rem", fontWeight: 700 }}>CONTENTS</p>
            <ol style={{ margin: 0, padding: "0 0 0 1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} style={{ fontFamily: F.body, fontSize: "0.875rem", color: C.ink, textDecoration: "none", fontWeight: 500 }}>
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
                <h2 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.25rem", color: C.ink, marginBottom: "1rem", display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontFamily: F.mono, fontSize: "0.65rem", color: C.blue, letterSpacing: "0.12em" }}>{String(i + 1).padStart(2, "0")}</span>
                  {section.title}
                </h2>
                <div style={{ fontFamily: F.body, fontSize: "0.9375rem", lineHeight: 1.75, color: C.muted, fontWeight: 400, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  {section.body}
                </div>
                {i < SECTIONS.length - 1 && (
                  <div style={{ marginTop: "2.5rem", borderBottom: `1px solid ${C.border}` }} />
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer style={{ background: C.ink, padding: "32px 1.5rem", fontFamily: F.body }}>
          <div style={{ maxWidth: "52rem", margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
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
