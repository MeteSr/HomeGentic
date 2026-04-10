/**
 * Document OCR service — mobile (Issue #51)
 *
 * Calls /api/extract-document on the voice agent to extract structured data
 * from a photo of an appliance manual, warranty card, receipt, permit, or
 * inspection report captured via the camera or picked from the photo library.
 */

const VOICE_AGENT_URL =
  process.env.EXPO_PUBLIC_VOICE_AGENT_URL ?? "http://localhost:3001";

export type DocumentType =
  | "appliance_manual"
  | "warranty"
  | "receipt"
  | "inspection"
  | "permit"
  | "unknown";

export type ExtractionConfidence = "high" | "medium" | "low";

export interface DocumentExtraction {
  documentType:    DocumentType;
  brand?:          string;
  modelNumber?:    string;
  serialNumber?:   string;
  purchaseDate?:   string;        // YYYY-MM-DD or undefined
  warrantyMonths?: number;
  serviceType?:    string;
  confidence:      ExtractionConfidence;
  description:     string;
}

export async function extractDocument(
  fileName: string,
  mimeType: string,
  base64Data: string,
): Promise<DocumentExtraction> {
  const res = await fetch(`${VOICE_AGENT_URL}/api/extract-document`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ fileName, mimeType, base64Data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Document extraction failed");
  }
  return res.json();
}

// ─── Human-readable labels ────────────────────────────────────────────────────

export function documentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    appliance_manual: "Appliance Manual",
    warranty:         "Warranty Card",
    receipt:          "Receipt",
    inspection:       "Inspection Report",
    permit:           "Permit",
    unknown:          "Document",
  };
  return labels[type] ?? "Document";
}
