/**
 * Neighborhood benchmarking service (4.3.1).
 *
 * Aggregates HomeFax scores by zip code and computes percentile rankings.
 * When NEIGHBORHOOD_CANISTER_ID is not set, returns deterministic mock data
 * generated from the zip code string so tests and dev are fully reproducible.
 *
 * Public API:
 *   neighborhoodService.getZipStats(zipCode)            → ZipCodeStats
 *   neighborhoodService.getPercentileForProperty(zip, score) → 0–100
 *   getPercentileRank(score, stats)                     → 0–100 (pure helper)
 */

const NEIGHBORHOOD_CANISTER_ID = (process.env as any).NEIGHBORHOOD_CANISTER_ID || "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZipPercentileBucket {
  label: string;            // e.g. "0–20"
  range: [number, number];  // inclusive lower, exclusive upper (except last = 100)
  count: number;
  pct: number;              // percentage of homes in this bucket (rounded to 1 dp)
}

export interface ZipTrend {
  direction: "up" | "down" | "stable";
  changePoints: number;   // avg score change vs 12 months ago (positive = improved)
}

export interface ZipCodeStats {
  zipCode:               string;
  sampleCount:           number;
  averageScore:          number;
  medianScore:           number;
  percentileBuckets:     ZipPercentileBucket[];
  topMaintenanceSystems: string[];
  trend:                 ZipTrend;
  generatedAt:           number;   // ms timestamp
}

// ─── Pure helper ──────────────────────────────────────────────────────────────

/**
 * Returns the percentile rank (0–100) of `score` within the zip's distribution.
 * Rank = percentage of homes scoring strictly BELOW this score, interpolated
 * linearly within the containing bucket.
 *
 * Examples:
 *  - score 0   → 0   (bottom)
 *  - score 100 → 100 (top)
 *  - score ≈ median → ~50
 */
export function getPercentileRank(score: number, stats: ZipCodeStats): number {
  if (score <= 0)   return 0;
  if (score >= 100) return 100;

  const buckets = stats.percentileBuckets;
  let cumulativeBelow = 0;

  for (const bucket of buckets) {
    const [lo, hi] = bucket.range;
    if (score >= hi) {
      cumulativeBelow += bucket.count;
      continue;
    }
    // score falls inside this bucket — interpolate
    const fraction = (score - lo) / (hi - lo);
    cumulativeBelow += bucket.count * fraction;
    break;
  }

  return Math.round((cumulativeBelow / stats.sampleCount) * 100);
}

// ─── Deterministic mock data generator ───────────────────────────────────────

const SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical", "Water Heater", "Windows", "Flooring"];
const TREND_DIRS: ZipTrend["direction"][] = ["up", "down", "stable"];

/** Simple non-cryptographic hash: maps a string to a 32-bit unsigned int. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Seeded LCG — call next() repeatedly for a sequence deterministic from seed. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {         // returns float in [0, 1)
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    },
    int(lo: number, hi: number): number {  // integer in [lo, hi] inclusive
      return lo + Math.floor(this.next() * (hi - lo + 1));
    },
  };
}

function buildMockStats(zipCode: string): ZipCodeStats {
  const rng = lcg(hashStr(zipCode));

  const sampleCount  = rng.int(40, 350);
  const averageScore = rng.int(38, 79);

  // Build 5 buckets [0–20], [20–40], [40–60], [60–80], [80–100]
  // Distribute sampleCount across them, biased towards the middle buckets
  const RANGES: [number, number][] = [[0,20],[20,40],[40,60],[60,80],[80,100]];
  // Raw weights that shape the distribution around averageScore
  const weights = RANGES.map(([lo, hi]) => {
    const mid = (lo + hi) / 2;
    const dist = Math.abs(mid - averageScore);
    return Math.max(1, 30 - dist);
  });
  const totalW = weights.reduce((s, w) => s + w, 0);
  // Integer counts summing to sampleCount
  const rawCounts = weights.map((w) => Math.round((w / totalW) * sampleCount));
  // Fix rounding drift on last bucket
  const diff = sampleCount - rawCounts.reduce((s, c) => s + c, 0);
  rawCounts[4] = Math.max(0, rawCounts[4] + diff);

  const percentileBuckets: ZipPercentileBucket[] = RANGES.map(([lo, hi], i) => ({
    label: `${lo}–${hi}`,
    range: [lo, hi],
    count: rawCounts[i],
    pct:   Math.round((rawCounts[i] / sampleCount) * 1000) / 10,
  }));

  // Derive medianScore from the bucket distribution (score where 50% of homes are below)
  let cumulative = 0;
  let medianScore = averageScore; // fallback
  const target = sampleCount * 0.5;
  for (const bucket of percentileBuckets) {
    const [lo, hi] = bucket.range;
    if (cumulative + bucket.count >= target) {
      const needed = target - cumulative;
      medianScore = Math.round(lo + (needed / bucket.count) * (hi - lo));
      break;
    }
    cumulative += bucket.count;
  }

  // Top maintenance systems: pick 3 from SYSTEMS
  const shuffled = [...SYSTEMS].sort(() => rng.next() - 0.5);
  const topMaintenanceSystems = shuffled.slice(0, 3);

  const trendIdx = rng.int(0, 2);
  const change   = rng.int(1, 8);
  const trend: ZipTrend = {
    direction:    TREND_DIRS[trendIdx],
    changePoints: TREND_DIRS[trendIdx] === "stable" ? 0
                : TREND_DIRS[trendIdx] === "up"      ? change : -change,
  };

  return {
    zipCode,
    sampleCount,
    averageScore,
    medianScore,
    percentileBuckets,
    topMaintenanceSystems,
    trend,
    generatedAt: Date.now(),
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createNeighborhoodService() {
  const cache = new Map<string, ZipCodeStats>();

  return {
    /**
     * Fetch aggregate stats for a zip code.
     * Results are cached in-memory for the lifetime of the service instance.
     */
    async getZipStats(zipCode: string): Promise<ZipCodeStats> {
      if (cache.has(zipCode)) return cache.get(zipCode)!;

      if (NEIGHBORHOOD_CANISTER_ID) {
        // Canister path: to be wired when the monitoring/market canister exposes
        // an aggregateByZip() query. For now falls through to mock.
      }

      const stats = buildMockStats(zipCode);
      cache.set(zipCode, stats);
      return stats;
    },

    /**
     * Convenience: return the percentile rank of a score within its zip code.
     * Result is 0–100 — "better than X% of homes in this zip."
     */
    async getPercentileForProperty(zipCode: string, score: number): Promise<number> {
      const stats = await this.getZipStats(zipCode);
      return getPercentileRank(score, stats);
    },

    reset() {
      cache.clear();
    },
  };
}

export const neighborhoodService = createNeighborhoodService();
