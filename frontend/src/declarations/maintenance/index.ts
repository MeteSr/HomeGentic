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
  });
  return IDL.Service({
    createScheduleEntry: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: ScheduleEntry, err: Error })],
      []
    ),
    getScheduleByProperty: IDL.Func([IDL.Text], [IDL.Vec(ScheduleEntry)], ["query"]),
    markCompleted: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: ScheduleEntry, err: Error })],
      []
    ),
  });
};
