/**
 * icpLedgerService — real logic worth locking down:
 *   - approve() calls icrc2_approve with the spender resolved via
 *     Principal.fromText, a 10-minute expiry from now, and a 10_000
 *     e8s fee
 *   - an Err result throws a specific "Insufficient ICP balance"
 *     message (including the balance) for InsufficientFunds, and a
 *     generic "Approve failed: <key>" message for any other variant
 *   - getBalance resolves the given principal and returns the raw
 *     icrc1_balance_of result
 *   - the actor is created once and reused; reset() clears it
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@/declarations/icp_ledger", () => ({ idlFactory: vi.fn() }));
vi.mock("@icp-sdk/core/principal", () => ({
  Principal: { fromText: vi.fn((t: string) => ({ toText: () => t, __principal: t })) },
}));

const mockActor = { icrc2_approve: vi.fn(), icrc1_balance_of: vi.fn() };
const { mockCreateActor } = vi.hoisted(() => ({ mockCreateActor: vi.fn() }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: mockCreateActor },
  HttpAgent: vi.fn(),
}));

import { icpLedgerService } from "@/services/icpLedger";

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateActor.mockReturnValue(mockActor);
  icpLedgerService.reset();
});

describe("icpLedgerService.approve — request shape", () => {
  it("sends the resolved spender, amount, and a 10_000 e8s fee", async () => {
    mockActor.icrc2_approve.mockResolvedValue({ Ok: BigInt(1) });
    const before = BigInt(Date.now()) * BigInt(1_000_000);

    await icpLedgerService.approve("aaaaa-aa", BigInt(500_000_000));

    const [args] = mockActor.icrc2_approve.mock.calls[0];
    expect(args.spender.owner.__principal).toBe("aaaaa-aa");
    expect(args.amount).toBe(BigInt(500_000_000));
    expect(args.fee).toEqual([BigInt(10_000)]);
    expect(args.expires_at[0]).toBeGreaterThan(before);
    expect(args.expires_at[0]).toBeLessThanOrEqual(before + BigInt(10 * 60 * 1_000_000_000) + BigInt(1_000_000_000));
  });
});

describe("icpLedgerService.approve — error handling", () => {
  it("throws a specific message with the balance for InsufficientFunds", async () => {
    mockActor.icrc2_approve.mockResolvedValue({ Err: { InsufficientFunds: { balance: BigInt(100) } } });
    await expect(icpLedgerService.approve("aaaaa-aa", BigInt(1))).rejects.toThrow("Insufficient ICP balance (have 100 e8s)");
  });

  it("throws a generic message naming the error key for other variants", async () => {
    mockActor.icrc2_approve.mockResolvedValue({ Err: { TemporarilyUnavailable: null } });
    await expect(icpLedgerService.approve("aaaaa-aa", BigInt(1))).rejects.toThrow("Approve failed: TemporarilyUnavailable");
  });

  it("does not throw when the result is Ok", async () => {
    mockActor.icrc2_approve.mockResolvedValue({ Ok: BigInt(1) });
    await expect(icpLedgerService.approve("aaaaa-aa", BigInt(1))).resolves.toBeUndefined();
  });
});

describe("icpLedgerService.getBalance", () => {
  it("resolves the principal and returns the raw balance", async () => {
    mockActor.icrc1_balance_of.mockResolvedValue(BigInt(9999));
    const result = await icpLedgerService.getBalance("owner-principal");

    expect(mockActor.icrc1_balance_of).toHaveBeenCalledWith({
      owner: { toText: expect.any(Function), __principal: "owner-principal" },
      subaccount: [],
    });
    expect(result).toBe(BigInt(9999));
  });
});

describe("icpLedgerService — actor caching", () => {
  it("creates the actor once and reuses it, then recreates after reset()", async () => {
    mockActor.icrc1_balance_of.mockResolvedValue(BigInt(0));
    await icpLedgerService.getBalance("a");
    await icpLedgerService.getBalance("a");
    expect(mockCreateActor).toHaveBeenCalledTimes(1);

    icpLedgerService.reset();
    await icpLedgerService.getBalance("a");
    expect(mockCreateActor).toHaveBeenCalledTimes(2);
  });
});
