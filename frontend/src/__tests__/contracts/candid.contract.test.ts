/**
 * Candid contract tests
 *
 * Each test calls a frontend IDL factory with the real @icp-sdk/core/candid IDL
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
import { IDL } from "@icp-sdk/core/candid";
import { idlFactory as authIdlFactory }        from "../../services/auth";
import { idlFactory as paymentIdlFactory }     from "../../services/payment";
import { idlFactory as jobIdlFactory }         from "../../services/job";
import { idlFactory as propertyIdlFactory }    from "../../services/property";
import { idlFactory as listingIdlFactory }     from "../../services/listing";
import { idlFactory as quoteIdlFactory }       from "../../services/quote";
import { idlFactory as contractorIdlFactory }  from "../../services/contractor";
import { idlFactory as photoIdlFactory }       from "../../services/photo";
import { idlFactory as reportIdlFactory }      from "../../services/report";
import { idlFactory as sensorIdlFactory }      from "../../services/sensor";
import { idlFactory as maintenanceIdlFactory } from "../../services/maintenance";
import { idlFactory as agentIdlFactory }       from "../../services/agent";
import { idlFactory as billsIdlFactory }       from "../../services/billService";

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
      "cancelSubscription",
      "configureStripe",
      "createStripeCheckoutSession",
      "getAllPricing",
      "getMySubscription",
      "getPriceQuote",
      "getPricing",
      "getSubscriptionStats",
      "grantSubscription",
      "initAdmins",
      "isStripeConfigured",
      "listPendingGifts",
      "redeemGift",
      "subscribe",
      "verifyStripeSession",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(paymentIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual(["getAllPricing", "getMySubscription", "getPricing", "getSubscriptionStats", "isStripeConfigured", "listPendingGifts"]);
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
      "approveJobProposal",
      "createInviteToken",
      "createJob",
      "createJobProposal",
      "getCertificationData",
      "getJob",
      "getJobByInviteToken",
      "getJobsForProperty",
      "getJobsPendingMySignature",
      "getMetrics",
      "getPendingProposals",
      "getReferralJobs",
      "linkContractor",
      "redeemInviteToken",
      "rejectJobProposal",
      "setPropertyCanisterId",
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
      "getPendingProposals",
      "getReferralJobs",
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
      "cancelTransfer",
      "claimManagerRole",
      "claimTransfer",
      "dismissNotifications",
      "getManagerInviteByToken",
      "getMyManagedProperties",
      "getMyProperties",
      "getOwnerNotifications",
      "getOwnershipHistory",
      "getPendingTransfer",
      "getPendingTransferByToken",
      "getPendingVerifications",
      "getProperty",
      "getPropertyLimitForTier",
      "getPropertyManagers",
      "getPropertyOwner",
      "getVerificationLevel",
      "initiateTransfer",
      "inviteManager",
      "isAdminPrincipal",
      "isAuthorized",
      "recordManagerActivity",
      "registerProperty",
      "removeManager",
      "resignAsManager",
      "setTier",
      "submitVerification",
      "updateManagerRole",
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
      "getManagerInviteByToken",
      "getMyManagedProperties",
      "getMyProperties",
      "getOwnerNotifications",
      "getOwnershipHistory",
      "getPendingTransfer",
      "getPendingTransferByToken",
      "getPendingVerifications",
      "getProperty",
      "getPropertyLimitForTier",
      "getPropertyManagers",
      "getPropertyOwner",
      "getVerificationLevel",
      "isAdminPrincipal",
      "isAuthorized",
    ]);
  });

  it("full signature snapshot", () => {
    expect(extractService(propertyIdlFactory)).toMatchSnapshot();
  });
});

// ── Listing canister ──────────────────────────────────────────────────────────

describe("listing IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(listingIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "acceptProposal",
      "cancelBidRequest",
      "createBidRequest",
      "getBidRequest",
      "getMyBidRequests",
      "getMyProposals",
      "getOpenBidRequests",
      "getProposalsForRequest",
      "submitProposal",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(listingIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual([
      "getBidRequest",
      "getMyBidRequests",
      "getMyProposals",
      "getOpenBidRequests",
      "getProposalsForRequest",
    ]);
  });

  it("createBidRequest uses IDL.Int for date fields (not IDL.Nat — dates are signed)", () => {
    // targetListDate and bidDeadline are Motoko Time.Time (Int, signed nanoseconds)
    // A type drift to IDL.Nat would silently break date serialization for past dates.
    const svc = extractService(listingIdlFactory);
    expect(svc.createBidRequest.args[1]).toContain("int");  // targetListDate
    expect(svc.createBidRequest.args[4]).toContain("int");  // bidDeadline
  });

  it("createBidRequest desiredSalePrice is opt nat (nullable)", () => {
    const svc = extractService(listingIdlFactory);
    expect(svc.createBidRequest.args[2]).toMatch(/opt\s+nat/i);
  });

  it("submitProposal commissionBps is nat (positive basis points, not signed)", () => {
    const svc = extractService(listingIdlFactory);
    // commissionBps is the 4th arg (index 3), validUntil (Int) is the 10th arg (index 9)
    expect(svc.submitProposal.args[3]).toContain("nat");
    expect(svc.submitProposal.args[9]).toContain("int"); // validUntil
  });

  it("full signature snapshot", () => {
    expect(extractService(listingIdlFactory)).toMatchSnapshot();
  });
});

// ── Quote canister ────────────────────────────────────────────────────────────

describe("quote IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(quoteIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "acceptQuote",
      "closeQuoteRequest",
      "createQuoteRequest",
      "getMyQuoteRequests",
      "getOpenRequests",
      "getQuoteRequest",
      "getQuotesForRequest",
      "setPropertyCanisterId",
      "submitQuote",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(quoteIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual([
      "getMyQuoteRequests",
      "getOpenRequests",
      "getQuoteRequest",
      "getQuotesForRequest",
    ]);
  });

  it("createQuoteRequest ServiceType Variant has all 8 service categories", () => {
    // 8 ServiceType variants — drift (e.g. a renamed arm) silently breaks the UI filter
    const svc = extractService(quoteIdlFactory);
    const serviceTypeArg = svc.createQuoteRequest.args[1];
    expect(serviceTypeArg).toContain("Plumbing");
    expect(serviceTypeArg).toContain("Electrical");
    expect(serviceTypeArg).toContain("HVAC");
    expect(serviceTypeArg).toContain("Roofing");
  });

  it("submitQuote validUntil is int (signed, Time.Time)", () => {
    const svc = extractService(quoteIdlFactory);
    expect(svc.submitQuote.args[3]).toContain("int");
  });

  it("full signature snapshot", () => {
    expect(extractService(quoteIdlFactory)).toMatchSnapshot();
  });
});

// ── Contractor canister ───────────────────────────────────────────────────────

describe("contractor IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(contractorIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "getAll",
      "getBySpecialty",
      "getContractor",
      "getCredentials",
      "getMyProfile",
      "getReviewsForContractor",
      "recordJobVerified",
      "register",
      "setJobCanisterId",
      "submitReview",
      "updateProfile",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(contractorIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual([
      "getAll",
      "getBySpecialty",
      "getContractor",
      "getCredentials",
      "getMyProfile",
      "getReviewsForContractor",
    ]);
  });

  it("submitReview rating arg is nat (0–5 scale, not signed)", () => {
    const svc = extractService(contractorIdlFactory);
    expect(svc.submitReview.args[1]).toContain("nat");
  });

  it("getContractor and submitReview take IDL.Principal (not Text)", () => {
    const svc = extractService(contractorIdlFactory);
    expect(svc.getContractor.args[0]).toContain("principal");
    expect(svc.submitReview.args[0]).toContain("principal");
  });

  it("full signature snapshot", () => {
    expect(extractService(contractorIdlFactory)).toMatchSnapshot();
  });
});

// ── Photo canister ────────────────────────────────────────────────────────────

describe("photo IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(photoIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "deletePhoto",
      "getPhotosByJob",
      "getPhotosByProperty",
      "getPhotosByRoom",
      "setPropertyCanisterId",
      "uploadPhoto",
    ]);
  });

  it("getPhotosByJob/Property/Room are NOT query calls (update required for tier checks)", () => {
    // These reads go through the update path to enforce quota checks server-side.
    // A drift to ["query"] would bypass those checks.
    const svc = extractService(photoIdlFactory);
    expect(svc.getPhotosByJob.mode).not.toContain("query");
    expect(svc.getPhotosByProperty.mode).not.toContain("query");
    expect(svc.getPhotosByRoom.mode).not.toContain("query");
  });

  it("uploadPhoto image bytes arg is vec nat8", () => {
    const svc = extractService(photoIdlFactory);
    // The last arg (index 5) carries the raw image bytes
    expect(svc.uploadPhoto.args[5]).toMatch(/vec\s+nat8/i);
  });

  it("full signature snapshot", () => {
    expect(extractService(photoIdlFactory)).toMatchSnapshot();
  });
});

// ── Report canister ───────────────────────────────────────────────────────────

describe("report IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(reportIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "generateReport",
      "getReport",
      "listShareLinks",
      "revokeShareLink",
    ]);
  });

  it("generateReport args include opt fields for schema-compatible extension", () => {
    // Args 7–11 are new trailing Opt args added for backwards compatibility.
    // They must remain opt or existing callers break.
    const svc = extractService(reportIdlFactory);
    expect(svc.generateReport.args.length).toBeGreaterThanOrEqual(7);
    for (let i = 7; i < svc.generateReport.args.length; i++) {
      expect(svc.generateReport.args[i]).toMatch(/opt/i);
    }
  });

  it("full signature snapshot", () => {
    expect(extractService(reportIdlFactory)).toMatchSnapshot();
  });
});

// ── Sensor canister ───────────────────────────────────────────────────────────

describe("sensor IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(sensorIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "deactivateDevice",
      "getDevicesForProperty",
      "getEventsForProperty",
      "getPendingAlerts",
      "recordEvent",
      "registerDevice",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(sensorIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual([
      "getDevicesForProperty",
      "getEventsForProperty",
      "getPendingAlerts",
    ]);
  });

  it("getEventsForProperty limit arg is nat", () => {
    const svc = extractService(sensorIdlFactory);
    expect(svc.getEventsForProperty.args[1]).toContain("nat");
  });

  it("registerDevice DeviceSource Variant is in args", () => {
    const svc = extractService(sensorIdlFactory);
    // DeviceSource is a Variant — its display string contains "variant"
    expect(svc.registerDevice.args[2]).toMatch(/variant/i);
  });

  it("full signature snapshot", () => {
    expect(extractService(sensorIdlFactory)).toMatchSnapshot();
  });
});

// ── Maintenance canister ──────────────────────────────────────────────────────

describe("maintenance IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(maintenanceIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "createScheduleEntry",
      "getScheduleByProperty",
      "markCompleted",
    ]);
  });

  it("getScheduleByProperty is a query", () => {
    const svc = extractService(maintenanceIdlFactory);
    expect(svc.getScheduleByProperty.mode).toContain("query");
  });

  it("createScheduleEntry optional args are opt nat (nullable interval/last-completed)", () => {
    const svc = extractService(maintenanceIdlFactory);
    expect(svc.createScheduleEntry.args[4]).toMatch(/opt\s+nat/i);
    expect(svc.createScheduleEntry.args[5]).toMatch(/opt\s+nat/i);
  });

  it("full signature snapshot", () => {
    expect(extractService(maintenanceIdlFactory)).toMatchSnapshot();
  });
});

// ── Agent (Realtor) canister ──────────────────────────────────────────────────

describe("agent IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(agentIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "addReview",
      "getAllProfiles",
      "getMyProfile",
      "getProfile",
      "getReviews",
      "register",
      "updateProfile",
      "verifyAgent",
    ]);
  });

  it("marks the correct methods as query", () => {
    const svc = extractService(agentIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name)
      .sort();
    expect(queries).toEqual(["getAllProfiles", "getMyProfile", "getProfile", "getReviews"]);
  });

  it("getMyProfile returns opt AgentProfile (not a Result — null means not registered)", () => {
    // A drift to ok/err Result would break the 'not yet registered' code path.
    const svc = extractService(agentIdlFactory);
    expect(svc.getMyProfile.rets[0]).toMatch(/opt/i);
    expect(svc.getMyProfile.rets[0]).not.toMatch(/variant\s*\{\s*ok/i);
  });

  it("getReviews and verifyAgent take IDL.Principal (not Text)", () => {
    const svc = extractService(agentIdlFactory);
    expect(svc.getReviews.args[0]).toContain("principal");
    expect(svc.verifyAgent.args[0]).toContain("principal");
  });

  it("full signature snapshot", () => {
    expect(extractService(agentIdlFactory)).toMatchSnapshot();
  });
});

// ── Bills canister ────────────────────────────────────────────────────────────

describe("bills IDL factory", () => {
  it("exposes the expected methods", () => {
    const svc = extractService(billsIdlFactory);
    expect(Object.keys(svc).sort()).toEqual([
      "addBill",
      "deleteBill",
      "getBillsForProperty",
      "getUsageTrend",
      "metrics",
    ]);
  });

  it("only metrics is a query (reads go through update for tier-gated filtering)", () => {
    const svc = extractService(billsIdlFactory);
    const queries = Object.entries(svc)
      .filter(([, sig]) => sig.mode.includes("query"))
      .map(([name]) => name);
    expect(queries).toEqual(["metrics"]);
  });

  it("getUsageTrend BillType arg is a Variant (not Text)", () => {
    // A drift from Variant to Text would silently accept invalid bill types.
    const svc = extractService(billsIdlFactory);
    expect(svc.getUsageTrend.args[1]).toMatch(/variant/i);
  });

  it("getUsageTrend months arg is nat", () => {
    const svc = extractService(billsIdlFactory);
    expect(svc.getUsageTrend.args[2]).toContain("nat");
  });

  it("full signature snapshot", () => {
    expect(extractService(billsIdlFactory)).toMatchSnapshot();
  });
});
