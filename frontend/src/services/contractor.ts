import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const CONTRACTOR_CANISTER_ID = (process.env as any).CONTRACTOR_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const ServiceType = IDL.Variant({
    Roofing: IDL.Null, HVAC: IDL.Null, Plumbing: IDL.Null, Electrical: IDL.Null,
    Painting: IDL.Null, Flooring: IDL.Null, Windows: IDL.Null, Landscaping: IDL.Null,
    Gutters: IDL.Null, GeneralHandyman: IDL.Null, Pest: IDL.Null, Concrete: IDL.Null,
    Fencing: IDL.Null, Insulation: IDL.Null, Solar: IDL.Null, Pool: IDL.Null,
  });
  const ContractorProfile = IDL.Record({
    id:            IDL.Principal,
    name:          IDL.Text,
    specialties:   IDL.Vec(ServiceType),
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
    name:        IDL.Text,
    specialties: IDL.Vec(ServiceType),
    email:       IDL.Text,
    phone:       IDL.Text,
  });
  const UpdateArgs = IDL.Record({
    name:          IDL.Text,
    specialties:   IDL.Vec(ServiceType),
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
    getBySpecialty: IDL.Func([ServiceType], [IDL.Vec(ContractorProfile)], ["query"]),
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
      [IDL.Principal, IDL.Text, IDL.Text, IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getCredentials: IDL.Func(
      [IDL.Principal],
      [IDL.Vec(IDL.Record({
        id:                 IDL.Nat,
        jobId:              IDL.Text,
        contractorId:       IDL.Principal,
        serviceType:        IDL.Text,
        verifiedAt:         IDL.Int,
        homeownerPrincipal: IDL.Principal,
      }))],
      ["query"]
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
  specialties:   string[];
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

export interface JobCredential {
  id:                 number;
  jobId:              string;
  contractorId:       string;   // principal text
  serviceType:        string;
  verifiedAt:         number;   // ms
  homeownerPrincipal: string;   // principal text
}

export interface RegisterContractorArgs {
  name:        string;
  specialties: string[];
  email:       string;
  phone:       string;
}

export interface UpdateContractorArgs {
  name:          string;
  specialties:   string[];
  email:         string;
  phone:         string;
  bio:           string | null;
  licenseNumber: string | null;
  serviceArea:   string | null;
}

// ─── Converters ───────────────────────────────────────────────────────────────

function fromProfile(raw: any): ContractorProfile {
  return {
    id:            raw.id.toText(),
    name:          raw.name,
    specialties:   (raw.specialties as any[]).map((s: any) => Object.keys(s)[0]),
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

// ─── Service factory ──────────────────────────────────────────────────────────

function createContractorService() {
  let _actor: any = null;
  const mockContractors: ContractorProfile[] = [];

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: CONTRACTOR_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async search(specialty?: string): Promise<ContractorProfile[]> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      const e2e = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_contractors;
      const source: ContractorProfile[] = e2e ? (e2e as ContractorProfile[]) : mockContractors;
      return specialty ? source.filter((c) => c.specialties.includes(specialty)) : [...source];
    }
    const a = await getActor();
    const all = (await a.getAll() as any[]).map(fromProfile);
    return specialty ? all.filter((c) => c.specialties.includes(specialty)) : all;
  },

  async getTopRated(): Promise<ContractorProfile[]> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      const e2e = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_contractors;
      const source: ContractorProfile[] = e2e ? (e2e as ContractorProfile[]) : mockContractors;
      return [...source].sort((a, b) => b.trustScore - a.trustScore);
    }
    const a = await getActor();
    const all = (await a.getAll() as any[]).map(fromProfile);
    return all.sort((a, b) => b.trustScore - a.trustScore);
  },

  async getMyProfile(): Promise<ContractorProfile | null> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      const e2e = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_contractors;
      if (e2e) return (e2e as ContractorProfile[])[0] ?? null;
      return mockContractors[0] ?? null;
    }
    const a = await getActor();
    const result = await a.getMyProfile();
    if ("err" in result) return null;
    return fromProfile(result.ok);
  },

  async getContractor(principalText: string): Promise<ContractorProfile | null> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      const fromMock = mockContractors.find((c) => c.id === principalText);
      if (fromMock) return fromMock;
      // Playwright e2e injection
      const e2eContractors = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_contractors;
      if (e2eContractors) {
        const raw = (e2eContractors as any[]).find((c) => c.principal === principalText);
        if (raw) return {
          id:            raw.principal,
          name:          raw.name,
          specialties:   Array.isArray(raw.specialties) ? raw.specialties : (raw.specialty ? [raw.specialty] : []),
          email:         raw.email ?? "",
          phone:         raw.phone ?? "",
          bio:           raw.bio ?? null,
          licenseNumber: raw.licenseNumber ?? null,
          serviceArea:   raw.serviceArea ?? null,
          trustScore:    raw.trustScore ?? 0,
          jobsCompleted: raw.jobsCompleted ?? 0,
          isVerified:    raw.isVerified ?? false,
          createdAt:     raw.createdAt ?? 0,
        };
      }
      return null;
    }
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.getContractor(P.fromText(principalText));
    if ("err" in result) return null;
    return fromProfile(result.ok);
  },

  async register(args: RegisterContractorArgs): Promise<ContractorProfile> {
    const a = await getActor();
    return unwrap(await a.register({
      name:        args.name,
      specialties: args.specialties.map((s) => ({ [s]: null })),
      email:       args.email,
      phone:       args.phone,
    }));
  },

  async updateProfile(args: UpdateContractorArgs): Promise<ContractorProfile> {
    const a = await getActor();
    return unwrap(await a.updateProfile({
      name:          args.name,
      specialties:   args.specialties.map((s) => ({ [s]: null })),
      email:         args.email,
      phone:         args.phone,
      bio:           args.bio           ? [args.bio]           : [],
      licenseNumber: args.licenseNumber ? [args.licenseNumber] : [],
      serviceArea:   args.serviceArea   ? [args.serviceArea]   : [],
    }));
  },

  async submitReview(contractorPrincipalText: string, rating: number, comment: string, jobId: string): Promise<void> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      // Mock: no-op in dev
      return;
    }
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.submitReview(P.fromText(contractorPrincipalText), BigInt(rating), comment, jobId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  async getCredentials(contractorPrincipalText: string): Promise<JobCredential[]> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      // Mock: return empty portfolio in dev
      return [];
    }
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const raw = await a.getCredentials(P.fromText(contractorPrincipalText)) as any[];
    return raw.map((c: any) => ({
      id:                 Number(c.id),
      jobId:              c.jobId,
      contractorId:       c.contractorId.toText(),
      serviceType:        c.serviceType,
      verifiedAt:         Number(c.verifiedAt) / 1_000_000,
      homeownerPrincipal: c.homeownerPrincipal.toText(),
    }));
  },

  async getBySpecialty(specialty: string): Promise<ContractorProfile[]> {
    if (import.meta.env.DEV && !CONTRACTOR_CANISTER_ID) {
      return mockContractors.filter((c) => c.specialties.includes(specialty));
    }
    const a = await getActor();
    const result = await a.getBySpecialty({ [specialty]: null }) as any[];
    return result.map(fromProfile);
  },

  reset() {
    _actor = null;
    mockContractors.length = 0;
  },
  };
}

export const contractorService = createContractorService();
