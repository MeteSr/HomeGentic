/**
 * HomeGentic Admin Metrics Dashboard
 *
 * Queries three canisters directly via @dfinity/agent (anonymous identity,
 * public query methods only — no auth required):
 *   - auth       → getUserStats()
 *   - payment    → getSubscriptionStats()
 *   - monitoring → getActiveAlerts(), getAllCanisterMetrics(),
 *                  calculateCostMetrics(), calculateProfitability()
 *
 * Canister IDs are injected at build time from .env via vite.config.ts.
 * Run: cd dashboard && npm run dev  (port 3002)
 *
 * ── ICP cost model ───────────────────────────────────────────────────────────
 * All ICP infrastructure costs are paid in cycles (1T cycles ≈ $1.30 USD).
 * There is no separate storage billing — stable memory usage is charged via
 * cycles at roughly $5/GB/year. A dedicated ICP storage subnet (analogous to
 * S3 / blob storage) is in development and not yet generally available; when
 * it ships, costs will appear as a separate line here automatically once the
 * monitoring canister is updated to track it.
 */

import React, { useEffect, useState, useCallback } from "react";
import { HttpAgent, Actor } from "@dfinity/agent";
import { RefreshCw, AlertTriangle, Users, DollarSign, TrendingUp, Server, Cpu } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserStats {
  total: bigint;
  newToday: bigint;
  newThisWeek: bigint;
  activeThisWeek: bigint;
  homeowners: bigint;
  contractors: bigint;
  realtors: bigint;
  builders: bigint;
}

interface SubscriptionStats {
  total: bigint;
  free: bigint;
  pro: bigint;
  premium: bigint;
  contractorPro: bigint;
  activePaid: bigint;
  estimatedMrrUsd: bigint;
}

/** Float fields come back as JS number (not bigint) from @dfinity/candid Float64. */
interface CostMetrics {
  totalCyclesBurned: bigint;
  totalUsdCost: number;
  storageCostUsd: number;
  computeCostUsd: number;
  networkCostUsd: number;
  projectedMonthlyCostUsd: number;
  costPerUserUsd: number;
  calculatedAt: bigint;
}

interface ProfitabilityMetrics {
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
  marginPct: number;
  arpu: number;
  ltv: number;
  cac: number;
  ltvToCacRatio: number;
  breakEvenUsers: bigint;
  calculatedAt: bigint;
}

interface Alert {
  id: string;
  severity: { Critical?: null } | { Warning?: null } | { Info?: null };
  category: object;
  message: string;
  resolved: boolean;
  createdAt: bigint;
  canisterId: [] | [object];
  resolvedAt: [] | [bigint];
}

interface CanisterMetrics {
  canisterId: object;
  cyclesBalance: bigint;
  cyclesBurned: bigint;
  memoryBytes: bigint;
  requestCount: bigint;
  errorCount: bigint;
  avgResponseTimeMs: bigint;
  updatedAt: bigint;
  memoryCapacity: bigint;
}

