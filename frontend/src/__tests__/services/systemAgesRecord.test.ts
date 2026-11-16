/**
 * System install years live on the home record (property canister
 * setSystemYears / getSystemYears), so the email, the app and every browser
 * see what the owner entered. localStorage is only this browser's copy.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const saved = new Map<string, { name: string; installYear: bigint }[]>();
const mockActor = {
  getSystemYears: vi.fn(async (pid: string) =>
    pid === "theirs" ? { err: { NotAuthorized: null } } : { ok: saved.get(pid) ?? [] },
  ),
  setSystemYears: vi.fn(async (pid: string, years: { name: string; installYear: bigint }[]) => {
    if (years.some((y) => y.installYear < 1990n)) return { err: { InvalidInput: "The HVAC year is before the house was built (1990)" } };
    saved.set(pid, years);
    return { ok: years };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

process.env.PROPERTY_CANISTER_ID = "property-id";
const { systemAgesService } = await import("@/services/systemAges");

beforeEach(() => {
  saved.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("systemAgesService.save", () => {
  it("writes the years to the home record and this browser's copy", async () => {
    const out = await systemAgesService.save("p1", { HVAC: 2019, Roofing: 2012 });
    expect(out).toEqual({ HVAC: 2019, Roofing: 2012 });
    expect(mockActor.setSystemYears).toHaveBeenCalledWith("p1", [
      { name: "HVAC", installYear: 2019n },
      { name: "Roofing", installYear: 2012n },
    ]);
    expect(systemAgesService.get("p1")).toEqual({ HVAC: 2019, Roofing: 2012 });
  });

  it("throws the canister's message and leaves the local copy alone", async () => {
    systemAgesService.set("p1", { HVAC: 2000 });
    await expect(systemAgesService.save("p1", { HVAC: 1980 })).rejects.toThrow(/before the house was built/);
    expect(systemAgesService.get("p1")).toEqual({ HVAC: 2000 });
  });
});

describe("systemAgesService.load", () => {
  it("reads the record and refreshes this browser's copy", async () => {
    saved.set("p1", [{ name: "Water Heater", installYear: 2021n }]);
    systemAgesService.set("p1", { HVAC: 2000 }); // stale copy from another session
    expect(await systemAgesService.load("p1", 1990)).toEqual({ "Water Heater": 2021 });
    expect(systemAgesService.get("p1")).toEqual({ "Water Heater": 2021 });
    expect(mockActor.setSystemYears).not.toHaveBeenCalled();
  });

  it("moves years saved only in this browser up to the record once", async () => {
    systemAgesService.set("p1", { HVAC: 2018, Roofing: 1985, Plumbing: 1999 });
    // Roofing 1985 predates a 1990 build, so it can't go on the record.
    expect(await systemAgesService.load("p1", 1990)).toEqual({ HVAC: 2018, Plumbing: 1999 });
    expect(mockActor.setSystemYears).toHaveBeenCalledTimes(1);
    expect(saved.get("p1")).toEqual([
      { name: "HVAC", installYear: 2018n },
      { name: "Plumbing", installYear: 1999n },
    ]);
  });

  it("ignores names it doesn't track", async () => {
    localStorage.setItem("homegentic_system_ages_p1", JSON.stringify({ HVAC: 2018, Hottub: 2020 }));
    expect(await systemAgesService.load("p1", 1990)).toEqual({ HVAC: 2018 });
  });

  it("falls back to this browser's copy when the record can't be read", async () => {
    systemAgesService.set("theirs", { HVAC: 2018 });
    expect(await systemAgesService.load("theirs", 1990)).toEqual({ HVAC: 2018 });
  });

  it("returns {} for a home with nothing saved anywhere", async () => {
    expect(await systemAgesService.load("p2", 1990)).toEqual({});
    expect(mockActor.setSystemYears).not.toHaveBeenCalled();
  });
});
