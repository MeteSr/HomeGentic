/**
 * Home document vault: what kinds of papers a property keeps, and how a
 * document's type travels in the photo record's `description` text
 * ("[Type] filename"). Encoding the type in text means a new kind of paper
 * never changes a stored record on the photo canister.
 */
import type { AccessRole } from "@/services/property";

export const DOC_TYPES = [
  "Receipt",
  "Invoice",
  "Permit",
  "Inspection",
  "Warranty",
  "Deed",
  "Closing",
  "Title",
  "Survey",
  "Insurance",
  "Elevation",
  "HOA",
  "Manual",
  "Other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  Receipt: "Receipt",
  Invoice: "Invoice",
  Permit: "Permit",
  Inspection: "Inspection report",
  Warranty: "Warranty",
  Deed: "Deed",
  Closing: "Closing papers",
  Title: "Title policy",
  Survey: "Survey",
  Insurance: "Insurance policy",
  Elevation: "Elevation certificate",
  HOA: "HOA documents",
  Manual: "Manual",
  Other: "Other",
};

export interface DocGroup {
  key: string;
  label: string;
  types: readonly DocType[];
}

export const DOC_GROUPS: readonly DocGroup[] = [
  { key: "ownership", label: "Ownership and closing", types: ["Deed", "Closing", "Title", "Survey"] },
  { key: "insurance", label: "Insurance and risk", types: ["Insurance", "Elevation"] },
  { key: "home", label: "Home and HOA", types: ["HOA", "Manual"] },
  { key: "work", label: "Work records", types: ["Receipt", "Invoice", "Permit", "Inspection", "Warranty"] },
  { key: "other", label: "Other", types: ["Other"] },
];

export function docGroupOf(type: DocType): DocGroup {
  return DOC_GROUPS.find((g) => g.types.includes(type)) ?? DOC_GROUPS[DOC_GROUPS.length - 1];
}

export function encodeDoc(type: DocType, filename: string): string {
  return `[${type}] ${filename}`;
}

export function encodePermit(permitNumber: string, authority: string, status: string, filename: string): string {
  return `[Permit] ${permitNumber}|${authority}|${status}|${filename}`;
}

export function encodeInspection(inspector: string, status: string, filename: string): string {
  return `[Inspection] ${inspector}|${status}|${filename}`;
}

export interface ParsedDoc {
  type: DocType;
  filename: string;
  permitNumber?: string;
  authority?: string;
  inspector?: string;
  status?: string;
}

export function parseDoc(description: string): ParsedDoc {
  const m = description.match(/^\[(\w+)\] (.+)$/);
  if (!m || !DOC_TYPES.includes(m[1] as DocType)) {
    return { type: "Receipt", filename: description };
  }
  const type = m[1] as DocType;
  const rest = m[2];
  if (type === "Permit") {
    const parts = rest.split("|");
    if (parts.length >= 4)
      return {
        type,
        permitNumber: parts[0],
        authority: parts[1],
        status: parts[2],
        filename: parts.slice(3).join("|"),
      };
  }
  if (type === "Inspection") {
    const parts = rest.split("|");
    if (parts.length >= 3) return { type, inspector: parts[0], status: parts[1], filename: parts.slice(2).join("|") };
  }
  return { type, filename: rest };
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
