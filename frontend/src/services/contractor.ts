import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/contractor";
import { serviceTypeVariant, serviceTypeFromVariant, serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import { voiceAgentFetch } from "./voiceAgentHeaders";
export { idlFactory };

const CONTRACTOR_CANISTER_ID = (process.env as any).CONTRACTOR_CANISTER_ID || "";
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

// ─── TypeScript types ─────────────────────────────────────────────────────────

/** Provenance of a profile — see #518. Informational only; does not affect
 *  isVerified, trustScore, or any scoring/matching logic. */
export type ContractorOrigin =
  | { type: "SelfRegistered" }
  | { type: "GuestSigned"; jobId: string };

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
  origin:        ContractorOrigin;
  /** Push alerts for new leads in the contractor's trades (all their devices). */
  notifyPush?:   boolean;
  notifyEmail?:  string | null;
  alertZips?:    string[];
}

/** Settings → Privacy. `listed` keeps the profile in the directory; the other
 *  two say whether the public profile and directory card show those numbers. */
export interface ProfilePrivacy {
  listed:            boolean;
  showTrustScore:    boolean;
  showJobsCompleted: boolean;
}

export const DEFAULT_PROFILE_PRIVACY: ProfilePrivacy = { listed: true, showTrustScore: true, showJobsCompleted: true };

export interface JobCredential {
  id:                 number;
  jobId:              string;
  contractorId:       string;   // principal text
  serviceType:        string;
  verifiedAt:         number;   // ms
  homeownerPrincipal: string;   // principal text
}

/**
 * What Florida DBPR's licensee file said about the contractor's licence
 * number the last time they checked it (agents/voice/src/dbpr.ts). Only
 * returned while the profile still carries that number.
 */
export interface LicenseCheck {
  licenseNumber: string;
  found:         boolean;
  licenseeName:  string;
  dbaName:       string;
  licenseType:   string;
  status:        string;   // DBPR's primary and secondary status, e.g. "Current, Active"
  active:        boolean;
  expiresOn:     string;   // YYYY-MM-DD
  nameMatches:   boolean;  // the licensee or DBA name matches the profile name
  sourceDate:    string;   // date of DBPR's file, "" when unknown
  checkedAt:     number;   // ms
}

function fromLicenseCheck(raw: any): LicenseCheck {
  return {
    licenseNumber: raw.licenseNumber, found: raw.found, licenseeName: raw.licenseeName, dbaName: raw.dbaName,
    licenseType: raw.licenseType, status: raw.status, active: raw.active, expiresOn: raw.expiresOn,
    nameMatches: raw.nameMatches, sourceDate: raw.sourceDate,
    checkedAt: typeof raw.checkedAt === "bigint" ? Number(raw.checkedAt) / 1_000_000 : raw.checkedAt,
  };
}

/** E2E: window.__e2e_license_checks (LicenseCheck by principal text) replaces the canister and the Worker. */
function mockLicenseChecks(): Record<string, LicenseCheck> | null {
  return typeof window !== "undefined" ? ((window as any).__e2e_license_checks ?? null) : null;
}

/** A co-signed job a ContractorPro contractor features on their public profile. */
export interface PortfolioItem {
  credentialId: number;
  title:        string;
  description:  string;
  serviceType:  string;
  verifiedAt:   number;   // ms
  featuredAt:   number;   // ms
}

export interface PortfolioInput { credentialId: number; title: string; description: string }

function fromPortfolioItem(raw: any): PortfolioItem {
  return {
    credentialId: Number(raw.credentialId), title: raw.title, description: raw.description,
    serviceType: serviceTypeLabel(raw.serviceType),
    verifiedAt: Number(raw.verifiedAt) / 1_000_000, featuredAt: Number(raw.featuredAt) / 1_000_000,
  };
}

