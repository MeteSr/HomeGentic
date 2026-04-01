/**
 * TDD — 10.3.4: showingRequestService unit tests
 *
 * In-memory store for buyer showing requests submitted via the FSBO listing page.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { showingRequestService } from "@/services/showingRequest";

describe("showingRequestService — (10.3.4)", () => {
  beforeEach(() => {
    showingRequestService.__reset();
  });

  it("create stores a request and returns it", () => {
    const req = showingRequestService.create({
      propertyId: "42",
      name: "Jane Buyer",
      contact: "jane@example.com",
      preferredTime: "Weekday evenings",
    });
    expect(req.propertyId).toBe("42");
    expect(req.name).toBe("Jane Buyer");
    expect(req.contact).toBe("jane@example.com");
    expect(req.preferredTime).toBe("Weekday evenings");
    expect(typeof req.id).toBe("string");
    expect(typeof req.createdAt).toBe("number");
  });

  it("getByProperty returns only requests for that property", () => {
    showingRequestService.create({ propertyId: "42", name: "A", contact: "a@x.com", preferredTime: "Morning" });
    showingRequestService.create({ propertyId: "99", name: "B", contact: "b@x.com", preferredTime: "Evening" });
    showingRequestService.create({ propertyId: "42", name: "C", contact: "c@x.com", preferredTime: "Weekend" });
    const results = showingRequestService.getByProperty("42");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.propertyId === "42")).toBe(true);
  });

  it("getByProperty returns empty array when no requests exist for property", () => {
    expect(showingRequestService.getByProperty("42")).toEqual([]);
  });

  it("getByProperty returns a copy — mutations don't affect internal state", () => {
    showingRequestService.create({ propertyId: "42", name: "A", contact: "a@x.com", preferredTime: "Morning" });
    const first = showingRequestService.getByProperty("42");
    first.push({ id: "x", propertyId: "42", name: "injected", contact: "", preferredTime: "", createdAt: 0 });
    expect(showingRequestService.getByProperty("42")).toHaveLength(1);
  });

  it("__reset clears all requests", () => {
    showingRequestService.create({ propertyId: "42", name: "A", contact: "a@x.com", preferredTime: "Morning" });
    showingRequestService.__reset();
    expect(showingRequestService.getByProperty("42")).toHaveLength(0);
  });

  it("each request gets a unique id", () => {
    const a = showingRequestService.create({ propertyId: "42", name: "A", contact: "a@x.com", preferredTime: "Morning" });
    const b = showingRequestService.create({ propertyId: "42", name: "B", contact: "b@x.com", preferredTime: "Evening" });
    expect(a.id).not.toBe(b.id);
  });

  it("createdAt is a recent millisecond timestamp", () => {
    const before = Date.now();
    const req = showingRequestService.create({ propertyId: "42", name: "A", contact: "a@x.com", preferredTime: "Morning" });
    const after = Date.now();
    expect(req.createdAt).toBeGreaterThanOrEqual(before);
    expect(req.createdAt).toBeLessThanOrEqual(after);
  });
});
