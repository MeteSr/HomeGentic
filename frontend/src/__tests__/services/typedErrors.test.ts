/**
 * listing and market calls that used to throw a canister #err as JSON text
 * now throw a typed CanisterError (test-gap audit 2026-11-03; see
 * errorModelGate.test.ts), so pages can show its copy and branch on its tag.
 */

import { describe, it, expect, vi } from "vitest";

const err = { err: { InvalidInput: "That proposal is already closed." } };
// Any method answers with the error; "then" stays undefined so awaiting the actor works.
const actor = new Proxy({} as Record<string, unknown>, {
  get: (_t, k) => (k === "then" ? undefined : vi.fn(async () => err)),
});
vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => actor) }, HttpAgent: vi.fn() }));

import { listingService } from "@/services/listing";
import { submitScore, getMyScoreEncrypted } from "@/services/market";
import { hasErrorCode, errorMessage } from "@/services/candid";

const calls: [string, () => Promise<unknown>][] = [
  ["listing.flagPhotoForReview", () => listingService.flagPhotoForReview("ph1")],
  ["listing.reviewPhoto", () => listingService.reviewPhoto("ph1")],
  ["listing.withdrawProposal", () => listingService.withdrawProposal("pr1")],
  ["listing.postMessage", () => listingService.postMessage("pr1", "hello", "Homeowner" as any)],
  ["listing.getThread", () => listingService.getThread("pr1")],
  ["listing.deactivateFsboListing", () => listingService.deactivateFsboListing("p1")],
  ["market.submitScore", () => submitScore("p1")],
  ["market.getMyScoreEncrypted", () => getMyScoreEncrypted(new Uint8Array([1]))],
];

describe("canister errors are typed", () => {
  it.each(calls)("%s throws a CanisterError carrying the canister's text", async (_name, call) => {
    const e = await call().catch((x) => x);
    expect(hasErrorCode(e, "InvalidInput")).toBe(true);
    expect(errorMessage(e, "fallback")).toBe("That proposal is already closed.");
  });
});
