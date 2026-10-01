/**
 * Browser push notifications.
 *
 * enable() asks for permission, registers /push-sw.js, subscribes with the
 * notification relay's VAPID key, and registers that subscription with the
 * relay. The relay learns who the subscriber is from the agent session token
 * (fetchWithAgentSession), never from the request body.
 *
 * Everything is a no-op returning "unavailable" when the browser has no Push
 * API or VITE_NOTIFICATIONS_URL isn't configured.
 */
import { fetchWithAgentSession } from "./agentSession";

const RELAY_URL: string = (import.meta.env?.VITE_NOTIFICATIONS_URL ?? "").replace(/\/$/, "");
const SW_URL = "/push-sw.js";

export type PushStatus = "unavailable" | "denied" | "off" | "on";

function supported(): boolean {
  return (
    !!RELAY_URL &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** base64url VAPID key → bytes for PushManager.subscribe(). */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!supported()) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

/** Turn on push for this browser. Resolves to the resulting status. */
export async function enablePush(): Promise<PushStatus> {
  if (!supported()) return "unavailable";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyRes = await fetch(`${RELAY_URL}/api/push/vapid-public-key`);
    if (!keyRes.ok) throw new Error("Couldn't reach the notification service");
    const { publicKey } = (await keyRes.json()) as { publicKey: string };
    sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const res = await fetchWithAgentSession(`${RELAY_URL}/api/push/vapid-subscribe`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) {
    await sub.unsubscribe().catch(() => {});
    throw new Error(res.status === 401 ? "Sign in again to turn on notifications" : "Couldn't turn on notifications");
  }
  return "on";
}

/** Turn off push for this browser. */
export async function disablePush(): Promise<PushStatus> {
  if (!supported()) return "unavailable";
  const sub = await currentSubscription();
  if (sub) {
    await fetch(`${RELAY_URL}/api/push/vapid-unsubscribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}
