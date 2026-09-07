import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { paymentService } from "@/services/payment";
import { Helmet } from "react-helmet-async";
import { CheckCircle } from "lucide-react";

const C = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  yellowText: "#8A6D00",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#6B7080",
  muted2: "#5A5F70",
  border: "#EDEEF2",
  white:  "#FFFFFF",
  blueFg: "#F3F4FF",
};
const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type GiftTier    = "Basic" | "Pro" | "Premium";
type GiftBilling = "monthly" | "annual";
type GiftStep    = "select" | "recipient" | "message" | "review" | "done";

interface GiftFormData {
  tier:           GiftTier;
  billing:        GiftBilling;
  recipientName:  string;
  recipientEmail: string;
  senderName:     string;
  senderEmail:    string;
  giftMessage:    string;
  deliveryDate:   "now" | string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GIFT_PLANS: Record<GiftTier, { monthlyPrice: number; annualPrice: number; tagline: string; bullets: string[] }> = {
  Basic: {
    monthlyPrice: 10,
    annualPrice:  100,
    tagline: "Perfect for first-time buyers",
    bullets: [
      "1 property, blockchain-backed record",
      "Public HomeGentic report",
      "Warranty Wallet + Recurring Services",
      "3 contractor quote requests/month",
    ],
  },
  Pro: {
    monthlyPrice: 20,
    annualPrice:  200,
    tagline: "For active homeowners and growing portfolios",
    bullets: [
      "Everything in Basic",
      "5 properties, 10 photos per job",
      "10 quote requests/month",
      "Verified badge + Priority support",
    ],
  },
  Premium: {
    monthlyPrice: 40,
    annualPrice:  400,
    tagline: "For multiple properties or serious sellers",
    bullets: [
      "Everything in Pro",
      "20 properties, 30 photos per job",
      "Unlimited quote requests",
      "Premium verified badge + Priority verification",
    ],
  },
};

const STEP_LABELS: { key: GiftStep; label: string }[] = [
  { key: "select",    label: "Choose Tier" },
  { key: "recipient", label: "Recipient"   },
  { key: "message",   label: "Message"     },
  { key: "review",    label: "Review"      },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 56px", height: 64, borderBottom: `1px solid ${C.border}`,
      background: C.paper, position: "sticky", top: 0, zIndex: 100,
    }}>
      <Link to="/" style={{
        fontFamily: F.display, fontSize: 20, fontWeight: 800,
        color: C.ink, textDecoration: "none", letterSpacing: "-0.5px",
      }}>
        Home<span style={{ color: C.yellowText }}>Gentic</span>
      </Link>
      <Link to="/login" style={{
        fontFamily: F.body, fontSize: 14, fontWeight: 700,
        color: C.white, background: C.blue, textDecoration: "none",
        padding: "10px 22px", borderRadius: "100px",
        boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
      }}>
        Sign In
      </Link>
    </nav>
  );
}

