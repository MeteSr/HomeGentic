import type { CreateJobInput } from "./jobService";

export interface JobForm {
  serviceType:    string;
  description:    string;
  amountDollars:  string;
  completedDate:  string;   // YYYY-MM-DD
  isDiy:          boolean;
  contractorName: string;
  permitNumber:   string;
  /** Whole months; blank = no warranty. Filled from a scanned warranty card. */
  warrantyMonths?: string;
}

export const SERVICE_TYPES = [
  "HVAC", "Plumbing", "Electrical", "Roofing",
  "Painting", "Flooring", "Windows", "Landscaping", "Other",
] as const;

/** Pure — strips $, commas, spaces and converts to integer cents. Returns null if invalid or ≤ 0. */
export function parseDollarAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const val = parseFloat(cleaned);
  if (isNaN(val) || val <= 0) return null;
  return Math.round(val * 100);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure — validates all form fields; returns a human-readable error string or null. */
export function validateJobForm(form: JobForm): string | null {
  if (!form.serviceType)                    return "Please select a service type.";
  if (!form.description.trim())             return "Description is required.";
  if (parseDollarAmount(form.amountDollars) === null)
                                            return "Enter a valid amount greater than $0.";
  if (!DATE_RE.test(form.completedDate))    return "Enter the date as YYYY-MM-DD.";
  if (!form.isDiy && !form.contractorName.trim())
                                            return "Contractor name is required for non-DIY jobs.";
  if (form.warrantyMonths?.trim() && !/^\d{1,3}$/.test(form.warrantyMonths.trim()))
                                            return "Warranty must be a whole number of months.";
  return null;
}

/** Pure — transforms a validated form into a canister-ready payload. */
export function buildJobPayload(propertyId: string, form: JobForm): CreateJobInput {
  return {
    propertyId,
    serviceType:    form.serviceType,
    description:    form.description.trim(),
    amountCents:    parseDollarAmount(form.amountDollars)!,
    completedDate:  form.completedDate,
    isDiy:          form.isDiy,
    contractorName: form.isDiy || !form.contractorName.trim() ? null : form.contractorName.trim(),
    permitNumber:   form.permitNumber.trim() || null,
    warrantyMonths: form.warrantyMonths?.trim() ? Number(form.warrantyMonths.trim()) || null : null,
  };
}
