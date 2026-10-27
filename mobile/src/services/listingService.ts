/**
 * The seller's side of a For Sale By Owner listing, on the listing canister:
 * the live listing, buyers' showing requests and the offers the seller has
 * logged. Listings are created on the web; the app manages a live one.
 *
 * HomeGentic doesn't message buyers. The seller answers a showing request
 * here and then contacts the buyer at the email or phone they left.
 */
import type { HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory } from "@homegentic/shared/declarations/listing";
import { actorFor, nsToMs, tag } from "./canister";

const LISTING_CANISTER_ID = process.env.EXPO_PUBLIC_LISTING_CANISTER_ID ?? "";

export interface FsboListing {
  propertyId:     string;
  listPriceCents: number;
  activatedAt:    number;   // ms
  address:        string;
  city:           string;
  state:          string;
  zipCode:        string;
}

export type ShowingStatus = "Pending" | "Accepted" | "Declined" | "AlternateProposed";

export interface ShowingRequest {
  id:             string;
  name:           string;
  contact:        string;
  preferredTime:  string;
  createdAt:      number;   // ms
  status:         ShowingStatus;
  alternateTime?: string;
}

export type OfferStatus = "Active" | "Countered" | "Accepted" | "Rejected";

export interface OfferCounter {
  id:          string;
  amountCents: number;
  notes:       string;
  fromSeller:  boolean;
  createdAt:   number;      // ms
}

export interface FsboOffer {
  id:                  string;
  buyerName:           string;
  offerAmountCents:    number;
  earnestMoneyCents:   number;
  contingencies:       string[];
  closeDate:           number;   // ms
  hasEscalationClause: boolean;
  status:              OfferStatus;
  loggedAt:            number;   // ms
  counters:            OfferCounter[];
}

// ── Converters ────────────────────────────────────────────────────────────────

export function fromListing(r: any): FsboListing {
  return {
    propertyId:     r.propertyId,
    listPriceCents: Number(r.listPriceCents),
    activatedAt:    nsToMs(r.activatedAt),
    address:        r.address,
    city:           r.city,
    state:          r.state,
    zipCode:        r.zipCode,
  };
}

export function fromShowing(r: any): ShowingRequest {
  return {
    id:            r.id,
    name:          r.name,
    contact:       r.contact,
    preferredTime: r.preferredTime,
    createdAt:     nsToMs(r.createdAt),
    status:        tag<ShowingStatus>(r.status),
    alternateTime: r.alternateTime?.[0] ?? undefined,
  };
}

export function fromOffer(r: any): FsboOffer {
  return {
    id:                  r.id,
    buyerName:           r.buyerName,
    offerAmountCents:    Number(r.offerAmountCents),
    earnestMoneyCents:   Number(r.earnestMoneyCents),
    contingencies:       [...r.contingencies],
    closeDate:           nsToMs(r.closeDate),
    hasEscalationClause: !!r.hasEscalationClause,
    status:              tag<OfferStatus>(r.status),
    loggedAt:            nsToMs(r.loggedAt),
    counters:            (r.counters as any[]).map((c) => ({
      id: c.id, amountCents: Number(c.amountCents), notes: c.notes, fromSeller: !!c.fromSeller, createdAt: nsToMs(c.createdAt),
    })),
  };
}

/** Plain-English text for the listing canister's error variant. */
export function listingErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const [key, val] = Object.entries(err as Record<string, unknown>)[0] ?? [];
    if (key === "InvalidInput" && typeof val === "string") return val;
    if (key === "NotAuthorized") return "Only the seller can do that.";
    if (key === "NotFound")      return "That's no longer on your listing. Pull down to refresh.";
    if (key) return key;
  }
  return String(err);
}

function unwrapListing<T>(result: any): T {
  if ("ok" in result) return result.ok as T;
  throw new Error(listingErrorMessage(result.err));
}

