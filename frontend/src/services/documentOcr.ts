/**
 * Document OCR service (Issue #51)
 *
 * Calls /api/extract-document on the voice agent to extract structured data
 * from an appliance manual, warranty card, receipt, inspection report, or permit.
 */

const VOICE_AGENT_URL =
  (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

export type DocumentType =
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
  purchaseDate?:  string;
  warrantyMonths?: number;
  serviceType?:   string;
  confidence:     ExtractionConfidence;
  description:    string;
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

/** Read a File object as a base64 string. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
