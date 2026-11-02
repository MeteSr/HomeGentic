/**
 * One way to turn a canister's `#err` value into something a person can read
 * and a client can act on. Every canister's Error includes the cases in
 * backend/shared/Errors.mo; this maps those (and the common domain cases) to
 * copy and to a retry policy. Used by the web app and the mobile app.
 *
 *   throw canisterError(result.err)        // in a service
 *   catch (e) { toast.error(errorMessage(e)) }   // in a page
 */

/** Canister error tags every canister shares (backend/shared/Errors.mo). */
export type CommonErrorTag = "NotAuthorized" | "NotFound" | "InvalidInput" | "Paused" | "RateLimited" | "Unavailable";

/** How a caller should treat the failure. */
export type RetryPolicy =
  /** Don't retry: the request itself can't succeed as sent. */
  | "never"
  /** Retry after about a minute (per-minute rate limit). */
  | "afterAMinute"
  /** Retry later; minutes to hours (paused, or something we depend on is down). */
  | "later";

const COPY: Record<string, string> = {
  NotAuthorized: "You don't have permission to do that. Try signing in again.",
  NotFound: "We couldn't find that. It may have been deleted.",
  Paused: "HomeGentic is down for maintenance for a few minutes. Please try again shortly.",
  RateLimited: "You're doing that too quickly. Wait a minute and try again.",
  Unavailable: "That's unavailable right now. Please try again later.",
  AlreadyExists: "That already exists.",
  Duplicate: "That's already been added.",
  LimitReached: "You've reached the limit for your plan.",
  Expired: "This link has expired.",
  Revoked: "This link has been turned off by its owner.",
  DuplicateReview: "You've already reviewed this job.",
  AlreadyVerified: "This job is already verified.",
  AlreadyCancelled: "That's already been cancelled.",
  DeadlinePassed: "The deadline for this has passed.",
  SlotsFull: "All the spots are taken.",
  UnverifiedProperty: "Verify your home's ownership first.",
  DuplicateAddress: "This address is already registered and verified by another owner.",
  AddressConflict: "Someone else has claimed this address and is still verifying it.",
};

const RETRY: Record<string, RetryPolicy> = {
  Paused: "later",
  RateLimited: "afterAMinute",
  Unavailable: "later",
};

/** An error a canister returned, carrying its tag so callers can branch on it. */
export class CanisterError extends Error {
  /** The variant tag, e.g. "NotFound" or "Paused". */
  readonly code: string;
  /** The tag's text payload, when it has one (`#InvalidInput("…")`). */
  readonly detail: string | undefined;
  readonly retry: RetryPolicy;

  constructor(code: string, detail?: string) {
    super(messageFor(code, detail));
    this.name = "CanisterError";
    this.code = code;
    this.detail = detail;
    this.retry = RETRY[code] ?? "never";
  }
}

/** Tags whose text payload is data, not a message (photo #Duplicate carries the existing photo's id). */
const DATA_PAYLOAD = new Set(["Duplicate"]);

function messageFor(code: string, detail: string | undefined): string {
  // A text payload is written for a person (Errors.mo), so it wins over the
  // generic copy; Unavailable and InvalidInput always carry one.
  if (detail && !DATA_PAYLOAD.has(code)) return detail;
  return COPY[code] ?? "Something went wrong. Please try again.";
}

/** The `{ Tag: payload }` object of a Candid variant: its tag and text payload. */
function parts(err: object): [string, string | undefined] {
  const [key, val] = Object.entries(err)[0] ?? ["Unknown", null];
  return [key, typeof val === "string" ? val : undefined];
}

/** A CanisterError for a canister's `#err` value. */
export function canisterError(err: object): CanisterError {
  const [code, detail] = parts(err);
  return new CanisterError(code, detail);
}

/** The person-facing message for a canister `#err` value. */
export function canisterErrorMessage(err: object): string {
  const [code, detail] = parts(err);
  return messageFor(code, detail);
}

/**
 * The person-facing message for anything a service threw: a CanisterError's
 * own message, or a generic line for a network failure or a trap (whose raw
 * text is for logs, not people).
 */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof CanisterError) return e.message;
  if (e instanceof Error && e.message && !looksTechnical(e.message)) return e.message;
  return fallback;
}

/** True when `e` is a CanisterError with this tag, e.g. `hasErrorCode(e, "Duplicate")`. */
export function hasErrorCode(e: unknown, code: string): boolean {
  return e instanceof CanisterError && e.code === code;
}

/** True when the failure is worth retrying later (paused, rate limited, unavailable). */
export function isRetryable(e: unknown): boolean {
  return e instanceof CanisterError && e.retry !== "never";
}

/** Agent reject text, traps and raw tags aren't for people. */
function looksTechnical(message: string): boolean {
  return (
    /^[A-Z][A-Za-z]+$/.test(message) || // a bare variant tag, e.g. "NotAuthorized"
    /Reject code|Call failed|canister_id|IC0\d{3}|trapped|Request ID/i.test(message)
  );
}
