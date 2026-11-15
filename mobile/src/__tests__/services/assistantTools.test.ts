/**
 * @jest-environment node
 */
// The assistant sheet used to answer every tool request with "not available
// from the mobile app", so it could only use the active home and its jobs.
// The read-only lookups now run on the phone under the signed-in identity:
//  MT.1 query_home_records reads through OQL on the six record canisters
//  MT.2 get_home_checkup lists the document vault's names, kinds and dates
//       (the other checks stay on the website, and say so)
//  MT.3 get_price_benchmark returns verified local costs, else the typical
//       U.S. range labelled national (subtypes of Other too)
//  MT.4 anything else (every tool that changes something) is not run
const mockActors: Record<string, any> = {};
const mockActorFor = jest.fn((_idl: unknown, id: string) => mockActors[id]);
jest.mock("../../services/canister", () => {
  const actual = jest.requireActual("../../services/canister");
  return { ...actual, actorFor: (idl: unknown, id: string) => mockActorFor(idl, id) };
});

function load(env: Record<string, string> = {}) {
  const ids: Record<string, string> = {
    JOB: "job-id",
    BILLS: "bills-id",
    PROPERTY: "property-id",
    MAINTENANCE: "maintenance-id",
    RECURRING: "recurring-id",
    SENSOR: "sensor-id",
    PHOTO: "photo-id",
    ...env,
  };
  for (const [k, v] of Object.entries(ids)) process.env[`EXPO_PUBLIC_${k}_CANISTER_ID`] = v;
  let mod: typeof import("../../services/assistantTools");
  jest.isolateModules(() => {
    mod = require("../../services/assistantTools");
  });
  return mod!;
}

const cell = (name: string, value: Record<string, unknown>) => ({ name, value });
const NS = 1_000_000n;

beforeEach(() => {
  jest.clearAllMocks();
  for (const id of ["job-id", "bills-id", "property-id", "maintenance-id", "recurring-id", "sensor-id"])
    mockActors[id] = { schema: jest.fn(), execute: jest.fn().mockResolvedValue({ hasMore: false, rows: [] }) };
  mockActors["job-id"].getVerifiedLocalCosts = jest.fn().mockResolvedValue([]);
  mockActors["photo-id"] = { getPhotosByJob: jest.fn().mockResolvedValue([]) };
});

describe("MT.1 query_home_records", () => {
  it.each([
    ["job", "job-id"],
    ["bills", "bills-id"],
    ["property", "property-id"],
    ["maintenance", "maintenance-id"],
    ["recurring", "recurring-id"],
    ["sensor", "sensor-id"],
  ])("runs a %s query on its canister and returns plain rows", async (source, id) => {
    mockActors[id].execute.mockResolvedValue({ hasMore: false, rows: [[cell("n", { int: 3n })]] });
    const { runAssistantTool } = load();
    const r = await runAssistantTool("query_home_records", {
      source,
      query: { start: "x", aggregate: [{ fn: "count", as: "n" }] },
    });
    expect(mockActors[id].execute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockActors[id].execute.mock.calls[0][0])).toMatchObject({ start: "x", limit: 50 });
    expect(r).toMatchObject({ success: true, data: { source, rows: [{ n: 3 }] } });
  });

  it("says so when the app wasn't built with that canister, without a call", async () => {
    const { runAssistantTool } = load({ SENSOR: "" });
    const r = await runAssistantTool("query_home_records", { source: "sensor", query: { start: "events" } });
    expect(r).toMatchObject({ success: false });
    expect(mockActorFor).not.toHaveBeenCalledWith(expect.anything(), "");
  });
});

