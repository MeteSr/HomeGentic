/**
 * PeoplePage — real logic worth locking down:
 *   - tier gating: only Pro/Premium can access; Free sees the UpgradeGate
 *   - no-property empty state for allowed tiers
 *   - people list: owner row is always first, singular/plural summary line,
 *     manager spend-limit copy vs "no spend limit" vs added/invited wording
 *   - revoke routes to cancelInvite for pending invites, revoke for accepted people
 *   - editing a person's role/limit calls updatePerson
 *   - invite flow: spend limit only applies to Manager, Generate is disabled
 *     without a name, and a successful invite shows a copyable link
 *   - approvals tab badge count and approve/decline responses
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PeoplePage from "@/pages/PeoplePage";
import type { PersonAccess, PendingApproval, AuditRow } from "@/services/people";
import type { Property } from "@/services/property";

const {
  mockGetPeople, mockInvite, mockCancelInvite, mockUpdatePerson, mockRevoke,
  mockGetApprovals, mockRespondToApproval, mockGetAuditLog, mockOwnerRow,
} = vi.hoisted(() => ({
  mockGetPeople:        vi.fn(),
  mockInvite:           vi.fn(),
  mockCancelInvite:     vi.fn(),
  mockUpdatePerson:     vi.fn(),
  mockRevoke:           vi.fn(),
  mockGetApprovals:     vi.fn(),
  mockRespondToApproval: vi.fn(),
  mockGetAuditLog:      vi.fn(),
  mockOwnerRow:         vi.fn(),
}));

vi.mock("@/services/people", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/people")>();
  return {
    ...actual,
    peopleService: {
      ownerRow: mockOwnerRow,
      getPeople: mockGetPeople,
      invite: mockInvite,
      cancelInvite: mockCancelInvite,
      updatePerson: mockUpdatePerson,
      revoke: mockRevoke,
      getApprovals: mockGetApprovals,
      respondToApproval: mockRespondToApproval,
      getAuditLog: mockGetAuditLog,
    },
  };
});

const { mockGetMySubscription } = vi.hoisted(() => ({ mockGetMySubscription: vi.fn() }));
vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return { ...actual, paymentService: { getMySubscription: mockGetMySubscription } };
});

const STABLE_PROPS: Property[] = [{
  id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
  verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
}];
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: STABLE_PROPS }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/UpgradeGate", () => ({
  UpgradeGate: ({ feature }: any) => <div data-testid="upgrade-gate">{feature}</div>,
}));

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError:   vi.fn(),
  mockToastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: mockToastError, success: mockToastSuccess },
}));

const OWNER_ROW: PersonAccess = {
  id: "owner", name: "You", initials: "YO", role: "OWNER",
  spendLimitCents: null, addedAt: Date.now() - 100 * 86400000, isPending: false,
};

function makePerson(overrides: Partial<PersonAccess> = {}): PersonAccess {
  return {
    id: "p-1", name: "Jamie Rivera", initials: "JR", role: "MANAGER",
    spendLimitCents: 50000, addedAt: Date.now() - 86400000, isPending: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwnerRow.mockReturnValue(OWNER_ROW);
  mockGetPeople.mockResolvedValue([]);
  mockGetApprovals.mockResolvedValue([]);
  mockGetAuditLog.mockResolvedValue([]);
  mockGetMySubscription.mockResolvedValue({ tier: "Pro", expiresAt: null, cancelledAt: null });
});

describe("PeoplePage — tier gating", () => {
  it("shows the upgrade gate for Free tier", async () => {
    mockGetMySubscription.mockResolvedValue({ tier: "Free", expiresAt: null, cancelledAt: null });
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByTestId("upgrade-gate")).toBeInTheDocument());
    expect(screen.getByText("Shared property access")).toBeInTheDocument();
    expect(screen.queryByText("People")).toBeInTheDocument(); // header still renders
    expect(screen.queryByText("+ Invite someone")).not.toBeInTheDocument();
  });

  it("allows Pro tier through to the people list", async () => {
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("1 person can see this property")).toBeInTheDocument());
  });

  it("allows Premium tier through as well", async () => {
    mockGetMySubscription.mockResolvedValue({ tier: "Premium", expiresAt: null, cancelledAt: null });
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("1 person can see this property")).toBeInTheDocument());
  });
});

describe("PeoplePage — people list", () => {
  it("always includes the owner row first, and pluralizes the summary", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ id: "p-1", name: "Jamie Rivera" })]);
    render(<PeoplePage />);

    await waitFor(() => expect(screen.getByText("2 people can see this property")).toBeInTheDocument());
    const names = screen.getAllByText(/^(You|Jamie Rivera)$/).map((el) => el.textContent);
    expect(names[0]).toBe("You");
    expect(names[1]).toBe("Jamie Rivera");
  });

  it("shows the spend-limit copy for a manager with a limit", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ role: "MANAGER", spendLimitCents: 50000 })]);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("Up to $500 per action")).toBeInTheDocument());
  });

  it("shows 'No spend limit' for a manager with a null limit", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ role: "MANAGER", spendLimitCents: null })]);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("No spend limit")).toBeInTheDocument());
  });

  it("shows 'Invited' wording for a pending viewer and 'Added' for an accepted one", async () => {
    mockGetPeople.mockResolvedValue([
      makePerson({ id: "pending-1", role: "VIEWER", isPending: true, addedAt: Date.now() }),
      makePerson({ id: "accepted-1", role: "VIEWER", isPending: false, addedAt: Date.now() }),
    ]);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText(/invited today/i)).toBeInTheDocument());
    expect(screen.getByText(/added today/i)).toBeInTheDocument();
  });

  it("cancels a pending invite via cancelInvite, not revoke", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ id: "pending-1", isPending: true, inviteToken: "tok-1" })]);
    mockCancelInvite.mockResolvedValue(undefined);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("2 people can see this property")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("Manage")[1]);
    fireEvent.click(screen.getByText("Cancel invite"));

    await waitFor(() => expect(mockCancelInvite).toHaveBeenCalledWith("prop-1", "tok-1"));
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Invite cancelled");
  });

  it("revokes access for an accepted person via revoke", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ id: "p-1", isPending: false })]);
    mockRevoke.mockResolvedValue(undefined);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("2 people can see this property")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("Manage")[1]);
    fireEvent.click(screen.getByText("Revoke access"));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith("prop-1", "p-1"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Access revoked");
  });

  it("saves a role/limit change via updatePerson", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ id: "p-1", role: "VIEWER", spendLimitCents: null })]);
    mockUpdatePerson.mockResolvedValue(undefined);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("2 people can see this property")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("Manage")[1]);
    fireEvent.click(screen.getByText("Change role"));
    fireEvent.click(screen.getByText("Manager"));
    fireEvent.click(screen.getByText("$1,000"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(mockUpdatePerson).toHaveBeenCalledWith("prop-1", "p-1", "MANAGER", 100000));
    expect(mockToastSuccess).toHaveBeenCalledWith("Updated");
  });

  it("does not offer Change role for a pending invite", async () => {
    mockGetPeople.mockResolvedValue([makePerson({ id: "pending-1", isPending: true })]);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("2 people can see this property")).toBeInTheDocument());

    fireEvent.click(screen.getAllByText("Manage")[1]);
    expect(screen.queryByText("Change role")).not.toBeInTheDocument();
  });
});

describe("PeoplePage — invite flow", () => {
  it("disables Generate invite link until a display name is entered", async () => {
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getAllByText("+ Invite someone").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("+ Invite someone")[0]);

    await waitFor(() => expect(screen.getByText("Generate invite link")).toBeInTheDocument());
    expect(screen.getByText("Generate invite link")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Sarah - daughter"), { target: { value: "Sarah" } });
    expect(screen.getByText("Generate invite link")).not.toBeDisabled();
  });

  it("only enables spend-limit buttons when Manager role is selected", async () => {
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getAllByText("+ Invite someone").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("+ Invite someone")[0]);

    await waitFor(() => expect(screen.getByText("No limit")).toBeInTheDocument());
    expect(screen.getByText("No limit")).toBeDisabled(); // default role is Viewer

    fireEvent.click(screen.getByText("Manager"));
    expect(screen.getByText("No limit")).not.toBeDisabled();
  });

  it("generates a claimable invite link and copies it", async () => {
    mockInvite.mockResolvedValue({ token: "tok-abc", role: "Viewer", displayName: "Sarah", spendLimitCents: null } as any);
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PeoplePage />);
    await waitFor(() => expect(screen.getAllByText("+ Invite someone").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("+ Invite someone")[0]);
    await waitFor(() => expect(screen.getByText("Generate invite link")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("e.g. Sarah - daughter"), { target: { value: "Sarah" } });
    fireEvent.click(screen.getByText("Generate invite link"));

    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith("prop-1", "VIEWER", "Sarah", null));
    await waitFor(() => expect(screen.getByText("Invite link ready")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/manage/claim/tok-abc"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Link copied!");
  });

  it("returns to the people tab after Done", async () => {
    mockInvite.mockResolvedValue({ token: "tok-abc" } as any);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getAllByText("+ Invite someone").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("+ Invite someone")[0]);
    await waitFor(() => expect(screen.getByText("Generate invite link")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("e.g. Sarah - daughter"), { target: { value: "Sarah" } });
    fireEvent.click(screen.getByText("Generate invite link"));
    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Done"));
    await waitFor(() => expect(screen.getByText("1 person can see this property")).toBeInTheDocument());
  });
});

describe("PeoplePage — approvals and activity", () => {
  it("shows a badge with the pending approval count on the Approvals tab", async () => {
    mockGetApprovals.mockResolvedValue([
      { id: 1, requesterName: "Jamie", description: "Roof repair", amountCents: 150000, createdAt: Date.now() },
    ] as PendingApproval[]);
    render(<PeoplePage />);
    await waitFor(() => expect(within(screen.getByText("Approvals and log").closest("button")!).getByText("1")).toBeInTheDocument());
  });

  it("shows approve confirmation and calls respondToApproval(true)", async () => {
    mockGetApprovals.mockResolvedValue([
      { id: 1, requesterName: "Jamie", description: "Roof repair", amountCents: 150000, createdAt: Date.now() },
    ] as PendingApproval[]);
    mockRespondToApproval.mockResolvedValue(undefined);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("Approvals and log")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Approvals and log"));

    await waitFor(() => expect(screen.getByText("Roof repair")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Approve"));

    expect(screen.getByText(/✓ Approved — Jamie will be notified\./)).toBeInTheDocument();
    await waitFor(() => expect(mockRespondToApproval).toHaveBeenCalledWith("prop-1", 1, true));
  });

  it("shows decline confirmation and calls respondToApproval(false)", async () => {
    mockGetApprovals.mockResolvedValue([
      { id: 1, requesterName: "Jamie", description: "Roof repair", amountCents: 150000, createdAt: Date.now() },
    ] as PendingApproval[]);
    mockRespondToApproval.mockResolvedValue(undefined);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("Approvals and log")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Approvals and log"));

    await waitFor(() => expect(screen.getByText("Roof repair")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Decline"));

    expect(screen.getByText(/✗ Declined — Jamie has been notified\./)).toBeInTheDocument();
    await waitFor(() => expect(mockRespondToApproval).toHaveBeenCalledWith("prop-1", 1, false));
  });

  it("shows an empty-state message when there is no activity", async () => {
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("Approvals and log")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Approvals and log"));

    await waitFor(() => expect(screen.getByText(/No activity yet/)).toBeInTheDocument());
  });

  it("shows audit rows when present", async () => {
    mockGetAuditLog.mockResolvedValue([
      { id: 1, when: Date.now(), managerName: "Jamie Rivera", description: "Uploaded a photo", seen: true },
    ] as AuditRow[]);
    render(<PeoplePage />);
    await waitFor(() => expect(screen.getByText("Approvals and log")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Approvals and log"));

    await waitFor(() => expect(screen.getByText("Uploaded a photo")).toBeInTheDocument());
  });
});
