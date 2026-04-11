import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { paymentService } from "@/services/payment";
import { Helmet } from "react-helmet-async";
import { CheckCircle } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type GiftTier    = "Pro" | "Premium";
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
  Pro: {
    monthlyPrice: 10,
    annualPrice:  100,
    tagline: "Perfect for first-time buyers",
    bullets: [
      "Verified maintenance record from move-in",
      "Score breakdown + Warranty Wallet",
      "5-Year Maintenance Calendar",
      "10 contractor quote requests/month",
    ],
  },
  Premium: {
    monthlyPrice: 20,
    annualPrice:  200,
    tagline: "For multiple properties or serious sellers",
    bullets: [
      "Everything in Pro",
      "Insurance Defense Mode",
      "PDF export ready for future sale",
      "Priority support",
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
      padding: "0 56px", height: 64, borderBottom: `1px solid ${COLORS.rule}`,
      background: COLORS.white, position: "sticky", top: 0, zIndex: 100,
    }}>
      <Link to="/" style={{
        fontFamily: FONTS.serif, fontSize: 20, fontWeight: 900,
        color: COLORS.plum, textDecoration: "none", letterSpacing: "-0.5px",
      }}>
        Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
      </Link>
      <Link to="/login" style={{
        fontFamily: FONTS.sans, fontSize: 14, fontWeight: 600,
        color: COLORS.white, background: COLORS.plum, textDecoration: "none",
        padding: "10px 22px", borderRadius: RADIUS.pill,
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
                width: 28, height: 28, borderRadius: RADIUS.pill,
                background: done || active ? COLORS.sage : "transparent",
                border: `2px solid ${done || active ? COLORS.sage : COLORS.rule}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: done || active ? COLORS.white : COLORS.rule,
                fontFamily: FONTS.sans, transition: "all .2s",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{
                fontFamily: FONTS.sans, fontSize: 12,
                color: active ? COLORS.plum : done ? COLORS.sage : COLORS.rule,
                fontWeight: active ? 700 : 400, whiteSpace: "nowrap",
              }}>
                {s.label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{
                width: 64, height: 2, margin: "0 8px", marginBottom: 28,
                background: i < activeIndex ? COLORS.sage : COLORS.rule,
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
      <label style={{ fontFamily: FONTS.sans, fontSize: 13, fontWeight: 600, color: COLORS.plumMid }}>
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
          width: "100%", padding: "12px 14px", borderRadius: RADIUS.input,
          border: `1.5px solid ${error ? COLORS.rust : focused ? COLORS.sage : COLORS.rule}`,
          fontFamily: FONTS.sans, fontSize: "0.9rem", color: COLORS.plum,
          background: COLORS.white, outline: "none", boxSizing: "border-box",
          transition: "border-color .15s",
        }}
      />
      {error && (
        <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.rust }}>{error}</span>
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
              fontFamily: FONTS.sans, fontSize: 13, fontWeight: 600,
              padding: "8px 20px", borderRadius: RADIUS.pill,
              border: `1.5px solid ${data.billing === b ? COLORS.plum : COLORS.rule}`,
              background: data.billing === b ? COLORS.plum : "transparent",
              color: data.billing === b ? COLORS.white : COLORS.plumMid,
              cursor: "pointer", transition: "all .2s",
            }}
          >
            {b === "monthly" ? "Monthly" : "Annual"}
            {b === "annual" && (
              <span style={{ marginLeft: 8, background: COLORS.sage, color: COLORS.white, padding: "2px 8px", borderRadius: RADIUS.pill, fontSize: 10 }}>
                Save 2mo
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {(["Pro", "Premium"] as GiftTier[]).map((tier) => {
          const plan    = GIFT_PLANS[tier];
          const price   = data.billing === "monthly" ? plan.monthlyPrice : plan.annualPrice;
          const period  = data.billing === "monthly" ? "/mo" : "/yr";
          const isPlum  = tier === "Premium";
          const active  = data.tier === tier;

          return (
            <div
              key={tier}
              onClick={() => setData((d) => ({ ...d, tier }))}
              style={{
                borderRadius: RADIUS.card, padding: "36px 32px", cursor: "pointer",
                background: isPlum ? COLORS.plum : COLORS.white,
                border: `2px solid ${active ? COLORS.sage : isPlum ? "transparent" : COLORS.rule}`,
                boxShadow: active ? `0 0 0 4px ${COLORS.sage}22` : SHADOWS.card,
                transition: "all .2s", position: "relative",
              }}
            >
              {/* Badge */}
              <div style={{
                display: "inline-block", marginBottom: 16,
                fontFamily: FONTS.sans, fontSize: 12, fontWeight: 600,
                color: isPlum ? COLORS.plum : COLORS.sage,
                background: isPlum ? COLORS.butter : COLORS.sageLight,
                padding: "4px 12px", borderRadius: RADIUS.pill,
              }}>
                {tier === "Pro" ? "Most Popular" : "Best Gift"}
              </div>

              <div style={{ fontFamily: FONTS.serif, fontSize: 28, fontWeight: 900, color: isPlum ? COLORS.white : COLORS.plum, marginBottom: 4 }}>
                {tier}
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: isPlum ? "rgba(253,252,250,0.55)" : COLORS.plumMid, marginBottom: 20 }}>
                {plan.tagline}
              </div>

              <div style={{ marginBottom: 24 }}>
                <span style={{ fontFamily: FONTS.serif, fontSize: 42, fontWeight: 900, color: isPlum ? COLORS.white : COLORS.plum }}>
                  ${price}
                </span>
                <span style={{ fontFamily: FONTS.sans, fontSize: 14, color: isPlum ? "rgba(253,252,250,0.5)" : COLORS.plumMid }}>
                  {period}
                </span>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.bullets.map((b) => (
                  <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: FONTS.sans, fontSize: 14, color: isPlum ? "rgba(253,252,250,0.8)" : COLORS.plum }}>
                    <span style={{ color: COLORS.sage, flexShrink: 0, marginTop: 2 }}>✓</span>
                    {b}
                  </li>
                ))}
              </ul>

              <button
                onClick={(e) => { e.stopPropagation(); setData((d) => ({ ...d, tier })); onNext(); }}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: RADIUS.pill,
                  fontFamily: FONTS.sans, fontSize: 15, fontWeight: 700,
                  background: isPlum ? COLORS.sage : COLORS.plum,
                  color: COLORS.white, border: "none", cursor: "pointer",
                  transition: "opacity .2s",
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
        <label style={{ fontFamily: FONTS.sans, fontSize: 13, fontWeight: 600, color: COLORS.plumMid }}>
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
            width: "100%", padding: "12px 14px", borderRadius: RADIUS.input,
            border: `1.5px solid ${focused ? COLORS.sage : COLORS.rule}`,
            fontFamily: FONTS.sans, fontSize: "0.9rem", color: COLORS.plum,
            background: COLORS.white, outline: "none", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.6,
          }}
        />
        <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: count > 250 ? COLORS.rust : COLORS.plumMid, alignSelf: "flex-end" }}>
          {count}/280
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontFamily: FONTS.sans, fontSize: 13, fontWeight: 600, color: COLORS.plumMid }}>
          Delivery
        </label>
        {[
          { value: "now",   label: "Send immediately" },
          { value: "later", label: "Schedule for a date" },
        ].map((opt) => (
          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: FONTS.sans, fontSize: 15, color: COLORS.plum }}>
            <input
              type="radio"
              name="delivery"
              checked={opt.value === "now" ? data.deliveryDate === "now" : data.deliveryDate !== "now"}
              onChange={() => setData((d) => ({ ...d, deliveryDate: opt.value === "now" ? "now" : today() }))}
              style={{ accentColor: COLORS.sage, width: 16, height: 16 }}
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
              padding: "10px 14px", borderRadius: RADIUS.input, maxWidth: 220,
              border: `1.5px solid ${COLORS.rule}`, fontFamily: FONTS.sans, fontSize: "0.9rem",
              color: COLORS.plum, background: COLORS.white, outline: "none",
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
      <div style={{ borderRadius: RADIUS.card, border: `1.5px solid ${COLORS.rule}`, overflow: "hidden" }}>
        <div style={{ background: COLORS.plum, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: FONTS.serif, fontSize: 22, fontWeight: 900, color: COLORS.white }}>{data.tier}</span>
            <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: "rgba(253,252,250,0.5)", marginLeft: 12 }}>{data.billing}</span>
          </div>
          <span style={{ fontFamily: FONTS.serif, fontSize: 28, fontWeight: 900, color: COLORS.white }}>${price}<span style={{ fontFamily: FONTS.sans, fontSize: 14, color: "rgba(253,252,250,0.5)" }}>{period}</span></span>
        </div>
        <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "To",      value: `${data.recipientName} · ${data.recipientEmail}` },
            { label: "From",    value: `${data.senderName} · ${data.senderEmail}` },
            { label: "Deliver", value: data.deliveryDate === "now" ? "Immediately" : data.deliveryDate },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: FONTS.sans, fontSize: 11, fontWeight: 600, color: COLORS.plumMid, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.plum }}>{value}</div>
            </div>
          ))}
        </div>
        {data.giftMessage && (
          <div style={{ margin: "0 28px 24px", padding: "20px 24px", background: `linear-gradient(135deg, ${COLORS.blush}, ${COLORS.butter})`, borderRadius: RADIUS.sm }}>
            <p style={{ fontFamily: FONTS.serif, fontSize: 16, fontStyle: "italic", color: COLORS.plum, margin: 0, lineHeight: 1.65 }}>
              "{data.giftMessage}"
            </p>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#FEE2E2", border: "1px solid #FCA5A5", fontFamily: FONTS.sans, fontSize: 13, color: "#991B1B" }}>
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
        <CheckCircle size={56} color={COLORS.sage} strokeWidth={1.5} />
      </div>
      <h2 style={{ fontFamily: FONTS.serif, fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, color: COLORS.plum, letterSpacing: "-1px", margin: "0 0 16px" }}>
        Your gift is on its way.
      </h2>
      <p style={{ fontFamily: FONTS.sans, fontSize: 17, color: COLORS.plumMid, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px" }}>
        We'll send <strong>{data.recipientName}</strong> an email at <strong>{data.recipientEmail}</strong> with instructions to activate their {data.tier} subscription. A receipt will go to <strong>{data.senderEmail}</strong>.
      </p>

      <div style={{
        display: "inline-block", padding: "16px 28px", borderRadius: RADIUS.card,
        background: COLORS.butter, maxWidth: 480, textAlign: "left", marginBottom: 40,
        fontFamily: FONTS.sans, fontSize: 14, color: COLORS.plum, lineHeight: 1.65,
      }}>
        🎁 The subscription activates when {data.recipientName.split(" ")[0]} signs in and accepts the gift. They'll have 30 days to redeem.
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        <Link to="/pricing" style={{
          fontFamily: FONTS.sans, fontSize: 15, fontWeight: 600,
          padding: "12px 28px", borderRadius: RADIUS.pill,
          border: `1.5px solid ${COLORS.plum}`, color: COLORS.plum, textDecoration: "none",
        }}>
          View Pricing
        </Link>
        <Link to="/" style={{
          fontFamily: FONTS.sans, fontSize: 15, fontWeight: 600,
          padding: "12px 28px", borderRadius: RADIUS.pill,
          background: COLORS.plum, color: COLORS.white, textDecoration: "none",
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
          fontFamily: FONTS.sans, fontSize: 15, fontWeight: 600,
          padding: "12px 28px", borderRadius: RADIUS.pill,
          border: `1.5px solid ${COLORS.rule}`, background: "transparent",
          color: COLORS.plumMid, cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        ← Back
      </button>
      <button
        onClick={onNext}
        disabled={disabled}
        style={{
          fontFamily: FONTS.sans, fontSize: 15, fontWeight: 700,
          padding: "12px 32px", borderRadius: RADIUS.pill,
          background: COLORS.plum, color: COLORS.white,
          border: "none", cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{ background: "#1E1928", padding: "64px 56px 32px", fontFamily: FONTS.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 48, marginBottom: 52 }}>
        <div>
          <span style={{ fontFamily: FONTS.serif, fontSize: 24, fontWeight: 900, color: "white", marginBottom: 14, display: "block" }}>
            Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </span>
          <p style={{ fontSize: 14, color: "rgba(253,252,250,0.45)", lineHeight: 1.65, maxWidth: 220, margin: "0 0 24px" }}>
            The verified maintenance record that makes your home worth more and easier to sell.
          </p>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(253,252,250,0.35)", marginBottom: 20 }}>Product</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            {[["Pricing", "/pricing"], ["Gift a Sub", "/gift"], ["FAQ", "/faq"]].map(([label, href]) => (
              <li key={label}><Link to={href} style={{ fontSize: 14, color: "rgba(253,252,250,0.6)", textDecoration: "none" }}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(253,252,250,0.35)", marginBottom: 20 }}>Free Tools</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            {[["Report Lookup", "/check"], ["System Forecast", "/instant-forecast"], ["Price Lookup", "/prices"], ["Systems Estimator", "/home-systems"]].map(([label, href]) => (
              <li key={label}><Link to={href} style={{ fontSize: 14, color: "rgba(253,252,250,0.6)", textDecoration: "none" }}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(253,252,250,0.35)", marginBottom: 20 }}>Company</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            {[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Support", "/support"]].map(([label, href]) => (
              <li key={label}><Link to={href} style={{ fontSize: 14, color: "rgba(253,252,250,0.6)", textDecoration: "none" }}>{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(253,252,250,0.08)", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "rgba(253,252,250,0.35)" }}>
        <span>© 2026 HomeGentic Inc.</span>
        <div style={{ display: "flex", gap: 24 }}>
          <Link to="/privacy" style={{ color: "rgba(253,252,250,0.35)", textDecoration: "none" }}>Privacy</Link>
          <Link to="/terms"   style={{ color: "rgba(253,252,250,0.35)", textDecoration: "none" }}>Terms</Link>
          <Link to="/support" style={{ color: "rgba(253,252,250,0.35)", textDecoration: "none" }}>Support</Link>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: GiftFormData = {
  tier:           "Pro",
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

      <div style={{ background: COLORS.white, minHeight: "100vh", fontFamily: FONTS.sans }}>
        <NavBar />

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "72px 56px 100px" }}>

          {/* Hero */}
          {step !== "done" && (
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <h1 style={{
                fontFamily: FONTS.serif, fontSize: "clamp(36px, 5vw, 56px)",
                fontWeight: 900, color: COLORS.plum, letterSpacing: "-1.5px",
                lineHeight: 1.05, margin: "0 0 20px",
              }}>
                Give the gift of a<br />
                <em style={{ fontStyle: "italic", fontWeight: 300, color: COLORS.sage }}>verified home.</em>
              </h1>
              <p style={{
                fontFamily: FONTS.sans, fontSize: 17, color: COLORS.plumMid,
                lineHeight: 1.7, maxWidth: 560, margin: "0 auto 10px",
              }}>
                Close more confidently. Gift your buyer a <span style={{ fontFamily: FONTS.serif, fontWeight: 900, color: COLORS.plum }}>Home</span><span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300, fontFamily: FONTS.serif }}>Gentic</span> Pro or Premium subscription at closing — so they start building a verified maintenance record from day one.
              </p>
              <p style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.plumMid, margin: 0 }}>
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
