// Candid interface for the agent canister — keep in sync with backend/agent/main.mo
export const idlFactory = ({ IDL }: any) => {
  const AgentProfile = IDL.Record({
    id:                   IDL.Principal,
    name:                 IDL.Text,
    brokerage:            IDL.Text,
    licenseNumber:        IDL.Text,
    licenseState:         IDL.Text,
    county:               IDL.Text,
    serviceCities:        IDL.Vec(IDL.Text),
    bio:                  IDL.Text,
    phone:                IDL.Text,
    email:                IDL.Text,
    avgDaysOnMarket:      IDL.Nat,
    listingsLast12Months: IDL.Nat,
    isVerified:           IDL.Bool,
    lastVerifiedAt:       IDL.Int,
    cardOnFile:           IDL.Bool,
    createdAt:            IDL.Int,
    updatedAt:            IDL.Int,
  });

  const RegisterArgs = IDL.Record({
    name:          IDL.Text,
    brokerage:     IDL.Text,
    licenseNumber: IDL.Text,
    licenseState:  IDL.Text,
    county:        IDL.Text,
    serviceCities: IDL.Vec(IDL.Text),
    bio:           IDL.Text,
    phone:         IDL.Text,
    email:         IDL.Text,
  });

  const AgentReview = IDL.Record({
    id:                IDL.Text,
    agentId:           IDL.Principal,
    reviewerPrincipal: IDL.Principal,
    rating:            IDL.Nat,
    comment:           IDL.Text,
    transactionId:     IDL.Text,
    createdAt:         IDL.Int,
  });

  const AddReviewArgs = IDL.Record({
    agentId:       IDL.Principal,
    rating:        IDL.Nat,
    comment:       IDL.Text,
    transactionId: IDL.Text,
  });

  const Error = IDL.Variant({
    NotFound: IDL.Null, NotAuthorized: IDL.Null, AlreadyExists: IDL.Null,
    DuplicateReview: IDL.Null, InvalidInput: IDL.Text,
  });

  return IDL.Service({
    register: IDL.Func([RegisterArgs], [IDL.Variant({ ok: AgentProfile, err: Error })], []),
    getMyProfile: IDL.Func([], [IDL.Opt(AgentProfile)], ["query"]),
    getProfile: IDL.Func([IDL.Principal], [IDL.Opt(AgentProfile)], ["query"]),
    getAllProfiles: IDL.Func([], [IDL.Vec(AgentProfile)], ["query"]),
    getProfilesByCounty: IDL.Func([IDL.Text], [IDL.Vec(AgentProfile)], ["query"]),
    getAgentsForCity: IDL.Func([IDL.Text, IDL.Nat], [IDL.Vec(AgentProfile)], ["query"]),
    updateProfile: IDL.Func([RegisterArgs], [IDL.Variant({ ok: AgentProfile, err: Error })], []),
    setCardOnFile: IDL.Func([IDL.Bool], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    verifyAgent: IDL.Func([IDL.Principal], [IDL.Variant({ ok: AgentProfile, err: Error })], []),
    revokeAgent: IDL.Func([IDL.Principal], [IDL.Variant({ ok: AgentProfile, err: Error })], []),
    isVerifiedAgent: IDL.Func([IDL.Principal], [IDL.Bool], ["query"]),
    recordListingClose: IDL.Func([IDL.Principal, IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    addReview: IDL.Func([AddReviewArgs], [IDL.Variant({ ok: AgentReview, err: Error })], []),
    getReviews: IDL.Func([IDL.Principal], [IDL.Vec(AgentReview)], ["query"]),
    setListingCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setUpdateRateLimit: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    initAdmins: IDL.Func([IDL.Vec(IDL.Principal)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    addAdmin: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    removeAdmin: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    pause: IDL.Func([IDL.Opt(IDL.Nat)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    unpause: IDL.Func([], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    metrics: IDL.Func([], [IDL.Record({
      totalAgents: IDL.Nat, verifiedAgents: IDL.Nat, totalReviews: IDL.Nat, isPaused: IDL.Bool,
    })], ["query"]),
  });
};
