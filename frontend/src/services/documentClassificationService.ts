/**
 * Document Classification Service — 1.2.2
 *
 * Sends files (base64-encoded) to POST /api/classify on the voice agent proxy.
 * Claude Vision classifies the document type and extracts metadata.
 * Falls back to a rule-based mock classifier when the agent is offline.
 */
import { voiceAgentFetch } from "./voiceAgentHeaders";

const CLASSIFY_URL =
  typeof import.meta !== "undefined"
    ? `${import.meta.env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001"}/api/classify`
    : "http://localhost:3001/api/classify";

// ─── Types ────────────────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  "receipt",
  "inspection_report",
  "permit",
  "warranty",
  "invoice",
  "insurance",
  "contract",
  "photo",
  "unknown",
] as const;

export type DocumentType     = typeof DOCUMENT_TYPES[number];
export type ConfidenceLevel  = "high" | "medium" | "low";

export interface ClassificationResult {
  documentType:         DocumentType;
  confidence:           ConfidenceLevel;
  suggestedServiceType?: string;
  extractedDate?:       string;    // YYYY-MM-DD
  extractedAmountCents?: number;
  extractedContractor?: string;
  description:          string;
  rawFileName:          string;
}

// ─── Rule-based mock classifier ───────────────────────────────────────────────

const SERVICE_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/hvac|air.?condi|furnace|heat/i,    "HVAC"],
  [/roof/i,                             "Roofing"],
  [/plumb|pipe|drain|water.?heat/i,    "Plumbing"],
  [/electric|panel|wiring|circuit/i,   "Electrical"],
  [/paint/i,                            "Painting"],
  [/floor/i,                            "Flooring"],
  [/window/i,                           "Windows"],
  [/landscap|lawn|garden/i,             "Landscaping"],
];

const DOC_TYPE_RULES: Array<[RegExp, DocumentType]> = [
  [/receipt/i,                          "receipt"],
  [/permit/i,                           "permit"],
  [/inspect/i,                          "inspection_report"],
  [/warrant/i,                          "warranty"],
  [/invoice|inv[_\s-]?\d/i,            "invoice"],
  [/insurance|policy/i,                 "insurance"],
  [/contract/i,                         "contract"],
];

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);

function mockClassify(file: File): ClassificationResult {
  const name      = file.name;
  const lowerName = name.toLowerCase();

  // Document type from filename keywords
  let documentType: DocumentType = "unknown";
  for (const [pattern, type] of DOC_TYPE_RULES) {
    if (pattern.test(lowerName)) { documentType = type; break; }
  }

  // If still unknown and it's an image mime, call it a photo
  if (documentType === "unknown" && IMAGE_MIMES.has(file.type)) {
    documentType = "photo";
  }

  // Service type from filename keywords
  let suggestedServiceType: string | undefined;
  for (const [pattern, svcType] of SERVICE_TYPE_KEYWORDS) {
    if (pattern.test(lowerName)) { suggestedServiceType = svcType; break; }
  }

  const confidence: ConfidenceLevel =
    documentType !== "unknown" ? "medium" : "low";

  const descriptions: Record<DocumentType, string> = {
    receipt:           "Home improvement or contractor payment receipt",
    permit:            "Building or trade permit document",
    inspection_report: "Professional home or system inspection report",
    warranty:          "Product or workmanship warranty document",
    invoice:           "Contractor or supplier invoice",
    insurance:         "Homeowner insurance policy or claim document",
    contract:          "Contractor or service agreement",
    photo:             "Property or work-in-progress photo",
    unknown:           "Document type could not be determined",
  };

  return {
    documentType,
    confidence,
    suggestedServiceType,
    description: descriptions[documentType],
    rawFileName: name,
  };
}

// ─── File → base64 ────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDocumentClassificationService() {
  const history: ClassificationResult[] = [];

  async function classifyDocument(file: File): Promise<ClassificationResult> {
    let result: ClassificationResult;

    try {
      const base64Data = await fileToBase64(file);
      const res = await voiceAgentFetch(CLASSIFY_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data }),
        signal:  AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        result = await res.json();
        result.rawFileName = file.name;
      } else {
        result = mockClassify(file);
      }
    } catch {
      result = mockClassify(file);
    }

    history.push(result);
    return result;
  }

  async function classifyBatch(files: File[]): Promise<ClassificationResult[]> {
    return Promise.all(files.map(classifyDocument));
  }

  function getHistory(): ClassificationResult[] {
    return [...history];
  }

  return { classifyDocument, classifyBatch, getHistory };
}

export const documentClassificationService = createDocumentClassificationService();
