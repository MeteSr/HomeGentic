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

import { PocketIc, PocketIcServer, createIdentity } from "@dfinity/pic";
import { IDL }      from "@icp-sdk/core/candid";
import type { Principal } from "@icp-sdk/core/principal";
import { copyFileSync, existsSync, rmSync } from "fs";
import { tmpdir }     from "os";
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

/**
 * Wasm of the same canister built from the PR's base branch, for tests that
 * upgrade from the code that is deployed today to this branch. Built by
 * scripts/ci/build-upgrade-wasms.sh into .dfx/base/; null when absent, so
 * those tests skip locally unless you build it.
 */
export function baseWasmPath(canisterName: string): string | null {
  const p = resolve(ROOT, `.dfx/base/canisters/${canisterName}/${canisterName}.wasm`);
  return existsSync(p) ? p : null;
}

// ── PocketIC factory ──────────────────────────────────────────────────────────

/**
 * Starts a PocketIC server and instance. The server binary is the one the
 * @dfinity/pic package downloads on install (matching its own version);
 * POCKET_IC_BIN, if set, is copied over it — e.g. for an offline machine.
 *
 * Canisters use enhanced orthogonal persistence, which refuses an upgrade
 * without `wasm_memory_persistence = keep`, so upgradeCanister defaults to
 * that. tearDown also stops the server.
 */
export async function createPic(): Promise<PocketIc> {
  const bundled = resolve(__dirname, "../node_modules/@dfinity/pic/pocket-ic");
  const bin = process.env.POCKET_IC_BIN;
  if (bin && existsSync(bin)) copyFileSync(bin, bundled);
  // A server that died leaves its port file behind, and every later start in
  // this process would read the dead port from it. With nothing of ours
  // running, any port file left is stale.
  if (live.size === 0) rmSync(resolve(tmpdir(), `pocket_ic_${process.ppid}.port`), { force: true });
  const server = await PocketIcServer.start();
  const proc = (server as any).serverProcess as import("child_process").ChildProcess;
  let stopping = false;
  const pic = await PocketIc.create(server.getUrl());

  // Upgrades default to the principal that installed the canister (its
  // controller) and to its install argument (actor classes need it). Calls default to a non-anonymous identity, because the
  // canisters' inspect_message refuses anonymous callers.
  const installedWith = new Map<string, { sender: Principal; arg?: Uint8Array }>();
  const setup = pic.setupCanister.bind(pic);
  pic.setupCanister = (async (opts: any) => {
    const sender = opts.sender ?? CONTROLLER.getPrincipal();
    const fixture = await setup({ ...opts, sender });
    installedWith.set(fixture.canisterId.toText(), { sender, arg: opts.arg });
    fixture.actor.setIdentity(CONTROLLER);
    return fixture;
  }) as typeof pic.setupCanister;
  const upgrade = pic.upgradeCanister.bind(pic);
  pic.upgradeCanister = (opts) => upgrade({
    ...installedWith.get(opts.canisterId.toText()),
    upgradeModeOptions: KEEP_MEMORY,
    ...opts,
  });
  const tearDown = pic.tearDown.bind(pic);
  pic.tearDown = async () => {
    live.delete(pic);
    stopping = true;
    try { await tearDown(); }
    finally { if (proc.exitCode === null && proc.signalCode === null) await server.stop(); }
  };
  live.add(pic);
  proc.on("exit", (code, signal) => {
    live.delete(pic);
    if (!stopping) console.error(`PocketIC server exited unexpectedly (code ${code}, signal ${signal})`);
  });
  return pic;
}

/** PocketIC instances not yet torn down whose server is still running (see tearDownLeftovers). */
const live = new Set<PocketIc>();

/**
 * Tears down instances a failed test left running. Every server this process
 * starts shares one port file (keyed by the parent PID), so a leftover server
 * is reused by the next test and its stale instances slow or stall the rest
 * of the run. Use as `afterEach(tearDownLeftovers)` in suites that create an
 * instance per test.
 */
export async function tearDownLeftovers(): Promise<void> {
  for (const pic of [...live]) await pic.tearDown().catch(() => {});
}

export const CONTROLLER = createIdentity("upgrade-test-controller");

const KEEP_MEMORY = { skip_pre_upgrade: [] as [], wasm_memory_persistence: [{ keep: null }] as [{ keep: null }] };

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
    Free: I.Null, Pro: I.Null, ContractorFree: I.Null, ContractorPro: I.Null,
  });
  const Subscription = I.Record({
    owner: I.Principal, tier: Tier, expiresAt: I.Int, createdAt: I.Int, cancelledAt: I.Opt(I.Int),
  });
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, PaymentFailed: I.Text, RateLimited: I.Null, InvalidInput: I.Text,
  });
  const SubscriptionStats = I.Record({
    total: I.Nat, free: I.Nat, pro: I.Nat, contractorFree: I.Nat,
    contractorPro: I.Nat, activePaid: I.Nat, estimatedMrrUsd: I.Nat,
  });
  return I.Service({
    setBootstrapNonce:    I.Func([I.Text], [], []),
    initAdmins:           I.Func([I.Vec(I.Principal), I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    grantSubscription:    I.Func([I.Principal, Tier], [I.Variant({ ok: Subscription, err: Error })], []),
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
    addAdmin:              I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    setBootstrapNonce:     I.Func([I.Text], [], []),
    registerDevice:        I.Func([I.Text, I.Text, DeviceSource, I.Text], [I.Variant({ ok: SensorDevice, err: Error })], []),
    recordEvent:           I.Func([I.Text, SensorEventType, I.Float64, I.Text, I.Text], [I.Variant({ ok: SensorEvent, err: Error })], []),
    getDevicesForProperty: I.Func([I.Text], [I.Vec(SensorDevice)], ["query"]),
    getEventsForProperty:  I.Func([I.Text, I.Nat], [I.Vec(SensorEvent)], []),
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
    Free: I.Null, Pro: I.Null, ContractorFree: I.Null, ContractorPro: I.Null,
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
    addAdmin:               I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    setBootstrapNonce:      I.Func([I.Text], [], []),
    setPaymentCanisterId:   I.Func([I.Principal], [I.Variant({ ok: I.Null, err: Error })], []),
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
    addAdmin:        I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    setBootstrapNonce: I.Func([I.Text], [], []),
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
    Free: I.Null, Pro: I.Null, ContractorFree: I.Null, ContractorPro: I.Null,
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
    addAdmin:         I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    setBootstrapNonce: I.Func([I.Text], [], []),
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
    addAdmin:              I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    setBootstrapNonce:     I.Func([I.Text], [], []),
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
    addAdmin:                I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
    setBootstrapNonce:       I.Func([I.Text], [], []),
    register:                I.Func([RegisterArgs], [I.Variant({ ok: ContractorProfile, err: Error })], []),
    submitReview:            I.Func([I.Principal, I.Nat, I.Text, I.Text], [I.Variant({ ok: Review, err: Error })], []),
    verifyContractor:        I.Func([I.Principal], [I.Variant({ ok: ContractorProfile, err: Error })], []),
    getContractor:           I.Func([I.Principal], [I.Variant({ ok: ContractorProfile, err: Error })], ["query"]),
    getReviewsForContractor: I.Func([I.Principal], [I.Vec(Review)], ["query"]),
    getMetrics:              I.Func([], [Metrics], ["query"]),
  });
};
