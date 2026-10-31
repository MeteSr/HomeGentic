/**
 * Where to send someone after they sign in (and, for a new user, after they
 * finish registering): the gift, manager-invite or payment page they left to
 * sign in. Kept in sessionStorage under the key PaymentSuccessPage and
 * RedeemGiftPage have always used. Only same-site paths are kept, so a
 * crafted ?redirect= can't send anyone off-site.
 */

const KEY = "pendingVerification";

export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}

export function setReturnPath(path: string | null | undefined): void {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(KEY, safe);
  } catch {
    /* storage blocked: they land on the default page */
  }
}

export function hasReturnPath(): boolean {
  try {
    return safeReturnPath(sessionStorage.getItem(KEY)) !== null;
  } catch {
    return false;
  }
}

/** Reads and clears the return path. */
export function takeReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return safeReturnPath(path);
  } catch {
    return null;
  }
}