function actor(agent?: HttpAgent): any {
  if (!LISTING_CANISTER_ID) throw new Error("Listings aren't available in this build.");
  return actorFor(idlFactory, LISTING_CANISTER_ID, agent);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** The live listing for a property, or null when it isn't listed. */
export async function getFsboListing(propertyId: string, agent?: HttpAgent): Promise<FsboListing | null> {
  if (!LISTING_CANISTER_ID) return null;
  const r: any[] = await actor(agent).getFsboListing(propertyId);
  return r.length ? fromListing(r[0]) : null;
}

/** Showing requests, newest first. */
export async function getShowingRequests(propertyId: string, agent?: HttpAgent): Promise<ShowingRequest[]> {
  const raw: any[] = unwrapListing(await actor(agent).getShowingRequests(propertyId));
  return raw.map(fromShowing).sort((a, b) => b.createdAt - a.createdAt);
}

/** Logged offers: open ones first, then newest. */
export async function getFsboOffers(propertyId: string, agent?: HttpAgent): Promise<FsboOffer[]> {
  const raw: any[] = unwrapListing(await actor(agent).getFsboOffers(propertyId));
  return raw.map(fromOffer).sort(byOfferPriority);
}

export function isOfferOpen(o: FsboOffer): boolean {
  return o.status === "Active" || o.status === "Countered";
}

export function byOfferPriority(a: FsboOffer, b: FsboOffer): number {
  const open = Number(isOfferOpen(b)) - Number(isOfferOpen(a));
  return open !== 0 ? open : b.loggedAt - a.loggedAt;
}

/** The amount currently on the table: the latest counter, else the offer. */
export function currentAmountCents(o: FsboOffer): number {
  return o.counters.length ? o.counters[o.counters.length - 1].amountCents : o.offerAmountCents;
}

// ── Writes ────────────────────────────────────────────────────────────────────

export type ShowingAnswer =
  | { kind: "accept" }
  | { kind: "decline" }
  | { kind: "alternate"; time: string };

export async function respondToShowing(propertyId: string, requestId: string, answer: ShowingAnswer, agent?: HttpAgent): Promise<ShowingRequest> {
  const response =
    answer.kind === "accept"  ? { Accept: null } :
    answer.kind === "decline" ? { Decline: null } :
                                { ProposeAlternate: answer.time.trim() };
  return fromShowing(unwrapListing(await actor(agent).respondToShowing(propertyId, requestId, response)));
}

/** Accepting one offer rejects the other open ones (the canister does this). */
export async function acceptOffer(propertyId: string, offerId: string, agent?: HttpAgent): Promise<FsboOffer> {
  return fromOffer(unwrapListing(await actor(agent).acceptFsboOffer(propertyId, offerId)));
}

export async function rejectOffer(propertyId: string, offerId: string, agent?: HttpAgent): Promise<FsboOffer> {
  return fromOffer(unwrapListing(await actor(agent).rejectFsboOffer(propertyId, offerId)));
}

/** Records a counter. `fromSeller` false logs one the buyer made. */
export async function counterOffer(
  propertyId: string, offerId: string, amountCents: number, notes: string, fromSeller: boolean, agent?: HttpAgent,
): Promise<FsboOffer> {
  return fromOffer(unwrapListing(await actor(agent).counterFsboOffer(propertyId, offerId, BigInt(Math.round(amountCents)), notes.trim(), fromSeller)));
}

export async function updateListPrice(propertyId: string, priceCents: number, agent?: HttpAgent): Promise<FsboListing> {
  return fromListing(unwrapListing(await actor(agent).updateFsboPrice(propertyId, BigInt(Math.round(priceCents)))));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "425,000", "$425,000", "425000.50" → cents; null when it isn't a positive amount. */
export function parseDollars(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const cents = Math.round(parseFloat(clean) * 100);
  return cents > 0 ? cents : null;
}

/** A mailto: or tel: link for the buyer's contact, or null when it's neither. */
export function contactHref(contact: string): string | null {
  const c = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  const digits = c.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : null;
}
