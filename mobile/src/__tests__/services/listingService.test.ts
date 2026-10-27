import {
  byOfferPriority, contactHref, currentAmountCents, fromOffer, fromShowing, FsboOffer, isOfferOpen,
  listingErrorMessage, parseDollars,
} from "../../services/listingService";
import { listingSummary } from "../../screens/v3/MyListingScreen";

const NS = BigInt(1_000_000);

function rawOffer(over: Partial<Record<string, any>> = {}) {
  return {
    id: "o1", propertyId: "p1", buyerName: "Sam Lee",
    offerAmountCents: BigInt(42_500_000), earnestMoneyCents: BigInt(1_000_000),
    contingencies: ["Inspection"], closeDate: BigInt(1_800_000_000_000) * NS, hasEscalationClause: false,
    status: { Active: null }, loggedAt: BigInt(1_790_000_000_000) * NS, counters: [], ...over,
  };
}

describe("listing converters", () => {
  it("reads a showing request, including an alternate time", () => {
    const s = fromShowing({
      id: "s1", propertyId: "p1", requester: {}, name: "Ana", contact: "ana@example.com", preferredTime: "Sat 10am",
      createdAt: BigInt(1_790_000_000_000) * NS, status: { AlternateProposed: null }, alternateTime: ["Sun 2pm"],
    });
    expect(s).toMatchObject({ id: "s1", status: "AlternateProposed", alternateTime: "Sun 2pm", createdAt: 1_790_000_000_000 });
  });

  it("reads an offer and its counters; the latest counter is the amount on the table", () => {
    const o = fromOffer(rawOffer({
      status: { Countered: null },
      counters: [
        { id: "c1", amountCents: BigInt(43_000_000), notes: "", fromSeller: true, createdAt: BigInt(1) * NS },
        { id: "c2", amountCents: BigInt(42_800_000), notes: "meet halfway", fromSeller: false, createdAt: BigInt(2) * NS },
      ],
    }));
    expect(o.status).toBe("Countered");
    expect(o.offerAmountCents).toBe(42_500_000);
    expect(currentAmountCents(o)).toBe(42_800_000);
    expect(isOfferOpen(o)).toBe(true);
  });

  it("lists open offers before closed ones, newest first", () => {
    const a = fromOffer(rawOffer({ id: "a", status: { Rejected: null }, loggedAt: BigInt(3) * NS }));
    const b = fromOffer(rawOffer({ id: "b", loggedAt: BigInt(1) * NS }));
    const c = fromOffer(rawOffer({ id: "c", loggedAt: BigInt(2) * NS }));
    expect([a, b, c].sort(byOfferPriority).map((o) => o.id)).toEqual(["c", "b", "a"]);
  });
});

describe("listing helpers", () => {
  it("parses dollar amounts the way people type them", () => {
    expect(parseDollars("425,000")).toBe(42_500_000);
    expect(parseDollars("$425000.50")).toBe(42_500_050);
    expect(parseDollars("0")).toBeNull();
    expect(parseDollars("four hundred")).toBeNull();
    expect(parseDollars("")).toBeNull();
  });

  it("links a buyer's email or phone, and nothing else", () => {
    expect(contactHref("ana@example.com")).toBe("mailto:ana@example.com");
    expect(contactHref("(407) 555-0100")).toBe("tel:4075550100");
    expect(contactHref("text me")).toBeNull();
  });

  it("explains canister errors in plain English", () => {
    expect(listingErrorMessage({ InvalidInput: "This offer is closed" })).toBe("This offer is closed");
    expect(listingErrorMessage({ NotAuthorized: null })).toMatch(/only the seller/i);
  });
});

describe("listingSummary", () => {
  const offer = (status: FsboOffer["status"]) => ({ ...fromOffer(rawOffer()), status });
  const showing = (status: any) => ({ id: "s", name: "Ana", contact: "", preferredTime: "", createdAt: 0, status });

  it("says what's waiting on the seller", () => {
    expect(listingSummary([showing("Pending"), showing("Accepted")], [offer("Active")])).toBe("1 showing request needs a reply and 1 open offer.");
    expect(listingSummary([], [])).toBe("Nothing waiting on you.");
  });

  it("leads with an accepted offer", () => {
    expect(listingSummary([showing("Pending")], [offer("Accepted")])).toMatch(/You accepted Sam Lee's offer of \$425,000/);
  });
});
