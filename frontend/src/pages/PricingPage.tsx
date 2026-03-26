import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle, X, Home } from "lucide-react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { PLANS } from "@/services/payment";
import { useAuth } from "@/contexts/AuthContext";

const FEATURES_TABLE = [
  { feature: "Properties", Free: "1", Pro: "5", Premium: "Unlimited", ContractorPro: "—" },
  { feature: "Photos per job", Free: "5", Pro: "20", Premium: "Unlimited", ContractorPro: "50" },
  { feature: "Quote requests/mo", Free: "3", Pro: "10", Premium: "Unlimited", ContractorPro: "Unlimited" },
  { feature: "Public HomeFax report", Free: true, Pro: true, Premium: true, ContractorPro: false },
  { feature: "Blockchain verified", Free: true, Pro: true, Premium: true, ContractorPro: true },
  { feature: "Contractor search", Free: false, Pro: true, Premium: true, ContractorPro: true },
  { feature: "PDF export", Free: false, Pro: true, Premium: true, ContractorPro: false },
  { feature: "Priority support", Free: false, Pro: false, Premium: true, ContractorPro: true },
  { feature: "Contractor profile listing", Free: false, Pro: false, Premium: false, ContractorPro: true },
  { feature: "Trust score & reviews", Free: false, Pro: false, Premium: false, ContractorPro: true },
];

const FAQS = [
  {
    q: "How does blockchain verification work?",
    a: "Every maintenance job is stored as an immutable record on the Internet Computer Protocol. The data is cryptographically signed and cannot be altered — not even by us.",
  },
  {
    q: "What is ICP?",
    a: "The Internet Computer Protocol is a decentralized cloud platform developed by DFINITY. Unlike traditional cloud storage, data on ICP is governed by a decentralized protocol — no single company can take it down.",
  },
  {
    q: "Is my personal data secure?",
    a: "HomeFax uses Internet Identity for authentication — no passwords or emails are stored. Your property data is stored on-chain and only accessible to principals (identities) you authorize.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel your subscription at any time from your Settings page. Your data remains accessible and your blockchain records are permanent — even after cancellation.",
  },
];

export default function PricingPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "white" }}>
      {/* Nav */}
      <header
        style={{
          borderBottom: "1px solid #f3f4f6",
          position: "sticky",
          top: 0,
          backgroundColor: "white",
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "80rem",
            margin: "0 auto",
            padding: "0 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "4rem",
          }}
        >
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontWeight: 800,
              fontSize: "1.125rem",
              color: "#111827",
              textDecoration: "none",
            }}
          >
            <Home size={20} color="#3b82f6" />
            HomeFax
          </Link>
          <Button size="sm" onClick={login}>
            Get Started Free
          </Button>
        </div>
      </header>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 1.5rem" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 900, color: "#111827", marginBottom: "1rem" }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontSize: "1.125rem", color: "#6b7280" }}>
            Start free. Upgrade when you're ready. Cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.25rem",
            marginBottom: "4rem",
          }}
        >
          {PLANS.map((plan) => {
            const isPopular = plan.tier === "Pro";
            return (
              <div
                key={plan.tier}
                style={{
                  padding: "2rem",
                  borderRadius: "1.25rem",
                  border: isPopular ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                  backgroundColor: isPopular ? "#eff6ff" : "white",
                  position: "relative",
                  boxShadow: isPopular ? "0 8px 30px rgba(59,130,246,0.15)" : "none",
                }}
              >
                {isPopular && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-0.875rem",
                      left: "50%",
                      transform: "translateX(-50%)",
                      backgroundColor: "#3b82f6",
                      color: "white",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.3rem 1rem",
                      borderRadius: "9999px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Most Popular
                  </div>
                )}

                <div style={{ fontWeight: 800, fontSize: "1.125rem", color: "#111827", marginBottom: "0.5rem" }}>
                  {plan.tier}
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 900, color: "#111827" }}>
                    {plan.price === 0 ? "Free" : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>/{plan.period}</span>
                  )}
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "#374151",
                      }}
                    >
                      <CheckCircle size={16} color="#10b981" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isPopular ? "primary" : "outline"}
                  style={{ width: "100%" }}
                  onClick={login}
                >
                  {plan.price === 0 ? "Get Started Free" : `Upgrade to ${plan.tier}`}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Feature comparison table */}
        <div style={{ marginBottom: "4rem" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", textAlign: "center", marginBottom: "2rem" }}>
            Feature comparison
          </h2>
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "1rem 1.25rem",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "#374151",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    Feature
                  </th>
                  {["Free", "Pro", "Premium", "ContractorPro"].map((tier) => (
                    <th
                      key={tier}
                      style={{
                        textAlign: "center",
                        padding: "1rem",
                        fontSize: "0.813rem",
                        fontWeight: 700,
                        color: tier === "Pro" ? "#3b82f6" : "#374151",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES_TABLE.map((row, i) => (
                  <tr
                    key={row.feature}
                    style={{ borderBottom: i < FEATURES_TABLE.length - 1 ? "1px solid #f3f4f6" : "none" }}
                  >
                    <td style={{ padding: "0.875rem 1.25rem", fontSize: "0.875rem", color: "#374151", fontWeight: 500 }}>
                      {row.feature}
                    </td>
                    {(["Free", "Pro", "Premium", "ContractorPro"] as const).map((tier) => {
                      const val = (row as any)[tier];
                      return (
                        <td key={tier} style={{ textAlign: "center", padding: "0.875rem 1rem" }}>
                          {typeof val === "boolean" ? (
                            val ? (
                              <CheckCircle size={18} color="#10b981" style={{ margin: "0 auto" }} />
                            ) : (
                              <X size={18} color="#d1d5db" style={{ margin: "0 auto" }} />
                            )
                          ) : (
                            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                              {val}
                            </span>
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
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", textAlign: "center", marginBottom: "2rem" }}>
            Frequently asked questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {FAQS.map((faq) => (
              <div
                key={faq.q}
                style={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.875rem",
                  padding: "1.25rem",
                }}
              >
                <p style={{ fontWeight: 700, color: "#111827", marginBottom: "0.625rem" }}>{faq.q}</p>
                <p style={{ fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.6 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
