export type PushPlatform = "ios" | "android";

export interface TokenPayload {
  principal: string;
  token:     string;
  platform:  PushPlatform;
}

/** Pure — builds the registration request body */
export function buildTokenPayload(
  principal: string,
  token:     string,
  platform:  PushPlatform
): TokenPayload {
  return { principal, token, platform };
}

/** Pure — extracts the deep-link route from a notification data object */
export function parseNotificationRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const route = (data as Record<string, unknown>).route;
  return typeof route === "string" ? route : null;
}

// ── API call ──────────────────────────────────────────────────────────────────

const RELAY_URL = process.env.EXPO_PUBLIC_NOTIFICATIONS_URL ?? "";

/**
 * Registers a device push token with the notification relay.
 * No-ops silently if the relay URL is not configured.
 */
export async function registerPushToken(payload: TokenPayload): Promise<void> {
  if (!RELAY_URL) {
    console.log("[notifications] relay URL not set — skipping token registration");
    return;
  }

  try {
    await fetch(`${RELAY_URL}/api/push/register`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[notifications] token registration failed:", err);
  }
}

/**
 * Unregisters a device push token (called on logout).
 */
export async function unregisterPushToken(token: string): Promise<void> {
  if (!RELAY_URL) return;

  try {
    await fetch(`${RELAY_URL}/api/push/unregister`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ token }),
    });
  } catch (err) {
    console.error("[notifications] token unregistration failed:", err);
  }
}
