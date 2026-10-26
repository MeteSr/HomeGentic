/**
 * FSBO (For Sale By Owner) service — Epic 10.1
 *
 * The seller's setup (asking price, description, wizard step), the live public
 * listing and its price history live on the listing canister. Without a
 * deployed canister (local dev, unit tests, E2E mock mode) the same calls run
 * against an in-memory store.
 */

import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/listing";
import type { Property } from "./property";

const LISTING_CANISTER_ID = (process.env as any).LISTING_CANISTER_ID || "";

export type FsboReadiness  = "NotReady" | "Ready" | "OptimallyReady";
export type FsboStep       = 1 | 2 | 3 | "done";

/** 10.2.3 — One entry in the price history log */
export interface PriceEntry {
  priceCents: number;
  recordedAt: number; // ms epoch
}

/**
 * The seller's view of a property's FSBO state. `isFsbo` is true only once the
 * listing is live (step "done"); steps 1–3 are setup that buyers can't see.
 */
export interface FsboRecord {
  propertyId:     string;
  isFsbo:         boolean;
  listPriceCents: number;
  /** ms epoch: when the listing went live, or when setup started for a draft. */
  activatedAt:    number;
  step:           FsboStep;
  hasReport:      boolean;
  description?:   string;
}

/** Details only the seller knows, asked for on the Go Live step. */
export interface GoLiveDetails {
  bedrooms:  number;
  bathrooms: number;
}

export interface FsboReadinessResult {
  readiness: FsboReadiness;
  missing:   string[];
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * 10.1.4 — Compute FSBO readiness from HomeGentic score, verified job count,
 * and whether a public report already exists.
 *
 *   NotReady       — score < 65 OR verifiedJobs < 2
 *   Ready          — score >= 65 AND verifiedJobs >= 2
 *   OptimallyReady — score >= 85 AND verifiedJobs >= 3 AND hasReport
 */
export function computeFsboReadiness(
  score:            number,
  verifiedJobCount: number,
  hasReport:        boolean
): FsboReadinessResult {
  const missing: string[] = [];

  if (score < 65)            missing.push(`Improve your HomeGentic score (currently ${score} — need 65+)`);
  if (verifiedJobCount < 2)  missing.push("Add at least 2 verified maintenance jobs");

  if (missing.length > 0) return { readiness: "NotReady", missing };

  // Check Optimally Ready upgrade requirements
  const optMissing: string[] = [];
  if (score < 85)            optMissing.push("Reach HomeGentic score of 85+ for optimal listing position");
  if (verifiedJobCount < 3)  optMissing.push("Add a 3rd verified job to show comprehensive maintenance history");
  if (!hasReport)            optMissing.push("Generate a public HomeGentic report for buyer confidence");

  if (optMissing.length === 0) return { readiness: "OptimallyReady", missing: [] };

  return { readiness: "Ready", missing: optMissing };
}

/**
 * 10.1.3 — Estimated savings vs. a 3% buyer's agent commission.
 * Returns cents.
 */
export function computeAgentCommissionSavings(listPriceCents: number): number {
  return Math.round(listPriceCents * 0.03);
}

// ─── Public search types ──────────────────────────────────────────────────────

export type PropertyType      = "SingleFamily" | "Condo" | "Townhouse" | "MultiFamily";
export type VerificationLevel = "Unverified" | "PendingReview" | "Basic" | "Premium";

/**
 * A live listing as buyers see it (listing canister `PublicFsboListing`). The
 * canister fills in verification level, score, verified job count and
 * whether a public report exists; the seller can't set those.
 */
export interface FsboPublicListing {
  propertyId:        string;
  listPriceCents:    number;
  activatedAt:       number;   // ms epoch — used to compute days on market
  address:           string;
  city:              string;
  state:             string;
  zipCode:           string;
  propertyType:      PropertyType;
  yearBuilt:         number;
  squareFeet:        number;
  bedrooms:          number;
  bathrooms:         number;
  verificationLevel: VerificationLevel;
  /** undefined = owner has not opted in to showing their score publicly */
  score?:            number;
  verifiedJobCount:  number;
  /** Brief description written by the seller */
  description?:      string;
  photoUrl?:         string;
  hasPublicReport:   boolean;
  /** Primary system ages shown on listing card (optional, human-readable) */
  systemHighlights?: string[];
}

/**
 * Returns all active public FSBO listings from the listing canister.
 * Falls back to window.__e2e_fsbo_listings in E2E tests, and to [] when
 * the canister is not deployed (local dev without deploy).
 */
export async function listPublicFsbos(): Promise<FsboPublicListing[]> {
  if (typeof window !== "undefined" && (window as any).__e2e_fsbo_listings) {
    return (window as any).__e2e_fsbo_listings as FsboPublicListing[];
  }
  if (useMock()) return [...mock.live.values()];
  const { listingService } = await import("./listing");
  return listingService.listActiveFsboListings();
}

// ─── Canister mapping ─────────────────────────────────────────────────────────

const getActor = lazyActor(idlFactory, LISTING_CANISTER_ID);

/** No canister (or E2E mock mode): use the in-memory store below. */
function useMock(): boolean {
  return !LISTING_CANISTER_ID || (typeof window !== "undefined" && !!(window as any).__e2e_properties);
}

function unwrap<T>(result: { ok: T } | { err: unknown }): T {
  if ("err" in result) throw new Error(listingErrorMessage(result.err));
  return result.ok;
}

export function listingErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const [key, val] = Object.entries(err as Record<string, unknown>)[0] ?? [];
    if (key === "InvalidInput" && typeof val === "string") return val;
    if (key === "NotAuthorized") return "You don't have permission to do that.";
    if (key === "NotFound")      return "This listing no longer exists.";
    if (key) return key;
  }
  return String(err);
}

