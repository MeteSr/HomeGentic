/**
 * Shared helpers for PocketIC canister upgrade tests.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 * 1. WSL 2 with the PocketIC binary:
 *      export POCKET_IC_BIN=~/.local/bin/pocket-ic
 *    (see ../../scripts/setup-pocketic.sh)
 *
 * 2. Compiled Wasm files — produced by dfx build at the project root:
 *      dfx build <canister>        # one canister
 *      dfx build                   # all canisters
 *    Wasm lands at: .dfx/local/canisters/<name>/<name>.wasm
 *
 * 3. Install this package's deps (first time only):
 *      cd tests/upgrade && npm install
 */

import { PocketIc } from "@dfinity/pic";
import { IDL }      from "@icp-sdk/core/candid";
import { existsSync } from "fs";
import { resolve }    from "path";

// Project root relative to this file (tests/upgrade/__helpers__/)
const ROOT = resolve(__dirname, "../../..");

// ── Wasm resolution ───────────────────────────────────────────────────────────

export function wasmPath(canisterName: string): string {
  const p = resolve(ROOT, `.dfx/local/canisters/${canisterName}/${canisterName}.wasm`);
  if (!existsSync(p)) {
    throw new Error(
      `\nWasm not found: ${p}\n` +
      `Run 'dfx build ${canisterName}' (or 'dfx build') from the project root first.\n`
    );
  }
  return p;
}

// ── PocketIC factory ──────────────────────────────────────────────────────────

export async function createPic(): Promise<PocketIc> {
  const bin = process.env.POCKET_IC_BIN;
  if (!bin) {
    throw new Error(
      `\nPOCKET_IC_BIN env var not set.\n` +
      `Run: export POCKET_IC_BIN=~/.local/bin/pocket-ic\n` +
      `See ../../scripts/setup-pocketic.sh for one-step installation.\n`
    );
  }
  return PocketIc.create(bin);
}

// ── IDL factories (inline — isolates upgrade tests from frontend dep graph) ───

/** Auth canister — methods used in upgrade tests only. */
export const authIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const UserRole = I.Variant({
    Homeowner: I.Null, Contractor: I.Null, Realtor: I.Null, Builder: I.Null,
  });
  const UserProfile = I.Record({
    principal:    I.Principal,
    role:         UserRole,
    email:        I.Text,
    phone:        I.Text,
    createdAt:    I.Int,
    updatedAt:    I.Int,
    isActive:     I.Bool,
    lastLoggedIn: I.Opt(I.Int),
  });
  const Error = I.Variant({
    NotFound: I.Null, AlreadyExists: I.Null, NotAuthorized: I.Null,
    Paused: I.Null, InvalidInput: I.Text,
  });
  const UserStats = I.Record({
    total: I.Nat, newToday: I.Nat, newThisWeek: I.Nat, activeThisWeek: I.Nat,
    homeowners: I.Nat, contractors: I.Nat, realtors: I.Nat, builders: I.Nat,
  });
  return I.Service({
    register:     I.Func([I.Record({ role: UserRole, email: I.Text, phone: I.Text })],
                         [I.Variant({ ok: UserProfile, err: Error })], []),
    getProfile:   I.Func([], [I.Variant({ ok: UserProfile, err: Error })], ["query"]),
    recordLogin:  I.Func([], [], []),
    getUserStats: I.Func([], [UserStats], ["query"]),
    getMetrics:   I.Func([], [I.Record({
      totalUsers: I.Nat, homeowners: I.Nat, contractors: I.Nat,
      realtors: I.Nat, builders: I.Nat, isPaused: I.Bool,
    })], ["query"]),
  });
};

/** Payment canister — methods used in upgrade tests only. */
export const paymentIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Tier = I.Variant({
    Free: I.Null, Pro: I.Null, Premium: I.Null, ContractorPro: I.Null,
  });
  const Subscription = I.Record({
    owner: I.Principal, tier: Tier, expiresAt: I.Int, createdAt: I.Int,
  });
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, PaymentFailed: I.Text,
  });
  const SubscriptionStats = I.Record({
    total: I.Nat, free: I.Nat, pro: I.Nat, premium: I.Nat,
    contractorPro: I.Nat, activePaid: I.Nat, estimatedMrrUsd: I.Nat,
  });
  return I.Service({
    subscribe:            I.Func([Tier], [I.Variant({ ok: Subscription, err: Error })], []),
    getMySubscription:    I.Func([], [I.Variant({ ok: Subscription, err: Error })], ["query"]),
    getSubscriptionStats: I.Func([], [SubscriptionStats], ["query"]),
  });
};

