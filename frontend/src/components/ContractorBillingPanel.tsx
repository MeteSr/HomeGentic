import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { feeService, REFERRAL_FALLBACK_DAYS, type ReferralFee, type ReferralCard } from "@/services/fee";
import { quoteService, type Quote } from "@/services/quote";
import { referralService } from "@/services/referralService";
import { PLANS } from "@/services/planConstants";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

const CONTRACTOR_PRO_PRICE = PLANS.find((p) => p.tier === "ContractorPro")?.price ?? 40;
const FEE_LABEL   = `${referralService.REFERRAL_FEE_RATE * 100}%`;
const FLOOR_LABEL = `$${referralService.REFERRAL_FEE_FLOOR_CENTS / 100}`;

// ── Formatting ──────────────────────────────────────────────────────────────

const money = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-US");
const dollarsAndCents = (cents: number) => "$" + (cents / 100).toFixed(2);

const DAY_MS = 86_400_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function inCurrentCycle(ms: number): boolean {
  const now = new Date();
  const d = new Date(ms);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

interface LedgerRow {
  id:           string;
  label:        string;
  dateLabel:    string;
  awardedCents: number;
  feeCents:     number;
  floored:      boolean;
  /** Free only: where the fee stands. */
  status?:      string;
  payUrl?:      string;
}

/** Where a referral fee stands, in the contractor's words. */
export function referralFeeStatus(f: ReferralFee): string {
  switch (f.status) {
    case "Pending":
      return f.acceptedAt
        ? `Charged when the job is verified, or on ${shortDate(f.acceptedAt + REFERRAL_FALLBACK_DAYS * DAY_MS)}`
        : "Charged when the job is verified";
    case "Due":     return "Charging your card";
    case "Paid":    return "Paid";
    case "Waived":  return "Waived";
    case "PaymentFailed":
      return f.failedAt
        ? `Card declined. Pay the invoice by ${shortDate(f.failedAt + 30 * DAY_MS)} to keep bidding`
        : "Card declined. Pay the invoice to keep bidding";
  }
}

function feeRow(f: ReferralFee): LedgerRow {
  const offApp = f.reason === "off_app_job";
  return {
    id:           f.id,
    label:        `${f.serviceType} bid${offApp ? " (job verified without an accepted bid)" : ""}`,
    dateLabel:    shortDate(f.acceptedAt ?? f.createdAt),
    awardedCents: f.bidCents,
    feeCents:     f.feeCents,
    floored:      referralService.isFloored(f.bidCents),
    status:       referralFeeStatus(f),
    payUrl:       f.status === "PaymentFailed" && f.payUrl ? f.payUrl : undefined,
  };
}

/** Pro: what each accepted bid would have cost on Free. */
function bidRow(q: Quote): LedgerRow {
  return {
    id:           q.id,
    label:        "Accepted bid",
    dateLabel:    shortDate(q.createdAt),
    awardedCents: q.amount,
    feeCents:     referralService.calculateFee(q.amount),
    floored:      referralService.isFloored(q.amount),
  };
}

// ── Card on file ────────────────────────────────────────────────────────────

/** Contractor Free: the card referral fees are charged to, and the consent to save one. */
export function ReferralCardBox({ card, justSaved }: { card: ReferralCard | null; justSaved?: boolean }) {
  const [agreed, setAgreed]   = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      const url = await feeService.startReferralCardSetup(`${window.location.origin}/settings?tab=subscription`);
      window.location.assign(url);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't open the card form just now.");
      setOpening(false);
    }
  };

  return (
    <div data-testid="referral-card" style={{ border: `1px solid ${card ? C.border : C.amberBorder}`, background: card ? C.surface : C.amberBg, borderRadius: V2_RADIUS.sm, padding: "1rem", marginBottom: "1.25rem" }}>
      {card ? (
        <p style={{ fontFamily: F.body, fontSize: "0.875rem", color: C.ink, margin: 0 }}>
          Referral fees are charged to your <strong style={{ textTransform: "capitalize" }}>{card.brand}</strong> ending {card.last4}, saved {shortDate(card.agreedAt)}.
        </p>
      ) : (
        <>
          <p style={{ fontFamily: F.body, fontWeight: 700, fontSize: "0.875rem", color: C.amberText, margin: 0 }}>Save a card before you bid</p>
          <p style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.amberText, margin: "0.375rem 0 0", lineHeight: 1.55 }}>
            {justSaved
              ? "Stripe has your card. It can take a minute to show here; refresh if it doesn't."
              : `Each bid a homeowner accepts carries a ${FEE_LABEL} fee (${FLOOR_LABEL} minimum). We charge it to this card once the job is verified, or ${REFERRAL_FALLBACK_DAYS} days after the homeowner accepts if it never is.`}
          </p>
        </>
      )}
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.75rem", fontFamily: F.body, fontSize: "0.8125rem", color: C.ink, lineHeight: 1.5 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: "0.2rem" }} />
        <span>
          I agree to the <Link to="/terms#referral-fee" style={{ color: C.blue }}>contractor referral fee terms</Link>, including the fee on a job verified within 6 months for a home and trade I bid on here.
        </span>
      </label>
      <button
        type="button"
        onClick={open}
        disabled={!agreed || opening}
        style={{ marginTop: "0.75rem", padding: "0.625rem 1.125rem", border: "none", borderRadius: V2_RADIUS.pill, background: agreed ? C.ink : C.divider, color: C.paper, fontFamily: F.body, fontWeight: 700, fontSize: "0.8125rem", cursor: agreed && !opening ? "pointer" : "not-allowed" }}
      >
        {opening ? "Opening Stripe…" : card ? "Replace card" : "Save card with Stripe"}
      </button>
      {error && <p role="alert" style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.orange, margin: "0.5rem 0 0" }}>{error}</p>}
    </div>
  );
}

