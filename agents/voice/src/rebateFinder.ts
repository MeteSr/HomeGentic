/**
 * POST /api/rebate-finder: the prompt and input checks, kept apart from
 * index.ts so they can be tested on their own.
 *
 * The list is written by the model from what it knows, so the prompt keeps it
 * to state and utility programs it believes are still running, and leaves out
 * federal tax credits, which change with tax law faster than a model's
 * training data (the residential energy credits ended for work after 2025).
 * The Bills tab labels the result as AI suggestions to check.
 */

export interface RebateFinderInput {
  state?: unknown;
  zipCode?: unknown;
  utilityProvider?: unknown;
  billType?: unknown;
}

const MAX_PROVIDER_CHARS = 120;

/** Error text to send back with a 400, or null when the body is usable. */
export function rebateFinderInputError(body: RebateFinderInput): string | null {
  const { state, zipCode, utilityProvider, billType } = body;
  if (!state || !zipCode || !utilityProvider || !billType) {
    return "state, zipCode, utilityProvider, and billType are required";
  }
  if (billType !== "Electric") return "Rebate finder is only available for Electric bills.";
  if (typeof state !== "string" || !/^[A-Za-z]{2}$/.test(state)) return "state must be a two-letter code";
  if (typeof zipCode !== "string" || !/^\d{5}(-\d{4})?$/.test(zipCode)) return "zipCode must be a 5-digit US zip";
  if (typeof utilityProvider !== "string" || utilityProvider.length > MAX_PROVIDER_CHARS) {
    return "utilityProvider is too long";
  }
  return null;
}

export function rebateFinderPrompt(): string {
  return `You are a utility rebate expert for HomeGentic.
List electric utility rebates and incentive programs a homeowner in the given state/zip with the given utility provider could look into.
Include state programs and utility-specific rebates. Do not list federal tax credits.
Respond ONLY with valid JSON — no markdown, no prose.

JSON shape:
{
  "rebates": [
    {
      "name": "<program name>",
      "description": "<1–2 sentence description>",
      "estimatedAmount": "<e.g. Up to $2,000 or $75 rebate>",
      "provider": "<State|<utility name>>",
      "url": "<program URL or omit>"
    }
  ]
}

Rules:
- Include up to 6 programs most relevant to this homeowner; fewer is fine
- If you are not sure a program is still offered, leave it out
- Only give a URL you are confident is the program's own page; otherwise omit it
- If you know of no programs, return {"rebates": []}`;
}
