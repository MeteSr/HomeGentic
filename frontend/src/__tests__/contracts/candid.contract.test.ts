/**
 * Candid contract tests
 *
 * Each test calls a frontend IDL factory with the real @dfinity/candid IDL
 * object and snapshots the resulting service definition.  If a canister type
 * changes and the frontend IDL factory is not updated to match, the snapshot
 * diff makes the drift immediately visible in CI.
 *
 * ── Workflow ──────────────────────────────────────────────────────────────────
 * Updating a canister type:
 *   1. Edit the Motoko source and the corresponding IDL factory in services/.
 *   2. Run: npm run test:unit -- --update-snapshots
 *   3. Review the snapshot diff to confirm the change is intentional.
 *   4. Commit both the IDL factory change and the updated snapshot.
 *
 * These tests do NOT require a running dfx replica.
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 * IDL.Service() returns a ServiceClass whose `_fields` array holds
 * [methodName, FuncClass] pairs sorted by Candid field hash.  FuncClass
 * exposes argTypes, retTypes, and annotations; each IDL.Type has a display()
 * method that returns a canonical Candid type string.  Snapshotting this gives
 * a stable, human-readable representation of the full service signature.
 */

import { describe, it, expect } from "vitest";
import { IDL } from "@dfinity/candid";
import { idlFactory as authIdlFactory }     from "../../services/auth";
import { idlFactory as paymentIdlFactory }  from "../../services/payment";
import { idlFactory as jobIdlFactory }      from "../../services/job";
import { idlFactory as propertyIdlFactory } from "../../services/property";

// ── Helper ─���──────────────────────────────────────────────────────────────────

interface MethodSig {
  args: string[];
  rets: string[];
  mode: string[];
}

/**
 * Calls the IDL factory with the real IDL object and returns a serialised
 * map of method name → { args, rets, mode }.  The display() strings give a
 * canonical Candid type representation, including all nested field names and
 * types, which makes drift immediately obvious in snapshot diffs.
 */
function extractService(factory: (deps: { IDL: typeof IDL }) => unknown): Record<string, MethodSig> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = factory({ IDL }) as any;
  const result: Record<string, MethodSig> = {};
  for (const [name, func] of svc._fields as Array<[string, any]>) {
    result[name] = {
      args: (func.argTypes as any[]).map((t: any) => t.display()),
      rets: (func.retTypes as any[]).map((t: any) => t.display()),
      mode: func.annotations,
    };
  }
  return result;
}

// ── Auth canister ─────────────────────────────────────────────────────────────

describe("auth IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(authIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "getMetrics",
      "getProfile",
      "getUserStats",
      "hasRole",
      "recordLogin",
      "register",
      "updateProfile",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(authIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual(["getMetrics", "getProfile", "getUserStats", "hasRole"]);
  });

  it("UserRole variant includes Builder", () => {
    const svc = extractService(authIdlFactory);
    // UserRole is an arg to hasRole — its display string lists all cases
    expect(svc.hasRole.args[0]).toContain("Builder");
  });

  it("Metrics record includes builders count", () => {
    const svc = extractService(authIdlFactory);
    expect(svc.getMetrics.rets[0]).toContain("builders");
  });

  it("getUserStats returns all time-based fields", () => {
    const svc = extractService(authIdlFactory);
    const ret = svc.getUserStats.rets[0];
    expect(ret).toContain("newToday");
    expect(ret).toContain("newThisWeek");
    expect(ret).toContain("activeThisWeek");
  });

  it("full signature snapshot", () => {
    expect(extractService(authIdlFactory)).toMatchSnapshot();
  });
});

// ── Payment canister ──────────────────────────────────────────────────────────

describe("payment IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(paymentIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "getAllPricing",
      "getMySubscription",
      "getPricing",
      "getSubscriptionStats",
      "subscribe",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(paymentIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual(["getAllPricing", "getMySubscription", "getPricing", "getSubscriptionStats"]);
  });

  it("getSubscriptionStats returns all tier breakdown fields", () => {
    const svc = extractService(paymentIdlFactory);
    const ret = svc.getSubscriptionStats.rets[0];
    expect(ret).toContain("activePaid");
    expect(ret).toContain("estimatedMrrUsd");
    expect(ret).toContain("contractorPro");
  });

  it("full signature snapshot", () => {
    expect(extractService(paymentIdlFactory)).toMatchSnapshot();
  });
});

// ── Job canister ──────────────────────────────────────────────────────────────

describe("job IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(jobIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "createInviteToken",
      "createJob",
      "getCertificationData",
      "getJob",
      "getJobByInviteToken",
      "getJobsForProperty",
      "getJobsPendingMySignature",
      "getMetrics",
      "linkContractor",
      "redeemInviteToken",
      "updateJobStatus",
      "verifyJob",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(jobIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual([
      "getCertificationData",
      "getJob",
      "getJobByInviteToken",
      "getJobsForProperty",
      "getJobsPendingMySignature",
      "getMetrics",
    ]);
  });

  it("full signature snapshot", () => {
    expect(extractService(jobIdlFactory)).toMatchSnapshot();
  });
});

// ── Property canister ─────────────────────────────────────────────────────────

describe("property IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(propertyIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "acceptTransfer",
      "cancelTransfer",
      "getMyProperties",
      "getOwnershipHistory",
      "getPendingTransfer",
      "getPendingVerifications",
      "getProperty",
      "getPropertyLimitForTier",
      "getVerificationLevel",
      "initiateTransfer",
      "isAdminPrincipal",
      "registerProperty",
      "setTier",
      "submitVerification",
      "verifyProperty",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(propertyIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual([
      "getMyProperties",
      "getOwnershipHistory",
      "getPendingTransfer",
      "getPendingVerifications",
      "getProperty",
      "getPropertyLimitForTier",
      "getVerificationLevel",
      "isAdminPrincipal",
    ]);
  });

  it("full signature snapshot", () => {
    expect(extractService(propertyIdlFactory)).toMatchSnapshot();
  });
});
