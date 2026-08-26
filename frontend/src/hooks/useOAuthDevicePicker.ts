import { useState, useEffect, useRef } from "react";

export interface OAuthPickedDevice {
  id:   string;
  name: string;
  type: string;
}

interface OAuthMessage {
  type:    "oauth-devices";
  devices?: OAuthPickedDevice[];
  error?:  string;
}

const GATEWAY_URL = (import.meta as any).env?.VITE_IOT_GATEWAY_URL ?? "http://localhost:3002";

/**
 * Opens an OAuth popup pointing at the gateway's /oauth/device/start/:platform
 * route. Listens for the postMessage the callback page sends with the device list.
 * Returns a { start, devices, loading, error, reset } API.
 */
export function useOAuthDevicePicker() {
  const [devices, setDevices] = useState<OAuthPickedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function start(platform: string) {
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    if (pollRef.current) clearInterval(pollRef.current);

    setLoading(true);
    setError(null);
    setDevices([]);

    const url    = `${GATEWAY_URL}/oauth/device/start/${platform}`;
    const popup  = window.open(url, `oauth-${platform}`, "width=640,height=720,popup=yes");
    popupRef.current = popup;

    function onMessage(event: MessageEvent) {
      // Validate the origin — only accept messages from the configured IoT gateway
      const gatewayOrigin = new URL(
        import.meta.env.VITE_IOT_GATEWAY_URL ?? "http://localhost:3002"
      ).origin;
      if (event.origin !== gatewayOrigin) return; // silently ignore messages from other origins

      const msg = event.data as OAuthMessage;
      if (msg?.type !== "oauth-devices") return;

      window.removeEventListener("message", onMessage);
      if (pollRef.current) clearInterval(pollRef.current);
      setLoading(false);

      if (msg.error) {
        setError(msg.error);
      } else {
        setDevices(msg.devices ?? []);
      }
      popup?.close();
    }

    window.addEventListener("message", onMessage);

    // Fallback: if user closes popup without completing OAuth
    pollRef.current = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollRef.current!);
        window.removeEventListener("message", onMessage);
        setLoading(false);
      }
    }, 500);
  }

  function reset() {
    setDevices([]);
    setError(null);
    setLoading(false);
  }

  return { start, devices, loading, error, reset };
}
