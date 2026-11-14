/// getApiDoc() text for the recurring canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic recurring canister\n\n" #
    "Ongoing service contracts for a property (HVAC servicing, pest control, landscaping, pool care and similar) and a log of each visit.\n\n" #
    "## Reading\n" #
    "- `getScheduleForProperties(propertyIds)` (composite query): services and recent visits for several properties. Works in read-only sessions.\n" #
    "- `getByProperty(propertyId)`, `getRecurringService(serviceId)`, `getVisitLogs(serviceId)`: the same detail for one property or service. These are update calls.\n\n" #
    "## Questions over the whole record (OQL)\n" #
    "- `schema()` (query): a JSON catalogue of the `services` and `visits` entities: every field, its type and what it means.\n" #
    "- `execute(oql)` (composite query): runs one JSON query over the recurring services or visit logs of the caller's homes and returns rows of named cells, filtered, grouped and added up here, e.g. `{\"start\":\"services\",\"where\":{\"eq\":{\"field\":\"status\",\"value\":\"Active\"}},\"select\":[\"providerName\",\"frequency\",\"lastVisitDate\",\"nextVisitEstimate\"]}`. `nextVisitEstimate` is the last visit logged (or the start date) plus the frequency: an estimate from the household's own log, not an appointment with the provider. The keys are the same as on the job canister's `execute`. Without a `propertyId` condition it covers the homes the caller added services for; to read a home the caller co-owns, manages or views, add a `propertyId` `eq` or `in` condition (at most 20 homes). Same access rule as `getScheduleForProperties`. Provider licence numbers are not returned. Read-only and free; works in read-only sessions. A malformed query is rejected with a message starting \"OQL:\".\n\n" #
    "## Changing\n" #
    "- `createRecurringService(propertyId, serviceType, providerName, providerLicense, providerPhone, frequency, startDate, contractEndDate, notes)`: adds a contract. Dates are `YYYY-MM-DD`. A null `contractEndDate` means open-ended. HomeGentic doesn't contact the provider.\n" #
    "- `updateStatus(serviceId, status)`: sets `#Active`, `#Paused` or `#Cancelled` in the record. This doesn't contact or cancel anything with the provider.\n" #
    "- `addVisitLog(serviceId, visitDate, note)`: records a visit.\n" #
    "- `attachContractDoc(serviceId, photoId)` links a contract document the user already uploaded in the web app.\n\n" #
    Shared.common()
  };
};
