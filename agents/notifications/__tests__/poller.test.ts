/**
 * @jest-environment node
 */
// 15.3.4 — poller: start/stop lifecycle + event fan-out via injected fetchers
jest.mock("../dispatcher", () => ({ dispatchToUser: jest.fn() }));

import { pollOnce, startPoller, stopPoller } from "../poller";
import { dispatchToUser } from "../dispatcher";
import type { NotificationEvent } from "../types";

const mockDispatch = dispatchToUser as jest.MockedFunction<typeof dispatchToUser>;

const LEAD_EVENT: NotificationEvent = {
  type:      "new_lead",
  principal: "contractor-xyz",
  payload:   { title: "New lead", body: "Quote request in Plumbing", route: "leads/lead-1" },
};

const SIGNED_EVENT: NotificationEvent = {
  type:      "job_signed",
  principal: "contractor-abc",
  payload:   { title: "Job signed", body: "Homeowner signed off", route: "jobs/job-99" },
};

beforeEach(() => {
  jest.clearAllMocks();
  stopPoller(); // ensure clean state
});

afterEach(() => {
  stopPoller();
});

// ── pollOnce ──────────────────────────────────────────────────────────────────

describe("pollOnce", () => {
  it("dispatches each event returned by the fetchers", async () => {
    mockDispatch.mockResolvedValue(undefined);

    await pollOnce([
      async () => [LEAD_EVENT],
      async () => [SIGNED_EVENT],
    ]);

    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenCalledWith(LEAD_EVENT.principal,  LEAD_EVENT.payload);
    expect(mockDispatch).toHaveBeenCalledWith(SIGNED_EVENT.principal, SIGNED_EVENT.payload);
  });

  it("is a no-op when all fetchers return empty arrays", async () => {
    await pollOnce([async () => [], async () => []]);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("merges events from multiple fetchers into one dispatch loop", async () => {
    mockDispatch.mockResolvedValue(undefined);

    await pollOnce([
      async () => [LEAD_EVENT, SIGNED_EVENT],
      async () => [],
    ]);

    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("dispatches multiple events for the same principal independently", async () => {
    const event2: NotificationEvent = { ...LEAD_EVENT, payload: { title: "Lead 2", body: "Roofing" } };
    mockDispatch.mockResolvedValue(undefined);

    await pollOnce([async () => [LEAD_EVENT, event2]]);

    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("uses default fetchers (stubs) when called with no arguments", async () => {
    // Default stubs return [] — dispatch should not be called
    await expect(pollOnce()).resolves.toBeUndefined();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("propagates fetcher errors (caller handles them)", async () => {
    await expect(
      pollOnce([async () => { throw new Error("canister unreachable"); }])
    ).rejects.toThrow("canister unreachable");
  });
});

// ── startPoller / stopPoller ──────────────────────────────────────────────────

describe("startPoller / stopPoller", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("startPoller registers a recurring interval", () => {
    const spy = jest.spyOn(global, "setInterval");
    startPoller();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("startPoller is idempotent — calling twice registers only one interval", () => {
    const spy = jest.spyOn(global, "setInterval");
    startPoller();
    startPoller();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("stopPoller clears the interval", () => {
    const spy = jest.spyOn(global, "clearInterval");
    startPoller();
    stopPoller();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("stopPoller is a no-op when poller was never started", () => {
    const spy = jest.spyOn(global, "clearInterval");
    stopPoller(); // called without startPoller
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
