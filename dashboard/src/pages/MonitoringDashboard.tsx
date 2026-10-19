/**
 * HomeGentic Admin Metrics Dashboard
 *
 * Queries three canisters directly via @icp-sdk/core/agent, signed in with
 * Internet Identity (see ../auth.ts). The metrics are admin-only on the
 * canisters (Appendix D #9): a principal that is not on the admin lists gets
 * zeroed data, so the page checks admin status first and says so instead:
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
import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { RefreshCw, AlertTriangle, Users, DollarSign, TrendingUp, Server, Cpu, LogIn, LogOut, ShieldOff } from "lucide-react";
import { isSignedIn, signIn, signOut, makeAuthedAgent, MISSING_LOCAL_ROOT_KEY } from "../auth";
import { idlFactory as authIdlFactory } from "@homegentic/shared/declarations/auth";
import { idlFactory as paymentIdlFactory } from "@homegentic/shared/declarations/payment";
import { idlFactory as monitoringIdlFactory } from "@homegentic/shared/declarations/monitoring";

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
  contractorFree: bigint;
  contractorPro: bigint;
  activePaid: bigint;
  estimatedMrrUsd: bigint;
}

/** Float fields come back as JS number (not bigint) from @icp-sdk/core/candid Float64. */
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

interface ErrorSummary {
  fingerprint : string;
  message     : string;
  errorType   : string;
  firstSeen   : bigint;
  lastSeen    : bigint;
  count       : bigint;
  tierCounts  : [string, bigint][];
  release     : [] | [string];
  resolved    : boolean;
}

interface FrontendErrorStats {
  total           : bigint;
  unresolved      : bigint;
  topFingerprints : ErrorSummary[];
}

// ── Agent ─────────────────────────────────────────────────────────────────────

/**
 * Which canisters treat the signed-in principal as an admin. auth and payment
 * answer isAdminPrincipal; monitoring has no such query, so it is probed with
 * resolveFrontendError("") — an admin gets #NotFound (no such fingerprint,
 * nothing changes), anyone else #NotAuthorized.
 */
interface AdminStatus { auth: boolean; payment: boolean; monitoring: boolean }