/** E2E: window.__e2e_portfolios (PortfolioItem[] by principal text) replaces the canister. */
function mockPortfolios(): Record<string, PortfolioItem[]> | null {
  return typeof window !== "undefined" ? ((window as any).__e2e_portfolios ?? null) : null;
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
    specialties:   (raw.specialties as any[]).map(serviceTypeFromVariant),
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
    origin:        "SelfRegistered" in raw.origin
      ? { type: "SelfRegistered" }
      : { type: "GuestSigned", jobId: raw.origin.GuestSigned },
    notifyPush:    raw.notifyPush?.[0] === true,
    notifyEmail:   raw.notifyEmail?.[0] ?? null,
    alertZips:     (raw.alertZips as string[] | undefined) ?? [],
  };
}

function fromPrivacy(raw: any): ProfilePrivacy {
  return { listed: raw.listed, showTrustScore: raw.showTrustScore, showJobsCompleted: raw.showJobsCompleted };
}

/** E2E tests and an undeployed canister keep privacy settings here. */
function mockPrivacy(): Record<string, ProfilePrivacy> {
  const w = (typeof window !== "undefined" ? window : globalThis) as any;
  return (w.__e2e_contractor_privacy ??= {});
}

function isMockMode(): boolean {
  return (typeof window !== "undefined" && !!(window as any).__e2e_contractors) || !CONTRACTOR_CANISTER_ID;
}

