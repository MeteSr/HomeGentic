/**
 * Referral-fee protection: a homeowner with an open quote request in one of a
 * contractor's trades sees that contractor's bids in HomeGentic, not their
 * phone number and email, until the request is closed (a bid accepted, or the
 * request closed or cancelled). Enforced in the app only: the contractor
 * canister still returns contact fields to any caller.
 */
import type { QuoteRequest } from "./quote";

/** The homeowner's open request in one of `specialties`, if any. */
export function openRequestInTrades(requests: QuoteRequest[], specialties: string[]): QuoteRequest | null {
  const trades = new Set(specialties);
  return requests.find((r) => (r.status === "open" || r.status === "quoted") && trades.has(r.serviceType)) ?? null;
}
