/**
 * Helpers for Candid variants, typed against the generated declaration types
 * in packages/shared/src/types/.
 *
 *   variant<Tier>("Pro")           → { Pro: null }
 *   variantKey(job.status)         → "Verified" | "Pending" | …
 *   canisterError(result.err)       → a CanisterError (tag, copy, retry policy) to throw
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

/**
 * The person-facing message for a canister `Error` variant: its text payload
 * if it has one (`#InvalidInput("…")`), else plain copy for its tag. Throw
 * `canisterError(err)` rather than `new Error(candidErrorMessage(err))` so the
 * catcher can still read the tag and retry policy.
 */
export { canisterErrorMessage as candidErrorMessage, canisterError, CanisterError, errorMessage, hasErrorCode, isRetryable } from "@homegentic/shared/canisterError";
