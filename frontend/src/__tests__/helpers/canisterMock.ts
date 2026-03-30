/**
 * Canister Actor Mock Utility (12.6.4)
 *
 * Provides `createMockActor` — a factory that returns a vi.fn()-backed stub
 * for any canister actor. Use this in unit tests to verify that service
 * functions correctly call the actor with the right arguments and handle
 * actor responses, without a running replica.
 *
 * Usage:
 *   const mockActor = createMockActor({ getProfile: vi.fn().mockResolvedValue({...}) });
 *   vi.mock("@/services/actor", () => ({ createActor: () => mockActor }));
 *
 * Pattern:
 *   Each method on the mock actor is a vi.fn() returning a Promise by default.
 *   Override specific methods by passing them in the `methods` argument.
 *   Call `getMockMethod(actor, "methodName")` to retrieve the spy for assertions.
 */

import { vi, type Mock } from "vitest";

export type MockActorMethods = Record<string, Mock>;

/**
 * Returns a Proxy-backed mock actor. Any method not explicitly provided
 * returns a no-op that resolves to undefined — so tests only need to stub
 * the methods they actually care about.
 */
export function createMockActor(methods: MockActorMethods = {}): Record<string, Mock> {
  return new Proxy(methods, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      // Auto-stub unknown methods with a vi.fn() that resolves to undefined
      const stub = vi.fn().mockResolvedValue(undefined);
      target[prop] = stub;
      return stub;
    },
  }) as Record<string, Mock>;
}

/**
 * Retrieve a specific mock method from an actor created with `createMockActor`.
 * Useful for asserting `.toHaveBeenCalledWith(...)` after exercising a service.
 */
export function getMockMethod(actor: Record<string, Mock>, method: string): Mock {
  return actor[method];
}

// ── Pre-built actor stubs for common canisters ────────────────────────────────

/** Stub actor matching the auth canister's primary methods. */
export function mockAuthActor(overrides: MockActorMethods = {}) {
  return createMockActor({
    register:      vi.fn().mockResolvedValue({ ok: { principal: "test", role: { Homeowner: null }, email: [], phone: [], createdAt: BigInt(0), updatedAt: BigInt(0) } }),
    getProfile:    vi.fn().mockResolvedValue([{ principal: "test", role: { Homeowner: null }, email: [], phone: [], createdAt: BigInt(0), updatedAt: BigInt(0) }]),
    updateProfile: vi.fn().mockResolvedValue({ ok: null }),
    hasRole:       vi.fn().mockResolvedValue(true),
    getMetrics:    vi.fn().mockResolvedValue({ totalUsers: BigInt(1), activeUsers: BigInt(1), isPaused: false }),
    ...overrides,
  });
}

/** Stub actor matching the job canister's primary methods. */
export function mockJobActor(overrides: MockActorMethods = {}) {
  return createMockActor({
    createJob:         vi.fn().mockResolvedValue({ ok: BigInt(1) }),
    getJob:            vi.fn().mockResolvedValue([]),
    getByProperty:     vi.fn().mockResolvedValue([]),
    updateJobStatus:   vi.fn().mockResolvedValue({ ok: null }),
    homeownerSign:     vi.fn().mockResolvedValue({ ok: null }),
    contractorSign:    vi.fn().mockResolvedValue({ ok: null }),
    getMetrics:        vi.fn().mockResolvedValue({ totalJobs: BigInt(0), verifiedJobs: BigInt(0), isPaused: false }),
    ...overrides,
  });
}

/** Stub actor matching the property canister's primary methods. */
export function mockPropertyActor(overrides: MockActorMethods = {}) {
  return createMockActor({
    registerProperty:         vi.fn().mockResolvedValue({ ok: BigInt(1) }),
    getProperty:              vi.fn().mockResolvedValue([]),
    getMyProperties:          vi.fn().mockResolvedValue([]),
    getPropertyLimitForTier:  vi.fn().mockResolvedValue(BigInt(1)),
    startVerification:        vi.fn().mockResolvedValue({ ok: null }),
    getMetrics:               vi.fn().mockResolvedValue({ totalProperties: BigInt(0), isPaused: false }),
    ...overrides,
  });
}

/** Stub actor matching the contractor canister's primary methods. */
export function mockContractorActor(overrides: MockActorMethods = {}) {
  return createMockActor({
    createProfile:   vi.fn().mockResolvedValue({ ok: null }),
    getContractor:   vi.fn().mockResolvedValue([]),
    listAll:         vi.fn().mockResolvedValue([]),
    addReview:       vi.fn().mockResolvedValue({ ok: null }),
    getMetrics:      vi.fn().mockResolvedValue({ totalContractors: BigInt(0), isPaused: false }),
    ...overrides,
  });
}

/** Stub actor matching the quote canister's primary methods. */
export function mockQuoteActor(overrides: MockActorMethods = {}) {
  return createMockActor({
    createRequest:         vi.fn().mockResolvedValue({ ok: "qr-1" }),
    getRequest:            vi.fn().mockResolvedValue([]),
    getMyRequests:         vi.fn().mockResolvedValue([]),
    submitQuote:           vi.fn().mockResolvedValue({ ok: "q-1" }),
    getQuotesForRequest:   vi.fn().mockResolvedValue([]),
    acceptQuote:           vi.fn().mockResolvedValue({ ok: null }),
    getMetrics:            vi.fn().mockResolvedValue({ totalRequests: BigInt(0), isPaused: false }),
    ...overrides,
  });
}

/** Stub actor matching the payment canister's primary methods. */
export function mockPaymentActor(overrides: MockActorMethods = {}) {
  return createMockActor({
    getMySubscription:  vi.fn().mockResolvedValue({ tier: { Free: null }, expiresAt: [] }),
    subscribe:          vi.fn().mockResolvedValue({ ok: null }),
    cancelSubscription: vi.fn().mockResolvedValue({ ok: null }),
    getMetrics:         vi.fn().mockResolvedValue({ totalSubscriptions: BigInt(0), isPaused: false }),
    ...overrides,
  });
}
