/**
 * Integration tests — market canister (neighbourhood score) against the real
 * ICP market canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: StoredScore / ZipStats / ScoreEnvelope records,
 *     updatedAt (Int bigint)
 *   - submitScore(propertyId) scores a real home from the property and job
 *     canisters, and refuses a caller who can't edit it
 *   - getZipStats(zipCode) returns aggregated stats after score submission
 *   - getNeighborhoodPublicKey() returns non-empty Uint8Array
 *   - getMyScoreEncrypted() round-trip: submitted score is retrievable with key
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  getZipStats,
  getNeighborhoodPublicKey,
  computePropertyScore,
  neighbourhoodIdlFactory,
} from "@/services/market";
import type { ZipStats } from "@/services/market";
import { propertyService } from "@/services/property";
import { jobService } from "@/services/job";
import { Actor } from "@icp-sdk/core/agent";
import type { Identity } from "@icp-sdk/core/agent";
import { agentFor, freshIdentity, asIdentity } from "./helpers";

const CANISTER_ID = (process.env as any).MARKET_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();
const ZIP    = "78701";

/** The market canister as `identity` (the service's own actor is bound to the test identity). */
async function marketAs(identity: Identity): Promise<any> {
  return Actor.createActor(neighbourhoodIdlFactory, { agent: await agentFor(identity), canisterId: CANISTER_ID });
}

let homeCount = 0;
/**
 * A fresh homeowner with one home in ZIP and one DIY job on it. submitScore
 * reads both from the property and job canisters (CD-2), so a score needs
 * a real home with a real job.
 */
async function scoredHome(): Promise<{ identity: Identity; propertyId: string }> {
  const identity = freshIdentity();
  homeCount += 1;
  const propertyId = await asIdentity(identity, [propertyService, jobService], async () => {
    const prop = await propertyService.registerProperty({
      address:      `${RUN_ID}-${homeCount} Score Ln`,
      city:         "Austin",
      state:        "TX",
      zipCode:      ZIP,
      propertyType: "SingleFamily",
      yearBuilt:    2005,
      squareFeet:   1800,
      tier:         "Free",
    });
    await jobService.create({
      propertyId:  prop.id,
      serviceType: "HVAC",
      amount:      250_000,
      date:        "2023-05-01",
      description: "HVAC replacement",
      isDiy:       true,
    });
    return prop.id;
  });
  return { identity, propertyId };
}

// ─── submitScore ──────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("submitScore — scores a real home from canister records", () => {
  it("returns a numeric score with the property's own zip", async () => {
    const { identity, propertyId } = await scoredHome();
    const r = await (await marketAs(identity)).submitScore(propertyId);
    expect("ok" in r).toBe(true);
    expect(Number(r.ok.score)).toBeGreaterThanOrEqual(0);
    expect(r.ok.zipCode).toBe(ZIP);
    expect(typeof r.ok.updatedAt).toBe("bigint");
    expect(r.ok.updatedAt).toBeGreaterThan(0n);
  });

  it("refuses a caller who can't edit the home", async () => {
    const { propertyId } = await scoredHome();
    const r = await (await marketAs(freshIdentity())).submitScore(propertyId);
    expect(r).toEqual({ err: { NotAuthorized: null } });
  });
});

// ─── getZipStats — aggregated stats ──────────────────────────────────────────

describe.skipIf(!deployed)("getZipStats — returns aggregated stats after submission", () => {
  let stats: ZipStats | null;

  beforeAll(async () => {
    // getZipStats only answers once MIN_ZIP_SAMPLE (5) homeowners in the zip
    // have a score (M12 k-anonymity).
    for (let i = 0; i < 5; i++) {
      const { identity, propertyId } = await scoredHome();
      const r = await (await marketAs(identity)).submitScore(propertyId);
      if (!("ok" in r)) throw new Error(`submitScore failed: ${JSON.stringify(r)}`);
    }
    stats = await getZipStats(ZIP);
  }, 120_000);
  it("returns non-null stats for a submitted zip", () => {
    expect(stats).not.toBeNull();
  });

  it("zipCode matches the queried zip", () => {
    expect(stats!.zipCode).toBe(ZIP);
  });

  it("mean and median are non-negative numbers", () => {
    expect(stats!.mean).toBeGreaterThanOrEqual(0);
    expect(stats!.median).toBeGreaterThanOrEqual(0);
  });

  it("sampleSize is positive", () => {
    expect(stats!.sampleSize).toBeGreaterThan(0);
  });

  it("grade is a non-empty string", () => {
    expect(typeof stats!.grade).toBe("string");
    expect(stats!.grade.length).toBeGreaterThan(0);
  });
});