export function fromPublicListing(r: any): FsboPublicListing {
  return {
    propertyId:        r.propertyId,
    listPriceCents:    Number(r.listPriceCents),
    activatedAt:       Number(r.activatedAt) / 1_000_000,
    address:           r.address,
    city:              r.city,
    state:             r.state,
    zipCode:           r.zipCode,
    propertyType:      r.propertyType as PropertyType,
    yearBuilt:         Number(r.yearBuilt),
    squareFeet:        Number(r.squareFeet),
    bedrooms:          Number(r.bedrooms),
    bathrooms:         Number(r.bathrooms),
    verificationLevel: r.verificationLevel as VerificationLevel,
    score:             r.score[0] != null ? Number(r.score[0]) : undefined,
    verifiedJobCount:  Number(r.verifiedJobCount),
    description:       r.description[0] ?? undefined,
    photoUrl:          r.photoUrl[0] ?? undefined,
    hasPublicReport:   r.hasPublicReport,
    systemHighlights:  r.systemHighlights as string[],
  };
}

function draftStep(n: number): FsboStep {
  return n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : "done";
}

function recordFromLive(l: FsboPublicListing): FsboRecord {
  return {
    propertyId:     l.propertyId,
    isFsbo:         true,
    listPriceCents: l.listPriceCents,
    activatedAt:    l.activatedAt,
    step:           "done",
    hasReport:      l.hasPublicReport,
    description:    l.description,
  };
}

function recordFromDraft(propertyId: string, d: any): FsboRecord {
  return {
    propertyId,
    isFsbo:         false,
    listPriceCents: Number(d.listPriceCents),
    activatedAt:    Number(d.startedAt) / 1_000_000,
    step:           draftStep(Number(d.step)),
    hasReport:      false,
    description:    d.description[0] ?? undefined,
  };
}

// ─── In-memory store (no canister) ────────────────────────────────────────────

interface MockDraft { listPriceCents: number; description?: string; step: 1 | 2 | 3; startedAt: number }

