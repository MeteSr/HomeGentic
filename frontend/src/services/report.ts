/**
 * Report service — generates HomeGentic share links and fetches report snapshots.
 * Wired to the report canister; falls back to an in-memory store when
 * REPORT_CANISTER_ID is not set (local dev without dfx).
 */

import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";
import { Job } from "./job";
import type { Property } from "./property";
import type { RecurringServiceSummary } from "./recurringService";
import type { Room } from "./room";

const REPORT_CANISTER_ID = (process.env as any).REPORT_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const VisibilityLevel = IDL.Variant({ Public: IDL.Null, BuyerOnly: IDL.Null });

  const JobInput = IDL.Record({
    serviceType:    IDL.Text,
    description:    IDL.Text,
    contractorName: IDL.Opt(IDL.Text),
    amountCents:    IDL.Nat,
    date:           IDL.Text,
    isDiy:          IDL.Bool,
    permitNumber:   IDL.Opt(IDL.Text),
    warrantyMonths: IDL.Opt(IDL.Nat),
    isVerified:     IDL.Bool,
    status:         IDL.Text,
  });

  const PropertyInput = IDL.Record({
    address:           IDL.Text,
    city:              IDL.Text,
    state:             IDL.Text,
    zipCode:           IDL.Text,
    propertyType:      IDL.Text,
    yearBuilt:         IDL.Nat,
    squareFeet:        IDL.Nat,
    verificationLevel: IDL.Text,
  });

  const RecurringServiceInput = IDL.Record({
    serviceType:   IDL.Text,
    providerName:  IDL.Text,
    frequency:     IDL.Text,
    status:        IDL.Text,
    startDate:     IDL.Text,
    lastVisitDate: IDL.Opt(IDL.Text),
    totalVisits:   IDL.Nat,
  });

  const RoomInput = IDL.Record({
    name:         IDL.Text,
    floorType:    IDL.Text,
    paintColor:   IDL.Text,
    paintBrand:   IDL.Text,
    paintCode:    IDL.Text,
    fixtureCount: IDL.Nat,
  });

  const ReportSnapshot = IDL.Record({
    snapshotId:        IDL.Text,
    propertyId:        IDL.Text,
    generatedBy:       IDL.Principal,
    address:           IDL.Text,
    city:              IDL.Text,
    state:             IDL.Text,
    zipCode:           IDL.Text,
    propertyType:      IDL.Text,
    yearBuilt:         IDL.Nat,
    squareFeet:        IDL.Nat,
    verificationLevel: IDL.Text,
    jobs:              IDL.Vec(JobInput),
    recurringServices: IDL.Vec(RecurringServiceInput),
    rooms:             IDL.Opt(IDL.Vec(RoomInput)),
    totalAmountCents:  IDL.Nat,
    verifiedJobCount:  IDL.Nat,
    diyJobCount:       IDL.Nat,
    permitCount:       IDL.Nat,
    generatedAt:       IDL.Int,
    planTier:          IDL.Text,
  });

  const ShareLink = IDL.Record({
    token:      IDL.Text,
    snapshotId: IDL.Text,
    propertyId: IDL.Text,
    createdBy:  IDL.Principal,
    expiresAt:  IDL.Opt(IDL.Int),
    visibility: VisibilityLevel,
    viewCount:  IDL.Nat,
    isActive:   IDL.Bool,
    createdAt:  IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:            IDL.Null,
    Expired:             IDL.Null,
    Revoked:             IDL.Null,
    Unauthorized:        IDL.Null,
    InvalidInput:        IDL.Text,
    UnverifiedProperty:  IDL.Null,
  });

  return IDL.Service({
    // Params 1-6 match the original interface; 7-11 are new trailing opt args.
    generateReport: IDL.Func(
      [IDL.Text, PropertyInput, IDL.Vec(JobInput), IDL.Vec(RecurringServiceInput),
       IDL.Opt(IDL.Nat), VisibilityLevel,
       IDL.Opt(IDL.Vec(RoomInput)), IDL.Opt(IDL.Bool), IDL.Opt(IDL.Bool), IDL.Opt(IDL.Bool), IDL.Opt(IDL.Bool)],
      [IDL.Variant({ ok: ShareLink, err: Error })],
      []
    ),
    // getReport returns a tuple (ShareLink, ReportSnapshot) on success
    getReport: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Tuple(ShareLink, ReportSnapshot), err: Error })],
      []
    ),
    listShareLinks: IDL.Func([IDL.Text], [IDL.Vec(ShareLink)], []),
    revokeShareLink: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export interface JobInput {
  serviceType:    string;
  description:    string;
  contractorName: string | undefined;
  amountCents:    number;
  date:           string;
  completedYear?: number;
  isDiy:          boolean;
  permitNumber:   string | undefined;
  warrantyMonths: number | undefined;
  isVerified:     boolean;
  status:         string;
}

