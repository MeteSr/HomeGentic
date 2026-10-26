/**
 * @jest-environment node
 */
// addBill / getBillsForProperty used to throw "Not implemented", so the Upload
// a utility bill screen could never save. They now call the bills canister.
const mockActor = { addBill: jest.fn(), getBillsForProperty: jest.fn() };
jest.mock("../../services/canister", () => {
  const actual = jest.requireActual("../../services/canister");
  return { ...actual, actorFor: jest.fn(() => mockActor) };
});

function load(canisterId = "bills-id") {
  process.env.EXPO_PUBLIC_BILLS_CANISTER_ID = canisterId;
  let mod: typeof import("../../services/billService");
  jest.isolateModules(() => { mod = require("../../services/billService"); });
  return mod!;
}

const RAW = {
  id: "b1", propertyId: "p1", homeowner: { toText: () => "me" }, billType: { Electric: null },
  provider: "Duke", periodStart: "2026-09-01", periodEnd: "2026-09-30", amountCents: 12_345n,
  usageAmount: [812.5], usageUnit: ["kWh"], uploadedAt: 1_700_000_000_000_000_000n,
  anomalyFlag: true, anomalyReason: ["32% above your 3-month average"],
};

beforeEach(() => jest.clearAllMocks());

describe("addBill", () => {
  it("sends the confirmed bill to the bills canister and maps the record back", async () => {
    mockActor.addBill.mockResolvedValue({ ok: RAW });
    const { addBill } = load();
    const saved = await addBill({
      propertyId: "p1", billType: "Electric", provider: "Duke", periodStart: "2026-09-01",
      periodEnd: "2026-09-30", amountCents: 12_345, usageAmount: 812.5, usageUnit: "kWh",
    });
    expect(mockActor.addBill).toHaveBeenCalledWith({
      propertyId: "p1", billType: { Electric: null }, provider: "Duke", periodStart: "2026-09-01",
      periodEnd: "2026-09-30", amountCents: 12_345n, usageAmount: [812.5], usageUnit: ["kWh"],
    });
    expect(saved).toEqual(expect.objectContaining({
      id: "b1", billType: "Electric", amountCents: 12_345, usageAmount: 812.5,
      anomalyFlag: true, anomalyReason: "32% above your 3-month average", uploadedAt: 1_700_000_000_000,
    }));
  });

  it("omits the unit when there is no usage", async () => {
    mockActor.addBill.mockResolvedValue({ ok: { ...RAW, usageAmount: [], usageUnit: [] } });
    const { addBill } = load();
    await addBill({ propertyId: "p1", billType: "Water", provider: "City", periodStart: "a", periodEnd: "b", amountCents: 100, usageUnit: "gallons" });
    expect(mockActor.addBill.mock.calls[0][0]).toEqual(expect.objectContaining({ usageAmount: [], usageUnit: [] }));
  });

  it("throws TierLimitReachedError for the plan limit and a plain Error otherwise", async () => {
    const mod = load();
    mockActor.addBill.mockResolvedValueOnce({ err: { TierLimitReached: "Free plan: 3 bills" } });
    await expect(mod.addBill({ propertyId: "p1", billType: "Gas", provider: "x", periodStart: "a", periodEnd: "b", amountCents: 1 }))
      .rejects.toBeInstanceOf(mod.TierLimitReachedError);
    mockActor.addBill.mockResolvedValueOnce({ err: { NotAuthorized: null } });
    await expect(mod.addBill({ propertyId: "p1", billType: "Gas", provider: "x", periodStart: "a", periodEnd: "b", amountCents: 1 }))
      .rejects.toThrow("NotAuthorized");
  });

  it("says bills aren't available when the canister ID isn't set", async () => {
    const { addBill } = load("");
    await expect(addBill({ propertyId: "p1", billType: "Gas", provider: "x", periodStart: "a", periodEnd: "b", amountCents: 1 }))
      .rejects.toThrow(/aren't available/);
    expect(mockActor.addBill).not.toHaveBeenCalled();
  });
});

describe("getBillsForProperty", () => {
  it("returns the property's bills", async () => {
    mockActor.getBillsForProperty.mockResolvedValue({ ok: [RAW] });
    const { getBillsForProperty } = load();
    expect((await getBillsForProperty("p1")).map((b) => b.id)).toEqual(["b1"]);
    expect(mockActor.getBillsForProperty).toHaveBeenCalledWith("p1");
  });
});
