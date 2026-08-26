/**
 * Integration tests — reportService against the real ICP report canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: generatedAt (Int ns→ms), VisibilityLevel Variant (Public/BuyerOnly),
 *     nested JobInput/PropertyInput records
 *   - generateReport() creates a snapshot and returns a share token
 *   - Two generateReport() calls produce distinct tokens (immutability)
 *   - getReport(token) returns correct (ShareLink, ReportSnapshot) tuple
 *   - getReport with unknown token throws NotFound
 *   - listShareLinks(propertyId) returns all active links for the property
 *   - revokeShareLink(token) makes the token invalid
 */

import { describe, it, expect, beforeAll } from "vitest";
import { reportService } from "@/services/report";
import type { ShareLink, ReportSnapshot } from "@/services/report";

const CANISTER_ID = (process.env as any).REPORT_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID  = Date.now();
// Synthetic property ID — works because the test identity is granted admin access to
// the report canister in CI (ci.yml), which bypasses the ownership check. The
// verification check is then skipped because the property doesn't exist in the property
// canister (getVerificationLevel returns null → `case null {}` → proceed).
const PROP_ID = `integ-report-prop-${RUN_ID}`;

const BASE_PROPERTY = {
  address:           `${RUN_ID} Report Ave`,
  city:              "Austin",
  state:             "TX",
  zipCode:           "78701",
  propertyType:      "SingleFamily",
  yearBuilt:         2000,
  squareFeet:        2000,
  verificationLevel: "Basic",   // prevents UnverifiedProperty error
};

const BASE_JOB = {
  serviceType:    "HVAC",
  description:    "Annual HVAC tune-up",
  contractorName: "Cool Air Co" as string | undefined,
  amountCents:    150_000,
  date:           "2024-06-01",
  isDiy:          false,
  permitNumber:   undefined,
  warrantyMonths: undefined,
  isVerified:     true,
  status:         "verified",
};

// ─── generateReport ───────────────────────────────────────────────────────────

describe.skipIf(!deployed)("generateReport — Candid serialization", () => {
  let link: ShareLink;

  beforeAll(async () => {
    link = await reportService.generateReport(
      PROP_ID, BASE_PROPERTY, [BASE_JOB], [], [], null, "Public"
    );
  });

  it("returns a non-empty token", () => {
    expect(link.token).toBeTruthy();
    expect(typeof link.token).toBe("string");
  });

  it("isActive is true immediately after creation", () => {
    expect(link.isActive).toBe(true);
  });

  it("visibility round-trips through VisibilityLevel Variant", () => {
    expect(link.visibility).toBe("Public");
  });

  it("createdAt is a reasonable ms timestamp", () => {
    expect(link.createdAt).toBeGreaterThan(Date.now() - 60_000);
    expect(link.createdAt).toBeLessThan(Date.now() + 5_000);
  });

  it("expiresAt is null when no expiry is given", () => {
    expect(link.expiresAt).toBeNull();
  });
});

// ─── Two reports → distinct tokens (immutability) ────────────────────────────

describe.skipIf(!deployed)("generateReport — immutability", () => {
  it("two calls produce different tokens", async () => {
    const [l1, l2] = await Promise.all([
      reportService.generateReport(PROP_ID, BASE_PROPERTY, [BASE_JOB], [], [], null, "Public"),
      reportService.generateReport(PROP_ID, BASE_PROPERTY, [BASE_JOB], [], [], null, "Public"),
    ]);
    expect(l1.token).not.toBe(l2.token);
    expect(l1.snapshotId).not.toBe(l2.snapshotId);
  });
});

// ─── getReport ────────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("getReport — ShareLink + ReportSnapshot tuple", () => {
  let token: string;

  beforeAll(async () => {
    const link = await reportService.generateReport(
      PROP_ID, BASE_PROPERTY, [BASE_JOB], [], [], null, "Public"
    );
    token = link.token;
  });

  it("returns correct link and snapshot fields", async () => {
    const { link, snapshot } = await reportService.getReport(token);
    expect(link.token).toBe(token);
    expect(snapshot.propertyId).toBe(PROP_ID);
    expect(snapshot.address).toBe(BASE_PROPERTY.address);
    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0].serviceType).toBe("HVAC");
    expect(snapshot.generatedAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it("totalAmountCents equals sum of job amounts", async () => {
    const { snapshot } = await reportService.getReport(token);
    expect(snapshot.totalAmountCents).toBe(BASE_JOB.amountCents);
  });

  it("throws NotFound for an unknown token", async () => {
    await expect(reportService.getReport("unknown-token-xyz")).rejects.toThrow(/not found/i);
  });
});

// ─── BuyerOnly visibility ─────────────────────────────────────────────────────

describe.skipIf(!deployed)("VisibilityLevel — BuyerOnly variant", () => {
  it("BuyerOnly link has correct visibility field", async () => {
    const link = await reportService.generateReport(
      PROP_ID, BASE_PROPERTY, [BASE_JOB], [], [], null, "BuyerOnly"
    );
    expect(link.visibility).toBe("BuyerOnly");
  });
});

// ─── listShareLinks ───────────────────────────────────────────────────────────

describe.skipIf(!deployed)("listShareLinks — returns all active links for property", () => {
  let token: string;

  beforeAll(async () => {
    const link = await reportService.generateReport(
      PROP_ID, BASE_PROPERTY, [BASE_JOB], [], [], null, "Public"
    );
    token = link.token;
  });

  it("includes the newly generated token", async () => {
    const links = await reportService.listShareLinks(PROP_ID);
    expect(links.some((l) => l.token === token)).toBe(true);
  });
});

// ─── revokeShareLink ─────────────────────────────────────────────────────────

describe.skipIf(!deployed)("revokeShareLink — invalidates token", () => {
  let token: string;

  beforeAll(async () => {
    const link = await reportService.generateReport(
      PROP_ID, BASE_PROPERTY, [], [], [], null, "Public"
    );
    token = link.token;
  });

  it("getReport throws after revocation", async () => {
    await reportService.revokeShareLink(token);
    await expect(reportService.getReport(token)).rejects.toThrow(/revoked/i);
  });
});
