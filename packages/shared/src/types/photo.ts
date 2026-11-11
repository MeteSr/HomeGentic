// Generated from ../declarations/photo.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { Paused: null }
  | { InvalidInput: string }
  | { Duplicate: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { RateLimited: null }
  | { Unavailable: string }
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
  offChain: boolean;
};

export type MigrationStatus = {
  enabled: boolean;
  offChainPhotos: bigint;
  onChainPhotos: bigint;
  onChainBytes: bigint;
};

export type PhotoAccess = {
  owner: Principal;
  hash: string;
  size: bigint;
  canRead: boolean;
  isPublic: boolean;
  offChain: boolean;
};

export type OffChainPage = {
  next: [] | [string];
  items: Array<[string, bigint]>;
};

export type MigrationPage = {
  next: [] | [string];
  items: MigrationItem[];
};

export type MigrationItem = {
  id: string;
  data: Uint8Array | number[];
  hash: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addCronRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  addPhotoRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  beginUpload: ActorMethod<[string, string, ConstructionPhase, string, string, bigint], { ok: Photo } | { err: Error }>;
  beginWaiverUpload: ActorMethod<[string, string, string, bigint], { ok: Photo } | { err: Error }>;
  confirmOffChain: ActorMethod<[Array<[string, string]>], { ok: bigint } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  deletePhoto: ActorMethod<[string], { ok: null } | { err: Error }>;
  dropUnuploadedPhotos: ActorMethod<[string[]], { ok: bigint } | { err: Error }>;
  getGuidePhotoData: ActorMethod<[string, string], { ok: Uint8Array | number[] } | { err: Error }>;
  getListingPhotoDataBatch: ActorMethod<[string[]], Array<[string, Uint8Array | number[]]>>;
  getMyOffChainPhotoIds: ActorMethod<[], string[]>;
  getOffChainMigrationStatus: ActorMethod<[], { ok: MigrationStatus } | { err: Error }>;
  getPhotoDataBatch: ActorMethod<[string[]], Array<[string, Uint8Array | number[]]>>;
  getPhotosByJob: ActorMethod<[string], Photo[]>;
  getPhotosByProperty: ActorMethod<[string], Photo[]>;
  getPhotosByRoom: ActorMethod<[string], Photo[]>;
  getPublicListingPhotos: ActorMethod<[string], Photo[]>;
  guidePhotoAccess: ActorMethod<[string, string], [] | [PhotoAccess]>;
  knownPhotoIds: ActorMethod<[string[]], { ok: string[] } | { err: Error }>;
  offChainPhotoPage: ActorMethod<[[] | [string]], { ok: OffChainPage } | { err: Error }>;
  onChainPhotoPage: ActorMethod<[[] | [string]], { ok: MigrationPage } | { err: Error }>;
  photoAccess: ActorMethod<[string, Principal], [] | [PhotoAccess]>;
  removeCronRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  removePhotoRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setCronDailyLimits: ActorMethod<[bigint, bigint], { ok: null } | { err: Error }>;
  setOffChainMigrationEnabled: ActorMethod<[boolean], { ok: null } | { err: Error }>;
  setPropertyCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  uploadPhoto: ActorMethod<
    [string, string, ConstructionPhase, string, string, Uint8Array | number[]],
    { ok: Photo } | { err: Error }
  >;
  uploadWaiver: ActorMethod<[string, string, string, Uint8Array | number[]], { ok: Photo } | { err: Error }>;
}
