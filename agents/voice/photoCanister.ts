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
type CandidResult<T> = { ok: T } | { err: Record<string, unknown> };
type PhotoActor = {
  photoAccess(photoId: string, reader: Principal): Promise<[] | [RawAccess]>;
  guidePhotoAccess(photoId: string, token: string): Promise<[] | [RawAccess]>;
  onChainPhotoPage(after: [] | [string]): Promise<CandidResult<{
    items: Array<{ id: string; hash: string; data: Uint8Array | number[] }>;
    next: [] | [string];
  }>>;
  confirmOffChain(moved: Array<[string, string]>): Promise<CandidResult<bigint>>;
};

const agents = new Map<string, Promise<HttpAgent>>();

function getAgent(): Promise<HttpAgent> {
  const pem = process.env.DFX_IDENTITY_PEM;
  if (!pem) throw new Error("DFX_IDENTITY_PEM is not set — cannot call photoAccess");
  const { host, rootKey } = icHost();
  let agent = agents.get(host);
  if (!agent) {
    agent = HttpAgent.create({ host, identity: identityFromPem(pem), rootKey });
    agents.set(host, agent);
  }
  return agent;
}

async function photoActor(): Promise<PhotoActor> {
  const canisterId = process.env.CANISTER_ID_PHOTO;
  if (!canisterId) throw new Error("CANISTER_ID_PHOTO is not set — cannot check photo access");
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId }) as unknown as PhotoActor;
}

function fromRaw(res: [] | [RawAccess]): PhotoAccess | null {
  if (!res.length) return null;
  const a = res[0];
  return {
    owner: a.owner.toText(), hash: a.hash, size: Number(a.size),
    offChain: a.offChain, isPublic: a.isPublic, canRead: a.canRead,
  };
}

/** What `reader` may do with a photo, or null when it doesn't exist. Throws if the canister can't be reached. */
export async function fetchPhotoAccess(photoId: string, reader: string): Promise<PhotoAccess | null> {
  return fromRaw(await (await photoActor()).photoAccess(photoId, Principal.fromText(reader)));
}

/** #725: what someone holding house-guide link `token` may do with a photo. Throws if the canister can't be reached. */
export async function fetchGuidePhotoAccess(photoId: string, token: string): Promise<PhotoAccess | null> {
  return fromRaw(await (await photoActor()).guidePhotoAccess(photoId, token));
}

function unwrap<T>(r: CandidResult<T>, method: string): T {
  if ("err" in r) throw new Error(`${method}: ${Object.keys(r.err)[0]}`);
  return r.ok;
}

/** Part 3: the photo canister calls the migration cron makes (src/photoMigration.ts). */
export const photoMigrationCanister = {
  async page(after: string | null): Promise<{ items: Array<{ id: string; hash: string; data: Uint8Array }>; next: string | null }> {
    const r = unwrap(await (await photoActor()).onChainPhotoPage(after === null ? [] : [after]), "onChainPhotoPage");
    return {
      items: r.items.map((i) => ({ id: i.id, hash: i.hash, data: i.data instanceof Uint8Array ? i.data : Uint8Array.from(i.data) })),
      next: r.next.length ? r.next[0]! : null,
    };
  },
  async confirm(moved: Array<[string, string]>): Promise<number> {
    return Number(unwrap(await (await photoActor()).confirmOffChain(moved), "confirmOffChain"));
  },
};
