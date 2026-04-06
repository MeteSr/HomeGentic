/**
 * HomeGentic Quote Canister
 * Quote request / submission system with tier-based rate limiting.
 * Homeowners post requests; contractors submit quotes; homeowner accepts one.
 */

import Array    "mo:core/Array";
import Map      "mo:core/Map";
import Int      "mo:core/Int";
import Iter     "mo:core/Iter";
import Nat      "mo:core/Nat";
import Nat8     "mo:core/Nat8";
import Option   "mo:core/Option";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Text     "mo:core/Text";
import Time     "mo:core/Time";

persistent actor Quote {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type ServiceType = {
    #Roofing;
    #HVAC;
    #Plumbing;
    #Electrical;
    #Painting;
    #Flooring;
    #Windows;
    #Landscaping;
  };

  public type UrgencyLevel = {
    #Low;
    #Medium;
    #High;
    #Emergency;
  };

  public type RequestStatus = {
    #Open;
    #Quoted;   // at least one quote submitted
    #Accepted; // homeowner accepted a quote
    #Closed;   // manually closed by homeowner
  };

  public type QuoteStatus = {
    #Pending;
    #Accepted;
    #Rejected;
    #Expired;
  };

  public type SubscriptionTier = {
    #Free;          // 3 concurrent open requests
    #Pro;           // 10
    #Premium;       // 10
    #ContractorPro; // unlimited (0)
  };

  public type QuoteRequest = {
    id: Text;
    propertyId: Text;
    homeowner: Principal;
    serviceType: ServiceType;
    description: Text;
    urgency: UrgencyLevel;
    status: RequestStatus;
    createdAt: Time.Time;
    closeAt: ?Time.Time;   // bid-window close time; null = no sealed-bid window
  };

  /// A sealed bid submitted by a contractor before the bid window closes.
  /// The amountCents is hidden inside `ciphertext` (IBE-encrypted in production).
  /// In dev/mock: ciphertext is the little-endian Nat8 encoding of amountCents.
  public type SealedBid = {
    id: Text;
    requestId: Text;
    contractor: Principal;
    ciphertext: [Nat8];    // IBE ciphertext; in production: vetKeys IBE output
    timelineDays: Nat;
    submittedAt: Time.Time;
  };

  /// A bid after the homeowner triggers reveal (post closeAt).
  public type RevealedBid = {
    id: Text;
    requestId: Text;
    contractor: Principal;
    amountCents: Nat;
    timelineDays: Nat;
    submittedAt: Time.Time;
    isWinner: Bool;
  };

  public type Quote = {
    id: Text;
    requestId: Text;
    contractor: Principal;
    amount: Nat;        // cents
    timeline: Nat;      // days to complete
    validUntil: Time.Time;
    status: QuoteStatus;
    createdAt: Time.Time;
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput: Text;
  };

  public type Metrics = {
    totalRequests: Nat;
    openRequests: Nat;
    acceptedRequests: Nat;
    totalQuotes: Nat;
    isPaused: Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var reqCounter: Nat = 0;
  private var quoteCounter: Nat = 0;
  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  private var adminListEntries: [Principal] = [];

  /// Migration buffers — cleared after first upgrade with this code.
  private var requestEntries:               [(Text, QuoteRequest)]       = [];
  private var quoteEntries:                 [(Text, Quote)]              = [];
  private var rateLimitEntries:             [(Principal, (Nat, Int))]    = [];
  private var tierGrantEntries:             [(Text, SubscriptionTier)]   = [];
  private var sealedBidEntries:             [(Text, SealedBid)]          = [];
  private var sealedBidByRequestEntries:    [(Text, [Text])]             = [];
  private var sealedBidByContractorEntries: [(Text, Text)]               = [];
  private var revealedBidEntries:           [(Text, [RevealedBid])]      = [];
  private var sealedBidCounter: Nat = 0;

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var requests               = Map.empty<Text, QuoteRequest>();
  private var quotes                 = Map.empty<Text, Quote>();
  private var contractorRateLimits   = Map.empty<Principal, (Nat, Int)>();
  private var tierGrants             = Map.empty<Text, SubscriptionTier>();
  private var sealedBids             = Map.empty<Text, SealedBid>();
  private var sealedBidsByRequest    = Map.empty<Text, [Text]>();
  private var sealedBidsByContractor = Map.empty<Text, Text>();
  private var revealedBids           = Map.empty<Text, [RevealedBid]>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in requestEntries.vals())               { Map.add(requests,               Text.compare,      k, v) };
    requestEntries := [];
    for ((k, v) in quoteEntries.vals())                 { Map.add(quotes,                 Text.compare,      k, v) };
    quoteEntries := [];
    for ((k, v) in rateLimitEntries.vals())             { Map.add(contractorRateLimits,   Principal.compare, k, v) };
    rateLimitEntries := [];
    for ((k, v) in tierGrantEntries.vals())             { Map.add(tierGrants,             Text.compare,      k, v) };
    tierGrantEntries := [];
    for ((k, v) in sealedBidEntries.vals())             { Map.add(sealedBids,             Text.compare,      k, v) };
    sealedBidEntries := [];
    for ((k, v) in sealedBidByRequestEntries.vals())    { Map.add(sealedBidsByRequest,    Text.compare,      k, v) };
    sealedBidByRequestEntries := [];
    for ((k, v) in sealedBidByContractorEntries.vals()) { Map.add(sealedBidsByContractor, Text.compare,      k, v) };
    sealedBidByContractorEntries := [];
    for ((k, v) in revealedBidEntries.vals())           { Map.add(revealedBids,           Text.compare,      k, v) };
    revealedBidEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private let oneDayNs : Int = 24 * 60 * 60 * 1_000_000_000;
  private let dailyQuoteLimit : Nat = 20;

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    let key = Principal.toText(caller);
    let now = Time.now();
    switch (Map.get(updateCallLimits, Text.compare, key)) {
      case null { Map.add(updateCallLimits, Text.compare, key, (1, now)); true };
      case (?(count, windowStart)) {
        if (now - windowStart >= ONE_MINUTE_NS) { Map.add(updateCallLimits, Text.compare, key, (1, now)); true }
        else if (maxUpdatesPerMin > 0 and count >= maxUpdatesPerMin) { false }
        else { Map.add(updateCallLimits, Text.compare, key, (count + 1, windowStart)); true }
      };
    }
  };

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#InvalidInput("Canister is paused")) };
        case null { return #err(#InvalidInput("Canister is paused")) };
      };
    };
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # Nat.toText(maxUpdatesPerMin) # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func nextReqId() : Text {
    reqCounter += 1;
    "REQ_" # Nat.toText(reqCounter)
  };

  private func nextQuoteId() : Text {
    quoteCounter += 1;
    "QUOTE_" # Nat.toText(quoteCounter)
  };

  private func nextSealedBidId() : Text {
    sealedBidCounter += 1;
    "SB_" # Nat.toText(sealedBidCounter)
  };

  /// Decode little-endian Nat8 bytes back to Nat (mock vetKeys IBE decryption).
  /// In production: call vetkd_derive_key to get IBE private key, then decrypt.
  private func mockDecryptBytes(ciphertext: [Nat8]) : Nat {
    var result: Nat = 0;
    var multiplier: Nat = 1;
    for (byte in ciphertext.vals()) {
      result      := result + Nat8.toNat(byte) * multiplier;
      multiplier  := multiplier * 256;
    };
    result
  };

  /// Encode Nat to little-endian Nat8 bytes (mock client-side IBE encryption).
  private func mockEncryptBytes(amount: Nat) : [Nat8] {
    if (amount == 0) return [0];
    var n = amount;
    var bytes: [Nat8] = [];
    while (n > 0) {
      bytes := Array.concat(bytes, [Nat8.fromNat(n % 256)]);
      n     := n / 256;
    };
    bytes
  };

  /// Count open requests for a homeowner.
  private func countOpenRequests(homeowner: Principal) : Nat {
    var n = 0;
    for (r in Map.values(requests)) {
      if (r.homeowner == homeowner and r.status == #Open) { n += 1 };
    };
    n
  };

  /// Max concurrent open requests for a tier. 0 = unlimited.
  private func tierOpenLimit(tier: SubscriptionTier) : Nat {
    switch tier {
      case (#Free)          { 3  };
      case (#Pro)           { 10 };
      case (#Premium)       { 10 };
      case (#ContractorPro) { 0  };
    }
  };

  /// Returns the authoritative tier for a principal.
  /// Falls back to #Free for principals without an admin-granted tier.
  /// Callers cannot influence this — it is set only via setTier() (admin-only).
  private func tierFor(p: Principal) : SubscriptionTier {
    switch (Map.get(tierGrants, Text.compare, Principal.toText(p))) {
      case (?t) { t };
      case null { #Free };
    }
  };

  /// Returns true and bumps the counter if the contractor is under their daily limit.
  /// Resets the window when 24 h have elapsed.
  private func tryConsumeSubmissionSlot(contractor: Principal) : Bool {
    let now = Time.now();
    switch (Map.get(contractorRateLimits, Principal.compare, contractor)) {
      case null {
        Map.add(contractorRateLimits, Principal.compare, contractor, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneDayNs) {
          // new day — reset window
          Map.add(contractorRateLimits, Principal.compare, contractor, (1, now));
          true
        } else if (count >= dailyQuoteLimit) {
          false
        } else {
          Map.add(contractorRateLimits, Principal.compare, contractor, (count + 1, windowStart));
          true
        }
      };
    }
  };

  // ─── Core Functions ───────────────────────────────────────────────────────────

  /// Create a quote request for a property.
  /// Open-request quota is enforced against the admin-managed tier — callers
  /// cannot bypass limits by supplying a fake tier.
  public shared(msg) func createQuoteRequest(
    propertyId: Text,
    serviceType: ServiceType,
    description: Text,
    urgency: UrgencyLevel
  ) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)  == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(description) == 0)   return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description) > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));

    let callerTier = tierFor(msg.caller);
    let limit = tierOpenLimit(callerTier);
    if (limit > 0 and countOpenRequests(msg.caller) >= limit) {
      let upgradeHint = switch (callerTier) {
        case (#Free) {
          " Upgrade to Pro ($9.99/mo) for 10 concurrent requests, or Premium ($24.99/mo)."
        };
        case (#Pro or #Premium) {
          " Upgrade to ContractorPro ($49.99/mo) for unlimited requests."
        };
        case _ { "" };
      };
      return #err(#InvalidInput(
        "Open request limit reached for your " # (switch callerTier {
          case (#Free) "Free"; case (#Pro) "Pro";
          case (#Premium) "Premium"; case (#ContractorPro) "ContractorPro";
        }) # " plan (" # Nat.toText(limit) # " max)." # upgradeHint
      ));
    };

    let id = nextReqId();
    let req: QuoteRequest = {
      id;
      propertyId;
      homeowner = msg.caller;
      serviceType;
      description;
      urgency;
      status  = #Open;
      createdAt = Time.now();
      closeAt = null;
    };
    Map.add(requests, Text.compare, id, req);
    #ok(req)
  };

  /// Fetch a single quote request by ID.
  public query func getQuoteRequest(requestId: Text) : async Result.Result<QuoteRequest, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { #err(#NotFound) };
      case (?r) { #ok(r) };
    }
  };

  /// Fetch all open or quoted requests — visible to any contractor browsing the marketplace.
  public query func getOpenRequests() : async [QuoteRequest] {
    Iter.toArray(
      Iter.filter(Map.values(requests), func(r: QuoteRequest) : Bool {
        r.status == #Open or r.status == #Quoted
      })
    )
  };

  /// Fetch all requests created by the caller.
  public query(msg) func getMyQuoteRequests() : async [QuoteRequest] {
    Iter.toArray(
      Iter.filter(Map.values(requests), func(r: QuoteRequest) : Bool {
        r.homeowner == msg.caller
      })
    )
  };

  /// Submit a quote for an open request.
  /// Subject to 20-submissions-per-day limit per contractor.
  public shared(msg) func submitQuote(
    requestId: Text,
    amount: Nat,
    timeline: Nat,
    validUntil: Time.Time
  ) : async Result.Result<Quote, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(requests, Text.compare, requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        if (req.status != #Open and req.status != #Quoted)
          return #err(#InvalidInput("Request is not open for quotes"));
        if (amount == 0)    return #err(#InvalidInput("Amount must be greater than 0"));
        if (timeline == 0)  return #err(#InvalidInput("Timeline must be greater than 0"));
        if (validUntil <= Time.now()) return #err(#InvalidInput("validUntil must be in the future"));

        if (not tryConsumeSubmissionSlot(msg.caller))
          return #err(#InvalidInput(
            "Daily quote submission limit reached (20/day per contractor). Resets at midnight UTC."
          ));

        let id = nextQuoteId();
        let q: Quote = {
          id;
          requestId;
          contractor = msg.caller;
          amount;
          timeline;
          validUntil;
          status = #Pending;
          createdAt = Time.now();
        };
        Map.add(quotes, Text.compare, id, q);

        // Advance request status to #Quoted if still #Open
        if (req.status == #Open) {
          let updated: QuoteRequest = {
            id          = req.id;
            propertyId  = req.propertyId;
            homeowner   = req.homeowner;
            serviceType = req.serviceType;
            description = req.description;
            urgency     = req.urgency;
            status      = #Quoted;
            createdAt   = req.createdAt;
            closeAt     = req.closeAt;
          };
          Map.add(requests, Text.compare, requestId, updated);
        };

        #ok(q)
      };
    }
  };

  /// Fetch all quotes for a given request (visible to anyone).
  public query func getQuotesForRequest(requestId: Text) : async Result.Result<[Quote], Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { #err(#NotFound) };
      case _ {
        let matches = Iter.toArray(
          Iter.filter(Map.values(quotes), func(q: Quote) : Bool { q.requestId == requestId })
        );
        #ok(matches)
      };
    }
  };

  /// Accept a quote. Only the request's homeowner may call this.
  /// Accepting one quote rejects all others and closes the request.
  public shared(msg) func acceptQuote(quoteId: Text) : async Result.Result<Quote, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(quotes, Text.compare, quoteId)) {
      case null { return #err(#NotFound) };
      case (?q) {
        switch (Map.get(requests, Text.compare, q.requestId)) {
          case null { return #err(#NotFound) };
          case (?req) {
            if (req.homeowner != msg.caller) return #err(#Unauthorized);
            if (req.status == #Accepted or req.status == #Closed)
              return #err(#InvalidInput("Request is already closed"));
            if (q.status != #Pending) return #err(#InvalidInput("Quote is no longer pending"));

            // Accept this quote
            let accepted: Quote = {
              id         = q.id;
              requestId  = q.requestId;
              contractor = q.contractor;
              amount     = q.amount;
              timeline   = q.timeline;
              validUntil = q.validUntil;
              status     = #Accepted;
              createdAt  = q.createdAt;
            };
            Map.add(quotes, Text.compare, quoteId, accepted);

            // Reject all other pending quotes for the same request
            for ((otherId, other) in Map.entries(quotes)) {
              if (other.requestId == q.requestId and otherId != quoteId
                  and other.status == #Pending) {
                let rejected: Quote = {
                  id         = other.id;
                  requestId  = other.requestId;
                  contractor = other.contractor;
                  amount     = other.amount;
                  timeline   = other.timeline;
                  validUntil = other.validUntil;
                  status     = #Rejected;
                  createdAt  = other.createdAt;
                };
                Map.add(quotes, Text.compare, otherId, rejected);
              };
            };

            // Close the request
            let closed: QuoteRequest = {
              id          = req.id;
              propertyId  = req.propertyId;
              homeowner   = req.homeowner;
              serviceType = req.serviceType;
              description = req.description;
              urgency     = req.urgency;
              status      = #Accepted;
              createdAt   = req.createdAt;
              closeAt     = req.closeAt;
            };
            Map.add(requests, Text.compare, req.id, closed);

            #ok(accepted)
          };
        }
      };
    }
  };

  /// Manually close an open request. Only the homeowner may do this.
  public shared(msg) func closeQuoteRequest(requestId: Text) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(requests, Text.compare, requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        if (req.homeowner != msg.caller) return #err(#Unauthorized);
        if (req.status == #Accepted or req.status == #Closed)
          return #err(#InvalidInput("Request is already closed"));

        let updated: QuoteRequest = {
          id          = req.id;
          propertyId  = req.propertyId;
          homeowner   = req.homeowner;
          serviceType = req.serviceType;
          description = req.description;
          urgency     = req.urgency;
          status      = #Closed;
          createdAt   = req.createdAt;
          closeAt     = req.closeAt;
        };
        Map.add(requests, Text.compare, requestId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Sealed-Bid Functions (2.4) ───────────────────────────────────────────────

  /// Create a quote request with a bid-window close time.
  /// After closeAt the canister will accept reveal requests but reject new bids.
  public shared(msg) func createSealedBidRequest(
    propertyId: Text,
    serviceType: ServiceType,
    description: Text,
    urgency: UrgencyLevel,
    closeAtNs: Time.Time
  ) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)  == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(description) == 0)   return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description) > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (closeAtNs <= Time.now())        return #err(#InvalidInput("closeAt must be in the future"));

    let callerTier = tierFor(msg.caller);
    let limit = tierOpenLimit(callerTier);
    if (limit > 0 and countOpenRequests(msg.caller) >= limit)
      return #err(#InvalidInput("Open request limit reached for your plan"));

    let id  = nextReqId();
    let req: QuoteRequest = {
      id;
      propertyId;
      homeowner   = msg.caller;
      serviceType;
      description;
      urgency;
      status    = #Open;
      createdAt = Time.now();
      closeAt   = ?closeAtNs;
    };
    Map.add(requests, Text.compare, id, req);
    #ok(req)
  };

  /// Submit a sealed (IBE-encrypted) bid for a request.
  /// Rejects submissions after the bid window closes.
  ///
  /// ciphertext: in production — IBE ciphertext from @dfinity/vetkeys.
  ///             in dev/mock  — little-endian Nat8 encoding of amountCents.
  public shared(msg) func submitSealedBid(
    requestId:    Text,
    ciphertext:   [Nat8],
    timelineDays: Nat
  ) : async Result.Result<SealedBid, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(requests, Text.compare, requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        if (req.status != #Open and req.status != #Quoted)
          return #err(#InvalidInput("Request is not open for bids"));
        if (ciphertext.size() == 0)
          return #err(#InvalidInput("ciphertext cannot be empty"));
        if (timelineDays == 0)
          return #err(#InvalidInput("timelineDays must be greater than 0"));

        // Enforce bid window
        switch (req.closeAt) {
          case (?closeAt) {
            if (Time.now() >= closeAt)
              return #err(#InvalidInput("Bid window has closed"));
          };
          case null {};
        };

        let id  = nextSealedBidId();
        let bid: SealedBid = {
          id;
          requestId;
          contractor  = msg.caller;
          ciphertext;
          timelineDays;
          submittedAt = Time.now();
        };
        Map.add(sealedBids, Text.compare, id, bid);

        // Index by request
        let existing = switch (Map.get(sealedBidsByRequest, Text.compare, requestId)) {
          case null  { [] };
          case (?xs) { xs };
        };
        Map.add(sealedBidsByRequest, Text.compare, requestId, Array.concat(existing, [id]));

        // Index by contractor (one bid per contractor per request)
        let key = Principal.toText(msg.caller) # ":" # requestId;
        Map.add(sealedBidsByContractor, Text.compare, key, id);

        #ok(bid)
      };
    }
  };

  /// Returns the caller's own sealed bid for a request (ciphertext only).
  /// Returns #NotFound if the caller has not submitted a bid.
  public query(msg) func getMyBid(requestId: Text) : async Result.Result<SealedBid, Error> {
    let key = Principal.toText(msg.caller) # ":" # requestId;
    switch (Map.get(sealedBidsByContractor, Text.compare, key)) {
      case null     { #err(#NotFound) };
      case (?bidId) {
        switch (Map.get(sealedBids, Text.compare, bidId)) {
          case null  { #err(#NotFound) };
          case (?b)  { #ok(b) };
        }
      };
    }
  };

  /// Reveal all sealed bids for a request after the bid window closes.
  ///
  /// Only the homeowner of the request may call this.
  /// Decrypts every ciphertext (mock: reads bytes; production: vetkd_derive_key),
  /// marks the lowest price as winner, stores the result, and returns it.
  ///
  /// Idempotent: calling twice returns the same result.
  public shared(msg) func revealBids(requestId: Text) : async Result.Result<[RevealedBid], Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(requests, Text.compare, requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        if (req.homeowner != msg.caller) return #err(#Unauthorized);

        // Enforce: window must be closed before reveal
        switch (req.closeAt) {
          case (?closeAt) {
            if (Time.now() < closeAt)
              return #err(#InvalidInput("Bid window has not yet closed"));
          };
          case null {
            return #err(#InvalidInput("This request does not use sealed bids"));
          };
        };

        // Return cached reveal if already done
        switch (Map.get(revealedBids, Text.compare, requestId)) {
          case (?cached) { return #ok(cached) };
          case null {};
        };

        // Decrypt all bids and determine winner
        let bidIds = switch (Map.get(sealedBidsByRequest, Text.compare, requestId)) {
          case null  { [] };
          case (?xs) { xs };
        };

        var decoded: [(SealedBid, Nat)] = [];
        for (bidId in bidIds.vals()) {
          switch (Map.get(sealedBids, Text.compare, bidId)) {
            case null {};
            case (?b) {
              // In production: call vetkd_derive_key to get IBE private key, then decrypt.
              // Mock: decode little-endian bytes back to Nat.
              let amount = mockDecryptBytes(b.ciphertext);
              decoded := Array.concat(decoded, [(b, amount)]);
            };
          };
        };

        if (decoded.size() == 0) return #err(#InvalidInput("No bids to reveal"));

        // Find minimum amount
        var minAmount: Nat = decoded[0].1;
        for ((_, amt) in decoded.vals()) {
          if (amt < minAmount) { minAmount := amt };
        };

        let revealed: [RevealedBid] = Array.map<(SealedBid, Nat), RevealedBid>(
          decoded,
          func((b, amt)) {
            {
              id          = b.id;
              requestId   = b.requestId;
              contractor  = b.contractor;
              amountCents = amt;
              timelineDays = b.timelineDays;
              submittedAt = b.submittedAt;
              isWinner    = amt == minAmount;
            }
          }
        );

        Map.add(revealedBids, Text.compare, requestId, revealed);
        #ok(revealed)
      };
    }
  };

  /// Returns already-revealed bids for a request, or an empty array if not yet revealed.
  public query func getRevealedBids(requestId: Text) : async [RevealedBid] {
    switch (Map.get(revealedBids, Text.compare, requestId)) {
      case null  { [] };
      case (?rb) { rb };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the subscription tier for a principal.
  /// Called by an admin when a user's subscription changes.
  /// This is the only authoritative source for tier limits — callers cannot spoof.
  public shared(msg) func setTier(user: Principal, tier: SubscriptionTier) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    Map.add(tierGrants, Text.compare, Principal.toText(user), tier);
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// Add an admin. First caller is bootstrapped without a check.
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var open     = 0;
    var accepted = 0;
    for (r in Map.values(requests)) {
      switch (r.status) {
        case (#Open or #Quoted) { open     += 1 };
        case (#Accepted)        { accepted += 1 };
        case _                  {};
      };
    };
    {
      totalRequests   = Map.size(requests);
      openRequests    = open;
      acceptedRequests = accepted;
      totalQuotes     = Map.size(quotes);
      isPaused;
    }
  };
}
