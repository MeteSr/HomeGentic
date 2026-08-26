/**
 * HomeGentic Contractor Canister
 *
 * Contractor profile registration with field validation.
 * Reviews with:
 *   - 10/day/user rate limit
 *   - Composite-key duplicate prevention (reviewer + jobId)
 *   - 1–5 star rating validation
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
    #Gutters;
    #GeneralHandyman;
    #Pest;
    #Concrete;
    #Fencing;
    #Insulation;
    #Solar;
    #Pool;
  };

  public type ContractorProfile = {
    id:            Principal;
    name:          Text;
    specialties:   [ServiceType];
    email:         Text;
    phone:         Text;
    bio:           ?Text;
    licenseNumber: ?Text;
    serviceArea:   ?Text;   // free-text display label (e.g. "Tampa Bay Area")
    serviceZips:   [Text];  // structured 5-digit zip codes used for request filtering
    trustScore:    Nat;
    jobsCompleted: Nat;
    isVerified:    Bool;
    createdAt:     Int;
    notifyEmail:   ?Text;   // override email for job-match notifications (null = use profile email)
    notifyPush:    ?Bool;   // opt-in to mobile push for new job matches
    alertZips:     [Text];  // subset of serviceZips to receive alerts for (empty = all serviceZips)
  };

  /// On-chain credential minted when a job is fully verified.
  public type JobCredential = {
    id:                 Nat;
    jobId:              Text;
    contractorId:       Principal;
    serviceType:        Text;
    verifiedAt:         Int;
    homeownerPrincipal: Principal;
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
    name:        Text;
    specialties: [ServiceType];
    email:       Text;
    phone:       Text;
  };

  public type UpdateArgs = {
    name:          Text;
    specialties:   [ServiceType];
    email:         Text;
    phone:         Text;
    bio:           ?Text;
    licenseNumber: ?Text;
    serviceArea:   ?Text;
    serviceZips:   [Text];  // 5-digit zip codes; empty = serve all (opt-in)
  };

  public type NotificationPrefsArgs = {
    notifyEmail: ?Text;
    notifyPush:  ?Bool;
    alertZips:   [Text];
  };

  public type Error = {
    #NotFound;
    #AlreadyExists;
    #NotAuthorized;
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
  private var pauseExpiryNs:      ?Int        = null;
  private var admins:                  [Principal] = [];
  private var adminInitialized:        Bool        = false;
  private var trustedCanisterEntries:  [Principal] = [];
  private var reviewCounter:           Nat         = 0;
  private var credentialCounter:  Nat         = 0;
  /// Job canister principal — set post-deploy via setJobCanisterId().
  /// When non-empty, recordJobVerified() accepts calls from the job canister.
  private var jobCanisterId:      Text        = "";

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let contractors    = Map.empty<Principal, ContractorProfile>();
  private let reviews        = Map.empty<Text, Review>();
  private let credentials    = Map.empty<Nat, JobCredential>();
  /// compositeKey = "reviewerPrincipal|jobId" → reviewId.
  private let reviewKeys     = Map.empty<Text, Text>();
  /// Daily review rate limits per reviewer.
  private let reviewRateLimits = Map.empty<Text, (Nat, Int)>();

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  // ─── Update-call rate limit (cycle-drain protection) ────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };


  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller) or isTrustedCanister(caller)) return true;
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

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(admins, func(a) { a == p }))
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(trustedCanisterEntries, func(t) { t == p }))
  };

  private func isJobCanister(p: Principal) : Bool {
    Text.size(jobCanisterId) > 0 and Principal.toText(p) == jobCanisterId
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#Paused) };
        case null { return #err(#Paused) };
      };
    };
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#RateLimitExceeded)
    };
    #ok(())
  };

  private let oneDayNs      : Int = 24 * 60 * 60 * 1_000_000_000;
  private let dailyReviewLimit : Nat = 10;

  /// Returns true and bumps the counter if the reviewer is under their daily limit.
  /// Resets the window when 24 h have elapsed.
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
        } else if (count >= dailyReviewLimit) {
          false
        } else {
          Map.add(reviewRateLimits, Text.compare, key, (count + 1, windowStart));
          true
        }
      };
    }
  };

  // ─── Validation Helpers ───────────────────────────────────────────────────────

  /// Validates E.164 phone format: + followed by 7–15 digits (total 8–16 chars).
  private func validateE164Phone(phone: Text) : Bool {
    let size = Text.size(phone);
    if (size < 8 or size > 16) return false;
    var i = 0;
    for (c in phone.chars()) {
      if (i == 0 and c != '+')           return false;
      if (i >  0 and (c < '0' or c > '9')) return false;
      i += 1;
    };
    true
  };

  /// Validates a US zip code: exactly 5 decimal digits.
  private func validateZip(zip: Text) : Bool {
    if (Text.size(zip) != 5) return false;
    for (c in zip.chars()) {
      if (c < '0' or c > '9') return false;
    };
    true
  };

  // ─── Core Functions ────────────────────────────────────────────────────────────

  /// Register a new contractor profile. Validates all required fields.
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (Map.get(contractors, Principal.compare, msg.caller) != null) return #err(#AlreadyExists);

    if (Text.size(args.name)  == 0)   return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)  > 200)  return #err(#InvalidInput("name exceeds 200 characters"));
    if (Text.size(args.email) == 0)   return #err(#InvalidInput("email cannot be empty"));
    if (Text.size(args.email) > 254)  return #err(#InvalidInput("email exceeds 254 characters"));
    if (not Text.contains(args.email, #text "@"))
      return #err(#InvalidInput("email must contain @"));
    if (Text.contains(args.email, #text " "))
      return #err(#InvalidInput("email must not contain spaces"));
    if (Text.size(args.phone) == 0)   return #err(#InvalidInput("phone cannot be empty"));
    if (not validateE164Phone(args.phone))
      return #err(#InvalidInput("phone must be in E.164 format (e.g. +12125551234)"));
    if (args.specialties.size() == 0) return #err(#InvalidInput("at least one trade category is required"));
    if (args.specialties.size() > 10) return #err(#InvalidInput("cannot exceed 10 trade categories"));

    let profile: ContractorProfile = {
      id            = msg.caller;
      name          = args.name;
      specialties   = args.specialties;
      email         = args.email;
      phone         = args.phone;
      bio           = null;
      licenseNumber = null;
      serviceArea   = null;
      serviceZips   = [];
      trustScore    = 70;
      jobsCompleted = 0;
      isVerified    = false;
      createdAt     = Time.now();
      notifyEmail   = null;
      notifyPush    = null;
      alertZips     = [];
    };
    Map.add(contractors, Principal.compare, msg.caller, profile);
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
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Map.get(contractors, Principal.compare, contractorPrincipal) == null) return #err(#NotFound);
    if (rating < 1 or rating > 5)
      return #err(#InvalidInput("rating must be between 1 and 5"));
    if (Text.size(comment) == 0)    return #err(#InvalidInput("comment cannot be empty"));
    if (Text.size(comment) > 2000)  return #err(#InvalidInput("comment exceeds 2000 characters"));
    if (Text.size(jobId)   == 0)    return #err(#InvalidInput("jobId cannot be empty"));

    // M-09: if jobCanisterId is wired, cross-canister validate the jobId exists
    // and that the caller was the homeowner and the reviewed contractor was on this job
    if (Text.size(jobCanisterId) > 0) {
      let jobActor = actor(jobCanisterId) : actor {
        getJob : (Text) -> async ?{
          homeowner:   Principal;
          contractor:  ?Principal;
        };
      };
      switch (await jobActor.getJob(jobId)) {
        case null { return #err(#InvalidInput("jobId does not exist")) };
        case (?job) {
          if (job.homeowner != msg.caller) return #err(#NotAuthorized);
          switch (job.contractor) {
            case null  { return #err(#InvalidInput("job has no contractor")) };
            case (?c)  {
              if (c != contractorPrincipal) return #err(#InvalidInput("contractor mismatch"))
            };
          };
        };
      };
    };
    // If jobCanisterId is not set (dev/local), skip the cross-canister validation

    // Composite duplicate check: one review per reviewer+job
    let compositeKey = Principal.toText(msg.caller) # "|" # jobId;
    if (Map.get(reviewKeys, Text.compare, compositeKey) != null)
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
    Map.add(reviews, Text.compare, id, review);
    Map.add(reviewKeys, Text.compare, compositeKey, id);
    #ok(review)
  };

  /// Update an existing contractor profile. Caller must already be registered.
  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Text.size(args.name)  == 0)   return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)  > 200)  return #err(#InvalidInput("name exceeds 200 characters"));
    if (Text.size(args.email) == 0)   return #err(#InvalidInput("email cannot be empty"));
    if (Text.size(args.email) > 254)  return #err(#InvalidInput("email exceeds 254 characters"));
    if (not Text.contains(args.email, #text "@"))
      return #err(#InvalidInput("email must contain @"));
    if (Text.contains(args.email, #text " "))
      return #err(#InvalidInput("email must not contain spaces"));
    if (Text.size(args.phone) == 0)   return #err(#InvalidInput("phone cannot be empty"));
    if (not validateE164Phone(args.phone))
      return #err(#InvalidInput("phone must be in E.164 format (e.g. +12125551234)"));
    if (args.specialties.size() == 0) return #err(#InvalidInput("at least one trade category is required"));
    if (args.specialties.size() > 10) return #err(#InvalidInput("cannot exceed 10 trade categories"));
    if (args.serviceZips.size() > 50) return #err(#InvalidInput("serviceZips cannot exceed 50 entries"));
    for (zip in args.serviceZips.vals()) {
      if (not validateZip(zip)) return #err(#InvalidInput("serviceZips: '" # zip # "' is not a valid 5-digit zip code"));
    };
    switch (args.bio) {
      case (?b) { if (Text.size(b) > 1000) return #err(#InvalidInput("bio exceeds 1000 characters")) };
      case null {};
    };
    switch (args.licenseNumber) {
      case (?l) { if (Text.size(l) > 50) return #err(#InvalidInput("licenseNumber exceeds 50 characters")) };
      case null {};
    };
    switch (args.serviceArea) {
      case (?s) { if (Text.size(s) > 200) return #err(#InvalidInput("serviceArea exceeds 200 characters")) };
      case null {};
    };

    switch (Map.get(contractors, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated: ContractorProfile = {
          id            = existing.id;
          name          = args.name;
          specialties   = args.specialties;
          email         = args.email;
          phone         = args.phone;
          bio           = args.bio;
          licenseNumber = args.licenseNumber;
          serviceArea   = args.serviceArea;
          serviceZips   = args.serviceZips;
          trustScore    = existing.trustScore;
          jobsCompleted = existing.jobsCompleted;
          isVerified    = existing.isVerified;
          createdAt     = existing.createdAt;
          notifyEmail   = existing.notifyEmail;
          notifyPush    = existing.notifyPush;
          alertZips     = existing.alertZips;
        };
        Map.add(contractors, Principal.compare, msg.caller, updated);
        #ok(updated)
      };
    }
  };

  public query func getContractor(c: Principal) : async Result.Result<ContractorProfile, Error> {
    switch (Map.get(contractors, Principal.compare, c)) {
      case null { #err(#NotFound) };
      case (?p) { #ok(p) };
    }
  };

  public query(msg) func getMyProfile() : async Result.Result<ContractorProfile, Error> {
    switch (Map.get(contractors, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?p) { #ok(p) };
    }
  };

  public query func getAll() : async [ContractorProfile] {
    let all = Iter.toArray(Map.values(contractors));
    if (all.size() <= 500) all
    else Array.tabulate<ContractorProfile>(500, func(i) { all[i] })
  };

  public query func getPage(from : Nat, limit : Nat) : async [ContractorProfile] {
    let all = Iter.toArray(Map.values(contractors));
    let total = all.size();
    if (from >= total) return [];
    let bound = Nat.min(from + Nat.min(limit, 100), total);
    Array.tabulate<ContractorProfile>(bound - from, func(i) { all[from + i] })
  };

  public query func getReviewsForContractor(c: Principal) : async [Review] {
    Iter.toArray(
      Iter.filter(Map.values(reviews), func(r: Review) : Bool { r.contractor == c })
    )
  };

  /// Lightweight stats query used by the quote canister to check visibility thresholds.
  /// Returns all fields needed for filtering in a single cross-canister call.
  public query func getContractorStats(p: Principal) : async ?{
    trustScore:    Nat;
    jobsCompleted: Nat;
    reviewCount:   Nat;
    isVerified:    Bool;
    serviceZips:   [Text];
  } {
    switch (Map.get(contractors, Principal.compare, p)) {
      case null { null };
      case (?profile) {
        var count = 0;
        for (r in Map.values(reviews)) {
          if (r.contractor == p) { count += 1 };
        };
        ?{
          trustScore    = profile.trustScore;
          jobsCompleted = profile.jobsCompleted;
          reviewCount   = count;
          isVerified    = profile.isVerified;
          serviceZips   = profile.serviceZips;
        }
      };
    }
  };

  // ─── Job-Verified Hook ─────────────────────────────────────────────────────────

  /// Called by the Job canister (cross-canister) when a job reaches fully-verified
  /// status. Increments the contractor's jobsCompleted counter, nudges their
  /// trustScore up by 2 points (capped at 100), and mints a JobCredential record.
  ///
  /// Only the registered job canister principal or an admin may call this.
  public shared(msg) func recordJobVerified(
    contractorPrincipal: Principal,
    jobId:               Text,
    serviceType:         Text,
    homeownerPrincipal:  Principal,
  ) : async Result.Result<(), Error> {
    if (not isJobCanister(msg.caller) and not isAdmin(msg.caller))
      return #err(#NotAuthorized);

    // Mint credential regardless of whether contractor is registered
    credentialCounter += 1;
    let cred: JobCredential = {
      id                 = credentialCounter;
      jobId;
      contractorId       = contractorPrincipal;
      serviceType;
      verifiedAt         = Time.now();
      homeownerPrincipal;
    };
    Map.add(credentials, Nat.compare, credentialCounter, cred);

    switch (Map.get(contractors, Principal.compare, contractorPrincipal)) {
      case null { #ok(()) };  // contractor not registered — credential minted but no profile to update
      case (?existing) {
        let newScore : Nat = if (existing.trustScore + 2 > 100) 100 else existing.trustScore + 2;
        let updated: ContractorProfile = {
          id            = existing.id;
          name          = existing.name;
          specialties   = existing.specialties;
          email         = existing.email;
          phone         = existing.phone;
          bio           = existing.bio;
          licenseNumber = existing.licenseNumber;
          serviceArea   = existing.serviceArea;
          serviceZips   = existing.serviceZips;
          trustScore    = newScore;
          jobsCompleted = existing.jobsCompleted + 1;
          isVerified    = existing.isVerified;
          createdAt     = existing.createdAt;
          notifyEmail   = existing.notifyEmail;
          notifyPush    = existing.notifyPush;
          alertZips     = existing.alertZips;
        };
        Map.add(contractors, Principal.compare, contractorPrincipal, updated);
        #ok(())
      };
    }
  };

  /// Returns all verified-job credentials for a given contractor.
  public query func getCredentials(contractorPrincipal: Principal) : async [JobCredential] {
    Iter.toArray(
      Iter.filter(Map.values(credentials), func(c: JobCredential) : Bool {
        c.contractorId == contractorPrincipal
      })
    )
  };

  // ─── Admin Functions ───────────────────────────────────────────────────────────

  /// Wire the contractor canister to the job canister so recordJobVerified()
  /// accepts cross-canister calls. Must be called once after both canisters deploy.
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id;
    #ok(())
  };

  /// Mark a contractor as verified (admin only).
  public shared(msg) func verifyContractor(c: Principal) : async Result.Result<ContractorProfile, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(contractors, Principal.compare, c)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated: ContractorProfile = {
          id            = existing.id;
          name          = existing.name;
          specialties   = existing.specialties;
          email         = existing.email;
          phone         = existing.phone;
          bio           = existing.bio;
          licenseNumber = existing.licenseNumber;
          serviceArea   = existing.serviceArea;
          serviceZips   = existing.serviceZips;
          trustScore    = existing.trustScore;
          jobsCompleted = existing.jobsCompleted;
          isVerified    = true;
          createdAt     = existing.createdAt;
          notifyEmail   = existing.notifyEmail;
          notifyPush    = existing.notifyPush;
          alertZips     = existing.alertZips;
        };
        Map.add(contractors, Principal.compare, c, updated);
        #ok(updated)
      };
    }
  };

  /// Update a contractor's notification preferences (email override, push opt-in, alert zips).
  /// Caller must be the contractor themselves.
  public shared(msg) func updateNotificationPrefs(args: NotificationPrefsArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (args.alertZips.size() > 50) return #err(#InvalidInput("alertZips cannot exceed 50 entries"));
    for (zip in args.alertZips.vals()) {
      if (not validateZip(zip)) return #err(#InvalidInput("alertZips: '" # zip # "' is not a valid 5-digit zip code"));
    };
    switch (args.notifyEmail) {
      case (?e) {
        if (Text.size(e) > 254) return #err(#InvalidInput("notifyEmail exceeds 254 characters"));
        if (not Text.contains(e, #text "@")) return #err(#InvalidInput("notifyEmail must contain @"));
      };
      case null {};
    };
    switch (Map.get(contractors, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let updated: ContractorProfile = {
          id            = existing.id;
          name          = existing.name;
          specialties   = existing.specialties;
          email         = existing.email;
          phone         = existing.phone;
          bio           = existing.bio;
          licenseNumber = existing.licenseNumber;
          serviceArea   = existing.serviceArea;
          serviceZips   = existing.serviceZips;
          trustScore    = existing.trustScore;
          jobsCompleted = existing.jobsCompleted;
          isVerified    = existing.isVerified;
          createdAt     = existing.createdAt;
          notifyEmail   = args.notifyEmail;
          notifyPush    = args.notifyPush;
          alertZips     = args.alertZips;
        };
        Map.add(contractors, Principal.compare, msg.caller, updated);
        #ok(updated)
      };
    }
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.concat(admins, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.filter<Principal>(admins, func(a) { a != target });
    #ok(())
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters (job) bypass per-principal rate limiting. Admin only.
  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isTrustedCanister(p)) {
      trustedCanisterEntries := Array.concat(trustedCanisterEntries, [p]);
    };
    #ok(())
  };

  public shared(msg) func removeTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Array.filter<Principal>(trustedCanisterEntries, func(t) { t != p });
    #ok(())
  };

  public query func getTrustedCanisters() : async [Principal] {
    trustedCanisterEntries
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

  /// Return all contractors who have explicitly listed the given zip code in their serviceZips.
  /// Contractors with empty serviceZips are excluded (they haven't configured a service area yet).
  public query func getByZip(zipCode: Text) : async [ContractorProfile] {
    Iter.toArray(
      Iter.filter(Map.values(contractors), func(c: ContractorProfile) : Bool {
        Option.isSome(Array.find<Text>(c.serviceZips, func(z) { z == zipCode }))
      })
    )
  };

  /// Return all contractors who serve a given trade category.
  public query func getBySpecialty(s: ServiceType) : async [ContractorProfile] {
    Iter.toArray(
      Iter.filter(Map.values(contractors), func(c: ContractorProfile) : Bool {
        Option.isSome(Array.find<ServiceType>(c.specialties, func(t) { t == s }))
      })
    )
  };

  public query func getMetrics() : async Metrics {
    var verified = 0;
    for (c in Map.values(contractors)) { if (c.isVerified) { verified += 1 } };
    {
      totalContractors    = Map.size(contractors);
      verifiedContractors = verified;
      totalReviews        = Map.size(reviews);
      isPaused;
    }
  };
}
