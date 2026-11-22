/**
 * listingService.startFeeCheckout — the winning agent's Stripe Checkout for
 * the Bid to List platform fee, opened through the voice Worker.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/services/voiceAgentHeaders", () => ({
  voiceAgentFetch: (...a: unknown[]) => fetchMock(...a),
}));

import { listingService } from "@/services/listing";

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => fetchMock.mockReset());

describe("startFeeCheckout", () => {
  it("asks the Worker for a Checkout session for that bid and returns its URL", async () => {
    fetchMock.mockResolvedValue(reply(200, { url: "https://checkout.stripe.test/s" }));
    expect(await listingService.startFeeCheckout("PROP_1")).toBe("https://checkout.stripe.test/s");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/bidtolist\/stripe\/create-checkout-session$/);
    expect(JSON.parse(init.body as string)).toEqual({ proposalId: "PROP_1" });
  });

  it("returns null when Stripe isn't set up", async () => {
    fetchMock.mockResolvedValue(reply(200, { url: null, mock: true }));
    expect(await listingService.startFeeCheckout("PROP_1")).toBeNull();
  });

  it("throws the Worker's reason when the bid can't be paid for", async () => {
    fetchMock.mockResolvedValue(reply(409, { error: "This bid is no longer open" }));
    await expect(listingService.startFeeCheckout("PROP_1")).rejects.toThrow("This bid is no longer open");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(listingService.startFeeCheckout("PROP_1")).rejects.toThrow("Couldn't open the payment page");
  });
});
