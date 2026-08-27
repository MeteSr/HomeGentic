// Candid interface for the ai_proxy canister — keep in sync with backend/ai_proxy/main.mo
export const idlFactory = ({ IDL }: any) => {
  const Error = IDL.Variant({
    NotAuthorized:    IDL.Null,
    NotFound:         IDL.Null,
    InvalidInput:     IDL.Text,
    RateLimited:      IDL.Null,
    Paused:           IDL.Null,
    HttpError:        IDL.Text,
    KeyNotConfigured: IDL.Null,
  });
  const ResultTextText = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  const ResultOkError  = IDL.Variant({ ok: IDL.Null, err: Error });
  const ResultTextError = IDL.Variant({ ok: IDL.Text, err: Error });
  const Metrics = IDL.Record({
    emailSentTotal : IDL.Nat,
    permitsFetched : IDL.Nat,
    adminCount     : IDL.Nat,
    isPaused       : IDL.Bool,
  });
  const KeyStatus = IDL.Record({
    resendKeySet     : IDL.Bool,
    openPermitKeySet : IDL.Bool,
    attomKeySet      : IDL.Bool,
  });
  return IDL.Service({
    // ── Pure query functions ─────────────────────────────────────────────────
    getPriceBenchmark  : IDL.Func([IDL.Text, IDL.Text], [ResultTextText], ["query"]),
    instantForecast    : IDL.Func([IDL.Text, IDL.Nat, IDL.Opt(IDL.Text), IDL.Text], [ResultTextText], ["query"]),
    checkReport        : IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    lookupYearBuilt    : IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    emailUsage         : IDL.Func([], [IDL.Text], ["query"]),
    health             : IDL.Func([], [IDL.Text], ["query"]),
    getKeyStatus       : IDL.Func([], [KeyStatus], ["query"]),
    getTrustedCanisters: IDL.Func([], [IDL.Vec(IDL.Principal)], ["query"]),
    getMetrics         : IDL.Func([], [Metrics], ["query"]),

    // ── Update functions (HTTP outcalls / state changes) ─────────────────────
    lookupPropertyDetails: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [ResultTextError],
      []
    ),
    requestReport      : IDL.Func([IDL.Text, IDL.Text], [ResultOkError], []),
    importPermits      : IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [ResultTextError], []),
    sendEmail          : IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Text), IDL.Opt(IDL.Text), IDL.Opt(IDL.Text)],
      [ResultTextError],
      []
    ),
    sendInviteEmail    : IDL.Func(
      [IDL.Text, IDL.Opt(IDL.Text), IDL.Text, IDL.Text, IDL.Opt(IDL.Nat), IDL.Text],
      [ResultTextError],
      []
    ),
    sendJobMatchEmail  : IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [ResultTextError],
      []
    ),

    // ── Admin ────────────────────────────────────────────────────────────────
    addAdmin            : IDL.Func([IDL.Principal], [ResultOkError], []),
    setResendApiKey     : IDL.Func([IDL.Text], [ResultOkError], []),
    setOpenPermitApiKey : IDL.Func([IDL.Text], [ResultOkError], []),
    setAttomApiKey      : IDL.Func([IDL.Text], [ResultOkError], []),
    setResendFromAddress: IDL.Func([IDL.Text], [ResultOkError], []),
    addTrustedCanister  : IDL.Func([IDL.Principal], [ResultOkError], []),
    removeTrustedCanister:IDL.Func([IDL.Principal], [ResultOkError], []),
    setUpdateRateLimit  : IDL.Func([IDL.Nat], [ResultOkError], []),
    pause               : IDL.Func([IDL.Opt(IDL.Nat)], [ResultOkError], []),
    unpause             : IDL.Func([], [ResultOkError], []),
  });
};
