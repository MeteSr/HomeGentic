/**
 * @jest-environment node
 */
import { fromProfile } from "../../services/authTypes";

// Raw Candid response shape returned by the auth canister
function makeRaw(overrides: Partial<Record<string, any>> = {}) {
  return {
    principal:    { toText: () => "2vxsx-fae" },
    role:         { Homeowner: null },
    email:        "alice@example.com",
    phone:        "555-1234",
    createdAt:    BigInt(1_700_000_000_000_000_000),
    updatedAt:    BigInt(1_700_000_001_000_000_000),
    isActive:     true,
    lastLoggedIn: [BigInt(1_700_000_001_000_000_000)],
    ...overrides,
  };
}

describe("fromProfile", () => {
  it("maps principal to text string", () => {
    const p = fromProfile(makeRaw());
    expect(p.principal).toBe("2vxsx-fae");
  });

  it("extracts role key from Candid variant object", () => {
    expect(fromProfile(makeRaw({ role: { Homeowner: null } })).role).toBe("Homeowner");
    expect(fromProfile(makeRaw({ role: { Contractor: null } })).role).toBe("Contractor");
    expect(fromProfile(makeRaw({ role: { Realtor: null } })).role).toBe("Realtor");
  });

  it("passes through email and phone", () => {
    const p = fromProfile(makeRaw());
    expect(p.email).toBe("alice@example.com");
    expect(p.phone).toBe("555-1234");
  });

  it("passes through isActive", () => {
    expect(fromProfile(makeRaw({ isActive: true })).isActive).toBe(true);
    expect(fromProfile(makeRaw({ isActive: false })).isActive).toBe(false);
  });

  it("converts lastLoggedIn nanoseconds bigint to milliseconds number", () => {
    const ns = BigInt(1_700_000_001_000_000_000);
    const p  = fromProfile(makeRaw({ lastLoggedIn: [ns] }));
    // ms = ns / 1_000_000
    expect(p.lastLoggedIn).toBeCloseTo(Number(ns) / 1_000_000, -3);
  });

  it("returns null for lastLoggedIn when Opt is empty", () => {
    const p = fromProfile(makeRaw({ lastLoggedIn: [] }));
    expect(p.lastLoggedIn).toBeNull();
  });

  it("preserves createdAt and updatedAt as bigint", () => {
    const p = fromProfile(makeRaw());
    expect(typeof p.createdAt).toBe("bigint");
    expect(typeof p.updatedAt).toBe("bigint");
  });
});
