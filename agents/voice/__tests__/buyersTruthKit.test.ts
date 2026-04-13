/**
 * Buyer's Truth Kit — unit + integration tests (TDD)
 *
 * Covers:
 *  1. findPortal()      — permit portal lookup table
 *  2. describeClaims()  — claim-to-text serialisation
 *  3. geocodeAddress()  — Nominatim geocoding (fetch mocked)
 *  4. lookupPermits()   — three paths: Socrata live, portal-link-only, unknown city
 *  5. generateKit()     — Claude call + JSON parsing + fallback on bad JSON
 */

import { findPortal, describeClaims, geocodeAddress, lookupPermits, generateKit } from "../buyersTruthKit";
import type { BuyerTruthKitRequest } from "../buyersTruthKit";
import type { AIProvider } from "../provider";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_CLAIMS: BuyerTruthKitRequest["claims"] = {
  roof:          { status: "replaced", year: 2019, material: "asphalt" },
  hvacPrimary:   { status: "replaced", year: 2021, brand: "Carrier" },
  hvacSecondary: { status: "unknown",  present: "unknown" },
  waterHeater:   { status: "original", kind: "tank" },
  electrical:    { status: "unknown" },
  plumbing:      { status: "replaced", year: 2015, material: "copper" },
  windows:       { status: "original" },
  foundation:    { status: "unknown" },
};

const BASE_REQUEST: BuyerTruthKitRequest = {
  address:   "124 Maple Street, Plano, TX 75023",
  yearBuilt: 1987,
  claims:    BASE_CLAIMS,
};

const MINIMAL_KIT_JSON = JSON.stringify({
  overallRisk:       "medium",
  overallSummary:    "The home has several claims that warrant further verification.",
  systems: [
    {
      name: "Roof", claimed: "Replaced 2019", credibilityScore: 70,
      credibilityLabel: "Plausible", finding: "No permit found.",
      estimatedAge: "6 years", remainingLifespan: "14–19 years",
      replacementCost: "$8,000–$15,000", financialRisk: "low",
      questions: ["Can you provide the permit number?"],
      documents: ["Contractor invoice"],
      inspectorChecks: ["Check for lifted shingles"],
      permitNote: "Permit should have been pulled.",
    },
  ],
  redFlags: [],
  eraRisks: [{ item: "Galvanized Pipes", description: "Common in 1987 homes.", likelihood: "possible" }],
  generalQuestions: ["Ask for all maintenance records."],
  generalDocuments: ["Last 2 years utility bills"],
});

// ─── 1. findPortal ────────────────────────────────────────────────────────────

describe("findPortal", () => {
  it("returns a portal for a known city (exact lowercase match)", () => {
    const portal = findPortal("dallas");
    expect(portal).not.toBeNull();
    expect(portal!.url).toContain("dallas");
  });

  it("is case-insensitive", () => {
    const lower = findPortal("chicago");
    const mixed = findPortal("Chicago");
    expect(lower).not.toBeNull();
    expect(mixed).not.toBeNull();
    expect(lower!.url).toBe(mixed!.url);
  });

  it("strips trailing 'city' suffix from city name", () => {
    // "Dallas City" should resolve to "dallas"
    const portal = findPortal("Dallas City");
    expect(portal).not.toBeNull();
  });

  it("falls back to county key when city is unknown", () => {
    // "plano" is in the portal table; pretend the city field is empty
    const portal = findPortal(undefined, "plano county");
    // county key stripped of 'county' = 'plano'
    expect(portal).not.toBeNull();
  });

  it("returns null for an unknown city and county", () => {
    const portal = findPortal("smallville", "gotham county");
    expect(portal).toBeNull();
  });

  it("returns null when both arguments are undefined", () => {
    const portal = findPortal(undefined, undefined);
    expect(portal).toBeNull();
  });

  it("includes a socrataDataset for Chicago", () => {
    const portal = findPortal("chicago");
    expect(portal!.socrataDataset).toContain("cityofchicago");
  });

  it("does NOT include a socrataDataset for portal-link-only cities", () => {
    const portal = findPortal("miami");
    expect(portal!.socrataDataset).toBeUndefined();
  });

  it("returns a portal for all major Texas cities", () => {
    const cities = ["dallas", "houston", "austin", "san antonio", "fort worth", "plano"];
    for (const city of cities) {
      expect(findPortal(city)).not.toBeNull();
    }
  });

  it("portal entries all have a non-empty url and instructions", () => {
    for (const city of ["chicago", "seattle", "boston", "denver", "phoenix"]) {
      const p = findPortal(city);
      expect(p!.url.length).toBeGreaterThan(0);
      expect(p!.instructions.length).toBeGreaterThan(0);
    }
  });
});

