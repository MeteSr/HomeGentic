import { describe, expect, it } from "vitest";
import {
  CanisterError,
  canisterError,
  canisterErrorMessage,
  errorMessage,
  hasErrorCode,
  isRetryable,
} from "@homegentic/shared/canisterError";

describe("canisterError", () => {
  it("uses the text payload as the message, since canisters write it for people", () => {
    const e = canisterError({ InvalidInput: "Title is too long" });
    expect(e).toBeInstanceOf(CanisterError);
    expect(e.code).toBe("InvalidInput");
    expect(e.message).toBe("Title is too long");
    expect(e.retry).toBe("never");
  });

  it("maps payload-less tags to plain copy, never the tag itself", () => {
    for (const tag of ["NotAuthorized", "NotFound", "Paused", "RateLimited", "AlreadyExists", "DuplicateReview"]) {
      const msg = canisterErrorMessage({ [tag]: null });
      expect(msg).not.toBe(tag);
      expect(msg).toMatch(/\s/);
    }
  });

  it("gives each shared case its retry policy", () => {
    expect(canisterError({ Paused: null }).retry).toBe("later");
    expect(canisterError({ RateLimited: null }).retry).toBe("afterAMinute");
    expect(canisterError({ Unavailable: "Fees are down" }).retry).toBe("later");
    expect(canisterError({ NotAuthorized: null }).retry).toBe("never");
    expect(isRetryable(canisterError({ Paused: null }))).toBe(true);
    expect(isRetryable(canisterError({ NotFound: null }))).toBe(false);
    expect(isRetryable(new Error("x"))).toBe(false);
  });

  it("doesn't show a payload that is data (a duplicate photo's id)", () => {
    const e = canisterError({ Duplicate: "PHOTO_42" });
    expect(e.detail).toBe("PHOTO_42");
    expect(e.message).not.toContain("PHOTO_42");
    expect(hasErrorCode(e, "Duplicate")).toBe(true);
    expect(hasErrorCode(new Error("Duplicate"), "Duplicate")).toBe(false);
  });

  it("gives an unknown tag a generic message", () => {
    expect(canisterErrorMessage({ SomethingNew: null })).toBe("Something went wrong. Please try again.");
  });
});

describe("errorMessage", () => {
  it("returns a CanisterError's copy", () => {
    expect(errorMessage(canisterError({ RateLimited: null }))).toMatch(/wait a minute/i);
  });

  it("keeps a plain message a service wrote for people", () => {
    expect(errorMessage(new Error("Verify your home's ownership before issuing a certificate."))).toBe(
      "Verify your home's ownership before issuing a certificate.",
    );
  });

  it("hides agent reject text, traps and bare tags behind the fallback", () => {
    expect(errorMessage(new Error("Call failed: Reject code: 5"), "Upload failed")).toBe("Upload failed");
    expect(errorMessage(new Error("IC0503: Canister trapped"), "Upload failed")).toBe("Upload failed");
    expect(errorMessage(new Error("NotAuthorized"), "Upload failed")).toBe("Upload failed");
    expect(errorMessage("nope", "Upload failed")).toBe("Upload failed");
  });
});
