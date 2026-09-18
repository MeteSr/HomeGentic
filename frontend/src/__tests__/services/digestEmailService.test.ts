/**
 * digestEmailService — real logic worth locking down:
 *   - send throws when 'to' is missing/blank, otherwise records it in the outbox
 *   - sendBatch sends every payload and returns one result per payload
 *   - renderHtml/renderText embed the address, headline, and every item
 *   - getOutbox returns a copy, not the internal array reference
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createDigestEmailService } from "@/services/digestEmailService";
import type { PulseDigest } from "@/services/pulseService";

function makeDigest(overrides: Partial<PulseDigest> = {}): PulseDigest {
  return {
    propertyId: "prop-1",
    season: "spring",
    headline: "Your home is in great shape this spring.",
    items: [
      { priority: "high", category: "HVAC", title: "Schedule AC tune-up", body: "It's been a year since your last service." } as any,
    ],
    ...overrides,
  } as PulseDigest;
}

describe("digestEmailService.send", () => {
  let service: ReturnType<typeof createDigestEmailService>;
  beforeEach(() => { service = createDigestEmailService(); });

  it("throws when 'to' is missing", async () => {
    await expect(service.send({ to: "", address: "123 Main St", digest: makeDigest() })).rejects.toThrow("'to' address is required");
  });

  it("throws when 'to' is blank", async () => {
    await expect(service.send({ to: "   ", address: "123 Main St", digest: makeDigest() })).rejects.toThrow("'to' address is required");
  });

  it("records a successful send in the outbox", async () => {
    const result = await service.send({ to: "owner@example.com", address: "123 Main St", digest: makeDigest() });
    expect(result.ok).toBe(true);
    expect(result.messageId).toMatch(/^MSG_/);

    const outbox = service.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "owner@example.com", propertyId: "prop-1" });
  });
});

describe("digestEmailService.sendBatch", () => {
  it("sends every payload and returns one result per payload", async () => {
    const service = createDigestEmailService();
    const results = await service.sendBatch([
      { to: "a@example.com", address: "1 A St", digest: makeDigest({ propertyId: "prop-a" }) },
      { to: "b@example.com", address: "2 B St", digest: makeDigest({ propertyId: "prop-b" }) },
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(service.getOutbox()).toHaveLength(2);
  });
});

describe("digestEmailService.renderHtml / renderText", () => {
  it("embeds the address, headline, and item titles in the HTML", () => {
    const service = createDigestEmailService();
    const html = service.renderHtml(makeDigest(), "123 Main St");
    expect(html).toContain("123 Main St");
    expect(html).toContain("Your home is in great shape this spring.");
    expect(html).toContain("Schedule AC tune-up");
    expect(html).toContain("Spring Digest");
  });

  it("embeds the address, headline, and item titles in the plain text", () => {
    const service = createDigestEmailService();
    const text = service.renderText(makeDigest(), "123 Main St");
    expect(text).toContain("123 Main St");
    expect(text).toContain("Your home is in great shape this spring.");
    expect(text).toContain("[HIGH] Schedule AC tune-up");
  });
});

describe("digestEmailService.getOutbox", () => {
  it("returns a copy, not the internal array reference", async () => {
    const service = createDigestEmailService();
    await service.send({ to: "a@example.com", address: "1 A St", digest: makeDigest() });
    const outbox = service.getOutbox();
    outbox.push({ to: "mutated", propertyId: "x", messageId: "y", sentAt: 0 });
    expect(service.getOutbox()).toHaveLength(1);
  });
});
