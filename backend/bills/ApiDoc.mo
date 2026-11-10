/// getApiDoc() text for the bills canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic bills canister\n\n" #
    "Utility bills (electric, gas, water, internet and so on) and other recurring home expenses for a property. It flags a bill as an anomaly when it is more than 20% above the average of the previous three months for the same utility.\n\n" #
    "## Reading\n" #
    "- `getBillsForProperties(propertyIds)` (composite query): bills for several properties. Works in read-only sessions.\n" #
    "- `getBillsForProperty(propertyId)`, `getUsageTrend(propertyId, billType, months)`, `getRecurringExpensesForProperty(propertyId)`: per-property detail. These are update calls.\n\n" #
    "## Questions over the whole record (OQL)\n" #
    "- `schema()` (query): a JSON catalogue of the `bills` and `recurring_expenses` entities: every field, its type and what it means.\n" #
    "- `execute(oql)` (composite query): runs one JSON query over the bills or recurring expenses of the caller's homes and returns rows of named cells, filtered, grouped and added up here, e.g. `{\"start\":\"bills\",\"where\":{\"eq\":{\"field\":\"anomalyFlag\",\"value\":true}}}` for the bills that jumped, or `{\"start\":\"recurring_expenses\",\"aggregate\":[{\"fn\":\"sum\",\"field\":\"annualCents\",\"as\":\"perYear\"}]}` for fixed costs a year. The keys are the same as on the job canister's `execute`. Without a `propertyId` condition it covers the homes the caller entered records for; to read a home the caller co-owns, manages or views, add a `propertyId` `eq` or `in` condition (at most 20 homes). Same rule as `getBillsForProperties`: everything on homes the caller has a role on (mortgage entries only for owner and co-owners), otherwise only records the caller entered. Read-only and free; works in read-only sessions. A malformed query is rejected with a message starting \"OQL:\".\n\n" #
    "## Changing\n" #
    "- `addBill(args)`: records a bill. `amountCents` is in cents. `periodStart` and `periodEnd` are `YYYY-MM-DD`. `usageAmount` with `usageUnit` (for example kWh or gallons) is optional. Adding bills needs a Pro account. Free accounts get `#TierLimitReached`.\n" #
    "- `deleteBill(id)`: deletes a bill. This can't be undone.\n" #
    "- `addRecurringExpense`, `updateRecurringExpense`, `deleteRecurringExpense`: other regular costs (mortgage, property tax, HOA, home insurance, other). Only the owner can see or add mortgage entries. Deleting can't be undone.\n\n" #
    Shared.common()
  };
};
