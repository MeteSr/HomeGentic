// Generated from ../declarations/bills.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type AddBillArgs = {
  provider: string;
  propertyId: string;
  amountCents: bigint;
  usageUnit: [] | [string];
  periodEnd: string;
  billType: BillType;
  usageAmount: [] | [number];
  periodStart: string;
};

export type BillType =
  { Gas: null } | { Internet: null } | { Water: null } | { Telecom: null } | { Electric: null } | { Other: null };

export type BillRecord = {
  id: string;
  anomalyFlag: boolean;
  provider: string;
  anomalyReason: [] | [string];
  propertyId: string;
  amountCents: bigint;
  usageUnit: [] | [string];
  periodEnd: string;
  billType: BillType;
  usageAmount: [] | [number];
  periodStart: string;
  homeowner: Principal;
  uploadedAt: bigint;
};

export type Error =
  { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null } | { TierLimitReached: string };

export type RecurringExpenseFields = {
  provider: string;
  endDate: [] | [string];
  amountCents: bigint;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  startDate: string;
};

export type ExpenseCategory =
  { HOA: null } | { PropertyTax: null } | { Other: null } | { Mortgage: null } | { HomeInsurance: null };

export type ExpenseFrequency = { Quarterly: null } | { Monthly: null } | { SemiAnnual: null } | { Annual: null };

export type RecurringExpense = {
  id: string;
  provider: string;
  endDate: [] | [string];
  createdAt: bigint;
  propertyId: string;
  amountCents: bigint;
  updatedAt: bigint;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  homeowner: Principal;
  startDate: string;
};

export type UsagePeriod = {
  usageUnit: string;
  usageAmount: number;
  periodStart: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addBill: ActorMethod<[AddBillArgs], { ok: BillRecord } | { err: Error }>;
  addRecurringExpense: ActorMethod<[string, RecurringExpenseFields], { ok: RecurringExpense } | { err: Error }>;
  deleteBill: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  deleteRecurringExpense: ActorMethod<[string], { ok: null } | { err: Error }>;
  getBillsForProperties: ActorMethod<[string[]], BillRecord[]>;
  getBillsForProperty: ActorMethod<[string], { ok: BillRecord[] } | { err: Error }>;
  getRecurringExpensesForProperty: ActorMethod<[string], { ok: RecurringExpense[] } | { err: Error }>;
  getUsageTrend: ActorMethod<[string, BillType, bigint], { ok: UsagePeriod[] } | { err: Error }>;
  metrics: ActorMethod<
    [],
    {
      isPaused: boolean;
      totalBills: bigint;
    }
  >;
  updateRecurringExpense: ActorMethod<[string, RecurringExpenseFields], { ok: RecurringExpense } | { err: Error }>;
}