// ── Shared ledger table ───────────────────────────────────────────────────────

function FeeLedgerTable({ rows, variant }: { rows: LedgerRow[]; variant: "due" | "waived" }) {
  if (rows.length === 0) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: V2_RADIUS.sm, padding: "1.5rem", textAlign: "center" }}>
        <p style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.muted }}>
          {variant === "due" ? "No referral fees yet." : "No bids won yet this cycle."}
        </p>
      </div>
    );
  }

  const awardedTotal = rows.reduce((sum, r) => sum + r.awardedCents, 0);
  const feeTotal      = rows.reduce((sum, r) => sum + r.feeCents, 0);

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: V2_RADIUS.sm, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: variant === "due" ? "1.5fr 1fr 76px" : "1fr 84px", gap: "0.75rem", padding: "0.75rem 1rem", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.08em", color: C.muted }}>BID WON</span>
        {variant === "due" && <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.08em", color: C.muted }}>BID</span>}
        <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.08em", color: C.muted, textAlign: "right" }}>
          {variant === "due" ? `${FEE_LABEL} FEE` : "WAIVED"}
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: "grid", gridTemplateColumns: variant === "due" ? "1.5fr 1fr 76px" : "1fr 84px", gap: "0.75rem", padding: "0.75rem 1rem", alignItems: "center", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
            <div style={{ fontFamily: F.body, fontSize: "0.75rem", color: C.muted, marginTop: "0.125rem" }}>
              {variant === "due" ? `${r.dateLabel} · ${r.status}` : `${r.dateLabel} · ${money(r.awardedCents)}`}
              {r.payUrl && <> · <a href={r.payUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.blue }}>Pay invoice</a></>}
            </div>
          </div>
          {variant === "due" && (
            <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: "0.8125rem", color: C.muted }}>{money(r.awardedCents)}</div>
          )}
          <div style={{ textAlign: "right" }}>
            {variant === "due" ? (
              <>
                <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: "0.8125rem", color: C.ink }}>{dollarsAndCents(r.feeCents)}</div>
                {r.floored && (
                  <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", color: C.amberText, background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 4, padding: "2px 5px", display: "inline-block", marginTop: "0.25rem" }}>
                    MIN
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: "0.8125rem", color: C.green, textDecoration: "line-through" }}>{dollarsAndCents(r.feeCents)}</div>
            )}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.75rem", padding: "1rem", background: variant === "due" ? C.surface : C.greenBg }}>
        <span style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.8125rem", color: variant === "due" ? C.muted : C.green }}>
          {variant === "due" ? `${rows.length} bid${rows.length === 1 ? "" : "s"} won · ${money(awardedTotal)} in bids` : "Waived on Pro"}
        </span>
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.375rem", letterSpacing: "-0.03em", color: variant === "due" ? C.orange : C.green }}>
          {dollarsAndCents(feeTotal)}
        </span>
      </div>
    </div>
  );
}

// ── Free view ──────────────────────────────────────────────────────────────

