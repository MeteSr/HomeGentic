/// getApiDoc() text for the bills canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic bills canister\n\n" #
    "Utility bills (electric, gas, water, internet and so on) and other recurring home expenses for a property. It flags a bill as an anomaly when it is more than 20% above the average of the previous three months for the same utility.\n\n" #
    "## Reading\n" #
    "- `getBillsForProperties(propertyIds)` (composite query): bills for several properties. Works in read-only sessions.\n" #
    "- `getBillsForProperty(propertyId)`, `getUsageTrend(propertyId, billType, months)`, `getRecurringExpensesForProperty(propertyId)`: per-property detail. These are update calls.\n\n" #
    "## Changing\n" #
    "- `addBill(args)`: records a bill. `amountCents` is in cents. `periodStart` and `periodEnd` are `YYYY-MM-DD`. `usageAmount` with `usageUnit` (for example kWh or gallons) is optional. Adding bills needs a Pro account. Free accounts get `#TierLimitReached`.\n" #
    "- `deleteBill(id)`: deletes a bill. This can't be undone.\n" #
    "- `addRecurringExpense`, `updateRecurringExpense`, `deleteRecurringExpense`: other regular costs (mortgage, property tax, HOA, home insurance, other). Only the owner can see or add mortgage entries. Deleting can't be undone.\n\n" #
    Shared.common()
  };
};
