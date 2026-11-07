/**
 * Authenticated client for the property canister's identity-relay methods
 * (Stripe Identity results, #718 flood zone lookups).
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
import type { FloodTarget, FloodZoneInput, FloodZoneRecord } from "./floodZone";

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

// ── #718 FEMA flood zone (floodZone.ts) ─────────────────────────────────────

async function propertyActor(): Promise<any> {
  const canisterId = process.env.CANISTER_ID_PROPERTY;
  if (!canisterId) throw new Error("CANISTER_ID_PROPERTY is not set — cannot look up flood zones");
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId }) as any;
}

function fromFloodRecord(r: any): FloodZoneRecord {
  return {
    status: "Mapped" in r.status ? "Mapped" : "NotMapped",
    zone: r.zone, zoneSubtype: r.zoneSubtype, specialFloodHazardArea: r.specialFloodHazardArea,
    baseFloodElevation: r.baseFloodElevation, firmPanel: r.firmPanel, firmEffectiveDate: r.firmEffectiveDate,
    matchedAddress: r.matchedAddress, latitude: r.latitude, longitude: r.longitude,
    checkedAt: Math.floor(Number(r.checkedAt) / 1_000_000),
  };
}

/** The home's address and saved flood zone for `user`, who must have a role on it. */
export async function floodTarget(propertyId: string, user: string): Promise<FloodTarget | "forbidden" | "notfound"> {
  if (!PRINCIPAL_RE.test(user)) return "forbidden";
  const res = await (await propertyActor()).relayFloodTarget(propertyId, Principal.fromText(user));
  if ("err" in res) {
    const tag = Object.keys(res.err)[0];
    if (tag === "NotFound") return "notfound";
    if (tag === "NotAuthorized") return "forbidden";
    throw new Error(`relayFloodTarget: ${tag}`);
  }
  const t = res.ok;
  return {
    address: t.address, city: t.city, state: t.state, zipCode: t.zipCode,
    floodZone: t.floodZone.length ? fromFloodRecord(t.floodZone[0]) : null,
  };
}

/** Save what FEMA's map shows on the property, for `user`. */
export async function saveFloodZone(propertyId: string, user: string, input: FloodZoneInput): Promise<FloodZoneRecord> {
  if (!PRINCIPAL_RE.test(user)) throw new Error("Invalid principal format");
  const res = await (await propertyActor()).relaySetFloodZone(propertyId, Principal.fromText(user), {
    ...input, status: { [input.status]: null },
  });
  if ("err" in res) throw new Error(`relaySetFloodZone: ${Object.keys(res.err)[0]}`);
  return fromFloodRecord(res.ok);
}
