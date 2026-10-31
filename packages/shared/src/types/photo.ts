// Generated from ../declarations/photo.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { InvalidInput: string }
  | { Duplicate: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { QuotaExceeded: string };

export type ConstructionPhase =
  | { Framing: null }
  | { HVAC: null }
  | { Foundation: null }
  | { Plumbing: null }
  | { Finishing: null }
  | { Insulation: null }
  | { Drywall: null }
  | { Warranty: null }
  | { PreConstruction: null }
  | { Electrical: null }
  | { Listing: null }
  | { PostConstruction: null };

export type Photo = {
  id: string;
  verified: boolean;
  owner: Principal;
  hash: string;
  createdAt: bigint;
  size: bigint;
  jobId: string;
  description: string;
  propertyId: string;
  phase: ConstructionPhase;
  approvals: Principal[];
};

export type PhotoAccess = {
  owner: Principal;
  hash: string;
  size: bigint;
  canRead: boolean;
  isPublic: boolean;
  offChain: boolean;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addPhotoRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  beginUpload: ActorMethod<[string, string, ConstructionPhase, string, string, bigint], { ok: Photo } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  deletePhoto: ActorMethod<[string], { ok: null } | { err: Error }>;
  getListingPhotoDataBatch: ActorMethod<[string[]], Array<[string, Uint8Array | number[]]>>;
  getMyOffChainPhotoIds: ActorMethod<[], string[]>;
  getPhotoDataBatch: ActorMethod<[string[]], Array<[string, Uint8Array | number[]]>>;
  getPhotosByJob: ActorMethod<[string], Photo[]>;
  getPhotosByProperty: ActorMethod<[string], Photo[]>;
  getPhotosByRoom: ActorMethod<[string], Photo[]>;
  getPublicListingPhotos: ActorMethod<[string], Photo[]>;
  photoAccess: ActorMethod<[string, Principal], [] | [PhotoAccess]>;
  removePhotoRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setPropertyCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  uploadPhoto: ActorMethod<
    [string, string, ConstructionPhase, string, string, Uint8Array | number[]],
    { ok: Photo } | { err: Error }
  >;
}
