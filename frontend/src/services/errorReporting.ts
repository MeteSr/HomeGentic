/**
 * errorReporting — thin shim kept for backward compatibility.
 *
 * All logic now lives in errorTracker. ErrorBoundary and any other callers
 * that still reference reportFrontendError() are redirected here.
 */

import { errorTracker } from "./errorTracker";

export async function reportFrontendError(
  error: Error,
  componentStack: string | null,
): Promise<void> {
  errorTracker.captureError(error, {
    level:          "error",
    componentStack: componentStack ?? undefined,
    source:         "ErrorBoundary",
  });
}
