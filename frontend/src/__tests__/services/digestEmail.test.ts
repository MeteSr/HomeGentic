/**
 * TDD — 8.1.3: Weekly Digest Email Delivery
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createDigestEmailService,
  type DigestEmailPayload,
  type SendResult,
} from "@/services/digestEmailService";
import type { PulseDigest } from "@/services/pulseService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDigest(overrides: Partial<PulseDigest> = {}): PulseDigest {
  return {
    propertyId:  overrides.propertyId  ?? "prop-1",
    headline:    overrides.headline    ?? "Your home needs attention this winter.",
    items: overrides.items ?? [
      { id: "1", title: "Furnace service overdue", body: "12 years since last service.", category: "HVAC",     priority: "high"   },
      { id: "2", title: "Clean gutters",           body: "Fall leaves can clog drains.", category: "Seasonal", priority: "medium" },
    ],
    climateZone: overrides.climateZone ?? 5,
    season:      overrides.season      ?? "winter",
    generatedAt: overrides.generatedAt ?? Date.now(),
  };
}

// ── renderHtml ────────────────────────────────────────────────────────────────

describe("digestEmailService.renderHtml (8.1.3)", () => {
  let svc: ReturnType<typeof createDigestEmailService>;
  beforeEach(() => { svc = createDigestEmailService(); });

  it("returns a non-empty HTML string", () => {
    const html = svc.renderHtml(makeDigest(), "100 Elm St");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<");
  });

  it("includes the digest headline", () => {
    const html = svc.renderHtml(makeDigest({ headline: "Winter prep time!" }), "100 Elm St");
    expect(html).toContain("Winter prep time!");
  });

  it("includes the property address", () => {
    const html = svc.renderHtml(makeDigest(), "42 Oak Ave");
    expect(html).toContain("42 Oak Ave");
  });

  it("includes each item title", () => {
    const html = svc.renderHtml(makeDigest(), "100 Elm St");
    expect(html).toContain("Furnace service overdue");
    expect(html).toContain("Clean gutters");
  });

  it("includes each item body text", () => {
    const html = svc.renderHtml(makeDigest(), "100 Elm St");
    expect(html).toContain("12 years since last service.");
  });

  it("marks high-priority items visually (contains 'high' or badge text)", () => {
    const html = svc.renderHtml(makeDigest(), "100 Elm St");
    expect(html.toLowerCase()).toMatch(/high|urgent|priority/);
  });

  it("includes HomeFax branding", () => {
    const html = svc.renderHtml(makeDigest(), "100 Elm St");
    expect(html.toLowerCase()).toContain("homefax");
  });
});

// ── renderText ────────────────────────────────────────────────────────────────

describe("digestEmailService.renderText (8.1.3)", () => {
  let svc: ReturnType<typeof createDigestEmailService>;
  beforeEach(() => { svc = createDigestEmailService(); });

  it("returns a plain-text string with no HTML tags", () => {
    const text = svc.renderText(makeDigest(), "100 Elm St");
    expect(text).not.toMatch(/<[^>]+>/);
  });

  it("includes the headline", () => {
    const text = svc.renderText(makeDigest({ headline: "Plain text headline" }), "100 Elm St");
    expect(text).toContain("Plain text headline");
  });

  it("includes item titles", () => {
    const text = svc.renderText(makeDigest(), "100 Elm St");
    expect(text).toContain("Furnace service overdue");
  });
});

// ── send (mock) ───────────────────────────────────────────────────────────────

describe("digestEmailService.send (8.1.3)", () => {
  let svc: ReturnType<typeof createDigestEmailService>;
  beforeEach(() => { svc = createDigestEmailService(); });

  it("returns a SendResult with ok: true", async () => {
    const result = await svc.send({
      to:      "user@example.com",
      address: "100 Elm St",
      digest:  makeDigest(),
    });
    expect(result.ok).toBe(true);
  });

  it("result includes a messageId", async () => {
    const result = await svc.send({
      to:      "user@example.com",
      address: "100 Elm St",
      digest:  makeDigest(),
    });
    expect(typeof result.messageId).toBe("string");
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it("records the send in the outbox", async () => {
    await svc.send({ to: "a@b.com", address: "1 St", digest: makeDigest({ propertyId: "p1" }) });
    const outbox = svc.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("a@b.com");
    expect(outbox[0].propertyId).toBe("p1");
  });

  it("getOutbox accumulates multiple sends", async () => {
    await svc.send({ to: "a@b.com", address: "1 St", digest: makeDigest({ propertyId: "p1" }) });
    await svc.send({ to: "c@d.com", address: "2 St", digest: makeDigest({ propertyId: "p2" }) });
    expect(svc.getOutbox()).toHaveLength(2);
  });

  it("outbox entry includes sentAt timestamp", async () => {
    const before = Date.now();
    await svc.send({ to: "x@y.com", address: "X St", digest: makeDigest() });
    const [entry] = svc.getOutbox();
    expect(entry.sentAt).toBeGreaterThanOrEqual(before);
  });

  it("rejects empty 'to' address", async () => {
    await expect(
      svc.send({ to: "", address: "1 St", digest: makeDigest() })
    ).rejects.toThrow();
  });
});

// ── sendBatch ─────────────────────────────────────────────────────────────────

describe("digestEmailService.sendBatch (8.1.3)", () => {
  let svc: ReturnType<typeof createDigestEmailService>;
  beforeEach(() => { svc = createDigestEmailService(); });

  it("sends to each recipient and returns results array", async () => {
    const payloads: DigestEmailPayload[] = [
      { to: "a@a.com", address: "1 A St", digest: makeDigest({ propertyId: "p1" }) },
      { to: "b@b.com", address: "2 B St", digest: makeDigest({ propertyId: "p2" }) },
    ];
    const results = await svc.sendBatch(payloads);
    expect(results).toHaveLength(2);
    results.forEach((r) => expect(r.ok).toBe(true));
  });

  it("returns empty array for empty input", async () => {
    expect(await svc.sendBatch([])).toHaveLength(0);
  });
});