// ── IDL factories ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authIdlFactory = ({ IDL: I }: any) => {
  const UserStats = I.Record({
    total:          I.Nat,
    newToday:       I.Nat,
    newThisWeek:    I.Nat,
    activeThisWeek: I.Nat,
    homeowners:     I.Nat,
    contractors:    I.Nat,
    realtors:       I.Nat,
    builders:       I.Nat,
  });
  return I.Service({ getUserStats: I.Func([], [UserStats], ["query"]) });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paymentIdlFactory = ({ IDL: I }: any) => {
  const SubscriptionStats = I.Record({
    total:           I.Nat,
    free:            I.Nat,
    pro:             I.Nat,
    premium:         I.Nat,
    contractorPro:   I.Nat,
    activePaid:      I.Nat,
    estimatedMrrUsd: I.Nat,
  });
  return I.Service({ getSubscriptionStats: I.Func([], [SubscriptionStats], ["query"]) });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const monitoringIdlFactory = ({ IDL: I }: any) => {
  const AlertSeverity = I.Variant({ Critical: I.Null, Warning: I.Null, Info: I.Null });
  const AlertCategory = I.Variant({
    Cycles: I.Null, ErrorRate: I.Null, ResponseTime: I.Null,
    Memory: I.Null, Milestone: I.Null, TopUp: I.Null,
  });
  const Alert = I.Record({
    id:         I.Text,
    severity:   AlertSeverity,
    category:   AlertCategory,
    canisterId: I.Opt(I.Principal),
    message:    I.Text,
    resolved:   I.Bool,
    createdAt:  I.Int,
    resolvedAt: I.Opt(I.Int),
  });
  const CanisterMetrics = I.Record({
    canisterId:        I.Principal,
    cyclesBalance:     I.Nat,
    cyclesBurned:      I.Nat,
    memoryBytes:       I.Nat,
    memoryCapacity:    I.Nat,
    requestCount:      I.Nat,
    errorCount:        I.Nat,
    avgResponseTimeMs: I.Nat,
    updatedAt:         I.Int,
  });
  const CostMetrics = I.Record({
    totalCyclesBurned:       I.Nat,
    totalUsdCost:            I.Float64,
    storageCostUsd:          I.Float64,
    computeCostUsd:          I.Float64,
    networkCostUsd:          I.Float64,
    projectedMonthlyCostUsd: I.Float64,
    costPerUserUsd:          I.Float64,
    calculatedAt:            I.Int,
  });
  const ProfitabilityMetrics = I.Record({
    revenueUsd:     I.Float64,
    costUsd:        I.Float64,
    profitUsd:      I.Float64,
    marginPct:      I.Float64,
    arpu:           I.Float64,
    ltv:            I.Float64,
    cac:            I.Float64,
    ltvToCacRatio:  I.Float64,
    breakEvenUsers: I.Nat,
    calculatedAt:   I.Int,
  });
  return I.Service({
    getActiveAlerts:       I.Func([], [I.Vec(Alert)],             ["query"]),
    getAllCanisterMetrics:  I.Func([], [I.Vec(CanisterMetrics)],   ["query"]),
    calculateCostMetrics:  I.Func([I.Nat],  [CostMetrics],        ["query"]),
    calculateProfitability: I.Func([I.Float64, I.Nat, I.Nat], [ProfitabilityMetrics], ["query"]),
  });
};

// ── Agent ─────────────────────────────────────────────────────────────────────

async function makeAgent(): Promise<HttpAgent> {
  const network = process.env.DFX_NETWORK || "local";
  const host = network === "local" ? "http://localhost:4943" : "https://icp-api.io";
  const agent = new HttpAgent({ host });
  if (network === "local") {
    await agent.fetchRootKey().catch(() => {
      console.warn("[dashboard] fetchRootKey failed — is dfx running?");
    });
  }
  return agent;
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:      "#0E0E0C",
  surface: "#1A1A17",
  border:  "#2E2E2A",
  text:    "#F4F1EB",
  muted:   "#7A7268",
  green:   "#4CAF7D",
  rust:    "#C94C2E",
  amber:   "#D97706",
  blue:    "#4A90D9",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(v: bigint): number { return Number(v); }
function fmt(v: bigint): string { return Number(v).toLocaleString(); }
function usd(v: number): string { return `$${v.toFixed(2)}`; }
function pct(v: number): string { return `${v.toFixed(1)}%`; }

// Total memory across all canisters in bytes → GB (for storage cost estimate).
function totalMemoryGB(canisters: CanisterMetrics[]): number {
  const bytes = canisters.reduce((acc, m) => acc + n(m.memoryBytes), 0);
  return bytes / 1e9;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = C.text,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "20px 24px", flex: "1 1 170px" }}>
      <div style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: "1.9rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase",
      color: C.muted, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {icon}{children}
    </h2>
  );
}

