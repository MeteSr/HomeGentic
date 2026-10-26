/**
 * Pure helper functions for the /api/extract-document endpoint (Issue #51).
 *
 * Kept separate from server.ts so they can be unit-tested without spinning
 * up the Express app or calling the Anthropic API.
 */

export type DocumentType =
  | "appliance_label"
  | "appliance_manual"
  | "warranty"
  | "receipt"
  | "inspection"
  | "permit"
  | "unknown";

export type ExtractionConfidence = "high" | "medium" | "low";

export interface DocumentExtraction {
  documentType:   DocumentType;
  brand?:         string;
  modelNumber?:   string;
  serialNumber?:  string;
  purchaseDate?:  string;        // YYYY-MM-DD or omit
  warrantyMonths?: number;
  serviceType?:   string;
  /** appliance_label only: what the appliance is, e.g. "Water Heater". */
  applianceType?: ApplianceType;
  /** appliance_label only: year made, printed or decoded from the serial; omitted when unsure. */
  manufactureYear?: number;
  confidence:     ExtractionConfidence;
  description:    string;
}

export const APPLIANCE_TYPES = [
  "Water Heater", "HVAC", "Refrigerator", "Dishwasher", "Washer", "Dryer", "Range", "Microwave",
  "Garbage Disposal", "Water Softener", "Other",
] as const;
export type ApplianceType = typeof APPLIANCE_TYPES[number];

export const SUPPORTED_DOC_TYPES: DocumentType[] = [
  "appliance_label",
  "appliance_manual",
  "warranty",
  "receipt",
  "inspection",
  "permit",
  "unknown",
];

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

// ─── normalizeDocumentType ────────────────────────────────────────────────────

/**
 * Coerce any raw string from the LLM response into a valid DocumentType.
 * Falls back to "unknown" for unrecognized values.
 */
export function normalizeDocumentType(raw: unknown): DocumentType {
  if (typeof raw !== "string") return "unknown";
  const lower = raw.toLowerCase().replace(/[^a-z_]/g, "");
  const match = SUPPORTED_DOC_TYPES.find((t) => t === lower);
  return match ?? "unknown";
}

// ─── normalizeConfidence ──────────────────────────────────────────────────────

export function normalizeConfidence(raw: unknown): ExtractionConfidence {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "low";
}

// ─── normalizeWarrantyMonths ──────────────────────────────────────────────────

/**
 * Coerce the LLM's warrantyMonths output to a positive integer or undefined.
 * Handles strings ("60"), floats (12.5 → 12), and negatives/zero (→ undefined).
 */
export function normalizeWarrantyMonths(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

// ─── normalizePurchaseDate ────────────────────────────────────────────────────

/**
 * Accept "YYYY-MM-DD" only; return undefined for anything else.
 */
export function normalizePurchaseDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined;
}

// ─── normalizeManufactureYear ─────────────────────────────────────────────────

/** A plausible four-digit year (1950 to next year), else undefined. */
export function normalizeManufactureYear(raw: unknown, now = new Date()): number | undefined {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isInteger(n) || n < 1950 || n > now.getFullYear() + 1) return undefined;
  return n;
}

export function normalizeApplianceType(raw: unknown): ApplianceType | undefined {
  if (typeof raw !== "string") return undefined;
  return APPLIANCE_TYPES.find((t) => t.toLowerCase() === raw.trim().toLowerCase());
}

// ─── normalizeExtraction ──────────────────────────────────────────────────────

/**
 * Takes the raw JSON object from the LLM and returns a typed DocumentExtraction.
 * Unknown / missing fields are normalised to safe defaults rather than throwing.
 */
export function normalizeExtraction(raw: Record<string, unknown>): DocumentExtraction {
  return {
    documentType:  normalizeDocumentType(raw.documentType),
    brand:         typeof raw.brand        === "string" && raw.brand        ? raw.brand        : undefined,
    modelNumber:   typeof raw.modelNumber  === "string" && raw.modelNumber  ? raw.modelNumber  : undefined,
    serialNumber:  typeof raw.serialNumber === "string" && raw.serialNumber ? raw.serialNumber : undefined,
    purchaseDate:  normalizePurchaseDate(raw.purchaseDate),
    warrantyMonths: normalizeWarrantyMonths(raw.warrantyMonths),
    serviceType:   typeof raw.serviceType  === "string" && raw.serviceType  ? raw.serviceType  : undefined,
    applianceType:   normalizeApplianceType(raw.applianceType),
    manufactureYear: normalizeManufactureYear(raw.manufactureYear),
    confidence:    normalizeConfidence(raw.confidence),
    description:   typeof raw.description  === "string" ? raw.description   : "No description provided",
  };
}

// ─── buildDocumentSystemPrompt ────────────────────────────────────────────────

export function buildDocumentSystemPrompt(): string {
  return `You are a home document extractor for the HomeGentic home management platform.
Extract structured data from the uploaded document: a photo of an appliance's rating/data label, an appliance manual, warranty card, receipt, permit, or inspection report.
Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "documentType": "<one of: appliance_label|appliance_manual|warranty|receipt|inspection|permit|unknown>",
  "brand": "<brand/manufacturer name, e.g. LG, Carrier, Rheem — omit if not present>",
  "modelNumber": "<model number — omit if not present>",
  "serialNumber": "<serial number — omit if not present>",
  "purchaseDate": "<YYYY-MM-DD — omit if unclear>",
  "warrantyMonths": <integer warranty duration in months, e.g. 60 for 5 years — omit if not stated>,
  "serviceType": "<one of: HVAC|Plumbing|Electrical|Roofing|Appliance|Other — omit if not applicable>",
  "applianceType": "<appliance_label only, one of: ${APPLIANCE_TYPES.join("|")} — omit otherwise>",
  "manufactureYear": <appliance_label only: four-digit year of manufacture if printed on the label, or if you are confident how this brand encodes it in the serial number — omit if unsure>,
  "confidence": "<high|medium|low>",
  "description": "<one sentence describing what you see>"
}`;
}
