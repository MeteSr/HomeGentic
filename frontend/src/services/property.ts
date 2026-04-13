import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";

export const idlFactory = ({ IDL }: any) => {
  const PropertyType = IDL.Variant({
    SingleFamily: IDL.Null,
    Condo: IDL.Null,
    Townhouse: IDL.Null,
    MultiFamily: IDL.Null,
  });
  const VerificationLevel = IDL.Variant({
    Unverified: IDL.Null,
    PendingReview: IDL.Null,
    Basic: IDL.Null,
    Premium: IDL.Null,
  });
  const SubscriptionTier = IDL.Variant({
    Free: IDL.Null,
    Pro: IDL.Null,
    Premium: IDL.Null,
    ContractorPro: IDL.Null,
  });
  const Property = IDL.Record({
    id: IDL.Nat,
    owner: IDL.Principal,
    address: IDL.Text,
    city: IDL.Text,
    state: IDL.Text,
    zipCode: IDL.Text,
    propertyType: PropertyType,
    yearBuilt: IDL.Nat,
    squareFeet: IDL.Nat,
    verificationLevel: VerificationLevel,
    tier: SubscriptionTier,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
    isActive: IDL.Bool,
  });
  const RegisterArgs = IDL.Record({
    address: IDL.Text,
    city: IDL.Text,
    state: IDL.Text,
    zipCode: IDL.Text,
    propertyType: PropertyType,
    yearBuilt: IDL.Nat,
    squareFeet: IDL.Nat,
    tier: SubscriptionTier,
  });
  const Error = IDL.Variant({
    NotFound: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused: IDL.Null,
    LimitReached: IDL.Null,
    InvalidInput: IDL.Text,
    DuplicateAddress: IDL.Null,
    AddressConflict: IDL.Int,
  });
  const TransferRecord = IDL.Record({
    propertyId : IDL.Nat,
    from       : IDL.Principal,
    to         : IDL.Principal,
    timestamp  : IDL.Int,
    txHash     : IDL.Text,
  });
  const PendingTransfer = IDL.Record({
    propertyId  : IDL.Nat,
    from        : IDL.Principal,
    token       : IDL.Text,
    initiatedAt : IDL.Int,
    expiresAt   : IDL.Int,
  });

  // Delegated management IDL types
  const ManagerRole = IDL.Variant({ Viewer: IDL.Null, Manager: IDL.Null });
  const PropertyManager = IDL.Record({
    principal   : IDL.Principal,
    role        : ManagerRole,
    displayName : IDL.Text,
    addedAt     : IDL.Int,
  });
  const ManagerInvite = IDL.Record({
    propertyId  : IDL.Nat,
    token       : IDL.Text,
    role        : ManagerRole,
    displayName : IDL.Text,
    invitedBy   : IDL.Principal,
    createdAt   : IDL.Int,
    expiresAt   : IDL.Int,
  });
  const OwnerNotification = IDL.Record({
    id               : IDL.Nat,
    managerPrincipal : IDL.Principal,
    managerName      : IDL.Text,
    description      : IDL.Text,
    timestamp        : IDL.Int,
    seen             : IDL.Bool,
  });
  const ManagedProperty = IDL.Record({ property: Property, role: ManagerRole });

  return IDL.Service({
    registerProperty: IDL.Func([RegisterArgs], [IDL.Variant({ ok: Property, err: Error })], []),
    getMyProperties: IDL.Func([], [IDL.Vec(Property)], ["query"]),
    getProperty: IDL.Func([IDL.Nat], [IDL.Variant({ ok: Property, err: Error })], ["query"]),
    getPropertyLimitForTier: IDL.Func([SubscriptionTier], [IDL.Nat], ["query"]),
    submitVerification: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: Property, err: Error })],
      []
    ),
    getVerificationLevel: IDL.Func([IDL.Nat], [IDL.Opt(IDL.Text)], ["query"]),
    getPendingVerifications: IDL.Func([], [IDL.Vec(Property)], ["query"]),
    isAdminPrincipal: IDL.Func([IDL.Principal], [IDL.Bool], ["query"]),
    verifyProperty: IDL.Func(
      [IDL.Nat, IDL.Variant({ Unverified: IDL.Null, PendingReview: IDL.Null, Basic: IDL.Null, Premium: IDL.Null }), IDL.Opt(IDL.Text)],
      [IDL.Variant({ ok: Property, err: Error })],
      []
    ),
    setTier: IDL.Func(
      [IDL.Principal, IDL.Variant({ Free: IDL.Null, Pro: IDL.Null, Premium: IDL.Null, ContractorPro: IDL.Null })],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // Token-based ownership transfer
    initiateTransfer: IDL.Func([IDL.Nat], [IDL.Variant({ ok: PendingTransfer, err: Error })], []),
    claimTransfer: IDL.Func([IDL.Text], [IDL.Variant({ ok: Property, err: Error })], []),
    cancelTransfer: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPendingTransfer: IDL.Func([IDL.Nat], [IDL.Opt(PendingTransfer)], ["query"]),
    getPendingTransferByToken: IDL.Func([IDL.Text], [IDL.Opt(PendingTransfer)], ["query"]),
    getOwnershipHistory: IDL.Func([IDL.Nat], [IDL.Vec(TransferRecord)], ["query"]),
    getPropertyOwner: IDL.Func([IDL.Nat], [IDL.Opt(IDL.Principal)], ["query"]),
    // Delegated management
    inviteManager: IDL.Func(
      [IDL.Nat, ManagerRole, IDL.Text],
      [IDL.Variant({ ok: ManagerInvite, err: Error })],
      []
    ),
    claimManagerRole: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Record({ propertyId: IDL.Nat, role: ManagerRole }), err: Error })],
      []
    ),
    updateManagerRole: IDL.Func(
      [IDL.Nat, IDL.Principal, ManagerRole],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    removeManager: IDL.Func([IDL.Nat, IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    resignAsManager: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getMyManagedProperties: IDL.Func([], [IDL.Vec(ManagedProperty)], ["query"]),
    getPropertyManagers: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Vec(PropertyManager), err: Error })], ["query"]),
    getManagerInviteByToken: IDL.Func([IDL.Text], [IDL.Opt(ManagerInvite)], ["query"]),
    recordManagerActivity: IDL.Func([IDL.Nat, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getOwnerNotifications: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Vec(OwnerNotification), err: Error })], ["query"]),
    dismissNotifications: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    isAuthorized: IDL.Func([IDL.Nat, IDL.Principal, IDL.Bool], [IDL.Bool], ["query"]),
  });
};

