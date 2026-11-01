/**
 * Client side of the voice Worker's AI abuse checks (agents/voice/src/aiGuard.ts,
 * cycle-drain audit CD-1). Shared by the web and mobile apps; dependency-free.
 *
 *  - 403 `human_verification_required`: run the platform's human check (a
 *    Turnstile dialog on the web, an auth browser session on mobile), then
 *    retry once if it passed.
 *  - 429 `slow_down` with a short Retry-After: wait, doubling each time plus
 *    jitter, and retry up to MAX_SLOW_DOWN_RETRIES times. Longer waits and
 *    daily limits are returned as they are, so the caller shows its message.
 */

/** Longest Retry-After we wait out automatically; longer ones go back to the caller. */
export const MAX_AUTO_RETRY_SECONDS = 10;
/** Automatic retries after a short `slow_down`. */
export const MAX_SLOW_DOWN_RETRIES = 2;

export interface AiErrorBody {
  error?: string;
  siteKey?: string | null;
}

/** Minimal Response shape (fetch's, in browsers, React Native and Workers). */
interface ResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  clone(): { json(): Promise<unknown> };
}

export async function aiErrorBody(res: ResponseLike): Promise<AiErrorBody> {
  try {
    return (await res.clone().json()) as AiErrorBody;
  } catch {
    return {};
  }
}

export interface AiCheckDeps<R extends ResponseLike> {
  /** Send (or re-send) the request. */
  send: () => Promise<R>;
  /** Show the human check; resolve true once the Worker accepted it. */
  humanCheck: (siteKey: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Apply the human-check and backoff rules to a response from `send()`. */
export async function withAiChecks<R extends ResponseLike>(first: R, deps: AiCheckDeps<R>): Promise<R> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  let res = first;

  if (res.status === 403) {
    const body = await aiErrorBody(res);
    if (body.error === "human_verification_required" && body.siteKey) {
      if (await deps.humanCheck(body.siteKey).catch(() => false)) res = await deps.send();
    }
  }

  for (let attempt = 0; attempt < MAX_SLOW_DOWN_RETRIES && res.status === 429; attempt++) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    if (!Number.isFinite(retryAfter) || retryAfter > MAX_AUTO_RETRY_SECONDS) break;
    if ((await aiErrorBody(res)).error !== "slow_down") break;
    await sleep(Math.max(retryAfter * 1000, 1000 * 2 ** attempt) + random() * 500);
    res = await deps.send();
  }
  return res;
}

/**
 * What to tell the user when an AI call was refused by an abuse check, or
 * null when the response isn't one of those. Matches what the Worker did.
 */
export async function aiRefusalMessage(res: ResponseLike): Promise<string | null> {
  if (res.status !== 403 && res.status !== 429) return null;
  const { error } = await aiErrorBody(res);
  switch (error) {
    case "human_verification_required":
      return "Please complete the quick human check to use the AI assistant.";
    case "slow_down": {
      const secs = Number(res.headers.get("Retry-After"));
      const mins = Math.max(1, Math.ceil((Number.isFinite(secs) ? secs : 60) / 60));
      return `Too many requests. Please wait about ${mins} minute${mins === 1 ? "" : "s"} and try again.`;
    }
    case "free_ai_budget_reached":
      return "Free AI answers are busy for today. Please try again tomorrow, or upgrade to Pro.";
    default:
      return null;
  }
}

/** The Worker route that records a passed human check for the session's principal. */
export const HUMAN_VERIFY_PATH = "/api/human/verify";
/** The Worker page the mobile app opens to show the check. */
export const HUMAN_CHECK_PAGE_PATH = "/human-check";