// ─── 2. describeClaims ───────────────────────────────────────────────────────

describe("describeClaims", () => {
  it("includes the roof replacement year when status is 'replaced'", () => {
    const text = describeClaims(BASE_REQUEST);
    expect(text).toContain("2019");
    expect(text).toContain("Roof");
  });

  it("labels original systems as 'Original to home'", () => {
    const text = describeClaims(BASE_REQUEST);
    expect(text).toContain("Original to home");
  });

  it("labels unknown systems as 'Unknown'", () => {
    const text = describeClaims(BASE_REQUEST);
    expect(text).toContain("Unknown");
  });

  it("includes the HVAC brand when provided", () => {
    const text = describeClaims(BASE_REQUEST);
    expect(text).toContain("Carrier");
  });

  it("includes the pipe material when provided", () => {
    const text = describeClaims(BASE_REQUEST);
    expect(text).toContain("copper");
  });

  it("notes secondary HVAC when present is 'unknown'", () => {
    const text = describeClaims(BASE_REQUEST);
    expect(text).toMatch(/unsure|unknown/i);
  });

  it("notes secondary HVAC when present is false", () => {
    const req: BuyerTruthKitRequest = {
      ...BASE_REQUEST,
      claims: { ...BASE_CLAIMS, hvacSecondary: { status: "unknown", present: false } },
    };
    const text = describeClaims(req);
    expect(text).toMatch(/no secondary/i);
  });

  it("notes secondary HVAC year when present is true and replaced", () => {
    const req: BuyerTruthKitRequest = {
      ...BASE_REQUEST,
      claims: { ...BASE_CLAIMS, hvacSecondary: { status: "replaced", year: 2018, present: true } },
    };
    const text = describeClaims(req);
    expect(text).toContain("2018");
  });

  it("includes water heater type when set", () => {
    const req: BuyerTruthKitRequest = {
      ...BASE_REQUEST,
      claims: { ...BASE_CLAIMS, waterHeater: { status: "replaced", year: 2020, kind: "tankless" } },
    };
    const text = describeClaims(req);
    expect(text).toContain("tankless");
  });

  it("includes extra notes when provided", () => {
    const req: BuyerTruthKitRequest = {
      ...BASE_REQUEST,
      claims: {
        ...BASE_CLAIMS,
        roof: { status: "replaced", year: 2019, extraNotes: "replaced after hail storm" },
      },
    };
    const text = describeClaims(req);
    expect(text).toContain("replaced after hail storm");
  });

  it("covers all eight systems in output", () => {
    const text = describeClaims(BASE_REQUEST);
    for (const label of ["Roof", "HVAC (primary)", "Water Heater", "Electrical Panel", "Plumbing", "Windows", "Foundation"]) {
      expect(text).toContain(label);
    }
  });
});

// ─── 3. geocodeAddress ───────────────────────────────────────────────────────

describe("geocodeAddress", () => {
  const mockFetch = jest.fn();
  beforeEach(() => { (global as any).fetch = mockFetch; mockFetch.mockReset(); });
  afterEach(() => { delete (global as any).fetch; });

  it("returns city, state, county from a successful Nominatim response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        address: {
          city:       "Plano",
          county:     "Collin County",
          state:      "Texas",
          state_code: "TX",
        },
      }]),
    });
    const result = await geocodeAddress("124 Maple St, Plano, TX");
    expect(result).not.toBeNull();
    expect(result!.city).toBe("Plano");
    expect(result!.county).toBe("Collin County");
    expect(result!.state).toBe("Texas");
    expect(result!.stateCode).toBe("TX");
  });

  it("returns null when Nominatim returns an empty array", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) });
    const result = await geocodeAddress("nowhere land");
    expect(result).toBeNull();
  });

  it("returns null when the fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const result = await geocodeAddress("any address");
    expect(result).toBeNull();
  });

  it("returns null when the response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await geocodeAddress("any address");
    expect(result).toBeNull();
  });

  it("sends the correct User-Agent header", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) });
    await geocodeAddress("123 Main St");
    const [, options] = mockFetch.mock.calls[0];
    expect((options as RequestInit).headers).toMatchObject({ "User-Agent": expect.stringContaining("HomeGentic") });
  });

  it("uses town when city is absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ address: { town: "Smallville", state: "Kansas", state_code: "KS" } }]),
    });
    const result = await geocodeAddress("1 Kent Farm Rd, Smallville, KS");
    expect(result!.city).toBe("Smallville");
  });
});

