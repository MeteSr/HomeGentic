/**
 * FSBO (For Sale By Owner) service — Epic 10.1
 *
 * Maintains FSBO activation state per property.
 * Falls back to in-memory mock when canister is not deployed.
 */

export type FsboReadiness  = "NotReady" | "Ready" | "OptimallyReady";
export type FsboStep       = 1 | 2 | 3 | "done";

/** 10.2.3 — One entry in the price history log */
export interface PriceEntry {
  priceCents: number;
  recordedAt: number; // ms epoch
}

export interface FsboRecord {
  propertyId:     string;
  isFsbo:         boolean;
  listPriceCents: number;
  activatedAt:    number;
  step:           FsboStep;
  hasReport:      boolean;
  description?:   string;
}

export interface FsboReadinessResult {
  readiness: FsboReadiness;
  missing:   string[];
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * 10.1.4 — Compute FSBO readiness from HomeGentic score, verified job count,
 * and whether a public report already exists.
 *
 *   NotReady       — score < 65 OR verifiedJobs < 2
 *   Ready          — score >= 65 AND verifiedJobs >= 2
 *   OptimallyReady — score >= 85 AND verifiedJobs >= 3 AND hasReport
 */
export function computeFsboReadiness(
  score:            number,
  verifiedJobCount: number,
  hasReport:        boolean
): FsboReadinessResult {
  const missing: string[] = [];

  if (score < 65)            missing.push(`Improve your HomeGentic score (currently ${score} — need 65+)`);
  if (verifiedJobCount < 2)  missing.push("Add at least 2 verified maintenance jobs");

  if (missing.length > 0) return { readiness: "NotReady", missing };

  // Check Optimally Ready upgrade requirements
  const optMissing: string[] = [];
  if (score < 85)            optMissing.push("Reach HomeGentic score of 85+ for optimal listing position");
  if (verifiedJobCount < 3)  optMissing.push("Add a 3rd verified job to show comprehensive maintenance history");
  if (!hasReport)            optMissing.push("Generate a public HomeGentic report for buyer confidence");

  if (optMissing.length === 0) return { readiness: "OptimallyReady", missing: [] };

  return { readiness: "Ready", missing: optMissing };
}

/**
 * 10.1.3 — Estimated savings vs. a 3% buyer's agent commission.
 * Returns cents.
 */
export function computeAgentCommissionSavings(listPriceCents: number): number {
  return Math.round(listPriceCents * 0.03);
}

// ─── Public search types ──────────────────────────────────────────────────────

export type PropertyType      = "SingleFamily" | "Condo" | "Townhouse" | "MultiFamily";
export type VerificationLevel = "Unverified" | "PendingReview" | "Basic" | "Premium";

/**
 * Denormalised, canister-ready record for the public FSBO search index.
 * In production this is returned by a `listActiveFsbos` canister query.
 * In dev/test the in-memory `MOCK_PUBLIC_LISTINGS` array is used.
 */
export interface FsboPublicListing {
  propertyId:        string;
  listPriceCents:    number;
  activatedAt:       number;   // ms epoch — used to compute days on market
  address:           string;
  city:              string;
  state:             string;
  zipCode:           string;
  propertyType:      PropertyType;
  yearBuilt:         number;
  squareFeet:        number;
  bedrooms:          number;
  bathrooms:         number;
  verificationLevel: VerificationLevel;
  /** undefined = owner has not opted in to showing their score publicly */
  score?:            number;
  verifiedJobCount:  number;
  /** Brief description written by the seller */
  description?:      string;
  photoUrl?:         string;
  hasPublicReport:   boolean;
  /** Primary system ages shown on listing card (optional, human-readable) */
  systemHighlights?: string[];
}

// ─── Mock public listings (dev / test fallback) ───────────────────────────────

const NOW = Date.now();
const daysAgo = (n: number) => NOW - n * 86_400_000;

export const MOCK_PUBLIC_LISTINGS: FsboPublicListing[] = [
  {
    propertyId:        "101",
    listPriceCents:    42500000,
    activatedAt:       daysAgo(12),
    address:           "2847 Rosewood Trail",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78704",
    propertyType:      "SingleFamily",
    yearBuilt:         2008,
    squareFeet:        2140,
    bedrooms:          3,
    bathrooms:         2,
    verificationLevel: "Premium",
    score:             91,
    verifiedJobCount:  14,
    description:       "Meticulously maintained South Austin gem. New roof 2022, HVAC 2021, quartz kitchen remodel 2023. Full HomeGentic report available.",
    photoUrl:          "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    hasPublicReport:   true,
    systemHighlights:  ["Roof: 2 yrs", "HVAC: 3 yrs", "Water heater: 4 yrs"],
  },
  {
    propertyId:        "102",
    listPriceCents:    31800000,
    activatedAt:       daysAgo(5),
    address:           "1124 Maple Grove Ln",
    city:              "Nashville",
    state:             "TN",
    zipCode:           "37206",
    propertyType:      "SingleFamily",
    yearBuilt:         1998,
    squareFeet:        1860,
    bedrooms:          3,
    bathrooms:         2,
    verificationLevel: "Basic",
    score:             78,
    verifiedJobCount:  8,
    description:       "Charming East Nashville bungalow, 8 verified maintenance records on HomeGentic. New windows 2020, updated electrical panel.",
    photoUrl:          "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
    hasPublicReport:   false,
    systemHighlights:  ["Windows: 4 yrs", "Electrical: 6 yrs"],
  },
  {
    propertyId:        "103",
    listPriceCents:    58900000,
    activatedAt:       daysAgo(21),
    address:           "405 Lakeview Commons Dr",
    city:              "Denver",
    state:             "CO",
    zipCode:           "80203",
    propertyType:      "Condo",
    yearBuilt:         2015,
    squareFeet:        1320,
    bedrooms:          2,
    bathrooms:         2,
    verificationLevel: "Premium",
    score:             88,
    verifiedJobCount:  11,
    description:       "Luxury downtown condo with mountain views. HOA covers exterior. Interior fully documented — HVAC, plumbing, appliances all verified.",
    photoUrl:          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
    hasPublicReport:   true,
    systemHighlights:  ["HVAC: 1 yr", "Plumbing: 5 yrs"],
  },
  {
    propertyId:        "104",
    listPriceCents:    27400000,
    activatedAt:       daysAgo(33),
    address:           "8912 Pinewood Circle",
    city:              "Phoenix",
    state:             "AZ",
    zipCode:           "85016",
    propertyType:      "SingleFamily",
    yearBuilt:         1992,
    squareFeet:        1680,
    bedrooms:          3,
    bathrooms:         2,
    verificationLevel: "Basic",
    score:             undefined,   // owner opted out
    verifiedJobCount:  5,
    description:       "Solid Arcadia-area home. Pool resurfaced 2021, AC replaced 2019.",
    photoUrl:          "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80",
    hasPublicReport:   false,
    systemHighlights:  ["AC: 5 yrs", "Pool: 3 yrs"],
  },
  {
    propertyId:        "105",
    listPriceCents:    49500000,
    activatedAt:       daysAgo(7),
    address:           "331 Fernwood Ave NE",
    city:              "Portland",
    state:             "OR",
    zipCode:           "97212",
    propertyType:      "SingleFamily",
    yearBuilt:         1924,
    squareFeet:        1940,
    bedrooms:          4,
    bathrooms:         2,
    verificationLevel: "Premium",
    score:             85,
    verifiedJobCount:  19,
    description:       "Historic Alberta Arts District craftsman. Seismic retrofit 2018, full electrical upgrade, restored original hardwoods. 19 verified jobs on HomeGentic.",
    photoUrl:          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    hasPublicReport:   true,
    systemHighlights:  ["Electrical: 4 yrs", "Seismic: 6 yrs", "Roof: 3 yrs"],
  },
  {
    propertyId:        "106",
    listPriceCents:    38200000,
    activatedAt:       daysAgo(18),
    address:           "2209 Coral Ridge Blvd",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78745",
    propertyType:      "SingleFamily",
    yearBuilt:         2001,
    squareFeet:        2010,
    bedrooms:          4,
    bathrooms:         3,
    verificationLevel: "Basic",
    score:             72,
    verifiedJobCount:  7,
    description:       "South Austin 4/3, great schools. Foundation work documented and verified 2020, no active concerns.",
    photoUrl:          "https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=800&q=80",
    hasPublicReport:   false,
    systemHighlights:  ["Foundation: inspected 2020", "HVAC: 7 yrs"],
  },
  {
    propertyId:        "107",
    listPriceCents:    62100000,
    activatedAt:       daysAgo(3),
    address:           "1504 Creekside Terrace",
    city:              "Denver",
    state:             "CO",
    zipCode:           "80210",
    propertyType:      "SingleFamily",
    yearBuilt:         2019,
    squareFeet:        2800,
    bedrooms:          4,
    bathrooms:         3,
    verificationLevel: "Premium",
    score:             94,
    verifiedJobCount:  9,
    description:       "Nearly new Washington Park home — better than new because every system is already documented. Highest HomeGentic score in this zip.",
    photoUrl:          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
    hasPublicReport:   true,
    systemHighlights:  ["Roof: new", "HVAC: new", "All appliances: 5 yrs"],
  },
  {
    propertyId:        "108",
    listPriceCents:    21900000,
    activatedAt:       daysAgo(44),
    address:           "87 Oleander Court",
    city:              "Phoenix",
    state:             "AZ",
    zipCode:           "85008",
    propertyType:      "Townhouse",
    yearBuilt:         2005,
    squareFeet:        1280,
    bedrooms:          2,
    bathrooms:         2,
    verificationLevel: "Unverified",
    score:             undefined,   // opted out
    verifiedJobCount:  2,
    description:       "Low-maintenance Phoenix townhome, recently repainted interior. 2 verified records on HomeGentic.",
    photoUrl:          undefined,
    hasPublicReport:   false,
    systemHighlights:  [],
  },
  {
    propertyId:        "109",
    listPriceCents:    88500000,
    activatedAt:       daysAgo(9),
    address:           "612 Emerald Cove Way",
    city:              "Nashville",
    state:             "TN",
    zipCode:           "37215",
    propertyType:      "SingleFamily",
    yearBuilt:         2011,
    squareFeet:        3600,
    bedrooms:          5,
    bathrooms:         4,
    verificationLevel: "Premium",
    score:             96,
    verifiedJobCount:  22,
    description:       "Green Hills estate with 22 verified maintenance records — the most transparent listing in Middle Tennessee. Full report available.",
    photoUrl:          "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80",
    hasPublicReport:   true,
    systemHighlights:  ["Roof: 4 yrs", "HVAC ×2: 3 yrs", "Pool: 2 yrs", "Generator: 5 yrs"],
  },
  {
    propertyId:        "110",
    listPriceCents:    35600000,
    activatedAt:       daysAgo(27),
    address:           "4401 Birchwood Park Dr",
    city:              "Portland",
    state:             "OR",
    zipCode:           "97217",
    propertyType:      "SingleFamily",
    yearBuilt:         1955,
    squareFeet:        1510,
    bedrooms:          3,
    bathrooms:         1,
    verificationLevel: "Basic",
    score:             67,
    verifiedJobCount:  6,
    description:       "Mid-century North Portland. Oil-to-gas conversion documented, updated kitchen, full HomeGentic score available.",
    photoUrl:          "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
    hasPublicReport:   false,
    systemHighlights:  ["Heating: converted 2017", "Kitchen: 8 yrs"],
  },
  {
    propertyId:        "111",
    listPriceCents:    44800000,
    activatedAt:       daysAgo(15),
    address:           "220 Westmont Place",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78731",
    propertyType:      "Condo",
    yearBuilt:         2017,
    squareFeet:        1105,
    bedrooms:          2,
    bathrooms:         2,
    verificationLevel: "Premium",
    score:             82,
    verifiedJobCount:  10,
    description:       "Modern NW Austin high-rise condo. Verified HVAC, appliances and plumbing. Pet-friendly building, walk to Domain.",
    photoUrl:          "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
    hasPublicReport:   true,
    systemHighlights:  ["HVAC: 1 yr", "Appliances: 7 yrs"],
  },
  {
    propertyId:        "112",
    listPriceCents:    29300000,
    activatedAt:       daysAgo(60),
    address:           "7738 Ridgecrest Blvd",
    city:              "Nashville",
    state:             "TN",
    zipCode:           "37211",
    propertyType:      "SingleFamily",
    yearBuilt:         1988,
    squareFeet:        1720,
    bedrooms:          3,
    bathrooms:         2,
    verificationLevel: "Unverified",
    score:             undefined,   // opted out
    verifiedJobCount:  3,
    description:       "Antioch area with recent roof. Priced to sell.",
    photoUrl:          "https://images.unsplash.com/photo-1625602812206-5ec545ca1231?w=800&q=80",
    hasPublicReport:   false,
    systemHighlights:  ["Roof: 2 yrs"],
  },
];

/**
 * Returns all active public FSBO listings.
 * In production: calls `listActiveFsbos` canister query.
 * In dev/test: returns MOCK_PUBLIC_LISTINGS.
 */
export function listPublicFsbos(): FsboPublicListing[] {
  return MOCK_PUBLIC_LISTINGS;
}

// ─── Service ──────────────────────────────────────────────────────────────────

function createFsboService() {
  const _records = new Map<string, FsboRecord>();
  const _priceHistory = new Map<string, PriceEntry[]>();

  return {
    __reset() {
      _records.clear();
      _priceHistory.clear();
    },

    getRecord(propertyId: string): FsboRecord | null {
      return _records.get(propertyId) ?? null;
    },

    setFsboMode(propertyId: string, listPriceCents: number, description?: string): FsboRecord {
      const existing = _records.get(propertyId);
      const record: FsboRecord = {
        propertyId,
        isFsbo:         true,
        listPriceCents,
        activatedAt:    existing?.activatedAt ?? Date.now(),
        step:           existing?.step ?? 1,
        hasReport:      existing?.hasReport ?? false,
        description:    description ?? existing?.description,
      };
      _records.set(propertyId, record);
      return { ...record };
    },

    advanceStep(propertyId: string): FsboRecord {
      const rec = _records.get(propertyId);
      if (!rec) throw new Error("FSBO not activated for this property");
      const nextStep: FsboStep =
        rec.step === 1 ? 2 :
        rec.step === 2 ? 3 :
        "done";
      const updated: FsboRecord = { ...rec, step: nextStep };
      _records.set(propertyId, updated);
      return { ...updated };
    },

    deactivate(propertyId: string): void {
      _records.delete(propertyId);
    },

    // 10.2.3 — Price history

    logPriceChange(propertyId: string, priceCents: number): void {
      const existing = _priceHistory.get(propertyId) ?? [];
      _priceHistory.set(propertyId, [
        ...existing,
        { priceCents, recordedAt: Date.now() },
      ]);
    },

    getPriceHistory(propertyId: string): PriceEntry[] {
      return [...(_priceHistory.get(propertyId) ?? [])];
    },

    // 10.2.4 — Update list price on an active listing.
    updatePrice(propertyId: string, listPriceCents: number): FsboRecord {
      const rec = _records.get(propertyId);
      if (!rec) throw new Error("FSBO record not found for " + propertyId);
      const updated: FsboRecord = { ...rec, listPriceCents };
      _records.set(propertyId, updated);
      return { ...updated };
    },

    // 10.5 — Mark a property as under contract after a FSBO offer is accepted.
    setUnderContract(propertyId: string): void {
      const rec = _records.get(propertyId);
      if (rec) {
        _records.set(propertyId, { ...rec, step: "done" });
      }
    },
  };
}

export const fsboService = createFsboService();
