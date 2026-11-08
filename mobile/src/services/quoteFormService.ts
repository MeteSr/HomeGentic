import type { CreateQuoteInput } from "./quoteService";

export type Urgency = "low" | "medium" | "high" | "emergency";

export interface QuoteForm {
  serviceType: string;
  urgency:     Urgency | "";
  description: string;
}

export const URGENCY_LEVELS: Urgency[] = ["low", "medium", "high", "emergency"];

/** Pure — the form a new request starts with; the emergency card passes "emergency". */
export function initialQuoteForm(urgency?: Urgency): QuoteForm {
  return { serviceType: "", urgency: urgency ?? "", description: "" };
}

/** Pure — capitalises first letter for display */
export function urgencyLabel(u: Urgency): string {
  return u.charAt(0).toUpperCase() + u.slice(1);
}

/** Pure — validates all quote form fields; returns human-readable error or null */
export function validateQuoteForm(form: QuoteForm): string | null {
  if (!form.serviceType)               return "Please select a service type.";
  if (!form.urgency)                   return "Please select an urgency level.";
  if (form.description.trim().length < 10)
    return "Description must be at least 10 characters.";
  return null;
}

/** Pure — transforms a validated form into a canister-ready payload */
export function buildQuotePayload(propertyId: string, form: QuoteForm): CreateQuoteInput {
  return {
    propertyId,
    serviceType: form.serviceType,
    urgency:     form.urgency as Urgency,
    description: form.description.trim(),
  };
}
