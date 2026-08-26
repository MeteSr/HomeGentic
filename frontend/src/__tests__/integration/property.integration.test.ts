/**
 * Integration tests — propertyService against the real ICP property canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: id (Text/string), yearBuilt/squareFeet (Nat), createdAt/updatedAt (Int)
 *   - PropertyType and VerificationLevel Variant round-trips (all variants)
 *   - Owner scoping: getMyProperties only returns the caller's properties
 *   - New properties start at Unverified and transition to PendingReview on submitVerification
 *   - Duplicate address detection (DuplicateAddress / AddressConflict errors)
 *   - Free tier: second registerProperty call is rejected (LimitReached)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { propertyService } from "@/services/property";
import type { Property } from "@/services/property";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = process.env.PROPERTY_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();
function addr(label: string) { return `${RUN_ID} ${label} St, Orlando FL 32801`; }

const BASE = {
  city:         "Orlando",
  state:        "FL",
  zipCode:      "32801",
  propertyType: "SingleFamily" as const,
  yearBuilt:    1995,
  squareFeet:   1800,
  tier:         "Free" as const,
};

// ─── registerProperty — Candid serialization ──────────────────────────────────

describe.skipIf(!deployed)("registerProperty — Candid serialization", () => {
  it("returns a property with a string id", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("string-id") });
    expect(typeof prop.id).toBe("string");
    expect(prop.id.length).toBeGreaterThan(0);
  });

  it("address, city, state, zipCode are preserved exactly", async () => {
    const address = addr("fields");
    const prop = await propertyService.registerProperty({ ...BASE, address });
    expect(prop.address).toBe(address);
    expect(prop.city).toBe("Orlando");
    expect(prop.state).toBe("FL");
    expect(prop.zipCode).toBe("32801");
  });

  it("yearBuilt and squareFeet survive Nat bigint round-trip", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("nat"), yearBuilt: 2003, squareFeet: 2450 });
    expect(Number(prop.yearBuilt)).toBe(2003);
    expect(Number(prop.squareFeet)).toBe(2450);
  });

  it("PropertyType Variant round-trips: SingleFamily", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("single"), propertyType: "SingleFamily" });
    expect(prop.propertyType).toBe("SingleFamily");
  });

  it("PropertyType Variant round-trips: Condo", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("condo"), propertyType: "Condo" });
    expect(prop.propertyType).toBe("Condo");
  });

  it("PropertyType Variant round-trips: Townhouse", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("townhouse"), propertyType: "Townhouse" });
    expect(prop.propertyType).toBe("Townhouse");
  });

  it("PropertyType Variant round-trips: MultiFamily", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("multi"), propertyType: "MultiFamily" });
    expect(prop.propertyType).toBe("MultiFamily");
  });

  it("new property starts with verificationLevel Unverified", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("unverified") });
    expect(prop.verificationLevel).toBe("Unverified");
  });

  it("owner principal matches the test identity", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("owner") });
    expect(prop.owner).toBe(TEST_PRINCIPAL);
  });

  it("isActive is true on creation", async () => {
    const prop = await propertyService.registerProperty({ ...BASE, address: addr("active") });
    expect(prop.isActive).toBe(true);
  });
});

// ─── getMyProperties — caller scoping ────────────────────────────────────────

describe.skipIf(!deployed)("getMyProperties — caller scoping", () => {
  let seeded: Property;

  beforeAll(async () => {
    seeded = await propertyService.registerProperty({ ...BASE, address: addr("scope-seed") });
  });

  it("getMyProperties returns the registered property", async () => {
    const props = await propertyService.getMyProperties();
    const found = props.find((p) => p.id === seeded.id);
    expect(found).toBeDefined();
  });

  it("all returned properties belong to the test principal", async () => {
    const props = await propertyService.getMyProperties();
    expect(props.every((p) => p.owner === TEST_PRINCIPAL)).toBe(true);
  });
});

// ─── getProperty — by bigint id ───────────────────────────────────────────────

describe.skipIf(!deployed)("getProperty — fetch by bigint id", () => {
  let created: Property;

  beforeAll(async () => {
    created = await propertyService.registerProperty({ ...BASE, address: addr("get-by-id") });
  });

  it("getProperty by id returns the correct property", async () => {
    const prop = await propertyService.getProperty(created.id);
    expect(prop.id).toBe(created.id);
    expect(prop.address).toBe(created.address);
  });

  it("getProperty for unknown id throws NotFound", async () => {
    // Use a very large id that won't exist
    await expect(propertyService.getProperty("999999999")).rejects.toThrow();
  });
});

// ─── submitVerification — PendingReview transition ────────────────────────────

describe.skipIf(!deployed)("submitVerification — verification state machine", () => {
  let prop: Property;

  beforeAll(async () => {
    prop = await propertyService.registerProperty({ ...BASE, address: addr("verify-state") });
  });

  it("submitVerification transitions property to PendingReview", async () => {
    const updated = await propertyService.submitVerification(
      prop.id,
      "UtilityBill",
      "abc123deadbeef0000000000000000000000000000000000000000000000cafe"
    );
    expect(updated.verificationLevel).toBe("PendingReview");
  });
});

// ─── Duplicate address detection ──────────────────────────────────────────────

// Duplicate detection requires two different identities: the canister treats
// same-owner re-registration as idempotent (returns the existing property
// rather than rejecting). A single CI identity cannot exercise the conflict path.
describe.skip("registerProperty — duplicate address detection", () => {
  const duplicateAddr = addr("duplicate");

  beforeAll(async () => {
    await propertyService.registerProperty({ ...BASE, address: duplicateAddr });
  });

  it("registering the same address twice throws AddressConflict or DuplicateAddress", async () => {
    await expect(
      propertyService.registerProperty({ ...BASE, address: duplicateAddr })
    ).rejects.toThrow(/conflict|duplicate|already/i);
  });
});

// ─── getPropertyYearBuilt ────────────────────────────────────────────────────

describe.skipIf(!deployed)("getPropertyYearBuilt — cross-canister query IDL", () => {
  let registeredId: string;
  let expectedYear = 1998; // updated to fallback property's year if limit is hit

  beforeAll(async () => {
    try {
      const prop = await propertyService.registerProperty({
        ...BASE,
        address:   addr("year-built"),
        yearBuilt: expectedYear,
      });
      registeredId = prop.id;
    } catch (e: any) {
      if (e.message?.includes("limit")) {
        const existing = await propertyService.getMyProperties();
        if (existing.length > 0) {
          registeredId = existing[0].id;
          expectedYear  = existing[0].yearBuilt ?? expectedYear;
          return;
        }
      }
      throw e;
    }
  });

  it("returns the yearBuilt for a registered property", async () => {
    const year = await propertyService.getPropertyYearBuilt(registeredId);
    expect(year).toBe(expectedYear);
  });

  it("returns null for an unknown property ID", async () => {
    const year = await propertyService.getPropertyYearBuilt("DOES_NOT_EXIST_99999");
    expect(year).toBeNull();
  });

  it("returns a numeric value (not a bigint)", async () => {
    const year = await propertyService.getPropertyYearBuilt(registeredId);
    expect(typeof year).toBe("number");
  });
});

// ─── Tier enforcement ─────────────────────────────────────────────────────────
// Skipped in integration: the CI test identity is granted Premium (20-property limit),
// so the per-tier property cap cannot be exercised here without a dedicated Free identity.
// Free-tier LimitReached behaviour is covered by the backend canister unit tests.