const mock = {
  drafts:       new Map<string, MockDraft>(),
  live:         new Map<string, FsboPublicListing>(),
  history:      new Map<string, PriceEntry[]>(),
  scoreHidden:  new Set<string>(),
};

function mockPricePoint(propertyId: string, priceCents: number) {
  const h = mock.history.get(propertyId) ?? [];
  if (h.length > 0 && h[h.length - 1].priceCents === priceCents) return;
  mock.history.set(propertyId, [...h, { priceCents, recordedAt: Date.now() }].slice(-50));
}

// ─── Service ──────────────────────────────────────────────────────────────────

function createFsboService() {
  return {
    __reset() {
      mock.drafts.clear();
      mock.live.clear();
      mock.history.clear();
      mock.scoreHidden.clear();
      getActor.reset();
    },

    /** The seller's FSBO state for a property, or null when there is none. */
    async getRecord(propertyId: string): Promise<FsboRecord | null> {
      if (useMock()) {
        const live = mock.live.get(propertyId);
        if (live) return recordFromLive(live);
        const d = mock.drafts.get(propertyId);
        if (d) return { propertyId, isFsbo: false, listPriceCents: d.listPriceCents, activatedAt: d.startedAt, step: d.step, hasReport: false, description: d.description };
      }
      // E2E injection: window.__e2e_fsbo[propertyId], until the test saves its own state
      if (typeof window !== "undefined" && (window as any).__e2e_fsbo) {
        const injected = (window as any).__e2e_fsbo[propertyId];
        if (injected) return injected as FsboRecord;
      }
      if (useMock()) return null;
      const actor = await getActor();
      const [live, draft] = await Promise.all([
        actor.getFsboListing(propertyId) as Promise<any[]>,
        actor.getFsboDraft(propertyId)   as Promise<any[]>,
      ]);
      if (live[0]) return { ...recordFromLive(fromPublicListing(live[0])), description: live[0].description[0] ?? draft[0]?.description[0] ?? undefined };
      return draft[0] ? recordFromDraft(propertyId, draft[0]) : null;
    },

    /**
     * Save the seller's setup before the listing goes live. `step` is the
     * wizard step to show next (1–3). Only the property's owner can save.
     */
    async saveDraft(propertyId: string, listPriceCents: number, description: string | undefined, step: 1 | 2 | 3): Promise<FsboRecord> {
      if (!Number.isFinite(listPriceCents) || listPriceCents <= 0) throw new Error("Enter an asking price above $0.");
      const desc = description?.trim() || undefined;
      if (useMock()) {
        const prev = mock.drafts.get(propertyId);
        mock.drafts.set(propertyId, { listPriceCents, description: desc, step, startedAt: prev?.startedAt ?? Date.now() });
        return (await this.getRecord(propertyId))!;
      }
      const actor = await getActor();
      const d = unwrap(await actor.saveFsboDraft(propertyId, BigInt(Math.round(listPriceCents)), desc ? [desc] : [], BigInt(step)));
      return recordFromDraft(propertyId, d);
    },

    /** Publish the listing: it shows up in /for-sale search and on its public page. */
    async goLive(property: Property, record: FsboRecord, details: GoLiveDetails): Promise<FsboRecord> {
      const listing: FsboPublicListing = {
        propertyId:        String(property.id),
        listPriceCents:    record.listPriceCents,
        activatedAt:       Date.now(),
        address:           property.address,
        city:              property.city,
        state:             property.state,
        zipCode:           property.zipCode,
        propertyType:      property.propertyType as PropertyType,
        yearBuilt:         Number(property.yearBuilt),
        squareFeet:        Number(property.squareFeet),
        bedrooms:          Math.max(0, Math.round(details.bedrooms)),
        bathrooms:         Math.max(0, Math.round(details.bathrooms)),
        verificationLevel: property.verificationLevel as VerificationLevel,
        verifiedJobCount:  0,
        description:       record.description,
        hasPublicReport:   false,
        systemHighlights:  [],
      };
      if (useMock()) {
        mock.live.set(listing.propertyId, listing);
        mockPricePoint(listing.propertyId, listing.listPriceCents);
        mock.drafts.delete(listing.propertyId);
        return recordFromLive(listing);
      }
      const { listingService } = await import("./listing");
      await listingService.activateFsboListing({ ...listing, homeowner: property.owner });
      return (await this.getRecord(listing.propertyId))!;
    },

    /** Change the asking price of a live listing; each change is kept in the price history. */
    async updatePrice(propertyId: string, listPriceCents: number): Promise<FsboRecord> {
      if (!Number.isFinite(listPriceCents) || listPriceCents <= 0) throw new Error("Enter an asking price above $0.");
      if (useMock()) {
        const l = mock.live.get(propertyId);
        if (!l) throw new Error("This listing no longer exists.");
        const updated = { ...l, listPriceCents };
        mock.live.set(propertyId, updated);
        mockPricePoint(propertyId, listPriceCents);
        return recordFromLive(updated);
      }
      const actor = await getActor();
      return recordFromLive(fromPublicListing(unwrap(await actor.updateFsboPrice(propertyId, BigInt(Math.round(listPriceCents))))));
    },

    /**
     * Take a live listing down, or discard an unfinished setup. Either way the
     * listing's showing requests, logged offers and price history are deleted.
     */
    async deactivate(propertyId: string): Promise<void> {
      if (useMock()) {
        mock.live.delete(propertyId);
        mock.drafts.delete(propertyId);
        mock.history.delete(propertyId);
        mock.scoreHidden.delete(propertyId);
        const { showingRequestService } = await import("./showingRequest");
        const { fsboOfferService } = await import("./fsboOffer");
        showingRequestService.__clearProperty(propertyId);
        fsboOfferService.__clearProperty(propertyId);
        return;
      }
      const actor = await getActor();
      const live = (await actor.getFsboListing(propertyId)) as any[];
      if (live[0]) unwrap(await actor.deactivateFsboListing(propertyId));
      else unwrap(await actor.discardFsboDraft(propertyId));
    },

    /** Asking-price history of a live listing, oldest first. */
    async getPriceHistory(propertyId: string): Promise<PriceEntry[]> {
      if (useMock()) return [...(mock.history.get(propertyId) ?? [])];
      const actor = await getActor();
      const raw = (await actor.getFsboPriceHistory(propertyId)) as any[];
      return raw.map((p) => ({ priceCents: Number(p.priceCents), recordedAt: Number(p.recordedAt) / 1_000_000 }));
    },

    /** A live listing as buyers see it, or null when the home isn't listed. */
    async getPublicListing(propertyId: string): Promise<FsboPublicListing | null> {
      if (typeof window !== "undefined" && (window as any).__e2e_fsbo_listings) {
        const all = (window as any).__e2e_fsbo_listings as FsboPublicListing[];
        return all.find((l) => l.propertyId === propertyId) ?? null;
      }
      if (useMock()) {
        const l = mock.live.get(propertyId);
        return l ? { ...l, score: mock.scoreHidden.has(propertyId) ? undefined : l.score } : null;
      }
      const actor = await getActor();
      const raw = (await actor.getFsboListing(propertyId)) as any[];
      return raw[0] ? fromPublicListing(raw[0]) : null;
    },

    /** Show or hide the HomeGentic score on the public listing. */
    async setScoreVisible(propertyId: string, visible: boolean): Promise<void> {
      if (useMock()) {
        if (visible) mock.scoreHidden.delete(propertyId); else mock.scoreHidden.add(propertyId);
        return;
      }
      const actor = await getActor();
      unwrap(await actor.setFsboScoreVisible(propertyId, visible));
    },

    async isScoreHidden(propertyId: string): Promise<boolean> {
      if (useMock()) return mock.scoreHidden.has(propertyId);
      const actor = await getActor();
      return (await actor.isFsboScoreHidden(propertyId)) as boolean;
    },
  };
}

export const fsboService = createFsboService();
