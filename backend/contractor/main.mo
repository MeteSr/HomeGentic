/**
 * HomeFax Contractor Canister
 *
 * Contractor profile registration with field validation.
 * Reviews with:
 *   - 10/day/user rate limit
 *   - Composite-key duplicate prevention (reviewer + jobId)
 *   - 1–5 star rating validation
 */

import Array     "mo:base/Array";
import HashMap   "mo:base/HashMap";
import Int       "mo:base/Int";
import Iter      "mo:base/Iter";
import Nat       "mo:base/Nat";
import Option    "mo:base/Option";
import Principal "mo:base/Principal";
import Result    "mo:base/Result";
import Text      "mo:base/Text";
import Time      "mo:base/Time";

persistent actor Contractor {

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

  public type ContractorProfile = {
    id:            Principal;
    name:          Text;
    specialty:     ServiceType;
    email:         Text;
    phone:         Text;
    bio:           ?Text;
    licenseNumber: ?Text;
    serviceArea:   ?Text;
    trustScore:    Nat;
    jobsCompleted: Nat;
    isVerified:    Bool;
    createdAt:     Int;
  };

  /// One review per reviewer+job (composite key).
  public type Review = {
    id:         Text;
    contractor: Principal;
    reviewer:   Principal;
    rating:     Nat;      // 1–5
    comment:    Text;
    jobId:      Text;
    createdAt:  Int;
  };

  public type RegisterArgs = {
    name:      Text;
    specialty: ServiceType;
    email:     Text;
    phone:     Text;
  };

  public type UpdateArgs = {
    name:          Text;
    specialty:     ServiceType;
    email:         Text;
    phone:         Text;
    bio:           ?Text;
    licenseNumber: ?Text;
    serviceArea:   ?Text;
  };

  public type Error = {
    #NotFound;
    #AlreadyExists;
    #Unauthorized;
    #Paused;
    #RateLimitExceeded;
    #InvalidInput: Text;
  };

  public type Metrics = {
    totalContractors:    Nat;
    verifiedContractors: Nat;
    totalReviews:        Nat;
    isPaused:            Bool;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var isPaused:           Bool        = false;
  private var admins:             [Principal] = [];
  private var adminInitialized:   Bool        = false;
  private var reviewCounter: Nat         = 0;

  private var contractorEntries:      [(Principal, ContractorProfile)] = [];
  private var reviewEntries:          [(Text, Review)]                 = [];
  /// compositeKey = "reviewerPrincipal|jobId" → reviewId.
  /// O(1) duplicate check — prevents two reviews from the same person for the same job.
  private var reviewKeyEntries:       [(Text, Text)]                   = [];
  /// (count, windowStartNs) keyed by reviewer principal text.
  private var reviewRateLimitEntries: [(Text, (Nat, Int))]             = [];

  // ─── Transient State ──────────────────────────────────────────────────────────

  private transient var contractors = HashMap.fromIter<Principal, ContractorProfile>(
    contractorEntries.vals(), 16, Principal.equal, Principal.hash
  );

  private transient var reviews = HashMap.fromIter<Text, Review>(
    reviewEntries.vals(), 16, Text.equal, Text.hash
  );

  private transient var reviewKeys = HashMap.fromIter<Text, Text>(
    reviewKeyEntries.vals(), 16, Text.equal, Text.hash
  );

  /// Daily review rate limits per reviewer.
  private transient var reviewRateLimits = HashMap.fromIter<Text, (Nat, Int)>(
    reviewRateLimitEntries.vals(), 16, Text.equal, Text.hash
  );

  // ─── Upgrade Hooks ────────────────────────────────────────────────────────────

  system func preupgrade() {
    contractorEntries      := Iter.toArray(contractors.entries());
    reviewEntries          := Iter.toArray(reviews.entries());
    reviewKeyEntries       := Iter.toArray(reviewKeys.entries());
    reviewRateLimitEntries := Iter.toArray(reviewRateLimits.entries());
  };

  system func postupgrade() {
    contractorEntries      := [];
    reviewEntries          := [];
    reviewKeyEntries       := [];
    reviewRateLimitEntries := [];
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(admins, func(a) { a == p }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) #err(#Paused) else #ok(())
  };

  private let oneDayNs      : Int = 24 * 60 * 60 * 1_000_000_000;
  private let dailyReviewLimit : Nat = 10;

  /// Returns true and bumps the counter if the reviewer is under their daily limit.
  /// Resets the window when 24 h have elapsed.
  private func tryConsumeReviewSlot(reviewer: Principal) : Bool {
    let key = Principal.toText(reviewer);
    let now = Time.now();
    switch (reviewRateLimits.get(key)) {
      case null {
        reviewRateLimits.put(key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneDayNs) {
          reviewRateLimits.put(key, (1, now));
          true
        } else if (count >= dailyReviewLimit) {
          false
        } else {
          reviewRateLimits.put(key, (count + 1, windowStart));
          true
        }
      };
    }
  };

  // ─── Core Functions ────────────────────────────────────────────────────────────

  /// Register a new contractor profile. Validates all required fields.
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive()) { case (#err e) return #err e; case _ {} };
    if (contractors.get(msg.caller) != null) return #err(#AlreadyExists);

    if (Text.size(args.name)  == 0) return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.email) == 0) return #err(#InvalidInput("email cannot be empty"));
    if (not Text.contains(args.email, #text "@"))
      return #err(#InvalidInput("email must contain @"));
    if (Text.size(args.phone) == 0) return #err(#InvalidInput("phone cannot be empty"));

    let profile: ContractorProfile = {
      id            = msg.caller;
      name          = args.name;
      specialty     = args.specialty;
      email         = args.email;
      phone         = args.phone;
      bio           = null;
      licenseNumber = null;
      serviceArea   = null;
      trustScore    = 70;
      jobsCompleted = 0;
      isVerified    = false;
      createdAt     = Time.now();
    };
    contractors.put(msg.caller, profile);
    #ok(profile)
  };

  /// Submit a review for a contractor.
  ///
  /// Enforcement:
  ///   - 10 reviews per reviewer per day (rolling 24-hour window)
  ///   - One review per reviewer+job pair (composite-key duplicate prevention)
  ///   - rating must be 1–5; comment must be non-empty
  public shared(msg) func submitReview(
    contractorPrincipal: Principal,
    rating:              Nat,
    comment:             Text,
    jobId:               Text
  ) : async Result.Result<Review, Error> {
    switch (requireActive()) { case (#err e) return #err e; case _ {} };

    if (contractors.get(contractorPrincipal) == null) return #err(#NotFound);
    if (rating < 1 or rating > 5)
      return #err(#InvalidInput("rating must be between 1 and 5"));
    if (Text.size(comment) == 0)
      return #err(#InvalidInput("comment cannot be empty"));
    if (Text.size(jobId)   == 0)
      return #err(#InvalidInput("jobId cannot be empty"));

    // Composite duplicate check: one review per reviewer+job
    let compositeKey = Principal.toText(msg.caller) # "|" # jobId;
    if (reviewKeys.get(compositeKey) != null)
      return #err(#InvalidInput("You have already reviewed this job"));

    // Daily rate limit
    if (not tryConsumeReviewSlot(msg.caller)) {
      return #err(#InvalidInput(
        "Daily review limit reached (10/day). Try again tomorrow."
      ))
    };

    reviewCounter += 1;
    let id = "REV_" # Nat.toText(reviewCounter);
    let review: Review = {
      id;
      contractor = contractorPrincipal;
      reviewer   = msg.caller;
      rating;
      comment;
      jobId;
      createdAt  = Time.now();
    };
    reviews.put(id, review);
    reviewKeys.put(compositeKey, id);
    #ok(review)
  };

  /// Update an existing contractor profile. Caller must already be registered.
  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive()) { case (#err e) return #err e; case _ {} };

    if (Text.size(args.name)  == 0) return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.email) == 0) return #err(#InvalidInput("email cannot be empty"));
    if (not Text.contains(args.email, #text "@"))
      return #err(#InvalidInput("email must contain @"));
    if (Text.size(args.phone) == 0) return #err(#InvalidInput("phone cannot be empty"));

    switch (contractors.get(msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated: ContractorProfile = {
          id            = existing.id;
          name          = args.name;
          specialty     = args.specialty;
          email         = args.email;
          phone         = args.phone;
          bio           = args.bio;
          licenseNumber = args.licenseNumber;
          serviceArea   = args.serviceArea;
          trustScore    = existing.trustScore;
          jobsCompleted = existing.jobsCompleted;
          isVerified    = existing.isVerified;
          createdAt     = existing.createdAt;
        };
        contractors.put(msg.caller, updated);
        #ok(updated)
      };
    }
  };

  public query func getContractor(c: Principal) : async Result.Result<ContractorProfile, Error> {
    switch (contractors.get(c)) {
      case null { #err(#NotFound) };
      case (?p) { #ok(p) };
    }
  };

  public query(msg) func getMyProfile() : async Result.Result<ContractorProfile, Error> {
    switch (contractors.get(msg.caller)) {
      case null { #err(#NotFound) };
      case (?p) { #ok(p) };
    }
  };

  public query func getAll() : async [ContractorProfile] {
    Iter.toArray(contractors.vals())
  };

  public query func getReviewsForContractor(c: Principal) : async [Review] {
    Iter.toArray(
      Iter.filter(reviews.vals(), func(r: Review) : Bool { r.contractor == c })
    )
  };

  // ─── Admin Functions ───────────────────────────────────────────────────────────

  /// Mark a contractor as verified (admin only).
  public shared(msg) func verifyContractor(c: Principal) : async Result.Result<ContractorProfile, Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    switch (contractors.get(c)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated: ContractorProfile = {
          id            = existing.id;
          name          = existing.name;
          specialty     = existing.specialty;
          email         = existing.email;
          phone         = existing.phone;
          bio           = existing.bio;
          licenseNumber = existing.licenseNumber;
          serviceArea   = existing.serviceArea;
          trustScore    = existing.trustScore;
          jobsCompleted = existing.jobsCompleted;
          isVerified    = true;
          createdAt     = existing.createdAt;
        };
        contractors.put(c, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    admins := Array.append(admins, [newAdmin]);
    adminInitialized := true;
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
    var verified = 0;
    for (c in contractors.vals()) { if (c.isVerified) { verified += 1 } };
    {
      totalContractors    = contractors.size();
      verifiedContractors = verified;
      totalReviews        = reviews.size();
      isPaused;
    }
  };
}