function unwrap(result: any): ContractorProfile {
  if ("ok" in result) return fromProfile(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createContractorService() {

  const getActor = lazyActor(idlFactory, CONTRACTOR_CANISTER_ID);

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
    const profile = fromProfile(result.ok);
    // Profile reads blank the email for anyone who hasn't worked with the
    // contractor; getContractorEmail returns it to those who have (a job
    // logged with them, or a bid on a request that's no longer open).
    if (!profile.email) {
      try {
        const email = await a.getContractorEmail(principal);
        if ("ok" in email) profile.email = email.ok;
      } catch { /* leave it blank */ }
    }
    return profile;
  },

  async register(args: RegisterContractorArgs): Promise<ContractorProfile> {
    const a = await getActor();
    return unwrap(await a.register({
      name:        args.name,
      specialties: args.specialties.map(serviceTypeVariant),
      email:       args.email,
      phone:       args.phone,
    }));
  },

  async updateProfile(args: UpdateContractorArgs): Promise<ContractorProfile> {
    const a = await getActor();
    return unwrap(await a.updateProfile({
      name:          args.name,
      specialties:   args.specialties.map(serviceTypeVariant),
      email:         args.email,
      phone:         args.phone,
      bio:           args.bio           ? [args.bio]           : [],
      licenseNumber: args.licenseNumber ? [args.licenseNumber] : [],
      serviceArea:   args.serviceArea   ? [args.serviceArea]   : [],
      serviceZips:   args.serviceZips,
    }));
  },

  /** Turn new-lead push alerts on or off, keeping the other notification prefs. */
  async setLeadPushAlerts(enabled: boolean): Promise<ContractorProfile> {
    const a = await getActor();
    const current = await a.getMyProfile();
    if ("err" in current) throw new Error("Create your contractor profile first");
    return unwrap(await a.updateNotificationPrefs({
      notifyEmail: current.ok.notifyEmail,
      notifyPush:  [enabled],
      alertZips:   current.ok.alertZips,
    }));
  },

  async getMyProfilePrivacy(): Promise<ProfilePrivacy> {
    if (isMockMode()) return mockPrivacy().me ?? DEFAULT_PROFILE_PRIVACY;
    const a = await getActor();
    return fromPrivacy(await a.getMyProfilePrivacy());
  },

  async setProfilePrivacy(p: ProfilePrivacy): Promise<ProfilePrivacy> {
    if (isMockMode()) return (mockPrivacy().me = { ...p });
    const a = await getActor();
    const result = await a.setProfilePrivacy(p);
    if ("ok" in result) return fromPrivacy(result.ok);
    const key = Object.keys(result.err)[0];
    if (key === "NotFound") throw new Error("Create your contractor profile first");
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Privacy settings for each contractor, keyed by principal text. */
  async getProfilePrivacies(principalTexts: string[]): Promise<Record<string, ProfilePrivacy>> {
    if (principalTexts.length === 0) return {};
    if (isMockMode()) {
      const m = mockPrivacy();
      return Object.fromEntries(principalTexts.map((id) => [id, m[id] ?? DEFAULT_PROFILE_PRIVACY]));
    }
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    const raw = await a.getProfilePrivacies(principalTexts.map((id) => P.fromText(id))) as any[];
    return Object.fromEntries(principalTexts.map((id, i) => [id, raw[i] ? fromPrivacy(raw[i]) : DEFAULT_PROFILE_PRIVACY]));
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
    const mock = typeof window !== "undefined" ? (window as any).__e2e_credentials : undefined;
    if (mock) return mock[contractorPrincipalText] ?? [];
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const raw = await a.getCredentials(P.fromText(contractorPrincipalText)) as any[];
    return raw.map((c: any) => ({
      id:                 Number(c.id),
      jobId:              c.jobId,
      contractorId:       c.contractorId.toText(),
      serviceType:        serviceTypeLabel(c.serviceType),
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
    const result = await a.getBySpecialty(serviceTypeVariant(specialty)) as any[];
    return result.map(fromProfile);
  },

  /** A contractor's featured jobs, in their order. */
  async getPortfolio(principalText: string): Promise<PortfolioItem[]> {
    const mock = mockPortfolios();
    if (mock) return mock[principalText] ?? [];
    if (!CONTRACTOR_CANISTER_ID) return [];
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    return ((await a.getPortfolio(P.fromText(principalText))) as any[]).map(fromPortfolioItem);
  },

  /** Replace the caller's portfolio (ContractorPro only; the canister checks). */
  async setPortfolio(principalText: string, entries: PortfolioInput[]): Promise<PortfolioItem[]> {
    const mock = mockPortfolios();
    if (mock) {
      const creds: JobCredential[] = (window as any).__e2e_credentials?.[principalText] ?? [];
      return (mock[principalText] = entries.map((e) => {
        const c = creds.find((x) => x.id === e.credentialId);
        return { ...e, serviceType: c?.serviceType ?? "", verifiedAt: c?.verifiedAt ?? 0, featuredAt: Date.now() };
      }));
    }
    const a = await getActor();
    const res = await a.setPortfolio(entries.map((e) => ({ ...e, credentialId: BigInt(e.credentialId) })));
    if ("ok" in res) return (res.ok as any[]).map(fromPortfolioItem);
    const key = Object.keys(res.err)[0];
    const val = res.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** The last DBPR lookup of this contractor's current licence number, or null. */
  async getLicenseCheck(principalText: string): Promise<LicenseCheck | null> {
    const mock = mockLicenseChecks();
    if (mock) return mock[principalText] ?? null;
    if (!CONTRACTOR_CANISTER_ID) return null;
    const { Principal: P } = await import("@icp-sdk/core/principal");
    let principal;
    try { principal = P.fromText(principalText); } catch { return null; }
    const a = await getActor();
    const raw = await a.getLicenseCheck(principal) as any[];
    return raw[0] ? fromLicenseCheck(raw[0]) : null;
  },

  /** Look up the caller's licence number in DBPR's file now (once an hour) and record the result. */
  async checkMyLicense(principalText: string): Promise<LicenseCheck> {
    const mock = mockLicenseChecks();
    if (mock) {
      const hit = mock.__next ?? mock[principalText];
      if (!hit) throw new Error("Add a Florida licence number (for example CGC1234567) to your profile first.");
      return (mock[principalText] = { ...hit, checkedAt: Date.now() });
    }
    const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/license/check`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Couldn't check your licence just now.");
    return fromLicenseCheck(body);
  },

  async verifyContractor(principalText: string): Promise<ContractorProfile> {
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    return unwrap(await a.verifyContractor(P.fromText(principalText)));
  },

  reset() {
    getActor.reset();
  },
  };
}

export const contractorService = createContractorService();
