import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";

const idlFactory = ({ IDL }: any) => {
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
    to          : IDL.Principal,
    initiatedAt : IDL.Int,
  });
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
    initiateTransfer: IDL.Func(
      [IDL.Nat, IDL.Principal],
      [IDL.Variant({ ok: PendingTransfer, err: Error })],
      []
    ),
    acceptTransfer: IDL.Func(
      [IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: Property, err: Error })],
      []
    ),
    cancelTransfer: IDL.Func(
      [IDL.Nat],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getPendingTransfer: IDL.Func([IDL.Nat], [IDL.Opt(PendingTransfer)], ["query"]),
    getOwnershipHistory: IDL.Func([IDL.Nat], [IDL.Vec(TransferRecord)], ["query"]),
  });
};

export type PropertyType = "SingleFamily" | "Condo" | "Townhouse" | "MultiFamily";
export type VerificationLevel = "Unverified" | "PendingReview" | "Basic" | "Premium";
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
  from        : string;
  to          : string;
  initiatedAt : number; // ms
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
    const { Principal: P } = await import("@dfinity/principal");
    return a.isAdminPrincipal(P.fromText(principal));
  },

  async verifyProperty(id: bigint, level: VerificationLevel, method?: string): Promise<Property> {
    const a = await getActor();
    const result = await a.verifyProperty(id, { [level]: null }, method ? [method] : []);
    return unwrap(result);
  },

  async setTier(userPrincipal: string, tier: SubscriptionTier): Promise<void> {
    const a = await getActor();
    const { Principal: P } = await import("@dfinity/principal");
    const result = await a.setTier(P.fromText(userPrincipal), { [tier]: null });
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  async initiateTransfer(propertyId: bigint, toPrincipal: string): Promise<PendingTransfer> {
    const { Principal: P } = await import("@dfinity/principal");
    const a = await getActor();
    const result = await a.initiateTransfer(propertyId, P.fromText(toPrincipal));
    if ("ok" in result) {
      const r = result.ok;
      return {
        propertyId : r.propertyId,
        from       : r.from.toText(),
        to         : r.to.toText(),
        initiatedAt: Number(r.initiatedAt) / 1_000_000,
      };
    }
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async acceptTransfer(propertyId: bigint, txHash = ""): Promise<Property> {
    const a = await getActor();
    const result = await a.acceptTransfer(propertyId, txHash);
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
    const r = result[0];
    return {
      propertyId : r.propertyId,
      from       : r.from.toText(),
      to         : r.to.toText(),
      initiatedAt: Number(r.initiatedAt) / 1_000_000,
    };
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

  reset() {
    _actor = null;
  },
};