function StepIndicator({ step }: { step: GiftStep }) {
  if (step === "done") return null;
  const activeIndex = STEP_LABELS.findIndex((s) => s.key === step);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 56 }}>
      {STEP_LABELS.map((s, i) => {
        const done   = i < activeIndex;
        const active = i === activeIndex;
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "100px",
                background: done || active ? C.blue : "transparent",
                border: `2px solid ${done || active ? C.blue : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: done || active ? C.white : C.muted2,
                fontFamily: F.body, transition: "all .2s",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{
                fontFamily: F.body, fontSize: 12,
                color: active ? C.ink : done ? C.blue : C.muted2,
                fontWeight: active ? 700 : 400, whiteSpace: "nowrap",
              }}>
                {s.label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{
                width: 64, height: 2, margin: "0 8px", marginBottom: 28,
                background: i < activeIndex ? C.blue : C.border,
                transition: "background .3s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function InputField({
  label, value, onChange, type = "text", placeholder, error, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; error?: string; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.muted }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: "10px",
          border: `1.5px solid ${error ? C.coral : focused ? C.blue : C.border}`,
          fontFamily: F.body, fontSize: "0.9rem", color: C.ink,
          background: C.white, outline: "none", boxSizing: "border-box",
          transition: "border-color .15s",
        }}
      />
      {error && (
        <span style={{ fontFamily: F.body, fontSize: 12, color: C.coral }}>{error}</span>
      )}
    </div>
  );
}

// ─── Step Panels ──────────────────────────────────────────────────────────────

function StepSelect({ data, setData, onNext }: {
  data: GiftFormData;
  setData: React.Dispatch<React.SetStateAction<GiftFormData>>;
  onNext: () => void;
}) {
  return (
    <div>
      {/* Billing toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 40 }}>
        {(["monthly", "annual"] as GiftBilling[]).map((b) => (
          <button
            key={b}
            onClick={() => setData((d) => ({ ...d, billing: b }))}
            style={{
              fontFamily: F.body, fontSize: 13, fontWeight: 600,
              padding: "8px 20px", borderRadius: "100px",
              border: `1.5px solid ${data.billing === b ? C.blue : C.border}`,
              background: data.billing === b ? C.blue : "transparent",
              color: data.billing === b ? C.white : C.muted,
              cursor: "pointer", transition: "all .2s",
            }}
          >
            {b === "monthly" ? "Monthly" : "Annual"}
            {b === "annual" && (
              <span style={{ marginLeft: 8, background: C.yellow, color: C.ink, padding: "2px 8px", borderRadius: "100px", fontSize: 10, fontWeight: 700 }}>
                Save 2mo
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        {(["Basic", "Pro", "Premium"] as GiftTier[]).map((tier) => {
          const plan      = GIFT_PLANS[tier];
          const price     = data.billing === "monthly" ? plan.monthlyPrice : plan.annualPrice;
          const period    = data.billing === "monthly" ? "/mo" : "/yr";
          const isPopular = tier === "Pro";
          const active    = data.tier === tier;

          return (
            <div
              key={tier}
              onClick={() => setData((d) => ({ ...d, tier }))}
              style={{
                padding: "2rem", borderRadius: "24px", cursor: "pointer",
                background: isPopular ? C.blue : C.white,
                border: `${isPopular ? "2px" : "1.5px"} solid ${isPopular ? C.blue : active ? C.blue : C.border}`,
                boxShadow: isPopular ? "0 8px 40px rgba(43,52,255,0.22)" : active ? `0 0 0 3px ${C.blue}22` : "0 2px 12px rgba(11,13,26,0.06)",
                transition: "all .2s", position: "relative",
              }}
            >
              {isPopular && (
                <div style={{ display: "inline-flex", alignItems: "center", background: C.yellow, color: C.ink, padding: "3px 12px", borderRadius: 100, fontSize: "0.65rem", fontWeight: 700, marginBottom: "0.75rem", fontFamily: F.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Most Popular
                </div>
              )}

              <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: isPopular ? "rgba(255,255,255,0.85)" : C.muted, marginBottom: "0.5rem" }}>
                {tier}
              </div>
              <div style={{ fontFamily: F.body, fontSize: 13, color: isPopular ? "rgba(255,255,255,0.85)" : C.muted, marginBottom: 20, lineHeight: 1.4 }}>
                {plan.tagline}
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: "2.5rem", lineHeight: 1, color: isPopular ? C.white : C.ink }}>
                  ${price}
                </span>
                <span style={{ fontFamily: F.body, fontSize: "0.65rem", color: isPopular ? "rgba(255,255,255,0.85)" : C.muted }}>
                  {period}
                </span>
                {data.billing === "annual" && (
                  <div style={{ fontFamily: F.body, fontSize: "0.6rem", color: isPopular ? C.yellow : C.blue, marginTop: "0.25rem" }}>
                    ${(price / 12).toFixed(2)}/mo billed annually
                  </div>
                )}
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {plan.bullets.map((b) => (
                  <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: F.body, fontSize: "0.85rem", color: isPopular ? "rgba(255,255,255,0.85)" : C.muted, fontWeight: 300 }}>
                    <CheckCircle size={14} color={isPopular ? C.yellow : C.blue} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    {b}
                  </li>
                ))}
              </ul>

              <button
                onClick={(e) => { e.stopPropagation(); setData((d) => ({ ...d, tier })); onNext(); }}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: "100px",
                  fontFamily: F.body, fontSize: 15, fontWeight: 700,
                  background: isPopular ? C.yellow : tier === "Basic" ? C.blue : C.ink,
                  color: isPopular ? C.ink : C.white,
                  border: "none", cursor: "pointer", transition: "opacity .2s",
                  boxShadow: tier === "Basic" ? "0 4px 18px rgba(43,52,255,0.28)" : "none",
                }}
              >
                Gift {tier}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepRecipient({ data, setData, onNext, onBack }: {
  data: GiftFormData;
  setData: React.Dispatch<React.SetStateAction<GiftFormData>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!data.recipientName.trim())            e.recipientName  = "Required";
    if (!isValidEmail(data.recipientEmail))    e.recipientEmail = "Enter a valid email";
    if (!data.senderName.trim())               e.senderName     = "Required";
    if (!isValidEmail(data.senderEmail))       e.senderEmail    = "Enter a valid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <InputField
          label="Recipient's name"
          value={data.recipientName}
          onChange={(v) => setData((d) => ({ ...d, recipientName: v }))}
          placeholder="Alex Johnson"
          error={errors.recipientName}
        />
        <InputField
          label="Recipient's email"
          type="email"
          value={data.recipientEmail}
          onChange={(v) => setData((d) => ({ ...d, recipientEmail: v }))}
          placeholder="alex@email.com"
          error={errors.recipientEmail}
        />
        <InputField
          label="Your name"
          value={data.senderName}
          onChange={(v) => setData((d) => ({ ...d, senderName: v }))}
          placeholder="Sarah Miller"
          error={errors.senderName}
        />
        <InputField
          label="Your email (for receipt)"
          type="email"
          value={data.senderEmail}
          onChange={(v) => setData((d) => ({ ...d, senderEmail: v }))}
          placeholder="sarah@realty.com"
          error={errors.senderEmail}
        />
      </div>
      <NavButtons onBack={onBack} onNext={() => validate() && onNext()} />
    </div>
  );
}

function StepMessage({ data, setData, onNext, onBack }: {
  data: GiftFormData;
  setData: React.Dispatch<React.SetStateAction<GiftFormData>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const count = data.giftMessage.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.muted }}>
          Gift message <span style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          value={data.giftMessage}
          onChange={(e) => setData((d) => ({ ...d, giftMessage: e.target.value }))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={280}
          rows={4}
          placeholder={`e.g. Congratulations on the new home! This subscription will help you build a verified maintenance record from day one. — ${data.senderName || "Your Name"}`}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: "10px",
            border: `1.5px solid ${focused ? C.blue : C.border}`,
            fontFamily: F.body, fontSize: "0.9rem", color: C.ink,
            background: C.white, outline: "none", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.6,
          }}
        />
        <span style={{ fontFamily: F.body, fontSize: 12, color: count > 250 ? C.coral : C.muted, alignSelf: "flex-end" }}>
          {count}/280
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.muted }}>
          Delivery
        </label>
        {[
          { value: "now",   label: "Send immediately" },
          { value: "later", label: "Schedule for a date" },
        ].map((opt) => (
          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: F.body, fontSize: 15, color: C.ink }}>
            <input
              type="radio"
              name="delivery"
              checked={opt.value === "now" ? data.deliveryDate === "now" : data.deliveryDate !== "now"}
              onChange={() => setData((d) => ({ ...d, deliveryDate: opt.value === "now" ? "now" : today() }))}
              style={{ accentColor: C.blue, width: 16, height: 16 }}
            />
            {opt.label}
          </label>
        ))}
        {data.deliveryDate !== "now" && (
          <input
            type="date"
            value={data.deliveryDate}
            min={today()}
            onChange={(e) => setData((d) => ({ ...d, deliveryDate: e.target.value }))}
            style={{
              padding: "10px 14px", borderRadius: "10px", maxWidth: 220,
              border: `1.5px solid ${C.border}`, fontFamily: F.body, fontSize: "0.9rem",
              color: C.ink, background: C.white, outline: "none",
            }}
          />
        )}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepReview({ data, onSubmit, onBack, loading, error }: {
  data:      GiftFormData;
  onSubmit:  () => void;
  onBack:    () => void;
  loading?:  boolean;
  error?:    string | null;
}) {
  const plan   = GIFT_PLANS[data.tier];
  const price  = data.billing === "monthly" ? plan.monthlyPrice : plan.annualPrice;
  const period = data.billing === "monthly" ? "/mo" : "/yr";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Summary card */}
      <div style={{ borderRadius: "24px", border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ background: C.ink, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: F.display, fontSize: 22, fontWeight: 800, color: C.white }}>{data.tier}</span>
            <span style={{ fontFamily: F.body, fontSize: 13, color: "rgba(252,252,253,0.5)", marginLeft: 12 }}>{data.billing}</span>
          </div>
          <span style={{ fontFamily: F.display, fontSize: 28, fontWeight: 800, color: C.white }}>
            ${price}<span style={{ fontFamily: F.body, fontSize: 14, color: "rgba(252,252,253,0.5)" }}>{period}</span>
          </span>
        </div>
        <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: C.white }}>
          {[
            { label: "To",      value: `${data.recipientName} · ${data.recipientEmail}` },
            { label: "From",    value: `${data.senderName} · ${data.senderEmail}` },
            { label: "Deliver", value: data.deliveryDate === "now" ? "Immediately" : data.deliveryDate },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontFamily: F.body, fontSize: 14, color: C.ink }}>{value}</div>
            </div>
          ))}
        </div>
        {data.giftMessage && (
          <div style={{ margin: "0 28px 24px", padding: "20px 24px", background: `linear-gradient(135deg, ${C.blueFg}, #FFFBEB)`, borderRadius: "12px" }}>
            <p style={{ fontFamily: F.display, fontSize: 16, fontStyle: "italic", color: C.ink, margin: 0, lineHeight: 1.65 }}>
              "{data.giftMessage}"
            </p>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: "10px", fontFamily: F.body, fontSize: 13, color: "#991B1B" }}>
          {error}
        </div>
      )}

      <NavButtons onBack={onBack} onNext={onSubmit} nextLabel={loading ? "Redirecting to payment…" : "Pay & Send Gift"} disabled={loading} />
    </div>
  );
}