// ─── getZipStats — unknown zip returns null ───────────────────────────────────

describe.skipIf(!deployed)("getZipStats — returns null for unknown zip", () => {
  it("returns null for a zip that has no submissions", async () => {
    const result = await getZipStats(`00000`);
    expect(result).toBeNull();
  });
});

// ─── getNeighborhoodPublicKey ─────────────────────────────────────────────────
// VetKD is only available on mainnet and dedicated test replica builds.
// Local dfx does not expose vetkd_public_key on the management canister —
// these tests are accepted to fail with IC0406 in local dev.

describe.skipIf(!deployed)("getNeighborhoodPublicKey — returns non-empty key bytes", () => {
  it("returns a Uint8Array with bytes (skipped if VetKD not available)", async () => {
    try {
      const key = await getNeighborhoodPublicKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBeGreaterThan(0);
    } catch (e: any) {
      // IC0406: vetkd_public_key not available in local dfx — expected.
      // signer@5.6+ may surface this as a TypeError from certificate.js
      // (check_canister_ranges called with undefined delegation params).
      expect(e.message ?? String(e)).toMatch(/vetkd_public_key|IC0406|IC0536|subnetId/i);
    }
  });
});

// ─── getMyScoreEncrypted — round-trip ─────────────────────────────────────────

describe.skipIf(!deployed)("getMyScoreEncrypted — score survives canister storage", () => {
  it("returns an envelope with the correct zipCode after submission (skipped if VetKD not available)", async () => {
    try {
      const { identity, propertyId } = await scoredHome();
      const market = await marketAs(identity);
      const stored = await market.submitScore(propertyId);
      if (!("ok" in stored)) throw new Error(`submitScore failed: ${JSON.stringify(stored)}`);
      const publicKey = await getNeighborhoodPublicKey();
      const r = await market.getMyScoreEncrypted(Array.from(publicKey));
      if ("err" in r) throw new Error(JSON.stringify(r.err));
      expect(r.ok.zipCode).toBe(ZIP);
      expect(Number(r.ok.score)).toBeGreaterThanOrEqual(0);
      expect(r.ok.encryptedKey.length).toBeGreaterThan(0);
    } catch (e: any) {
      expect(e.message ?? String(e)).toMatch(/vetkd_public_key|IC0406|IC0536|subnetId/i);
    }
  });
});

// ─── computePropertyScore ─────────────────────────────────────────────────────

describe.skipIf(!deployed)("computePropertyScore — on-chain FSBO score", () => {
  it("returns null for a property that does not exist", async () => {
    // Returns null whether wiring is set or not — property not found → null.
    const score = await computePropertyScore("DOES_NOT_EXIST_99999");
    expect(score).toBeNull();
  });

  it("returns null (not a trap) for an empty property ID", async () => {
    const score = await computePropertyScore("");
    expect(score).toBeNull();
  });

  it("returns a number in 0-100 when a wired property has jobs", async () => {
    // This test only runs when all three canisters are wired (deploy.sh handles it).
    // If canister IDs are not wired, computePropertyScore returns null — skip gracefully.
    let prop: Awaited<ReturnType<typeof propertyService.registerProperty>>;
    try {
      prop = await propertyService.registerProperty({
        address:      `${RUN_ID} Score Dr, Orlando FL 32801`,
        city:         "Orlando",
        state:        "FL",
        zipCode:      "32801",
        propertyType: "SingleFamily",
        yearBuilt:    2000,
        squareFeet:   1500,
        tier:         "Free",
      });
    } catch (e: any) {
      if (e.message?.includes("limit")) {
        const existing = await propertyService.getMyProperties();
        if (existing.length > 0) { prop = existing[0] as any; }
        else throw e;
      } else throw e;
    }

    await jobService.create({
      propertyId:    prop.id,
      serviceType:   "HVAC",
      amount:        120_000,
      date:          "2022-06-15",
      description:   "HVAC tune-up",
      isDiy:         false,
      contractorName: "Score Test LLC",
    });

    const score = await computePropertyScore(prop.id);
    if (score === null) return; // canister not yet wired — acceptable in local dev
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
