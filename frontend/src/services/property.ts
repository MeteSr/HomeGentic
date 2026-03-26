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

  reset() {
    _actor = null;
  },
};
