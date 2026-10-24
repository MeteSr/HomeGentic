/**
 * Authenticated client for the property canister's identity-relay method.
 *
 * Signs with the Worker's DFX_IDENTITY_PEM identity (the same one the payment
 * canister knows as its Stripe relay); that principal must be registered with
 * property.addIdentityRelay. Env is read at call time (the Worker copies its
 * bindings into process.env per request).
 */
import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../../packages/shared/src/declarations/property";
import { getAgent, PRINCIPAL_RE } from "../paymentCanister";

/** Record a verified Stripe Identity session on the owner's property claim. */
export async function markIdentityCleared(
  propertyId: string,
  owner: string,
  sessionId: string,
  name: string,
): Promise<void> {
  const canisterId = process.env.CANISTER_ID_PROPERTY;
  if (!canisterId) throw new Error("CANISTER_ID_PROPERTY is not set — cannot record identity checks");
  if (!PRINCIPAL_RE.test(owner)) throw new Error("Invalid principal format");
  const actor = Actor.createActor(idlFactory, { agent: await getAgent(), canisterId }) as any;
  const res = await actor.relayMarkIdentityCleared(propertyId, Principal.fromText(owner), sessionId, name);
  if ("err" in res) throw new Error(`Identity record failed: ${Object.keys(res.err)[0]}`);
}
