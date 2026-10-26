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
import ServiceTypes "../shared/ServiceType";
import Index        "../shared/Index";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";

persistent actor Contractor {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type ServiceType = ServiceTypes.ServiceType;

  /// Provenance of a profile — did the contractor self-register, or was this
  /// profile auto-created from a guest countersignature (#518)? Purely
  /// informational for the admin-approval queue; does not affect isVerified,
  /// trustScore, or any scoring/matching logic.
  public type ContractorOrigin = {
    #SelfRegistered;
    #GuestSigned: Text;   // the jobId that triggered profile auto-creation
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
    origin:        ContractorOrigin;
  };

  /// What Florida DBPR's licensee file said about a contractor's licence
  /// number when the Worker last looked it up. A record of that lookup, not a
  /// HomeGentic endorsement.
  public type LicenseCheck = {
    licenseNumber: Text;   // as looked up (uppercased, no spaces)
    found:         Bool;   // the number is in DBPR's file
    licenseeName:  Text;   // name on the licence ("" when not found)
    dbaName:       Text;
    licenseType:   Text;   // DBPR class / occupation, e.g. "Certified General Contractor"
    status:        Text;   // DBPR primary + secondary status, e.g. "Current, Active"
    active:        Bool;   // status is current and active
    expiresOn:     Text;   // YYYY-MM-DD or ""
    nameMatches:   Bool;   // the licensee or DBA name matches the profile name
    sourceDate:    Text;   // when DBPR last published the file the Worker read ("" if unknown)
    checkedAt:     Int;
  };

  /// A co-signed job a ContractorPro contractor features on their public
  /// profile, with their own write-up. credentialId is one of their own
  /// JobCredentials, so only work a homeowner signed off on can be featured.
  public type PortfolioEntry = {
    credentialId: Nat;
    title:        Text;
    description:  Text;
    featuredAt:   Int;
  };

  public type PortfolioInput = { credentialId: Nat; title: Text; description: Text };

  /// A portfolio entry with its credential's facts, for display.
  public type PortfolioItem = {
    credentialId: Nat;
    title:        Text;
    description:  Text;
    serviceType:  Text;
    verifiedAt:   Int;
    featuredAt:   Int;
  };

  public type LicenseCheckInput = {
    licenseNumber: Text; found: Bool; licenseeName: Text; dbaName: Text; licenseType: Text;
    status: Text; active: Bool; expiresOn: Text; nameMatches: Bool; sourceDate: Text;
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

  /// Settings → Privacy. `listed` controls whether the profile appears in the
  /// directory queries (getAll, getPage, getByZip, getBySpecialty); the other
  /// two say whether the public profile page and directory card show those
  /// numbers. Bids and quote matching are unaffected.
  public type ProfilePrivacy = {
    listed:            Bool;
    showTrustScore:    Bool;
    showJobsCompleted: Bool;
  };

  /// What the notification relay needs to match new leads to contractors —
  /// no name or contact details, and unlisted contractors are included so
  /// they still get the lead alerts they asked for.
  public type LeadAlertTarget = {
    id:            Principal;
    specialties:   [ServiceType];
    serviceZips:   [Text];
    alertZips:     [Text];
    notifyPush:    ?Bool;
    trustScore:    Nat;
    jobsCompleted: Nat;
    isVerified:    Bool;
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
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce:          ?Text       = null;
  private var trustedCanisterEntries:  [Principal] = [];
  private var reviewCounter:           Nat         = 0;
  private var credentialCounter:  Nat         = 0;
  /// Job canister principal — set post-deploy via setJobCanisterId().
  /// When non-empty, recordJobVerified() accepts calls from the job canister.
  private var jobCanisterId:      Text        = "";

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let contractors    = Map.empty<Principal, ContractorProfile>();
  private let reviews        = Map.empty<Text, Review>();
  /// Review ids by contractor principal (transient, rebuilt on every upgrade).
  private transient let reviewsByContractor = Index.build(reviews, func(r) { ?r.contractor.toText() });
  private let credentials    = Map.empty<Nat, JobCredential>();
  /// Privacy settings, only for contractors who changed them from the
  /// default (everything shown). A side map so ContractorProfile's stored
  /// type is unchanged.
  private let profilePrivacy = Map.empty<Principal, ProfilePrivacy>();
  /// compositeKey = "reviewerPrincipal|jobId" → reviewId.
  private let reviewKeys     = Map.empty<Text, Text>();
  /// Daily review rate limits per reviewer.
  private let reviewRateLimits = Map.empty<Text, (Nat, Int)>();
  /// The latest Florida DBPR lookup of each contractor's licence number,
  /// written by the voice Worker (relayRecordLicenseCheck). A side map so
  /// ContractorProfile's stored type is unchanged.
  private let licenseChecks = Map.empty<Principal, LicenseCheck>();
  /// Principals (the voice Worker) allowed to record licence checks.
  private var licenseRelayEntries : [Principal] = [];
  /// ContractorPro portfolios: featured co-signed jobs per contractor.
  private let portfolios = Map.empty<Principal, [PortfolioEntry]>();
  /// Payment canister — set via setPaymentCanisterId(). setPortfolio() reads
  /// the caller's tier from it; unset means nobody is Pro (fail closed).
  private var payCanisterId : Text = "";

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  // ─── Update-call rate limit (cycle-drain protection) ────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };


  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller) or isTrustedCanister(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(p: Principal) : Bool {
    Admin.contains(admins, p)
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Admin.contains(trustedCanisterEntries, p)
  };

  private func privacyOf(p: Principal) : ProfilePrivacy {
    switch (profilePrivacy.get(p)) {
      case (?v) v;
      case null { { listed = true; showTrustScore = true; showJobsCompleted = true } };
    }
  };

  /// Directory queries leave out unlisted profiles, except for the contractor
  /// themself, admins and trusted canisters.
  private func directoryFilter(caller: Principal) : ContractorProfile -> Bool {
    let all = isAdmin(caller) or isTrustedCanister(caller);
    func(c: ContractorProfile) : Bool { all or c.id == caller or privacyOf(c.id).listed }
  };

  private func isJobCanister(p: Principal) : Bool {
    Text.size(jobCanisterId) > 0 and p.toText() == jobCanisterId
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#RateLimitExceeded)
    };
    #ok(())
  };

  private transient let oneDayNs      : Int = 24 * 60 * 60 * 1_000_000_000;
  private transient let dailyReviewLimit : Nat = 10;

  /// Returns true and bumps the counter if the reviewer is under their daily limit.
  /// Resets the window when 24 h have elapsed.
  private func tryConsumeReviewSlot(reviewer: Principal) : Bool {
    let key = reviewer.toText();
    let now = Time.now();
    switch (reviewRateLimits.get(key)) {
      case null {
        reviewRateLimits.add(key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneDayNs) {
          reviewRateLimits.add(key, (1, now));
          true
        } else if (count >= dailyReviewLimit) {
          false
        } else {
          reviewRateLimits.add(key, (count + 1, windowStart));
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

  /// Basic sanity check on a license number: 3–50 chars, alphanumeric plus
  /// '-' and space. NOT a live state-registry lookup (deferred — see #518) —
  /// this only rejects obviously-garbage input before admin review.
  private func validateLicenseFormat(l: Text) : Bool {
    let size = Text.size(l);
    if (size < 3 or size > 50) return false;
    for (c in l.chars()) {
      if (not ((c >= '0' and c <= '9') or (c >= 'A' and c <= 'Z') or (c >= 'a' and c <= 'z') or c == '-' or c == ' ')) {
        return false;
      };
    };
    true
  };

  /// Maps the Text serviceType label the Job canister sends (the shared
  /// ServiceType, downgraded to Text at the cross-canister boundary) back to
  /// the variant.
  private func textToServiceType(t: Text) : ?ServiceType { ServiceTypes.fromText(t) };

  // ─── Core Functions ────────────────────────────────────────────────────────────

  /// Register a new contractor profile. Validates all required fields.
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (contractors.get(msg.caller) != null) return #err(#AlreadyExists);

    if (Text.size(args.name)  == 0)   return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)  > 200)  return #err(#InvalidInput("name exceeds 200 characters"));
    if (Text.size(args.email) == 0)   return #err(#InvalidInput("email cannot be empty"));
    if (Text.size(args.email) > 254)  return #err(#InvalidInput("email exceeds 254 characters"));
    if (not args.email.contains(#text "@"))
      return #err(#InvalidInput("email must contain @"));
    if (args.email.contains(#text " "))
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
      origin        = #SelfRegistered;
    };
    contractors.add(msg.caller, profile);
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

    if (contractors.get(contractorPrincipal) == null) return #err(#NotFound);
    if (rating < 1 or rating > 5)
      return #err(#InvalidInput("rating must be between 1 and 5"));
    if (Text.size(comment) == 0)    return #err(#InvalidInput("comment cannot be empty"));
    if (Text.size(comment) > 2000)  return #err(#InvalidInput("comment exceeds 2000 characters"));
    if (Text.size(jobId)   == 0)    return #err(#InvalidInput("jobId cannot be empty"));

    // M-09: if jobCanisterId is wired, cross-canister validate the jobId exists
    // and that the caller was the homeowner and the reviewed contractor was on this job
    if (Text.size(jobCanisterId) > 0) {
      // L5: job.getJob returns Result<Job, Error>. Declare that shape here
      // (record subtyping drops the Job fields we don't need). The error
      // payload is declared as an opt so a new job Error tag decodes to null
      // instead of failing the whole reply.
      let jobActor = actor(jobCanisterId) : actor {
        getJob : (Text) -> async {
          #ok  : { homeowner : Principal; contractor : ?Principal };
          #err : ?{ #NotFound; #NotAuthorized; #InvalidInput : Text; #AlreadyVerified; #TierLimitReached : Text };
        };
      };
      let jobResult = try { await jobActor.getJob(jobId) } catch (_) {
        return #err(#InvalidInput("could not verify jobId"))
      };
      switch (jobResult) {
        case (#err _) { return #err(#InvalidInput("jobId does not exist or is not accessible")) };
        case (#ok job) {
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
    let compositeKey = msg.caller.toText() # "|" # jobId;
    if (reviewKeys.get(compositeKey) != null)
      return #err(#InvalidInput("You have already reviewed this job"));

    // Daily rate limit
    if (not tryConsumeReviewSlot(msg.caller)) {
      return #err(#InvalidInput(
        "Daily review limit reached (10/day). Try again tomorrow."
      ))
    };

    reviewCounter += 1;
    let id = "REV_" # reviewCounter.toText();
    let review: Review = {
      id;
      contractor = contractorPrincipal;
      reviewer   = msg.caller;
      rating;
      comment;
      jobId;
      createdAt  = Time.now();
    };
    reviews.add(id, review);
    Index.add(reviewsByContractor, review.contractor.toText(), id);
    reviewKeys.add(compositeKey, id);
    #ok(review)
  };

  /// Update an existing contractor profile. Caller must already be registered.
  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Text.size(args.name)  == 0)   return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)  > 200)  return #err(#InvalidInput("name exceeds 200 characters"));
    if (Text.size(args.email) == 0)   return #err(#InvalidInput("email cannot be empty"));
    if (Text.size(args.email) > 254)  return #err(#InvalidInput("email exceeds 254 characters"));
    if (not args.email.contains(#text "@"))
      return #err(#InvalidInput("email must contain @"));
    if (args.email.contains(#text " "))
      return #err(#InvalidInput("email must not contain spaces"));
    if (Text.size(args.phone) == 0)   return #err(#InvalidInput("phone cannot be empty"));
    if (not validateE164Phone(args.phone))
      return #err(#InvalidInput("phone must be in E.164 format (e.g. +12125551234)"));
    if (args.specialties.size() == 0) return #err(#InvalidInput("at least one trade category is required"));
    if (args.specialties.size() > 10) return #err(#InvalidInput("cannot exceed 10 trade categories"));
    if (args.serviceZips.size() > 50) return #err(#InvalidInput("serviceZips cannot exceed 50 entries"));
    for (zip in args.serviceZips.values()) {
      if (not validateZip(zip)) return #err(#InvalidInput("serviceZips: '" # zip # "' is not a valid 5-digit zip code"));
    };
    switch (args.bio) {
      case (?b) { if (Text.size(b) > 1000) return #err(#InvalidInput("bio exceeds 1000 characters")) };
      case null {};
    };
    switch (args.licenseNumber) {
      case (?l) { if (not validateLicenseFormat(l)) return #err(#InvalidInput("licenseNumber format is invalid")) };
      case null {};
    };
    switch (args.serviceArea) {
      case (?s) { if (Text.size(s) > 200) return #err(#InvalidInput("serviceArea exceeds 200 characters")) };
      case null {};
    };

    switch (contractors.get(msg.caller)) {
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
          // M3: changing the identity or licence that an admin verified
          // drops the verified badge until it is re-verified.
          isVerified    = existing.isVerified
                          and args.name == existing.name
                          and args.licenseNumber == existing.licenseNumber;
          createdAt     = existing.createdAt;
          notifyEmail   = existing.notifyEmail;
          notifyPush    = existing.notifyPush;
          alertZips     = existing.alertZips;
          origin        = existing.origin;
        };
        contractors.add(msg.caller, updated);
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

  public query(msg) func getAll() : async [ContractorProfile] {
    contractors.values().filter(directoryFilter(msg.caller)).take(500).toArray()
  };

  public query(msg) func getPage(from : Nat, limit : Nat) : async [ContractorProfile] {
    contractors.values().filter(directoryFilter(msg.caller)).drop(from).take(Nat.min(limit, 100)).toArray()
  };

  /// Every contractor's lead-matching fields, for the notification relay.
  public query func getLeadAlertTargets() : async [LeadAlertTarget] {
    contractors.values().take(500).map(func(c: ContractorProfile) : LeadAlertTarget {
      {
        id            = c.id;
        specialties   = c.specialties;
        serviceZips   = c.serviceZips;
        alertZips     = c.alertZips;
        notifyPush    = c.notifyPush;
        trustScore    = c.trustScore;
        jobsCompleted = c.jobsCompleted;
        isVerified    = c.isVerified;
      }
    }).toArray()
  };

  // ─── Privacy ───────────────────────────────────────────────────────────────────

  /// Save the caller's Settings → Privacy choices. The caller must have a profile.
  public shared(msg) func setProfilePrivacy(p: ProfilePrivacy) : async Result.Result<ProfilePrivacy, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (contractors.get(msg.caller) == null) return #err(#NotFound);
    if (p.listed and p.showTrustScore and p.showJobsCompleted) profilePrivacy.remove(msg.caller)
    else profilePrivacy.add(msg.caller, p);
    #ok(p)
  };

  public query(msg) func getMyProfilePrivacy() : async ProfilePrivacy {
    privacyOf(msg.caller)
  };

  /// Privacy settings for up to 500 contractors, in the order asked, so a page
  /// can tell which numbers to show. Unknown principals get the defaults.
  public query func getProfilePrivacies(ps: [Principal]) : async [ProfilePrivacy] {
    ps.values().take(500).map(privacyOf).toArray()
  };

  public query func getReviewsForContractor(c: Principal) : async [Review] {
    Index.records(reviewsByContractor, c.toText(), reviews).toArray(
      
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
    switch (contractors.get(p)) {
      case null { null };
      case (?profile) {
        let count = Index.count(reviewsByContractor, p.toText());
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
    credentials.add(credentialCounter, cred);

    switch (contractors.get(contractorPrincipal)) {
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
          origin        = existing.origin;
        };
        contractors.add(contractorPrincipal, updated);
        #ok(())
      };
    }
  };

  /// #518 — Called by the Job canister (cross-canister) when a guest
  /// (no-account) contractor redeems an invite token. Creates an
  /// admin-pending ContractorProfile for the redeeming principal if none
  /// exists yet; leaves an existing profile untouched (a guest-sign event
  /// must never clobber a contractor's own self-entered data).
  ///
  /// Profiles created this way start exactly like a fresh register() profile
  /// — trustScore 70, isVerified false — so they flow through the same
  /// unverified-tier scoring/matching path as any other new contractor.
  /// Only the registered job canister principal or an admin may call this.
  ///
  /// Not a live license-registry check (deferred — see #518); this only
  /// captures identity fields and gates the resulting profile behind the
  /// existing admin-approval flow (verifyContractor()).
  public shared(msg) func createOrLinkGuestProfile(
    contractorPrincipal: Principal,
    name:                Text,
    phone:               Text,
    email:               Text,
    licenseNumber:       ?Text,
    serviceTypeText:     Text,   // best-effort specialty seed; unmapped labels are silently skipped
    originJobId:         Text,
  ) : async Result.Result<(), Error> {
    if (not isJobCanister(msg.caller) and not isAdmin(msg.caller))
      return #err(#NotAuthorized);

    switch (contractors.get(contractorPrincipal)) {
      case (?_existing) { #ok(()) };  // already has a profile — no overwrite
      case null {
        if (Text.size(name)  == 0)   return #err(#InvalidInput("name cannot be empty"));
        if (Text.size(name)  > 200)  return #err(#InvalidInput("name exceeds 200 characters"));
        if (Text.size(email) == 0)   return #err(#InvalidInput("email cannot be empty"));
        if (Text.size(email) > 254)  return #err(#InvalidInput("email exceeds 254 characters"));
        if (not email.contains(#text "@"))
          return #err(#InvalidInput("email must contain @"));
        if (email.contains(#text " "))
          return #err(#InvalidInput("email must not contain spaces"));
        if (Text.size(phone) == 0)   return #err(#InvalidInput("phone cannot be empty"));
        if (not validateE164Phone(phone))
          return #err(#InvalidInput("phone must be in E.164 format (e.g. +12125551234)"));
        switch (licenseNumber) {
          case (?l) { if (not validateLicenseFormat(l)) return #err(#InvalidInput("licenseNumber format is invalid")) };
          case null {};
        };

        let specialties : [ServiceType] = switch (textToServiceType(serviceTypeText)) {
          case (?s) { [s] };
          case null { [] };
        };

        let profile: ContractorProfile = {
          id            = contractorPrincipal;
          name;
          specialties;
          email;
          phone;
          bio           = null;
          licenseNumber;
          serviceArea   = null;
          serviceZips   = [];
          trustScore    = 70;
          jobsCompleted = 0;
          isVerified    = false;
          createdAt     = Time.now();
          notifyEmail   = null;
          notifyPush    = null;
          alertZips     = [];
          origin        = #GuestSigned(originJobId);
        };
        contractors.add(contractorPrincipal, profile);
        #ok(())
      };
    }
  };

  /// Returns all verified-job credentials for a given contractor.
  public query func getCredentials(contractorPrincipal: Principal) : async [JobCredential] {
    Iter.toArray(
      credentials.values().filter(func(c: JobCredential) : Bool {
        c.contractorId == contractorPrincipal
      })
    )
  };

  // ─── ContractorPro portfolio ────────────────────────────────────────────────

  let MAX_PORTFOLIO_ENTRIES : Nat = 12;

  /// Replace the caller's portfolio. ContractorPro only (read live from
  /// payment). Each entry must name one of the caller's own credentials, once.
  public shared(msg) func setPortfolio(entries: [PortfolioInput]) : async Result.Result<[PortfolioItem], Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (contractors.get(msg.caller) == null) return #err(#NotFound);
    if (entries.size() > MAX_PORTFOLIO_ENTRIES) return #err(#InvalidInput("at most " # MAX_PORTFOLIO_ENTRIES.toText() # " portfolio entries"));
    let now = Time.now();
    var seen : [Nat] = [];
    let stored = Array.tabulate<PortfolioEntry>(entries.size(), func(i) {
      let e = entries[i];
      { credentialId = e.credentialId; title = e.title; description = e.description; featuredAt = now }
    });
    for (e in entries.values()) {
      if (e.title.size() == 0 or e.title.size() > 80) return #err(#InvalidInput("title must be 1-80 characters"));
      if (e.description.size() > 600) return #err(#InvalidInput("description must be at most 600 characters"));
      switch (credentials.get(e.credentialId)) {
        case (?c) { if (c.contractorId != msg.caller) return #err(#NotAuthorized) };
        case null { return #err(#NotFound) };
      };
      if (seen.find(func(x : Nat) : Bool { x == e.credentialId }) != null) return #err(#InvalidInput("a job is listed twice"));
      seen := seen.concat([e.credentialId]);
    };
    let tier : Canisters.Tier = if (payCanisterId == "") #Free else {
      try { await Canisters.payment(payCanisterId).getTierForPrincipal(msg.caller) } catch _ { #Free }
    };
    if (tier != #ContractorPro) return #err(#InvalidInput("The portfolio is a ContractorPro feature"));
    // Keep featuredAt for entries that were already featured.
    let previous = switch (portfolios.get(msg.caller)) { case (?p) p; case null [] };
    let merged = stored.map(func(e : PortfolioEntry) : PortfolioEntry {
      switch (previous.find(func(p : PortfolioEntry) : Bool { p.credentialId == e.credentialId })) {
        case (?p) { { e with featuredAt = p.featuredAt } };
        case null e;
      }
    });
    if (merged.size() == 0) portfolios.remove(msg.caller) else portfolios.add(msg.caller, merged);
    #ok(portfolioItems(merged))
  };

  private func portfolioItems(entries: [PortfolioEntry]) : [PortfolioItem] {
    entries.filterMap(func(e : PortfolioEntry) : ?PortfolioItem {
      switch (credentials.get(e.credentialId)) {
        case (?c) ?{ credentialId = e.credentialId; title = e.title; description = e.description;
                     serviceType = c.serviceType; verifiedAt = c.verifiedAt; featuredAt = e.featuredAt };
        case null null;
      }
    })
  };

  /// A contractor's featured jobs, in their chosen order. Public. Whether to
  /// show them (the contractor still has ContractorPro) is the page's call,
  /// from payment.getTierForPrincipal.
  public query func getPortfolio(contractor: Principal) : async [PortfolioItem] {
    switch (portfolios.get(contractor)) { case (?p) portfolioItems(p); case null [] }
  };

  public shared(msg) func setPaymentCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := id.toText();
    #ok(())
  };

  // ─── Account Deletion ──────────────────────────────────────────────────────────

  // ─── Florida DBPR licence checks ────────────────────────────────────────────

  /// Uppercase, no spaces or dashes, as the Worker sends it ("cgc-123 4567" → "CGC1234567").
  private func normLicense(t: Text) : Text {
    Text.toUpper(Text.join(Text.split(t, #predicate(func(c : Char) : Bool { c == ' ' or c == '-' })), ""))
  };

  /// Record the Worker's DBPR lookup of `contractor`'s licence number. Relay
  /// only. Refused when the number no longer matches the profile, so a check
  /// can't attach to a number the contractor has since changed.
  public shared(msg) func relayRecordLicenseCheck(contractor: Principal, input: LicenseCheckInput) : async Result.Result<LicenseCheck, Error> {
    if (not Admin.contains(licenseRelayEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    let tooLong = func(t: Text) : Bool { t.size() > 200 };
    if (tooLong(input.licenseNumber) or tooLong(input.licenseeName) or tooLong(input.dbaName)
        or tooLong(input.licenseType) or tooLong(input.status) or tooLong(input.expiresOn) or tooLong(input.sourceDate)) {
      return #err(#InvalidInput("field too long"));
    };
    switch (contractors.get(contractor)) {
      case null { #err(#NotFound) };
      case (?p) {
        let current = switch (p.licenseNumber) { case (?l) normLicense(l); case null "" };
        if (current == "" or current != normLicense(input.licenseNumber)) {
          return #err(#InvalidInput("licence number no longer matches the profile"));
        };
        let check : LicenseCheck = {
          licenseNumber = current; found = input.found; licenseeName = input.licenseeName; dbaName = input.dbaName;
          licenseType = input.licenseType; status = input.status; active = input.found and input.active;
          expiresOn = input.expiresOn; nameMatches = input.found and input.nameMatches;
          sourceDate = input.sourceDate; checkedAt = Time.now();
        };
        licenseChecks.add(contractor, check);
        #ok(check)
      };
    }
  };

  /// The latest DBPR lookup for a contractor's current licence number. Public:
  /// licence status is a public record. Null when never checked, or when the
  /// number has changed since the last check.
  public query func getLicenseCheck(contractor: Principal) : async ?LicenseCheck {
    switch (contractors.get(contractor), licenseChecks.get(contractor)) {
      case (?p, ?c) {
        let current = switch (p.licenseNumber) { case (?l) normLicense(l); case null "" };
        if (current != "" and current == c.licenseNumber) ?c else null
      };
      case _ null;
    }
  };

  public shared(msg) func addLicenseRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (p.isAnonymous()) return #err(#InvalidInput("anonymous principal"));
    licenseRelayEntries := Admin.add(licenseRelayEntries, p);
    #ok(())
  };

  public shared(msg) func removeLicenseRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    licenseRelayEntries := Admin.remove(licenseRelayEntries, p);
    #ok(())
  };

  /// Account deletion: removes everything this canister holds for the caller —
  /// their contractor profile, reviews about them, reviews they wrote and
  /// their job credentials. Returns how many records were removed.
  ///
  /// Kept on purpose: the "reviewer|jobId" dedupe keys in `reviewKeys` and the
  /// caller's daily window in `reviewRateLimits`. Dropping them would let a
  /// reviewer delete their account and re-review the same job, or reset the
  /// 10/day review limit. They hold only principal text + job id, no content.
  /// Credentials where the caller was only the homeowner belong to the
  /// contractor who earned them and are kept.
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    let caller = msg.caller;
    var removed = 0;

    // Reviews about the caller and reviews written by the caller.
    let reviewIds = reviews.values()
      .filter(func(r) { r.contractor == caller or r.reviewer == caller })
      .map(func(r) { r.id })
      .toArray();
    for (id in reviewIds.values()) {
      switch (reviews.get(id)) {
        case (?r) {
          Index.remove(reviewsByContractor, r.contractor.toText(), id);
          reviews.remove(id);
          removed += 1;
        };
        case null {};
      };
    };

    // Job credentials minted for the caller as contractor.
    let credIds = credentials.values()
      .filter(func(c) { c.contractorId == caller })
      .map(func(c) { c.id })
      .toArray();
    for (id in credIds.values()) { credentials.remove(id); removed += 1 };

    // Profile and its privacy settings.
    if (contractors.get(caller) != null) { contractors.remove(caller); removed += 1 };
    if (profilePrivacy.get(caller) != null) { profilePrivacy.remove(caller); removed += 1 };
    if (licenseChecks.get(caller) != null) { licenseChecks.remove(caller); removed += 1 };
    if (portfolios.get(caller) != null) { portfolios.remove(caller); removed += 1 };

    #ok(removed)
  };

  // ─── Admin Functions ───────────────────────────────────────────────────────────

  /// Wire the contractor canister to the job canister so recordJobVerified()
  /// accepts cross-canister calls. Must be called once after both canisters deploy.
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id;
    #ok(())
  };

  /// Mark a contractor as verified (admin only). Idempotent; also tells the job
  /// canister to count this contractor's earlier signatures (R2).
  public shared(msg) func verifyContractor(c: Principal) : async Result.Result<ContractorProfile, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (contractors.get(c)) {
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
          origin        = existing.origin;
        };
        contractors.add(c, updated);
        // R2: job signatures this contractor made while unverified start
        // counting toward scores / certificates. The profile change is already
        // committed; a failed call is ignored (re-run verifyContractor to retry,
        // it is idempotent).
        if (Text.size(jobCanisterId) > 0) {
          let jobActor = actor(jobCanisterId) : actor {
            refreshContractorAttestation : (Principal, Bool) -> async { #ok : Nat; #err : Any };
          };
          try { ignore await jobActor.refreshContractorAttestation(c, true) } catch (_) {};
        };
        #ok(updated)
      };
    }
  };

  /// Update a contractor's notification preferences (email override, push opt-in, alert zips).
  /// Caller must be the contractor themselves.
  public shared(msg) func updateNotificationPrefs(args: NotificationPrefsArgs) : async Result.Result<ContractorProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (args.alertZips.size() > 50) return #err(#InvalidInput("alertZips cannot exceed 50 entries"));
    for (zip in args.alertZips.values()) {
      if (not validateZip(zip)) return #err(#InvalidInput("alertZips: '" # zip # "' is not a valid 5-digit zip code"));
    };
    switch (args.notifyEmail) {
      case (?e) {
        if (Text.size(e) > 254) return #err(#InvalidInput("notifyEmail exceeds 254 characters"));
        if (not e.contains(#text "@")) return #err(#InvalidInput("notifyEmail must contain @"));
      };
      case null {};
    };
    switch (contractors.get(msg.caller)) {
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
          origin        = existing.origin;
        };
        contractors.add(msg.caller, updated);
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

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminInitialized, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    admins := Admin.add(admins, newAdmin);
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Admin.remove(admins, target);
    #ok(())
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters (job) bypass per-principal rate limiting. Admin only.
  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.add(trustedCanisterEntries, p);
    #ok(())
  };

  public shared(msg) func removeTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.remove(trustedCanisterEntries, p);
    #ok(())
  };

  public query func getTrustedCanisters() : async [Principal] {
    trustedCanisterEntries
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

  /// Return all contractors who have explicitly listed the given zip code in their serviceZips.
  /// Contractors with empty serviceZips are excluded (they haven't configured a service area yet).
  public query(msg) func getByZip(zipCode: Text) : async [ContractorProfile] {
    let listed = directoryFilter(msg.caller);
    Iter.toArray(
      contractors.values().filter(func(c: ContractorProfile) : Bool {
        listed(c) and Option.isSome(c.serviceZips.find(func(z) { z == zipCode }))
      })
    )
  };

  /// Return all contractors who serve a given trade category.
  public query(msg) func getBySpecialty(s: ServiceType) : async [ContractorProfile] {
    let listed = directoryFilter(msg.caller);
    Iter.toArray(
      contractors.values().filter(func(c: ContractorProfile) : Bool {
        listed(c) and Option.isSome(c.specialties.find(func(t) { t == s }))
      })
    )
  };

  public query func getMetrics() : async Metrics {
    var verified = 0;
    for (c in contractors.values()) { if (c.isVerified) { verified += 1 } };
    {
      totalContractors    = contractors.size();
      verifiedContractors = verified;
      totalReviews        = reviews.size();
      isPaused;
    }
  };
}
