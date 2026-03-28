import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const PHOTO_CANISTER_ID = (process.env as any).PHOTO_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
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
    getPhotosByJob: IDL.Func([IDL.Text], [IDL.Vec(Photo)], ["query"]),
    getPhotosByProperty: IDL.Func([IDL.Text], [IDL.Vec(Photo)], ["query"]),
    deletePhoto: IDL.Func(
      [IDL.Text],
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

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: PHOTO_CANISTER_ID });
  }
  return _actor;
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
  const buffer     = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const photoService = {
  async upload(
    file:        File,
    jobId:       string,
    propertyId:  string,
    phase:       string,
    description: string
  ): Promise<Photo> {
    const hash = await computeHash(file);

    if (!PHOTO_CANISTER_ID) {
      return {
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
    if (!PHOTO_CANISTER_ID) return [];
    const a = await getActor();
    return (await a.getPhotosByJob(jobId) as any[]).map(fromPhoto);
  },

  async getByProperty(propertyId: string): Promise<Photo[]> {
    if (!PHOTO_CANISTER_ID) return [];
    const a = await getActor();
    return (await a.getPhotosByProperty(propertyId) as any[]).map(fromPhoto);
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
  },
};
