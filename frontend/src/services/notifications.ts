/**
 * Pure notification helpers — no canister calls, no side effects.
 *
 * All functions compare item timestamps against the user's previous login
 * time (lastLoginAt) to determine what is "new since last visit".
 */

/**
 * Returns true when an item was created strictly after the user's previous
 * login. Returns false when lastLoginAt is null (first-ever login — suppress
 * noise so the user doesn't see everything as "new" on day one).
 */
export function isNewSince(itemCreatedAt: number, lastLoginAt: number | null): boolean {
  if (!lastLoginAt) return false;
  return itemCreatedAt > lastLoginAt;
}

/**
 * Counts items whose createdAt is newer than lastLoginAt.
 */
export function countNew<T extends { createdAt: number }>(
  items: T[],
  lastLoginAt: number | null
): number {
  return items.filter((item) => isNewSince(item.createdAt, lastLoginAt)).length;
}

/**
 * Returns true when a quote request has bids that the homeowner should review.
 * Status transitions to "quoted" the moment the first contractor submits a bid.
 */
export function hasQuoteActivity(status: string): boolean {
  return status === "quoted";
}

/**
 * Total count of actionable signals for a homeowner:
 * the number of their quote requests that currently have bids awaiting review.
 */
export function pendingQuoteCount(
  requests: Array<{ status: string }>
): number {
  return requests.filter((r) => hasQuoteActivity(r.status)).length;
}
