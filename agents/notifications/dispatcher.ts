/**
 * Dispatches a push payload to every registered device and browser for a
 * principal. Failures on individual devices are logged but do not abort the batch.
 */
import { getTokensForPrincipal, removeToken } from "./store";
import { sendApns } from "./apns";
import { sendFcm  } from "./fcm";
import { dispatchWebPush } from "./vapidDispatcher";
import type { PushPayload } from "./types";

export async function dispatchToUser(principal: string, payload: PushPayload): Promise<void> {
  await Promise.all([dispatchToDevices(principal, payload), dispatchWebPush(principal, payload)]);
}

async function dispatchToDevices(principal: string, payload: PushPayload): Promise<void> {
  const tokens = getTokensForPrincipal(principal);
  if (tokens.length === 0) return;

  await Promise.all(
    tokens.map(async ({ token, platform }) => {
      try {
        if (platform === "ios") {
          await sendApns(token, payload);
        } else {
          await sendFcm(token, payload);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // APNs/FCM return 410 Gone for stale tokens — evict them
        if (/410|BadDeviceToken|NotRegistered|UNREGISTERED/.test(msg)) {
          console.warn(`[dispatcher] evicting stale token ${token.slice(0, 8)}… : ${msg}`);
          removeToken(token);
        } else {
          console.error(`[dispatcher] push failed for ${token.slice(0, 8)}… : ${msg}`);
        }
      }
    })
  );
}
