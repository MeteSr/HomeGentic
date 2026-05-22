// Candid interface for the bills canister — keep in sync with backend/bills/main.mo
export const idlFactory = ({ IDL }: any) => {
  const BillType = IDL.Variant({
    Electric: IDL.Null,
    Gas:      IDL.Null,
    Water:    IDL.Null,
    Internet: IDL.Null,
    Telecom:  IDL.Null,
    Other:    IDL.Null,
  });

  const BillRecord = IDL.Record({
    id:            IDL.Text,
    propertyId:    IDL.Text,
    homeowner:     IDL.Principal,
    billType:      BillType,
    provider:      IDL.Text,
    periodStart:   IDL.Text,
    periodEnd:     IDL.Text,
    amountCents:   IDL.Nat,
    usageAmount:   IDL.Opt(IDL.Float64),
    usageUnit:     IDL.Opt(IDL.Text),
    uploadedAt:    IDL.Int,
    anomalyFlag:   IDL.Bool,
    anomalyReason: IDL.Opt(IDL.Text),
  });

  const AddBillArgs = IDL.Record({
    propertyId:  IDL.Text,
    billType:    BillType,
    provider:    IDL.Text,
    periodStart: IDL.Text,
    periodEnd:   IDL.Text,
    amountCents: IDL.Nat,
    usageAmount: IDL.Opt(IDL.Float64),
    usageUnit:   IDL.Opt(IDL.Text),
  });

  const Error = IDL.Variant({
    NotFound:         IDL.Null,
    NotAuthorized:    IDL.Null,
    InvalidInput:     IDL.Text,
    TierLimitReached: IDL.Text,
  });

  const UsagePeriod = IDL.Record({
    periodStart: IDL.Text,
    usageAmount: IDL.Float64,
    usageUnit:   IDL.Text,
  });

  return IDL.Service({
    addBill: IDL.Func(
      [AddBillArgs],
      [IDL.Variant({ ok: BillRecord, err: Error })],
      []
    ),
    getBillsForProperty: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(BillRecord), err: Error })],
      []
    ),
    deleteBill: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getUsageTrend: IDL.Func(
      [IDL.Text, BillType, IDL.Nat],
      [IDL.Variant({ ok: IDL.Vec(UsagePeriod), err: Error })],
      []
    ),
    metrics: IDL.Func(
      [],
      [IDL.Record({ totalBills: IDL.Nat, isPaused: IDL.Bool })],
      ["query"]
    ),
  });
};
