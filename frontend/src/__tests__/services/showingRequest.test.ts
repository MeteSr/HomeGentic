/**
 * showingRequestService on its in-memory store (no LISTING_CANISTER_ID) and
 * the contactHref helper. services/fsboCanister.test.ts covers the canister calls.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { showingRequestService, contactHref } from "@/services/showingRequest";

const INPUT = { propertyId: "42", name: "Jane Buyer", contact: "jane@example.com", preferredTime: "Weekday evenings" };

describe("showingRequestService (in-memory store)", () => {
  beforeEach(() => {
    showingRequestService.__reset();
  });

  it("create stores a Pending request and returns it", async () => {
    const req = await showingRequestService.create(INPUT);
    expect(req).toMatchObject({ ...INPUT, status: "Pending" });
    expect(typeof req.id).toBe("string");
    expect(typeof req.createdAt).toBe("number");
  });

  it("getByProperty returns that property's requests, newest first", async () => {
    const a = await showingRequestService.create(INPUT);
    const b = await showingRequestService.create({ ...INPUT, name: "Second" });
    await showingRequestService.create({ ...INPUT, propertyId: "99" });
    expect((await showingRequestService.getByProperty("42")).map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it("accept, decline and proposeAlternate record the seller's answer", async () => {
    const a = await showingRequestService.create(INPUT);
    const b = await showingRequestService.create(INPUT);
    const c = await showingRequestService.create(INPUT);
    expect((await showingRequestService.accept("42", a.id)).status).toBe("Accepted");
    expect((await showingRequestService.decline("42", b.id)).status).toBe("Declined");
    const alt = await showingRequestService.proposeAlternate("42", c.id, "  Sunday 2pm ");
    expect(alt).toMatchObject({ status: "AlternateProposed", alternateTime: "Sunday 2pm" });
  });

  it("fails for an unknown request", async () => {
    await expect(showingRequestService.accept("42", "nope")).rejects.toThrow(/no longer exists/);
  });
});

describe("contactHref", () => {
  it("links an email with mailto:", () => {
    expect(contactHref(" jane@example.com ")).toBe("mailto:jane@example.com");
  });
  it("links a phone number with tel:", () => {
    expect(contactHref("(407) 555-0100")).toBe("tel:4075550100");
    expect(contactHref("+1 407 555 0100")).toBe("tel:+14075550100");
  });
  it("returns null for anything else", () => {
    expect(contactHref("call me")).toBeNull();
  });
});