async function checkAdmin(agent: HttpAgent, principal: string, ids: { auth: string; payment: string; monitoring: string }): Promise<AdminStatus> {
  const me = Principal.fromText(principal);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth       = Actor.createActor(authIdlFactory,       { agent, canisterId: ids.auth })       as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payment    = Actor.createActor(paymentIdlFactory,    { agent, canisterId: ids.payment })    as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monitoring = Actor.createActor(monitoringIdlFactory, { agent, canisterId: ids.monitoring }) as any;
  const [a, p, m] = await Promise.all([
    auth.isAdminPrincipal(me).catch(() => false) as Promise<boolean>,
    payment.isAdminPrincipal(me).catch(() => false) as Promise<boolean>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (monitoring.resolveFrontendError("") as Promise<any>)
      .then((r) => !("err" in r && "NotAuthorized" in r.err))
      .catch(() => false),
  ]);
  return { auth: a, payment: p, monitoring: m };
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
  errorStats:    FrontendErrorStats;
  recentErrors:  ErrorSummary[];
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type Session =
  | { status: "signed_out" }
  | { status: "signing_in" }
  | { status: "signed_in"; principal: string };

export default function MonitoringDashboard() {
  const [session, setSession] = useState<Session>(() =>
    isSignedIn() ? { status: "signing_in" } : { status: "signed_out" });
  const [signInError, setSignInError] = useState<string | null>(null);

  // Resolve the stored II session (if any) to a principal on first render.
  useEffect(() => {
    if (session.status !== "signing_in" || !isSignedIn()) return;
    makeAuthedAgent()
      .then(({ principal }) => setSession({ status: "signed_in", principal }))
      .catch(() => setSession({ status: "signed_out" }));
  }, [session.status]);

  const handleSignIn = async () => {
    setSignInError(null);
    setSession({ status: "signing_in" });
    try {
      await signIn();
      const { principal } = await makeAuthedAgent();
      setSession({ status: "signed_in", principal });
    } catch (e) {
      setSignInError(e instanceof Error ? e.message : String(e));
      setSession({ status: "signed_out" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setSession({ status: "signed_out" });
  };

  if (session.status !== "signed_in") {
    return <SignInScreen busy={session.status === "signing_in"} error={signInError} onSignIn={() => void handleSignIn()} />;
  }
  // Keyed by principal so a different sign-in starts from a clean state.
  return <SignedInDashboard key={session.principal} principal={session.principal} onSignOut={() => void handleSignOut()} />;
}

function SignInScreen({ busy, error, onSignIn }: { busy: boolean; error: string | null; onSignIn: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "IBM Plex Mono, monospace",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "32px 28px", maxWidth: 420, width: "100%" }}>
        <div style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>
          Home<span style={{ color: C.green }}>Gentic</span>
          <span style={{ marginLeft: 12, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted }}>Admin Dashboard</span>
        </div>
        <p style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.6, margin: "12px 0 20px" }}>
          Sign in with Internet Identity. The metrics are only returned to principals on the
          auth, payment and monitoring canisters' admin lists.
        </p>
        {MISSING_LOCAL_ROOT_KEY && (
          <p style={{ fontSize: "0.7rem", color: C.amber, lineHeight: 1.5, marginBottom: 16 }}>
            No local root key was injected at startup. Start the network (icp network start -d), then restart the dashboard dev server.
          </p>
        )}
        {error && <p style={{ fontSize: "0.7rem", color: C.rust, marginBottom: 16 }}>Sign-in failed: {error}</p>}
        <button
          onClick={onSignIn}
          disabled={busy}
          style={{ background: C.green, border: "none", color: C.bg, padding: "10px 16px", cursor: busy ? "wait" : "pointer",
                   display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", fontWeight: 700, opacity: busy ? 0.6 : 1 }}
        >
          <LogIn size={14} /> {busy ? "Signing in…" : "Sign in with Internet Identity"}
        </button>
      </div>
    </div>
  );
}

function NotAdminScreen({ principal, onSignOut }: { principal: string; onSignOut: () => void }) {
  return (
    <div style={{ background: "#2D1A17", border: `1px solid ${C.rust}`, padding: "20px 24px", marginBottom: 32, display: "flex", gap: 12 }}>
      <ShieldOff size={18} color={C.rust} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: C.rust, marginBottom: 6 }}>This principal is not an admin</div>
        <div style={{ fontSize: "0.72rem", color: C.muted, lineHeight: 1.6 }}>
          None of the auth, payment or monitoring canisters list you as an admin, so they return no metrics.
          Ask an existing admin to add this principal with addAdmin on each canister:
        </div>
        <code style={{ display: "block", marginTop: 8, fontSize: "0.72rem", color: C.text, wordBreak: "break-all" }}>{principal}</code>
        <button onClick={onSignOut} style={{ marginTop: 14, background: "none", border: `1px solid ${C.border}`, color: C.text,
                                             padding: "6px 12px", cursor: "pointer", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: 6 }}>
          <LogOut size={12} /> Sign in as someone else
        </button>
      </div>
    </div>
  );
}