export type PropertyType      = "SingleFamily" | "Condo" | "Townhouse" | "MultiFamily";
export type VerificationLevel = "Unverified" | "PendingReview" | "Basic" | "Premium";
export type ManagerRole       = "Viewer" | "Manager";
export type SubscriptionTier = "Free" | "Pro" | "Premium" | "ContractorPro";

export interface Property {
  id: bigint;
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
}

export interface TransferRecord {
  propertyId : bigint;
  from       : string;  // principal text
  to         : string;  // principal text
  timestamp  : number;  // ms
  txHash     : string;
}

export interface PendingTransfer {
  propertyId  : bigint;
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
  propertyId  : bigint;
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
let _mockProperties: Property[] = [];
let _mockNextId = BigInt(1);

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
  };
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
    if (!PROPERTY_CANISTER_ID && !process.env.VITEST) {
      const mock: Property = {
        id:                _mockNextId++,
        owner:             "local-dev",
        address:           args.address,
        city:              args.city,
        state:             args.state,
        zipCode:           args.zipCode,
        propertyType:      args.propertyType,
        yearBuilt:         BigInt(args.yearBuilt),
        squareFeet:        BigInt(args.squareFeet),
        verificationLevel: "Unverified",
        tier:              args.tier,
        createdAt:         BigInt(Date.now()),
        updatedAt:         BigInt(Date.now()),
        isActive:          true,
      };
      _mockProperties.push(mock);
      return { ...mock };
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
    if (!PROPERTY_CANISTER_ID && !process.env.VITEST) return _mockProperties.map((p) => ({ ...p }));
    const a = await getActor();
    const props = await a.getMyProperties();
    return (props as any[]).map(fromProperty);
  },

  async getProperty(id: bigint): Promise<Property> {
    const a = await getActor();
    const result = await a.getProperty(id);
    return unwrap(result);
  },

  /** Submit a verification document for admin review.
   *  method: "UtilityBill" | "DeedRecord" | "TaxRecord"
   *  documentHash: SHA-256 hex of the file, computed client-side */
  async submitVerification(
    propertyId: bigint,
    method: string,
    documentHash: string
  ): Promise<Property> {
    const a = await getActor();
    const result = await a.submitVerification(propertyId, method, documentHash);
    return unwrap(result);
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

  async verifyProperty(id: bigint, level: VerificationLevel, method?: string): Promise<Property> {
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
  async initiateTransfer(propertyId: bigint): Promise<PendingTransfer> {
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

  async cancelTransfer(propertyId: bigint): Promise<void> {
    const a = await getActor();
    const result = await a.cancelTransfer(propertyId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  async getPendingTransfer(propertyId: bigint): Promise<PendingTransfer | null> {
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
  async getPropertyOwner(propertyId: bigint): Promise<string | null> {
    const a = await getActor();
    const result: any[] = await a.getPropertyOwner(propertyId);
    if (!result[0]) return null;
    return result[0].toText();
  },

  async getOwnershipHistory(propertyId: bigint): Promise<TransferRecord[]> {
    if (!PROPERTY_CANISTER_ID) return [];
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
    if (!PROPERTY_CANISTER_ID) {
      // In dev/test: fuzzy match against mock properties
      const term = address.toLowerCase();
      return _mockProperties
        .filter((p) => `${p.address} ${p.city} ${p.state}`.toLowerCase().includes(term))
        .map((p) => ({
          id:      String(p.id),
          owner:   p.owner,
          address: `${p.address}, ${p.city} ${p.state} ${p.zipCode}`,
        }));
    }
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
  async inviteManager(propertyId: bigint, role: ManagerRole, displayName: string): Promise<ManagerInvite> {
    const a = await getActor();
    const result = await a.inviteManager(propertyId, { [role]: null }, displayName);
    if ("ok" in result) return fromManagerInvite(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Invited person clicks the link and claims their manager role. */
  async claimManagerRole(token: string): Promise<{ propertyId: bigint; role: ManagerRole }> {
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
  async updateManagerRole(propertyId: bigint, managerPrincipal: string, role: ManagerRole): Promise<void> {
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
  async removeManager(propertyId: bigint, managerPrincipal: string): Promise<void> {
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
  async resignAsManager(propertyId: bigint): Promise<void> {
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
  async getPropertyManagers(propertyId: bigint): Promise<PropertyManager[]> {
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
  async recordManagerActivity(propertyId: bigint, description: string): Promise<void> {
    const a = await getActor();
    const result = await a.recordManagerActivity(propertyId, description);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  /** Owner fetches notifications about manager actions on their property. */
  async getOwnerNotifications(propertyId: bigint): Promise<OwnerNotification[]> {
    const a = await getActor();
    const result = await a.getOwnerNotifications(propertyId);
    if ("ok" in result) return (result.ok as any[]).map(fromOwnerNotification);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Mark all unseen notifications for a property as seen. */
  async dismissNotifications(propertyId: bigint): Promise<void> {
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
  async isAuthorized(propertyId: bigint, principal: string, requireWrite: boolean): Promise<boolean> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    return a.isAuthorized(propertyId, P.fromText(principal), requireWrite);
  },

  reset() {
    _actor = null;
    _mockProperties = [];
    _mockNextId = BigInt(1);
  },
};
