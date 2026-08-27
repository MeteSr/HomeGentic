/**
 * UpgradeModal — in-app plan selection dialog
 *
 * Shows Pro and Premium plan cards with a payment method toggle:
 *   Card (default) → Stripe checkout redirect (no ICP required)
 *   ICP            → on-chain subscribe via Internet Identity (no Stripe fees)
 */

import React, { useState } from "react";
import { Check, X, CreditCard, Coins } from "lucide-react";
import { PLANS, type PlanTier } from "@/services/planConstants";
import { paymentService } from "@/services/payment";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

export interface UpgradeModalProps {
  open:    boolean;
  onClose: () => void;
}

type PaymentMethod = "card" | "icp";
type IcpStep       = "quoting" | "approving" | "confirming";

const ICP_STEP_LABEL: Record<IcpStep, string> = {
  quoting:    "Fetching ICP price…",
  approving:  "Approve in Internet Identity…",
  confirming: "Confirming…",
};

const SHOWN_TIERS: PlanTier[] = ["Pro", "Premium"];

export default function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const [method, setMethod]       = useState<PaymentMethod>("card");
  const [loadingTier, setLoading] = useState<PlanTier | null>(null);
  const [icpStep, setIcpStep]     = useState<IcpStep | null>(null);
  const [error, setError]         = useState<string | null>(null);

  if (!open) return null;

  const plans = PLANS.filter((p) => SHOWN_TIERS.includes(p.tier));

  async function handleSelect(tier: PlanTier) {
    setLoading(tier);
    setIcpStep(null);
    setError(null);
    try {
      if (method === "card") {
        await paymentService.startStripeCheckout(tier, "Monthly");
        // startStripeCheckout redirects the browser; onClose only reached if redirect fails
        onClose();
      } else {
        await paymentService.subscribe(tier, (s) => setIcpStep(s));
        onClose();
      }
    } catch (err: any) {
      console.error("[ICP payment]", err);
      if (method === "icp") {
        const msg: string = err?.message ?? "";
        if (/balance|insufficient/i.test(msg))    setError("Insufficient ICP balance.");
        else if (/reject|wasm|canister|IC0/i.test(msg)) setError("Payment service is temporarily unavailable.");
        else if (/approve|identity/i.test(msg))   setError("Approval cancelled or timed out.");
        else                                       setError("Payment failed. Please try again.");
      } else {
        setError(err.message ?? "Payment failed. Please try again.");
      }
    } finally {
      setLoading(null);
      setIcpStep(null);
    }
  }

  const periodLabel: Record<string, string> = { month: "/mo", year: "/yr", free: "" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade Your Plan"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(14,14,12,0.55)",
      }}
    >
      <div style={{
        background:   V2_COLORS.paper,
        border:       `1px solid ${V2_COLORS.border}`,
        borderRadius: V2_RADIUS.card,
        padding:      "2rem",
        maxWidth:     "680px",
        width:        "calc(100% - 2rem)",
        position:     "relative",
      }}>
        {/* Dismiss */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, padding: "0.25rem" }}
        >
          <X size={18} />
        </button>

        {/* Heading */}
        <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.5rem", color: V2_COLORS.ink, margin: "0 0 0.375rem" }}>
          Upgrade Your Plan
        </h2>
        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, margin: "0 0 1.25rem" }}>
          Choose a plan to unlock more features.
        </p>

        {/* Payment method toggle */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem" }}>
          {(["card", "icp"] as PaymentMethod[]).map((m) => {
            const active = method === m;
            return (
              <button
                key={m}
                onClick={() => { setMethod(m); setError(null); }}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  gap:            "0.4rem",
                  padding:        "0.45rem 1rem",
                  fontFamily:     V2_FONTS.body,
                  fontSize:       "0.8125rem",
                  fontWeight:     600,
                  border:         `1.5px solid ${active ? V2_COLORS.ink : V2_COLORS.border}`,
                  background:     active ? V2_COLORS.ink : "transparent",
                  color:          active ? V2_COLORS.paper : V2_COLORS.muted,
                  cursor:         "pointer",
                  transition:     "all .15s",
                }}
              >
                {m === "card"
                  ? <><CreditCard size={14} /> Pay with Card</>
                  : <><Coins size={14} /> Pay with ICP</>}
              </button>
            );
          })}
          {method === "icp" && (
            <span style={{ alignSelf: "center", fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: V2_COLORS.muted }}>
              No processing fees · Requires ICP tokens
            </span>
          )}
        </div>

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {plans.map((plan) => (
            <div
              key={plan.tier}
              style={{
                border:        `1.5px solid ${plan.tier === "Premium" ? V2_COLORS.blue : V2_COLORS.border}`,
                borderRadius:  V2_RADIUS.card,
                padding:       "1.25rem",
                display:       "flex",
                flexDirection: "column",
                gap:           "0.75rem",
                background:    plan.tier === "Premium" ? V2_COLORS.lblue : V2_COLORS.paper,
              }}
            >
              <div>
                <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: V2_COLORS.muted, marginBottom: "0.2rem" }}>
                  {plan.tier}
                </div>
                <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.75rem", color: V2_COLORS.ink, lineHeight: 1 }}>
                  ${plan.price}
                  <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 400, color: V2_COLORS.muted }}>
                    {periodLabel[plan.period]}
                  </span>
                </div>
              </div>

              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: V2_COLORS.ink }}>
                    <Check size={12} color={V2_COLORS.blue} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(plan.tier)}
                disabled={loadingTier !== null}
                aria-label={`Select ${plan.tier}`}
                style={{
                  marginTop:  "auto",
                  background: plan.tier === "Premium" ? V2_COLORS.blue : V2_COLORS.ink,
                  color:      V2_COLORS.paper,
                  border:     "none",
                  padding:    "0.6rem 1rem",
                  fontFamily: V2_FONTS.body,
                  fontWeight: 600,
                  fontSize:   "0.875rem",
                  cursor:     loadingTier ? "wait" : "pointer",
                  width:      "100%",
                  opacity:    loadingTier && loadingTier !== plan.tier ? 0.5 : 1,
                }}
              >
                {loadingTier === plan.tier && method === "icp" && icpStep
                  ? ICP_STEP_LABEL[icpStep]
                  : loadingTier === plan.tier && method === "card"
                  ? "Redirecting…"
                  : `Select ${plan.tier}`}
              </button>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p style={{ marginTop: "1rem", padding: "0.625rem 0.875rem", background: "#FEF2F2", border: `1px solid ${V2_COLORS.coral}`, fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: V2_COLORS.coralText, lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        {/* Dismiss link */}
        <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button
            onClick={onClose}
            aria-label="Maybe Later"
            style={{ background: "none", border: "none", fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: V2_COLORS.muted, cursor: "pointer", textDecoration: "underline" }}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
