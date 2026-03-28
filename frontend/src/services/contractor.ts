import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const CONTRACTOR_CANISTER_ID = (process.env as any).CONTRACTOR_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const ServiceType = IDL.Variant({
    Roofing: IDL.Null, HVAC: IDL.Null, Plumbing: IDL.Null, Electrical: IDL.Null,
    Painting: IDL.Null, Flooring: IDL.Null, Windows: IDL.Null, Landscaping: IDL.Null,
  });
  const ContractorProfile = IDL.Record({
    id:            IDL.Principal,
    name:          IDL.Text,
    specialty:     ServiceType,
    email:         IDL.Text,
    phone:         IDL.Text,
    bio:           IDL.Opt(IDL.Text),
    licenseNumber: IDL.Opt(IDL.Text),
    serviceArea:   IDL.Opt(IDL.Text),
    trustScore:    IDL.Nat,
    jobsCompleted: IDL.Nat,
    isVerified:    IDL.Bool,
    createdAt:     IDL.Int,
  });
  const RegisterArgs = IDL.Record({
    name:      IDL.Text,
    specialty: ServiceType,
    email:     IDL.Text,
    phone:     IDL.Text,
  });
  const UpdateArgs = IDL.Record({
    name:          IDL.Text,
    specialty:     ServiceType,
    email:         IDL.Text,
    phone:         IDL.Text,
    bio:           IDL.Opt(IDL.Text),
    licenseNumber: IDL.Opt(IDL.Text),
    serviceArea:   IDL.Opt(IDL.Text),
  });
  const Review = IDL.Record({
    id:         IDL.Text,
    contractor: IDL.Principal,
    reviewer:   IDL.Principal,
    rating:     IDL.Nat,
    comment:    IDL.Text,
    jobId:      IDL.Text,
    createdAt:  IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:          IDL.Null,
    AlreadyExists:     IDL.Null,
    Unauthorized:      IDL.Null,
    Paused:            IDL.Null,
    RateLimitExceeded: IDL.Null,
    InvalidInput:      IDL.Text,
  });
  return IDL.Service({
    register: IDL.Func(
      [RegisterArgs],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      []
    ),
    updateProfile: IDL.Func(
      [UpdateArgs],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      []
    ),
    getMyProfile: IDL.Func(
      [],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      ["query"]
    ),
    getContractor: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      ["query"]
    ),
    getAll: IDL.Func([], [IDL.Vec(ContractorProfile)], ["query"]),
    submitReview: IDL.Func(
      [IDL.Principal, IDL.Nat, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: Review, err: Error })],
      []
    ),
    getReviewsForContractor: IDL.Func(
      [IDL.Principal],
      [IDL.Vec(Review)],
      ["query"]
    ),
    recordJobVerified: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setJobCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export interface ContractorProfile {
  id:            string;   // principal text
  name:          string;
  specialty:     string;
  email:         string;
  phone:         string;
  bio:           string | null;
  licenseNumber: string | null;
  serviceArea:   string | null;
  trustScore:    number;
  jobsCompleted: number;
  isVerified:    boolean;
  createdAt:     number;   // ms
  rating?:       number;   // average from reviews; computed client-side
}

export interface RegisterContractorArgs {
  name:      string;
  specialty: string;
  email:     string;
  phone:     string;
}

export interface UpdateContractorArgs {
  name:          string;
  specialty:     string;
  email:         string;
  phone:         string;
  bio:           string | null;
  licenseNumber: string | null;
  serviceArea:   string | null;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_CONTRACTORS: ContractorProfile[] = [];

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: CONTRACTOR_CANISTER_ID });
  }
  return _actor;
}

// ─── Converters ───────────────────────────────────────────────────────────────

function fromProfile(raw: any): ContractorProfile {
  return {
    id:            raw.id.toText(),
    name:          raw.name,
    specialty:     Object.keys(raw.specialty)[0],
    email:         raw.email,
    phone:         raw.phone,
    bio:           raw.bio[0] ?? null,
    licenseNumber: raw.licenseNumber[0] ?? null,
    serviceArea:   raw.serviceArea[0] ?? null,
    trustScore:    Number(raw.trustScore),
    jobsCompleted: Number(raw.jobsCompleted),
    isVerified:    raw.isVerified,
    createdAt:     Number(raw.createdAt) / 1_000_000,
  };
}

function unwrap(result: any): ContractorProfile {
  if ("ok" in result) return fromProfile(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const contractorService = {
  async search(specialty?: string): Promise<ContractorProfile[]> {
    if (!CONTRACTOR_CANISTER_ID) {
      return specialty
        ? MOCK_CONTRACTORS.filter((c) => c.specialty === specialty)
        : [...MOCK_CONTRACTORS];
    }
    const a = await getActor();
    const all = (await a.getAll() as any[]).map(fromProfile);
    return specialty ? all.filter((c) => c.specialty === specialty) : all;
  },

  async getTopRated(): Promise<ContractorProfile[]> {
    if (!CONTRACTOR_CANISTER_ID) {
      return [...MOCK_CONTRACTORS].sort((a, b) => b.trustScore - a.trustScore);
    }
    const a = await getActor();
    const all = (await a.getAll() as any[]).map(fromProfile);
    return all.sort((a, b) => b.trustScore - a.trustScore);
  },

  async getMyProfile(): Promise<ContractorProfile | null> {
    if (!CONTRACTOR_CANISTER_ID) return MOCK_CONTRACTORS[0] ?? null;
    const a = await getActor();
    const result = await a.getMyProfile();
    if ("err" in result) return null;
    return fromProfile(result.ok);
  },

  async getContractor(principalText: string): Promise<ContractorProfile | null> {
    if (!CONTRACTOR_CANISTER_ID) {
      return MOCK_CONTRACTORS.find((c) => c.id === principalText) ?? null;
    }
    const a = await getActor();
    const { Principal: P } = await import("@dfinity/principal");
    const result = await a.getContractor(P.fromText(principalText));
    if ("err" in result) return null;
    return fromProfile(result.ok);
  },

  async register(args: RegisterContractorArgs): Promise<ContractorProfile> {
    const a = await getActor();
    return unwrap(await a.register({
      name:      args.name,
      specialty: { [args.specialty]: null },
      email:     args.email,
      phone:     args.phone,
    }));
  },

  async updateProfile(args: UpdateContractorArgs): Promise<ContractorProfile> {
    const a = await getActor();
    return unwrap(await a.updateProfile({
      name:          args.name,
      specialty:     { [args.specialty]: null },
      email:         args.email,
      phone:         args.phone,
      bio:           args.bio           ? [args.bio]           : [],
      licenseNumber: args.licenseNumber ? [args.licenseNumber] : [],
      serviceArea:   args.serviceArea   ? [args.serviceArea]   : [],
    }));
  },

  async submitReview(contractorPrincipalText: string, rating: number, comment: string, jobId: string): Promise<void> {
    if (!CONTRACTOR_CANISTER_ID) {
      // Mock: no-op in dev
      return;
    }
    const a = await getActor();
    const { Principal: P } = await import("@dfinity/principal");
    const result = await a.submitReview(P.fromText(contractorPrincipalText), BigInt(rating), comment, jobId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  reset() {
    _actor = null;
  },
};
