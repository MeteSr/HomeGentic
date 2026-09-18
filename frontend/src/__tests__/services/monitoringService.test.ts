/**
 * monitoringService — real logic worth locking down:
 *   - runwayDays returns null for non-positive burn, otherwise balance/burn
 *   - cyclesToUsd converts trillions of cycles to USD at the $1.39/T rate
 *   - canisterLabel truncates a long canister id to 12 chars + ellipsis
 *   - getAllCanisterMetrics/checkCycleLevels convert raw canister responses
 *     (principals via toText, bigints via Number)
 */

import { describe, it, expect, vi } from "vitest";
import { runwayDays, cyclesToUsd, canisterLabel } from "@/services/monitoringService";

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@/declarations/monitoring", () => ({ idlFactory: vi.fn() }));

describe("runwayDays", () => {
  it("returns null for zero or negative daily burn", () => {
    expect(runwayDays(1000, 0)).toBeNull();
    expect(runwayDays(1000, -5)).toBeNull();
  });

  it("divides balance by daily burn", () => {
    expect(runwayDays(1000, 100)).toBe(10);
  });
});

describe("cyclesToUsd", () => {
  it("converts 1 trillion cycles to $1.39", () => {
    expect(cyclesToUsd(1e12)).toBeCloseTo(1.39);
  });

  it("scales linearly", () => {
    expect(cyclesToUsd(2e12)).toBeCloseTo(2.78);
  });
});

describe("canisterLabel", () => {
  it("truncates a long canister id to 12 chars plus ellipsis", () => {
    expect(canisterLabel("aaaaa-aaaaa-aaaaa-aaaaa-cai")).toBe("aaaaa-aaaaa-…");
  });
});

describe("monitoringService actor methods", () => {
  it("converts raw canister metrics (principal toText, bigint Number)", async () => {
    const mockActor = {
      getAllCanisterMetrics: vi.fn().mockResolvedValue([{
        canisterId: { toText: () => "canister-1" }, cyclesBalance: BigInt(1000), cyclesBurned: BigInt(10),
        memoryBytes: BigInt(500), memoryCapacity: BigInt(5000), requestCount: BigInt(20),
        errorCount: BigInt(1), avgResponseTimeMs: BigInt(50), updatedAt: BigInt(123456),
      }]),
      checkCycleLevels: vi.fn(),
      getTrackedCanisters: vi.fn(),
      getMetrics: vi.fn(),
    };
    vi.doMock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) }, HttpAgent: vi.fn() }));

    vi.resetModules();
    const { monitoringService } = await import("@/services/monitoringService");
    const metrics = await monitoringService.getAllCanisterMetrics();

    expect(metrics).toEqual([{
      canisterId: "canister-1", cyclesBalance: 1000, cyclesBurned: 10,
      memoryBytes: 500, memoryCapacity: 5000, requestCount: 20,
      errorCount: 1, avgResponseTimeMs: 50, updatedAt: 123456,
    }]);
  });
});
