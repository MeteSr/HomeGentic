/**
 * FSBO services against the listing canister: argument encoding (Nat/Int as
 * bigint, opt as [] / [x], ms ↔ ns) and result mapping, with a mock actor
 * standing in for backend/listing/main.mo.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).LISTING_CANISTER_ID = "rdmx6-jaaaa-aaaah-test-cai";
});

const NS = 1_000_000n;
const NOW_NS = 1_700_000_000_000n * NS;

const state = vi.hoisted(() => ({
  drafts:   new Map<string, any>(),
  listings: new Map<string, any>(),
  history:  new Map<string, any[]>(),
  showings: new Map<string, any[]>(),
  offers:   new Map<string, any[]>(),
  hidden:   new Set<string>(),
  agentIdentities: [] as unknown[],
  signedIn: false,
}));

const actor = {
  getFsboListing: vi.fn(async (id: string) => (state.listings.has(id) ? [state.listings.get(id)] : [])),
  getFsboDraft:   vi.fn(async (id: string) => (state.drafts.has(id) ? [state.drafts.get(id)] : [])),
  saveFsboDraft:  vi.fn(async (id: string, cents: bigint, desc: [] | [string], step: bigint) => {
    if (state.listings.has(id)) return { err: { InvalidInput: "This home is already live" } };
    const d = { owner: {}, listPriceCents: cents, description: desc, step, startedAt: NOW_NS, updatedAt: NOW_NS };
    state.drafts.set(id, d);
    return { ok: d };
  }),
  discardFsboDraft: vi.fn(async (id: string) => { state.drafts.delete(id); return { ok: null }; }),
  activateFsboListing: vi.fn(async (l: any) => {
    state.listings.set(l.propertyId, { ...l, activatedAt: NOW_NS, score: [80n], verifiedJobCount: 4n, hasPublicReport: true });
    state.history.set(l.propertyId, [{ priceCents: l.listPriceCents, recordedAt: NOW_NS }]);
    state.drafts.set(l.propertyId, { ...state.drafts.get(l.propertyId), step: 4n });
    return { ok: null };
  }),
  deactivateFsboListing: vi.fn(async (id: string) => { state.listings.delete(id); state.drafts.delete(id); return { ok: null }; }),
  updateFsboPrice: vi.fn(async (id: string, cents: bigint) => {
    const l = state.listings.get(id);
    if (!l) return { err: { NotFound: null } };
    const u = { ...l, listPriceCents: cents };
    state.listings.set(id, u);
    state.history.get(id)!.push({ priceCents: cents, recordedAt: NOW_NS + 1n });
    return { ok: u };
  }),
  getFsboPriceHistory: vi.fn(async (id: string) => state.history.get(id) ?? []),
  setFsboScoreVisible: vi.fn(async (id: string, visible: boolean) => {
    if (visible) state.hidden.delete(id); else state.hidden.add(id);
    return { ok: state.listings.get(id) };
  }),
  isFsboScoreHidden: vi.fn(async (id: string) => state.hidden.has(id)),
  listActiveFsboListings: vi.fn(async () => [...state.listings.values()]),
  requestShowing: vi.fn(async (id: string, name: string, contact: string, time: string) => {
    if (!state.listings.has(id)) return { err: { NotFound: null } };
    const r = { id: `sr-${(state.showings.get(id) ?? []).length + 1}`, propertyId: id, requester: {}, name, contact, preferredTime: time, createdAt: NOW_NS, status: { Pending: null }, alternateTime: [] };
    state.showings.set(id, [...(state.showings.get(id) ?? []), r]);
    return { ok: r };
  }),
  getShowingRequests: vi.fn(async (id: string) => ({ ok: [...(state.showings.get(id) ?? [])].reverse() })),
  respondToShowing: vi.fn(async (id: string, reqId: string, response: any) => {
    const r = (state.showings.get(id) ?? []).find((x) => x.id === reqId);
    if (!r) return { err: { NotFound: null } };
    if ("Accept" in response) Object.assign(r, { status: { Accepted: null }, alternateTime: [] });
    if ("Decline" in response) Object.assign(r, { status: { Declined: null }, alternateTime: [] });
    if ("ProposeAlternate" in response) Object.assign(r, { status: { AlternateProposed: null }, alternateTime: [response.ProposeAlternate] });
    return { ok: r };
  }),
  logFsboOffer: vi.fn(async (id: string, input: any) => {
    const o = { id: `fo-${(state.offers.get(id) ?? []).length + 1}`, propertyId: id, ...input, status: { Active: null }, loggedAt: NOW_NS, counters: [] };
    state.offers.set(id, [...(state.offers.get(id) ?? []), o]);
    return { ok: o };
  }),
  getFsboOffers: vi.fn(async (id: string) => ({ ok: state.offers.get(id) ?? [] })),
  counterFsboOffer: vi.fn(async (id: string, offerId: string, amount: bigint, notes: string, fromSeller: boolean) => {
    const o = (state.offers.get(id) ?? []).find((x) => x.id === offerId);
    o.status = { Countered: null };
    o.counters = [...o.counters, { id: "c1", amountCents: amount, notes, fromSeller, createdAt: NOW_NS }];
    return { ok: o };
  }),
  acceptFsboOffer: vi.fn(async (id: string, offerId: string) => {
    const o = (state.offers.get(id) ?? []).find((x) => x.id === offerId);
    o.status = { Accepted: null };
    return { ok: o };
  }),
  rejectFsboOffer: vi.fn(async () => ({ err: { InvalidInput: "This offer is closed" } })),
};

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn(async () => ({
    getPrincipal: async () => ({ isAnonymous: () => !state.signedIn }),
    signedIn: true,
  })),
}));
// Buyers' showing requests go through the voice Worker (M-2), which files
// them with listing.relayRequestShowing; this stands in for both.
const workerCalls = vi.hoisted(() => [] as Array<{ url: string; body: any }>);
vi.mock("@/services/voiceAgentHeaders", () => ({
  voiceAgentFetch: vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    workerCalls.push({ url, body });
    const res = await actor.requestShowing(body.propertyId, body.name, body.contact, body.preferredTime);
    if ("err" in res) return new Response(JSON.stringify({ error: "This listing isn't live any more." }), { status: 404 });
    const r = res.ok;
    return new Response(JSON.stringify({
      id: r.id, propertyId: r.propertyId, name: r.name, contact: r.contact, preferredTime: r.preferredTime,
      createdAt: Number(r.createdAt / 1_000_000n), status: Object.keys(r.status)[0], alternateTime: null,
    }), { status: 201 });
  }),
}));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => actor) },
  HttpAgent: {
    create: vi.fn(async (opts: any) => {
      state.agentIdentities.push(opts.identity);
      return { fetchRootKey: async () => {}, visitor: true };
    }),
  },
}));

import { fsboService, listPublicFsbos } from "@/services/fsbo";
import { showingRequestService } from "@/services/showingRequest";
import { fsboOfferService } from "@/services/fsboOffer";
import type { Property } from "@/services/property";

const property: Property = {
  id: "p1", owner: "2vxsx-fae", address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801",
  propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n, verificationLevel: "Basic",
  tier: "Pro", createdAt: 0n, updatedAt: 0n, isActive: true,
};

beforeEach(() => {
  for (const m of [state.drafts, state.listings, state.history, state.showings, state.offers]) m.clear();
  state.hidden.clear();
  state.agentIdentities.length = 0;
  state.signedIn = false;
  localStorage.clear();
  fsboService.__reset();
  showingRequestService.__reset();
  fsboOfferService.__reset();
  vi.clearAllMocks();
});

async function goLive() {
  const draft = await fsboService.saveDraft("p1", 48_500_000, "Sunny", 3);
  return fsboService.goLive(property, draft, { bedrooms: 3, bathrooms: 2 });
}

describe("fsboService on the listing canister", () => {
  it("saveDraft sends bigint price/step and an opt description, and maps the draft back", async () => {
    const rec = await fsboService.saveDraft("p1", 48_500_000, " Sunny ", 2);
    expect(actor.saveFsboDraft).toHaveBeenCalledWith("p1", 48_500_000n, ["Sunny"], 2n);
    expect(rec).toEqual({
      propertyId: "p1", isFsbo: false, listPriceCents: 48_500_000, activatedAt: 1_700_000_000_000,
      step: 2, hasReport: false, description: "Sunny",
    });
    expect(await fsboService.getRecord("p1")).toEqual(rec);
  });

  it("saveDraft surfaces the canister's message", async () => {
    await goLive();
    await expect(fsboService.saveDraft("p1", 1, undefined, 2)).rejects.toThrow("This home is already live");
  });

  it("goLive sends the public listing and the record reads as live with the canister's facts", async () => {
    const rec = await goLive();
    const sent = actor.activateFsboListing.mock.calls[0][0];
    expect(sent).toMatchObject({
      propertyId: "p1", listPriceCents: 48_500_000n, address: "12 Elm St", yearBuilt: 1998n,
      squareFeet: 1850n, bedrooms: 3n, bathrooms: 2n, description: ["Sunny"], score: [], photoUrl: [],
    });
    expect(sent.homeowner.toText()).toBe("2vxsx-fae");
    expect(rec).toMatchObject({ isFsbo: true, step: "done", hasReport: true, description: "Sunny" });

    const pub = await fsboService.getPublicListing("p1");
    expect(pub).toMatchObject({ score: 80, verifiedJobCount: 4, bedrooms: 3, activatedAt: 1_700_000_000_000 });
    expect((await listPublicFsbos()).map((l) => l.propertyId)).toEqual(["p1"]);
  });

  it("updatePrice and getPriceHistory map ns timestamps to ms", async () => {
    await goLive();
    await fsboService.updatePrice("p1", 47_000_000);
    expect(actor.updateFsboPrice).toHaveBeenCalledWith("p1", 47_000_000n);
    expect(await fsboService.getPriceHistory("p1")).toEqual([
      { priceCents: 48_500_000, recordedAt: 1_700_000_000_000 },
      { priceCents: 47_000_000, recordedAt: 1_700_000_000_000 },
    ]);
  });

  it("deactivate takes a live listing down, or discards a draft", async () => {
    await goLive();
    await fsboService.deactivate("p1");
    expect(actor.deactivateFsboListing).toHaveBeenCalledWith("p1");
    await fsboService.saveDraft("p1", 1_000, undefined, 2);
    await fsboService.deactivate("p1");
    expect(actor.discardFsboDraft).toHaveBeenCalledWith("p1");
    expect(await fsboService.getRecord("p1")).toBeNull();
  });

  it("score visibility goes through setFsboScoreVisible / isFsboScoreHidden", async () => {
    await goLive();
    await fsboService.setScoreVisible("p1", false);
    expect(actor.setFsboScoreVisible).toHaveBeenCalledWith("p1", false);
    expect(await fsboService.isScoreHidden("p1")).toBe(true);
  });
});

describe("showingRequestService on the listing canister", () => {
  it("a buyer's request goes to the voice Worker, trimmed, and maps back", async () => {
    await goLive();
    workerCalls.length = 0;
    const req = await showingRequestService.create({ propertyId: "p1", name: " Ana ", contact: "ana@example.com", preferredTime: "Sat am" });
    expect(workerCalls).toHaveLength(1);
    expect(workerCalls[0].url).toMatch(/\/api\/fsbo\/showing-request$/);
    expect(workerCalls[0].body).toEqual({ propertyId: "p1", name: "Ana", contact: "ana@example.com", preferredTime: "Sat am" });
    expect(req).toMatchObject({ status: "Pending", createdAt: 1_700_000_000_000, alternateTime: undefined });
    // No browser-made visitor key any more.
    expect(state.agentIdentities).toHaveLength(0);
  });

  it("the seller reads requests newest first and records answers", async () => {
    await goLive();
    await showingRequestService.create({ propertyId: "p1", name: "A", contact: "a@example.com", preferredTime: "Sat" });
    await showingRequestService.create({ propertyId: "p1", name: "B", contact: "b@example.com", preferredTime: "Sun" });
    const reqs = await showingRequestService.getByProperty("p1");
    expect(reqs.map((r) => r.name)).toEqual(["B", "A"]);

    const alt = await showingRequestService.proposeAlternate("p1", reqs[1].id, "Mon 6pm");
    expect(actor.respondToShowing).toHaveBeenCalledWith("p1", reqs[1].id, { ProposeAlternate: "Mon 6pm" });
    expect(alt).toMatchObject({ status: "AlternateProposed", alternateTime: "Mon 6pm" });
    expect((await showingRequestService.accept("p1", reqs[0].id)).status).toBe("Accepted");
    expect(actor.respondToShowing).toHaveBeenLastCalledWith("p1", reqs[0].id, { Accept: null });
  });

  it("an unknown listing reports that it no longer exists", async () => {
    await expect(showingRequestService.create({ propertyId: "gone", name: "A", contact: "a@example.com", preferredTime: "Sat" }))
      .rejects.toThrow(/isn't live any more/);
  });
});

describe("fsboOfferService on the listing canister", () => {
  it("logOffer sends cents as bigint and the close date in ns; results map back", async () => {
    await goLive();
    const o = await fsboOfferService.logOffer("p1", {
      buyerName: "Ana", offerAmountCents: 47_500_000, earnestMoneyCents: 500_000,
      contingencies: ["inspection"], closeDateMs: 1_800_000_000_000, hasEscalationClause: true,
    });
    expect(actor.logFsboOffer).toHaveBeenCalledWith("p1", {
      buyerName: "Ana", offerAmountCents: 47_500_000n, earnestMoneyCents: 500_000n,
      contingencies: ["inspection"], closeDate: 1_800_000_000_000n * NS, hasEscalationClause: true,
    });
    expect(o).toMatchObject({ status: "Active", offerAmountCents: 47_500_000, closeDateMs: 1_800_000_000_000, counters: [] });

    const c = await fsboOfferService.addCounter("p1", o.id, { amountCents: 48_000_000, notes: "Close", fromSeller: true });
    expect(actor.counterFsboOffer).toHaveBeenCalledWith("p1", o.id, 48_000_000n, "Close", true);
    expect(c.counters[0]).toEqual({ id: "c1", amountCents: 48_000_000, notes: "Close", fromSeller: true, createdAt: 1_700_000_000_000 });

    expect((await fsboOfferService.accept("p1", o.id)).status).toBe("Accepted");
    expect((await fsboOfferService.getByProperty("p1"))[0].status).toBe("Accepted");
  });

  it("surfaces the canister's error text", async () => {
    await expect(fsboOfferService.reject("p1", "x")).rejects.toThrow("This offer is closed");
  });
});
