// Candid interface for the maintenance canister — keep in sync with backend/maintenance/main.mo
export const idlFactory = ({ IDL }: any) => {
  const ScheduleEntry = IDL.Record({
    id:                 IDL.Text,
    propertyId:         IDL.Text,
    systemName:         IDL.Text,
    taskDescription:    IDL.Text,
    plannedYear:        IDL.Nat,
    plannedMonth:       IDL.Opt(IDL.Nat),
    estimatedCostCents: IDL.Opt(IDL.Nat),
    isCompleted:        IDL.Bool,
    createdBy:          IDL.Principal,
    createdAt:          IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput: IDL.Text,
    Paused: IDL.Null,
    RateLimited: IDL.Null,
    Unavailable: IDL.Text,
  });
  // OQL (backend/shared/Oql.mo): rows of named cells.
  const OqlCellValue = IDL.Variant({
    text:  IDL.Text,
    int:   IDL.Int,
    float: IDL.Float64,
    bool:  IDL.Bool,
    null:  IDL.Null,
  });
  const OqlCell = IDL.Record({ name: IDL.Text, value: OqlCellValue });
  const OqlResult = IDL.Record({ hasMore: IDL.Bool, rows: IDL.Vec(IDL.Vec(OqlCell)) });
  return IDL.Service({
    // OQL for AI assistants: a JSON catalogue, and one JSON query -> paged rows.
    schema:  IDL.Func([], [IDL.Text], ["query"]),
    execute: IDL.Func([IDL.Text], [OqlResult], ["composite_query"]),
    getApiDoc: IDL.Func([], [IDL.Text], ["query"]),
    deleteMyData: IDL.Func([], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    createScheduleEntry: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: ScheduleEntry, err: Error })],
      []
    ),
    getScheduleByProperty: IDL.Func([IDL.Text], [IDL.Vec(ScheduleEntry)], []),  // M8: update call (live property-auth check)
    getScheduleForProperties: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(ScheduleEntry)], ["composite_query"]),
    markCompleted: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: ScheduleEntry, err: Error })],
      []
    ),
  });
};
