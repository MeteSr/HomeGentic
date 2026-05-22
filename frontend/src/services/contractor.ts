import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/contractor";
export { idlFactory };

const CONTRACTOR_CANISTER_ID = (process.env as any).CONTRACTOR_CANISTER_ID || "";

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
  serviceZips:   string[];
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
  serviceZips:   string[];
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
    serviceZips:   (raw.serviceZips as string[]) ?? [],
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

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: CONTRACTOR_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async search(specialty?: string): Promise<ContractorProfile[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_contractors) {
      const all = (window as any).__e2e_contractors as ContractorProfile[];
      return specialty ? all.filter((c) => c.specialties.includes(specialty)) : all;
    }
    const a = await getActor();
    const all = (await a.getAll() as any[]).map(fromProfile);
    return specialty ? all.filter((c) => c.specialties.includes(specialty)) : all;
  },

  async getTopRated(): Promise<ContractorProfile[]> {
    if (!CONTRACTOR_CANISTER_ID) return [];
    try {
      const a = await getActor();
      const all = (await a.getAll() as any[]).map(fromProfile);
      return all.sort((a, b) => b.trustScore - a.trustScore);
    } catch (err) {
      console.warn("[contractorService] getTopRated failed:", err);
      return [];
    }
  },

  async getMyProfile(): Promise<ContractorProfile | null> {
    if (typeof window !== "undefined" && (window as any).__e2e_contractors) {
      const all = (window as any).__e2e_contractors as ContractorProfile[];
      return all.length > 0 ? all[0] : null;
    }
    if (!CONTRACTOR_CANISTER_ID) return null;
    const a = await getActor();
    const result = await a.getMyProfile();
    if ("err" in result) return null;
    return fromProfile(result.ok);
  },

  async getContractor(principalText: string): Promise<ContractorProfile | null> {
    if (typeof window !== "undefined" && (window as any).__e2e_contractors) {
      const all = (window as any).__e2e_contractors as ContractorProfile[];
      return all.find((c) => c.id === principalText) ?? null;
    }
    if (!CONTRACTOR_CANISTER_ID) return null;
    const { Principal: P } = await import("@icp-sdk/core/principal");
    let principal;
    try {
      principal = P.fromText(principalText);
    } catch {
      return null;
    }
    const a = await getActor();
    const result = await a.getContractor(principal);
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
      serviceZips:   args.serviceZips,
    }));
  },

  async submitReview(contractorPrincipalText: string, rating: number, comment: string, jobId: string): Promise<void> {
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

  async getReviewsForContractor(principalText: string): Promise<{ id: string; rating: number; comment: string; jobId: string; createdAt: number }[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_properties) return [];
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    const raw = await a.getReviewsForContractor(P.fromText(principalText)) as any[];
    return raw.map((r: any) => ({
      id:        r.id,
      rating:    Number(r.rating),
      comment:   r.comment,
      jobId:     r.jobId,
      createdAt: Number(r.createdAt) / 1_000_000,
    }));
  },

  async getBySpecialty(specialty: string): Promise<ContractorProfile[]> {
    const a = await getActor();
    const result = await a.getBySpecialty({ [specialty]: null }) as any[];
    return result.map(fromProfile);
  },

  async verifyContractor(principalText: string): Promise<ContractorProfile> {
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    return unwrap(await a.verifyContractor(P.fromText(principalText)));
  },

  reset() {
    _actor = null;
  },
  };
}

export const contractorService = createContractorService();