function StepDone({ data }: { data: GiftFormData }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
        <CheckCircle size={56} color={C.blue} strokeWidth={1.5} />
      </div>
      <h2 style={{ fontFamily: F.display, fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, color: C.ink, letterSpacing: "-1px", margin: "0 0 16px" }}>
        Your gift is on its way.
      </h2>
      <p style={{ fontFamily: F.body, fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px" }}>
        We'll send <strong style={{ color: C.ink }}>{data.recipientName}</strong> an email at <strong style={{ color: C.ink }}>{data.recipientEmail}</strong> with instructions to activate their {data.tier} subscription. A receipt will go to <strong style={{ color: C.ink }}>{data.senderEmail}</strong>.
      </p>

      <div style={{
        display: "inline-block", padding: "16px 28px", borderRadius: "18px",
        background: "#FFFBEB", maxWidth: 480, textAlign: "left", marginBottom: 40,
        fontFamily: F.body, fontSize: 14, color: C.ink, lineHeight: 1.65,
        border: `1px solid ${C.yellow}44`,
      }}>
        🎁 The subscription activates when {data.recipientName.split(" ")[0]} signs in and accepts the gift. They'll have 30 days to redeem.
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        <Link to="/pricing" style={{
          fontFamily: F.body, fontSize: 15, fontWeight: 600,
          padding: "12px 28px", borderRadius: "100px",
          border: `1.5px solid ${C.border}`, color: C.ink, textDecoration: "none",
        }}>
          View Pricing
        </Link>
        <Link to="/" style={{
          fontFamily: F.body, fontSize: 15, fontWeight: 700,
          padding: "12px 28px", borderRadius: "100px",
          background: C.blue, color: C.white, textDecoration: "none",
          boxShadow: "0 4px 18px rgba(43,52,255,0.28)",
        }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = "Continue", disabled = false }: {
  onBack: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
      <button
        onClick={onBack}
        disabled={disabled}
        style={{
          fontFamily: F.body, fontSize: 15, fontWeight: 600,
          padding: "12px 28px", borderRadius: "100px",
          border: `1.5px solid ${C.border}`, background: "transparent",
          color: C.muted, cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        ← Back
      </button>
      <button
        onClick={onNext}
        disabled={disabled}
        style={{
          fontFamily: F.body, fontSize: 15, fontWeight: 700,
          padding: "12px 32px", borderRadius: "100px",
          background: C.blue, color: C.white,
          border: "none", cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          boxShadow: disabled ? "none" : "0 4px 18px rgba(43,52,255,0.28)",
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{ background: C.ink, padding: "64px 56px 32px", fontFamily: F.body }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 48, marginBottom: 52 }}>
        <div>
          <span style={{ fontFamily: F.display, fontSize: 24, fontWeight: 800, color: C.white, marginBottom: 14, display: "block" }}>
            Home<span style={{ color: C.yellow }}>Gentic</span>
          </span>
          <p style={{ fontFamily: F.body, fontSize: 14, color: "rgba(252,252,253,0.5)", lineHeight: 1.65, maxWidth: 220, margin: "0 0 24px" }}>
            The verified maintenance record that makes your home worth more and easier to sell.
          </p>
        </div>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(252,252,253,0.5)", marginBottom: 20 }}>Product</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            {[["Pricing", "/pricing"], ["Gift a Sub", "/gift"], ["FAQ", "/faq"]].map(([label, href]) => (
              <li key={label}><Link to={href} style={{ fontFamily: F.body, fontSize: 14, color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(252,252,253,0.5)", marginBottom: 20 }}>Free Tools</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            {[["Report Lookup", "/check"], ["System Forecast", "/instant-forecast"], ["Price Lookup", "/prices"], ["Systems Estimator", "/home-systems"]].map(([label, href]) => (
              <li key={label}><Link to={href} style={{ fontFamily: F.body, fontSize: 14, color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(252,252,253,0.5)", marginBottom: 20 }}>Company</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            {[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Support", "/support"]].map(([label, href]) => (
              <li key={label}><Link to={href} style={{ fontFamily: F.body, fontSize: 14, color: "rgba(252,252,253,0.6)", textDecoration: "none" }}>{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(252,252,253,0.08)", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: F.body, fontSize: 13, color: "rgba(252,252,253,0.5)" }}>
        <span>© 2026 HomeGentic Inc.</span>
        <div style={{ display: "flex", gap: 24 }}>
          <Link to="/privacy" style={{ color: "rgba(252,252,253,0.5)", textDecoration: "none" }}>Privacy</Link>
          <Link to="/terms"   style={{ color: "rgba(252,252,253,0.5)", textDecoration: "none" }}>Terms</Link>
          <Link to="/support" style={{ color: "rgba(252,252,253,0.5)", textDecoration: "none" }}>Support</Link>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: GiftFormData = {
  tier:           "Basic",
  billing:        "monthly",
  recipientName:  "",
  recipientEmail: "",
  senderName:     "",
  senderEmail:    "",
  giftMessage:    "",
  deliveryDate:   "now",
};

export default function GiftPage() {
  const [step, setStep]       = useState<GiftStep>("select");
  const [form, setForm]       = useState<GiftFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await paymentService.startStripeCheckout(
        form.tier,
        form.billing === "annual" ? "Yearly" : "Monthly",
        {
          recipientEmail: form.recipientEmail,
          recipientName:  form.recipientName,
          senderName:     form.senderName,
          giftMessage:    form.giftMessage,
          deliveryDate:   form.deliveryDate,
        },
      );
      // startStripeCheckout redirects — code below only runs if canister isn't deployed
      setStep("done");
    } catch (e: any) {
      setSubmitError(e?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const stepMap: Record<GiftStep, React.ReactNode> = {
    select:    <StepSelect    data={form} setData={setForm} onNext={() => setStep("recipient")} />,
    recipient: <StepRecipient data={form} setData={setForm} onNext={() => setStep("message")}  onBack={() => setStep("select")} />,
    message:   <StepMessage   data={form} setData={setForm} onNext={() => setStep("review")}   onBack={() => setStep("recipient")} />,
    review:    <StepReview    data={form} onSubmit={handleSubmit} onBack={() => setStep("message")} loading={submitting} error={submitError} />,
    done:      <StepDone      data={form} />,
  };

  return (
    <>
      <Helmet>
        <title>Gift a HomeGentic Subscription</title>
        <meta name="description" content="Give the gift of a verified home. Gift a HomeGentic Pro or Premium subscription to a buyer, client, or homeowner you care about." />
      </Helmet>

      <div style={{ background: C.paper, minHeight: "100vh", fontFamily: F.body }}>
        <NavBar />

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "72px 56px 100px" }}>

          {/* Hero */}
          {step !== "done" && (
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <h1 style={{
                fontFamily: F.display, fontSize: "clamp(36px, 5vw, 56px)",
                fontWeight: 800, color: C.ink, letterSpacing: "-1.5px",
                lineHeight: 1.05, margin: "0 0 20px",
              }}>
                Give the gift of a<br />
                <span style={{ fontWeight: 400, color: C.blue }}>verified home.</span>
              </h1>
              <p style={{
                fontFamily: F.body, fontSize: 17, color: C.muted,
                lineHeight: 1.7, maxWidth: 560, margin: "0 auto 10px",
              }}>
                Close more confidently. Gift your buyer a{" "}
                <span style={{ fontFamily: F.display, fontWeight: 800, color: C.ink }}>Home</span><span style={{ color: C.yellowText, fontFamily: F.display, fontWeight: 800 }}>Gentic</span>
                {" "}Pro or Premium subscription at closing — so they start building a verified maintenance record from day one.
              </p>
              <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted, margin: 0 }}>
                Works for anyone: family, friends, clients, neighbors.
              </p>
            </div>
          )}

          <StepIndicator step={step} />

          {/* Active step */}
          {stepMap[step]}

        </div>

        <Footer />
      </div>
    </>
  );
}
