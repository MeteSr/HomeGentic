/// getApiDoc() text for the recurring canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic recurring canister\n\n" #
    "Ongoing service contracts for a property (HVAC servicing, pest control, landscaping, pool care and similar) and a log of each visit.\n\n" #
    "## Reading\n" #
    "- `getScheduleForProperties(propertyIds)` (composite query): services and recent visits for several properties. Works in read-only sessions.\n" #
    "- `getByProperty(propertyId)`, `getRecurringService(serviceId)`, `getVisitLogs(serviceId)`: the same detail for one property or service. These are update calls.\n\n" #
    "## Changing\n" #
    "- `createRecurringService(propertyId, serviceType, providerName, providerLicense, providerPhone, frequency, startDate, contractEndDate, notes)`: adds a contract. Dates are `YYYY-MM-DD`. A null `contractEndDate` means open-ended. HomeGentic doesn't contact the provider.\n" #
    "- `updateStatus(serviceId, status)`: sets `#Active`, `#Paused` or `#Cancelled` in the record. This doesn't contact or cancel anything with the provider.\n" #
    "- `addVisitLog(serviceId, visitDate, note)`: records a visit.\n" #
    "- `attachContractDoc(serviceId, photoId)` links a contract document the user already uploaded in the web app.\n\n" #
    Shared.common()
  };
};
