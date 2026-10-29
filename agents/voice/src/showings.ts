/**
 * FSBO showing requests from a listing's public page.
 *
 * M-2 (2026-10-28 audit): the listing canister used to take requests straight
 * from the browser, signed with a key the browser made up, so a script could
 * mint keys and flood a listing (25 requests/day, then real buyers were
 * turned away). Requests now come through here:
 *
 *   - per-IP limits (an hour, a day, and per listing) run before anything
 *     reaches the canister;
 *   - the requester is the signed-in buyer (x-agent-session), or for a
 *     signed-out visitor a principal derived from their IP, so the canister's
 *     per-buyer limit can't be dodged by making new keys;
 *   - the Worker files it with listing.relayRequestShowing (its identity must
 *     be registered with listing.addShowingRelay).
 */
import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../../packages/shared/src/declarations/listing";
import { getAgent } from "../paymentCanister";
import { hitCounter, type KVEnv } from "./rateLimiter";

export const SHOWINGS_PER_IP_HOUR = 5;
export const SHOWINGS_PER_IP_DAY = 15;
export const SHOWINGS_PER_IP_LISTING_DAY = 2;
const PROPERTY_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export interface ShowingInput {
  propertyId: string;
  name: string;
  contact: string;
  preferredTime: string;
}

export interface ShowingDeps {
  /** The verified caller from x-agent-session, or null/"anon" when signed out. */
  principal: () => Promise<string | null>;
  /** listing.relayRequestShowing; resolves to the canister's Result. */
  file: (input: ShowingInput, requester: Principal) => Promise<any>;
}

/** A stable principal for a signed-out visitor: self-authenticating, from a hash of their IP. */
export async function visitorPrincipal(ip: string): Promise<Principal> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hg-showing-visitor:${ip}`));
  return Principal.selfAuthenticating(new Uint8Array(digest));
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function handleShowingRequest(
  body: unknown,
  ip: string,
  env: Partial<KVEnv>,
  deps: ShowingDeps,
): Promise<{ status: number; body: unknown }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const input: ShowingInput = {
    propertyId: str(b.propertyId), name: str(b.name), contact: str(b.contact), preferredTime: str(b.preferredTime),
  };
  if (!PROPERTY_ID_RE.test(input.propertyId)) return { status: 400, body: { error: "valid propertyId required" } };
  if (!input.name || input.name.length > 200) return { status: 400, body: { error: "Enter your name (up to 200 characters)" } };
  if (input.contact.length < 5 || input.contact.length > 320) return { status: 400, body: { error: "Enter an email or phone number" } };
  if (!input.preferredTime || input.preferredTime.length > 200) return { status: 400, body: { error: "Enter a preferred time (up to 200 characters)" } };

  const hour = Math.floor(Date.now() / 3_600_000);
  const day  = new Date().toISOString().slice(0, 10);
  for (const [key, limit, ttl] of [
    [`showing:ip:${ip}:${hour}`, SHOWINGS_PER_IP_HOUR, 3_600],
    [`showing:ip:${ip}:${day}`, SHOWINGS_PER_IP_DAY, 86_400],
    [`showing:ip:${ip}:${input.propertyId}:${day}`, SHOWINGS_PER_IP_LISTING_DAY, 86_400],
  ] as const) {
    if (!(await hitCounter(env, key, limit, ttl)).allowed) {
      return { status: 429, body: { error: "Too many showing requests from this connection. Please try again later." } };
    }
  }

  const caller = await deps.principal();
  const requester = caller && caller !== "anon" ? Principal.fromText(caller) : await visitorPrincipal(ip);
  const res = await deps.file(input, requester);
  if ("err" in res) {
    const tag = Object.keys(res.err)[0];
    const detail = res.err[tag];
    if (tag === "NotFound") return { status: 404, body: { error: "This listing isn't live any more." } };
    if (tag === "NotAuthorized") throw new Error("Worker is not registered with listing.addShowingRelay");
    return { status: 400, body: { error: typeof detail === "string" ? detail : tag } };
  }
  const r = res.ok;
  return {
    status: 201,
    body: {
      id: r.id, propertyId: r.propertyId, name: r.name, contact: r.contact, preferredTime: r.preferredTime,
      createdAt: Number(r.createdAt / 1_000_000n), status: Object.keys(r.status)[0],
      alternateTime: r.alternateTime[0] ?? null,
    },
  };
}

/** listing.relayRequestShowing with the Worker's identity. */
export async function fileShowingInCanister(input: ShowingInput, requester: Principal): Promise<any> {
  const canisterId = process.env.CANISTER_ID_LISTING;
  if (!canisterId) throw new Error("CANISTER_ID_LISTING is not set");
  const actor = Actor.createActor(idlFactory, { agent: await getAgent(), canisterId }) as any;
  return actor.relayRequestShowing(input.propertyId, requester, input.name, input.contact, input.preferredTime);
}
