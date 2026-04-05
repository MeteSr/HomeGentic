/**
 * @jest-environment node
 */
import {
  shouldPromptBiometric,
  biometricPromptReason,
  biometricNotAvailableReason,
} from "../../auth/biometricService";

// ── shouldPromptBiometric ─────────────────────────────────────────────────────

describe("shouldPromptBiometric", () => {
  it("returns true when hardware is present and biometrics are enrolled", () => {
    expect(shouldPromptBiometric(true, true)).toBe(true);
  });

  it("returns false when no biometric hardware", () => {
    expect(shouldPromptBiometric(false, true)).toBe(false);
  });

  it("returns false when hardware present but nothing enrolled", () => {
    expect(shouldPromptBiometric(true, false)).toBe(false);
  });

  it("returns false when neither hardware nor enrolled", () => {
    expect(shouldPromptBiometric(false, false)).toBe(false);
  });
});

// ── biometricPromptReason ─────────────────────────────────────────────────────

describe("biometricPromptReason", () => {
  it("returns a non-empty string", () => {
    expect(biometricPromptReason().length).toBeGreaterThan(0);
  });

  it("uses a custom app name when provided", () => {
    expect(biometricPromptReason("MyApp")).toContain("MyApp");
  });

  it("uses HomeGentic as the default app name", () => {
    expect(biometricPromptReason()).toContain("HomeGentic");
  });
});

// ── biometricNotAvailableReason ───────────────────────────────────────────────

describe("biometricNotAvailableReason", () => {
  it("returns hardware message when no hardware", () => {
    expect(biometricNotAvailableReason(false, false)).toMatch(/not supported/i);
  });

  it("returns enrollment message when hardware present but nothing enrolled", () => {
    expect(biometricNotAvailableReason(true, false)).toMatch(/not set up/i);
  });

  it("returns null when biometrics are fully available", () => {
    expect(biometricNotAvailableReason(true, true)).toBeNull();
  });
});
