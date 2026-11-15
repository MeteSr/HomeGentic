/**
 * Visit times on an accepted quote (quote canister): the contractor offers up
 * to five times, the homeowner books one or asks for others, and either side
 * can cancel. Both get a notification for each step and a reminder the day
 * before a booked visit.
 *
 * Times are milliseconds here and nanoseconds on the canister.
 *
 * E2E: window.__e2e_visits = { [quoteId]: VisitBooking } switches every call
 * to an in-memory copy of the same rules.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/quote";
import type { _SERVICE as QuoteCanister } from "@homegentic/shared/types/quote";
import type * as QuoteTypes from "@homegentic/shared/types/quote";
import { canisterError, variantKey } from "./candid";

const QUOTE_CANISTER_ID = (process.env as any).QUOTE_CANISTER_ID || "";
const getActor = lazyActor<QuoteCanister>(idlFactory, QUOTE_CANISTER_ID);

export type VisitStatus = "timesOffered" | "booked" | "newTimesRequested" | "cancelled";

export interface VisitSlot {
  startsAt: number;
  endsAt: number;
}

export interface VisitBooking {
  quoteId: string;
  requestId: string;
  status: VisitStatus;
  offered: VisitSlot[];
  booked: VisitSlot | null;
  note: string;
  updatedAt: number;
}

export const MAX_VISIT_SLOTS = 5;
export const MAX_VISIT_NOTE_CHARS = 300;
const HOUR = 3_600_000;
const MAX_LENGTH_MS = 12 * HOUR;
const MAX_AHEAD_MS = 180 * 24 * HOUR;

/** Why the canister would refuse these slots (its own wording), or null. */
export function visitSlotProblem(slots: VisitSlot[], now = Date.now()): string | null {
  if (slots.length === 0) return "Offer at least one time";
  if (slots.length > MAX_VISIT_SLOTS) return "Offer at most 5 times";
  for (const s of slots) {
    if (s.startsAt <= now) return "Each time must be in the future";
    if (s.endsAt <= s.startsAt) return "Each time must end after it starts";
    if (s.endsAt - s.startsAt > MAX_LENGTH_MS) return "A visit can be at most 12 hours";
    if (s.startsAt - now > MAX_AHEAD_MS) return "Offer times within the next 180 days";
  }
  return null;
}

/** "Wed, Nov 18, 9:00 AM – 11:00 AM", in the viewer's time zone. */
export function formatVisitSlot(s: VisitSlot): string {
  const day = new Date(s.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time(s.startsAt)} – ${time(s.endsAt)}`;
}

const STATUS: Record<string, VisitStatus> = {
  TimesOffered: "timesOffered",
  Booked: "booked",
  NewTimesRequested: "newTimesRequested",
  Cancelled: "cancelled",
};

const ms = (ns: bigint) => Number(ns / 1_000_000n);
const slotFrom = (s: QuoteTypes.VisitSlot): VisitSlot => ({ startsAt: ms(s.startsAt), endsAt: ms(s.endsAt) });
const slotTo = (s: VisitSlot): QuoteTypes.VisitSlot => ({
  startsAt: BigInt(Math.round(s.startsAt)) * 1_000_000n,
  endsAt: BigInt(Math.round(s.endsAt)) * 1_000_000n,
});

function fromRaw(b: QuoteTypes.VisitBooking): VisitBooking {
  return {
    quoteId: b.quoteId,
    requestId: b.requestId,
    status: STATUS[variantKey(b.status)],
    offered: b.offered.map(slotFrom),
    booked: b.booked[0] ? slotFrom(b.booked[0]) : null,
    note: b.note,
    updatedAt: ms(b.updatedAt),
  };
}

function unwrap(r: { ok: QuoteTypes.VisitBooking } | { err: QuoteTypes.Error }): VisitBooking {
  if ("err" in r) throw canisterError(r.err);
  return fromRaw(r.ok);
}

// ─── E2E in-memory mode ───────────────────────────────────────────────────────

function e2eStore(): Record<string, VisitBooking> | null {
  return typeof window !== "undefined" ? ((window as any).__e2e_visits ?? null) : null;
}

function e2eUpdate(
  store: Record<string, VisitBooking>,
  quoteId: string,
  change: (b: VisitBooking) => Partial<VisitBooking>,
): VisitBooking {
  const b = store[quoteId];
  if (!b) throw canisterError({ NotFound: null });
  store[quoteId] = { ...b, ...change(b), updatedAt: Date.now() };
  return store[quoteId];
}

// ─── Calls ────────────────────────────────────────────────────────────────────

/** The bookings on these quotes the caller can see, by quote id. */
export async function getVisitBookings(quoteIds: string[]): Promise<Map<string, VisitBooking>> {
  const store = e2eStore();
  if (store) return new Map(quoteIds.filter((id) => store[id]).map((id) => [id, store[id]]));
  if (quoteIds.length === 0) return new Map();
  const a = await getActor();
  const rows = await a.getVisitBookings(quoteIds);
  return new Map(rows.map((b) => [b.quoteId, fromRaw(b)]));
}

/** Contractor: offer up to five times (replacing any earlier offer or booking). */
export async function offerVisitTimes(quoteId: string, slots: VisitSlot[], note: string): Promise<VisitBooking> {
  const store = e2eStore();
  if (store) {
    const prev = store[quoteId];
    store[quoteId] = {
      quoteId,
      requestId: prev?.requestId ?? "",
      status: "timesOffered",
      offered: slots,
      booked: null,
      note,
      updatedAt: Date.now(),
    };
    return store[quoteId];
  }
  const a = await getActor();
  return unwrap(await a.offerVisitTimes(quoteId, slots.map(slotTo), note));
}

/** Homeowner: book the offered time at this position. */
export async function bookVisitTime(quoteId: string, index: number): Promise<VisitBooking> {
  const store = e2eStore();
  if (store) return e2eUpdate(store, quoteId, (b) => ({ status: "booked", booked: b.offered[index] ?? null }));
  const a = await getActor();
  return unwrap(await a.bookVisitTime(quoteId, BigInt(index)));
}

/** Homeowner: release any booked time and ask the contractor for others. */
export async function askForNewVisitTimes(quoteId: string): Promise<VisitBooking> {
  const store = e2eStore();
  if (store) return e2eUpdate(store, quoteId, () => ({ status: "newTimesRequested", booked: null }));
  const a = await getActor();
  return unwrap(await a.askForNewVisitTimes(quoteId));
}

/** Either side: cancel the visit. */
export async function cancelVisit(quoteId: string): Promise<VisitBooking> {
  const store = e2eStore();
  if (store) return e2eUpdate(store, quoteId, () => ({ status: "cancelled", booked: null }));
  const a = await getActor();
  return unwrap(await a.cancelVisit(quoteId));
}
