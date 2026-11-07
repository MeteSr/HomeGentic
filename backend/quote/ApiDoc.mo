/// getApiDoc() text for the quote canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic quote canister\n\n" #
    "Quote requests from homeowners and bids from contractors.\n\n" #
    "## Homeowners\n" #
    "- `getMyQuoteRequests()` (query) lists the caller's requests. `getQuotesForRequest(requestId)` (query) lists the bids on one request. Bid amounts are in cents.\n" #
    "- `getLocalPriceStats(serviceType, zip)` (query): price statistics from accepted HomeGentic bids in that ZIP code, widening to its first three digits when there are too few. It returns null when there still aren't enough.\n" #
    "- `createQuoteRequest(propertyId, serviceType, description, urgency, zipCode, minTrustScore, minJobsCompleted, minReviews, maxBids)`: opens a request. **Matching contractors are alerted about it (by email or mobile push, as each contractor chose), and contractors who can bid see the description, service type and ZIP code.** Free accounts can have 3 open requests and Pro accounts unlimited.\n" #
    "- `acceptQuote(quoteId)`: accepts one bid and marks the other pending bids rejected. Acceptance can't be undone. **If the winning contractor is on the free contractor plan, accepting records a 3% referral fee (at least $20) that HomeGentic charges that contractor. The homeowner pays nothing to HomeGentic for it.**\n" #
    "- `setQuoteRequestSubtype(requestId, subtype)`: on the caller's own open request with service type Other, records what kind of work it is: one of Inspection, ApplianceRepair, GarageDoor, Septic, WellWater, Chimney, Generator, TreeService, SecurityAlarm, MoldRadon. Null clears it. No contractor lists these as a trade, so no contractor is alerted by it. `getQuoteRequestSubtypes(requestIds)` (query) returns the (requestId, subtype) pairs for up to 200 requests.\n" #
    "- `closeQuoteRequest(requestId)` stops new bids. `cancelQuoteRequest(requestId)` withdraws the request.\n" #
    "- Sealed-bid requests (`createSealedBidRequest`, `revealBids`) keep bids encrypted until the homeowner reveals them. Revealing can't be undone.\n\n" #
    "## Contractors\n" #
    "- `getOpenRequestsForMe()` lists requests matching the caller's profile. It is an update call.\n" #
    "- `submitQuote(requestId, amount, timeline, validUntil)`: bids on a request. `amount` is in cents, `timeline` is days to complete, and `validUntil` is in nanoseconds. A bid from a contractor on the free plan carries the 3% referral fee described above, and the contractor needs a saved card first.\n\n" #
    Shared.common()
  };
};
