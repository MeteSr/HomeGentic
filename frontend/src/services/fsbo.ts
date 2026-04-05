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

    setFsboMode(propertyId: string, listPriceCents: number): FsboRecord {
      const existing = _records.get(propertyId);
      const record: FsboRecord = {
        propertyId,
        isFsbo:         true,
        listPriceCents,
        activatedAt:    existing?.activatedAt ?? Date.now(),
        step:           existing?.step ?? 1,
        hasReport:      existing?.hasReport ?? false,
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
