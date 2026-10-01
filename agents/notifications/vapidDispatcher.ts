import webpush from "web-push";
import { getSubscriptionsForPrincipal, removeSubscription } from "./vapidStore";
import type { PushPayload } from "./types";

export async function dispatchWebPush(principal: string, payload: PushPayload): Promise<void> {
  const subs = getSubscriptionsForPrincipal(principal);
  if (subs.length === 0) return;

  const notification = JSON.stringify({ title: payload.title, body: payload.body, route: payload.route });
  const options = { TTL: 86_400 };

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, notification, options);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410) {
          console.warn(`[vapid] evicting stale subscription ${sub.endpoint.slice(0, 40)}…`);
          removeSubscription(sub.endpoint);
        } else {
          console.error("[vapid] push failed for", sub.endpoint.slice(0, 40), "…:", err);
        }
      }
    })
  );
}
