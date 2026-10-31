/**
 * Client for the photo canister's photoAccess composite query.
 *
 * photoAccess answers only registered photo relays, so the call is signed
 * with the Worker's DFX_IDENTITY_PEM identity (deploy.sh registers it with
 * photo.addPhotoRelay). Env is read at call time because the Worker copies
 * its bindings into process.env per request, after this module is imported.
 */
import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../packages/shared/src/declarations/photo";
import { identityFromPem } from "./paymentCanister";
import { icHost } from "./icHost";

export interface PhotoAccess {
  owner:    string;
  hash:     string;
  size:     number;
  offChain: boolean;
  isPublic: boolean;
  canRead:  boolean;
}

type RawAccess = {
  owner: Principal; hash: string; size: bigint;
  offChain: boolean; isPublic: boolean; canRead: boolean;
};
type PhotoActor = { photoAccess(photoId: string, reader: Principal): Promise<[] | [RawAccess]> };

const agents = new Map<string, Promise<HttpAgent>>();

function getAgent(): Promise<HttpAgent> {
  const pem = process.env.DFX_IDENTITY_PEM;
  if (!pem) throw new Error("DFX_IDENTITY_PEM is not set — cannot call photoAccess");
  const { host, local } = icHost();
  let agent = agents.get(host);
  if (!agent) {
    agent = HttpAgent.create({ host, identity: identityFromPem(pem), shouldFetchRootKey: local });
    agents.set(host, agent);
  }
  return agent;
}

/** What `reader` may do with a photo, or null when it doesn't exist. Throws if the canister can't be reached. */
export async function fetchPhotoAccess(photoId: string, reader: string): Promise<PhotoAccess | null> {
  const canisterId = process.env.CANISTER_ID_PHOTO;
  if (!canisterId) throw new Error("CANISTER_ID_PHOTO is not set — cannot check photo access");
  const actor = Actor.createActor(idlFactory, { agent: await getAgent(), canisterId }) as unknown as PhotoActor;
  const res = await actor.photoAccess(photoId, Principal.fromText(reader));
  if (!res.length) return null;
  const a = res[0];
  return {
    owner: a.owner.toText(), hash: a.hash, size: Number(a.size),
    offChain: a.offChain, isPublic: a.isPublic, canRead: a.canRead,
  };
}