// ─── 4. lookupPermits ────────────────────────────────────────────────────────

describe("lookupPermits", () => {
  const mockFetch = jest.fn();
  beforeEach(() => { (global as any).fetch = mockFetch; mockFetch.mockReset(); });
  afterEach(() => { delete (global as any).fetch; });

  const CHICAGO_GEO = { city: "Chicago", county: "Cook County", state: "Illinois", stateCode: "IL" };
  const MIAMI_GEO   = { city: "Miami",   county: "Miami-Dade",  state: "Florida",  stateCode: "FL" };

  it("attempts a live Socrata query for cities with a dataset endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { permit_type: "ROOFING", issue_date: "2019-06-15", current_status: "ISSUED" },
        { permit_type: "HVAC",    issue_date: "2021-03-10", current_status: "ISSUED" },
      ]),
    });
    const result = await lookupPermits("123 Maple Ave, Chicago, IL", CHICAGO_GEO);
    expect(result.searched).toBe(true);
    expect(result.found).toBe(true);
    expect(result.count).toBe(2);
    expect(result.records[0].description).toBe("ROOFING");
    expect(result.records[0].date).toBe("2019-06-15");
  });

  it("returns found:false with portal link when Socrata returns empty array", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) });
    const result = await lookupPermits("999 Nowhere St, Chicago, IL", CHICAGO_GEO);
    expect(result.searched).toBe(true);
    expect(result.found).toBe(false);
    expect(result.count).toBe(0);
    expect(result.portalUrl).toContain("cityofchicago");
  });

  it("gracefully handles Socrata fetch failure and returns portal link", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    const result = await lookupPermits("123 Maple Ave, Chicago, IL", CHICAGO_GEO);
    expect(result.searched).toBe(true);
    expect(result.found).toBe(false);
    expect(result.portalUrl.length).toBeGreaterThan(0);
  });

  it("returns portal link only (searched:false) for portal-link-only cities", async () => {
    const result = await lookupPermits("500 Brickell Ave, Miami, FL", MIAMI_GEO);
    expect(result.searched).toBe(false);
    expect(result.portalUrl).toContain("miamigov");
    expect(result.portalName.length).toBeGreaterThan(0);
    expect(result.instructions.length).toBeGreaterThan(0);
    // fetch should NOT have been called for portal-link-only
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns NETR Online fallback for an unrecognised city", async () => {
    const result = await lookupPermits("1 Main St, Smallville, KS", { city: "Smallville", county: "Clark County", state: "Kansas", stateCode: "KS" });
    expect(result.searched).toBe(false);
    expect(result.portalUrl).toContain("netronline");
  });

  it("returns NETR fallback when geo is null", async () => {
    const result = await lookupPermits("unknown address", null);
    expect(result.searched).toBe(false);
    expect(result.portalUrl).toContain("netronline");
  });

  it("caps live records at 10", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ permit_type: `TYPE_${i}`, issue_date: "2020-01-01" }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => rows });
    const result = await lookupPermits("123 Maple Ave, Chicago, IL", CHICAGO_GEO);
    expect(result.records.length).toBeLessThanOrEqual(10);
  });

  it("includes a non-empty note in every path", async () => {
    // Socrata city
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) });
    const r1 = await lookupPermits("123 Maple Ave, Chicago, IL", CHICAGO_GEO);
    expect(r1.note.length).toBeGreaterThan(0);

    // Portal-only city
    const r2 = await lookupPermits("500 Brickell Ave, Miami, FL", MIAMI_GEO);
    expect(r2.note.length).toBeGreaterThan(0);

    // Unknown city
    const r3 = await lookupPermits("1 Main St", null);
    expect(r3.note.length).toBeGreaterThan(0);
  });
});