/** Sensor canister — methods used in upgrade tests only. */
export const sensorIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const DeviceSource = I.Variant({
    Nest: I.Null, Ecobee: I.Null, MoenFlo: I.Null, Manual: I.Null,
    RingAlarm: I.Null, HoneywellHome: I.Null, RheemEcoNet: I.Null, Sense: I.Null,
    EmporiaVue: I.Null, Rachio: I.Null, SmartThings: I.Null, HomeAssistant: I.Null,
    EnphaseEnvoy: I.Null, TeslaPowerwall: I.Null, LGThinQ: I.Null, GESmartHQ: I.Null,
  });
  const SensorEventType = I.Variant({
    WaterLeak: I.Null, LeakDetected: I.Null, FloodRisk: I.Null, LowTemperature: I.Null,
    HvacAlert: I.Null, HvacFilterDue: I.Null, HighHumidity: I.Null, HighTemperature: I.Null,
    SolarFault: I.Null, LowProduction: I.Null, BatteryLow: I.Null, GridOutage: I.Null,
    ApplianceFault: I.Null, ApplianceMaintenance: I.Null,
  });
  const Severity = I.Variant({ Info: I.Null, Warning: I.Null, Critical: I.Null });
  const SensorDevice = I.Record({
    id: I.Text, propertyId: I.Text, homeowner: I.Principal,
    externalDeviceId: I.Text, source: DeviceSource, name: I.Text,
    registeredAt: I.Int, isActive: I.Bool,
  });
  const SensorEvent = I.Record({
    id: I.Text, deviceId: I.Text, propertyId: I.Text, homeowner: I.Principal,
    eventType: SensorEventType, value: I.Float64, unit: I.Text, rawPayload: I.Text,
    timestamp: I.Int, severity: Severity, jobId: I.Opt(I.Text),
  });
  const Error = I.Variant({
    NotFound: I.Null, Unauthorized: I.Null, InvalidInput: I.Text, AlreadyExists: I.Null,
  });
  const Metrics = I.Record({
    totalDevices: I.Nat, activeDevices: I.Nat, totalEvents: I.Nat,
    criticalEvents: I.Nat, jobsCreated: I.Nat, isPaused: I.Bool,
  });
  return I.Service({
    addAdmin:              I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
    registerDevice:        I.Func([I.Text, I.Text, DeviceSource, I.Text], [I.Variant({ ok: SensorDevice, err: Error })], []),
    recordEvent:           I.Func([I.Text, SensorEventType, I.Float64, I.Text, I.Text], [I.Variant({ ok: SensorEvent, err: Error })], []),
    getDevicesForProperty: I.Func([I.Text], [I.Vec(SensorDevice)], ["query"]),
    getEventsForProperty:  I.Func([I.Text, I.Nat], [I.Vec(SensorEvent)], ["query"]),
    getMetrics:            I.Func([], [Metrics], ["query"]),
  });
};

/** Quote canister — methods used in upgrade tests only. */
export const quoteIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
  });
  const UrgencyLevel = I.Variant({ Low: I.Null, Medium: I.Null, High: I.Null, Emergency: I.Null });
  const RequestStatus = I.Variant({
    Open: I.Null, Quoted: I.Null, Accepted: I.Null, Closed: I.Null, Cancelled: I.Null,
  });
  const SubscriptionTier = I.Variant({
    Free: I.Null, Basic: I.Null, Pro: I.Null, Premium: I.Null,
    ContractorFree: I.Null, ContractorPro: I.Null,
  });
  const QuoteRequest = I.Record({
    id: I.Text, propertyId: I.Text, homeowner: I.Principal, serviceType: ServiceType,
    description: I.Text, urgency: UrgencyLevel, status: RequestStatus,
    createdAt: I.Int, closeAt: I.Opt(I.Int), zipCode: I.Opt(I.Text),
  });
  const SealedBid = I.Record({
    id: I.Text, requestId: I.Text, contractor: I.Principal,
    ciphertext: I.Vec(I.Nat8), timelineDays: I.Nat, submittedAt: I.Int,
  });
  const Error = I.Variant({ NotFound: I.Null, Unauthorized: I.Null, InvalidInput: I.Text });
  const Metrics = I.Record({
    totalRequests: I.Nat, openRequests: I.Nat, acceptedRequests: I.Nat,
    totalQuotes: I.Nat, isPaused: I.Bool,
  });
  return I.Service({
    addAdmin:               I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
    setTier:                I.Func([I.Principal, SubscriptionTier], [I.Variant({ ok: I.Null, err: Error })], []),
    createQuoteRequest:     I.Func([I.Text, ServiceType, I.Text, UrgencyLevel, I.Opt(I.Text)], [I.Variant({ ok: QuoteRequest, err: Error })], []),
    createSealedBidRequest: I.Func([I.Text, ServiceType, I.Text, UrgencyLevel, I.Int, I.Opt(I.Text)], [I.Variant({ ok: QuoteRequest, err: Error })], []),
    submitSealedBid:        I.Func([I.Text, I.Vec(I.Nat8), I.Nat], [I.Variant({ ok: SealedBid, err: Error })], []),
    getQuoteRequest:        I.Func([I.Text], [I.Variant({ ok: QuoteRequest, err: Error })], ["query"]),
    getMyBid:               I.Func([I.Text], [I.Variant({ ok: SealedBid, err: Error })], ["query"]),
    getMetrics:             I.Func([], [Metrics], ["query"]),
  });
};

