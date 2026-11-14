/**
 * Verified local costs: the owner's per-home switch for sharing finished job
 * costs (job.setCostSharing / getMyCostSharing), through jobService, against
 * the canister and in E2E mock mode (window.__e2e_cost_sharing).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { actor } = vi.hoisted(() => {
  process.env.JOB_CANISTER_ID = "job-test";
  return { actor: { getMyCostSharing: vi.fn(), setCostSharing: vi.fn() } };
});
vi.mock("@/services/lazyActor", () => ({ lazyActor: () => async () => actor }));

import { jobService } from "@/services/job";
import { hasErrorCode } from "@/services/candid";

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete (window as any).__e2e_cost_sharing;
});

describe("jobService cost sharing", () => {
  it("reads which of the owner's homes share", async () => {
    actor.getMyCostSharing.mockResolvedValue(["PROP_1", "PROP_3"]);
    expect(await jobService.getMyCostSharing()).toEqual(["PROP_1", "PROP_3"]);
  });

  it("turns sharing on and off for one home", async () => {
    actor.setCostSharing.mockResolvedValue({ ok: null });
    await jobService.setCostSharing("PROP_1", true);
    await jobService.setCostSharing("PROP_1", false);
    expect(actor.setCostSharing.mock.calls).toEqual([
      ["PROP_1", true],
      ["PROP_1", false],
    ]);
  });

  it("throws the canister's error when the change is refused", async () => {
    actor.setCostSharing.mockResolvedValue({ err: { NotAuthorized: null } });
    const err = await jobService.setCostSharing("PROP_2", true).catch((e) => e);
    expect(hasErrorCode(err, "NotAuthorized")).toBe(true);
  });

  it("keeps the switches in window.__e2e_cost_sharing in E2E mode", async () => {
    (window as any).__e2e_cost_sharing = [];
    await jobService.setCostSharing("1", true);
    expect(await jobService.getMyCostSharing()).toEqual(["1"]);
    await jobService.setCostSharing("1", false);
    expect(await jobService.getMyCostSharing()).toEqual([]);
    expect(actor.setCostSharing).not.toHaveBeenCalled();
  });
});
