import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/Button";
import { PLANS, type PlanTier, type BillingCycle } from "@/services/planConstants";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

export default function PricingPage() {
  const { login, devLogin } = useAuth();
  const handleLogin = import.meta.env.DEV ? devLogin : login;
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Pro ($59/year) is the only homeowner plan — billing is always Yearly.
  const displayPlans = PLANS.filter((p) => p.tier === "Pro");

  const handleUpgrade = async (tier: PlanTier) => {
    if (tier === "ContractorFree") {
      await handleLogin();
      return;
    }
    const billing: BillingCycle = "Yearly";
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
            Home<span style={{ color: C.yellowText }}>Gentic</span>
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

        {/* Plan card — single homeowner plan, annual only */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", maxWidth: "22rem", margin: "0 auto 4rem" }}>
          {displayPlans.map((plan) => (
            <div key={plan.tier} style={{
              padding: "2rem",
              borderRadius: "24px",
              background: C.blue,
              border: `2px solid ${C.blue}`,
              boxShadow: "0 8px 40px rgba(43,52,255,0.22)",
              position: "relative",
            }}>
              <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: "rgba(255,255,255,0.85)", marginBottom: "0.5rem" }}>
                {plan.tier}
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: "2.5rem", lineHeight: 1, color: C.paper }}>
                  ${plan.price}
                </span>
                <span style={{ fontFamily: F.body, fontSize: "0.65rem", color: "rgba(255,255,255,0.85)" }}>/{plan.period}</span>
                <div style={{ fontFamily: F.body, fontSize: "0.6rem", color: "rgba(255,255,255,0.85)", marginTop: "0.25rem", letterSpacing: "0.04em" }}>
                  ${(plan.price / 12).toFixed(2)}/mo billed annually
                </div>
              </div>

              {/* AI agent call badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.5rem 0.75rem", marginBottom: "1rem",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "12px",
              }}>
                <Sparkles size={12} color={C.yellow} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: F.body, fontSize: "0.65rem", letterSpacing: "0.04em", color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
                  10 AI agent calls/day · unlimited chat
                </span>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {plan.features.filter((f) => !f.includes("AI agent calls")).map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: F.body, fontSize: "0.85rem", color: "rgba(255,255,255,0.85)", fontWeight: 300 }}>
                    <CheckCircle size={14} color={C.yellow} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant="secondary"
                style={{
                  width: "100%",
                  borderRadius: "100px",
                  backgroundColor: C.yellow, color: C.ink, borderColor: C.yellow, fontWeight: 700,
                }}
                onClick={() => handleUpgrade(plan.tier)}
              >
                Get {plan.tier}
              </Button>
            </div>
          ))}
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
