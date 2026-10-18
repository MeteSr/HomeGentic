import { useState, useEffect, useRef } from "react";
import { fetchWithAgentSession } from "@/services/agentSession";
import { useAuthStore } from "@/store/authStore";
import type { DeviceSource, SensorDevice } from "@/services/sensor";

export interface OAuthPickedDevice {
  id:   string;
  name: string;
  type: string;
}

interface OAuthMessage {
  type:       "oauth-devices";
  devices?:   OAuthPickedDevice[];
  pickToken?: string;
  error?:     string;
}

const GATEWAY_URL = (import.meta as any).env?.VITE_IOT_GATEWAY_URL ?? "http://localhost:3002";

async function errorOf(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    if (body?.error) return body.error;
  } catch { /* not JSON */ }
  return `Gateway error (${res.status})`;
}

/**
 * Verified vendor-device linking (security audit M9 / F-14).
 *
 * start(platform, propertyId):
 *   1. POST {gateway}/oauth/device/link with the x-agent-session token, which
 *      returns a one-time ticket bound to the signed-in principal + property;
 *   2. points a popup at /oauth/device/start/:platform?ticket=…; the gateway
 *      runs the vendor OAuth and postMessages back the devices that vendor
 *      account owns, plus a pickToken.
 * register(deviceId, name) asks the gateway to bind one of those devices; the
 * gateway calls sensor.registerVerifiedDevice, so device IDs the user merely
 * knows can no longer be claimed.
 */
export function useOAuthDevicePicker() {
  const [devices, setDevices] = useState<OAuthPickedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const popupRef     = useRef<Window | null>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pickTokenRef = useRef<string | null>(null);
  const listenerRef  = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
    };
  }, []);

  function stopListening() {
    if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
    listenerRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
  }

  async function start(platform: string, propertyId: string) {
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    stopListening();

    setLoading(true);
    setError(null);
    setDevices([]);
    pickTokenRef.current = null;

    // Open the popup synchronously (inside the click) so it isn't blocked,
    // then navigate it once the gateway has issued the ticket.
    const popup = window.open("about:blank", `oauth-${platform}`, "width=640,height=720,popup=yes");
    popupRef.current = popup;

    let ticket: string;
    try {
      const res = await fetchWithAgentSession(`${GATEWAY_URL}/oauth/device/link`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        // `principal` is only read by a gateway running without an auth
        // canister in local dev; otherwise the session token decides.
        body: JSON.stringify({ platform, propertyId, principal: useAuthStore.getState().principal ?? undefined }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      ticket = ((await res.json()) as { ticket: string }).ticket;
    } catch (err: any) {
      popup?.close();
      setLoading(false);
      setError(err?.message ?? "Could not start the account connection");
      return;
    }

    function onMessage(event: MessageEvent) {
      // Validate the origin — only accept messages from the configured IoT gateway
      const gatewayOrigin = new URL(GATEWAY_URL).origin;
      if (event.origin !== gatewayOrigin) return; // silently ignore messages from other origins

      const msg = event.data as OAuthMessage;
      if (msg?.type !== "oauth-devices") return;

      stopListening();
      setLoading(false);

      if (msg.error) {
        setError(msg.error);
      } else {
        pickTokenRef.current = msg.pickToken ?? null;
        setDevices(msg.devices ?? []);
      }
      popup?.close();
    }

    listenerRef.current = onMessage;
    window.addEventListener("message", onMessage);

    const url = `${GATEWAY_URL}/oauth/device/start/${encodeURIComponent(platform)}?ticket=${encodeURIComponent(ticket)}`;
    if (popup) popup.location.href = url;

    // Fallback: if user closes popup without completing OAuth
    pollRef.current = setInterval(() => {
      if (popup?.closed) {
        stopListening();
        setLoading(false);
      }
    }, 500);
  }

  /** Bind a device from the connected account's list to the property. */
  async function register(deviceId: string, name: string): Promise<SensorDevice> {
    const pickToken = pickTokenRef.current;
    if (!pickToken) throw new Error("Connect the account again to choose a device");
    const res = await fetchWithAgentSession(`${GATEWAY_URL}/oauth/device/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickToken, deviceId, name, principal: useAuthStore.getState().principal ?? undefined }),
    });
    if (!res.ok) {
      const msg = await errorOf(res);
      throw new Error(msg === "AlreadyExists" ? "This device is already linked to another home" : msg);
    }
    const d = ((await res.json()) as { device: any }).device;
    return {
      id:               d.id,
      propertyId:       d.propertyId,
      homeowner:        d.homeowner,
      externalDeviceId: d.externalDeviceId,
      source:           d.source as DeviceSource,
      name:             d.name,
      registeredAt:     Number(BigInt(d.registeredAt) / BigInt(1_000_000)),
      isActive:         d.isActive,
    };
  }

  function reset() {
    setDevices([]);
    setError(null);
    setLoading(false);
    pickTokenRef.current = null;
  }

  return { start, register, devices, loading, error, reset };
}
