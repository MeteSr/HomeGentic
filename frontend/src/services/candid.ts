/**
 * Helpers for Candid variants, typed against the generated declaration types
 * in packages/shared/src/types/.
 *
 *   variant<Tier>("Pro")           → { Pro: null }
 *   variantKey(job.status)         → "Verified" | "Pending" | …
 *   candidErrorMessage(result.err) → the error's text payload, else its tag
 */

/** The tags of a variant type: `{ A: null } | { B: string }` → `"A" | "B"`. */
export type VariantKey<V> = V extends unknown ? keyof V & string : never;

/** A variant value with no payload. */
export function variant<V>(key: VariantKey<V>): V {
  return { [key]: null } as V;
}

/** The tag of a variant value. */
export function variantKey<V extends object>(value: V): VariantKey<V> {
  return Object.keys(value)[0] as VariantKey<V>;
}

/** The message for a canister `Error` variant: its text payload if it has one (`#InvalidInput("…")`), else its tag. */
export function candidErrorMessage(err: object): string {
  const [key, val] = Object.entries(err)[0] ?? ["UnknownError", null];
  return typeof val === "string" ? val : key;
}