export interface PropertyInput {
  address:           string;
  city:              string;
  state:             string;
  zipCode:           string;
  propertyType:      string;
  yearBuilt:         number;
  squareFeet:        number;
  verificationLevel: string;
}

export type VisibilityLevel = "Public" | "BuyerOnly";

/**
 * Field-level disclosure options encoded as URL query params on the share link.
 * The canister stores the full record; these flags let sellers control what
 * a buyer can see without needing canister-level changes.
 */
export interface DisclosureOptions {
  hideAmounts:      boolean;
  hideContractors:  boolean;
  hidePermits:      boolean;
  hideDescriptions: boolean;
}

export function disclosureFromParams(params: URLSearchParams): DisclosureOptions {
  return {
    hideAmounts:      params.get("ha") === "1",
    hideContractors:  params.get("hc") === "1",
    hidePermits:      params.get("hp") === "1",
    hideDescriptions: params.get("hd") === "1",
  };
}

export interface RoomInput {
  name:         string;
  floorType:    string;
  paintColor:   string;
  paintBrand:   string;
  paintCode:    string;
  fixtureCount: number;
}

export interface ReportSnapshot {
  snapshotId:        string;
  propertyId:        string;
  generatedBy:       string;
  address:           string;
  city:              string;
  state:             string;
  zipCode:           string;
  propertyType:      string;
  yearBuilt:         number;
  squareFeet:        number;
  verificationLevel: string;
  jobs:              JobInput[];
  recurringServices: RecurringServiceSummary[];
  rooms:             RoomInput[];
  totalAmountCents:  number;
  verifiedJobCount:  number;
  diyJobCount:       number;
  permitCount:       number;
  generatedAt:       number;   // ms timestamp
  planTier:          string;   // "Free" | "Pro" | "Premium" | "ContractorPro"; "" treated as "Free"
}

