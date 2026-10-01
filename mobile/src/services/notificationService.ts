export type PushPlatform = "ios" | "android";

/**
 * Registration body. Who the token belongs to comes from the session token
 * header, never from the body — the relay ignores any principal sent here.
 */
export interface TokenPayload {
  token:     string;
  platform:  PushPlatform;
}

/** Pure — builds the registration request body */
export function buildTokenPayload(token: string, platform: PushPlatform): TokenPayload {
  return { token, platform };
}

/** Header carrying the auth canister's agent session token (see authService.issueAgentSession). */
export const SESSION_HEADER = "x-agent-session";

/** Pure — extracts the deep-link route from a notification data object */
export function parseNotificationRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const route = (data as Record<string, unknown>).route;
  return typeof route === "string" ? route : null;
}

// ── API call ──────────────────────────────────────────────────────────────────

const RELAY_URL = process.env.EXPO_PUBLIC_NOTIFICATIONS_URL ?? "";

/**
 * Registers a native device push token (APNs / FCM) with the notification
 * relay for the user the session token belongs to. Resolves to whether the
 * relay accepted it. No-ops if the relay URL or the session token is missing.
 */
export async function registerPushToken(payload: TokenPayload, sessionToken: string | null): Promise<boolean> {
  if (!RELAY_URL) {
    console.log("[notifications] relay URL not set — skipping token registration");
    return false;
  }
  if (!sessionToken) {
    console.log("[notifications] no session token — skipping token registration");
    return false;
  }

  try {
    const res = await fetch(`${RELAY_URL}/api/push/register`, {
      method:  "POST",
      headers: { "content-type": "application/json", [SESSION_HEADER]: sessionToken },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[notifications] token registration rejected: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[notifications] token registration failed:", err);
    return false;
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
