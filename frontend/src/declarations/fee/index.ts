// Candid interface for the fee canister — keep in sync with backend/fee/main.mo
export const idlFactory = ({ IDL }: any) => {
  const FeeStatus = IDL.Variant({ Owed: IDL.Null, Invoiced: IDL.Null, Paid: IDL.Null, Waived: IDL.Null });
  const FeeRecord = IDL.Record({
    id:          IDL.Text,
    requestId:   IDL.Text,
    proposalId:  IDL.Text,
    agentId:     IDL.Principal,
    homeownerId: IDL.Principal,
    amountCents: IDL.Nat,
    status:      FeeStatus,
    createdAt:   IDL.Int,
    updatedAt:   IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound: IDL.Null, NotAuthorized: IDL.Null, AlreadyExists: IDL.Null, InvalidInput: IDL.Text,
  });

  return IDL.Service({
    recordFeeOwed: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Principal, IDL.Principal, IDL.Nat],
      [IDL.Variant({ ok: FeeRecord, err: Error })],
      []
    ),
    getMyFees: IDL.Func([], [IDL.Vec(FeeRecord)], ["query"]),
    getAllFees: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(FeeRecord), err: Error })], ["query"]),
    getFeesDue: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(FeeRecord), err: Error })], ["query"]),
    markFeeInvoiced: IDL.Func([IDL.Text], [IDL.Variant({ ok: FeeRecord, err: Error })], []),
    markFeePaid: IDL.Func([IDL.Text], [IDL.Variant({ ok: FeeRecord, err: Error })], []),
    waiveFee: IDL.Func([IDL.Text], [IDL.Variant({ ok: FeeRecord, err: Error })], []),
    setListingCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setUpdateRateLimit: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    initAdmins: IDL.Func([IDL.Vec(IDL.Principal)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    addAdmin: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    removeAdmin: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    pause: IDL.Func([IDL.Opt(IDL.Nat)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    unpause: IDL.Func([], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    metrics: IDL.Func([], [IDL.Record({
      totalFees: IDL.Nat, owedCents: IDL.Nat, paidCents: IDL.Nat, isPaused: IDL.Bool,
    })], ["query"]),
  });
};
