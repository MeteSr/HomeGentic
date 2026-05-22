// Candid interface for the photo canister — keep in sync with backend/photo/main.mo
export const idlFactory = ({ IDL }: any) => {
  const ConstructionPhase = IDL.Variant({
    PreConstruction: IDL.Null, Foundation: IDL.Null, Framing: IDL.Null,
    Electrical: IDL.Null, Plumbing: IDL.Null, HVAC: IDL.Null,
    Insulation: IDL.Null, Drywall: IDL.Null, Finishing: IDL.Null,
    PostConstruction: IDL.Null, Warranty: IDL.Null,
    Listing: IDL.Null,  // FSBO listing photos
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
    NotAuthorized: IDL.Null,
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
    getPhotosByJob:          IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByProperty:     IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByRoom:         IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPublicListingPhotos:  IDL.Func([IDL.Text], [IDL.Vec(Photo)], ["query"]),
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
