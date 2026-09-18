/**
 * peopleService — real logic worth locking down:
 *   - ownerRow synthesizes the owner as a person with role OWNER, no limit
 *   - getPeople maps managers + pending invites into PersonAccess rows with
 *     correct role translation (CoOwner→CO-OWNER, Manager→MANAGER, else VIEWER)
 *   - initials are derived correctly for single- and multi-word names
 *   - getApprovals filters to only Pending status
 *   - invite/updatePerson translate the UI role back to the backend ManagerRole
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetPropertyManagers, mockGetPendingInvitesForProperty, mockInviteManager,
  mockCancelManagerInvite, mockUpdateManagerRole, mockRemoveManager,
  mockGetApprovals, mockRespondToApproval, mockGetOwnerNotifications,
} = vi.hoisted(() => ({
  mockGetPropertyManagers: vi.fn(),
  mockGetPendingInvitesForProperty: vi.fn(),
  mockInviteManager: vi.fn(),
  mockCancelManagerInvite: vi.fn(),
  mockUpdateManagerRole: vi.fn(),
  mockRemoveManager: vi.fn(),
  mockGetApprovals: vi.fn(),
  mockRespondToApproval: vi.fn(),
  mockGetOwnerNotifications: vi.fn(),
}));

vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return {
    ...actual,
    propertyService: {
      getPropertyManagers: mockGetPropertyManagers,
      getPendingInvitesForProperty: mockGetPendingInvitesForProperty,
      inviteManager: mockInviteManager,
      cancelManagerInvite: mockCancelManagerInvite,
      updateManagerRole: mockUpdateManagerRole,
      removeManager: mockRemoveManager,
      getApprovals: mockGetApprovals,
      respondToApproval: mockRespondToApproval,
      getOwnerNotifications: mockGetOwnerNotifications,
    },
  };
});

import { peopleService } from "@/services/people";
import type { Property } from "@/services/property";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 1_700_000_000_000_000_000n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("peopleService.ownerRow", () => {
  it("synthesizes the owner as OWNER with no spend limit", () => {
    const row = peopleService.ownerRow(makeProperty());
    expect(row).toMatchObject({ id: "owner", name: "You", role: "OWNER", spendLimitCents: null, isPending: false });
    expect(row.addedAt).toBe(1_700_000_000_000);
  });
});

describe("peopleService.getPeople", () => {
  it("maps managers and pending invites with correct role translation and initials", async () => {
    mockGetPropertyManagers.mockResolvedValue([
      { principal: "p1", role: "CoOwner", displayName: "Jane Doe", addedAt: 1000, spendLimitCents: 5000 },
      { principal: "p2", role: "Manager", displayName: "Bob", addedAt: 2000 },
    ]);
    mockGetPendingInvitesForProperty.mockResolvedValue([
      { propertyId: "prop-1", token: "tok-1", role: "Viewer", displayName: "Carol Smith", invitedBy: "p1", createdAt: 3000, expiresAt: 9999 },
    ]);

    const people = await peopleService.getPeople("prop-1");

    expect(people).toEqual([
      { id: "p1", name: "Jane Doe", initials: "JD", role: "CO-OWNER", spendLimitCents: 5000, addedAt: 1000, isPending: false },
      { id: "p2", name: "Bob", initials: "BO", role: "MANAGER", spendLimitCents: null, addedAt: 2000, isPending: false },
      { id: "tok-1", name: "Carol Smith", initials: "CS", role: "VIEWER", spendLimitCents: null, addedAt: 3000, isPending: true, inviteToken: "tok-1" },
    ]);
  });
});

describe("peopleService.invite / updatePerson — role translation", () => {
  it("translates CO-OWNER back to CoOwner for the backend", async () => {
    mockInviteManager.mockResolvedValue({});
    await peopleService.invite("prop-1", "CO-OWNER", "Jane", 1000);
    expect(mockInviteManager).toHaveBeenCalledWith("prop-1", "CoOwner", "Jane", 1000);
  });

  it("passes undefined spendLimitCents when null", async () => {
    mockInviteManager.mockResolvedValue({});
    await peopleService.invite("prop-1", "VIEWER", "Bob", null);
    expect(mockInviteManager).toHaveBeenCalledWith("prop-1", "Viewer", "Bob", undefined);
  });

  it("translates MANAGER back to Manager for updatePerson", async () => {
    await peopleService.updatePerson("prop-1", "p1", "MANAGER", 500);
    expect(mockUpdateManagerRole).toHaveBeenCalledWith("prop-1", "p1", "Manager", 500);
  });
});

describe("peopleService.getApprovals", () => {
  it("filters to only Pending status", async () => {
    mockGetApprovals.mockResolvedValue([
      { id: 1, propertyId: "prop-1", requestedBy: "p1", requesterName: "Bob", description: "Fix roof", amountCents: 10000, createdAt: 100, status: "Pending" },
      { id: 2, propertyId: "prop-1", requestedBy: "p2", requesterName: "Jane", description: "Fix sink", amountCents: 5000, createdAt: 200, status: "Approved" },
    ]);
    const approvals = await peopleService.getApprovals("prop-1");
    expect(approvals).toEqual([{ id: 1, requesterName: "Bob", description: "Fix roof", amountCents: 10000, createdAt: 100 }]);
  });
});

describe("peopleService.getAuditLog", () => {
  it("maps owner notifications to audit rows", async () => {
    mockGetOwnerNotifications.mockResolvedValue([
      { id: 1, managerPrincipal: "p1", managerName: "Bob", description: "Approved a bid", timestamp: 100, seen: false },
    ]);
    const log = await peopleService.getAuditLog("prop-1");
    expect(log).toEqual([{ id: 1, when: 100, managerName: "Bob", description: "Approved a bid", seen: false }]);
  });
});
