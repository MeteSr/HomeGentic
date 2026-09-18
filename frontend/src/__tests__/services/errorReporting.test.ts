/**
 * errorReporting — thin compatibility shim over errorTracker.
 *   - reportFrontendError forwards to errorTracker.captureError with
 *     level "error", source "ErrorBoundary", and the componentStack
 *     normalized from null to undefined
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCaptureError } = vi.hoisted(() => ({ mockCaptureError: vi.fn() }));
vi.mock("@/services/errorTracker", () => ({ errorTracker: { captureError: mockCaptureError } }));

import { reportFrontendError } from "@/services/errorReporting";

beforeEach(() => vi.clearAllMocks());

describe("reportFrontendError", () => {
  it("forwards the error and componentStack to errorTracker.captureError", async () => {
    const error = new Error("Boom");
    await reportFrontendError(error, "at Component");

    expect(mockCaptureError).toHaveBeenCalledWith(error, {
      level: "error",
      componentStack: "at Component",
      source: "ErrorBoundary",
    });
  });

  it("normalizes a null componentStack to undefined", async () => {
    const error = new Error("Boom");
    await reportFrontendError(error, null);

    expect(mockCaptureError).toHaveBeenCalledWith(error, {
      level: "error",
      componentStack: undefined,
      source: "ErrorBoundary",
    });
  });
});
