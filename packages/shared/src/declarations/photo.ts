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
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    QuotaExceeded: IDL.Text,
    Duplicate:     IDL.Text,
    InvalidInput:  IDL.Text,
  });
  const PhotoAccess = IDL.Record({
    owner:    IDL.Principal,
    hash:     IDL.Text,
    size:     IDL.Nat,
    offChain: IDL.Bool,
    isPublic: IDL.Bool,
    canRead:  IDL.Bool,
  });
  return IDL.Service({
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
    // Photo relays (the voice Worker) only.
    photoAccess: IDL.Func(
      [IDL.Text, IDL.Principal],
      [IDL.Opt(PhotoAccess)],
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
    getPhotosByJob:          IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByProperty:     IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByRoom:         IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPublicListingPhotos:  IDL.Func([IDL.Text], [IDL.Vec(Photo)], ["query"]),
    getPhotoDataBatch:        IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat8)))], []),
    getListingPhotoDataBatch: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat8)))], ["query"]),
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
