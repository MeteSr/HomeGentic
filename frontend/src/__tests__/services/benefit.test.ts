/**
 * benefit (redeemQuorumCoupon) — real logic worth locking down:
 *   - with no VITE_QUORUM_BENEFIT_CANISTER_ID configured (this repo's
 *     actual default in this environment), redemption short-circuits
 *     to { err: { NotFound } } without ever calling getAgent or
 *     creating an actor — the deployment-safe no-op path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAgent } = vi.hoisted(() => ({ mockGetAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@/services/actor", () => ({ getAgent: mockGetAgent }));

const mockActor = { redeemCoupon: vi.fn() };
const { mockCreateActor } = vi.hoisted(() => ({ mockCreateActor: vi.fn(() => mockActor) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: mockCreateActor },
  HttpAgent: vi.fn(),
}));

import { redeemQuorumCoupon } from "@/services/benefit";

beforeEach(() => vi.clearAllMocks());

describe("redeemQuorumCoupon — no canister configured", () => {
  it("short-circuits to NotFound without calling getAgent or creating an actor", async () => {
    const result = await redeemQuorumCoupon("CODE123");

    expect(result).toEqual({ err: { NotFound: null } });
    expect(mockGetAgent).not.toHaveBeenCalled();
    expect(mockCreateActor).not.toHaveBeenCalled();
    expect(mockActor.redeemCoupon).not.toHaveBeenCalled();
  });

  it("returns the same NotFound short-circuit regardless of the code passed", async () => {
    const result = await redeemQuorumCoupon("ANY-OTHER-CODE");
    expect(result).toEqual({ err: { NotFound: null } });
  });
});