function CostRow({ label, value, note, coming }: { label: string; value: string; note?: string; coming?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "10px 0", borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: "0.75rem", color: coming ? C.muted : C.text }}>
        {label}
        {coming && (
          <span style={{
            marginLeft: 8, fontSize: "0.6rem", border: `1px solid ${C.muted}`,
            padding: "1px 5px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted,
          }}>coming soon</span>
        )}
      </span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: coming ? C.muted : C.text }}>{value}</span>
        {note && <div style={{ fontSize: "0.65rem", color: C.muted, marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

function severityColor(sev: Alert["severity"]): string {
  if ("Critical" in sev) return C.rust;
  if ("Warning"  in sev) return C.amber;
  return C.blue;
}
function severityLabel(sev: Alert["severity"]): string {
  if ("Critical" in sev) return "CRIT";
  if ("Warning"  in sev) return "WARN";
  return "INFO";
}

// ── Data types ────────────────────────────────────────────────────────────────

interface DashData {
  users:         UserStats;
  subs:          SubscriptionStats;
  alerts:        Alert[];
  canisters:     CanisterMetrics[];
  costs:         CostMetrics;
  profitability: ProfitabilityMetrics;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function MonitoringDashboard() {
  const [data, setData]           = useState<DashData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const agent = await makeAgent();

      const authId       = process.env.AUTH_CANISTER_ID;
      const paymentId    = process.env.PAYMENT_CANISTER_ID;
      const monitoringId = process.env.MONITORING_CANISTER_ID;

      if (!authId || !paymentId || !monitoringId) {
        throw new Error("Canister IDs not configured. Copy .env.example → .env and run dfx deploy.");
      }

      const authActor       = Actor.createActor(authIdlFactory,       { agent, canisterId: authId });
      const paymentActor    = Actor.createActor(paymentIdlFactory,    { agent, canisterId: paymentId });
      const monitoringActor = Actor.createActor(monitoringIdlFactory, { agent, canisterId: monitoringId });

      type AuthActor = { getUserStats: () => Promise<UserStats> };
      type PaymentActor = { getSubscriptionStats: () => Promise<SubscriptionStats> };
      type MonitoringActor = {
        getActiveAlerts:       ()                                         => Promise<Alert[]>;
        getAllCanisterMetrics:  ()                                         => Promise<CanisterMetrics[]>;
        calculateCostMetrics:  (userCount: bigint)                        => Promise<CostMetrics>;
        calculateProfitability: (revenue: number, users: bigint, active: bigint) => Promise<ProfitabilityMetrics>;
      };

      // First batch — user count needed for cost and profitability calls.
      const [users, subs, alerts, canisters] = await Promise.all([
        (authActor    as unknown as AuthActor).getUserStats(),
        (paymentActor as unknown as PaymentActor).getSubscriptionStats(),
        (monitoringActor as unknown as MonitoringActor).getActiveAlerts(),
        (monitoringActor as unknown as MonitoringActor).getAllCanisterMetrics(),
      ]);

      // Second batch — uses user count from first batch.
      const mrrFloat = Number(subs.estimatedMrrUsd);
      const [costs, profitability] = await Promise.all([
        (monitoringActor as unknown as MonitoringActor).calculateCostMetrics(users.total),
        (monitoringActor as unknown as MonitoringActor).calculateProfitability(
          mrrFloat, users.total, users.activeThisWeek
        ),
      ]);

      setData({ users, subs, alerts, canisters, costs, profitability });
      setRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const criticalCount = data?.alerts.filter(a => "Critical" in a.severity).length ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "IBM Plex Mono, monospace" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.05em" }}>
            Home<span style={{ color: C.green }}>Gentic</span>
          </span>
          <span style={{ marginLeft: 16, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted }}>
            Admin Dashboard
          </span>
          {criticalCount > 0 && (
            <span style={{ marginLeft: 12, fontSize: "0.62rem", color: C.rust, border: `1px solid ${C.rust}`, padding: "2px 7px" }}>
              {criticalCount} CRITICAL
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: "0.7rem", color: C.muted }}>
            {loading ? "Refreshing…" : `Updated ${refreshed.toLocaleTimeString()}`}
          </span>
          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              background: "none", border: `1px solid ${C.border}`, color: C.text,
              padding: "6px 12px", cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem",
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 1200 }}>

        {/* Error banner */}
        {error && (
          <div style={{ background: "#2D1A17", border: `1px solid ${C.rust}`, padding: "16px 20px", marginBottom: 32, display: "flex", gap: 12 }}>
            <AlertTriangle size={16} color={C.rust} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: C.rust, marginBottom: 4 }}>Failed to load data</div>
              <div style={{ fontSize: "0.75rem", color: C.muted }}>{error}</div>
            </div>
          </div>
        )}

        {loading && !data && (
          <div style={{ color: C.muted, fontSize: "0.75rem", textAlign: "center", paddingTop: 80 }}>
            Querying canisters…
          </div>
        )}

        {data && (
          <>
            {/* ── Users ───────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<Users size={10} />}>Users</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <StatCard label="Total Users"   value={fmt(data.users.total)} />
                <StatCard label="New Today"     value={fmt(data.users.newToday)}    color={n(data.users.newToday) > 0    ? C.green : C.text} />
                <StatCard label="New This Week" value={fmt(data.users.newThisWeek)} color={n(data.users.newThisWeek) > 0 ? C.green : C.text} />
                <StatCard
                  label="Active (7d)"
                  value={fmt(data.users.activeThisWeek)}
                  sub={`${data.users.total > 0n ? Math.round(n(data.users.activeThisWeek) / n(data.users.total) * 100) : 0}% engagement`}
                />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 1, marginTop: 1 }}>
                <StatCard label="Homeowners"  value={fmt(data.users.homeowners)} />
                <StatCard label="Contractors" value={fmt(data.users.contractors)} />
                <StatCard label="Realtors"    value={fmt(data.users.realtors)} />
                <StatCard label="Builders"    value={fmt(data.users.builders)} />
              </div>
            </div>

            {/* ── Revenue ─────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<DollarSign size={10} />}>Revenue</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <StatCard label="Est. MRR"      value={`$${fmt(data.subs.estimatedMrrUsd)}`} color={C.green} />
                <StatCard label="Active Paid"   value={fmt(data.subs.activePaid)}    sub="non-free, not expired" />
                <StatCard label="Pro"           value={fmt(data.subs.pro)}           sub="$10/mo" />
                <StatCard label="Premium"       value={fmt(data.subs.premium)}       sub="$49/mo" />
                <StatCard label="ContractorPro" value={fmt(data.subs.contractorPro)} sub="$49/mo" />
                <StatCard label="Free Tier"     value={fmt(data.subs.free)}          color={C.muted} />
              </div>
            </div>

            {/* ── Expenses ────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<Cpu size={10} />}>Expenses — ICP Infrastructure</SectionHeader>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>

                {/* Cost breakdown table */}
                <div style={{ flex: "1 1 340px", background: C.surface, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
                  <div style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 16 }}>
                    Current billing window
                  </div>
                  <CostRow
                    label="Compute (cycles)"
                    value={usd(data.costs.computeCostUsd)}
                    note="~50% of cycles burned"
                  />
                  <CostRow
                    label="Stable memory (storage)"
                    value={usd(data.costs.storageCostUsd)}
                    note={`${totalMemoryGB(data.canisters).toFixed(3)} GB across all canisters — ~35% of cycles`}
                  />
                  <CostRow
                    label="Network / ingress"
                    value={usd(data.costs.networkCostUsd)}
                    note="~15% of cycles burned"
                  />
                  <CostRow
                    label="ICP blob storage subnet"
                    value="—"
                    note="Not yet GA — billed separately when available"
                    coming
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", marginTop: 4 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Total (this window)</span>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{usd(data.costs.totalUsdCost)}</span>
                  </div>
                </div>

                {/* Summary cards */}
                <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 1 }}>
                  <StatCard
                    label="Projected Monthly Cost"
                    value={usd(data.costs.projectedMonthlyCostUsd)}
                    sub="extrapolated from current window"
                    color={data.costs.projectedMonthlyCostUsd > Number(data.subs.estimatedMrrUsd) ? C.rust : C.text}
                  />
                  <StatCard
                    label="Cost Per User"
                    value={usd(data.costs.costPerUserUsd)}
                    sub="ICP infra only"
                  />
                  <StatCard
                    label="Cycles Burned"
                    value={`${(n(data.costs.totalCyclesBurned) / 1e9).toFixed(1)}B`}
                    sub="1T cycles ≈ $1.30 USD"
                    color={C.muted}
                  />
                </div>
              </div>
            </div>

            {/* ── Profitability ────────────────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<TrendingUp size={10} />}>Profitability</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <StatCard
                  label="Gross Profit"
                  value={usd(data.profitability.profitUsd)}
                  sub="MRR − ICP cost"
                  color={data.profitability.profitUsd >= 0 ? C.green : C.rust}
                />
                <StatCard
                  label="Margin"
                  value={pct(data.profitability.marginPct)}
                  color={data.profitability.marginPct >= 40 ? C.green : data.profitability.marginPct >= 0 ? C.amber : C.rust}
                />
                <StatCard label="ARPU"         value={usd(data.profitability.arpu)} sub="avg revenue per user" />
                <StatCard label="LTV (18 mo)"  value={usd(data.profitability.ltv)}  sub="ARPU × 18 months" />
                <StatCard label="CAC"          value={usd(data.profitability.cac)}  sub="customer acq. cost" />
                <StatCard
                  label="LTV / CAC"
                  value={data.profitability.ltvToCacRatio.toFixed(1) + "×"}
                  sub="target ≥ 3×"
                  color={data.profitability.ltvToCacRatio >= 3 ? C.green : data.profitability.ltvToCacRatio >= 1 ? C.amber : C.rust}
                />
                <StatCard
                  label="Break-even Users"
                  value={fmt(data.profitability.breakEvenUsers)}
                  sub="to cover monthly ICP cost"
                  color={n(data.users.total) >= n(data.profitability.breakEvenUsers) ? C.green : C.amber}
                />
              </div>
            </div>

            {/* ── Active Alerts ────────────────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<AlertTriangle size={10} />}>
                Active Alerts ({data.alerts.length})
              </SectionHeader>
              {data.alerts.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: C.muted, padding: "16px 0" }}>No active alerts.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {data.alerts.map((a) => (
                    <div key={a.id} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{
                        fontSize: "0.6rem", fontWeight: 700, color: severityColor(a.severity),
                        border: `1px solid ${severityColor(a.severity)}`, padding: "2px 6px", flexShrink: 0, marginTop: 1,
                      }}>
                        {severityLabel(a.severity)}
                      </span>
                      <span style={{ fontSize: "0.75rem" }}>{a.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Canister Health ──────────────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<Server size={10} />}>
                Canister Health ({data.canisters.length} reporting)
              </SectionHeader>
              {data.canisters.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: C.muted, padding: "16px 0" }}>
                  No canister metrics recorded yet. Canisters push snapshots via recordCanisterMetrics().
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                      <th style={{ textAlign: "left",  padding: "6px 12px 6px 0", fontWeight: 400 }}>Canister</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Cycles (B)</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Cost (est)</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Memory</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Requests</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Errors</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Avg ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.canisters.map((m, i) => {
                      const errRate  = n(m.requestCount) > 0 ? n(m.errorCount) / n(m.requestCount) : 0;
                      const cyclesB  = Math.round(n(m.cyclesBalance) / 1e9);
                      const burnedT  = n(m.cyclesBurned) / 1e12;
                      const costEst  = burnedT * 1.30;
                      const memMB    = (n(m.memoryBytes) / 1e6).toFixed(1);
                      const cidStr   = String(m.canisterId);
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "8px 12px 8px 0", color: C.muted, fontFamily: "monospace", fontSize: "0.65rem" }}>{cidStr}</td>
                          <td style={{ textAlign: "right", padding: "8px 12px", color: cyclesB < 5_000 ? C.rust : cyclesB < 10_000 ? C.amber : C.text }}>
                            {cyclesB.toLocaleString()}
                          </td>
                          <td style={{ textAlign: "right", padding: "8px 12px", color: C.muted }}>{usd(costEst)}</td>
                          <td style={{ textAlign: "right", padding: "8px 12px", color: C.muted }}>{memMB} MB</td>
                          <td style={{ textAlign: "right", padding: "8px 12px" }}>{fmt(m.requestCount)}</td>
                          <td style={{ textAlign: "right", padding: "8px 12px", color: errRate > 0.05 ? C.rust : errRate > 0.02 ? C.amber : C.text }}>
                            {fmt(m.errorCount)}
                          </td>
                          <td style={{ textAlign: "right", padding: "8px 12px", color: n(m.avgResponseTimeMs) > 2000 ? C.amber : C.text }}>
                            {fmt(m.avgResponseTimeMs)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