export interface ShareLink {
  token:      string;
  snapshotId: string;
  propertyId: string;
  createdBy:  string;
  expiresAt:  number | null;   // ms timestamp, null = never
  visibility: VisibilityLevel;
  viewCount:  number;
  isActive:   boolean;
  createdAt:  number;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

export function jobToInput(job: Job): JobInput {
  return {
    serviceType:    job.serviceType,
    description:    job.description,
    contractorName: job.contractorName,
    amountCents:    job.amount,
    date:           job.date,
    completedYear:  parseInt(job.date.split("-")[0], 10),
    isDiy:          job.isDiy,
    permitNumber:   job.permitNumber,
    warrantyMonths: job.warrantyMonths,
    isVerified:     job.verified ?? job.status === "verified",
    status:         job.status,
  };
}

export function roomToInput(r: Room): RoomInput {
  return {
    name:         r.name,
    floorType:    r.floorType,
    paintColor:   r.paintColor,
    paintBrand:   r.paintBrand,
    paintCode:    r.paintCode,
    fixtureCount: r.fixtures.length,
  };
}

export function propertyToInput(p: Property): PropertyInput {
  return {
    address:           p.address,
    city:              p.city,
    state:             p.state,
    zipCode:           p.zipCode,
    propertyType:      String(p.propertyType),
    yearBuilt:         Number(p.yearBuilt),
    squareFeet:        Number(p.squareFeet),
    verificationLevel: p.verificationLevel,
  };
}

// ─── Converters ───────────────────────────────────────────────────────────────

function fromShareLink(raw: any): ShareLink {
  const expiresNs = raw.expiresAt[0];
  return {
    token:      raw.token,
    snapshotId: raw.snapshotId,
    propertyId: raw.propertyId,
    createdBy:  raw.createdBy.toText(),
    expiresAt:  expiresNs != null ? Number(expiresNs) / 1_000_000 : null,
    visibility: Object.keys(raw.visibility)[0] as VisibilityLevel,
    viewCount:  Number(raw.viewCount),
    isActive:   raw.isActive,
    createdAt:  Number(raw.createdAt) / 1_000_000,
  };
}

function fromSnapshot(raw: any): ReportSnapshot {
  return {
    snapshotId:        raw.snapshotId,
    propertyId:        raw.propertyId,
    generatedBy:       raw.generatedBy.toText(),
    address:           raw.address,
    city:              raw.city,
    state:             raw.state,
    zipCode:           raw.zipCode,
    propertyType:      raw.propertyType,
    yearBuilt:         Number(raw.yearBuilt),
    squareFeet:        Number(raw.squareFeet),
    verificationLevel: raw.verificationLevel,
    jobs:              (raw.jobs as any[]).map((j: any) => ({
      serviceType:    j.serviceType,
      description:    j.description,
      contractorName: j.contractorName[0] ?? undefined,
      amountCents:    Number(j.amountCents),
      date:           j.date,
      isDiy:          j.isDiy,
      permitNumber:   j.permitNumber[0] ?? undefined,
      warrantyMonths: j.warrantyMonths[0] !== undefined ? Number(j.warrantyMonths[0]) : undefined,
      isVerified:     j.isVerified,
      status:         j.status,
    })),
    recurringServices: (raw.recurringServices as any[]).map((r: any) => ({
      serviceType:   r.serviceType,
      providerName:  r.providerName,
      frequency:     r.frequency,
      status:        r.status,
      startDate:     r.startDate,
      lastVisitDate: r.lastVisitDate[0] ?? undefined,
      totalVisits:   Number(r.totalVisits),
    })),
    rooms: ((raw.rooms?.[0] ?? []) as any[]).map((r: any) => ({
      name:         r.name,
      floorType:    r.floorType,
      paintColor:   r.paintColor,
      paintBrand:   r.paintBrand,
      paintCode:    r.paintCode,
      fixtureCount: Number(r.fixtureCount),
    })),
    totalAmountCents:  Number(raw.totalAmountCents),
    verifiedJobCount:  Number(raw.verifiedJobCount),
    diyJobCount:       Number(raw.diyJobCount),
    permitCount:       Number(raw.permitCount),
    generatedAt:       Number(raw.generatedAt) / 1_000_000,
    planTier:          raw.planTier || "Free",
  };
}

function jobInputToCanister(j: JobInput) {
  return {
    serviceType:    j.serviceType,
    description:    j.description,
    contractorName: j.contractorName ? [j.contractorName] : [],
    amountCents:    BigInt(j.amountCents),
    date:           j.date,
    isDiy:          j.isDiy,
    permitNumber:   j.permitNumber   ? [j.permitNumber]   : [],
    warrantyMonths: j.warrantyMonths ? [BigInt(j.warrantyMonths)] : [],
    isVerified:     j.isVerified,
    status:         j.status,
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createReportService() {
  let _actor: any = null;
  let mockCounter = 0;
  const mockSnapshots = new Map<string, ReportSnapshot>();
  const mockLinks     = new Map<string, ShareLink>();

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: REPORT_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async generateReport(
    propertyId:        string,
    property:          PropertyInput,
    jobs:              JobInput[],
    recurringServices: RecurringServiceSummary[],
    rooms:             RoomInput[],
    expiryDays:        number | null,
    visibility:        VisibilityLevel
  ): Promise<ShareLink> {
    if (!REPORT_CANISTER_ID) {
      mockCounter++;
      const now        = Date.now();
      const snapshotId = `SNAP_${mockCounter}_${now}`;
      const token      = `RPT_${mockCounter}_${now}`;
      const snapshot: ReportSnapshot = {
        snapshotId, propertyId, generatedBy: "local",
        address:           property.address,
        city:              property.city,
        state:             property.state,
        zipCode:           property.zipCode,
        propertyType:      property.propertyType,
        yearBuilt:         property.yearBuilt,
        squareFeet:        property.squareFeet,
        verificationLevel: property.verificationLevel,
        jobs,
        recurringServices,
        rooms,
        totalAmountCents:  jobs.reduce((s, j) => s + j.amountCents, 0),
        verifiedJobCount:  jobs.filter((j) => j.isVerified).length,
        diyJobCount:       jobs.filter((j) => j.isDiy).length,
        permitCount:       jobs.filter((j) => j.permitNumber).length,
        generatedAt:       now,
        planTier:          "Free",
      };
      mockSnapshots.set(snapshotId, snapshot);
      const link: ShareLink = {
        token, snapshotId, propertyId, createdBy: "local",
        expiresAt:  expiryDays ? now + expiryDays * 86_400_000 : null,
        visibility, viewCount: 0, isActive: true, createdAt: now,
      };
      mockLinks.set(token, link);
      return link;
    }

    const a = await getActor();
    const result = await a.generateReport(
      propertyId,
      {
        address:           property.address,
        city:              property.city,
        state:             property.state,
        zipCode:           property.zipCode,
        propertyType:      property.propertyType,
        yearBuilt:         BigInt(property.yearBuilt),
        squareFeet:        BigInt(property.squareFeet),
        verificationLevel: property.verificationLevel,
      },
      jobs.map(jobInputToCanister),
      recurringServices.map((r) => ({
        serviceType:   r.serviceType,
        providerName:  r.providerName,
        frequency:     r.frequency,
        status:        r.status,
        startDate:     r.startDate,
        lastVisitDate: r.lastVisitDate ? [r.lastVisitDate] : [],
        totalVisits:   BigInt(r.totalVisits),
      })),
      expiryDays ? [BigInt(expiryDays)] : [],
      { [visibility]: null },
      // Trailing opt params (new in 1.4.7 — old callers omit these)
      rooms.length > 0 ? [rooms.map((r) => ({
        name:         r.name,
        floorType:    r.floorType,
        paintColor:   r.paintColor,
        paintBrand:   r.paintBrand,
        paintCode:    r.paintCode,
        fixtureCount: BigInt(r.fixtureCount),
      }))] : [],
      [false], [false], [false], [false]   // hideAmounts, hideContractors, hidePermits, hideDescriptions
    );
    if ("ok" in result) return fromShareLink(result.ok);
    const key = Object.keys(result.err)[0];
    if (key === "UnverifiedProperty") throw new Error("Property must be verified (Basic or Premium) before generating a shareable report.");
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getReport(token: string): Promise<{ link: ShareLink; snapshot: ReportSnapshot }> {
    if (!REPORT_CANISTER_ID) {
      const link = mockLinks.get(token);
      if (!link)         throw new Error("Report not found");
      if (!link.isActive) throw new Error("This report link has been revoked");
      if (link.expiresAt && Date.now() > link.expiresAt) throw new Error("This report link has expired");
      const snapshot = mockSnapshots.get(link.snapshotId);
      if (!snapshot) throw new Error("Snapshot not found");
      mockLinks.set(token, { ...link, viewCount: link.viewCount + 1 });
      return { link, snapshot };
    }

    const a = await getActor();
    const result = await a.getReport(token);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      if (key === "Expired")  throw new Error("This report link has expired");
      if (key === "Revoked")  throw new Error("This report link has been revoked");
      if (key === "NotFound") throw new Error("Report not found");
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
    // ok value is a tuple: [ShareLink, ReportSnapshot]
    const [rawLink, rawSnapshot] = result.ok as [any, any];
    return { link: fromShareLink(rawLink), snapshot: fromSnapshot(rawSnapshot) };
  },

  async listShareLinks(propertyId: string): Promise<ShareLink[]> {
    if (!REPORT_CANISTER_ID) {
      return Array.from(mockLinks.values()).filter((l) => l.propertyId === propertyId);
    }
    const a = await getActor();
    return (await a.listShareLinks(propertyId) as any[]).map(fromShareLink);
  },

  async revokeShareLink(token: string): Promise<void> {
    if (!REPORT_CANISTER_ID) {
      const link = mockLinks.get(token);
      if (!link) throw new Error("Link not found");
      mockLinks.set(token, { ...link, isActive: false });
      return;
    }
    const a = await getActor();
    const result = await a.revokeShareLink(token);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  shareUrl(token: string, options?: Partial<DisclosureOptions>): string {
    const base = `${window.location.origin}/report/${token}`;
    if (!options) return base;
    const p = new URLSearchParams();
    if (options.hideAmounts)      p.set("ha", "1");
    if (options.hideContractors)  p.set("hc", "1");
    if (options.hidePermits)      p.set("hp", "1");
    if (options.hideDescriptions) p.set("hd", "1");
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  },

  expiryLabel(link: ShareLink): string {
    if (!link.expiresAt) return "Never expires";
    const ms = link.expiresAt - Date.now();
    if (ms <= 0) return "Expired";
    const days = Math.ceil(ms / 86_400_000);
    return `Expires in ${days} day${days !== 1 ? "s" : ""}`;
  },

  reset() {
    _actor = null;
    mockCounter = 0;
    mockSnapshots.clear();
    mockLinks.clear();
  },
  };
}

export const reportService = createReportService();
