import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const RECURRING_CANISTER_ID = (process.env as any).RECURRING_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const RecurringServiceType = IDL.Variant({
    LawnCare:        IDL.Null,
    PestControl:     IDL.Null,
    PoolMaintenance: IDL.Null,
    GutterCleaning:  IDL.Null,
    PressureWashing: IDL.Null,
    Other:           IDL.Null,
  });

  const Frequency = IDL.Variant({
    Weekly:       IDL.Null,
    BiWeekly:     IDL.Null,
    Monthly:      IDL.Null,
    Quarterly:    IDL.Null,
    SemiAnnually: IDL.Null,
    Annually:     IDL.Null,
  });

  const ServiceStatus = IDL.Variant({
    Active:    IDL.Null,
    Paused:    IDL.Null,
    Cancelled: IDL.Null,
  });

  const RecurringService = IDL.Record({
    id:                 IDL.Text,
    propertyId:         IDL.Text,
    homeowner:          IDL.Principal,
    serviceType:        RecurringServiceType,
    providerName:       IDL.Text,
    providerLicense:    IDL.Opt(IDL.Text),
    providerPhone:      IDL.Opt(IDL.Text),
    frequency:          Frequency,
    startDate:          IDL.Text,
    contractEndDate:    IDL.Opt(IDL.Text),
    notes:              IDL.Opt(IDL.Text),
    status:             ServiceStatus,
    contractDocPhotoId: IDL.Opt(IDL.Text),
    createdAt:          IDL.Int,
  });

  const VisitLog = IDL.Record({
    id:         IDL.Text,
    serviceId:  IDL.Text,
    propertyId: IDL.Text,
    visitDate:  IDL.Text,
    note:       IDL.Opt(IDL.Text),
    createdAt:  IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:         IDL.Null,
    Unauthorized:     IDL.Null,
    InvalidInput:     IDL.Text,
    AlreadyCancelled: IDL.Null,
  });

  return IDL.Service({
    createRecurringService: IDL.Func(
      [
        IDL.Text,              // propertyId
        RecurringServiceType,  // serviceType
        IDL.Text,              // providerName
        IDL.Opt(IDL.Text),     // providerLicense
        IDL.Opt(IDL.Text),     // providerPhone
        Frequency,             // frequency
        IDL.Text,              // startDate
        IDL.Opt(IDL.Text),     // contractEndDate
        IDL.Opt(IDL.Text),     // notes
      ],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      []
    ),
    getRecurringService: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      ["query"]
    ),
    getByProperty: IDL.Func(
      [IDL.Text],
      [IDL.Vec(RecurringService)],
      ["query"]
    ),
    updateStatus: IDL.Func(
      [IDL.Text, ServiceStatus],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      []
    ),
    attachContractDoc: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      []
    ),
    addVisitLog: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Opt(IDL.Text)],
      [IDL.Variant({ ok: VisitLog, err: Error })],
      []
    ),
    getVisitLogs: IDL.Func(
      [IDL.Text],
      [IDL.Vec(VisitLog)],
      ["query"]
    ),
    getMetrics: IDL.Func([], [IDL.Record({
      totalServices:  IDL.Nat,
      activeServices: IDL.Nat,
      pausedServices: IDL.Nat,
      totalVisitLogs: IDL.Nat,
      isPaused:       IDL.Bool,
    })], ["query"]),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type RecurringServiceType =
  | "LawnCare" | "PestControl" | "PoolMaintenance"
  | "GutterCleaning" | "PressureWashing" | "Other";

export type Frequency =
  | "Weekly" | "BiWeekly" | "Monthly"
  | "Quarterly" | "SemiAnnually" | "Annually";

export type ServiceStatus = "Active" | "Paused" | "Cancelled";

export interface RecurringService {
  id:                 string;
  propertyId:         string;
  homeowner:          string;
  serviceType:        RecurringServiceType;
  providerName:       string;
  providerLicense?:   string;
  providerPhone?:     string;
  frequency:          Frequency;
  startDate:          string;   // YYYY-MM-DD
  contractEndDate?:   string;   // YYYY-MM-DD
  notes?:             string;
  status:             ServiceStatus;
  contractDocPhotoId?: string;
  createdAt:          number;   // ms
}

export interface VisitLog {
  id:         string;
  serviceId:  string;
  propertyId: string;
  visitDate:  string;   // YYYY-MM-DD
  note?:      string;
  createdAt:  number;   // ms
}

export interface CreateRecurringServiceInput {
  propertyId:       string;
  serviceType:      RecurringServiceType;
  providerName:     string;
  providerLicense?: string;
  providerPhone?:   string;
  frequency:        Frequency;
  startDate:        string;
  contractEndDate?: string;
  notes?:           string;
}

// For the report snapshot — buyer-facing summary
export interface RecurringServiceSummary {
  serviceType:   string;
  providerName:  string;
  frequency:     string;
  status:        string;
  startDate:     string;
  lastVisitDate?: string;
  totalVisits:   number;
}

