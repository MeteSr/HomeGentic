/**
 * showingRequestService — Epic 10.3.4 / 10.4.1
 *
 * Buyers ask to see a live FSBO listing from its public page; the seller reads
 * and answers the requests on My Listing. Requests live on the listing
 * canister, which notifies the seller of each new one. HomeGentic doesn't
 * message the buyer: the seller replies at the contact the buyer left.
 *
 * A buyer doesn't need an account. Requests go through the voice Worker
 * (POST /api/fsbo/showing-request), which rate-limits per connection and
 * files them on the listing canister; a signed-in buyer's session token rides
 * along so the request is filed as them. Without a deployed canister the
 * calls run against an in-memory store.
 */

import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/listing";
import { listingErrorMessage } from "./fsbo";
import { voiceAgentFetch } from "./voiceAgentHeaders";

const LISTING_CANISTER_ID = (process.env as any).LISTING_CANISTER_ID || "";
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

export type ShowingStatus = "Pending" | "Accepted" | "Declined" | "AlternateProposed";

export interface ShowingRequest {
  id:             string;
  propertyId:     string;
  name:           string;
  contact:        string;
  preferredTime:  string;
  createdAt:      number;   // ms
  status:         ShowingStatus;
  alternateTime?: string;
}

export type ShowingRequestInput = Pick<ShowingRequest, "propertyId" | "name" | "contact" | "preferredTime">;

const getActor = lazyActor(idlFactory, LISTING_CANISTER_ID);

function useMock(): boolean {
  return !LISTING_CANISTER_ID || (typeof window !== "undefined" && !!(window as any).__e2e_properties);
}

function unwrap<T>(result: { ok: T } | { err: unknown }): T {
  if ("err" in result) throw new Error(listingErrorMessage(result.err));
  return result.ok;
}

export function fromShowing(r: any): ShowingRequest {
  return {
    id:            r.id,
    propertyId:    r.propertyId,
    name:          r.name,
    contact:       r.contact,
    preferredTime: r.preferredTime,
    createdAt:     Number(r.createdAt) / 1_000_000,
    status:        Object.keys(r.status)[0] as ShowingStatus,
    alternateTime: r.alternateTime[0] ?? undefined,
  };
}

function createShowingRequestService() {
  let _store: ShowingRequest[] = [];

  function _update(id: string, patch: Partial<ShowingRequest>): ShowingRequest {
    const req = _store.find((r) => r.id === id);
    if (!req) throw new Error("That showing request no longer exists.");
    const updated = { ...req, ...patch };
    _store = _store.map((r) => (r.id === id ? updated : r));
    return updated;
  }

  async function respond(propertyId: string, id: string, response: object, patch: Partial<ShowingRequest>): Promise<ShowingRequest> {
    if (useMock()) return _update(id, patch);
    const actor = await getActor();
    return fromShowing(unwrap(await actor.respondToShowing(propertyId, id, response)));
  }

  return {
    /** A buyer's request from the public listing page. */
    async create(input: ShowingRequestInput): Promise<ShowingRequest> {
      if (useMock()) {
        const req: ShowingRequest = {
          ...input,
          id:        `sr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: Date.now(),
          status:    "Pending",
        };
        _store = [..._store, req];
        return req;
      }
      const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/fsbo/showing-request`, {
        method: "POST",
        body: JSON.stringify({
          propertyId:    input.propertyId,
          name:          input.name.trim(),
          contact:       input.contact.trim(),
          preferredTime: input.preferredTime.trim(),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error ?? "Couldn't send your request. Please try again.");
      return { ...data, alternateTime: data.alternateTime ?? undefined } as ShowingRequest;
    },

    /** The seller's requests for their listing, newest first. */
    async getByProperty(propertyId: string): Promise<ShowingRequest[]> {
      if (useMock()) return _store.filter((r) => r.propertyId === propertyId).reverse();
      const actor = await getActor();
      return (unwrap(await actor.getShowingRequests(propertyId)) as any[]).map(fromShowing);
    },

    accept(propertyId: string, id: string): Promise<ShowingRequest> {
      return respond(propertyId, id, { Accept: null }, { status: "Accepted" });
    },

    decline(propertyId: string, id: string): Promise<ShowingRequest> {
      return respond(propertyId, id, { Decline: null }, { status: "Declined" });
    },

    proposeAlternate(propertyId: string, id: string, alternateTime: string): Promise<ShowingRequest> {
      const t = alternateTime.trim();
      return respond(propertyId, id, { ProposeAlternate: t }, { status: "AlternateProposed", alternateTime: t });
    },

    /** In-memory store only: drop a property's requests when its listing comes down. */
    __clearProperty(propertyId: string) {
      _store = _store.filter((r) => r.propertyId !== propertyId);
    },

    __reset() {
      _store = [];
      getActor.reset();
    },
  };
}

export const showingRequestService = createShowingRequestService();

/** A mailto: or tel: link for the buyer's contact, or null when it's neither. */
export function contactHref(contact: string): string | null {
  const c = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  const digits = c.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : null;
}
