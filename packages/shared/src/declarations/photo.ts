// Candid interface for the photo canister — keep in sync with backend/photo/main.mo
export const idlFactory = ({ IDL }: any) => {
  const ConstructionPhase = IDL.Variant({
    PreConstruction: IDL.Null, Foundation: IDL.Null, Framing: IDL.Null,
    Electrical: IDL.Null, Plumbing: IDL.Null, HVAC: IDL.Null,
    Insulation: IDL.Null, Drywall: IDL.Null, Finishing: IDL.Null,
    PostConstruction: IDL.Null, Warranty: IDL.Null,
    Listing: IDL.Null,  // FSBO listing photos
  });
  // PhotoMeta in backend/photo/main.mo: a photo without its bytes.
  const Photo = IDL.Record({
    id:          IDL.Text,
    jobId:       IDL.Text,
    propertyId:  IDL.Text,
    owner:       IDL.Principal,
    phase:       ConstructionPhase,
    description: IDL.Text,
    hash:        IDL.Text,
    size:        IDL.Nat,
    verified:    IDL.Bool,
    approvals:   IDL.Vec(IDL.Principal),
    createdAt:   IDL.Int,
    // Bytes are off-chain: load them from the Worker, not getPhotoDataBatch.
    offChain:    IDL.Bool,
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    QuotaExceeded: IDL.Text,
    Duplicate:     IDL.Text,
    InvalidInput:  IDL.Text,
    Paused: IDL.Null,
    RateLimited: IDL.Null,
    Unavailable: IDL.Text,
  });
  const PhotoAccess = IDL.Record({
    owner:    IDL.Principal,
    hash:     IDL.Text,
    size:     IDL.Nat,
    offChain: IDL.Bool,
    isPublic: IDL.Bool,
    canRead:  IDL.Bool,
  });
  // Part 3 of the off-chain move (photo relay and admins only).
  const MigrationItem = IDL.Record({ id: IDL.Text, hash: IDL.Text, data: IDL.Vec(IDL.Nat8) });
  const MigrationPage = IDL.Record({ items: IDL.Vec(MigrationItem), next: IDL.Opt(IDL.Text) });
  const MigrationStatus = IDL.Record({
    enabled:        IDL.Bool,
    onChainPhotos:  IDL.Nat,
    onChainBytes:   IDL.Nat,
    offChainPhotos: IDL.Nat,
  });
  // Part 4: the Worker's orphan sweep (photo relay and admins only).
  const OffChainPage = IDL.Record({ items: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Int)), next: IDL.Opt(IDL.Text) });
  return IDL.Service({
    deleteMyData: IDL.Func([], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    uploadPhoto: IDL.Func(
      [IDL.Text, IDL.Text, ConstructionPhase, IDL.Text, IDL.Text, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ ok: Photo, err: Error })],
      []
    ),
    // Off-chain upload: registers the photo; bytes then go to the voice Worker.
    beginUpload: IDL.Func(
      [IDL.Text, IDL.Text, ConstructionPhase, IDL.Text, IDL.Text, IDL.Nat],
      [IDL.Variant({ ok: Photo, err: Error })],
      []
    ),
    // #716: the contractor who signed a job files its final lien waiver in the
    // home's document vault (jobId, filename, hash, size); bytes then go to the Worker.
    beginWaiverUpload: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat],
      [IDL.Variant({ ok: Photo, err: Error })],
      []
    ),
    // #716: the same with the bytes on-chain (PDFs, or no off-chain storage).
    uploadWaiver: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ ok: Photo, err: Error })],
      []
    ),
    // Photo relays (the voice Worker) only.
    photoAccess: IDL.Func(
      [IDL.Text, IDL.Principal],
      [IDL.Opt(PhotoAccess)],
      ["composite_query"]
    ),
    // #725 house-guide links: photo relays only, like photoAccess.
    guidePhotoAccess: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Opt(PhotoAccess)],
      ["composite_query"]
    ),
    // #725: bytes for anyone holding a live guide link that shows the photo
    // (empty when stored off-chain: GET /photos/<id>?guide=<token> on the Worker).
    getGuidePhotoData: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(IDL.Nat8), err: Error })],
      ["composite_query"]
    ),
    addPhotoRelay: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    removePhotoRelay: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // X-1 (2026-11-11): the migration/sweep cron's own identity and daily caps.
    addCronRelay: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    removeCronRelay: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setCronDailyLimits: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPhotosByJob:          IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByProperty:     IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByRoom:         IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPublicListingPhotos:  IDL.Func([IDL.Text], [IDL.Vec(Photo)], ["query"]),
    getPhotoDataBatch:        IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat8)))], []),
    getListingPhotoDataBatch: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat8)))], ["query"]),
    getMyOffChainPhotoIds: IDL.Func([], [IDL.Vec(IDL.Text)], ["query"]),
    // Part 3: moving on-chain photos to off-chain storage.
    setOffChainMigrationEnabled: IDL.Func([IDL.Bool], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getOffChainMigrationStatus: IDL.Func([], [IDL.Variant({ ok: MigrationStatus, err: Error })], ["query"]),
    onChainPhotoPage: IDL.Func([IDL.Opt(IDL.Text)], [IDL.Variant({ ok: MigrationPage, err: Error })], []),
    confirmOffChain: IDL.Func([IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    // Part 4: the orphan sweep.
    knownPhotoIds: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Variant({ ok: IDL.Vec(IDL.Text), err: Error })], ["query"]),
    offChainPhotoPage: IDL.Func([IDL.Opt(IDL.Text)], [IDL.Variant({ ok: OffChainPage, err: Error })], ["query"]),
    dropUnuploadedPhotos: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
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