function SignedInDashboard({ principal, onSignOut }: { principal: string; onSignOut: () => void }) {
  const [admin, setAdmin]         = useState<AdminStatus | null>(null);
  const [data, setData]           = useState<DashData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<Date>(new Date());
  const [resolvingFp, setResolvingFp] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { agent } = await makeAuthedAgent();

      const authId       = process.env.AUTH_CANISTER_ID;
      const paymentId    = process.env.PAYMENT_CANISTER_ID;
      const monitoringId = process.env.MONITORING_CANISTER_ID;

      if (!authId || !paymentId || !monitoringId) {
        throw new Error("Canister IDs not configured. Copy .env.example → .env and run dfx deploy.");
      }

      const status = await checkAdmin(agent, principal, { auth: authId, payment: paymentId, monitoring: monitoringId });
      setAdmin(status);
      if (!status.auth && !status.payment && !status.monitoring) {
        setData(null);
        return;
      }

      const authActor       = Actor.createActor(authIdlFactory,       { agent, canisterId: authId });
      const paymentActor    = Actor.createActor(paymentIdlFactory,    { agent, canisterId: paymentId });
      const monitoringActor = Actor.createActor(monitoringIdlFactory, { agent, canisterId: monitoringId });

      type AuthActor = { getUserStats: () => Promise<UserStats> };
      type PaymentActor = { getSubscriptionStats: () => Promise<SubscriptionStats> };
      type MonitoringActor = {
        getActiveAlerts:        ()                                         => Promise<Alert[]>;
        getAllCanisterMetrics:   ()                                         => Promise<CanisterMetrics[]>;
        calculateCostMetrics:   (userCount: bigint)                        => Promise<CostMetrics>;
        calculateProfitability: (revenue: number, users: bigint, active: bigint) => Promise<ProfitabilityMetrics>;
        getFrontendErrorStats:  ()                                         => Promise<FrontendErrorStats>;
        getFrontendErrors:      (from: bigint, limit: bigint)              => Promise<ErrorSummary[]>;
        resolveFrontendError:   (fp: string)                               => Promise<unknown>;
      };

      // First batch — user count needed for cost and profitability calls.
      const [users, subs, alerts, canisters, errorStats, recentErrors] = await Promise.all([
        (authActor    as unknown as AuthActor).getUserStats(),
        (paymentActor as unknown as PaymentActor).getSubscriptionStats(),
        (monitoringActor as unknown as MonitoringActor).getActiveAlerts(),
        (monitoringActor as unknown as MonitoringActor).getAllCanisterMetrics(),
        (monitoringActor as unknown as MonitoringActor).getFrontendErrorStats(),
        (monitoringActor as unknown as MonitoringActor).getFrontendErrors(0n, 20n),
      ]);

      // Second batch — uses user count from first batch.
      const mrrFloat = Number(subs.estimatedMrrUsd);
      const [costs, profitability] = await Promise.all([
        (monitoringActor as unknown as MonitoringActor).calculateCostMetrics(users.total),
        (monitoringActor as unknown as MonitoringActor).calculateProfitability(
          mrrFloat, users.total, users.activeThisWeek
        ),
      ]);

      setData({ users, subs, alerts, canisters, costs, profitability, errorStats, recentErrors });
      setRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => { void load(); }, [load]);

  const notAdmin  = admin !== null && !admin.auth && !admin.payment && !admin.monitoring;
  const partialOn = admin === null || notAdmin ? [] :
    (["auth", "payment", "monitoring"] as const).filter((k) => !admin[k]);

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
          <span title={principal} style={{ fontSize: "0.65rem", color: C.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {principal}
          </span>
          <button
            onClick={onSignOut}
            style={{
              background: "none", border: `1px solid ${C.border}`, color: C.text,
              padding: "6px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem",
            }}
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 1200 }}>

        {notAdmin && <NotAdminScreen principal={principal} onSignOut={onSignOut} />}

        {partialOn.length > 0 && (
          <div style={{ background: "#2A2414", border: `1px solid ${C.amber}`, padding: "12px 16px", marginBottom: 24, fontSize: "0.72rem", color: C.amber }}>
            Not an admin on: {partialOn.join(", ")}. Figures from {partialOn.length === 1 ? "that canister" : "those canisters"} show as zero.
          </div>
        )}

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
                <StatCard label="Pro"           value={fmt(data.subs.pro)}           sub="$59/yr" />
                <StatCard label="ContractorPro" value={fmt(data.subs.contractorPro)} sub="$40/mo" />
                <StatCard label="ContractorFree" value={fmt(data.subs.contractorFree)} color={C.muted} />
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

            {/* ── Frontend Errors (#297) ──────────────────────────────────── */}
            <div style={{ marginBottom: 40 }}>
              <SectionHeader icon={<AlertTriangle size={10} />}>
                Frontend Errors — {Number(data.errorStats.unresolved)} unresolved / {Number(data.errorStats.total)} total
              </SectionHeader>
              {data.recentErrors.filter(e => !e.resolved).length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: C.muted, padding: "16px 0" }}>No unresolved frontend errors.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                      <th style={{ textAlign: "left",  padding: "6px 12px 6px 0", fontWeight: 400 }}>Message</th>
                      <th style={{ textAlign: "left",  padding: "6px 12px", fontWeight: 400 }}>Type</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Count</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Last Seen</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Release</th>
                      <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 400 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentErrors.filter(e => !e.resolved).map((e, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 12px 8px 0", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={e.message}>{e.message}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{e.errorType}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", color: Number(e.count) > 10 ? C.rust : C.text }}>{Number(e.count)}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", color: C.muted }}>{new Date(Number(e.lastSeen) / 1_000_000).toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px", color: C.muted }}>{e.release[0] ?? "—"}</td>
                        <td style={{ textAlign: "right", padding: "8px 12px" }}>
                          <button
                            onClick={async () => {
                              setResolvingFp(e.fingerprint);
                              try {
                                const { agent } = await makeAuthedAgent();
                                const monitoringId = process.env.MONITORING_CANISTER_ID;
                                if (!monitoringId) return;
                                const actor = Actor.createActor(monitoringIdlFactory, { agent, canisterId: monitoringId }) as any;
                                await actor.resolveFrontendError(e.fingerprint);
                                void load();
                              } finally { setResolvingFp(null); }
                            }}
                            disabled={resolvingFp === e.fingerprint}
                            style={{
                              background: "none", border: `1px solid ${C.border}`, color: C.text,
                              padding: "3px 8px", cursor: "pointer", fontSize: "0.6rem",
                              opacity: resolvingFp === e.fingerprint ? 0.5 : 1,
                            }}
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
