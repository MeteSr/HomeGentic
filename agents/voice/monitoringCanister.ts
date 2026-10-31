/**
 * Lightweight ICP client for the monitoring canister.
 * Used by the /admin/cycle-status endpoint to surface real-time cycle health.
 */

import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { identityFromPem } from "./paymentCanister";
import { idlFactory } from "../../packages/shared/src/declarations/monitoring";
import { icHost } from "./icHost";

// Env is read per call: the Worker copies its bindings into process.env per
// request, after this module is imported, so a module-level read of
// CANISTER_ID_MONITORING always saw it unset and every call returned nothing.
const agents = new Map<string, Promise<HttpAgent>>();

async function getActor(): Promise<any> {
  const pem = process.env.DFX_IDENTITY_PEM;
  const canisterId = process.env.CANISTER_ID_MONITORING;
  if (!pem || !canisterId) return null;
  const { host, local } = icHost();
  let agent = agents.get(host);
  if (!agent) {
    agent = HttpAgent.create({ host, identity: identityFromPem(pem), shouldFetchRootKey: local });
    agents.set(host, agent);
  }
  return Actor.createActor(idlFactory, { agent: await agent, canisterId });
}

export interface ErrorSummaryInput {
  fingerprint : string;
  message     : string;
  errorType   : string;
  count       : number;
  firstSeen   : bigint;  // nanoseconds
  lastSeen    : bigint;  // nanoseconds
  tierCounts  : [string, number][];
  release?    : string;
}

export interface CycleAlert {
  id:        string;
  severity:  string;
  canister:  string | null;
  message:   string;
  createdAt: number;
}

export interface CycleLevelStatus {
  name:      string;
  cycles:    bigint;
  status:    string;
  fromCache: boolean;
}

export async function getCriticalCycleAlerts(): Promise<CycleAlert[]> {
  const actor = await getActor();
  if (!actor) return [];
  const raw: any[] = await actor.getCriticalCycleAlerts();
  return raw.map((a) => ({
    id:        a.id,
    severity:  Object.keys(a.severity)[0],
    canister:  a.canisterId[0]?.toText() ?? null,
    message:   a.message,
    createdAt: Number(a.createdAt) / 1_000_000,
  }));
}

export async function checkCycleLevels(): Promise<CycleLevelStatus[]> {
  const actor = await getActor();
  if (!actor) return [];
  const raw: any[] = await actor.checkCycleLevels();
  return raw.map((r) => ({
    name:      r.name,
    cycles:    r.cycles,
    status:    r.status,
    fromCache: r.fromCache,
  }));
}

export async function recordFrontendError(input: ErrorSummaryInput): Promise<void> {
  const actor = await getActor();
  if (!actor) return;
  const candid = {
    fingerprint : input.fingerprint,
    message     : input.message,
    errorType   : input.errorType,
    count       : BigInt(input.count),
    firstSeen   : input.firstSeen,
    lastSeen    : input.lastSeen,
    tierCounts  : input.tierCounts.map(([tier, count]) => [tier, BigInt(count)] as [string, bigint]),
    release     : input.release ? [input.release] : [],
  };
  await actor.recordFrontendError(candid);
}
