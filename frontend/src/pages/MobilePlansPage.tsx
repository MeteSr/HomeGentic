import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { paymentService } from "@/services/payment";
import { useAuthStore } from "@/store/authStore";
import { V2_FONTS } from "@/theme";
import type { PlanTier, BillingCycle } from "@/services/planConstants";

const F = V2_FONTS;

// ── Design tokens ─────────────────────────────────────────────────────────────
const M = {
  bg:         "#EDEEF2",
  card:       "#FFFFFF",
  cardBdr:    "#E6E7EE",
  cardShadow: "0 2px 12px rgba(11,13,26,0.06)",
  ink:        "#0B0D1A",
  muted:      "#6B7080",
  blue:       "#2B34FF",
  blueLight:  "#E0E2FF",
  blueBdr:    "#B9BDF5",
  innerBg:    "#F7F8FB",
  rowBdr:     "#F0F1F5",
  radius:     22,
};

// ── Plan data ─────────────────────────────────────────────────────────────────

interface PlanDef {
  tier:       PlanTier;
  label:      string;
  sub:        string;
  monthly:    number;
  yearly:     number;
  recommended?: boolean;
}

const PLAN_DEFS: PlanDef[] = [
  {
    tier:    "Basic",
    label:   "Basic",
    sub:     "One property, full records and reports.",
    monthly: 10,
    yearly:  100,
  },
  {
    tier:        "Pro",
    label:       "Pro",
    sub:         "Five properties, sensors, advanced reports.",
    monthly:     20,
    yearly:      200,
    recommended: true,
  },
  {
    tier:    "Premium",
    label:   "Premium",
    sub:     "Twenty properties, shared access seats, and unlimited quotes.",
    monthly: 35,
    yearly:  350,
  },
];

const PLAN_FEATURES: Record<string, string[]> = {
  Basic:   ["1 property", "5 photos per job", "3 quote requests/month", "Blockchain-backed records", "PDF export"],
  Pro:     ["Everything in Basic", "5 properties", "10 photos per job", "10 quote requests/month", "Verified badge"],
  Premium: ["Everything in Pro", "20 properties", "30 photos per job", "Unlimited quotes", "Premium verified badge"],
};