function FreeBillingView({ fees, card, justSaved, onUpgradeClick }: { fees: ReferralFee[]; card: ReferralCard | null; justSaved: boolean; onUpgradeClick: () => void }) {
  const rows          = fees.filter((f) => f.status !== "Waived").map(feeRow);
  const dueTotalCents = fees
    .filter((f) => f.status !== "Waived" && inCurrentCycle(f.acceptedAt ?? f.createdAt))
    .reduce((sum, f) => sum + f.feeCents, 0);
  const savings       = dueTotalCents - CONTRACTOR_PRO_PRICE * 100;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))", gap: "1.25rem", alignItems: "start" }}>
      <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: V2_RADIUS.card, padding: "1.625rem", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.875rem" }}>
          <div>
            <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.14em", color: C.muted }}>CURRENT PLAN</div>
            <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.375rem", letterSpacing: "-0.03em", marginTop: "0.5rem", color: C.ink }}>Contractor Free</div>
          </div>
          <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.08em", color: C.green, background: C.greenBg, borderRadius: V2_RADIUS.pill, padding: "0.5rem 0.75rem" }}>ACTIVE</div>
        </div>
        <p style={{ fontFamily: F.body, fontSize: "0.875rem", color: C.muted, marginBottom: "1.25rem", lineHeight: 1.6 }}>
          No subscription. Each bid a homeowner accepts carries a fee of {FEE_LABEL} of the bid, or {FLOOR_LABEL}, whichever is greater.{" "}
          <Link to="/terms#referral-fee" style={{ color: C.blue }}>How the fee works</Link>
        </p>
        <ReferralCardBox card={card} justSaved={justSaved} />
        <FeeLedgerTable rows={rows} variant="due" />
      </div>

      <div style={{ background: C.ink, borderRadius: V2_RADIUS.card, padding: "1.625rem", minWidth: 0 }}>
        <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.14em", color: C.yellow }}>UPGRADE AVAILABLE</div>
        <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.375rem", lineHeight: 1.14, letterSpacing: "-0.03em", color: C.paper, marginTop: "0.75rem" }}>
          {savings > 0
            ? `Pro would have saved you ${dollarsAndCents(savings)} this cycle`
            : "Free is still the cheaper plan at your volume"}
        </div>
        <p style={{ fontFamily: F.body, fontSize: "0.875rem", color: "rgba(252,252,253,0.7)", marginTop: "0.75rem", lineHeight: 1.6 }}>
          Contractor Pro is ${CONTRACTOR_PRO_PRICE} a month with no {FEE_LABEL} fee, however much work you win. This cycle you would have paid ${CONTRACTOR_PRO_PRICE} instead of {dollarsAndCents(dueTotalCents)}.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6875rem", marginTop: "1.25rem", paddingTop: "1.125rem", borderTop: "1px solid rgba(252,252,253,0.16)" }}>
          {[
            `No ${FEE_LABEL} fee on any winning bid`,
            "Lead alerts the moment a job posts, 30 minutes before Free",
            "50 photos per job instead of 5",
            "A featured portfolio and automatic review requests",
            "Month-by-month earnings with CSV export",
          ].map((f) => (
            <div key={f} style={{ display: "grid", gridTemplateColumns: "1rem minmax(0,1fr)", gap: "0.625rem", alignItems: "start" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.yellow} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "0.1875rem" }}><path d="M20 6.5 9.2 17.3 4 12.1" /></svg>
              <span style={{ fontFamily: F.body, fontSize: "0.875rem", color: "rgba(252,252,253,0.82)", lineHeight: 1.45 }}>{f}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onUpgradeClick}
          style={{ width: "100%", marginTop: "1.375rem", padding: "0.875rem 0", border: "none", borderRadius: V2_RADIUS.pill, background: C.yellow, color: C.ink, fontFamily: F.body, fontWeight: 700, fontSize: "0.9375rem", cursor: "pointer" }}
        >
          Upgrade to Pro — ${CONTRACTOR_PRO_PRICE}/mo
        </button>
        <p style={{ fontFamily: F.body, fontSize: "0.75rem", color: "rgba(252,252,253,0.5)", marginTop: "0.75rem", textAlign: "center" }}>
          Fees on bids sent before you upgrade still apply. Cancel anytime.
        </p>
      </div>
    </div>
  );
}

// ── Pro view ───────────────────────────────────────────────────────────────

