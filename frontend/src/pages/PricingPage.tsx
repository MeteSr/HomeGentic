import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/Button";
import { PLANS, ANNUAL_PLANS, type Plan, type PlanTier, type BillingCycle } from "@/services/planConstants";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

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
    <div style={{ minHeight: "100vh", background: C.paper }}>
      {/* Nav */}
      <header style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.paper, zIndex: 50 }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 56px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "70px" }}>
          <Link to="/" style={{ textDecoration: "none", fontFamily: F.display, fontWeight: 800, fontSize: "22px", letterSpacing: "-0.5px", color: C.ink }}>
            Home<span style={{ color: C.yellow }}>Gentic</span>
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 1.5rem" }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1, color: C.ink, marginBottom: "1rem" }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontFamily: F.body, fontSize: "0.9rem", fontWeight: 300, color: C.muted }}>
            Upgrade when you're ready. Cancel anytime.
          </p>
        </div>

        {/* Persona tabs */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "2rem" }}>
          {[
            { label: "Homeowner", active: true },
            { label: "Contractor / Realtor", active: false, href: "/for-pros" },
          ].map(({ label, active, href }) => (
            <button
              key={label}
              onClick={() => href && navigate(href)}
              style={{
                padding: "0.5rem 1.25rem",
                border: `1.5px solid ${active ? C.ink : C.border}`,
                background: active ? C.ink : "transparent",
                color: active ? C.paper : C.muted,
                fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
                textTransform: "uppercase", cursor: href ? "pointer" : "default",
                fontWeight: active ? 700 : 400, borderRadius: "100px",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Monthly/Annual toggle */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", marginBottom: !annual ? "0.75rem" : "2.5rem" }}>
          <span style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: annual ? C.muted : C.ink, fontWeight: annual ? 400 : 700 }}>
            Monthly
          </span>
          <button
            onClick={() => setAnnual((v) => !v)}
            aria-label="Toggle annual billing"
            style={{
              width: "2.5rem", height: "1.375rem",
              borderRadius: 100, border: "none", cursor: "pointer",
              background: annual ? C.blue : C.border,
              position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: "3px",
              left: annual ? "calc(100% - 1.125rem)" : "3px",
              width: "1rem", height: "1rem",
              borderRadius: "50%", background: C.paper,
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
          <span style={{ fontFamily: F.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: annual ? C.ink : C.muted, fontWeight: annual ? 700 : 400 }}>
            Annual
          </span>
          <span style={{ background: annual ? C.blue : C.border, color: annual ? C.paper : C.muted, padding: "2px 10px", borderRadius: 100, fontFamily: F.mono, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em" }}>
            {annual ? "2 months free" : "Save 2 months"}
          </span>
        </div>
        {!annual && (
          <p style={{ textAlign: "center", fontFamily: F.body, fontSize: "0.8rem", color: C.muted, marginBottom: "2.5rem" }}>
            Switch to annual and get 2 months free —{" "}
            <button onClick={() => setAnnual(true)} style={{ background: "none", border: "none", color: C.blue, fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: "inherit", fontFamily: "inherit" }}>
              switch now
            </button>
          </p>
        )}

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
          {displayPlans.map((plan) => {
            const isPopular = plan.tier === "Pro";
            return (
              <div key={plan.tier} style={{
                padding: "2rem",
                borderRadius: "24px",
                background: isPopular ? C.blue : C.paper,
                border: `${isPopular ? "2px" : "1.5px"} solid ${isPopular ? C.blue : C.border}`,
                boxShadow: isPopular ? "0 8px 40px rgba(43,52,255,0.22)" : "0 2px 12px rgba(11,13,26,0.06)",
                position: "relative",
              }}>
                {isPopular && (
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    background: C.yellow, color: C.ink,
                    padding: "3px 12px", borderRadius: 100,
                    fontSize: "0.65rem", fontWeight: 700,
                    marginBottom: "0.75rem", fontFamily: F.mono,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: isPopular ? "rgba(255,255,255,0.7)" : C.muted, marginBottom: "0.5rem" }}>
                  {plan.tier}
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: "2.5rem", lineHeight: 1, color: isPopular ? C.paper : C.ink }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontFamily: F.body, fontSize: "0.65rem", color: isPopular ? "rgba(255,255,255,0.55)" : C.muted }}>/{plan.period}</span>
                  {plan.period === "year" && (
                    <div style={{ fontFamily: F.body, fontSize: "0.6rem", color: isPopular ? "rgba(255,255,255,0.55)" : C.muted, marginTop: "0.25rem", letterSpacing: "0.04em" }}>
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
                      background: isPopular ? "rgba(255,255,255,0.12)" : C.lblue,
                      border: `1px solid ${isPopular ? "rgba(255,255,255,0.2)" : C.blue + "33"}`,
                      borderRadius: "12px",
                    }}>
                      <Sparkles size={12} color={isPopular ? C.yellow : C.blue} style={{ flexShrink: 0 }} />
                      <span style={{ fontFamily: F.body, fontSize: "0.65rem", letterSpacing: "0.04em", color: isPopular ? "rgba(255,255,255,0.85)" : C.blue, fontWeight: 600 }}>
                        {agentCalls} AI agent calls/day · unlimited chat
                      </span>
                    </div>
                  );
                })()}

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {plan.features.filter((f) => !f.includes("AI agent calls")).map((f) => {
                    const isIncludes = f.startsWith("Everything in ");
                    return (
                      <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: F.body, fontSize: "0.85rem", color: isPopular ? "rgba(255,255,255,0.85)" : C.muted, fontWeight: isIncludes ? 600 : 300 }}>
                        <CheckCircle size={14} color={isPopular ? C.yellow : C.blue} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                        {f}
                      </li>
                    );
                  })}
                </ul>

                <Button
                  variant={isPopular ? "secondary" : "outline"}
                  style={{
                    width: "100%",
                    borderRadius: "100px",
                    ...(isPopular && { backgroundColor: C.yellow, color: C.ink, borderColor: C.yellow, fontWeight: 700 }),
                    ...(plan.tier === "Basic"   && { backgroundColor: C.blue, color: C.paper, borderColor: C.blue, boxShadow: "0 4px 18px rgba(43,52,255,0.28)" }),
                    ...(plan.tier === "Premium" && { backgroundColor: C.ink, color: C.paper, borderColor: C.ink }),
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
          background: C.lblue,
          border: `1.5px solid ${C.blue}22`,
          borderRadius: "24px", padding: "32px 40px", marginBottom: "2rem",
        }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.blue, marginBottom: 8 }}>For realtors & gift givers</div>
            <h3 style={{ fontFamily: F.display, fontSize: 22, fontWeight: 800, color: C.ink, margin: "0 0 6px" }}>Gifting for a client?</h3>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.6 }}>Give your buyer an AI-powered home maintenance platform that tracks repairs, predicts costs, and builds a verified record that makes their home easier to sell — one of the most useful closing gifts you can offer.</p>
          </div>
          <Link
            to="/gift"
            style={{
              fontFamily: F.body, fontSize: 15, fontWeight: 700,
              padding: "13px 28px", borderRadius: "100px",
              background: C.blue, color: C.paper, textDecoration: "none",
              whiteSpace: "nowrap", boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
            }}
          >
            Gift a Subscription
          </Link>
        </div>

        {/* For pros link */}
        <p style={{ textAlign: "center", fontFamily: F.body, fontSize: "0.875rem", color: C.muted }}>
          Contractor or realtor?{" "}
          <Link to="/for-pros" style={{ color: C.blue, fontWeight: 700, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>
            See plans for pros →
          </Link>
        </p>

      </div>
    </div>
  );
}
