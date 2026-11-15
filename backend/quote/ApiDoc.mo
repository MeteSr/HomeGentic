/// getApiDoc() text for the quote canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic quote canister\n\n" #
    "Quote requests from homeowners and bids from contractors.\n\n" #
    "## Homeowners\n" #
    "- `getMyQuoteRequests()` (query) lists the caller's requests. `getQuotesForRequest(requestId)` (query) lists the bids on one request. Bid amounts are in cents.\n" #
    "- `getLocalPriceStats(serviceType, zip)` (query): retired; always returns null. Local prices now come from the job canister's `getVerifiedLocalCosts`.\n" #
    "- `createQuoteRequest(propertyId, serviceType, description, urgency, zipCode, minTrustScore, minJobsCompleted, minReviews, maxBids)`: opens a request. **Matching contractors are alerted about it (by email or mobile push, as each contractor chose), and contractors who can bid see the description, service type and ZIP code.** Free accounts can have 3 open requests and Pro accounts unlimited.\n" #
    "- `acceptQuote(quoteId)`: accepts one bid and marks the other pending bids rejected. Acceptance can't be undone. **If the winning contractor is on the free contractor plan, accepting records a 3% referral fee (at least $20) that HomeGentic charges that contractor. The homeowner pays nothing to HomeGentic for it.**\n" #
    "- `setQuoteRequestSubtype(requestId, subtype)`: on the caller's own open request with service type Other, records what kind of work it is: one of Inspection, ApplianceRepair, GarageDoor, Septic, WellWater, Chimney, Generator, TreeService, SecurityAlarm, MoldRadon. Null clears it. No contractor lists these as a trade, so no contractor is alerted by it. `getQuoteRequestSubtypes(requestIds)` (query) returns the (requestId, subtype) pairs for up to 200 requests.\n" #
    "- `bookVisitTime(quoteId, slotIndex)`: on an accepted quote, books one of the times the contractor offered (by its position, from 0). The contractor is notified, and both sides get a reminder the day before. `askForNewVisitTimes(quoteId)` releases any booked time and asks the contractor for other times. `cancelVisit(quoteId)` cancels the visit (the contractor or the homeowner can) and notifies the other side.\n" #
    "- `getVisitBookings(quoteIds)` (query): the visit bookings on up to 100 quotes that the caller is the contractor or homeowner of. Times are in nanoseconds.\n" #
    "- `closeQuoteRequest(requestId)` stops new bids. `cancelQuoteRequest(requestId)` withdraws the request.\n" #
    "- Sealed-bid requests (`createSealedBidRequest`, `revealBids`) keep bids encrypted until the homeowner reveals them. Revealing can't be undone.\n\n" #
    "## Paying a contractor in the app\n" #
    "- Homeowners pay an accepted quote through HomeGentic's website, not through these methods: **payment moves real money and can't be undone here**. By bank (ACH) the homeowner pays the accepted price; by card they pay the higher card price `cardPriceFor(bidCents)` (query), which covers the card fee. The contractor receives the money once the payment clears (a bank payment takes about 4 business days). **For a contractor on the free plan, HomeGentic keeps its 3% referral fee (at least $20) from the payment.**\n" #
    "- `getJobPayments(quoteIds)` (query): the in-app payments on up to 100 quotes the caller is the homeowner or contractor of. `getMyPayoutAccount()` (query): the caller's own payout setup. `getPayoutReady(contractors)` (query): whether each contractor (up to 100) can be paid in the app.\n" #
    "- Operator methods, for HomeGentic's payment service only: `relaySetPayoutAccount(contractor, account)`, `relayGetPayoutAccount(contractor)`, `relayPrepareJobPayment(quoteId, payer)`, `relayRecordJobPayment(quoteId, payer, method, referralFeeCents, checkoutRef)`, `relayUpdateJobPayment(quoteId, checkoutRef, status, paymentRef)`; admins add or remove that service with `addPaymentRelay(p)` and `removePaymentRelay(p)`.\n\n" #
    "## Contractors\n" #
    "- `getOpenRequestsForMe()` lists requests matching the caller's profile. It is an update call.\n" #
    "- `submitQuote(requestId, amount, timeline, validUntil)`: bids on a request. `amount` is in cents, `timeline` is days to complete, and `validUntil` is in nanoseconds. A bid from a contractor on the free plan carries the 3% referral fee described above, and the contractor needs a saved card first.\n" #
    "- `offerVisitTimes(quoteId, slots, note)`: on the caller's accepted quote, offers the homeowner 1 to 5 visit times (`startsAt` and `endsAt` in nanoseconds, in the future, at most 12 hours long and within 180 days) and a note of up to 300 characters. It replaces any earlier offer, including a booked time, and notifies the homeowner. `cancelVisit(quoteId)` cancels the visit.\n\n" #
    Shared.common()
  };
};
