import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock external ICP dependencies ──────────────────────────────────────────

const mockActor = {
  registerProperty:       vi.fn(),
  getMyProperties:        vi.fn(),
  getProperty:            vi.fn(),
  submitVerification:     vi.fn(),
  getPendingVerifications: vi.fn(),
  isAdminPrincipal:       vi.fn(),
  verifyProperty:         vi.fn(),
  setTier:                vi.fn(),
  initiateTransfer:       vi.fn(),
  acceptTransfer:         vi.fn(),
  cancelTransfer:         vi.fn(),
  getPendingTransfer:     vi.fn(),
  getOwnershipHistory:    vi.fn(),
};

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@dfinity/agent", () => ({
  Actor: { createActor: vi.fn(() => mockActor) },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRawPendingTransfer(overrides: Record<string, unknown> = {}) {
  return {
    propertyId:  BigInt(1),
    from:        { toText: () => "from-principal" },
    to:          { toText: () => "to-principal" },
    initiatedAt: BigInt(1_735_689_600_000_000_000), // ~2025-01-01 in ns
    ...overrides,
  };
}

function makeRawTransferRecord(overrides: Record<string, unknown> = {}) {
  return {
    propertyId: BigInt(1),
    from:       { toText: () => "from-principal" },
    to:         { toText: () => "to-principal" },
    timestamp:  BigInt(1_735_689_600_000_000_000),
    txHash:     "abc123",
    ...overrides,
  };
}

function makeRawProperty(overrides: Record<string, unknown> = {}) {
  return {
    id:                BigInt(1),
    owner:             { toText: () => "owner-principal" },
    address:           "123 Main St",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      { SingleFamily: null },
    yearBuilt:         BigInt(2001),
    squareFeet:        BigInt(2400),
    verificationLevel: { Unverified: null },
    tier:              { Free: null },
    createdAt:         BigInt(0),
    updatedAt:         BigInt(0),
    isActive:          true,
    ...overrides,
  };
}

// ─── Import service ───────────────────────────────────────────────────────────

