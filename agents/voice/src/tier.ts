/**
 * Server-side tier resolution for the Worker.
 *
 * The caller's subscription tier decides their AI quota, so it must come from
 * the payment canister — never from the client's `x-subscription-tier` header,
 * which anyone can set. Lookups are cached briefly in KV so a burst of agent
 * calls costs one canister query, and a Pro upgrade shows up within a minute.
 */

import { TIER_LIMITS, type SubscriptionTier } from "../agentLimiter";
import { fetchSubscriptionTier } from "../paymentCanister";
import type { KVEnv } from "./rateLimiter";

/** KV's minimum TTL; also bounds how long a tier change takes to apply. */
export const TIER_CACHE_TTL_SECONDS = 60;

function asTier(t: string): SubscriptionTier {
  return (t in TIER_LIMITS ? t : "Free") as SubscriptionTier;
}

export async function resolveTier(
  principal: string,
  env: KVEnv,
  lookup: (principal: string) => Promise<string> = fetchSubscriptionTier,
): Promise<SubscriptionTier> {
  if (principal === "anon") return "Free";

  const key    = `tier:${principal}`;
  const cached = await env.RATE_LIMIT.get(key);
  if (cached) return asTier(cached);

  let tier: SubscriptionTier;
  try {
    tier = asTier(await lookup(principal));
  } catch {
    // Canister unreachable: fail closed to Free, but don't cache it, so a
    // paying user isn't stuck on Free after a transient error.
    return "Free";
  }
  await env.RATE_LIMIT.put(key, tier, { expirationTtl: TIER_CACHE_TTL_SECONDS });
  return tier;
}
