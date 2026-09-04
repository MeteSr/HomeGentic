import React, { useEffect, useState } from "react";
import { jobService, type Job } from "@/services/job";
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

function inCurrentCycle(dateStr: string): boolean {
  const now = new Date();
  const [y, m] = dateStr.split("-").map(Number);
  return y === now.getFullYear() && m === now.getMonth() + 1;
}

function nextCycleDueDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface LedgerRow {
  id:           string;
  label:        string;
  dateLabel:    string;
  awardedCents: number;
  feeCents:     number;
  floored:      boolean;
}

function toLedgerRow(j: Job): LedgerRow {
  return {
    id:           j.id,
    label:        j.description || j.serviceType,
    dateLabel:    new Date(j.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    awardedCents: j.amount,
    feeCents:     referralService.calculateFee(j.amount),
    floored:      referralService.isFloored(j.amount),
  };
}

// ── Shared ledger table ───────────────────────────────────────────────────────

function FeeLedgerTable({ rows, variant }: { rows: LedgerRow[]; variant: "due" | "waived" }) {
  if (rows.length === 0) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: V2_RADIUS.sm, padding: "1.5rem", textAlign: "center" }}>
        <p style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.muted }}>
          No bids won yet this cycle.
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
        {variant === "due" && <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.08em", color: C.muted }}>AWARDED</span>}
        <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.08em", color: C.muted, textAlign: "right" }}>
          {variant === "due" ? `${FEE_LABEL} FEE` : "WAIVED"}
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: "grid", gridTemplateColumns: variant === "due" ? "1.5fr 1fr 76px" : "1fr 84px", gap: "0.75rem", padding: "0.75rem 1rem", alignItems: "center", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.875rem", color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
            <div style={{ fontFamily: F.body, fontSize: "0.75rem", color: C.muted, marginTop: "0.125rem" }}>
              {variant === "due" ? r.dateLabel : `${r.dateLabel} · ${money(r.awardedCents)}`}
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
          {variant === "due" ? `Due ${nextCycleDueDate()} · ${rows.length} bid${rows.length === 1 ? "" : "s"} won · ${money(awardedTotal)} awarded` : "Waived on Pro"}
        </span>
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: "1.375rem", letterSpacing: "-0.03em", color: variant === "due" ? C.orange : C.green }}>
          {dollarsAndCents(feeTotal)}
        </span>
      </div>
    </div>
  );
}

// ── Free view ──────────────────────────────────────────────────────────────

function FreeBillingView({ rows, onUpgradeClick }: { rows: LedgerRow[]; onUpgradeClick: () => void }) {
  const dueTotalCents = rows.reduce((sum, r) => sum + r.feeCents, 0);
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
          No subscription. {FEE_LABEL} of the awarded value is charged each time a homeowner picks your bid, or {FLOOR_LABEL}, whichever is greater.
        </p>
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
            "Lead notifications the moment a job posts",
            "50 photos per job instead of 5",
            "Trust score shown on your public profile",
            "Earnings dashboard across all jobs",
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
          Fees on bids already won this cycle are still due. Cancel anytime.
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
          Each winning bid would have carried a {FEE_LABEL} fee on Free.
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
  const [jobs, setJobs]       = useState<Job[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    jobService.getMyReferralJobs()
      .then((data) => { if (!cancelled) setJobs(data); })
      .catch(() => { if (!cancelled) { setJobs([]); setLoadFailed(true); } });
    return () => { cancelled = true; };
  }, []);

  if (jobs === null) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner-lg" /></div>;
  }

  const rows = jobs
    .filter((j) => j.verified && inCurrentCycle(j.date))
    .map(toLedgerRow);

  return (
    <div>
      {loadFailed && (
        <p style={{ fontFamily: F.body, fontSize: "0.8125rem", color: C.muted, marginBottom: "0.875rem" }}>
          Couldn't load this cycle's bids — showing an empty ledger.
        </p>
      )}
      {tier === "ContractorFree"
        ? <FreeBillingView rows={rows} onUpgradeClick={onUpgradeClick} />
        : <ProBillingView rows={rows} renewDate={renewDate} onCancelClick={onCancelClick} />}
    </div>
  );
}