/** Job canister — methods used in upgrade tests only. */
export const jobIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
  });
  const JobStatus = I.Variant({
    Pending: I.Null, InProgress: I.Null, Completed: I.Null, Verified: I.Null,
    PendingHomeownerApproval: I.Null, RejectedByHomeowner: I.Null,
  });
  const Job = I.Record({
    id: I.Text, propertyId: I.Text, homeowner: I.Principal, contractor: I.Opt(I.Principal),
    title: I.Text, serviceType: ServiceType, description: I.Text,
    contractorName: I.Opt(I.Text), amount: I.Nat, completedDate: I.Int,
    permitNumber: I.Opt(I.Text), warrantyMonths: I.Opt(I.Nat),
    isDiy: I.Bool, status: JobStatus, verified: I.Bool,
    homeownerSigned: I.Bool, contractorSigned: I.Bool,
    createdAt: I.Int, sourceQuoteId: I.Opt(I.Text),
  });
  const Error = I.Variant({
    NotFound: I.Null, Unauthorized: I.Null, InvalidInput: I.Text,
    AlreadyVerified: I.Null, TierLimitReached: I.Text,
  });
  const Metrics = I.Record({
    totalJobs: I.Nat, pendingJobs: I.Nat, completedJobs: I.Nat,
    verifiedJobs: I.Nat, diyJobs: I.Nat, isPaused: I.Bool,
  });
  return I.Service({
    addAdmin:        I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
    createJob:       I.Func(
      [I.Text, I.Text, ServiceType, I.Text, I.Opt(I.Text), I.Nat, I.Int, I.Opt(I.Text), I.Opt(I.Nat), I.Bool, I.Opt(I.Text)],
      [I.Variant({ ok: Job, err: Error })],
      []
    ),
    updateJobStatus: I.Func([I.Text, JobStatus], [I.Variant({ ok: Job, err: Error })], []),
    getJob:          I.Func([I.Text], [I.Variant({ ok: Job, err: Error })], ["query"]),
    getMetrics:      I.Func([], [Metrics], ["query"]),
  });
};

/** Property canister — methods used in upgrade tests only. */
export const propertyIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const PropertyType = I.Variant({
    SingleFamily: I.Null, Condo: I.Null, Townhouse: I.Null, MultiFamily: I.Null,
  });
  const VerificationLevel = I.Variant({
    Unverified: I.Null, PendingReview: I.Null, Basic: I.Null, Premium: I.Null,
  });
  const SubscriptionTier = I.Variant({
    Free: I.Null, Basic: I.Null, Pro: I.Null, Premium: I.Null,
    ContractorFree: I.Null, ContractorPro: I.Null,
  });
  const RegisterPropertyArgs = I.Record({
    address: I.Text, city: I.Text, state: I.Text, zipCode: I.Text,
    propertyType: PropertyType, yearBuilt: I.Nat, squareFeet: I.Nat,
    tier: SubscriptionTier,
  });
  const Property = I.Record({
    id: I.Text, owner: I.Principal, address: I.Text, city: I.Text, state: I.Text,
    zipCode: I.Text, propertyType: PropertyType, yearBuilt: I.Nat, squareFeet: I.Nat,
    verificationLevel: VerificationLevel, verificationDate: I.Opt(I.Int),
    verificationMethod: I.Opt(I.Text), verificationDocHash: I.Opt(I.Text),
    tier: SubscriptionTier, createdAt: I.Int, updatedAt: I.Int, isActive: I.Bool,
  });
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, Paused: I.Null, LimitReached: I.Null,
    InvalidInput: I.Text, DuplicateAddress: I.Null, AddressConflict: I.Int,
  });
  const Metrics = I.Record({
    totalProperties: I.Nat, verifiedProperties: I.Nat,
    pendingReviewProperties: I.Nat, unverifiedProperties: I.Nat, isPaused: I.Bool,
  });
  return I.Service({
    addAdmin:         I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
    setTier:          I.Func([I.Principal, SubscriptionTier], [I.Variant({ ok: I.Null, err: Error })], []),
    registerProperty: I.Func([RegisterPropertyArgs], [I.Variant({ ok: Property, err: Error })], []),
    verifyProperty:   I.Func([I.Text, VerificationLevel, I.Opt(I.Text)], [I.Variant({ ok: Property, err: Error })], []),
    getProperty:      I.Func([I.Text], [I.Variant({ ok: Property, err: Error })], ["query"]),
    getMetrics:       I.Func([], [Metrics], ["query"]),
  });
};

