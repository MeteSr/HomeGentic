/**
 * feeService — real logic worth locking down:
 *   - getMyFees converts each raw canister record: principals via
 *     .toText(), the status variant object unwrapped to its key, and
 *     nanosecond timestamps converted to milliseconds
 *   - the actor is created once and reused across calls; reset()
 *     clears it so the next call creates a fresh one
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@/declarations/fee", () => ({ idlFactory: vi.fn() }));

const mockActor = { getMyFees: vi.fn() };
const { mockCreateActor } = vi.hoisted(() => ({ mockCreateActor: vi.fn() }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: mockCreateActor },
  HttpAgent: vi.fn(),
}));

import { feeService } from "@/services/fee";

function makeRawFee(overrides: Record<string, any> = {}) {
  return {
    id: "fee-1", requestId: "req-1", proposalId: "prop-1",
    agentId: { toText: () => "agent-principal" },
    homeownerId: { toText: () => "owner-principal" },
    amountCents: BigInt(50000),
    status: { Owed: null },
    createdAt: BigInt(1_700_000_000_000) * BigInt(1_000_000),
    updatedAt: BigInt(1_700_000_100_000) * BigInt(1_000_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateActor.mockReturnValue(mockActor);
  feeService.reset();
});

describe("feeService.getMyFees — conversion", () => {
  it("converts principals, unwraps the status variant, and converts ns to ms", async () => {
    mockActor.getMyFees.mockResolvedValue([makeRawFee()]);

    const fees = await feeService.getMyFees();

    expect(fees).toEqual([{
      id: "fee-1", requestId: "req-1", proposalId: "prop-1",
      agentId: "agent-principal", homeownerId: "owner-principal",
      amountCents: 50000, status: "Owed",
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000,
    }]);
  });

  it("unwraps other status variants correctly", async () => {
    mockActor.getMyFees.mockResolvedValue([makeRawFee({ status: { Paid: null } })]);
    const [fee] = await feeService.getMyFees();
    expect(fee.status).toBe("Paid");
  });
});

describe("feeService — actor caching", () => {
  it("creates the actor once and reuses it across calls", async () => {
    mockActor.getMyFees.mockResolvedValue([]);
    await feeService.getMyFees();
    await feeService.getMyFees();
    expect(mockCreateActor).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh actor after reset()", async () => {
    mockActor.getMyFees.mockResolvedValue([]);
    await feeService.getMyFees();
    feeService.reset();
    await feeService.getMyFees();
    expect(mockCreateActor).toHaveBeenCalledTimes(2);
  });
});