function ProBillingView({ rows, renewDate, onCancelClick }: { rows: LedgerRow[]; renewDate: string | null; onCancelClick: () => void }) {
  const awardedTotal = rows.reduce((sum, r) => sum + r.awardedCents, 0);
  const waivedTotal  = rows.reduce((sum, r) => sum + r.feeCents, 0);
  const net          = waivedTotal - CONTRACTOR_PRO_PRICE * 100;
  const flooredCount = rows.filter((r) => r.floored).length;

  const stats = [
    { label: "WORK WON, CYCLE", value: money(awardedTotal), color: C.ink, note: `${rows.length} winning bid${rows.length === 1 ? "" : "s"}, all fee-free on Pro.` },
    { label: "FEES WAIVED", value: dollarsAndCents(waivedTotal), color: C.green, note: flooredCount > 0 ? `${FEE_LABEL} of awarded value on Free, ${flooredCount} at the ${FLOOR_LABEL} minimum.` : `${FEE_LABEL} of awarded value on Free.` },
    { label: "NET POSITION", value: (net >= 0 ? "+" : "-") + dollarsAndCents(Math.abs(net)), color: net > 0 ? C.green : C.orange, note: net > 0 ? "Ahead of the Free plan." : "Behind the Free plan this cycle." },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))", gap: "1.25rem", alignItems: "start" }}>
      <div style={{ background: C.paper, border: `1.5px solid ${C.blue}`, borderRadius: V2_RADIUS.card, padding: "1.625rem", minWidth: 0, boxShadow: "0 8px 32px rgba(43,52,255,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
          <div>
            <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.14em", color: C.blue }}>CURRENT PLAN</div>
            <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.375rem", letterSpacing: "-0.03em", marginTop: "0.5rem", color: C.ink }}>Contractor Pro</div>
          </div>
          <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.08em", color: C.blue, background: C.vbadge, border: `1px solid ${C.cobalTint}`, borderRadius: V2_RADIUS.pill, padding: "0.5rem 0.75rem" }}>
            NO {FEE_LABEL} FEE
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 8.75rem), 1fr))", gap: "0.75rem", marginTop: "1.25rem" }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: V2_RADIUS.sm, padding: "1rem" }}>
              <div style={{ fontFamily: F.mono, fontWeight: 600, fontSize: "0.59375rem", letterSpacing: "0.1em", color: C.muted }}>{s.label}</div>
              <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.3125rem", letterSpacing: "-0.03em", color: s.color, marginTop: "0.5625rem" }}>{s.value}</div>
              <div style={{ fontFamily: F.body, fontSize: "0.75rem", color: C.muted, marginTop: "0.375rem", lineHeight: 1.4 }}>{s.note}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.875rem", flexWrap: "wrap", marginTop: "1.25rem", paddingTop: "1.125rem", borderTop: `1px solid ${C.border}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.90625rem", color: C.ink }}>
              {renewDate ? `Next invoice ${renewDate}` : "Active subscription"}
            </div>
            <div style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.muted, marginTop: "0.1875rem" }}>${CONTRACTOR_PRO_PRICE}/mo</div>
          </div>
          <button
            type="button"
            onClick={onCancelClick}
            style={{ border: `1.5px solid ${C.divider}`, background: "transparent", color: C.muted, borderRadius: V2_RADIUS.pill, padding: "0.6875rem 1.25rem", fontFamily: F.body, fontWeight: 600, fontSize: "0.84375rem", cursor: "pointer" }}
          >
            Cancel plan
          </button>
        </div>
      </div>

      <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: V2_RADIUS.card, padding: "1.625rem", minWidth: 0 }}>
        <div style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.625rem", letterSpacing: "0.14em", color: C.muted }}>FEES WAIVED THIS CYCLE</div>
        <p style={{ fontFamily: F.body, fontSize: "0.875rem", color: C.muted, marginTop: "0.75rem", lineHeight: 1.6 }}>
          Each bid a homeowner accepted would have carried a {FEE_LABEL} fee on Free.
        </p>
        <div style={{ marginTop: "1.125rem" }}>
          <FeeLedgerTable rows={rows} variant="waived" />
        </div>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export interface ContractorBillingPanelProps {
  tier:            "ContractorFree" | "ContractorPro";
  renewDate:       string | null;
  onUpgradeClick:  () => void;
  onCancelClick:   () => void;
}

export default function ContractorBillingPanel({ tier, renewDate, onUpgradeClick, onCancelClick }: ContractorBillingPanelProps) {
  const [fees, setFees]       = useState<ReferralFee[] | null>(null);
  const [card, setCard]       = useState<ReferralCard | null>(null);
  const [bids, setBids]       = useState<Quote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const justSaved = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("referral_card") === "saved";

  useEffect(() => {
    let cancelled = false;
    const fail = () => { if (!cancelled) setLoadFailed(true); };
    if (tier === "ContractorFree") {
      Promise.all([feeService.getMyReferralFees(), feeService.getMyReferralCard()])
        .then(([f, c]) => { if (!cancelled) { setFees(f); setCard(c); } })
        .catch(() => { fail(); if (!cancelled) setFees([]); });
    } else {
      quoteService.getMyBids()
        .then((q) => { if (!cancelled) setBids(q); })
        .catch(() => { fail(); if (!cancelled) setBids([]); });
    }
    return () => { cancelled = true; };
  }, [tier]);

  const loading = tier === "ContractorFree" ? fees === null : bids === null;
  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner-lg" /></div>;
  }

  return (
    <div>
      {loadFailed && (
        <p style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.muted, marginBottom: "0.875rem" }}>
          Couldn't load your billing history — showing an empty ledger.
        </p>
      )}
      {tier === "ContractorFree"
        ? <FreeBillingView fees={fees ?? []} card={card} justSaved={justSaved} onUpgradeClick={onUpgradeClick} />
        : <ProBillingView rows={(bids ?? []).filter((q) => q.status === "accepted" && inCurrentCycle(q.createdAt)).map(bidRow)} renewDate={renewDate} onCancelClick={onCancelClick} />}
    </div>
  );
}