/** Monitoring canister — methods used in upgrade tests only. */
export const monitoringIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const AlertSeverity  = I.Variant({ Critical: I.Null, Warning: I.Null, Info: I.Null });
  const AlertCategory  = I.Variant({
    Cycles: I.Null, ErrorRate: I.Null, ResponseTime: I.Null,
    Memory: I.Null, Milestone: I.Null, TopUp: I.Null, Stale: I.Null,
  });
  const Alert = I.Record({
    id: I.Text, severity: AlertSeverity, category: AlertCategory,
    canisterId: I.Opt(I.Principal), message: I.Text,
    resolved: I.Bool, createdAt: I.Int, resolvedAt: I.Opt(I.Int),
  });
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text,
  });
  const Metrics = I.Record({
    totalCanisters: I.Nat, activeAlerts: I.Nat, criticalAlerts: I.Nat, isPaused: I.Bool,
    cyclesPerCall: I.Vec(I.Record({
      method: I.Text, avgCycles: I.Nat, sampleCount: I.Nat, lastUpdatedAt: I.Int,
    })),
  });
  return I.Service({
    addAdmin:              I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
    recordCanisterMetrics: I.Func(
      [I.Principal, I.Nat, I.Nat, I.Nat, I.Nat, I.Nat, I.Nat, I.Nat], [], []
    ),
    getActiveAlerts:          I.Func([], [I.Vec(Alert)], ["query"]),
    getCriticalCycleAlerts:   I.Func([], [I.Vec(Alert)], ["query"]),
    resolveAlert:             I.Func([I.Text], [I.Bool], []),
    getMetrics:               I.Func([], [Metrics], ["query"]),
  });
};

/** Contractor canister — methods used in upgrade tests only. */
export const contractorIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
    Gutters: I.Null, GeneralHandyman: I.Null, Pest: I.Null, Concrete: I.Null,
    Fencing: I.Null, Insulation: I.Null, Solar: I.Null, Pool: I.Null,
  });
  const RegisterArgs = I.Record({
    name: I.Text, specialties: I.Vec(ServiceType), email: I.Text, phone: I.Text,
  });
  const ContractorProfile = I.Record({
    id: I.Principal, name: I.Text, specialties: I.Vec(ServiceType),
    email: I.Text, phone: I.Text, bio: I.Opt(I.Text), licenseNumber: I.Opt(I.Text),
    serviceArea: I.Opt(I.Text), serviceZips: I.Vec(I.Text),
    trustScore: I.Nat, jobsCompleted: I.Nat, isVerified: I.Bool, createdAt: I.Int,
  });
  const Review = I.Record({
    id: I.Text, contractor: I.Principal, reviewer: I.Principal,
    rating: I.Nat, comment: I.Text, jobId: I.Text, createdAt: I.Int,
  });
  const Error = I.Variant({
    NotFound: I.Null, AlreadyExists: I.Null, Unauthorized: I.Null,
    Paused: I.Null, RateLimitExceeded: I.Null, InvalidInput: I.Text,
  });
  const Metrics = I.Record({
    totalContractors: I.Nat, verifiedContractors: I.Nat,
    totalReviews: I.Nat, isPaused: I.Bool,
  });
  return I.Service({
    addAdmin:                I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
    register:                I.Func([RegisterArgs], [I.Variant({ ok: ContractorProfile, err: Error })], []),
    submitReview:            I.Func([I.Principal, I.Nat, I.Text, I.Text], [I.Variant({ ok: Review, err: Error })], []),
    verifyContractor:        I.Func([I.Principal], [I.Variant({ ok: ContractorProfile, err: Error })], []),
    getContractor:           I.Func([I.Principal], [I.Variant({ ok: ContractorProfile, err: Error })], ["query"]),
    getReviewsForContractor: I.Func([I.Principal], [I.Vec(Review)], ["query"]),
    getMetrics:              I.Func([], [Metrics], ["query"]),
  });
};