// ── Back link ─────────────────────────────────────────────────────────────────

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8,
        font: `600 13px/1 ${F.body}`, color: M.muted,
        background: "none", border: "none", cursor: "pointer", padding: "8px 0",
      }}
    >
      <ArrowLeft size={16} color={M.muted} strokeWidth={2.4} />
      <span>{label}</span>
    </button>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, selected, cycle, onSelect }: {
  plan: PlanDef; selected: boolean; cycle: BillingCycle; onSelect: () => void;
}) {
  const price  = cycle === "Yearly" ? plan.yearly : plan.monthly;
  const per    = cycle === "Yearly" ? "/year" : "/month";

  return (
    <div
      onClick={onSelect}
      style={{
        cursor: "pointer",
        background: selected ? M.blueLight : M.card,
        border: `2px solid ${selected ? M.blue : M.cardBdr}`,
        borderRadius: M.radius,
        padding: 18,
        display: "flex", alignItems: "flex-start", gap: 14,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            font: `700 17px/1.1 ${F.display}`,
            color: selected ? M.blue : M.ink,
            letterSpacing: "-0.03em",
          }}>
            {plan.label}
          </div>
          {plan.recommended && (
            <div style={{
              font: `700 8.5px/1 ${F.mono}`, letterSpacing: ".12em",
              color: M.ink, background: "#D9FF6B", borderRadius: 100, padding: "5px 8px",
            }}>
              RECOMMENDED
            </div>
          )}
        </div>
        <div style={{
          font: `400 12.5px/1.5 ${F.body}`,
          color: selected ? M.blue : M.muted,
          marginTop: 7,
        }}>
          {plan.sub}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{
          font: `800 24px/1 ${F.display}`,
          color: selected ? M.blue : M.ink,
          letterSpacing: "-0.04em",
        }}>
          ${price}
        </div>
        <div style={{
          font: `400 11px/1 ${F.body}`,
          color: selected ? M.blue : M.muted,
          marginTop: 6,
        }}>
          {per}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Plan picker ───────────────────────────────────────────────────────

function PlansStep({
  selected, onSelect, cycle, onCycle, onContinue, onBack,
}: {
  selected:   PlanTier;
  onSelect:   (t: PlanTier) => void;
  cycle:      BillingCycle;
  onCycle:    (c: BillingCycle) => void;
  onContinue: () => void;
  onBack:     () => void;
}) {
  const plan = PLAN_DEFS.find(p => p.tier === selected) ?? PLAN_DEFS[1];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: M.bg }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 12px" }}>
        <BackLink label="Back" onClick={onBack} />

        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted, marginTop: 12 }}>
          STEP 1 OF 2 · CHOOSE A PLAN
        </div>
        <div style={{ font: `800 27px/1.14 ${F.display}`, color: M.ink, marginTop: 10, letterSpacing: "-0.03em" }}>
          Priced under a single service call.
        </div>
        <div style={{ font: `400 13.5px/1.6 ${F.body}`, color: M.muted, marginTop: 9 }}>
          Every plan keeps your records permanently. Change or cancel any time.
        </div>

        {/* Billing cycle toggle */}
        <div style={{
          display: "flex", background: "#E1E3EA", borderRadius: 100, padding: 4, gap: 4, marginTop: 18,
        }}>
          {(["Monthly", "Yearly"] as BillingCycle[]).map(c => {
            const active = cycle === c;
            return (
              <button
                key={c}
                onClick={() => onCycle(c)}
                style={{
                  flex: 1, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 100, border: "none", cursor: "pointer",
                  background: active ? M.card : "transparent",
                  font: `600 12.5px/1 ${F.body}`,
                  color: active ? M.ink : M.muted,
                  transition: "background 0.15s",
                }}
              >
                {c === "Yearly" ? "Yearly · 2 months free" : "Monthly"}
              </button>
            );
          })}
        </div>

        {/* Plan cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
          {PLAN_DEFS.map(p => (
            <PlanCard
              key={p.tier}
              plan={p}
              selected={selected === p.tier}
              cycle={cycle}
              onSelect={() => onSelect(p.tier)}
            />
          ))}
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div style={{
        flexShrink: 0, borderTop: `1px solid ${M.cardBdr}`,
        background: "#FCFCFD", padding: "14px 18px 30px",
      }}>
        <button
          onClick={onContinue}
          style={{
            width: "100%", minHeight: 52, borderRadius: 100,
            background: M.blue, border: "none", cursor: "pointer",
            font: `600 15px/1 ${F.body}`, color: "#FCFCFD",
          }}
        >
          Continue with {plan.label}
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Order summary + Stripe redirect ───────────────────────────────────

function ConfirmStep({
  selected, cycle, onBack,
}: {
  selected: PlanTier;
  cycle:    BillingCycle;
  onBack:   () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const plan    = PLAN_DEFS.find(p => p.tier === selected) ?? PLAN_DEFS[1];
  const price   = cycle === "Yearly" ? plan.yearly : plan.monthly;
  const perLabel = cycle === "Yearly" ? "year" : "month";
  const renewNote = cycle === "Yearly"
    ? `Renews ${new Date(Date.now() + 365 * 86400000).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`
    : `Renews monthly. Cancel any time.`;

  const features = PLAN_FEATURES[plan.tier] ?? [];

  const handlePay = async () => {
    setError(null);
    setLoading(true);
    try {
      await paymentService.startStripeCheckout(selected, cycle);
      // startStripeCheckout redirects the browser — we only reach here if it fails
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: M.bg }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 12px" }}>
        <BackLink label="Plans" onClick={onBack} />

        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted, marginTop: 12 }}>
          STEP 2 OF 2 · CONFIRM ORDER
        </div>
        <div style={{ font: `800 26px/1.14 ${F.display}`, color: M.ink, marginTop: 10, letterSpacing: "-0.03em" }}>
          {plan.label} plan, billed {cycle.toLowerCase()}
        </div>

        {/* Order summary */}
        <div style={{
          background: M.innerBg, border: `1px solid ${M.cardBdr}`,
          borderRadius: 20, padding: 18, marginTop: 18,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14 }}>
            <div style={{ font: `600 14px/1.3 ${F.body}`, color: M.ink }}>Due today</div>
            <div style={{ font: `800 24px/1 ${F.display}`, color: M.ink, letterSpacing: "-0.03em" }}>
              ${price}
            </div>
          </div>
          <div style={{ font: `400 12px/1.5 ${F.body}`, color: M.muted, marginTop: 9 }}>
            {plan.label} · ${price}/{perLabel}. {renewNote}
          </div>
        </div>

        {/* What's included */}
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted, margin: "20px 2px 10px" }}>
          WHAT'S INCLUDED
        </div>
        <div style={{
          background: M.card, border: `1px solid ${M.cardBdr}`,
          borderRadius: M.radius, overflow: "hidden",
        }}>
          {features.map((feat, i) => (
            <div
              key={feat}
              style={{
                padding: "13px 16px", display: "flex", alignItems: "center", gap: 12,
                borderBottom: i < features.length - 1 ? `1px solid ${M.rowBdr}` : "none",
              }}
            >
              <Check size={14} color={M.blue} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ font: `400 13.5px/1.4 ${F.body}`, color: M.ink }}>{feat}</span>
            </div>
          ))}
        </div>

        {/* Stripe note */}
        <div style={{ font: `400 11.5px/1.55 ${F.body}`, color: M.muted, marginTop: 14, textAlign: "center" }}>
          Payments handled by Stripe. HomeGentic never stores your card.
        </div>

        {error && (
          <div style={{
            font: `400 13px/1.5 ${F.body}`, color: "#DC2626",
            background: "#FEF2F2", border: "1px solid #FCA5A5",
            borderRadius: 12, padding: "12px 14px", marginTop: 12,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div style={{
        flexShrink: 0, borderTop: `1px solid ${M.cardBdr}`,
        background: "#FCFCFD", padding: "14px 18px 30px",
      }}>
        <button
          onClick={handlePay}
          disabled={loading}
          style={{
            width: "100%", minHeight: 52, borderRadius: 100,
            background: loading ? "#6B7080" : M.blue, border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            font: `600 15px/1 ${F.body}`, color: "#FCFCFD",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          {loading ? (
            <>
              <div className="btn-spinner" />
              Redirecting to payment…
            </>
          ) : (
            `Pay $${price} with Stripe`
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MobilePlansPage() {
  const navigate         = useNavigate();
  const [searchParams]   = useSearchParams();
  const { tier: currentTier } = useAuthStore();

  // Pre-select from query param or default to Pro
  const preselect   = (searchParams.get("tier") as PlanTier | null) ?? "Pro";
  const [step,    setStep]    = useState<"plans" | "confirm">("plans");
  const [selected, setSelected] = useState<PlanTier>(
    PLAN_DEFS.some(p => p.tier === preselect) ? preselect : "Pro"
  );
  const [cycle, setCycle] = useState<BillingCycle>("Monthly");

  const handleBack = () => {
    if (step === "confirm") { setStep("plans"); return; }
    navigate(-1);
  };

  if (step === "confirm") {
    return (
      <ConfirmStep
        selected={selected}
        cycle={cycle}
        onBack={() => setStep("plans")}
      />
    );
  }

  return (
    <PlansStep
      selected={selected}
      onSelect={setSelected}
      cycle={cycle}
      onCycle={setCycle}
      onContinue={() => setStep("confirm")}
      onBack={handleBack}
    />
  );
}
