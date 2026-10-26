// Candid interface for the referrals canister — keep in sync with backend/referrals/main.mo
export const idlFactory = ({ IDL }: any) => {
  const Referral = IDL.Record({
    referrer:    IDL.Text,
    referee:     IDL.Text,
    code:        IDL.Text,
    referredAt:  IDL.Int,
    convertedAt: IDL.Opt(IDL.Int),
  });

  const Error = IDL.Variant({
    AlreadyReferred:  IDL.Null,
    SelfReferral:     IDL.Null,
    CodeNotFound:     IDL.Null,
    AlreadyConverted: IDL.Null,
    Unauthorized:     IDL.Null,
    InvalidInput:     IDL.Text,
  });

  const Result   = IDL.Variant({ ok: IDL.Null, err: Error });
  const ResultTx = IDL.Variant({ ok: IDL.Null, err: IDL.Text });
  const Stats    = IDL.Record({ totalCodes: IDL.Nat, totalReferrals: IDL.Nat, totalConverted: IDL.Nat });

  return IDL.Service({
    getMyCode:            IDL.Func([],                        [IDL.Text],          []),  // update: lazily creates the code (a query call would discard it)
    useReferralCode:      IDL.Func([IDL.Text],                [Result],            []),
    markConverted:        IDL.Func([IDL.Principal],           [Result],            []),
    getMyReferrals:       IDL.Func([],                        [IDL.Vec(Referral)], ["query"]),
    getCreditBalance:     IDL.Func([],                        [IDL.Nat],           ["query"]),
    setPaymentCanisterId: IDL.Func([IDL.Text],                [],                  []),
    setBootstrapNonce:    IDL.Func([IDL.Text],                [],                  []),
    addAdmin:             IDL.Func([IDL.Principal, IDL.Text], [ResultTx],          []),
    pause:                IDL.Func([IDL.Opt(IDL.Nat)],        [Result],            []),
    unpause:              IDL.Func([],                        [Result],            []),
    metrics:              IDL.Func([],                        [Stats],             ["query"]),
  });
};
