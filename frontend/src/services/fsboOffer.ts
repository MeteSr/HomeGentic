/**
 * fsboOfferService — Epic 10.5
 *
 * Offers the seller received on a FSBO listing (by email, on paper, through a
 * buyer's agent) and logs here to compare them and track counters. They live
 * on the listing canister, readable only by the seller. Without a deployed
 * canister the calls run against an in-memory store.
 */

import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/listing";
import { listingErrorMessage } from "./fsbo";

const LISTING_CANISTER_ID = (process.env as any).LISTING_CANISTER_ID || "";

export type FsboContingency = "inspection" | "financing" | "appraisal" | "saleOfHome";
export type FsboOfferStatus = "Active" | "Countered" | "Accepted" | "Rejected";

export interface FsboCounter {
  id:          string;
  fromSeller:  boolean;
  amountCents: number;
  notes:       string;
  createdAt:   number;
}

export interface FsboOffer {
  id:                  string;
  propertyId:          string;
  buyerName:           string;
  offerAmountCents:    number;
  earnestMoneyCents:   number;
  contingencies:       string[];
  closeDateMs:         number;
  hasEscalationClause: boolean;
  status:              FsboOfferStatus;
  loggedAt:            number;
  counters:            FsboCounter[];
}

export interface LogFsboOfferInput {
  buyerName:           string;
  offerAmountCents:    number;
  earnestMoneyCents:   number;
  contingencies:       string[];
  closeDateMs:         number;
  hasEscalationClause: boolean;
}

export interface AddCounterInput {
  amountCents: number;
  notes:       string;
  fromSeller:  boolean;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────────

/** Net proceeds = offer − 2% closing costs − seller concessions */
export function computeFsboNetProceeds(
  offerAmountCents: number,
  concessionsCents: number = 0
): number {
  const closingCostsCents = Math.round(offerAmountCents * 0.02);
  return offerAmountCents - closingCostsCents - concessionsCents;
}

/** Simple risk score: number of contingencies */
export function computeContingencyRisk(contingencies: string[]): number {
  return contingencies.length;
}

// ─── Canister mapping ─────────────────────────────────────────────────────────

const getActor = lazyActor(idlFactory, LISTING_CANISTER_ID);

function isMockMode(): boolean {
  return !LISTING_CANISTER_ID || (typeof window !== "undefined" && !!(window as any).__e2e_properties);
}

function unwrap<T>(result: { ok: T } | { err: unknown }): T {
  if ("err" in result) throw new Error(listingErrorMessage(result.err));
  return result.ok;
}

export function fromOffer(r: any): FsboOffer {
  return {
    id:                  r.id,
    propertyId:          r.propertyId,
    buyerName:           r.buyerName,
    offerAmountCents:    Number(r.offerAmountCents),
    earnestMoneyCents:   Number(r.earnestMoneyCents),
    contingencies:       [...r.contingencies],
    closeDateMs:         Number(r.closeDate) / 1_000_000,
    hasEscalationClause: r.hasEscalationClause,
    status:              Object.keys(r.status)[0] as FsboOfferStatus,
    loggedAt:            Number(r.loggedAt) / 1_000_000,
    counters:            (r.counters as any[]).map((c) => ({
      id:          c.id,
      fromSeller:  c.fromSeller,
      amountCents: Number(c.amountCents),
      notes:       c.notes,
      createdAt:   Number(c.createdAt) / 1_000_000,
    })),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

function createFsboOfferService() {
  let _store: FsboOffer[] = [];
  let _seq = 0;

  function _update(id: string, patch: Partial<FsboOffer>): FsboOffer {
    const offer = _store.find((o) => o.id === id);
    if (!offer) throw new Error("That offer no longer exists.");
    const updated = { ...offer, ...patch };
    _store = _store.map((o) => (o.id === id ? updated : o));
    return updated;
  }

  return {
    async logOffer(propertyId: string, input: LogFsboOfferInput): Promise<FsboOffer> {
      if (isMockMode()) {
        const offer: FsboOffer = {
          id:            `fo-${++_seq}`,
          propertyId,
          ...input,
          contingencies: [...input.contingencies],
          status:        "Active",
          loggedAt:      Date.now(),
          counters:      [],
        };
        _store = [..._store, offer];
        return offer;
      }
      const actor = await getActor();
      return fromOffer(unwrap(await actor.logFsboOffer(propertyId, {
        buyerName:           input.buyerName,
        offerAmountCents:    BigInt(Math.round(input.offerAmountCents)),
        earnestMoneyCents:   BigInt(Math.round(input.earnestMoneyCents)),
        contingencies:       input.contingencies,
        closeDate:           BigInt(Math.round(input.closeDateMs)) * 1_000_000n,
        hasEscalationClause: input.hasEscalationClause,
      })));
    },

    /** Offers on the seller's listing, oldest first. */
    async getByProperty(propertyId: string): Promise<FsboOffer[]> {
      if (isMockMode()) return _store.filter((o) => o.propertyId === propertyId);
      const actor = await getActor();
      return (unwrap(await actor.getFsboOffers(propertyId)) as any[]).map(fromOffer);
    },

    /** Accept one offer; the listing's other open offers are marked rejected. */
    async accept(propertyId: string, id: string): Promise<FsboOffer> {
      if (isMockMode()) {
        _store = _store.map((o) =>
          o.propertyId === propertyId && o.id !== id && (o.status === "Active" || o.status === "Countered")
            ? { ...o, status: "Rejected" } : o);
        return _update(id, { status: "Accepted" });
      }
      const actor = await getActor();
      return fromOffer(unwrap(await actor.acceptFsboOffer(propertyId, id)));
    },

    async reject(propertyId: string, id: string): Promise<FsboOffer> {
      if (isMockMode()) return _update(id, { status: "Rejected" });
      const actor = await getActor();
      return fromOffer(unwrap(await actor.rejectFsboOffer(propertyId, id)));
    },

    async addCounter(propertyId: string, id: string, input: AddCounterInput): Promise<FsboOffer> {
      if (isMockMode()) {
        const offer = _store.find((o) => o.id === id);
        if (!offer) throw new Error("That offer no longer exists.");
        const counter: FsboCounter = {
          id:        `ctr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...input,
          createdAt: Date.now(),
        };
        return _update(id, { status: "Countered", counters: [...offer.counters, counter] });
      }
      const actor = await getActor();
      return fromOffer(unwrap(await actor.counterFsboOffer(propertyId, id, BigInt(Math.round(input.amountCents)), input.notes, input.fromSeller)));
    },

    /** In-memory store only: drop a property's offers when its listing comes down. */
    __clearProperty(propertyId: string) {
      _store = _store.filter((o) => o.propertyId !== propertyId);
    },

    __reset() {
      _store = [];
      _seq   = 0;
      getActor.reset();
    },
  };
}

export const fsboOfferService = createFsboOfferService();
