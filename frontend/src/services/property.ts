import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/property";
export { idlFactory };

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";

export type PropertyType      = "SingleFamily" | "Condo" | "Townhouse" | "MultiFamily";
export type VerificationLevel = "Unverified" | "PendingReview" | "Basic" | "Premium";
export type ManagerRole       = "Viewer" | "Manager";
export type SubscriptionTier = "Free" | "Basic" | "Pro" | "Premium" | "ContractorFree" | "ContractorPro";

export interface Property {
  id: string;
  owner: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: PropertyType;
  yearBuilt: bigint;
  squareFeet: bigint;
  verificationLevel: VerificationLevel;
  tier: SubscriptionTier;
  createdAt: bigint;
  updatedAt: bigint;
  isActive: boolean;
  identityVerified     ?: boolean;
  identityVerifiedAt   ?: number;   // ms
  identitySessionId    ?: string;
  nameOnId             ?: string;
  nameOnDocument       ?: string;
  contestedWithId      ?: string;
  conflictWindowEndsAt ?: number;   // ms
}

export type VerifyStep =
  | "claim"
  | "identity"
  | "document"
  | "representative"
  | "status"
  | "expired"
  | "contested";

export interface VerifyClaimData {
  propertyId           : string;
  address              : string;
  city                 : string;
  state                : string;
  verificationLevel    : VerificationLevel;
  claimStartedAt       : number;   // ms
  claimWindowEndsAt    : number;   // ms
  identityVerified     : boolean;
  identityVerifiedAt  ?: number;   // ms
  identitySessionId   ?: string;
  nameOnId            ?: string;
  verificationDocHash ?: string;
  verificationMethod  ?: string;
  nameOnDocument      ?: string;
  contestedWithId     ?: string;
  conflictWindowEndsAt?: number;   // ms
  currentStep          : VerifyStep;
}

export interface TransferRecord {
  propertyId : string;
  from       : string;  // principal text
  to         : string;  // principal text
  timestamp  : number;  // ms
  txHash     : string;
}

export interface PendingTransfer {
  propertyId  : string;
  from        : string;  // principal text
  token       : string;  // bearer token embedded in the claim URL
  initiatedAt : number;  // ms
  expiresAt   : number;  // ms
}

export interface PropertyManager {
  principal   : string;   // principal text
  role        : ManagerRole;
  displayName : string;
  addedAt     : number;   // ms
}

export interface ManagerInvite {
  propertyId  : string;
  token       : string;
  role        : ManagerRole;
  displayName : string;
  invitedBy   : string;   // principal text
  createdAt   : number;   // ms
  expiresAt   : number;   // ms
}

export interface OwnerNotification {
  id               : number;
  managerPrincipal : string;
  managerName      : string;
  description      : string;
  timestamp        : number;  // ms
  seen             : boolean;
}

export interface ManagedProperty {
  property : Property;
  role     : ManagerRole;
}

export interface RegisterPropertyArgs {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: PropertyType;
  yearBuilt: number;
  squareFeet: number;
  tier: SubscriptionTier;
}

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: PROPERTY_CANISTER_ID });
  }
  return _actor;
}

function fromProperty(raw: any): Property {
  return {
    id: raw.id,
    owner: raw.owner.toText(),
    address: raw.address,
    city: raw.city,
    state: raw.state,
    zipCode: raw.zipCode,
    propertyType: Object.keys(raw.propertyType)[0] as PropertyType,
    yearBuilt: raw.yearBuilt,
    squareFeet: raw.squareFeet,
    verificationLevel: Object.keys(raw.verificationLevel)[0] as VerificationLevel,
    tier: Object.keys(raw.tier)[0] as SubscriptionTier,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    isActive: raw.isActive,
    identityVerified     : raw.identityVerified?.[0] ?? undefined,
    identityVerifiedAt   : raw.identityVerifiedAt?.[0] != null ? Number(raw.identityVerifiedAt[0]) / 1_000_000 : undefined,
    identitySessionId    : raw.identitySessionId?.[0] ?? undefined,
    nameOnId             : raw.nameOnId?.[0] ?? undefined,
    nameOnDocument       : raw.nameOnDocument?.[0] ?? undefined,
    contestedWithId      : raw.contestedWithId?.[0] ?? undefined,
    conflictWindowEndsAt : raw.conflictWindowEndsAt?.[0] != null ? Number(raw.conflictWindowEndsAt[0]) / 1_000_000 : undefined,
  };
}

