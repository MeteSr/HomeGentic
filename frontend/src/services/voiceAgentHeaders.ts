/**
 * Shared helper — builds the fetch headers required by the voice agent relay.
 *
 * Adds:
 *   x-api-key       — shared secret (VITE_VOICE_AGENT_API_KEY), when set
 *   x-icp-principal — caller's ICP principal for structured log attribution,
 *                     when the user is authenticated
 */

import { useAuthStore } from "@/store/authStore";

const VOICE_API_KEY =
  (import.meta as any).env?.VITE_VOICE_AGENT_API_KEY ?? "";

export function voiceAgentHeaders(): Record<string, string> {
  const { principal } = useAuthStore.getState();
  return {
    "Content-Type": "application/json",
    ...(VOICE_API_KEY ? { "x-api-key":       VOICE_API_KEY } : {}),
    ...(principal    ? { "x-icp-principal":  principal    } : {}),
  };
}
