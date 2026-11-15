/**
 * Visit times on an accepted quote: the service against a mocked quote
 * actor (encoding, decoding, errors), the client-side slot checks that mirror
 * the canister's, and the in-memory e2e mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const a = {
  offerVisitTimes: vi.fn(),
  bookVisitTime: vi.fn(),
  askForNewVisitTimes: vi.fn(),
  cancelVisit: vi.fn(),
  getVisitBookings: vi.fn(),
};
vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => a) }, HttpAgent: vi.fn() }));

import {
  askForNewVisitTimes,
  bookVisitTime,
  cancelVisit,
  formatVisitSlot,
  getVisitBookings,
  offerVisitTimes,
  visitSlotProblem,
  type VisitBooking,
} from "@/services/visitBooking";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 15, 12);
const NS = 1_000_000n;

const raw = (over: Record<string, unknown> = {}) => ({
  quoteId: "q1",
  requestId: "r1",
  status: { TimesOffered: null },
  offered: [{ startsAt: BigInt(NOW + DAY) * NS, endsAt: BigInt(NOW + DAY + 2 * HOUR) * NS }],
  booked: [],
  note: "Call ahead",
  updatedAt: BigInt(NOW) * NS,
  ...over,
});

beforeEach(() => {
  Object.values(a).forEach((f) => f.mockReset());
  delete (window as any).__e2e_visits;
});
afterEach(() => {
  delete (window as any).__e2e_visits;
});

describe("visitSlotProblem", () => {
  const slot = (startIn: number, length = 2 * HOUR) => ({ startsAt: NOW + startIn, endsAt: NOW + startIn + length });

  it("accepts one to five future slots up to 12 hours long within 180 days", () => {
    expect(visitSlotProblem([slot(DAY)], NOW)).toBeNull();
    expect(
      visitSlotProblem(
        [1, 2, 3, 4, 5].map((d) => slot(d * DAY)),
        NOW,
      ),
    ).toBeNull();
  });

  it("says what is wrong, in the canister's words", () => {
    expect(visitSlotProblem([], NOW)).toBe("Offer at least one time");
    expect(
      visitSlotProblem(
        [1, 2, 3, 4, 5, 6].map((d) => slot(d * DAY)),
        NOW,
      ),
    ).toBe("Offer at most 5 times");
    expect(visitSlotProblem([slot(-HOUR)], NOW)).toBe("Each time must be in the future");
    expect(visitSlotProblem([slot(DAY, 0)], NOW)).toBe("Each time must end after it starts");
    expect(visitSlotProblem([slot(DAY, 13 * HOUR)], NOW)).toBe("A visit can be at most 12 hours");
    expect(visitSlotProblem([slot(181 * DAY)], NOW)).toBe("Offer times within the next 180 days");
  });
});

describe("formatVisitSlot", () => {
  it("shows the day and the start and end times", () => {
    const start = new Date(2026, 10, 18, 9, 0).getTime();
    const s = formatVisitSlot({ startsAt: start, endsAt: start + 2 * HOUR });
    expect(s).toMatch(/Wed, Nov 18/);
    expect(s).toMatch(/9:00\sAM/);
    expect(s).toMatch(/11:00\sAM/);
  });
});

describe("against the canister", () => {
  it("reads bookings by quote id, decoding times to ms", async () => {
    a.getVisitBookings.mockResolvedValue([
      raw({
        status: { Booked: null },
        booked: [{ startsAt: BigInt(NOW + DAY) * NS, endsAt: BigInt(NOW + DAY + 2 * HOUR) * NS }],
      }),
    ]);
    const m = await getVisitBookings(["q1", "q2"]);
    expect(a.getVisitBookings).toHaveBeenCalledWith(["q1", "q2"]);
    expect(m.get("q1")).toEqual({
      quoteId: "q1",
      requestId: "r1",
      status: "booked",
      offered: [{ startsAt: NOW + DAY, endsAt: NOW + DAY + 2 * HOUR }],
      booked: { startsAt: NOW + DAY, endsAt: NOW + DAY + 2 * HOUR },
      note: "Call ahead",
      updatedAt: NOW,
    } satisfies VisitBooking);
    expect(m.has("q2")).toBe(false);
  });

  it("skips the call with no ids", async () => {
    expect((await getVisitBookings([])).size).toBe(0);
    expect(a.getVisitBookings).not.toHaveBeenCalled();
  });

  it("offers times in nanoseconds and returns the booking", async () => {
    a.offerVisitTimes.mockResolvedValue({ ok: raw() });
    const b = await offerVisitTimes("q1", [{ startsAt: NOW + DAY, endsAt: NOW + DAY + 2 * HOUR }], "Call ahead");
    expect(a.offerVisitTimes).toHaveBeenCalledWith(
      "q1",
      [{ startsAt: BigInt(NOW + DAY) * NS, endsAt: BigInt(NOW + DAY + 2 * HOUR) * NS }],
      "Call ahead",
    );
    expect(b.status).toBe("timesOffered");
  });

  it("books, asks for new times and cancels", async () => {
    a.bookVisitTime.mockResolvedValue({ ok: raw({ status: { Booked: null } }) });
    expect((await bookVisitTime("q1", 2)).status).toBe("booked");
    expect(a.bookVisitTime).toHaveBeenCalledWith("q1", 2n);
    a.askForNewVisitTimes.mockResolvedValue({ ok: raw({ status: { NewTimesRequested: null } }) });
    expect((await askForNewVisitTimes("q1")).status).toBe("newTimesRequested");
    a.cancelVisit.mockResolvedValue({ ok: raw({ status: { Cancelled: null } }) });
    expect((await cancelVisit("q1")).status).toBe("cancelled");
  });

  it("throws the canister's error", async () => {
    a.bookVisitTime.mockResolvedValue({ err: { InvalidInput: "Pick one of the offered times" } });
    await expect(bookVisitTime("q1", 9)).rejects.toThrow("Pick one of the offered times");
  });
});

describe("e2e mode (window.__e2e_visits)", () => {
  it("keeps bookings in memory and walks the same states", async () => {
    (window as any).__e2e_visits = {};
    const slots = [
      { startsAt: Date.now() + DAY, endsAt: Date.now() + DAY + HOUR },
      { startsAt: Date.now() + 2 * DAY, endsAt: Date.now() + 2 * DAY + HOUR },
    ];
    expect((await offerVisitTimes("q1", slots, "")).status).toBe("timesOffered");
    const booked = await bookVisitTime("q1", 1);
    expect(booked.booked).toEqual(slots[1]);
    expect((await getVisitBookings(["q1"])).get("q1")?.status).toBe("booked");
    expect((await askForNewVisitTimes("q1")).booked).toBeNull();
    expect((await cancelVisit("q1")).status).toBe("cancelled");
    await expect(cancelVisit("nope")).rejects.toThrow();
    expect(a.offerVisitTimes).not.toHaveBeenCalled();
  });
});
