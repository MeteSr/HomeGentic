import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle, X, Home } from "lucide-react";
import { Button } from "@/components/Button";
import { PLANS } from "@/services/payment";
import { useAuth } from "@/contexts/AuthContext";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const FEATURES_TABLE = [
  { feature: "Properties",               Free: "1",    Pro: "5",    Premium: "Unlimited", ContractorPro: "—" },
  { feature: "Photos per job",            Free: "5",    Pro: "20",   Premium: "Unlimited", ContractorPro: "50" },
  { feature: "Quote requests/mo",         Free: "3",    Pro: "10",   Premium: "Unlimited", ContractorPro: "Unlimited" },
  { feature: "Public HomeFax report",     Free: true,   Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Blockchain verified",       Free: true,   Pro: true,   Premium: true,        ContractorPro: true },
  { feature: "Contractor search",         Free: false,  Pro: true,   Premium: true,        ContractorPro: true },
  { feature: "PDF export",               Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Priority support",         Free: false,  Pro: false,  Premium: true,        ContractorPro: true },
  { feature: "Contractor profile listing", Free: false, Pro: false,  Premium: false,       ContractorPro: true },
  { feature: "Trust score & reviews",    Free: false,  Pro: false,  Premium: false,       ContractorPro: true },
];

const FAQS = [
  { q: "How does blockchain verification work?", a: "Every maintenance job is stored as an immutable record on the Internet Computer Protocol. The data is cryptographically signed and cannot be altered — not even by us." },
  { q: "What is ICP?", a: "The Internet Computer Protocol is a decentralized cloud platform developed by DFINITY. Unlike traditional cloud storage, data on ICP is governed by a decentralized protocol — no single company can take it down." },
  { q: "Is my personal data secure?", a: "HomeFax uses Internet Identity for authentication — no passwords or emails are stored. Your property data is stored on-chain and only accessible to principals (identities) you authorize." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel your subscription at any time from your Settings page. Your data remains accessible and your blockchain records are permanent — even after cancellation." },
];

export default function PricingPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: S.paper }}>
      {/* Nav */}
      <header style={{ borderBottom: `1px solid ${S.rule}`, position: "sticky", top: 0, background: S.paper, zIndex: 50 }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <div style={{ width: "1.5rem", height: "1.5rem", background: S.rust, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={12} color="#F4F1EB" />
            </div>
            <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", color: S.ink }}>HomeFax</span>
          </Link>
          <Button size="sm" onClick={login}>Get Started Free</Button>
        </div>
      </header>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 1.5rem" }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.75rem" }}>
            Pricing
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1, color: S.ink, marginBottom: "1rem" }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            Start free. Upgrade when you're ready. Cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1px", background: S.rule, marginBottom: "4rem" }}>
          {PLANS.map((plan) => {
            const isPopular = plan.tier === "Pro";
            return (
              <div key={plan.tier} style={{ padding: "2rem", background: isPopular ? S.ink : "#fff", position: "relative" }}>
                {isPopular && (
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: isPopular ? "#F4F1EB" : S.inkLight, marginBottom: "0.5rem" }}>
                  {plan.tier}
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2.5rem", lineHeight: 1, color: isPopular ? "#F4F1EB" : S.ink }}>
                    {plan.price === 0 ? "Free" : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: isPopular ? "#7A7268" : S.inkLight }}>/{plan.period}</span>
                  )}
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: isPopular ? "#C8C3B8" : S.inkLight }}>
                      <CheckCircle size={12} color={isPopular ? S.rust : S.sage} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button variant={isPopular ? "primary" : "outline"} style={{ width: "100%" }} onClick={login}>
                  {plan.price === 0 ? "Get Started Free" : `Upgrade to ${plan.tier}`}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Feature comparison */}
        <div style={{ marginBottom: "4rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>Compare</div>
            <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>Feature comparison</h2>
          </div>
          <div style={{ border: `1px solid ${S.rule}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: S.paper }}>
                  <th style={{ textAlign: "left", padding: "0.875rem 1.25rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, borderBottom: `1px solid ${S.rule}` }}>
                    Feature
                  </th>
                  {["Free", "Pro", "Premium", "ContractorPro"].map((tier) => (
                    <th key={tier} style={{ textAlign: "center", padding: "0.875rem 1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: tier === "Pro" ? S.rust : S.inkLight, borderBottom: `1px solid ${S.rule}` }}>
                      {tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES_TABLE.map((row, i) => (
                  <tr key={row.feature} style={{ borderBottom: i < FEATURES_TABLE.length - 1 ? `1px solid ${S.rule}` : "none" }}>
                    <td style={{ padding: "0.75rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.ink, fontWeight: 500 }}>
                      {row.feature}
                    </td>
                    {(["Free", "Pro", "Premium", "ContractorPro"] as const).map((tier) => {
                      const val = (row as any)[tier];
                      return (
                        <td key={tier} style={{ textAlign: "center", padding: "0.75rem 1rem" }}>
                          {typeof val === "boolean" ? (
                            val ? (
                              <CheckCircle size={14} color={S.sage} style={{ margin: "0 auto" }} />
                            ) : (
                              <X size={14} color={S.rule} style={{ margin: "0 auto" }} />
                            )
                          ) : (
                            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 600, color: S.ink }}>{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: "48rem", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>FAQ</div>
            <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>Frequently asked questions</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
            {FAQS.map((faq) => (
              <div key={faq.q} style={{ background: "#fff", padding: "1.25rem" }}>
                <p style={{ fontFamily: S.serif, fontWeight: 700, color: S.ink, marginBottom: "0.625rem" }}>{faq.q}</p>
                <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.7 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
