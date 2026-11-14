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
  knownPhotoIds(ids: string[]): Promise<CandidResult<string[]>>;
  offChainPhotoPage(after: [] | [string]): Promise<CandidResult<{ items: Array<[string, bigint]>; next: [] | [string] }>>;
  dropUnuploadedPhotos(ids: string[]): Promise<CandidResult<bigint>>;
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

/**
 * X-1 (security review 2026-11-11): the migration and orphan sweep can empty
 * on-chain bytes and drop records, so they sign with their own key,
 * PHOTO_CRON_IDENTITY_PEM, granted by photo.addCronRelay. Never the
 * request-path DFX_IDENTITY_PEM: a leak of that key can't erase photos.
 */
const cronAgents = new Map<string, Promise<HttpAgent>>();

async function cronActor(): Promise<PhotoActor> {
  const pem = process.env.PHOTO_CRON_IDENTITY_PEM;
  if (!pem) throw new Error("PHOTO_CRON_IDENTITY_PEM is not set — the photo cron is off");
  const canisterId = process.env.CANISTER_ID_PHOTO;
  if (!canisterId) throw new Error("CANISTER_ID_PHOTO is not set — the photo cron is off");
  const { host, rootKey } = icHost();
  let agent = cronAgents.get(host);
  if (!agent) {
    agent = HttpAgent.create({ host, identity: identityFromPem(pem), rootKey });
    cronAgents.set(host, agent);
  }
  return Actor.createActor(idlFactory, { agent: await agent, canisterId }) as unknown as PhotoActor;
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
    const r = unwrap(await (await cronActor()).onChainPhotoPage(after === null ? [] : [after]), "onChainPhotoPage");
    return {
      items: r.items.map((i) => ({ id: i.id, hash: i.hash, data: i.data instanceof Uint8Array ? i.data : Uint8Array.from(i.data) })),
      next: r.next.length ? r.next[0]! : null,
    };
  },
  async confirm(moved: Array<[string, string]>): Promise<number> {
    return Number(unwrap(await (await cronActor()).confirmOffChain(moved), "confirmOffChain"));
  },
};

/** Part 4: the photo canister calls the orphan sweep makes (src/photoSweep.ts). */
export const photoSweepCanister = {
  async known(ids: string[]): Promise<string[]> {
    return unwrap(await (await cronActor()).knownPhotoIds(ids), "knownPhotoIds");
  },
  async offChainPage(after: string | null): Promise<{ items: Array<{ id: string; createdAtMs: number }>; next: string | null }> {
    const r = unwrap(await (await cronActor()).offChainPhotoPage(after === null ? [] : [after]), "offChainPhotoPage");
    return {
      items: r.items.map(([id, ns]) => ({ id, createdAtMs: Number(ns / 1_000_000n) })),
      next: r.next.length ? r.next[0]! : null,
    };
  },
  async dropUnuploaded(ids: string[]): Promise<number> {
    return Number(unwrap(await (await cronActor()).dropUnuploadedPhotos(ids), "dropUnuploadedPhotos"));
  },
};
