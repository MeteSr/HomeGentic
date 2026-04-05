/**
 * HomeGentic Agent Canister — Epic 9.1
 *
 * On-chain profile for licensed real estate agents (Realtors).
 * Mirrors the Contractor canister pattern with:
 *   - AgentProfile: brokerage, licenseNumber, statesLicensed, bio, stats
 *   - Admin-only verifyAgent (9.1.3 verification badge)
 *   - AgentReview: rate-limited (10/day), composite-key deduplication
 *     by reviewer+transactionId to prevent duplicate post-closing reviews
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
    statesLicensed:       [Text];
    bio:                  Text;
    phone:                Text;
    email:                Text;
    avgDaysOnMarket:      Nat;
    listingsLast12Months: Nat;
    isVerified:           Bool;
    createdAt:            Int;
    updatedAt:            Int;
  };

  public type RegisterArgs = {
    name:           Text;
    brokerage:      Text;
    licenseNumber:  Text;
    statesLicensed: [Text];
    bio:            Text;
    phone:          Text;
    email:          Text;
  };

  public type UpdateArgs = {
    name:           Text;
    brokerage:      Text;
    licenseNumber:  Text;
    statesLicensed: [Text];
    bio:            Text;
    phone:          Text;
    email:          Text;
  };

  /// One review per reviewer+transactionId composite key.
  public type AgentReview = {
    id:                Text;
    agentId:           Principal;
    reviewerPrincipal: Principal;
    rating:            Nat;   // 1–5
    comment:           Text;
    transactionId:     Text;
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
    #AlreadyExists;
    #Unauthorized;
    #Paused;
    #RateLimitExceeded;
    #DuplicateReview;
    #InvalidInput: Text;
  };

  public type Metrics = {
    totalAgents:    Nat;
    verifiedAgents: Nat;
    totalReviews:   Nat;
    isPaused:       Bool;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var isPaused:           Bool        = false;
  private var pauseExpiryNs:      ?Int        = null;
  private var adminListEntries:   [Principal] = [];
  private var adminInitialized:   Bool        = false;
  private var reviewCounter:      Nat         = 0;

  private var agentEntries:           [(Principal, AgentProfile)] = [];
  private var reviewEntries:          [(Text, AgentReview)]       = [];
  private var reviewKeyEntries:       [(Text, Text)]              = [];
  private var reviewRateLimitEntries: [(Text, (Nat, Int))]        = [];

  // ─── Transient State ──────────────────────────────────────────────────────────

  private transient var agents = Map.fromIter<Principal, AgentProfile>(
    agentEntries.vals(), Principal.compare
  );

  private transient var reviews = Map.fromIter<Text, AgentReview>(
    reviewEntries.vals(), Text.compare
  );

  /// compositeKey = "reviewerPrincipal|transactionId" → reviewId
  private transient var reviewKeys = Map.fromIter<Text, Text>(
    reviewKeyEntries.vals(), Text.compare
  );

  private transient var reviewRateLimits = Map.fromIter<Text, (Nat, Int)>(
    reviewRateLimitEntries.vals(), Text.compare
  );

  // ─── Upgrade Hooks ────────────────────────────────────────────────────────────

  system func preupgrade() {
    agentEntries           := Iter.toArray(Map.entries(agents));
    reviewEntries          := Iter.toArray(Map.entries(reviews));
    reviewKeyEntries       := Iter.toArray(Map.entries(reviewKeys));
    reviewRateLimitEntries := Iter.toArray(Map.entries(reviewRateLimits));
  };

  system func postupgrade() {
    agentEntries           := [];
    reviewEntries          := [];
    reviewKeyEntries       := [];
    reviewRateLimitEntries := [];
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (not isPaused) return #ok(());
    switch (pauseExpiryNs) {
      case (?expiry) { if (Time.now() >= expiry) return #ok(()) };
      case null {};
    };
    #err(#Paused)
  };

  private let oneDayNs       : Int = 24 * 60 * 60 * 1_000_000_000;
  private let dailyReviewLimit : Nat = 10;

  private func tryConsumeReviewSlot(reviewer: Principal) : Bool {
    let key = Principal.toText(reviewer);
    let now = Time.now();
    switch (Map.get(reviewRateLimits, Text.compare, key)) {
      case null {
        Map.add(reviewRateLimits, Text.compare, key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneDayNs) {
          Map.add(reviewRateLimits, Text.compare, key, (1, now));
          true
        } else if (count < dailyReviewLimit) {
          Map.add(reviewRateLimits, Text.compare, key, (count + 1, windowStart));
          true
        } else {
          false
        }
      };
    }
  };

  // ─── Agent Profile Lifecycle ──────────────────────────────────────────────────

  /// Register a new agent profile. Caller becomes the profile's Principal.
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<AgentProfile, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
    if (Map.get(agents, Principal.compare, msg.caller) != null) return #err(#AlreadyExists);
    if (Text.size(args.name)          == 0) return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.brokerage)     == 0) return #err(#InvalidInput("brokerage cannot be empty"));
    if (Text.size(args.licenseNumber) == 0) return #err(#InvalidInput("licenseNumber cannot be empty"));
    if (Text.size(args.email)          > 256) return #err(#InvalidInput("email too long"));
    if (Text.size(args.bio)            > 2000) return #err(#InvalidInput("bio exceeds 2000 characters"));

    let now = Time.now();
    let profile: AgentProfile = {
      id                   = msg.caller;
      name                 = args.name;
      brokerage            = args.brokerage;
      licenseNumber        = args.licenseNumber;
      statesLicensed       = args.statesLicensed;
      bio                  = args.bio;
      phone                = args.phone;
      email                = args.email;
      avgDaysOnMarket      = 0;
      listingsLast12Months = 0;
      isVerified           = false;
      createdAt            = now;
      updatedAt            = now;
    };
    Map.add(agents, Principal.compare, msg.caller, profile);
    #ok(profile)
  };

  /// Fetch the caller's own profile.
  public query(msg) func getMyProfile() : async ?AgentProfile {
    Map.get(agents, Principal.compare, msg.caller)
  };

  /// Public profile lookup by Principal.
  public query func getProfile(agentId: Principal) : async ?AgentProfile {
    Map.get(agents, Principal.compare, agentId)
  };

  /// All registered agent profiles (for marketplace browse).
  public query func getAllProfiles() : async [AgentProfile] {
    Iter.toArray(Map.values(agents))
  };

  /// Update the caller's mutable profile fields.
  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<AgentProfile, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(agents, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (Text.size(args.name)          == 0) return #err(#InvalidInput("name cannot be empty"));
        if (Text.size(args.brokerage)     == 0) return #err(#InvalidInput("brokerage cannot be empty"));
        if (Text.size(args.licenseNumber) == 0) return #err(#InvalidInput("licenseNumber cannot be empty"));
        if (Text.size(args.bio)           > 2000) return #err(#InvalidInput("bio exceeds 2000 characters"));
        let updated: AgentProfile = {
          id                   = existing.id;
          name                 = args.name;
          brokerage            = args.brokerage;
          licenseNumber        = args.licenseNumber;
          statesLicensed       = args.statesLicensed;
          bio                  = args.bio;
          phone                = args.phone;
          email                = args.email;
          avgDaysOnMarket      = existing.avgDaysOnMarket;
          listingsLast12Months = existing.listingsLast12Months;
          isVerified           = existing.isVerified;
          createdAt            = existing.createdAt;
          updatedAt            = Time.now();
        };
        Map.add(agents, Principal.compare, msg.caller, updated);
        #ok(updated)
      };
    }
  };

  // ─── Reviews ──────────────────────────────────────────────────────────────────

  /// Post a review for an agent after a completed HomeGentic transaction.
  /// Rate-limited to 10/day per reviewer. Deduplication on reviewer+transactionId.
  public shared(msg) func addReview(args: AddReviewArgs) : async Result.Result<AgentReview, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
    if (Map.get(agents, Principal.compare, args.agentId) == null) return #err(#NotFound);
    if (args.rating < 1 or args.rating > 5) return #err(#InvalidInput("rating must be 1–5"));
    if (Text.size(args.transactionId) == 0) return #err(#InvalidInput("transactionId cannot be empty"));

    // Composite-key dedup: reviewer + transactionId
    let compositeKey = Principal.toText(msg.caller) # "|" # args.transactionId;
    if (Map.get(reviewKeys, Text.compare, compositeKey) != null) return #err(#DuplicateReview);

    if (not tryConsumeReviewSlot(msg.caller)) return #err(#RateLimitExceeded);

    reviewCounter += 1;
    let id = "AGREV_" # Nat.toText(reviewCounter);
    let review: AgentReview = {
      id;
      agentId           = args.agentId;
      reviewerPrincipal = msg.caller;
      rating            = args.rating;
      comment           = args.comment;
      transactionId     = args.transactionId;
      createdAt         = Time.now();
    };
    Map.add(reviews, Text.compare, id, review);
    Map.add(reviewKeys, Text.compare, compositeKey, id);
    #ok(review)
  };

  /// All reviews for a specific agent.
  public query func getReviews(agentId: Principal) : async [AgentReview] {
    Iter.toArray(
      Iter.filter(Map.values(reviews), func(r: AgentReview) : Bool {
        r.agentId == agentId
      })
    )
  };

  // ─── Admin: Verification ──────────────────────────────────────────────────────

  /// Grant a HomeGentic Verified badge to an agent. Admin-only.
  public shared(msg) func verifyAgent(agentId: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    switch (Map.get(agents, Principal.compare, agentId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        Map.add(agents, Principal.compare, agentId, {
          id                   = existing.id;
          name                 = existing.name;
          brokerage            = existing.brokerage;
          licenseNumber        = existing.licenseNumber;
          statesLicensed       = existing.statesLicensed;
          bio                  = existing.bio;
          phone                = existing.phone;
          email                = existing.email;
          avgDaysOnMarket      = existing.avgDaysOnMarket;
          listingsLast12Months = existing.listingsLast12Months;
          isVerified           = true;
          createdAt            = existing.createdAt;
          updatedAt            = Time.now();
        });
        #ok(())
      };
    }
  };

  /// Update performance stats (called by listing canister after a transaction closes).
  public shared(msg) func recordListingClose(agentId: Principal, daysOnMarket: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    switch (Map.get(agents, Principal.compare, agentId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let newListings = existing.listingsLast12Months + 1;
        // Weighted average: (old_avg * old_count + new_days) / new_count
        let newAvg = (existing.avgDaysOnMarket * existing.listingsLast12Months + daysOnMarket) / newListings;
        Map.add(agents, Principal.compare, agentId, {
          id                   = existing.id;
          name                 = existing.name;
          brokerage            = existing.brokerage;
          licenseNumber        = existing.licenseNumber;
          statesLicensed       = existing.statesLicensed;
          bio                  = existing.bio;
          phone                = existing.phone;
          email                = existing.email;
          avgDaysOnMarket      = newAvg;
          listingsLast12Months = newListings;
          isVerified           = existing.isVerified;
          createdAt            = existing.createdAt;
          updatedAt            = Time.now();
        });
        #ok(())
      };
    }
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    adminInitialized := true;
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

  public query func metrics() : async Metrics {
    var verified = 0;
    for (a in Map.values(agents)) {
      if (a.isVerified) { verified += 1 };
    };
    {
      totalAgents    = Map.size(agents);
      verifiedAgents = verified;
      totalReviews   = Map.size(reviews);
      isPaused;
    }
  };
}
