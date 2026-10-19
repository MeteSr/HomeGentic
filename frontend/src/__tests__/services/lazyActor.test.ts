import { describe, it, expect, vi, beforeEach } from "vitest";

const agents = vi.hoisted(() => ({ current: { id: "anonymous" } as object }));

vi.mock("@/services/actor", () => ({ getAgent: vi.fn(async () => agents.current) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn((_idl: unknown, opts: { agent: object; canisterId: string }) => ({ ...opts })) },
}));

import { Actor } from "@icp-sdk/core/agent";
import { lazyActor } from "@/services/lazyActor";

const idl = (() => ({})) as any;

describe("lazyActor", () => {
  beforeEach(() => {
    agents.current = { id: "anonymous" };
    vi.mocked(Actor.createActor).mockClear();
  });

  it("reuses one actor while the agent is unchanged", async () => {
    const get = lazyActor(idl, "job-id");
    const a = await get();
    expect(await get()).toBe(a);
    expect(Actor.createActor).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the actor when login or logout replaces the agent", async () => {
    const get = lazyActor(idl, "job-id");
    const before = await get();
    agents.current = { id: "signed-in user" };
    const after = await get();
    expect(after).not.toBe(before);
    expect((after as any).agent).toBe(agents.current);
  });

  it("reads a canister id function at creation time", async () => {
    let id = "first";
    const get = lazyActor(idl, () => id);
    expect((await get() as any).canisterId).toBe("first");
    id = "second";
    get.reset();
    expect((await get() as any).canisterId).toBe("second");
  });
});