// ─── Human-readable labels ────────────────────────────────────────────────────

export const SERVICE_TYPE_LABELS: Record<RecurringServiceType, string> = {
  LawnCare:        "Lawn Care",
  PestControl:     "Pest Control",
  PoolMaintenance: "Pool Maintenance",
  GutterCleaning:  "Gutter Cleaning",
  PressureWashing: "Pressure Washing",
  Other:           "Other",
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  Weekly:       "Weekly",
  BiWeekly:     "Bi-Weekly",
  Monthly:      "Monthly",
  Quarterly:    "Quarterly",
  SemiAnnually: "Semi-Annually",
  Annually:     "Annually",
};

// ─── Converters ───────────────────────────────────────────────────────────────

function fromService(raw: any): RecurringService {
  return {
    id:                 raw.id,
    propertyId:         raw.propertyId,
    homeowner:          raw.homeowner.toText(),
    serviceType:        Object.keys(raw.serviceType)[0] as RecurringServiceType,
    providerName:       raw.providerName,
    providerLicense:    raw.providerLicense[0] ?? undefined,
    providerPhone:      raw.providerPhone[0] ?? undefined,
    frequency:          Object.keys(raw.frequency)[0] as Frequency,
    startDate:          raw.startDate,
    contractEndDate:    raw.contractEndDate[0] ?? undefined,
    notes:              raw.notes[0] ?? undefined,
    status:             Object.keys(raw.status)[0] as ServiceStatus,
    contractDocPhotoId: raw.contractDocPhotoId[0] ?? undefined,
    createdAt:          Number(raw.createdAt) / 1_000_000,
  };
}

function fromVisitLog(raw: any): VisitLog {
  return {
    id:         raw.id,
    serviceId:  raw.serviceId,
    propertyId: raw.propertyId,
    visitDate:  raw.visitDate,
    note:       raw.note[0] ?? undefined,
    createdAt:  Number(raw.createdAt) / 1_000_000,
  };
}

function unwrapService(result: any): RecurringService {
  if ("ok" in result) return fromService(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

function unwrapVisit(result: any): VisitLog {
  if ("ok" in result) return fromVisitLog(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createRecurringService() {
  let _actor: any = null;
  // Seed from Playwright test globals if present (window.__e2e_recurring set by addInitScript)
  const mockServices: RecurringService[] =
    typeof window !== "undefined" && (window as any).__e2e_recurring
      ? [...(window as any).__e2e_recurring]
      : [];
  const mockVisits: VisitLog[] = [];

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: RECURRING_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async getById(serviceId: string): Promise<RecurringService | null> {
    const a = await getActor();
    const result = await a.getRecurringService(serviceId);
    if ("ok" in result) return fromService(result.ok);
    return null;
  },

  async getByProperty(propertyId: string): Promise<RecurringService[]> {
    const a = await getActor();
    return (await a.getByProperty(propertyId) as any[]).map(fromService);
  },

  async create(input: CreateRecurringServiceInput): Promise<RecurringService> {
    const a = await getActor();
    const result = await a.createRecurringService(
      input.propertyId,
      { [input.serviceType]: null },
      input.providerName,
      input.providerLicense ? [input.providerLicense] : [],
      input.providerPhone   ? [input.providerPhone]   : [],
      { [input.frequency]: null },
      input.startDate,
      input.contractEndDate ? [input.contractEndDate] : [],
      input.notes           ? [input.notes]           : [],
    );
    return unwrapService(result);
  },

  async updateStatus(serviceId: string, status: ServiceStatus): Promise<RecurringService> {
    const a = await getActor();
    const result = await a.updateStatus(serviceId, { [status]: null });
    return unwrapService(result);
  },

  async attachContractDoc(serviceId: string, photoId: string): Promise<RecurringService> {
    const a = await getActor();
    const result = await a.attachContractDoc(serviceId, photoId);
    return unwrapService(result);
  },

  async addVisitLog(serviceId: string, visitDate: string, note?: string): Promise<VisitLog> {
    const a = await getActor();
    const result = await a.addVisitLog(serviceId, visitDate, note ? [note] : []);
    return unwrapVisit(result);
  },

  async getVisitLogs(serviceId: string): Promise<VisitLog[]> {
    const a = await getActor();
    return (await a.getVisitLogs(serviceId) as any[]).map(fromVisitLog);
  },

  /** Build a buyer-facing summary for a service + its visit log. */
  toSummary(svc: RecurringService, visits: VisitLog[]): RecurringServiceSummary {
    const sorted = [...visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    return {
      serviceType:   SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType,
      providerName:  svc.providerName,
      frequency:     FREQUENCY_LABELS[svc.frequency] ?? svc.frequency,
      status:        svc.status,
      startDate:     svc.startDate,
      lastVisitDate: sorted[0]?.visitDate,
      totalVisits:   visits.length,
    };
  },

  reset() {
    _actor = null;
    mockServices.length = 0;
    mockVisits.length = 0;
  },
  };
}

export const recurringService = createRecurringService();
