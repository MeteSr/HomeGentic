/// getApiDoc() text for the maintenance canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic maintenance canister\n\n" #
    "Predicts when a home's major systems (roof, HVAC, water heater and so on) will need work, and keeps the owner's planned maintenance schedule.\n\n" #
    "## Reading\n" #
    "- `predictMaintenance(yearBuilt, jobs)` (query): estimates remaining life, urgency and a cost range for each system. The estimate uses typical lifespans, the year the home was built, and the jobs you pass (take them from the job canister). It stores nothing. Costs are in cents. It is an estimate, not an inspection.\n" #
    "- `getScheduleForProperties(propertyIds)` (composite query): the planned tasks for up to 100 properties the caller has a role on. Works in read-only sessions.\n" #
    "- `getScheduleByProperty(propertyId)`: the same for one property. It is an update call, so it doesn't work in read-only sessions.\n\n" #
    "## Changing\n" #
    "- `createScheduleEntry(propertyId, systemName, taskDescription, plannedYear, plannedMonth, estimatedCostCents)`: adds a planned task. `plannedMonth` is a month number (1 = January) or null.\n" #
    "- `markCompleted(entryId)`: marks a planned task done. It doesn't create a job record. Use the job canister's `createJob` for that.\n\n" #
    Shared.common()
  };
};
