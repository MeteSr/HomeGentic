import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/Button";
import { PLANS, ANNUAL_PLANS, type Plan, type PlanTier, type BillingCycle } from "@/services/planConstants";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

const BILLING_KEY = "homegentic_pricing_billing";

export default function PricingPage() {
  const { login, devLogin } = useAuth();
  const handleLogin = import.meta.env.DEV ? devLogin : login;
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [annual, setAnnual] = useState<boolean>(() => {
    try { return localStorage.getItem(BILLING_KEY) === "annual"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(BILLING_KEY, annual ? "annual" : "monthly"); } catch {}
  }, [annual]);

  const displayPlans: Plan[] = annual
    ? ANNUAL_PLANS
    : PLANS.filter((p) => p.tier === "Basic" || p.tier === "Pro" || p.tier === "Premium");

  const handleUpgrade = async (tier: PlanTier) => {
    if (tier === "ContractorFree") {
      await handleLogin();
      return;
    }
    const billing: BillingCycle = annual ? "Yearly" : "Monthly";
    if (!isAuthenticated) {
      // Stamp the intent into the URL so the effect below can navigate after II resolves.
      setSearchParams({ checkout: tier, billing }, { replace: true });
      await handleLogin();
      return;
    }
    navigate(`/checkout?tier=${tier}&billing=${billing}`);
  };

  // After II login completes, forward to checkout if an intent was stamped in the URL.
  useEffect(() => {
    if (!isAuthenticated) return;
    const tier    = searchParams.get("checkout") as PlanTier | null;
    const billing = searchParams.get("billing")  as BillingCycle | null;
    if (!tier || !billing) return;
    navigate(`/checkout?tier=${tier}&billing=${billing}`);
  }, [isAuthenticated]);

  return (
    <div style={{ minHeight: "100vh", background: UI.paper }}>
      {/* Nav */}
      <header style={{ borderBottom: `1px solid ${UI.rule}`, position: "sticky", top: 0, background: UI.paper, zIndex: 50 }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 56px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "70px" }}>
          <Link to="/" style={{ textDecoration: "none", fontFamily: FONTS.serif, fontWeight: 900, fontSize: "22px", letterSpacing: "-0.5px", color: COLORS.plum }}>
            Home<span style={{ color: COLORS.sageText, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 1.5rem" }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1, color: UI.ink, marginBottom: "1rem" }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.9rem", fontWeight: 300, color: UI.inkLight }}>
Upgrade when you're ready. Cancel anytime.
          </p>
        </div>

        {/* Monthly/Annual toggle */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", marginBottom: "2.5rem" }}>
            <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: annual ? UI.inkLight : UI.ink, fontWeight: annual ? 400 : 700 }}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual((v) => !v)}
              aria-label="Toggle annual billing"
              style={{
                width: "2.5rem", height: "1.375rem",
                borderRadius: 100, border: "none", cursor: "pointer",
                background: annual ? COLORS.sage : COLORS.rule,
                position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: "3px",
                left: annual ? "calc(100% - 1.125rem)" : "3px",
                width: "1rem", height: "1rem",
                borderRadius: "50%", background: COLORS.white,
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
            <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: annual ? UI.ink : UI.inkLight, fontWeight: annual ? 700 : 400 }}>
              Annual
            </span>
            {annual && (
              <span style={{ background: COLORS.sage, color: COLORS.white, padding: "2px 10px", borderRadius: 100, fontFamily: UI.mono, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em" }}>
                Save 2 months
              </span>
            )}
          </div>

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
          {displayPlans.map((plan) => {
            const isPopular = plan.tier === "Pro";
            return (
              <div key={plan.tier} style={{
                padding: "2rem",
                borderRadius: RADIUS.card,
                background: isPopular ? COLORS.plum : COLORS.white,
                border: `1.5px solid ${isPopular ? COLORS.plum : COLORS.rule}`,
                boxShadow: isPopular ? SHADOWS.hover : SHADOWS.card,
                position: "relative",
              }}>
                {isPopular && (
                  <div style={{ display: "inline-flex", alignItems: "center", background: COLORS.sage, color: COLORS.plum, padding: "3px 12px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", color: isPopular ? COLORS.sageLight : COLORS.plumMid, marginBottom: "0.5rem" }}>
                  {plan.tier}
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2.5rem", lineHeight: 1, color: isPopular ? COLORS.white : COLORS.plum }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontFamily: FONTS.sans, fontSize: "0.65rem", color: isPopular ? COLORS.sageLight : COLORS.plumMid }}>/{plan.period}</span>
                  {plan.period === "year" && (
                    <div style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", color: isPopular ? COLORS.sageLight : COLORS.sageText, marginTop: "0.25rem", letterSpacing: "0.04em" }}>
                      ${(plan.price / 12).toFixed(2)}/mo billed annually
                    </div>
                  )}
                </div>

                {/* AI agent call badge */}
                {(() => {
                  const agentCalls = plan.tier === "Basic" ? 5 : plan.tier === "Pro" ? 10 : 20;
                  return (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.5rem 0.75rem", marginBottom: "1rem",
                      background: isPopular ? "rgba(255,255,255,0.1)" : COLORS.sageLight,
                      border: `1px solid ${isPopular ? "rgba(255,255,255,0.2)" : COLORS.sageMid}`,
                      borderRadius: RADIUS.sm,
                    }}>
                      <Sparkles size={12} color={COLORS.sage} style={{ flexShrink: 0 }} />
                      <span style={{ fontFamily: FONTS.sans, fontSize: "0.65rem", letterSpacing: "0.04em", color: isPopular ? COLORS.sageLight : COLORS.sageText, fontWeight: 600 }}>
                        {agentCalls} AI agent calls/day · unlimited chat
                      </span>
                    </div>
                  );
                })()}

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {plan.features.filter((f) => !f.includes("AI agent calls")).map((f) => {
                    const isIncludes = f.startsWith("Everything in ");
                    return (
                      <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: FONTS.sans, fontSize: "0.85rem", color: isPopular ? COLORS.sageLight : COLORS.plumMid, fontWeight: isIncludes ? 600 : 300 }}>
                        <CheckCircle size={14} color={COLORS.sage} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                        {f}
                      </li>
                    );
                  })}
                </ul>

                <Button
                  variant={isPopular ? "secondary" : "outline"}
                  style={{
                    width: "100%",
                    ...(isPopular && { backgroundColor: COLORS.sage, color: COLORS.plum, borderColor: COLORS.sage }),
                    ...(plan.tier === "Basic"   && { backgroundColor: COLORS.plum, color: COLORS.white, borderColor: COLORS.plum }),
                    ...(plan.tier === "Premium" && { backgroundColor: COLORS.plumDark, color: COLORS.white, borderColor: COLORS.sage, borderWidth: "2px" }),
                  }}
                  onClick={() => handleUpgrade(plan.tier)}
                >
                  {plan.tier === "Basic"   ? "Start with Basic"
                    : plan.tier === "Premium" ? "Unlock Premium"
                    : `Get ${plan.tier}`}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Gift callout */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 24,
          background: `linear-gradient(135deg, ${COLORS.sageLight}, ${COLORS.sageMid}60)`,
          borderRadius: RADIUS.card, padding: "32px 40px", marginBottom: "2rem",
        }}>
          <div>
            <div style={{ fontFamily: FONTS.sans, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: 8 }}>For realtors & gift givers</div>
            <h3 style={{ fontFamily: FONTS.serif, fontSize: 22, fontWeight: 900, color: COLORS.plum, margin: "0 0 6px" }}>Gifting for a client?</h3>
            <p style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.plumMid, margin: 0, lineHeight: 1.6 }}>Give your buyer an AI-powered home maintenance platform that tracks repairs, predicts costs, and builds a verified record that makes their home easier to sell — one of the most useful closing gifts you can offer.</p>
          </div>
          <Link
            to="/gift"
            style={{
              fontFamily: FONTS.sans, fontSize: 15, fontWeight: 700,
              padding: "13px 28px", borderRadius: RADIUS.pill,
              background: COLORS.plum, color: COLORS.white, textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Gift a Subscription
          </Link>
        </div>

        {/* For pros link */}
        <p style={{ textAlign: "center", fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid }}>
          Contractor or realtor?{" "}
          <Link to="/for-pros" style={{ color: COLORS.plum, fontWeight: 700, textDecoration: "none", borderBottom: `1px solid ${COLORS.rule}` }}>
            See plans for pros →
          </Link>
        </p>

      </div>
    </div>
  );
}
