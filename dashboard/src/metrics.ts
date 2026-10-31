/**
 * What the dashboard reads from the canisters, kept apart from the page so
 * tests/upgrade/dashboard-calls.canister.test.ts can run it against real
 * auth, payment and monitoring canisters.
 */

import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory as authIdlFactory } from "@homegentic/shared/declarations/auth";
import { idlFactory as paymentIdlFactory } from "@homegentic/shared/declarations/payment";
import { idlFactory as monitoringIdlFactory } from "@homegentic/shared/declarations/monitoring";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserStats {
  total: bigint;
  newToday: bigint;
  newThisWeek: bigint;
  activeThisWeek: bigint;
  homeowners: bigint;
  contractors: bigint;
  realtors: bigint;
  builders: bigint;
}

export interface SubscriptionStats {
  total: bigint;
  free: bigint;
  pro: bigint;
  contractorFree: bigint;
  contractorPro: bigint;
  activePaid: bigint;
  estimatedMrrUsd: bigint;
}

/** Float fields come back as JS number (not bigint) from @icp-sdk/core/candid Float64. */
export interface CostMetrics {
  totalCyclesBurned: bigint;
  totalUsdCost: number;
  storageCostUsd: number;
  computeCostUsd: number;
  networkCostUsd: number;
  projectedMonthlyCostUsd: number;
  costPerUserUsd: number;
  calculatedAt: bigint;
}

export interface ProfitabilityMetrics {
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

export interface Alert {
  id: string;
  severity: { Critical?: null } | { Warning?: null } | { Info?: null };
  category: object;
  message: string;
  resolved: boolean;
  createdAt: bigint;
  canisterId: [] | [object];
  resolvedAt: [] | [bigint];
}

export interface CanisterMetrics {
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

export interface ErrorSummary {
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

export interface FrontendErrorStats {
  total           : bigint;
  unresolved      : bigint;
  topFingerprints : ErrorSummary[];
}

// ── Admin check ───────────────────────────────────────────────────────────────

/**
 * Which canisters treat the signed-in principal as an admin. auth and payment
 * answer isAdminPrincipal; monitoring has no such query, so it is probed with
 * resolveFrontendError("") — an admin gets #NotFound (no such fingerprint,
 * nothing changes), anyone else #NotAuthorized.
 */
export interface AdminStatus { auth: boolean; payment: boolean; monitoring: boolean }

export async function checkAdmin(agent: HttpAgent, principal: string, ids: { auth: string; payment: string; monitoring: string }): Promise<AdminStatus> {
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

// ── Data types ────────────────────────────────────────────────────────────────

export interface DashData {
  users:         UserStats;
  subs:          SubscriptionStats;
  alerts:        Alert[];
  canisters:     CanisterMetrics[];
  costs:         CostMetrics;
  profitability: ProfitabilityMetrics;
  errorStats:    FrontendErrorStats;
  recentErrors:  ErrorSummary[];
}


export interface CanisterIds { auth: string; payment: string; monitoring: string }

/** Every figure the dashboard shows. Call once checkAdmin finds an admin role. */
export async function fetchDashData(agent: HttpAgent, ids: CanisterIds): Promise<DashData> {
  const authActor       = Actor.createActor(authIdlFactory,       { agent, canisterId: ids.auth });
  const paymentActor    = Actor.createActor(paymentIdlFactory,    { agent, canisterId: ids.payment });
  const monitoringActor = Actor.createActor(monitoringIdlFactory, { agent, canisterId: ids.monitoring });

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

  return { users, subs, alerts, canisters, costs, profitability, errorStats, recentErrors };
}

/** Marks a frontend error resolved (monitoring admins only). */
export async function resolveFrontendError(agent: HttpAgent, monitoringId: string, fingerprint: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actor = Actor.createActor(monitoringIdlFactory, { agent, canisterId: monitoringId }) as any;
  await actor.resolveFrontendError(fingerprint);
}