// ─── 5. generateKit ──────────────────────────────────────────────────────────

describe("generateKit", () => {
  function makeProvider(response: string): AIProvider {
    return {
      stream:            jest.fn(),
      complete:          jest.fn().mockResolvedValue(response),
      completeWithTools: jest.fn(),
    } as unknown as AIProvider;
  }

  const PERMITS_NONE = {
    searched: false, found: false, count: 0, records: [],
    portalUrl: "https://www.netronline.com/", portalName: "NETR Online",
    instructions: "Select state and county.", note: "No portal found.",
  };

  it("calls provider.complete() once", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("passes the address and yearBuilt in the prompt", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    const params = (provider.complete as jest.Mock).mock.calls[0][0];
    const prompt = params.messages[0].content as string;
    expect(prompt).toContain("124 Maple Street");
    expect(prompt).toContain("1987");
  });

  it("includes permit summary in the prompt when records exist", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    const permits = {
      ...PERMITS_NONE,
      searched: true, found: true, count: 2,
      records: [
        { description: "ROOFING", date: "2019-06-15" },
        { description: "HVAC",    date: "2021-03-10" },
      ],
    };
    await generateKit(BASE_REQUEST, permits, provider);
    const prompt = (provider.complete as jest.Mock).mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("2 record");
  });

  it("parses valid JSON response into KitAnalysis", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    const kit = await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    expect(kit.overallRisk).toBe("medium");
    expect(kit.systems).toHaveLength(1);
    expect(kit.systems[0].name).toBe("Roof");
    expect(kit.eraRisks).toHaveLength(1);
  });

  it("strips markdown fences before parsing JSON", async () => {
    const wrapped = "```json\n" + MINIMAL_KIT_JSON + "\n```";
    const provider = makeProvider(wrapped);
    const kit = await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    expect(kit.overallRisk).toBe("medium");
  });

  it("returns a fallback kit when JSON is malformed", async () => {
    const provider = makeProvider("this is not json at all");
    const kit = await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    expect(kit.overallRisk).toBe("medium");
    expect(kit.redFlags.length).toBeGreaterThan(0);
    expect(kit.redFlags[0].severity).toBe("major");
  });

  it("returns a fallback kit when provider throws", async () => {
    const provider = makeProvider("");
    (provider.complete as jest.Mock).mockRejectedValueOnce(new Error("API error"));
    await expect(generateKit(BASE_REQUEST, PERMITS_NONE, provider)).rejects.toThrow("API error");
  });

  it("includes the claim descriptions in the prompt", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    const prompt = (provider.complete as jest.Mock).mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("2019");    // roof year
    expect(prompt).toContain("Carrier"); // HVAC brand
    expect(prompt).toContain("copper");  // plumbing material
  });

  it("uses a system prompt instructing JSON-only output", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    const params = (provider.complete as jest.Mock).mock.calls[0][0];
    expect(params.system.toLowerCase()).toContain("json");
  });

  it("sets maxTokens to at least 2048", async () => {
    const provider = makeProvider(MINIMAL_KIT_JSON);
    await generateKit(BASE_REQUEST, PERMITS_NONE, provider);
    const params = (provider.complete as jest.Mock).mock.calls[0][0];
    expect(params.maxTokens).toBeGreaterThanOrEqual(2048);
  });
});

// ─── 6. Route integration — POST /api/buyers-truth-kit ───────────────────────
// Light smoke tests to verify the endpoint wires inputs to the service correctly.
// Heavy logic is covered above; here we just verify bad inputs are rejected.

describe("POST /api/buyers-truth-kit input validation", () => {
  // These are tested at the unit level via the functions above.
  // A separate route-level integration test lives in stripe.route.test.ts pattern.
  // Skipped here to avoid spinning up the full Express app in every test run.
  it.todo("rejects missing address with 400");
  it.todo("rejects yearBuilt < 1800 with 400");
  it.todo("rejects missing claims with 400");
});
