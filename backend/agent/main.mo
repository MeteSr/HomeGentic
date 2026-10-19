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
import Index     "../shared/Index";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";

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
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first initAdmins() call. Consumed on first successful use.
  private var bootstrapNonce:   ?Text = null;
  private var listingCanisterId: Text = "";

  private let profiles = Map.empty<Principal, AgentProfile>();
  private let reviews   = Map.empty<Text, AgentReview>();

  // Secondary indexes over `reviews` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let reviewsByAgent = Index.empty();
  private transient let reviewsIndexes : [Index.Keyed<AgentReview>] = Index.indexed<AgentReview>(reviews, [
    (reviewsByAgent, func(r : AgentReview) : ?Text { ?Principal.toText(r.agentId) }),
  ]);
  /// Composite dedup key "reviewerPrincipal|transactionId" → true, one review per won bid.
  private let reviewDedup = Map.empty<Text, Bool>();
  /// M4: transactionId (awarded proposalId) → reviewId. One review per transaction.
  private let reviewByTransaction = Map.empty<Text, Text>();
  /// M5: principals (besides admins, the listing canister and the profile's
  /// owner) allowed to read agent email/phone — e.g. the Bid to List mailer.
  private var contactReaders : [Principal] = [];

  private transient let MAX_BIO_LEN     : Nat = 2000;
  private transient let MAX_COMMENT_LEN : Nat = 1000;
  private transient let MAX_REVIEWS_PER_DAY : Nat = 10;
  private transient let ONE_DAY_NS : Int = 86_400_000_000_000;

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
    Admin.contains(adminEntries, caller)
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, Principal.toText(caller), Time.now(), maxUpdatesPerMin)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
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
    // L8: size caps so one profile can't blow up the public list queries.
    if (Text.size(a.name) > 200)          return ?"name too long";
    if (Text.size(a.brokerage) > 200)     return ?"brokerage too long";
    if (Text.size(a.licenseNumber) > 100) return ?"licenseNumber too long";
    if (Text.size(a.licenseState) > 50)   return ?"licenseState too long";
    if (Text.size(a.county) > 100)        return ?"county too long";
    if (Text.size(a.phone) > 50)          return ?"phone too long";
    if (Text.size(a.email) > 254)         return ?"email too long";
    for (c in a.serviceCities.vals()) { if (Text.size(c) > 100) return ?"service city too long" };
    null
  };

  private func canReadContact(caller: Principal, agentId: Principal) : Bool {
    caller == agentId or isAdmin(caller) or Principal.toText(caller) == listingCanisterId
      or Admin.contains(contactReaders, caller)
  };

  /// M5: public profile reads hide email and phone, which would let a homeowner
  /// contact a bidding agent directly and skip the platform fee.
  private func view(p: AgentProfile, caller: Principal) : AgentProfile {
    if (canReadContact(caller, p.id)) { p } else { { p with email = ""; phone = "" } }
  };

  private transient let MAX_PROFILE_PAGE : Nat = 500;

  private func viewAll(it: Iter.Iter<AgentProfile>, caller: Principal) : [AgentProfile] {
    Iter.toArray(Iter.map<AgentProfile, AgentProfile>(Iter.take(it, MAX_PROFILE_PAGE), func(p) { view(p, caller) }))
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

  /// Email/phone are blanked unless the caller is the agent, an admin, the
  /// listing canister or a contact reader (M5).
  public query(msg) func getProfile(agentId: Principal) : async ?AgentProfile {
    switch (Map.get(profiles, Principal.compare, agentId)) {
      case null { null };
      case (?p) { ?view(p, msg.caller) };
    }
  };

  /// Capped at MAX_PROFILE_PAGE entries (L8); contact fields redacted (M5).
  public query(msg) func getAllProfiles() : async [AgentProfile] {
    viewAll(Map.values(profiles), msg.caller)
  };

  public query(msg) func getProfilesByCounty(county: Text) : async [AgentProfile] {
    viewAll(Iter.filter(Map.values(profiles), func(p: AgentProfile) : Bool { p.county == county }), msg.caller)
  };

  /// Cities are matched lowercase; caller passes an already-lowercased city.
  public query(msg) func getAgentsForCity(city: Text, limit: Nat) : async [AgentProfile] {
    let matches = Iter.filter(Map.values(profiles), func(p: AgentProfile) : Bool {
      p.isVerified and Option.isSome(Array.find<Text>(p.serviceCities, func(c) { c == city }))
    });
    Iter.toArray(Iter.map<AgentProfile, AgentProfile>(Iter.take(matches, Nat.min(limit, MAX_PROFILE_PAGE)), func(p) { view(p, msg.caller) }))
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
        // M3: changing any identity/licence field drops verification until an
        // admin re-verifies — no keeping the badge under someone else's licence.
        let identityChanged = args.name != existing.name or args.brokerage != existing.brokerage
          or args.licenseNumber != existing.licenseNumber or args.licenseState != existing.licenseState;
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
          isVerified           = existing.isVerified and not identityChanged;
          lastVerifiedAt       = if (identityChanged) 0 else existing.lastVerifiedAt;
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
    if (Text.size(args.transactionId) > 100) return #err(#InvalidInput("transactionId too long"));
    if (args.agentId == msg.caller) return #err(#NotAuthorized);  // M4: no self-review

    let dedupKey = Principal.toText(msg.caller) # "|" # args.transactionId;
    switch (Map.get(reviewDedup, Text.compare, dedupKey)) {
      case (?_) { return #err(#DuplicateReview) };
      case null {};
    };
    if (Option.isSome(Map.get(reviewByTransaction, Text.compare, args.transactionId))) return #err(#DuplicateReview);

    // M4: the transaction must be a real, fee-paid Bid to List award by this
    // agent, and the caller must be that listing's homeowner. Fails closed
    // when the listing canister isn't wired.
    if (Text.size(listingCanisterId) == 0) return #err(#InvalidInput("Listing canister not configured — cannot verify transaction"));
    let listingActor = actor(listingCanisterId) : actor {
      getReviewEligibility : query (Text) -> async ?{ agentId: Principal; homeowner: Principal; awarded: Bool };
    };
    switch (await listingActor.getReviewEligibility(args.transactionId)) {
      case null { return #err(#NotFound) };
      case (?e) {
        if (not e.awarded or e.agentId != args.agentId or e.homeowner != msg.caller) return #err(#NotAuthorized);
      };
    };
    // Re-check after the await (TOCTOU): a concurrent call may have reviewed it.
    if (Option.isSome(Map.get(reviewByTransaction, Text.compare, args.transactionId))) return #err(#DuplicateReview);
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
    Index.put(reviews, reviewsIndexes, review.id, review);
    Map.add(reviewDedup, Text.compare, dedupKey, true);
    Map.add(reviewByTransaction, Text.compare, args.transactionId, review.id);
    #ok(review)
  };

  public query func getReviews(agentId: Principal) : async [AgentReview] {
    Iter.toArray(Index.records(reviewsByAgent, Principal.toText(agentId), reviews))
  };

  // ─── Admin ───────────────────────────────────────────────────────────────────

  public shared(msg) func setListingCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    listingCanisterId := id;
    #ok(())
  };

  /// M5: allow a principal (e.g. the Bid to List mailer identity) to read
  /// agent email/phone from the profile queries. Admin only.
  public shared(msg) func addContactReader(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    contactReaders := Admin.add(contactReaders, p);
    #ok(())
  };

  public shared(msg) func removeContactReader(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    contactReaders := Admin.remove(contactReaders, p);
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
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
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
