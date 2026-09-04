/**
 * HomeGentic Agent Canister
 * Realtor profiles for the Bid to List marketplace: license/brokerage data,
 * DBPR-style verification (admin-approved for v1 — see Open Question in the
 * design handoff about a live registry check), and post-transaction reviews.
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Agent {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type AgentProfile = {
    id:                   Principal;
    name:                 Text;
    brokerage:            Text;
    licenseNumber:        Text;
    licenseState:         Text;
    county:               Text;
    serviceCities:        [Text];
    bio:                  Text;
    phone:                Text;
    email:                Text;
    avgDaysOnMarket:      Nat;
    listingsLast12Months: Nat;
    isVerified:           Bool;
    lastVerifiedAt:       Int;   // 0 = never verified
    cardOnFile:           Bool;
    createdAt:            Int;
    updatedAt:            Int;
  };

  public type RegisterArgs = {
    name:          Text;
    brokerage:     Text;
    licenseNumber: Text;
    licenseState:  Text;
    county:        Text;
    serviceCities: [Text];
    bio:           Text;
    phone:         Text;
    email:         Text;
  };

  public type UpdateArgs = RegisterArgs;

  public type AgentReview = {
    id:                Text;
    agentId:           Principal;
    reviewerPrincipal: Principal;
    rating:            Nat;   // 1–5
    comment:           Text;
    transactionId:     Text;  // proposalId of the won bid
    createdAt:         Int;
  };

  public type AddReviewArgs = {
    agentId:       Principal;
    rating:        Nat;
    comment:       Text;
    transactionId: Text;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #DuplicateReview;
    #InvalidInput: Text;
  };

  public type Metrics = {
    totalAgents:    Nat;
    verifiedAgents: Nat;
    totalReviews:   Nat;
    isPaused:       Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var reviewCounter:    Nat = 0;
  private var isPaused:         Bool = false;
  private var pauseExpiryNs:    ?Int = null;
  private var adminEntries:     [Principal] = [];
  private var adminInitialized: Bool = false;
  private var listingCanisterId: Text = "";

  private let profiles = Map.empty<Principal, AgentProfile>();
  private let reviews   = Map.empty<Text, AgentReview>();
  /// Composite dedup key "reviewerPrincipal|transactionId" → true, one review per won bid.
  private let reviewDedup = Map.empty<Text, Bool>();

  private let MAX_BIO_LEN     : Nat = 2000;
  private let MAX_COMMENT_LEN : Nat = 1000;
  private let MAX_REVIEWS_PER_DAY : Nat = 10;
  private let ONE_DAY_NS : Int = 86_400_000_000_000;
  private let ONE_MINUTE_NS : Int = 60_000_000_000;

  /// Reviewer → (count, windowStart) sliding 24h window.
  private let reviewRateLimits = Map.empty<Text, (Nat, Int)>();
  /// Caller → (count, windowStart) sliding 1min window for update calls.
  private let updateCallLimits = Map.empty<Text, (Nat, Int)>();
  private var maxUpdatesPerMin : Nat = 30;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminEntries, func(a) { a == caller }))
  };

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

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
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

  private func validateArgs(a: RegisterArgs) : ?Text {
    if (Text.size(a.name) == 0)          return ?"name cannot be empty";
    if (Text.size(a.licenseNumber) == 0) return ?"licenseNumber cannot be empty";
    if (Text.size(a.licenseState) == 0)  return ?"licenseState cannot be empty";
    if (Text.size(a.bio) > MAX_BIO_LEN)  return ?("bio exceeds " # Nat.toText(MAX_BIO_LEN) # " characters");
    if (a.serviceCities.size() == 0)     return ?"serviceCities cannot be empty";
    if (a.serviceCities.size() > 10)     return ?"serviceCities cannot exceed 10 cities";
    null
  };

  // ─── Registration ────────────────────────────────────────────────────────────

  /// Register as an agent (self, one profile per principal). Not verified by default —
  /// verifyAgent() (admin) gates bidding, per invariant 05 (licence re-check).
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<AgentProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(profiles, Principal.compare, msg.caller)) {
      case (?_) { return #err(#AlreadyExists) };
      case null {};
    };
    switch (validateArgs(args)) {
      case (?msg2) { return #err(#InvalidInput(msg2)) };
      case null {};
    };
    let now = Time.now();
    let profile: AgentProfile = {
      id                   = msg.caller;
      name                 = args.name;
      brokerage            = args.brokerage;
      licenseNumber        = args.licenseNumber;
      licenseState         = args.licenseState;
      county               = args.county;
      serviceCities        = args.serviceCities;
      bio                  = args.bio;
      phone                = args.phone;
      email                = args.email;
      avgDaysOnMarket      = 0;
      listingsLast12Months = 0;
      isVerified           = false;
      lastVerifiedAt       = 0;
      cardOnFile           = false;
      createdAt            = now;
      updatedAt            = now;
    };
    Map.add(profiles, Principal.compare, msg.caller, profile);
    #ok(profile)
  };

  public query(msg) func getMyProfile() : async ?AgentProfile {
    Map.get(profiles, Principal.compare, msg.caller)
  };

  public query func getProfile(agentId: Principal) : async ?AgentProfile {
    Map.get(profiles, Principal.compare, agentId)
  };

  public query func getAllProfiles() : async [AgentProfile] {
    Iter.toArray(Map.values(profiles))
  };

  public query func getProfilesByCounty(county: Text) : async [AgentProfile] {
    Iter.toArray(Iter.filter(Map.values(profiles), func(p: AgentProfile) : Bool { p.county == county }))
  };

  /// Cities are matched lowercase; caller passes an already-lowercased city.
  public query func getAgentsForCity(city: Text, limit: Nat) : async [AgentProfile] {
    let matches = Iter.toArray(Iter.filter(Map.values(profiles), func(p: AgentProfile) : Bool {
      p.isVerified and Option.isSome(Array.find<Text>(p.serviceCities, func(c) { c == city }))
    }));
    if (matches.size() <= limit) { matches } else {
      Array.tabulate<AgentProfile>(limit, func(i) { matches[i] })
    }
  };

  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<AgentProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(profiles, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        switch (validateArgs(args)) {
          case (?m) { return #err(#InvalidInput(m)) };
          case null {};
        };
        let updated: AgentProfile = {
          id                   = existing.id;
          name                 = args.name;
          brokerage            = args.brokerage;
          licenseNumber        = args.licenseNumber;
          licenseState         = args.licenseState;
          county               = args.county;
          serviceCities        = args.serviceCities;
          bio                  = args.bio;
          phone                = args.phone;
          email                = args.email;
          avgDaysOnMarket      = existing.avgDaysOnMarket;
          listingsLast12Months = existing.listingsLast12Months;
          isVerified           = existing.isVerified;
          lastVerifiedAt       = existing.lastVerifiedAt;
          cardOnFile           = existing.cardOnFile;
          createdAt            = existing.createdAt;
          updatedAt            = Time.now();
        };
        Map.add(profiles, Principal.compare, msg.caller, updated);
        #ok(updated)
      };
    }
  };

  /// Mark the caller's card on file as authorized (A1 step 3). Never charges —
  /// only the listing-fee webhook charges, on selection.
  public shared(msg) func setCardOnFile(onFile: Bool) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(profiles, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        Map.add(profiles, Principal.compare, msg.caller, { existing with cardOnFile = onFile; updatedAt = Time.now() });
        #ok(())
      };
    }
  };

  // ─── Verification (invariant 05: re-checked every 90 days, admin-approved v1) ─

  public shared(msg) func verifyAgent(agentId: Principal) : async Result.Result<AgentProfile, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(profiles, Principal.compare, agentId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated = { existing with isVerified = true; lastVerifiedAt = Time.now(); updatedAt = Time.now() };
        Map.add(profiles, Principal.compare, agentId, updated);
        #ok(updated)
      };
    }
  };

  /// Withdraw a lapsed/failed licence (admin). Open bids on a revoked agent
  /// must be withdrawn by the listing canister separately (invariant 05).
  public shared(msg) func revokeAgent(agentId: Principal) : async Result.Result<AgentProfile, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(profiles, Principal.compare, agentId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated = { existing with isVerified = false; updatedAt = Time.now() };
        Map.add(profiles, Principal.compare, agentId, updated);
        #ok(updated)
      };
    }
  };

  public query func isVerifiedAgent(principal: Principal) : async Bool {
    switch (Map.get(profiles, Principal.compare, principal)) {
      case null { false };
      case (?p) { p.isVerified };
    }
  };

  // ─── Performance tracking (called by listing canister on award/close) ────────

  /// Admin or the wired listing canister only. Recomputes avgDaysOnMarket as a
  /// weighted average: (old_avg * old_count + new_days) / new_count.
  public shared(msg) func recordListingClose(agentId: Principal, daysOnMarket: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller) and Principal.toText(msg.caller) != listingCanisterId) {
      return #err(#NotAuthorized);
    };
    switch (Map.get(profiles, Principal.compare, agentId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let newCount = existing.listingsLast12Months + 1;
        let newAvg = (existing.avgDaysOnMarket * existing.listingsLast12Months + daysOnMarket) / newCount;
        Map.add(profiles, Principal.compare, agentId, {
          existing with avgDaysOnMarket = newAvg; listingsLast12Months = newCount; updatedAt = Time.now()
        });
        #ok(())
      };
    }
  };

  // ─── Reviews ─────────────────────────────────────────────────────────────────

  private func tryConsumeReviewSlot(reviewer: Principal) : Bool {
    let key = Principal.toText(reviewer);
    let now = Time.now();
    switch (Map.get(reviewRateLimits, Text.compare, key)) {
      case null { Map.add(reviewRateLimits, Text.compare, key, (1, now)); true };
      case (?(count, windowStart)) {
        if (now - windowStart >= ONE_DAY_NS) { Map.add(reviewRateLimits, Text.compare, key, (1, now)); true }
        else if (count >= MAX_REVIEWS_PER_DAY) { false }
        else { Map.add(reviewRateLimits, Text.compare, key, (count + 1, windowStart)); true }
      };
    }
  };

  public shared(msg) func addReview(args: AddReviewArgs) : async Result.Result<AgentReview, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (args.rating < 1 or args.rating > 5) return #err(#InvalidInput("rating must be 1-5"));
    if (Text.size(args.comment) > MAX_COMMENT_LEN) return #err(#InvalidInput("comment too long"));
    if (Text.size(args.transactionId) == 0) return #err(#InvalidInput("transactionId cannot be empty"));

    let dedupKey = Principal.toText(msg.caller) # "|" # args.transactionId;
    switch (Map.get(reviewDedup, Text.compare, dedupKey)) {
      case (?_) { return #err(#DuplicateReview) };
      case null {};
    };
    if (not tryConsumeReviewSlot(msg.caller)) {
      return #err(#InvalidInput("Rate limit exceeded: max " # Nat.toText(MAX_REVIEWS_PER_DAY) # " reviews per day"));
    };

    reviewCounter += 1;
    let review: AgentReview = {
      id                = "REVIEW_" # Nat.toText(reviewCounter);
      agentId           = args.agentId;
      reviewerPrincipal = msg.caller;
      rating            = args.rating;
      comment           = args.comment;
      transactionId     = args.transactionId;
      createdAt         = Time.now();
    };
    Map.add(reviews, Text.compare, review.id, review);
    Map.add(reviewDedup, Text.compare, dedupKey, true);
    #ok(review)
  };

  public query func getReviews(agentId: Principal) : async [AgentReview] {
    Iter.toArray(Iter.filter(Map.values(reviews), func(r: AgentReview) : Bool { r.agentId == agentId }))
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

  public shared(msg) func initAdmins(newAdmins: [Principal]) : async Result.Result<(), Error> {
    if (adminInitialized) return #err(#NotAuthorized);
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (newAdmins.size() == 0) return #err(#InvalidInput("admin list cannot be empty"));
    adminEntries := newAdmins;
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) { adminEntries := Array.concat(adminEntries, [newAdmin]) };
    #ok(())
  };

  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Array.filter<Principal>(adminEntries, func(a) { a != target });
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  public query func metrics() : async Metrics {
    var verified = 0;
    for (p in Map.values(profiles)) { if (p.isVerified) { verified += 1 } };
    {
      totalAgents    = Map.size(profiles);
      verifiedAgents = verified;
      totalReviews   = Map.size(reviews);
      isPaused;
    }
  };
}