function computeStep(raw: VerifyClaimData): VerifyStep {
  const now = Date.now();
  if (raw.contestedWithId) return "contested";
  if (raw.verificationLevel === "PendingReview" || raw.verificationLevel === "Basic" || raw.verificationLevel === "Premium") return "status";
  if (now > raw.claimWindowEndsAt) return "expired";
  if (raw.identityVerified && raw.verificationDocHash) return "status";
  if (raw.nameOnDocument && raw.nameOnId && raw.nameOnDocument !== raw.nameOnId) return "representative";
  if (raw.identityVerified) return "document";
  return "claim";
}

function fromPendingTransfer(r: any): PendingTransfer {
  return {
    propertyId : r.propertyId,
    from       : r.from.toText(),
    token      : r.token,
    initiatedAt: Number(r.initiatedAt) / 1_000_000,
    expiresAt  : Number(r.expiresAt)   / 1_000_000,
  };
}

function fromPropertyManager(r: any): PropertyManager {
  return {
    principal   : r.principal.toText(),
    role        : Object.keys(r.role)[0] as ManagerRole,
    displayName : r.displayName,
    addedAt     : Number(r.addedAt) / 1_000_000,
  };
}

function fromManagerInvite(r: any): ManagerInvite {
  return {
    propertyId  : r.propertyId,
    token       : r.token,
    role        : Object.keys(r.role)[0] as ManagerRole,
    displayName : r.displayName,
    invitedBy   : r.invitedBy.toText(),
    createdAt   : Number(r.createdAt) / 1_000_000,
    expiresAt   : Number(r.expiresAt) / 1_000_000,
  };
}

function fromOwnerNotification(r: any): OwnerNotification {
  return {
    id               : Number(r.id),
    managerPrincipal : r.managerPrincipal.toText(),
    managerName      : r.managerName,
    description      : r.description,
    timestamp        : Number(r.timestamp) / 1_000_000,
    seen             : r.seen,
  };
}

