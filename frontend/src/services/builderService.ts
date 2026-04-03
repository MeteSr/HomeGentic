/**
 * Builder / Developer Onboarding Service — 7.2
 *
 * Covers:
 *   7.2.2  Bulk property import
 *   7.2.3  Subcontractor record import (pre-verified)
 *   7.2.4  First-buyer transfer initiation / cancellation
 *   7.2.5  getDevelopments() for BuilderDashboard
 *
 * The mock implementation is self-contained (no canister calls) and mirrors
 * the shape that the real ICP actor would return.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BulkPropertyRow {
  address:      string;
  city:         string;
  state:        string;
  zipCode:      string;
  propertyType: string;
  yearBuilt:    number;
  squareFeet:   number;
}

export interface BulkImportError {
  index:  number;  // 0-based row index
  reason: string;
}

export interface BulkImportResult {
  succeeded: string[];           // property IDs
  failed:    BulkImportError[];
}

export interface SubcontractorJobRow {
  propertyId:     string;
  serviceType:    string;
  contractorName: string;
  amountCents:    number;
  date:           string;   // YYYY-MM-DD
  description:    string;
  permitNumber?:  string;
  warrantyMonths?: number;
}

export interface JobImportError {
  index:  number;
  reason: string;
}

export interface JobImportResult {
  succeeded: string[];           // job IDs
  failed:    JobImportError[];
}

export interface PendingTransfer {
  propertyId:      string;
  buyerPrincipal:  string;
  initiatedAt:     number;  // ms
}

export interface BuilderDevelopment {
  propertyId:     string;
  address:        string;
  city:           string;
  state:          string;
  zipCode:        string;
  propertyType:   string;
  yearBuilt:      number;
  squareFeet:     number;
  jobCount:       number;
  pendingTransfer?: PendingTransfer;
}

// ─── Internal state types ─────────────────────────────────────────────────────

interface StoredProperty extends BulkPropertyRow {
  id: string;
}

interface StoredJob extends SubcontractorJobRow {
  id:       string;
  verified: boolean;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBuilderService() {
  let propCounter = 1;
  let jobCounter  = 1;

  const properties  = new Map<string, StoredProperty>();
  const jobs        = new Map<string, StoredJob>();
  const transfers   = new Map<string, PendingTransfer>();

  // ── helpers ────────────────────────────────────────────────────────────────

  function normaliseAddress(row: Pick<BulkPropertyRow, "address" | "city" | "state" | "zipCode">): string {
    return `${row.address}|${row.city}|${row.state}|${row.zipCode}`.toLowerCase();
  }

  function addressTaken(row: BulkPropertyRow): boolean {
    const key = normaliseAddress(row);
    for (const p of properties.values()) {
      if (normaliseAddress(p) === key) return true;
    }
    return false;
  }

  // ── 7.2.2 bulk property import ─────────────────────────────────────────────

  async function bulkImportProperties(rows: BulkPropertyRow[]): Promise<BulkImportResult> {
    const succeeded: string[] = [];
    const failed:    BulkImportError[] = [];
    const seenThisBatch = new Set<string>();

    rows.forEach((row, index) => {
      const key = normaliseAddress(row);
      if (addressTaken(row) || seenThisBatch.has(key)) {
        failed.push({ index, reason: "DuplicateAddress" });
        return;
      }
      const id = String(propCounter++);
      properties.set(id, { ...row, id });
      seenThisBatch.add(key);
      succeeded.push(id);
    });

    return { succeeded, failed };
  }

  function parsePropertiesCsv(csv: string): BulkPropertyRow[] {
    const lines  = csv.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const headers = lines[0].split(",").map((h) => h.trim());
    const required = ["address", "city", "state", "zipCode", "propertyType", "yearBuilt", "squareFeet"];
    for (const req of required) {
      if (!headers.includes(req)) throw new Error(`CSV missing required column: ${req}`);
    }

    return lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim());
      const get  = (col: string) => vals[headers.indexOf(col)] ?? "";
      return {
        address:      get("address"),
        city:         get("city"),
        state:        get("state"),
        zipCode:      get("zipCode"),
        propertyType: get("propertyType"),
        yearBuilt:    parseInt(get("yearBuilt"), 10),
        squareFeet:   parseInt(get("squareFeet"), 10),
      };
    });
  }

  // ── 7.2.3 subcontractor job import ─────────────────────────────────────────

  async function importSubcontractorJobs(rows: SubcontractorJobRow[]): Promise<JobImportResult> {
    const succeeded: string[] = [];
    const failed:    JobImportError[] = [];

    rows.forEach((row, index) => {
      if (!row.contractorName || row.contractorName.trim() === "") {
        failed.push({ index, reason: "contractorName is required" });
        return;
      }
      if (!row.amountCents || row.amountCents <= 0) {
        failed.push({ index, reason: "amountCents must be positive" });
        return;
      }
      const id = String(jobCounter++);
      jobs.set(id, { ...row, id, verified: true });
      succeeded.push(id);
    });

    return { succeeded, failed };
  }

  function parseJobsCsv(csv: string): SubcontractorJobRow[] {
    const lines   = csv.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const headers  = lines[0].split(",").map((h) => h.trim());
    const required = ["propertyId", "serviceType", "contractorName", "amountCents", "date", "description"];
    for (const req of required) {
      if (!headers.includes(req)) throw new Error(`CSV missing required column: ${req}`);
    }

    return lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim());
      const get  = (col: string) => vals[headers.indexOf(col)] ?? "";
      const row: SubcontractorJobRow = {
        propertyId:     get("propertyId"),
        serviceType:    get("serviceType"),
        contractorName: get("contractorName"),
        amountCents:    parseInt(get("amountCents"), 10),
        date:           get("date"),
        description:    get("description"),
      };
      if (headers.includes("permitNumber")) {
        const v = get("permitNumber");
        if (v) row.permitNumber = v;
      }
      if (headers.includes("warrantyMonths")) {
        const v = get("warrantyMonths");
        if (v) row.warrantyMonths = parseInt(v, 10);
      }
      return row;
    });
  }

  function getImportedJobs(jobId: string): StoredJob | undefined {
    return jobs.get(jobId);
  }

  // ── 7.2.4 first-buyer transfer ─────────────────────────────────────────────

  async function initiateFirstBuyerTransfer(
    propertyId: string,
    buyerPrincipal: string,
  ): Promise<PendingTransfer> {
    const transfer: PendingTransfer = {
      propertyId,
      buyerPrincipal,
      initiatedAt: Date.now(),
    };
    transfers.set(propertyId, transfer);
    return transfer;
  }

  function cancelFirstBuyerTransfer(propertyId: string): void {
    transfers.delete(propertyId);
  }

  // ── 7.2.5 dashboard ────────────────────────────────────────────────────────

  function getDevelopmentSync(propertyId: string): BuilderDevelopment | undefined {
    const prop = properties.get(propertyId);
    const pendingTransfer = transfers.get(propertyId);

    if (!prop && !pendingTransfer) return undefined;

    const jobCount = [...jobs.values()].filter((j) => j.propertyId === propertyId).length;

    return {
      propertyId,
      address:      prop?.address      ?? "",
      city:         prop?.city         ?? "",
      state:        prop?.state        ?? "",
      zipCode:      prop?.zipCode      ?? "",
      propertyType: prop?.propertyType ?? "",
      yearBuilt:    prop?.yearBuilt    ?? 0,
      squareFeet:   prop?.squareFeet   ?? 0,
      jobCount,
      pendingTransfer,
    };
  }

  async function getDevelopments(): Promise<BuilderDevelopment[]> {
    return [...properties.keys()].map((id) => getDevelopmentSync(id)!);
  }

  return {
    bulkImportProperties,
    parsePropertiesCsv,
    importSubcontractorJobs,
    parseJobsCsv,
    getImportedJobs,
    initiateFirstBuyerTransfer,
    cancelFirstBuyerTransfer,
    getDevelopmentSync,
    getDevelopments,
  };
}

// ─── Singleton (mock — no canister deployed) ──────────────────────────────────

export const builderService = createBuilderService();
