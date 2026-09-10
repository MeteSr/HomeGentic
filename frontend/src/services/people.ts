import {
  propertyService,
  type ManagerRole,
  type PropertyManager,
  type ManagerInvite,
  type PendingApprovalRequest,
  type OwnerNotification,
  type Property,
} from "@/services/property";

export type PersonRole = "OWNER" | "CO-OWNER" | "MANAGER" | "VIEWER";

export interface PersonAccess {
  id:              string;   // principal text; "owner" for the synthesized owner row
  name:            string;   // display name ("You" for the owner row)
  initials:        string;
  role:            PersonRole;
  spendLimitCents: number | null;  // null = no limit; not meaningful for OWNER/VIEWER/CO-OWNER
  addedAt:         number;   // ms
  isPending:       boolean;  // true for a not-yet-claimed invite, not an accepted person
  inviteToken?:    string;   // set only when isPending — needed to cancel the invite
}

export interface PendingApproval {
  id:            number;
  requesterName: string;
  description:   string;
  amountCents:   number;
  createdAt:     number;  // ms
}

export interface AuditRow {
  id:          number;
  when:        number;  // ms
  managerName: string;
  description: string;
  seen:        boolean;
}

function toRole(role: ManagerRole): PersonRole {
  if (role === "CoOwner") return "CO-OWNER";
  if (role === "Manager") return "MANAGER";
  return "VIEWER";
}

function fromBackendRole(role: PersonRole): ManagerRole {
  if (role === "CO-OWNER") return "CoOwner";
  if (role === "MANAGER") return "Manager";
  return "Viewer";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fromManager(m: PropertyManager): PersonAccess {
  return {
    id:              m.principal,
    name:            m.displayName,
    initials:        initialsOf(m.displayName),
    role:            toRole(m.role),
    spendLimitCents: m.spendLimitCents ?? null,
    addedAt:         m.addedAt,
    isPending:       false,
  };
}

function fromInvite(inv: ManagerInvite): PersonAccess {
  return {
    id:              inv.token,
    name:            inv.displayName,
    initials:        initialsOf(inv.displayName),
    role:            toRole(inv.role),
    spendLimitCents: inv.spendLimitCents ?? null,
    addedAt:         inv.createdAt,
    isPending:       true,
    inviteToken:     inv.token,
  };
}

function fromApprovalRequest(a: PendingApprovalRequest): PendingApproval {
  return {
    id:            a.id,
    requesterName: a.requesterName,
    description:   a.description,
    amountCents:   a.amountCents,
    createdAt:     a.createdAt,
  };
}

function fromNotification(n: OwnerNotification): AuditRow {
  return {
    id:          n.id,
    when:        n.timestamp,
    managerName: n.managerName,
    description: n.description,
    seen:        n.seen,
  };
}

export const peopleService = {
  /** Owner row synthesized from the property record itself — never comes from the managers list. */
  ownerRow(property: Property): PersonAccess {
    return {
      id: "owner", name: "You", initials: initialsOf("You"),
      role: "OWNER", spendLimitCents: null, addedAt: Number(property.createdAt) / 1_000_000, isPending: false,
    };
  },

  async getPeople(propertyId: string): Promise<PersonAccess[]> {
    const [managers, invites] = await Promise.all([
      propertyService.getPropertyManagers(propertyId),
      propertyService.getPendingInvitesForProperty(propertyId),
    ]);
    return [...managers.map(fromManager), ...invites.map(fromInvite)];
  },

  async invite(propertyId: string, role: PersonRole, displayName: string, spendLimitCents: number | null): Promise<ManagerInvite> {
    return propertyService.inviteManager(propertyId, fromBackendRole(role), displayName, spendLimitCents ?? undefined);
  },

  async cancelInvite(propertyId: string, token: string): Promise<void> {
    return propertyService.cancelManagerInvite(propertyId, token);
  },

  async updatePerson(propertyId: string, principal: string, role: PersonRole, spendLimitCents: number | null): Promise<void> {
    return propertyService.updateManagerRole(propertyId, principal, fromBackendRole(role), spendLimitCents ?? undefined);
  },

  async revoke(propertyId: string, principal: string): Promise<void> {
    return propertyService.removeManager(propertyId, principal);
  },

  async getApprovals(propertyId: string): Promise<PendingApproval[]> {
    const list = await propertyService.getApprovals(propertyId);
    return list.filter(a => a.status === "Pending").map(fromApprovalRequest);
  },

  async respondToApproval(propertyId: string, approvalId: number, approve: boolean): Promise<void> {
    return propertyService.respondToApproval(propertyId, approvalId, approve);
  },

  async getAuditLog(propertyId: string): Promise<AuditRow[]> {
    const notifs = await propertyService.getOwnerNotifications(propertyId);
    return notifs.map(fromNotification);
  },
};