function unwrap(result: any): Property {
  if ("ok" in result) return fromProperty(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  if (key === "AddressConflict") {
    const expiresMs = Number(val) / 1_000_000;
    const expiresDate = new Date(expiresMs).toLocaleDateString();
    throw new Error(`Address already claimed. Verification window expires ${expiresDate}.`);
  }
  if (key === "DuplicateAddress") {
    throw new Error("This address is already registered and verified by another owner.");
  }
  throw new Error(typeof val === "string" ? val : key);
}

export const propertyService = {
  async registerProperty(args: RegisterPropertyArgs): Promise<Property> {
    if (typeof window !== "undefined" && (window as any).__e2e_register_property) {
      return (window as any).__e2e_register_property as Property;
    }
    const a = await getActor();
    const result = await a.registerProperty({
      address: args.address,
      city: args.city,
      state: args.state,
      zipCode: args.zipCode,
      propertyType: { [args.propertyType]: null },
      yearBuilt: BigInt(args.yearBuilt),
      squareFeet: BigInt(args.squareFeet),
      tier: { [args.tier]: null },
    });
    return unwrap(result);
  },

  async getMyProperties(): Promise<Property[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_properties) {
      return (window as any).__e2e_properties as Property[];
    }
    const a = await getActor();
    const props = await a.getMyProperties();
    return (props as any[]).map(fromProperty);
  },

  async getProperty(id: string): Promise<Property> {
    if (typeof window !== "undefined" && (window as any).__e2e_properties) {
      const props = (window as any).__e2e_properties as any[];
      const found = props.find((p: any) => String(p.id) === String(id));
      if (found) return found as Property;
    }
    const a = await getActor();
    const result = await a.getProperty(id);
    return unwrap(result);
  },

  /** Submit a verification document for admin review.
   *  method: "UtilityBill" | "DeedRecord" | "TaxRecord"
   *  documentHash: SHA-256 hex of the file, computed client-side */
  async submitVerification(
    propertyId: string,
    method: string,
    documentHash: string,
    nameOnDocument?: string
  ): Promise<Property> {
    const a = await getActor();
    const result = await a.submitVerification(propertyId, method, documentHash, nameOnDocument ? [nameOnDocument] : []);
    return unwrap(result);
  },

  async getVerifyStatus(propertyId: string): Promise<VerifyClaimData> {
    if (typeof window !== "undefined" && (window as any).__e2e_verify_status) {
      return (window as any).__e2e_verify_status as VerifyClaimData;
    }
    if (!PROPERTY_CANISTER_ID) {
      // mock: return a default claim state
      const now = Date.now();
      const base: VerifyClaimData = {
        propertyId, address: "412 Elder St", city: "Nashville", state: "TN",
        verificationLevel: "Unverified",
        claimStartedAt: now - 30 * 60 * 1000,
        claimWindowEndsAt: now + (71.5 * 60 * 60 * 1000),
        identityVerified: false,
        currentStep: "claim",
      };
      return { ...base, currentStep: computeStep(base) };
    }
    const a = await getActor();
    const result = await a.getVerifyStatus(propertyId);
    if ("err" in result) throw new Error(Object.keys(result.err)[0]);
    const r = result.ok;
    const base: VerifyClaimData = {
      propertyId: r.propertyId,
      address: r.address,
      city: r.city,
      state: r.state,
      verificationLevel: Object.keys(r.verificationLevel)[0] as VerificationLevel,
      claimStartedAt: Number(r.claimStartedAt) / 1_000_000,
      claimWindowEndsAt: Number(r.claimWindowEndsAt) / 1_000_000,
      identityVerified: r.identityVerified,
      identityVerifiedAt: r.identityVerifiedAt[0] ? Number(r.identityVerifiedAt[0]) / 1_000_000 : undefined,
      identitySessionId: r.identitySessionId[0] ?? undefined,
      nameOnId: r.nameOnId[0] ?? undefined,
      verificationDocHash: r.verificationDocHash[0] ?? undefined,
      verificationMethod: r.verificationMethod[0] ?? undefined,
      nameOnDocument: r.nameOnDocument[0] ?? undefined,
      contestedWithId: r.contestedWithId[0] ?? undefined,
      conflictWindowEndsAt: r.conflictWindowEndsAt[0] ? Number(r.conflictWindowEndsAt[0]) / 1_000_000 : undefined,
      currentStep: "claim",
    };
    return { ...base, currentStep: computeStep(base) };
  },

  async markIdentityCleared(propertyId: string, sessionId: string, name: string): Promise<Property> {
    const a = await getActor();
    const result = await a.markIdentityCleared(propertyId, sessionId, name);
    if ("err" in result) throw new Error(Object.keys(result.err)[0]);
    return fromProperty(result.ok);
  },

  async getPendingVerifications(): Promise<Property[]> {
    const a = await getActor();
    const props = await a.getPendingVerifications();
    return (props as any[]).map(fromProperty);
  },

  async isAdmin(principal: string): Promise<boolean> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    return a.isAdminPrincipal(P.fromText(principal));
  },

  async verifyProperty(id: string, level: VerificationLevel, method?: string): Promise<Property> {
    const a = await getActor();
    const result = await a.verifyProperty(id, { [level]: null }, method ? [method] : []);
    return unwrap(result);
  },

  async setTier(userPrincipal: string, tier: SubscriptionTier): Promise<void> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.setTier(P.fromText(userPrincipal), { [tier]: null });
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  /** Step 1: seller generates a bearer-token link for this property. */
  async initiateTransfer(propertyId: string): Promise<PendingTransfer> {
    const a = await getActor();
    const result = await a.initiateTransfer(propertyId);
    if ("ok" in result) {
      return fromPendingTransfer(result.ok);
    }
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Step 2: authenticated buyer presents the token to claim ownership. */
  async claimTransfer(token: string): Promise<Property> {
    const a = await getActor();
    const result = await a.claimTransfer(token);
    return unwrap(result);
  },

  async cancelTransfer(propertyId: string): Promise<void> {
    const a = await getActor();
    const result = await a.cancelTransfer(propertyId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  async getPendingTransfer(propertyId: string): Promise<PendingTransfer | null> {
    const a = await getActor();
    const result: any[] = await a.getPendingTransfer(propertyId);
    if (!result[0]) return null;
    return fromPendingTransfer(result[0]);
  },

  /** Look up a pending transfer by token — used by the claim page before login. */
  async getPendingTransferByToken(token: string): Promise<PendingTransfer | null> {
    const a = await getActor();
    const result: any[] = await a.getPendingTransferByToken(token);
    if (!result[0]) return null;
    return fromPendingTransfer(result[0]);
  },

  /** Returns the owner principal of a property, or null if not found.
   *  Used by job/photo/quote canisters to resolve manager tier bypass. */
  async getPropertyOwner(propertyId: string): Promise<string | null> {
    const a = await getActor();
    const result: any[] = await a.getPropertyOwner(propertyId);
    if (!result[0]) return null;
    return result[0].toText();
  },

  /** Returns the year a property was built, or null if the property does not exist.
   *  Called cross-canister by the market canister's computePropertyScore. */
  async getPropertyYearBuilt(propertyId: string): Promise<number | null> {
    const a = await getActor();
    const result: any[] = await a.getPropertyYearBuilt(propertyId);
    if (result.length === 0) return null;
    return Number(result[0]);
  },

  async getOwnershipHistory(propertyId: string): Promise<TransferRecord[]> {
    const a = await getActor();
    const records: any[] = await a.getOwnershipHistory(propertyId);
    return records.map((r) => ({
      propertyId : r.propertyId,
      from       : r.from.toText(),
      to         : r.to.toText(),
      timestamp  : Number(r.timestamp) / 1_000_000,
      txHash     : r.txHash,
    }));
  },

  /**
   * Search for properties by address substring.
   * Used by the contractor job proposal flow to resolve a street address to a
   * property record (and its owner principal) before submitting a proposal.
   *
   * Returns an empty array when no match is found.
   * Returns multiple results when the address is ambiguous (e.g. multiple units).
   */
  async searchByAddress(address: string): Promise<Array<{ id: string; owner: string; address: string }>> {
    const a = await getActor();
    const results: any[] = await a.searchByAddress(address);
    return results.map((r: any) => ({
      id:      String(r.id),
      owner:   r.owner.toText(),
      address: `${r.address}, ${r.city} ${r.state} ${r.zipCode}`,
    }));
  },

  // ── Delegated management ────────────────────────────────────────────────────

  /** Owner invites someone by role + display name; returns a bearer-token invite. */
  async inviteManager(propertyId: string, role: ManagerRole, displayName: string): Promise<ManagerInvite> {
    const a = await getActor();
    const result = await a.inviteManager(propertyId, { [role]: null }, displayName);
    if ("ok" in result) return fromManagerInvite(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Invited person clicks the link and claims their manager role. */
  async claimManagerRole(token: string): Promise<{ propertyId: string; role: ManagerRole }> {
    const a = await getActor();
    const result = await a.claimManagerRole(token);
    if ("ok" in result) {
      return {
        propertyId: result.ok.propertyId,
        role       : Object.keys(result.ok.role)[0] as ManagerRole,
      };
    }
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Owner changes a manager's role (Viewer ↔ Manager). */
  async updateManagerRole(propertyId: string, managerPrincipal: string, role: ManagerRole): Promise<void> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.updateManagerRole(propertyId, P.fromText(managerPrincipal), { [role]: null });
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  /** Owner removes a manager from the property. */
  async removeManager(propertyId: string, managerPrincipal: string): Promise<void> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.removeManager(propertyId, P.fromText(managerPrincipal));
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  /** Manager steps down from their delegated role. */
  async resignAsManager(propertyId: string): Promise<void> {
    const a = await getActor();
    const result = await a.resignAsManager(propertyId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  /** Returns all properties where the caller has a manager role. */
  async getMyManagedProperties(): Promise<ManagedProperty[]> {
    const a = await getActor();
    const results: any[] = await a.getMyManagedProperties();
    return results.map((r) => ({
      property: fromProperty(r.property),
      role    : Object.keys(r.role)[0] as ManagerRole,
    }));
  },

  /** Owner fetches the list of managers for one of their properties. */
  async getPropertyManagers(propertyId: string): Promise<PropertyManager[]> {
    const a = await getActor();
    const result = await a.getPropertyManagers(propertyId);
    if ("ok" in result) return (result.ok as any[]).map(fromPropertyManager);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Look up a manager invite by token (used by the claim page before login). */
  async getManagerInviteByToken(token: string): Promise<ManagerInvite | null> {
    const a = await getActor();
    const result: any[] = await a.getManagerInviteByToken(token);
    if (!result[0]) return null;
    return fromManagerInvite(result[0]);
  },

  /** Manager calls this to record a significant action (triggers owner notification). */
  async recordManagerActivity(propertyId: string, description: string): Promise<void> {
    const a = await getActor();
    const result = await a.recordManagerActivity(propertyId, description);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  /** Owner fetches notifications about manager actions on their property. */
  async getOwnerNotifications(propertyId: string): Promise<OwnerNotification[]> {
    const a = await getActor();
    const result = await a.getOwnerNotifications(propertyId);
    if ("ok" in result) return (result.ok as any[]).map(fromOwnerNotification);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Mark all unseen notifications for a property as seen. */
  async dismissNotifications(propertyId: string): Promise<void> {
    const a = await getActor();
    const result = await a.dismissNotifications(propertyId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  /** Cross-canister auth check: is this principal allowed to act on this property?
   *  requireWrite=false → owner OR manager; requireWrite=true → owner OR Manager-role. */
  async isAuthorized(propertyId: string, principal: string, requireWrite: boolean): Promise<boolean> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    return a.isAuthorized(propertyId, P.fromText(principal), requireWrite);
  },

  reset() {
    _actor = null;
  },
};