describe("MT.2 get_home_checkup", () => {
  it("lists the vault's names, kinds and dates from both folders, newest first", async () => {
    mockActors["photo-id"].getPhotosByJob.mockImplementation(async (jobId: string) =>
      jobId === "docs_home-1"
        ? [{ id: "d1", description: "[Warranty] roof.pdf", createdAt: BigInt(Date.UTC(2025, 0, 5)) * NS }]
        : [{ id: "d0", description: "receipt.jpg", createdAt: BigInt(Date.UTC(2024, 5, 1)) * NS }],
    );
    const { runAssistantTool } = load();
    const r = await runAssistantTool("get_home_checkup", { check: "documents", property_id: "home-1" });
    expect(mockActors["photo-id"].getPhotosByJob).toHaveBeenCalledWith("docs_home-1");
    expect(mockActors["photo-id"].getPhotosByJob).toHaveBeenCalledWith("receipts_home-1");
    expect(r).toMatchObject({
      success: true,
      data: {
        check: "documents",
        total: 2,
        byKind: { Warranty: 1, Receipt: 1 },
        documents: [
          { name: "roof.pdf", kind: "Warranty", added: "2025-01-05" },
          { name: "receipt.jpg", kind: "Receipt", added: "2024-06-01" },
        ],
      },
    });
    expect(JSON.stringify(r)).toMatch(/not what the files say/);
  });

  it("reports a failed read instead of an empty vault", async () => {
    mockActors["photo-id"].getPhotosByJob.mockRejectedValue(new Error("down"));
    const { runAssistantTool } = load();
    const r = await runAssistantTool("get_home_checkup", { check: "documents", property_id: "home-1" });
    expect(r).toMatchObject({ success: false, error: expect.stringMatching(/documents/i) });
  });

  it.each(["inspection_readiness", "reserve", "recalls"])(
    "sends %s to the website rather than guessing",
    async (check) => {
      const { runAssistantTool } = load();
      const r = await runAssistantTool("get_home_checkup", { check, property_id: "home-1" });
      expect(r).toMatchObject({ success: false, error: expect.stringMatching(/homegentic\.app/) });
      expect(mockActors["photo-id"].getPhotosByJob).not.toHaveBeenCalled();
    },
  );
});

describe("MT.3 get_price_benchmark", () => {
  it("returns verified local costs, asked for by the service type's tag", async () => {
    mockActors["job-id"].getVerifiedLocalCosts.mockResolvedValue([
      { low: 12_000n, median: 20_000n, high: 35_000n, homes: 10n, area: "328xx" },
    ]);
    const { runAssistantTool } = load();
    const r = await runAssistantTool("get_price_benchmark", { service_type: "Pest Control", zip_code: "32801" });
    expect(mockActors["job-id"].getVerifiedLocalCosts).toHaveBeenCalledWith("Pest", "32801");
    expect(r).toMatchObject({
      success: true,
      data: { found: true, source: "local", low: 12_000, median: 20_000, high: 35_000, sampleSize: 10, area: "328xx" },
    });
    expect((r!.data as any).summary).toMatch(/\$120.*\$350.*10\+ homes in 328xx/);
  });

  it("falls back to the typical U.S. range, labelled national, when there are no verified local prices", async () => {
    const { runAssistantTool } = load();
    const r = await runAssistantTool("get_price_benchmark", { service_type: "Roofing", zip_code: "32801" });
    expect(r).toMatchObject({
      success: true,
      data: { found: true, source: "national", low: 800_000, median: 1_400_000, high: 2_200_000, sampleSize: 0 },
    });
    expect((r!.data as any).summary).toMatch(/national range, not local prices/);
  });

  it("gives a subtype of Other (Septic) its national range without asking the canister", async () => {
    const { runAssistantTool } = load();
    const r = await runAssistantTool("get_price_benchmark", { service_type: "Septic", zip_code: "32801" });
    expect(r).toMatchObject({ success: true, data: { found: true, source: "national", serviceType: "Septic" } });
    expect(mockActors["job-id"].getVerifiedLocalCosts).not.toHaveBeenCalled();
  });

  it("refuses something that isn't a service type", async () => {
    const { runAssistantTool } = load();
    const r = await runAssistantTool("get_price_benchmark", { service_type: "Pool Cleaning", zip_code: "32801" });
    expect(r).toMatchObject({ success: false });
    expect(mockActors["job-id"].getVerifiedLocalCosts).not.toHaveBeenCalled();
  });
});

describe("MT.4 everything else", () => {
  it.each(["accept_bid", "create_maintenance_job", "share_report", "propose_plan", "some_future_tool"])(
    "doesn't run %s",
    async (name) => {
      const { runAssistantTool, MOBILE_ASSISTANT_TOOLS } = load();
      expect(MOBILE_ASSISTANT_TOOLS.has(name)).toBe(false);
      expect(await runAssistantTool(name, {})).toBeNull();
      expect(mockActorFor).not.toHaveBeenCalled();
    },
  );

  it("runs only the three read-only lookups", () => {
    expect([...load().MOBILE_ASSISTANT_TOOLS].sort()).toEqual([
      "get_home_checkup",
      "get_price_benchmark",
      "query_home_records",
    ]);
  });
});
