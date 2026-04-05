import * as LocalAuthentication from "expo-local-authentication";

// ── Pure helpers (testable without native deps) ───────────────────────────────

/** Pure — true when the device can prompt biometrics for session unlock */
export function shouldPromptBiometric(hasHardware: boolean, isEnrolled: boolean): boolean {
  return hasHardware && isEnrolled;
}

/** Pure — the reason string shown in the system biometric dialog */
export function biometricPromptReason(appName = "HomeGentic"): string {
  return `Unlock ${appName}`;
}

/**
 * Pure — human-readable reason why biometrics are unavailable.
 * Returns null when biometrics are fully available.
 */
export function biometricNotAvailableReason(
  hasHardware: boolean,
  isEnrolled:  boolean,
): string | null {
  if (!hasHardware) return "Biometric authentication is not supported on this device.";
  if (!isEnrolled)  return "Biometrics are not set up on this device.";
  return null;
}

// ── Device checks ─────────────────────────────────────────────────────────────

export interface BiometricStatus {
  available: boolean;
  reason:    string | null;
}

/** Queries the device for biometric capability */
export async function checkBiometricStatus(): Promise<BiometricStatus> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled  = hasHardware
    ? await LocalAuthentication.isEnrolledAsync()
    : false;

  const available = shouldPromptBiometric(hasHardware, isEnrolled);
  const reason    = biometricNotAvailableReason(hasHardware, isEnrolled);
  return { available, reason };
}

// ── Authentication prompt ─────────────────────────────────────────────────────

export type BiometricResult =
  | { success: true }
  | { success: false; reason: "cancelled" | "failed" | "unavailable" };

/**
 * Prompts the user for biometric authentication.
 * Returns `{ success: true }` on pass, or a typed failure with a reason.
 */
export async function authenticateWithBiometrics(): Promise<BiometricResult> {
  const { available } = await checkBiometricStatus();
  if (!available) return { success: false, reason: "unavailable" };

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage:     biometricPromptReason(),
    cancelLabel:       "Use password",
    disableDeviceFallback: false,  // allow PIN/passcode as fallback on iOS
  });

  if (result.success) return { success: true };

  // error === "user_cancel" or "system_cancel" → cancelled; anything else → failed
  const cancelled =
    result.error === "user_cancel" ||
    result.error === "system_cancel" ||
    result.error === "app_cancel";

  return { success: false, reason: cancelled ? "cancelled" : "failed" };
}
