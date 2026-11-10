/// getApiDoc() text for the report canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic report canister\n\n" #
    "Shareable snapshots of a home's maintenance record (the HomeGentic report), for buyers, agents and insurers. Each report is a fixed snapshot with a share link.\n\n" #
    "## Reading\n" #
    "- `getMyReports(propertyIds)` (query): the caller's newest report snapshot for each of up to 100 properties they generated a report on. Works in read-only sessions and doesn't count as a view.\n" #
    "- `listShareLinks(propertyId)`: the caller's share links for a property, with visibility, expiry and view counts. It is an update call.\n" #
    "- `getReport(token)`: opens a report by its share token. It is an update call because it counts the view.\n" #
    "- `verifyCert(certId)` and `getReportAttestation(token)` (query): check that a report or certificate was signed by HomeGentic.\n" #
    "- `getReportCloseout(token)` (query): for reports made since permit close-out was added, how many of the home's permits the household recorded as open, closed or expired (left out when the link hides permits), and how many contractor jobs over `thresholdCents` have a final lien waiver on file. These are the household's own records, not a permit office or title check: only a title search shows whether liens were recorded.\n\n" #
    "## Changing\n" #
    "- `generateReport(propertyId, property, jobs, recurringServices, expiryDays, visibility, rooms, hideAmounts, hideContractors, hidePermits, hideDescriptions, billsSummary)`: creates a snapshot and a share link. Pass the property's real records, as read from the property, job and recurring canisters. HomeGentic signs what it is given. The snapshot can't be edited after it is created. `#Public` means anyone with the link can view it. `#BuyerOnly` means viewers must sign in. `expiryDays` null means the link doesn't expire. The `hide...` flags leave those details out of the snapshot. Only properties with verified ownership (`#Basic` or `#Premium`) can create reports. Others get `#UnverifiedProperty`.\n" #
    "- `revokeShareLink(token)`: turns a link off for everyone. The snapshot stays but can no longer be opened with that token.\n" #
    "- `setAllowPublicReports(false)` makes all of the caller's public links require sign-in until it is turned back on.\n\n" #
    Shared.common()
  };
};
