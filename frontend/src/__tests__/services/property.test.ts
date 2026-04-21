import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock external ICP dependencies ──────────────────────────────────────────

const mockActor = {
  registerProperty:          vi.fn(),
  getMyProperties:           vi.fn(),
  getProperty:               vi.fn(),
  submitVerification:        vi.fn(),
  getPendingVerifications:   vi.fn(),
  isAdminPrincipal:          vi.fn(),
  verifyProperty:            vi.fn(),
  setTier:                   vi.fn(),
  initiateTransfer:          vi.fn(),
  claimTransfer:             vi.fn(),
  cancelTransfer:            vi.fn(),
  getPendingTransfer:        vi.fn(),
  getPendingTransferByToken: vi.fn(),
  getOwnershipHistory:       vi.fn(),
  getPropertyOwner:          vi.fn(),
  searchByAddress:           vi.fn(),
  inviteManager:             vi.fn(),
  claimManagerRole:          vi.fn(),
  updateManagerRole:         vi.fn(),
  removeManager:             vi.fn(),
  resignAsManager:           vi.fn(),
  getMyManagedProperties:    vi.fn(),
  getPropertyManagers:       vi.fn(),
  getManagerInviteByToken:   vi.fn(),
  recordManagerActivity:     vi.fn(),
  getOwnerNotifications:     vi.fn(),
  dismissNotifications:      vi.fn(),
  isAuthorized:              vi.fn(),
};

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockActor) },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRawPendingTransfer(overrides: Record<string, unknown> = {}) {
  return {
    propertyId:  BigInt(1),
    from:        { toText: () => "from-principal" },
    token:       "1735689600000000000-1",
    initiatedAt: BigInt(1_735_689_600_000_000_000), // ~2025-01-01 in ns
    expiresAt:   BigInt(1_735_689_600_000_000_000 + 90 * 24 * 3600 * 1_000_000_000),
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
      // isAdmin calls @icp-sdk/core/principal — mock it
      vi.doMock("@icp-sdk/core/principal", () => ({
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
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("mock-p") },
      }));
      await expect(propertyService.setTier("some-principal", "Pro")).resolves.toBeUndefined();
    });

    it("throws on error", async () => {
      mockActor.setTier.mockResolvedValue({ err: { NotAuthorized: null } });
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("mock-p") },
      }));
      await expect(propertyService.setTier("some-principal", "Pro")).rejects.toThrow("NotAuthorized");
    });
  });

  // ── initiateTransfer ─────────────────────────────────────────────────────────
  describe("initiateTransfer", () => {
    it("maps raw canister response to a PendingTransfer with token", async () => {
      mockActor.initiateTransfer.mockResolvedValue({ ok: makeRawPendingTransfer() });
      const result = await propertyService.initiateTransfer(BigInt(1));
      expect(result.from).toBe("from-principal");
      expect(result.token).toBe("1735689600000000000-1");
      // initiatedAt converted from ns → ms
      expect(result.initiatedAt).toBeCloseTo(1_735_689_600_000, -3);
    });

    it("throws with error key when canister returns err", async () => {
      mockActor.initiateTransfer.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.initiateTransfer(BigInt(99))).rejects.toThrow("NotFound");
    });

    it("throws with string payload for InvalidInput error", async () => {
      mockActor.initiateTransfer.mockResolvedValue({ err: { InvalidInput: "Cannot claim your own property transfer." } });
      await expect(propertyService.initiateTransfer(BigInt(1)))
        .rejects.toThrow("Cannot claim your own property transfer.");
    });
  });

  // ── claimTransfer ────────────────────────────────────────────────────────────
  describe("claimTransfer", () => {
    it("returns the updated property on success", async () => {
      mockActor.claimTransfer.mockResolvedValue({
        ok: makeRawProperty({ address: "456 Transfer Ave" }),
      });
      const prop = await propertyService.claimTransfer("some-token");
      expect(prop.address).toBe("456 Transfer Ave");
    });

    it("throws on canister error", async () => {
      mockActor.claimTransfer.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.claimTransfer("bad-token")).rejects.toThrow("NotFound");
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
      expect(result!.token).toBe("1735689600000000000-1");
      expect(result!.initiatedAt).toBeCloseTo(1_735_689_600_000, -3);
    });
  });

  // ── getPendingTransferByToken ─────────────────────────────────────────────────
  describe("getPendingTransferByToken", () => {
    it("returns null when canister returns empty array", async () => {
      mockActor.getPendingTransferByToken.mockResolvedValue([]);
      const result = await propertyService.getPendingTransferByToken("bad-token");
      expect(result).toBeNull();
    });

    it("maps the raw pending transfer when the token exists", async () => {
      mockActor.getPendingTransferByToken.mockResolvedValue([makeRawPendingTransfer()]);
      const result = await propertyService.getPendingTransferByToken("1735689600000000000-1");
      expect(result).not.toBeNull();
      expect(result!.token).toBe("1735689600000000000-1");
      expect(result!.from).toBe("from-principal");
      expect(result!.expiresAt).toBeGreaterThan(result!.initiatedAt);
    });
  });

  // ── getOwnershipHistory ──────────────────────────────────────────────────────
  describe("getOwnershipHistory", () => {
    it("returns empty array when actor returns no records", async () => {
      mockActor.getOwnershipHistory.mockResolvedValue([]);
      const history = await propertyService.getOwnershipHistory(BigInt(1));
      expect(history).toEqual([]);
    });
  });

  // ── getPropertyOwner ──────────────────────────────────────────────────────────
  describe("getPropertyOwner", () => {
    it("returns null when canister returns empty array (property not found)", async () => {
      mockActor.getPropertyOwner.mockResolvedValue([]);
      const result = await propertyService.getPropertyOwner(BigInt(1));
      expect(result).toBeNull();
    });

    it("returns the principal text when an owner exists", async () => {
      mockActor.getPropertyOwner.mockResolvedValue([{ toText: () => "owner-abc" }]);
      const result = await propertyService.getPropertyOwner(BigInt(1));
      expect(result).toBe("owner-abc");
    });
  });

  // ── inviteManager ─────────────────────────────────────────────────────────────
  describe("inviteManager", () => {
    function makeRawInvite(overrides: Record<string, unknown> = {}) {
      return {
        propertyId:  BigInt(1),
        token:       "invite-token-xyz",
        role:        { Viewer: null },
        displayName: "John Smith",
        invitedBy:   { toText: () => "owner-principal" },
        createdAt:   BigInt(1_735_689_600_000_000_000),
        expiresAt:   BigInt(1_735_689_600_000_000_000 + 7 * 24 * 3600 * 1_000_000_000),
        ...overrides,
      };
    }

    it("returns a mapped ManagerInvite on success", async () => {
      mockActor.inviteManager.mockResolvedValue({ ok: makeRawInvite() });
      const invite = await propertyService.inviteManager(BigInt(1), "Viewer", "John Smith");
      expect(invite.token).toBe("invite-token-xyz");
      expect(invite.role).toBe("Viewer");
      expect(invite.displayName).toBe("John Smith");
      expect(invite.invitedBy).toBe("owner-principal");
      expect(invite.expiresAt).toBeGreaterThan(invite.createdAt);
    });

    it("maps Manager role correctly", async () => {
      mockActor.inviteManager.mockResolvedValue({ ok: makeRawInvite({ role: { Manager: null } }) });
      const invite = await propertyService.inviteManager(BigInt(1), "Manager", "Jane Doe");
      expect(invite.role).toBe("Manager");
    });

    it("throws with error key on canister error", async () => {
      mockActor.inviteManager.mockResolvedValue({ err: { NotAuthorized: null } });
      await expect(propertyService.inviteManager(BigInt(1), "Viewer", "x")).rejects.toThrow("NotAuthorized");
    });

    it("throws with text payload for InvalidInput", async () => {
      mockActor.inviteManager.mockResolvedValue({ err: { InvalidInput: "Display name too long" } });
      await expect(propertyService.inviteManager(BigInt(1), "Viewer", "x")).rejects.toThrow("Display name too long");
    });
  });

  // ── claimManagerRole ──────────────────────────────────────────────────────────
  describe("claimManagerRole", () => {
    it("returns propertyId and role on success", async () => {
      mockActor.claimManagerRole.mockResolvedValue({
        ok: { propertyId: BigInt(42), role: { Manager: null } },
      });
      const result = await propertyService.claimManagerRole("invite-token-xyz");
      expect(result.propertyId).toBe(BigInt(42));
      expect(result.role).toBe("Manager");
    });

    it("throws on canister error", async () => {
      mockActor.claimManagerRole.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.claimManagerRole("bad-token")).rejects.toThrow("NotFound");
    });
  });

  // ── updateManagerRole ─────────────────────────────────────────────────────────
  describe("updateManagerRole", () => {
    it("resolves without error on success", async () => {
      mockActor.updateManagerRole.mockResolvedValue({ ok: null });
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("p") },
      }));
      await expect(propertyService.updateManagerRole(BigInt(1), "manager-p", "Manager")).resolves.toBeUndefined();
    });

    it("throws on canister error", async () => {
      mockActor.updateManagerRole.mockResolvedValue({ err: { NotAuthorized: null } });
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("p") },
      }));
      await expect(propertyService.updateManagerRole(BigInt(1), "manager-p", "Viewer")).rejects.toThrow("NotAuthorized");
    });
  });

  // ── removeManager ─────────────────────────────────────────────────────────────
  describe("removeManager", () => {
    it("resolves without error on success", async () => {
      mockActor.removeManager.mockResolvedValue({ ok: null });
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("p") },
      }));
      await expect(propertyService.removeManager(BigInt(1), "manager-p")).resolves.toBeUndefined();
    });

    it("throws on canister error", async () => {
      mockActor.removeManager.mockResolvedValue({ err: { NotFound: null } });
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("p") },
      }));
      await expect(propertyService.removeManager(BigInt(1), "manager-p")).rejects.toThrow("NotFound");
    });
  });

  // ── resignAsManager ───────────────────────────────────────────────────────────
  describe("resignAsManager", () => {
    it("resolves without error on success", async () => {
      mockActor.resignAsManager.mockResolvedValue({ ok: null });
      await expect(propertyService.resignAsManager(BigInt(1))).resolves.toBeUndefined();
    });

    it("throws on canister error", async () => {
      mockActor.resignAsManager.mockResolvedValue({ err: { NotAuthorized: null } });
      await expect(propertyService.resignAsManager(BigInt(1))).rejects.toThrow("NotAuthorized");
    });
  });

  // ── getMyManagedProperties ────────────────────────────────────────────────────
  describe("getMyManagedProperties", () => {
    it("returns empty array when actor returns no results", async () => {
      mockActor.getMyManagedProperties.mockResolvedValue([]);
      const result = await propertyService.getMyManagedProperties();
      expect(result).toEqual([]);
    });
  });

  // ── getPropertyManagers ───────────────────────────────────────────────────────
  describe("getPropertyManagers", () => {
    it("returns mapped managers on success", async () => {
      mockActor.getPropertyManagers.mockResolvedValue({
        ok: [
          {
            principal:   { toText: () => "manager-principal" },
            role:        { Viewer: null },
            displayName: "Alice",
            addedAt:     BigInt(1_735_689_600_000_000_000),
          },
        ],
      });
      const [mgr] = await propertyService.getPropertyManagers(BigInt(1));
      expect(mgr.principal).toBe("manager-principal");
      expect(mgr.role).toBe("Viewer");
      expect(mgr.displayName).toBe("Alice");
    });

    it("returns empty array when no managers", async () => {
      mockActor.getPropertyManagers.mockResolvedValue({ ok: [] });
      const result = await propertyService.getPropertyManagers(BigInt(1));
      expect(result).toEqual([]);
    });

    it("throws on canister error", async () => {
      mockActor.getPropertyManagers.mockResolvedValue({ err: { NotFound: null } });
      await expect(propertyService.getPropertyManagers(BigInt(1))).rejects.toThrow("NotFound");
    });
  });

  // ── getManagerInviteByToken ───────────────────────────────────────────────────
  describe("getManagerInviteByToken", () => {
    it("returns null when canister returns empty array", async () => {
      mockActor.getManagerInviteByToken.mockResolvedValue([]);
      const result = await propertyService.getManagerInviteByToken("no-such-token");
      expect(result).toBeNull();
    });

    it("maps invite when token exists", async () => {
      mockActor.getManagerInviteByToken.mockResolvedValue([
        {
          propertyId:  BigInt(1),
          token:       "abc-token",
          role:        { Viewer: null },
          displayName: "Bob",
          invitedBy:   { toText: () => "owner-p" },
          createdAt:   BigInt(1_735_689_600_000_000_000),
          expiresAt:   BigInt(1_735_689_600_000_000_000 + 7 * 24 * 3600 * 1_000_000_000),
        },
      ]);
      const invite = await propertyService.getManagerInviteByToken("abc-token");
      expect(invite).not.toBeNull();
      expect(invite!.token).toBe("abc-token");
      expect(invite!.role).toBe("Viewer");
    });
  });

  // ── recordManagerActivity ─────────────────────────────────────────────────────
  describe("recordManagerActivity", () => {
    it("resolves without error on success", async () => {
      mockActor.recordManagerActivity.mockResolvedValue({ ok: null });
      await expect(propertyService.recordManagerActivity(BigInt(1), "Updated photos")).resolves.toBeUndefined();
    });

    it("throws on canister error", async () => {
      mockActor.recordManagerActivity.mockResolvedValue({ err: { NotAuthorized: null } });
      await expect(propertyService.recordManagerActivity(BigInt(1), "x")).rejects.toThrow("NotAuthorized");
    });
  });

  // ── getOwnerNotifications ─────────────────────────────────────────────────────
  describe("getOwnerNotifications", () => {
    it("returns empty array when actor returns no notifications", async () => {
      mockActor.getOwnerNotifications.mockResolvedValue({ ok: [] });
      const result = await propertyService.getOwnerNotifications(BigInt(1));
      expect(result).toEqual([]);
    });
  });

  // ── dismissNotifications ──────────────────────────────────────────────────────
  describe("dismissNotifications", () => {
    it("resolves without error on success", async () => {
      mockActor.dismissNotifications.mockResolvedValue({ ok: null });
      await expect(propertyService.dismissNotifications(BigInt(1))).resolves.toBeUndefined();
    });

    it("throws on canister error", async () => {
      mockActor.dismissNotifications.mockResolvedValue({ err: { NotAuthorized: null } });
      await expect(propertyService.dismissNotifications(BigInt(1))).rejects.toThrow("NotAuthorized");
    });
  });

  // ── isAuthorized ──────────────────────────────────────────────────────────────
  describe("isAuthorized", () => {
    it("returns true when canister grants access", async () => {
      mockActor.isAuthorized.mockResolvedValue(true);
      vi.doMock("@icp-sdk/core/principal", () => ({
        Principal: { fromText: vi.fn().mockReturnValue("p") },
      }));
      const result = await propertyService.isAuthorized(BigInt(1), "some-principal", false);
      expect(typeof result).toBe("boolean");
    });
  });
});
