/**
 * fetch() for the voice Worker's AI routes, with its abuse checks
 * (@homegentic/shared/aiChecks, cycle-drain audit CD-1):
 *  - 403 `human_verification_required`: open the Worker's /human-check page in
 *    an auth browser session. It shows Cloudflare Turnstile and hands the token
 *    back through homegentic://human-check; we post it to /api/human/verify
 *    with the session and retry once. Needed once per account.
 *  - 429 `slow_down` with a short Retry-After: retry with exponential backoff.
 */
import * as WebBrowser from "expo-web-browser";
import { SESSION_HEADER } from "@homegentic/shared/agentSession";
import { withAiChecks, HUMAN_CHECK_PAGE_PATH, HUMAN_VERIFY_PATH } from "@homegentic/shared/aiChecks";

const RETURN_URL = "homegentic://human-check";

let inflight: Promise<boolean> | null = null;

/** Run the human check once (shared by concurrent calls); true when the Worker accepted it. */
function humanCheck(baseUrl: string, sessionToken: string | null): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      const page = `${baseUrl}${HUMAN_CHECK_PAGE_PATH}?redirect=${encodeURIComponent(RETURN_URL)}`;
      const result = await WebBrowser.openAuthSessionAsync(page, RETURN_URL);
      if (result.type !== "success" || !result.url) return false;
      // React Native's URL has no searchParams, so read the one parameter by hand.
      const m = /[?&]token=([^&#]+)/.exec(result.url);
      const token = m ? decodeURIComponent(m[1]) : null;
      if (!token) return false;
      const res = await fetch(`${baseUrl}${HUMAN_VERIFY_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { [SESSION_HEADER]: sessionToken } : {}) },
        body: JSON.stringify({ token }),
      });
      return res.ok;
    })()
      .catch(() => false)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** scheme://host[:port] of an absolute URL (React Native's URL lacks `origin`). */
function originOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i.exec(url);
  return m ? m[0] : url;
}

export async function aiFetch(url: string, init: RequestInit, sessionToken: string | null): Promise<Response> {
  const headers = {
    ...(init.headers as Record<string, string> | undefined),
    ...(sessionToken ? { [SESSION_HEADER]: sessionToken } : {}),
  };
  const send = () => fetch(url, { ...init, headers });
  return withAiChecks(await send(), {
    send,
    humanCheck: () => humanCheck(originOf(url), sessionToken),
  });
}
