/**
 * Home document vault: what kinds of papers a property keeps, and how a
 * document's type travels in the photo record's `description` text
 * ("[Type] filename"). Encoding the type in text means a new kind of paper
 * never changes a stored record on the photo canister.
 */
import type { AccessRole } from "@/services/property";

export { DOC_TYPES, DOC_TYPE_LABELS, parseDoc, type DocType, type ParsedDoc } from "@homegentic/shared/documentVault";
import type { DocType } from "@homegentic/shared/documentVault";

export interface DocGroup {
  key: string;
  label: string;
  types: readonly DocType[];
}

export const DOC_GROUPS: readonly DocGroup[] = [
  { key: "ownership", label: "Ownership and closing", types: ["Deed", "Closing", "Title", "Survey"] },
  { key: "insurance", label: "Insurance and risk", types: ["Insurance", "Elevation"] },
  { key: "home", label: "Home and HOA", types: ["HOA", "Manual"] },
  { key: "work", label: "Work records", types: ["Receipt", "Invoice", "Permit", "Inspection", "Warranty", "LienWaiver", "NOC"] },
  { key: "other", label: "Other", types: ["Other"] },
];

export function docGroupOf(type: DocType): DocGroup {
  return DOC_GROUPS.find((g) => g.types.includes(type)) ?? DOC_GROUPS[DOC_GROUPS.length - 1];
}

export function encodeDoc(type: DocType, filename: string): string {
  return `[${type}] ${filename}`;
}

/** #716: a close-out paper filed against one job ("[LienWaiver] jobId|filename"). */
export function encodeJobPaper(type: "LienWaiver" | "NOC", jobId: string, filename: string): string {
  return `[${type}] ${jobId}|${filename}`;
}

export function encodePermit(permitNumber: string, authority: string, status: string, filename: string): string {
  return `[Permit] ${permitNumber}|${authority}|${status}|${filename}`;
}

export function encodeInspection(inspector: string, status: string, filename: string): string {
  return `[Inspection] ${inspector}|${status}|${filename}`;
}

/** The Add Property wizard's document picker uses its own labels. */
const ONBOARDING_TYPES: Record<string, DocType> = {
  Receipt: "Receipt",
  Invoice: "Invoice",
  Permit: "Permit",
  "Warranty Card": "Warranty",
  "Inspection Report": "Inspection",
};

export function docTypeFromOnboardingLabel(label: string): DocType {
  return ONBOARDING_TYPES[label] ?? "Other";
}

/**
 * Whether this role may upload or remove documents. The photo canister lets
 * anyone with write access to the property do both, and still checks every
 * call; an unknown role (property canister unreachable) shows the controls.
 */
export function canEditDocuments(role: AccessRole | null): boolean {
  return role === null || role === "Owner" || role === "CoOwner" || role === "Manager";
}
