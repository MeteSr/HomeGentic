/**
 * HomeFax Quote Canister
 * Quote request / submission system with tier-based rate limiting.
 * Homeowners post requests; contractors submit quotes; homeowner accepts one.
 */

import Array    "mo:base/Array";
import HashMap  "mo:base/HashMap";
import Int      "mo:base/Int";
import Iter     "mo:base/Iter";
import Nat      "mo:base/Nat";
import Option   "mo:base/Option";
import Principal "mo:base/Principal";
import Result   "mo:base/Result";
import Text     "mo:base/Text";
import Time     "mo:base/Time";

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
  private var adminListEntries: [Principal] = [];

  private var requestEntries: [(Text, QuoteRequest)] = [];
  private var quoteEntries: [(Text, Quote)] = [];
  // (submissionCount, windowStart) keyed by contractor principal
  private var rateLimitEntries: [(Principal, (Nat, Int))] = [];
  /// Admin-managed tier grants keyed by principal text.
  /// Default (missing) → #Free.  Callers cannot supply or spoof their own tier.
  private var tierGrantEntries: [(Text, SubscriptionTier)] = [];

  // ─── Transient State ─────────────────────────────────────────────────────────

  private transient var requests = HashMap.fromIter<Text, QuoteRequest>(
    requestEntries.vals(), 16, Text.equal, Text.hash
  );

  private transient var quotes = HashMap.fromIter<Text, Quote>(
    quoteEntries.vals(), 16, Text.equal, Text.hash
  );

  // tracks daily submission counts per contractor
  private transient var contractorRateLimits = HashMap.fromIter<Principal, (Nat, Int)>(
    rateLimitEntries.vals(), 16, Principal.equal, Principal.hash
  );

  private transient var tierGrants = HashMap.fromIter<Text, SubscriptionTier>(
    tierGrantEntries.vals(), 16, Text.equal, Text.hash
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  system func preupgrade() {
    requestEntries   := Iter.toArray(requests.entries());
    quoteEntries     := Iter.toArray(quotes.entries());
    rateLimitEntries := Iter.toArray(contractorRateLimits.entries());
    tierGrantEntries := Iter.toArray(tierGrants.entries());
  };

  system func postupgrade() {
    requestEntries   := [];
    quoteEntries     := [];
    rateLimitEntries := [];
    tierGrantEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private let oneDayNs : Int = 24 * 60 * 60 * 1_000_000_000;
  private let dailyQuoteLimit : Nat = 20;

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) #err(#InvalidInput("Canister is paused")) else #ok(())
  };

  private func nextReqId() : Text {
    reqCounter += 1;
    "REQ_" # Nat.toText(reqCounter)
  };

  private func nextQuoteId() : Text {
    quoteCounter += 1;
    "QUOTE_" # Nat.toText(quoteCounter)
  };

  /// Count open requests for a homeowner.
  private func countOpenRequests(homeowner: Principal) : Nat {
    var n = 0;
    for (r in requests.vals()) {
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
    switch (tierGrants.get(Principal.toText(p))) {
      case (?t) { t };
      case null { #Free };
    }
  };

  /// Returns true and bumps the counter if the contractor is under their daily limit.
  /// Resets the window when 24 h have elapsed.
  private func tryConsumeSubmissionSlot(contractor: Principal) : Bool {
    let now = Time.now();
    switch (contractorRateLimits.get(contractor)) {
      case null {
        contractorRateLimits.put(contractor, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneDayNs) {
          // new day — reset window
          contractorRateLimits.put(contractor, (1, now));
          true
        } else if (count >= dailyQuoteLimit) {
          false
        } else {
          contractorRateLimits.put(contractor, (count + 1, windowStart));
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(description) == 0) return #err(#InvalidInput("description cannot be empty"));

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
      status = #Open;
      createdAt = Time.now();
    };
    requests.put(id, req);
    #ok(req)
  };

  /// Fetch a single quote request by ID.
  public query func getQuoteRequest(requestId: Text) : async Result.Result<QuoteRequest, Error> {
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?r) { #ok(r) };
    }
  };

  /// Fetch all requests created by the caller.
  public query(msg) func getMyQuoteRequests() : async [QuoteRequest] {
    Iter.toArray(
      Iter.filter(requests.vals(), func(r: QuoteRequest) : Bool {
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (requests.get(requestId)) {
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
        quotes.put(id, q);

        // Advance request status to #Quoted if still #Open
        if (req.status == #Open) {
          let updated: QuoteRequest = {
            id              = req.id;
            propertyId      = req.propertyId;
            homeowner       = req.homeowner;
            serviceType     = req.serviceType;
            description     = req.description;
            urgency         = req.urgency;
            status          = #Quoted;
            createdAt       = req.createdAt;
          };
          requests.put(requestId, updated);
        };

        #ok(q)
      };
    }
  };

  /// Fetch all quotes for a given request (visible to anyone).
  public query func getQuotesForRequest(requestId: Text) : async Result.Result<[Quote], Error> {
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case _ {
        let matches = Iter.toArray(
          Iter.filter(quotes.vals(), func(q: Quote) : Bool { q.requestId == requestId })
        );
        #ok(matches)
      };
    }
  };

  /// Accept a quote. Only the request's homeowner may call this.
  /// Accepting one quote rejects all others and closes the request.
  public shared(msg) func acceptQuote(quoteId: Text) : async Result.Result<Quote, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (quotes.get(quoteId)) {
      case null { return #err(#NotFound) };
      case (?q) {
        switch (requests.get(q.requestId)) {
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
            quotes.put(quoteId, accepted);

            // Reject all other pending quotes for the same request
            for ((otherId, other) in quotes.entries()) {
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
                quotes.put(otherId, rejected);
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
            };
            requests.put(req.id, closed);

            #ok(accepted)
          };
        }
      };
    }
  };

  /// Manually close an open request. Only the homeowner may do this.
  public shared(msg) func closeQuoteRequest(requestId: Text) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (requests.get(requestId)) {
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
        };
        requests.put(requestId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the subscription tier for a principal.
  /// Called by an admin when a user's subscription changes.
  /// This is the only authoritative source for tier limits — callers cannot spoof.
  public shared(msg) func setTier(user: Principal, tier: SubscriptionTier) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    tierGrants.put(Principal.toText(user), tier);
    #ok(())
  };

  /// Add an admin. First caller is bootstrapped without a check.
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    adminListEntries := Array.append(adminListEntries, [newAdmin]);
    #ok(())
  };

  public shared(msg) func pause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := false;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var open     = 0;
    var accepted = 0;
    for (r in requests.vals()) {
      switch (r.status) {
        case (#Open or #Quoted) { open     += 1 };
        case (#Accepted)        { accepted += 1 };
        case _                  {};
      };
    };
    {
      totalRequests   = requests.size();
      openRequests    = open;
      acceptedRequests = accepted;
      totalQuotes     = quotes.size();
      isPaused;
    }
  };
}
