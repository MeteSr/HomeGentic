/**
 * HomeGentic Fee Canister
 * Platform fee tracking for Bid to List. A fee record is created (Owed) the
 * moment a homeowner accepts a proposal; it becomes Paid only on a settled
 * Stripe webhook, which is also what triggers identity release in the
 * listing canister (invariant 04: charge then release, never the reverse).
 *
 * Also the Contractor Free referral-fee ledger (3% of a winning bid, $20
 * minimum). The quote canister records each bid a non-ContractorPro
 * contractor sends and each acceptance; the job canister reports verified
 * jobs. A fee becomes Due when the job is verified, 60 days after acceptance
 * if it never is, or when a verified job matches a bid the homeowner never
 * accepted in the app (same contractor, home and trade within 180 days). The
 * voice Worker charges the contractor's saved card and reports the result.
 */

import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Index     "../shared/Index";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Inspect "../shared/Inspect";

persistent actor Fee {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type FeeStatus = { #Owed; #Invoiced; #Paid; #Waived };

  public type FeeRecord = {
    id:          Text;
    requestId:   Text;
    proposalId:  Text;
    agentId:     Principal;
    homeownerId: Principal;
    amountCents: Nat;
    status:      FeeStatus;
    createdAt:   Int;
    updatedAt:   Int;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #InvalidInput: Text;
  };

  /// A bid a contractor without ContractorPro sent through HomeGentic.
  public type ReferralBid = {
    quoteId:     Text;
    requestId:   Text;
    contractor:  Principal;
    homeowner:   Principal;
    propertyId:  Text;
    serviceType: Text;
    bidCents:    Nat;
    bidAt:       Int;
  };

  /// #Pending: bid accepted, job not verified yet.
  /// #Due: ready to charge. #PaymentFailed: the card was declined and an
  /// invoice was sent (payUrl). #Paid / #Waived are final.
  public type ReferralFeeStatus = { #Pending; #Due; #Paid; #PaymentFailed; #Waived };

  public type ReferralFee = {
    id:          Text;
    quoteId:     Text;
    requestId:   Text;
    contractor:  Principal;
    homeowner:   Principal;
    propertyId:  Text;
    serviceType: Text;
    bidCents:    Nat;
    feeCents:    Nat;
    status:      ReferralFeeStatus;
    /// "verified_job" | "accepted_60_days" | "off_app_job", or the admin's
    /// note once waived.
    reason:      Text;
    acceptedAt:  ?Int;
    jobId:       ?Text;
    dueAt:       ?Int;
    paymentRef:  Text;
    payUrl:      Text;
    failedAt:    ?Int;
    createdAt:   Int;
    updatedAt:   Int;
  };

  /// The card a contractor saved for referral fees (a Stripe customer and
  /// payment method), and when they agreed to the fee terms.
  public type ReferralCard = {
    customerId:      Text;
    paymentMethodId: Text;
    brand:           Text;
    last4:           Text;
    agreedAt:        Int;
    termsVersion:    Text;
  };

  public type BidCheck = { #ok; #needsCard; #overdue };

  /// A due fee and the card to charge it to.
  public type ChargeItem = { fee: ReferralFee; card: ?ReferralCard };

  public type Metrics = {
    totalFees:      Nat;
    owedCents:      Nat;
    paidCents:      Nat;
    isPaused:       Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var feeCounter:        Nat = 0;
  private var isPaused:          Bool = false;
  private var pauseExpiryNs:     ?Int = null;
  private var adminEntries:      [Principal] = [];
  private var adminInitialized:  Bool = false;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first initAdmins() call. Consumed on first successful use.
  private var bootstrapNonce:    ?Text = null;
  private var listingCanisterId: Text = "";

  private let fees = Map.empty<Text, FeeRecord>();

  // Secondary indexes over `fees` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let feesByAgent = Index.empty();
  private transient let feesIndexes : [Index.Keyed<FeeRecord>] = Index.indexed(fees, [
    (feesByAgent, func(r : FeeRecord) : ?Text { ?r.agentId.toText() }),
  ]);
  /// requestId → feeId, so a second recordFeeOwed for the same request is rejected.
  private let feeByRequest = Map.empty<Text, Text>();

  // ─── Referral fees (Contractor Free) ─────────────────────────────────────────

  private var quoteCanisterId:      Text = "";
  private var jobCanisterId:        Text = "";
  /// Identities allowed to save cards and report charges (the voice Worker).
  private var referralRelayEntries: [Principal] = [];
  private var referralCounter:      Nat = 0;

  /// quoteId → bid.
  private let referralBids  = Map.empty<Text, ReferralBid>();
  /// feeId → fee.
  private let referralFees  = Map.empty<Text, ReferralFee>();
  /// quoteId → feeId: one fee per bid.
  private let referralFeeByQuote = Map.empty<Text, Text>();
  /// jobId → feeId: one fee per verified job.
  private let referralFeeByJob   = Map.empty<Text, Text>();
  private let referralCards = Map.empty<Principal, ReferralCard>();

  private transient let bidsByContractor = Index.empty();
  private transient let bidIndexes : [Index.Keyed<ReferralBid>] = Index.indexed(referralBids, [
    (bidsByContractor, func(b : ReferralBid) : ?Text { ?b.contractor.toText() }),
  ]);
  private transient let referralFeesByContractor = Index.empty();
  private transient let referralFeeIndexes : [Index.Keyed<ReferralFee>] = Index.indexed(referralFees, [
    (referralFeesByContractor, func(f : ReferralFee) : ?Text { ?f.contractor.toText() }),
  ]);

  private transient let DAY_NS : Int = 86_400_000_000_000;
  /// An accepted bid whose job is never verified is charged after this long.
  private transient let ACCEPTED_FALLBACK_NS : Int = 60 * DAY_NS;
  /// A verified job matches an unaccepted bid sent this long before it.
  private transient let OFF_APP_WINDOW_NS : Int = 180 * DAY_NS;
  /// A fee unpaid this long after the card was declined pauses bidding.
  private transient let OVERDUE_NS : Int = 30 * DAY_NS;
  private transient let MIN_REFERRAL_FEE_CENTS : Nat = 2000;

  private let updateCallLimits = Map.empty<Text, (Nat, Int)>();
  private var maxUpdatesPerMin : Nat = 30;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    Inspect.accept(caller, arg, Inspect.MAX_ARG_BYTES)
  };

  private func isAdmin(caller: Principal) : Bool {
    Admin.contains(adminEntries, caller)
  };

  private func isTrusted(caller: Principal) : Bool {
    isAdmin(caller) or caller.toText() == listingCanisterId
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func nextFeeId() : Text {
    feeCounter += 1;
    "FEE_" # feeCounter.toText()
  };

  // ─── Fee lifecycle ───────────────────────────────────────────────────────────

  /// Create a fee-owed record on selection. Callable by an admin or by the wired
  /// listing canister only — a fee must never be creatable by an arbitrary caller.
  public shared(msg) func recordFeeOwed(
    requestId:   Text,
    proposalId:  Text,
    agentId:     Principal,
    homeownerId: Principal,
    amountCents: Nat
  ) : async Result.Result<FeeRecord, Error> {
    if (not isTrusted(msg.caller)) return #err(#NotAuthorized);
    if (amountCents == 0) return #err(#InvalidInput("amountCents must be positive"));
    let now = Time.now();
    switch (feeByRequest.get(requestId)) {
      case (?existingId) {
        switch (fees.get(existingId)) {
          case null { #err(#NotFound) }; // unreachable: index and map are kept in sync
          case (?existing) {
            if (existing.status == #Paid) return #err(#AlreadyExists);
            // Homeowner re-selected a different bid before payment settled — retarget
            // the still-open fee record rather than erroring.
            let updated = { existing with proposalId; agentId; homeownerId; amountCents; updatedAt = now };
            Index.put(fees, feesIndexes, existingId, updated);
            #ok(updated)
          };
        }
      };
      case null {
        let id = nextFeeId();
        let record: FeeRecord = {
          id; requestId; proposalId; agentId; homeownerId; amountCents;
          status = #Owed; createdAt = now; updatedAt = now;
        };
        Index.put(fees, feesIndexes, id, record);
        feeByRequest.add(requestId, id);
        #ok(record)
      };
    }
  };

  /// M13: the fee record for a Bid to List request. Read cross-canister by the
  /// listing canister in markListingFeePaid, so an award is only released for
  /// the proposal the homeowner selected and whose fee actually settled.
  /// Admins and the wired listing canister only; everyone else gets null.
  public query(msg) func getFeeForRequest(requestId: Text) : async ?FeeRecord {
    if (not isTrusted(msg.caller)) return null;
    switch (feeByRequest.get(requestId)) {
      case null { null };
      case (?feeId) { fees.get(feeId) };
    }
  };

  public query(msg) func getMyFees() : async [FeeRecord] {
    Index.records(feesByAgent, msg.caller.toText(), fees).toArray()
  };

  public query(msg) func getAllFees() : async Result.Result<[FeeRecord], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(fees.values().toArray())
  };

  public query(msg) func getFeesDue() : async Result.Result<[FeeRecord], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(fees.values().filter(func(f: FeeRecord) : Bool { f.status == #Owed or f.status == #Invoiced }).toArray())
  };

  public shared(msg) func markFeeInvoiced(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (fees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        // A paid or waived fee is settled; invoicing it again would reopen it.
        if (f.status == #Paid or f.status == #Waived) return #err(#InvalidInput("Fee is already settled"));
        let updated = { f with status = #Invoiced; updatedAt = Time.now() };
        Index.put(fees, feesIndexes, feeId, updated);
        #ok(updated)
      };
    }
  };

  /// Called only from the settled Stripe webhook (via an admin-held identity).
  /// This is the single trigger for identity release — see invariant 04.
  public shared(msg) func markFeePaid(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (fees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        if (f.status == #Paid) return #ok(f); // idempotent on webhook retry
        let updated = { f with status = #Paid; updatedAt = Time.now() };
        Index.put(fees, feesIndexes, feeId, updated);
        #ok(updated)
      };
    }
  };

  /// 30-day "we did not sign" refund path (H6 / A3's stated refund term).
  public shared(msg) func waiveFee(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (fees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        let updated = { f with status = #Waived; updatedAt = Time.now() };
        Index.put(fees, feesIndexes, feeId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Referral fees (Contractor Free) ─────────────────────────────────────────

  /// 3% of the bid, rounded to the cent, never under $20.
  private func referralFeeFor(bidCents: Nat) : Nat {
    Nat.max(MIN_REFERRAL_FEE_CENTS, (bidCents * 3 + 50) / 100)
  };

  private func isReferralRelay(caller: Principal) : Bool {
    isAdmin(caller) or Admin.contains(referralRelayEntries, caller)
  };

  private func putReferralFee(f: ReferralFee) {
    Index.put(referralFees, referralFeeIndexes, f.id, f);
  };

  private func newReferralFee(bid: ReferralBid, status: ReferralFeeStatus, reason: Text, acceptedAt: ?Int, jobId: ?Text, now: Int) : ReferralFee {
    referralCounter += 1;
    let f : ReferralFee = {
      id = "RF_" # referralCounter.toText();
      quoteId = bid.quoteId; requestId = bid.requestId; contractor = bid.contractor;
      homeowner = bid.homeowner; propertyId = bid.propertyId; serviceType = bid.serviceType;
      bidCents = bid.bidCents; feeCents = referralFeeFor(bid.bidCents);
      status; reason; acceptedAt; jobId;
      dueAt = if (status == #Due) ?now else null;
      paymentRef = ""; payUrl = ""; failedAt = null;
      createdAt = now; updatedAt = now;
    };
    putReferralFee(f);
    referralFeeByQuote.add(bid.quoteId, f.id);
    switch (jobId) { case (?j) { referralFeeByJob.add(j, f.id) }; case null {} };
    f
  };

  private func bidCheck(contractor: Principal, now: Int) : BidCheck {
    for (f in Index.records(referralFeesByContractor, contractor.toText(), referralFees)) {
      if (f.status == #PaymentFailed) {
        switch (f.failedAt) { case (?t) { if (now - t >= OVERDUE_NS) return #overdue }; case null {} };
      };
    };
    if (referralCards.get(contractor) == null) #needsCard else #ok
  };

  /// May `contractor` send a bid that carries the referral fee? Asked by the
  /// quote canister before a non-ContractorPro bid; the contractor (and
  /// admins) may ask about themselves.
  public query(msg) func referralBidAllowed(contractor: Principal) : async BidCheck {
    if (msg.caller != contractor and msg.caller.toText() != quoteCanisterId and not isAdmin(msg.caller)) return #needsCard;
    bidCheck(contractor, Time.now())
  };

  /// Quote canister only: a non-ContractorPro contractor sent a bid.
  public shared(msg) func recordReferralBid(bid: ReferralBid) : async Result.Result<(), Error> {
    if (msg.caller.toText() != quoteCanisterId and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (bid.bidCents == 0) return #err(#InvalidInput("bidCents must be positive"));
    if (referralBids.get(bid.quoteId) != null) return #err(#AlreadyExists);
    Index.put(referralBids, bidIndexes, bid.quoteId, bid);
    #ok(())
  };

  /// Quote canister only: the homeowner accepted `quoteId`. Opens a Pending
  /// fee when the bid carried one; no-op otherwise or when already recorded.
  public shared(msg) func recordReferralAccepted(quoteId: Text) : async Result.Result<?ReferralFee, Error> {
    if (msg.caller.toText() != quoteCanisterId and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (referralBids.get(quoteId), referralFeeByQuote.get(quoteId)) {
      case (?bid, null) {
        let now = Time.now();
        #ok(?newReferralFee(bid, #Pending, "verified_job", ?now, null, now))
      };
      case _ { #ok(null) };
    }
  };

  /// Job canister only: a job by `contractor` was verified by both parties.
  /// Makes the matching accepted bid's fee Due; with none, an unaccepted bid
  /// by the same contractor on the same home and trade in the last 180 days
  /// becomes a Due fee (the job was arranged outside the app).
  public shared(msg) func recordReferralJobVerified(
    jobId: Text, contractor: Principal, propertyId: Text, serviceType: Text
  ) : async Result.Result<?ReferralFee, Error> {
    if (msg.caller.toText() != jobCanisterId and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (referralFeeByJob.get(jobId) != null) return #ok(null);
    let now = Time.now();
    let same = func(p: Text, s: Text) : Bool { p == propertyId and s == serviceType };

    // 1. The newest pending fee for this contractor, home and trade.
    var pending : ?ReferralFee = null;
    for (f in Index.records(referralFeesByContractor, contractor.toText(), referralFees)) {
      if (f.status == #Pending and same(f.propertyId, f.serviceType)) {
        switch (pending) {
          case (?p) { if (f.createdAt > p.createdAt) pending := ?f };
          case null { pending := ?f };
        };
      };
    };
    switch (pending) {
      case (?p) {
        let due = { p with status = #Due; reason = "verified_job"; jobId = ?jobId; dueAt = ?now; updatedAt = now };
        putReferralFee(due);
        referralFeeByJob.add(jobId, due.id);
        return #ok(?due);
      };
      case null {};
    };

    // 2. The newest bid with no fee yet, sent in the last 180 days.
    var match : ?ReferralBid = null;
    for (b in Index.records(bidsByContractor, contractor.toText(), referralBids)) {
      if (same(b.propertyId, b.serviceType) and now - b.bidAt <= OFF_APP_WINDOW_NS and referralFeeByQuote.get(b.quoteId) == null) {
        switch (match) {
          case (?m) { if (b.bidAt > m.bidAt) match := ?b };
          case null { match := ?b };
        };
      };
    };
    switch (match) {
      case (?b) { #ok(?newReferralFee(b, #Due, "off_app_job", null, ?jobId, now)) };
      case null { #ok(null) };
    }
  };

  /// Relay only: moves accepted fees past the 60-day fallback to Due, then
  /// returns every Due fee with the card to charge.
  public shared(msg) func takeDueReferralFees() : async Result.Result<[ChargeItem], Error> {
    if (not isReferralRelay(msg.caller)) return #err(#NotAuthorized);
    let now = Time.now();
    for (f in referralFees.values().toArray().values()) {
      switch (f.status, f.acceptedAt) {
        case (#Pending, ?t) {
          if (now - t >= ACCEPTED_FALLBACK_NS)
            putReferralFee({ f with status = #Due; reason = "accepted_60_days"; dueAt = ?now; updatedAt = now });
        };
        case _ {};
      };
    };
    #ok(referralFees.values()
      .filter(func(f: ReferralFee) : Bool { f.status == #Due })
      .map(func(f: ReferralFee) : ChargeItem { { fee = f; card = referralCards.get(f.contractor) } })
      .toArray())
  };

  /// Relay only: the charge (or the emailed invoice) settled. Idempotent.
  public shared(msg) func relayMarkReferralFeePaid(feeId: Text, paymentRef: Text) : async Result.Result<ReferralFee, Error> {
    if (not isReferralRelay(msg.caller)) return #err(#NotAuthorized);
    switch (referralFees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        if (f.status == #Paid) return #ok(f);
        if (f.status == #Waived or f.status == #Pending) return #err(#InvalidInput("Fee is not due"));
        let paid = { f with status = #Paid; paymentRef; updatedAt = Time.now() };
        putReferralFee(paid);
        #ok(paid)
      };
    }
  };

  /// Relay only: the saved card was declined; `payUrl` is the invoice sent instead.
  public shared(msg) func relayMarkReferralFeeFailed(feeId: Text, paymentRef: Text, payUrl: Text) : async Result.Result<ReferralFee, Error> {
    if (not isReferralRelay(msg.caller)) return #err(#NotAuthorized);
    switch (referralFees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        if (f.status != #Due) return #ok(f);
        let now = Time.now();
        let failed = { f with status = #PaymentFailed; paymentRef; payUrl; failedAt = ?now; updatedAt = now };
        putReferralFee(failed);
        #ok(failed)
      };
    }
  };

  /// Relay only: the contractor saved a card through Stripe Checkout and
  /// agreed to the fee terms on the way.
  public shared(msg) func relaySetReferralCard(contractor: Principal, card: ReferralCard) : async Result.Result<(), Error> {
    if (not isReferralRelay(msg.caller)) return #err(#NotAuthorized);
    if (card.customerId.size() == 0 or card.paymentMethodId.size() == 0) return #err(#InvalidInput("card is incomplete"));
    if (card.termsVersion.size() == 0 or card.termsVersion.size() > 40) return #err(#InvalidInput("termsVersion is invalid"));
    referralCards.add(contractor, card);
    #ok(())
  };

  /// The caller's saved card (brand and last four digits) and terms agreement.
  public query(msg) func getMyReferralCard() : async ?ReferralCard {
    referralCards.get(msg.caller)
  };

  public query(msg) func getMyReferralFees() : async [ReferralFee] {
    Index.records(referralFeesByContractor, msg.caller.toText(), referralFees).toArray()
  };

  public query(msg) func getAllReferralFees() : async Result.Result<[ReferralFee], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(referralFees.values().toArray())
  };

  /// Admin only: cancel a fee that isn't paid, with a note saying why.
  public shared(msg) func waiveReferralFee(feeId: Text, note: Text) : async Result.Result<ReferralFee, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (note.size() == 0 or note.size() > 300) return #err(#InvalidInput("note must be 1-300 characters"));
    switch (referralFees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        if (f.status == #Paid) return #err(#InvalidInput("Fee is already paid"));
        let waived = { f with status = #Waived; reason = note; updatedAt = Time.now() };
        putReferralFee(waived);
        #ok(waived)
      };
    }
  };

  public shared(msg) func setQuoteCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    quoteCanisterId := id;
    #ok(())
  };

  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id;
    #ok(())
  };

  public shared(msg) func addReferralRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    referralRelayEntries := Admin.add(referralRelayEntries, p);
    #ok(())
  };

  public shared(msg) func removeReferralRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    referralRelayEntries := Admin.remove(referralRelayEntries, p);
    #ok(())
  };

  // ─── Admin ───────────────────────────────────────────────────────────────────

  public shared(msg) func setListingCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    listingCanisterId := id;
    #ok(())
  };

  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling initAdmins() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  public shared(msg) func initAdmins(newAdmins: [Principal], nonce: Text) : async Result.Result<(), Error> {
    if (adminInitialized) return #err(#NotAuthorized);
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    if (newAdmins.size() == 0) return #err(#InvalidInput("admin list cannot be empty"));
    if (not Admin.nonceMatches(bootstrapNonce, nonce)) return #err(#NotAuthorized);
    bootstrapNonce := null;
    adminEntries := newAdmins;
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Admin.add(adminEntries, newAdmin);
    #ok(())
  };

  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Admin.remove(adminEntries, target);
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  public query func metrics() : async Metrics {
    var owed = 0;
    var paid = 0;
    for (f in fees.values()) {
      if (f.status == #Owed or f.status == #Invoiced) { owed += f.amountCents };
      if (f.status == #Paid) { paid += f.amountCents };
    };
    { totalFees = fees.size(); owedCents = owed; paidCents = paid; isPaused }
  };
}
