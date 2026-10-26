import { describe, it, expect, vi, beforeEach } from "vitest";
import { recallItems, checkRecalls } from "@/services/recalls";

const room = (fixtures: Array<{ brand: string; model: string }>) =>
  ({ fixtures: fixtures.map((f, i) => ({ id: String(i), serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "", ...f })) }) as any;

describe("recallItems", () => {
  it("keeps fixtures with a brand and model, once each", () => {
    expect(recallItems([
      room([{ brand: "Rheem", model: "XE50" }, { brand: "rheem ", model: "xe50" }, { brand: "GE", model: "" }]),
      room([{ brand: "", model: "ABC" }, { brand: "LG", model: "WM3400" }]),
    ])).toEqual([{ brand: "Rheem", model: "XE50" }, { brand: "LG", model: "WM3400" }]);
  });
});

describe("checkRecalls", () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("asks the Worker once a day per set of appliances", async () => {
    const matches = [{ brand: "Rheem", model: "XE50", recalls: [] }];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ matches })));
    const items = [{ brand: "Rheem", model: "XE50" }];
    expect(await checkRecalls(items)).toEqual(matches);
    expect(await checkRecalls(items)).toEqual(matches);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/recalls$/);
  });

  it("skips the call when there is nothing to check", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await checkRecalls([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
