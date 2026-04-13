import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const PHOTO_CANISTER_ID = (process.env as any).PHOTO_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const ConstructionPhase = IDL.Variant({
    PreConstruction: IDL.Null, Foundation: IDL.Null, Framing: IDL.Null,
    Electrical: IDL.Null, Plumbing: IDL.Null, HVAC: IDL.Null,
    Insulation: IDL.Null, Drywall: IDL.Null, Finishing: IDL.Null,
    PostConstruction: IDL.Null, Warranty: IDL.Null,
  });
  const Photo = IDL.Record({
    id:          IDL.Text,
    jobId:       IDL.Text,
    propertyId:  IDL.Text,
    owner:       IDL.Principal,
    phase:       ConstructionPhase,
    description: IDL.Text,
    hash:        IDL.Text,
    data:        IDL.Vec(IDL.Nat8),
    size:        IDL.Nat,
    verified:    IDL.Bool,
    approvals:   IDL.Vec(IDL.Principal),
    createdAt:   IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    Unauthorized:  IDL.Null,
    QuotaExceeded: IDL.Text,
    Duplicate:     IDL.Text,
    InvalidInput:  IDL.Text,
  });
  return IDL.Service({
    uploadPhoto: IDL.Func(
      [IDL.Text, IDL.Text, ConstructionPhase, IDL.Text, IDL.Text, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ ok: Photo, err: Error })],
      []
    ),
    getPhotosByJob:      IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByProperty: IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByRoom:     IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    deletePhoto: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setPropertyCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export interface Photo {
  id:          string;
  jobId:       string;
  propertyId:  string;
  phase:       string;
  description: string;
  hash:        string;
  url:         string;    // blob URL created from raw data
  size:        number;
  verified:    boolean;
  createdAt:   number;    // ms
}

export interface PhotoQuota {
  used:  number;
  limit: number;
  tier:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fromPhoto(raw: any): Photo {
  const phaseKey = Object.keys(raw.phase)[0];
  const blob     = new Blob([new Uint8Array(raw.data as number[])]);
  const url      = URL.createObjectURL(blob);
  return {
    id:          raw.id,
    jobId:       raw.jobId,
    propertyId:  raw.propertyId,
    phase:       phaseKey,
    description: raw.description,
    hash:        raw.hash,
    url,
    size:        Number(raw.size),
    verified:    raw.verified,
    createdAt:   Number(raw.createdAt) / 1_000_000,
  };
}

async function computeHash(file: File): Promise<string> {
  const raw    = await file.arrayBuffer();
  // Normalise to Uint8Array: jsdom/Node may return a Buffer or other non-ArrayBuffer
  // subtype that some SubtleCrypto implementations reject with a strict instanceof check.
  const bytes      = new Uint8Array(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createPhotoService() {
  let _actor: any = null;
  const store: Photo[] = [];

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: PHOTO_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async upload(
    file:        File,
    jobId:       string,
    propertyId:  string,
    phase:       string,
    description: string
  ): Promise<Photo> {
    const hash = await computeHash(file);

    if (!PHOTO_CANISTER_ID) {
      const photo: Photo = {
        id:          String(Date.now()),
        jobId,
        propertyId,
        phase,
        description,
        hash,
        url:         URL.createObjectURL(file),
        size:        file.size,
        verified:    false,
        createdAt:   Date.now(),
      };
      store.push(photo);
      return photo;
    }

    const a      = await getActor();
    const buffer = await file.arrayBuffer();
    const data   = Array.from(new Uint8Array(buffer));
    const result = await a.uploadPhoto(
      jobId,
      propertyId,
      { [phase]: null },
      description,
      hash,
      data,
    );
    if ("ok" in result) return fromPhoto(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getByJob(jobId: string): Promise<Photo[]> {
    if (!PHOTO_CANISTER_ID) return store.filter((p) => p.jobId === jobId);
    const a = await getActor();
    return (await a.getPhotosByJob(jobId) as any[]).map(fromPhoto);
  },

  async getByProperty(propertyId: string): Promise<Photo[]> {
    if (!PHOTO_CANISTER_ID) return store.filter((p) => p.propertyId === propertyId);
    const a = await getActor();
    return (await a.getPhotosByProperty(propertyId) as any[]).map(fromPhoto);
  },

  async getByRoom(roomId: string): Promise<Photo[]> {
    if (!PHOTO_CANISTER_ID) return store.filter((p) => p.jobId === `ROOM_${roomId}`);
    const a = await getActor();
    return (await a.getPhotosByRoom(roomId) as any[]).map(fromPhoto);
  },

  /** Upload a photo for a room (no job required). Uses synthetic jobId internally. */
  async uploadRoomPhoto(
    file:        File,
    roomId:      string,
    propertyId:  string,
    phase:       string,
    description: string
  ): Promise<Photo> {
    return this.upload(file, `ROOM_${roomId}`, propertyId, phase, description);
  },

  async deletePhoto(photoId: string): Promise<void> {
    if (!PHOTO_CANISTER_ID) return;
    const a = await getActor();
    const result = await a.deletePhoto(photoId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  /** Quota is enforced server-side. Returns a reasonable display value. */
  async getQuota(): Promise<PhotoQuota> {
    return { used: 0, limit: 10, tier: "Free" };
  },

  reset() {
    _actor = null;
    store.length = 0;
  },
  };
}

export const photoService = createPhotoService();