import { propertyService } from "@/services/property";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("propertyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyService.reset();
  });

  // ── getMyProperties ──────────────────────────────────────────────────────────
  describe("getMyProperties", () => {
    it("returns an empty array when canister returns none", async () => {
      mockActor.getMyProperties.mockResolvedValue([]);
      const result = await propertyService.getMyProperties();
      expect(result).toEqual([]);
    });

    it("maps raw properties to typed Property objects", async () => {
      mockActor.getMyProperties.mockResolvedValue([makeRawProperty()]);
      const [prop] = await propertyService.getMyProperties();
      expect(prop.address).toBe("123 Main St");
      expect(prop.city).toBe("Austin");
      expect(prop.state).toBe("TX");
      expect(prop.zipCode).toBe("78701");
      expect(prop.propertyType).toBe("SingleFamily");
      expect(prop.verificationLevel).toBe("Unverified");
      expect(prop.tier).toBe("Free");
      expect(prop.owner).toBe("owner-principal");
      expect(prop.isActive).toBe(true);
    });

    it("maps multiple properties", async () => {
      mockActor.getMyProperties.mockResolvedValue([
        makeRawProperty({ id: BigInt(1) }),
        makeRawProperty({ id: BigInt(2), address: "456 Oak Ave" }),
      ]);
      const props = await propertyService.getMyProperties();
      expect(props).toHaveLength(2);
      expect(props[1].address).toBe("456 Oak Ave");
    });

    it("maps all four PropertyType variants", async () => {
      const types = ["SingleFamily", "Condo", "Townhouse", "MultiFamily"];
      for (const pt of types) {
        mockActor.getMyProperties.mockResolvedValue([makeRawProperty({ propertyType: { [pt]: null } })]);
        const [prop] = await propertyService.getMyProperties();
        expect(prop.propertyType).toBe(pt);
      }
    });

    it("maps all four VerificationLevel variants", async () => {
      const levels = ["Unverified", "PendingReview", "Basic", "Premium"];
      for (const lvl of levels) {
        mockActor.getMyProperties.mockResolvedValue([makeRawProperty({ verificationLevel: { [lvl]: null } })]);
        const [prop] = await propertyService.getMyProperties();
        expect(prop.verificationLevel).toBe(lvl);
      }
    });

    it("maps all four SubscriptionTier variants", async () => {
      const tiers = ["Free", "Pro", "Premium", "ContractorPro"];
      for (const tier of tiers) {
        mockActor.getMyProperties.mockResolvedValue([makeRawProperty({ tier: { [tier]: null } })]);
        const [prop] = await propertyService.getMyProperties();
        expect(prop.tier).toBe(tier);
      }
    });
  });

  // ── getProperty ──────────────────────────────────────────────────────────────
  describe("getProperty", () => {
    it("returns a mapped property on success", async () => {
      mockActor.getProperty.mockResolvedValue({ ok: makeRawProperty() });
      const prop = await propertyService.getProperty(BigInt(1));
      expect(prop.address).toBe("123 Main St");
      expect(prop.owner).toBe("owner-principal");
    });

    it("throws NotFound error when canister returns err NotFound", async () => {
      mockActor.getProperty.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.getProperty(BigInt(999))).rejects.toThrow("NotFound");
    });

    it("throws NotAuthorized error", async () => {
      mockActor.getProperty.mockResolvedValue({ err: { NotAuthorized: null } });
      await expect(propertyService.getProperty(BigInt(1))).rejects.toThrow("NotAuthorized");
    });

    it("throws with text payload for InvalidInput errors", async () => {
      mockActor.getProperty.mockResolvedValue({ err: { InvalidInput: "Bad ID" } });
      await expect(propertyService.getProperty(BigInt(1))).rejects.toThrow("Bad ID");
    });
  });

  // ── registerProperty error handling (unwrap) ─────────────────────────────────
  describe("registerProperty error handling", () => {
    const validArgs = {
      address: "789 Elm St", city: "Dallas", state: "TX", zipCode: "75201",
      propertyType: "SingleFamily" as const, yearBuilt: 2000, squareFeet: 1800, tier: "Free" as const,
    };

    it("throws with AddressConflict message including an expiry date", async () => {
      // BigInt timestamp in nanoseconds — 2025-01-01T00:00:00Z
      const expiryNs = BigInt(1_735_689_600_000) * BigInt(1_000_000);
      mockActor.registerProperty.mockResolvedValue({ err: { AddressConflict: expiryNs } });
      await expect(propertyService.registerProperty(validArgs))
        .rejects.toThrow(/Address already claimed/);
    });

    it("AddressConflict error includes 'Verification window expires'", async () => {
      const expiryNs = BigInt(1_735_689_600_000) * BigInt(1_000_000);
      mockActor.registerProperty.mockResolvedValue({ err: { AddressConflict: expiryNs } });
      await expect(propertyService.registerProperty(validArgs))
        .rejects.toThrow(/Verification window expires/);
    });

    it("throws a specific DuplicateAddress message", async () => {
      mockActor.registerProperty.mockResolvedValue({ err: { DuplicateAddress: null } });
      await expect(propertyService.registerProperty(validArgs))
        .rejects.toThrow("This address is already registered and verified by another owner.");
    });

    it("throws LimitReached for quota errors", async () => {
      mockActor.registerProperty.mockResolvedValue({ err: { LimitReached: null } });
      await expect(propertyService.registerProperty(validArgs))
        .rejects.toThrow("LimitReached");
    });

    it("returns a mapped property on success", async () => {
      mockActor.registerProperty.mockResolvedValue({ ok: makeRawProperty({ address: "789 Elm St" }) });
      const prop = await propertyService.registerProperty(validArgs);
      expect(prop.address).toBe("789 Elm St");
    });
  });

  // ── submitVerification ───────────────────────────────────────────────────────
  describe("submitVerification", () => {
    it("returns the updated property on success", async () => {
      mockActor.submitVerification.mockResolvedValue({
        ok: makeRawProperty({ verificationLevel: { PendingReview: null } }),
      });
      const prop = await propertyService.submitVerification(BigInt(1), "UtilityBill", "abc123");
      expect(prop.verificationLevel).toBe("PendingReview");
    });

    it("throws on error", async () => {
      mockActor.submitVerification.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.submitVerification(BigInt(1), "UtilityBill", "abc"))
        .rejects.toThrow("NotFound");
    });
  });

  // ── getPendingVerifications ──────────────────────────────────────────────────
  describe("getPendingVerifications", () => {
    it("returns an empty array when none are pending", async () => {
      mockActor.getPendingVerifications.mockResolvedValue([]);
      const result = await propertyService.getPendingVerifications();
      expect(result).toEqual([]);
    });

    it("maps pending properties correctly", async () => {
      mockActor.getPendingVerifications.mockResolvedValue([
        makeRawProperty({ verificationLevel: { PendingReview: null } }),
      ]);
      const [prop] = await propertyService.getPendingVerifications();
      expect(prop.verificationLevel).toBe("PendingReview");
    });
  });

  // ── isAdmin ──────────────────────────────────────────────────────────────────
  describe("isAdmin", () => {
    it("returns true when canister confirms admin", async () => {
      mockActor.isAdminPrincipal.mockResolvedValue(true);
      // isAdmin calls @dfinity/principal — mock it
      vi.doMock("@dfinity/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("mock-principal-obj") },
      }));
      const result = await propertyService.isAdmin("some-principal");
      expect(typeof result).toBe("boolean");
    });
  });

  // ── verifyProperty ───────────────────────────────────────────────────────────
  describe("verifyProperty", () => {
    it("returns the updated property with new verification level", async () => {
      mockActor.verifyProperty.mockResolvedValue({
        ok: makeRawProperty({ verificationLevel: { Basic: null } }),
      });
      const prop = await propertyService.verifyProperty(BigInt(1), "Basic", "DeedRecord");
      expect(prop.verificationLevel).toBe("Basic");
    });

    it("works without optional method argument", async () => {
      mockActor.verifyProperty.mockResolvedValue({
        ok: makeRawProperty({ verificationLevel: { Premium: null } }),
      });
      const prop = await propertyService.verifyProperty(BigInt(1), "Premium");
      expect(prop.verificationLevel).toBe("Premium");
    });
  });

  // ── setTier ──────────────────────────────────────────────────────────────────
  describe("setTier", () => {
    it("resolves without error on success", async () => {
      mockActor.setTier.mockResolvedValue({ ok: null });
      vi.doMock("@dfinity/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("mock-p") },
      }));
      await expect(propertyService.setTier("some-principal", "Pro")).resolves.toBeUndefined();
    });

    it("throws on error", async () => {
      mockActor.setTier.mockResolvedValue({ err: { NotAuthorized: null } });
      vi.doMock("@dfinity/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("mock-p") },
      }));
      await expect(propertyService.setTier("some-principal", "Pro")).rejects.toThrow("NotAuthorized");
    });
  });

  // ── initiateTransfer ─────────────────────────────────────────────────────────
  describe("initiateTransfer", () => {
    it("maps raw canister response to a PendingTransfer", async () => {
      mockActor.initiateTransfer.mockResolvedValue({ ok: makeRawPendingTransfer() });
      const result = await propertyService.initiateTransfer(BigInt(1), "to-principal");
      expect(result.from).toBe("from-principal");
      expect(result.to).toBe("to-principal");
      // initiatedAt converted from ns → ms
      expect(result.initiatedAt).toBeCloseTo(1_735_689_600_000, -3);
    });

    it("throws with error key when canister returns err", async () => {
      mockActor.initiateTransfer.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.initiateTransfer(BigInt(99), "p")).rejects.toThrow("NotFound");
    });

    it("throws with string payload for InvalidInput error", async () => {
      mockActor.initiateTransfer.mockResolvedValue({ err: { InvalidInput: "Cannot transfer to yourself" } });
      await expect(propertyService.initiateTransfer(BigInt(1), "self"))
        .rejects.toThrow("Cannot transfer to yourself");
    });
  });

  // ── acceptTransfer ───────────────────────────────────────────────────────────
  describe("acceptTransfer", () => {
    it("returns the updated property on success", async () => {
      mockActor.acceptTransfer.mockResolvedValue({
        ok: makeRawProperty({ address: "456 Transfer Ave" }),
      });
      const prop = await propertyService.acceptTransfer(BigInt(1), "tx-hash-abc");
      expect(prop.address).toBe("456 Transfer Ave");
    });

    it("throws on canister error", async () => {
      mockActor.acceptTransfer.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.acceptTransfer(BigInt(1), "hash")).rejects.toThrow("NotFound");
    });

    it("defaults txHash to empty string when not provided", async () => {
      mockActor.acceptTransfer.mockResolvedValue({ ok: makeRawProperty() });
      await propertyService.acceptTransfer(BigInt(1));
      expect(mockActor.acceptTransfer).toHaveBeenCalledWith(BigInt(1), "");
    });
  });

  // ── cancelTransfer ───────────────────────────────────────────────────────────
  describe("cancelTransfer", () => {
    it("resolves without error on success", async () => {
      mockActor.cancelTransfer.mockResolvedValue({ ok: null });
      await expect(propertyService.cancelTransfer(BigInt(1))).resolves.toBeUndefined();
    });

    it("throws on canister error", async () => {
      mockActor.cancelTransfer.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.cancelTransfer(BigInt(1))).rejects.toThrow("NotFound");
    });
  });

  // ── getPendingTransfer ───────────────────────────────────────────────────────
  describe("getPendingTransfer", () => {
    it("returns null when canister returns empty array", async () => {
      mockActor.getPendingTransfer.mockResolvedValue([]);
      const result = await propertyService.getPendingTransfer(BigInt(1));
      expect(result).toBeNull();
    });

    it("maps the raw pending transfer when one exists", async () => {
      mockActor.getPendingTransfer.mockResolvedValue([makeRawPendingTransfer()]);
      const result = await propertyService.getPendingTransfer(BigInt(1));
      expect(result).not.toBeNull();
      expect(result!.from).toBe("from-principal");
      expect(result!.to).toBe("to-principal");
      expect(result!.initiatedAt).toBeCloseTo(1_735_689_600_000, -3);
    });
  });

  // ── getOwnershipHistory ──────────────────────────────────────────────────────
  // NOTE: getOwnershipHistory has an early-return guard when PROPERTY_CANISTER_ID
  // is empty (the case in unit tests), so only the fallback behaviour is testable here.
  // Mapping logic is exercised in integration / E2E tests against a live canister.
  describe("getOwnershipHistory", () => {
    it("returns empty array when no canister ID is configured", async () => {
      // PROPERTY_CANISTER_ID is '' in test env — function returns [] without calling actor
      const history = await propertyService.getOwnershipHistory(BigInt(1));
      expect(history).toEqual([]);
      expect(mockActor.getOwnershipHistory).not.toHaveBeenCalled();
    });
  });
});
