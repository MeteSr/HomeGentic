/**
 * HomeGentic Job Canister
 * Tracks home maintenance jobs with dual-signature verification.
 *
 * DIY jobs (contractor = null) are verified by homeowner signature alone.
 * Contractor jobs require both homeowner AND contractor signatures.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Debug     "mo:core/Debug";
import Int       "mo:core/Int";
import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Nat8      "mo:core/Nat8";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Random    "mo:core/Random";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Job {

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

  public type JobStatus = {
    #Pending;
    #InProgress;
    #Completed;
    #Verified;
    #PendingHomeownerApproval;   // contractor proposed, awaiting homeowner sign-off
    #RejectedByHomeowner;        // homeowner declined — kept briefly for audit, then pruned
  };

  /// Lightweight job summary consumed by the market canister's computePropertyScore.
  /// serviceType is serialised to Text so the market canister avoids importing the
  /// ServiceType variant; completedDate is converted to a calendar year.
  public type JobSnapshot = {
    serviceType:   Text;
    completedYear: Nat;
    amountCents:   Nat;
    isDiy:         Bool;
    isVerified:    Bool;
  };

  public type Job = {
    id: Text;
    propertyId: Text;
    homeowner: Principal;
    contractor: ?Principal;
    title: Text;
    serviceType: ServiceType;
    description: Text;
    contractorName: ?Text;    // null = DIY
    amount: Nat;              // cents
    completedDate: Time.Time;
    permitNumber: ?Text;      // null = no permit / not applicable
    warrantyMonths: ?Nat;     // null = no warranty
    isDiy: Bool;
    status: JobStatus;
    verified: Bool;
    homeownerSigned: Bool;
    contractorSigned: Bool;
    createdAt: Time.Time;
    sourceQuoteId: ?Text;     // null = not sourced via a HomeGentic quote request; set = referral fee applies on verification
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #AlreadyVerified;
    #TierLimitReached: Text;
  };

  public type Metrics = {
    totalJobs: Nat;
    pendingJobs: Nat;
    completedJobs: Nat;
    verifiedJobs: Nat;
    diyJobs: Nat;
    isPaused: Bool;
    errorsByMethod : [(Text, Nat)];
  };

  /// Short-lived token that lets a contractor sign a job without having an account.
  public type InviteToken = {
    token:               Text;     // "INV_<32 hex chars>" — unguessable
    jobId:               Text;
    propertyAddress:     Text;     // denormalised at creation — avoids cross-canister call on verify page
    createdAt:           Int;
    expiresAt:           Int;      // createdAt + 48 hours
    usedAt:              ?Int;     // null until redeemed
    contractorPrincipal: ?Principal; // M-12: intended redeemer; null = legacy token (any bearer)
  };

  /// Subset of job data returned to the public verify page (no auth required).
  public type InvitePreview = {
    jobId:           Text;
    title:           Text;
    serviceType:     ServiceType;
    description:     Text;
    amount:          Nat;
    completedDate:   Int;
    propertyAddress: Text;
    contractorName:  ?Text;
    expiresAt:       Int;
    alreadySigned:   Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var jobCounter: Nat = 0;
  private var isPaused:           Bool        = false;
  private var pauseExpiryNs:      ?Int        = null;
  private var adminListEntries:        [Principal] = [];
  private var adminInitialized:        Bool        = false;
  private var authorizedSensors:       [Principal] = [];
  private var trustedCanisterEntries:  [Principal] = [];
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use. Prevents any
  /// anonymous caller from claiming admin during initial deployment.
  private var bootstrapNonce:          ?Text       = null;
  /// Contractor canister ID — set post-deploy via setContractorCanisterId().
  /// When set, verifyJob() notifies the contractor canister on full verification.
  private var contrCanisterId:    Text        = "";
  /// Property canister ID — set post-deploy via setPropertyCanisterId().
  /// When set, createSensorJob() cross-calls getPropertyOwner() to verify
  /// that the sensor device's stored homeowner actually owns the property.
  private var propCanisterId:     Text        = "";
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  /// When set, createJob() cross-calls getTierForPrincipal() and enforces
  /// the Free-tier job cap (max 5 jobs per homeowner).
  private var payCanisterId:      Text        = "";

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let jobs        = Map.empty<Text, Job>();
  private let inviteTokens = Map.empty<Text, InviteToken>();
  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();

  private func countError(method : Text) {
    let prev = Option.get(Map.get(errsByMethod, Text.compare, method), 0);
    Map.add(errsByMethod, Text.compare, method, prev + 1);
  };

  // ─── Constants ───────────────────────────────────────────────────────────────

  /// Maximum job amount in cents ($1,000,000). Prevents runaway values in stable storage.
  private let MAX_JOB_AMOUNT_CENTS : Nat = 100_000_000;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection, §enterprise/#46) ────────────────────

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
      case null {
        Map.add(updateCallLimits, Text.compare, key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= ONE_MINUTE_NS) {
          Map.add(updateCallLimits, Text.compare, key, (1, now));
          true
        } else if (maxUpdatesPerMin > 0 and count >= maxUpdatesPerMin) {
          false
        } else {
          Map.add(updateCallLimits, Text.compare, key, (count + 1, windowStart));
          true
        }
      };
    }
  };

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func isSensor(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(authorizedSensors, func(s) { s == caller }))
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(trustedCanisterEntries, func(t) { t == p }))
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

  /// Delegate property-ownership check to the property canister.
  /// Falls back to direct principal comparison when propCanisterId is unset (local dev).
  private func checkPropertyAuth(propertyId: Text, owner: Principal, caller: Principal, requireWrite: Bool) : async Bool {
    if (Text.size(propCanisterId) > 0) {
      let propActor = actor(propCanisterId) : actor {
        isAuthorized : (Text, Principal, Bool) -> async Bool;
      };
      await propActor.isAuthorized(propertyId, caller, requireWrite)
    } else {
      caller == owner
    }
  };

  private func nextJobId() : Text {
    jobCounter += 1;
    "JOB_" # Nat.toText(jobCounter)
  };

  // ─── Core Functions ───────────────────────────────────────────────────────────

  /// Create a new job for a property. Caller becomes the homeowner.
  /// Pass contractorName = null and isDiy = true for self-performed work.
  public shared(msg) func createJob(
    propertyId: Text,
    title: Text,
    serviceType: ServiceType,
    description: Text,
    contractorName: ?Text,
    amount: Nat,
    completedDate: Time.Time,
    permitNumber: ?Text,
    warrantyMonths: ?Nat,
    isDiy: Bool,
    sourceQuoteId: ?Text
  ) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)   == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(title)        == 0) return #err(#InvalidInput("title cannot be empty"));
    if (Text.size(title)        > 200)  return #err(#InvalidInput("title exceeds 200 characters"));
    if (Text.size(description)  == 0) return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description)  > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (amount == 0 and not isDiy)        return #err(#InvalidInput("amount must be greater than 0 for contractor jobs"));
    if (amount > MAX_JOB_AMOUNT_CENTS)    return #err(#InvalidInput("amount exceeds maximum of 100,000,000 cents ($1,000,000)"));
    if (completedDate > Time.now())       return #err(#InvalidInput("completedDate cannot be in the future"));

    // Contractor name is required for non-DIY jobs
    if (not isDiy) {
      switch (contractorName) {
        case null    { return #err(#InvalidInput("contractorName is required for non-DIY jobs")) };
        case (?name) {
          if (Text.size(name) == 0)   return #err(#InvalidInput("contractorName cannot be empty"));
          if (Text.size(name) > 200)  return #err(#InvalidInput("contractorName exceeds 200 characters"));
        };
      };
    };

    // ── Tier job cap ─────────────────────────────────────────────────────────
    // When the caller is a delegated manager, use the property owner's tier
    // so the manager doesn't need their own paid subscription.
    if (payCanisterId != "") {
      let payActor = actor(payCanisterId) : actor {
        getTierForPrincipal : (Principal) -> async { #Free; #Basic; #Pro; #Premium; #ContractorFree; #ContractorPro };
      };
      let effectivePrincipal : Principal = if (propCanisterId != "") {
        let propActor = actor(propCanisterId) : actor {
          getPropertyOwner : (Text) -> async ?Principal;
        };
        switch (await propActor.getPropertyOwner(propertyId)) {
          case (?owner) { if (owner != msg.caller) { owner } else { msg.caller } };
          case null     { msg.caller };
        }
      } else { msg.caller };
      let tier = await payActor.getTierForPrincipal(effectivePrincipal);
      switch (tier) {
        case (#Free) {
          return #err(#TierLimitReached("Job creation requires an active subscription. Subscribe to Basic ($10/mo) to get started."));
        };
        case _ {};
      };
    };

    let id  = nextJobId();
    let now = Time.now();

    let job: Job = {
      id;
      propertyId;
      homeowner        = msg.caller;
      contractor       = null;
      title;
      serviceType;
      description;
      contractorName;
      amount;
      completedDate;
      permitNumber;
      warrantyMonths;
      isDiy;
      status           = #Pending;
      verified         = false;
      homeownerSigned  = false;
      // DIY jobs pre-sign the contractor slot — no contractor to co-sign
      contractorSigned = isDiy;
      createdAt        = now;
      sourceQuoteId;
    };

    Map.add(jobs, Text.compare, id, job);
    #ok(job)
  };

  /// Fetch a single job by ID.
  public query func getJob(jobId: Text) : async Result.Result<Job, Error> {
    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?j) { #ok(j) };
    }
  };

  /// Fetch all jobs for a given property.
  /// Caller must be the property owner, an admin, or a trusted canister.
  public shared(msg) func getJobsForProperty(propertyId: Text) : async Result.Result<[Job], Error> {
    if (not isAdmin(msg.caller) and not isTrustedCanister(msg.caller)) {
      let authorized = await checkPropertyAuth(propertyId, msg.caller, msg.caller, false);
      if (not authorized) return #ok([]);  // return empty rather than error for UX
    };
    let matches = Iter.toArray(
      Iter.filter(Map.values(jobs), func(j: Job) : Bool { j.propertyId == propertyId })
    );
    #ok(matches)
  };

  /// Returns a lightweight snapshot of all jobs for a property, suitable for
  /// cross-canister consumption by the market canister's computePropertyScore.
  public query func getJobSnapshotsForProperty(propertyId: Text) : async [JobSnapshot] {
    let secsPerYear : Nat = 31_536_000;
    Iter.toArray(Iter.map<Job, JobSnapshot>(
      Iter.filter(Map.values(jobs), func(j: Job) : Bool { j.propertyId == propertyId }),
      func(j: Job) : JobSnapshot {
        let secsSince1970 = Int.abs(j.completedDate) / 1_000_000_000;
        {
          serviceType   = switch (j.serviceType) {
            case (#HVAC)        "HVAC";
            case (#Roofing)     "Roofing";
            case (#Plumbing)    "Plumbing";
            case (#Electrical)  "Electrical";
            case (#Painting)    "Painting";
            case (#Flooring)    "Flooring";
            case (#Windows)     "Windows";
            case (#Landscaping) "Landscaping";
          };
          completedYear = 1970 + secsSince1970 / secsPerYear;
          amountCents   = j.amount;
          isDiy         = j.isDiy;
          isVerified    = j.verified;
        }
      }
    ))
  };

  /// 3.3.2 — Unauthenticated public read: returns all jobs whose homeowner field
  /// matches the given principal. Enables data portability without authentication.
  public query func getJobsByOwner(owner: Principal) : async [Job] {
    Iter.toArray(
      Iter.filter(Map.values(jobs), func(j: Job) : Bool { j.homeowner == owner })
    )
  };

  /// Fetch jobs where the caller is the linked contractor and has not yet signed.
  public query(msg) func getJobsPendingMySignature() : async [Job] {
    Iter.toArray(Iter.filter(Map.values(jobs), func(j: Job) : Bool {
      switch (j.contractor) {
        case (?con) { con == msg.caller and not j.contractorSigned and not j.verified };
        case null   { false };
      }
    }))
  };

  /// Fetch the caller's own jobs sourced via a HomeGentic quote request — the
  /// bids they won. Contractor-scoped counterpart to getReferralJobs (which is
  /// admin-only and returns every contractor's jobs). Backs the Contractor Plan
  /// & Billing fee ledger.
  public query(msg) func getMyReferralJobs() : async [Job] {
    Iter.toArray(Iter.filter(Map.values(jobs), func(j: Job) : Bool {
      let ownsJob = switch (j.contractor) {
        case (?con) { con == msg.caller };
        case null   { false };
      };
      ownsJob and (switch (j.sourceQuoteId) {
        case (?qid) { Text.size(qid) > 0 };
        case null   { false };
      })
    }))
  };

  /// Update a job's status. Only the homeowner (or admin) can do this on unverified jobs.
  public shared(msg) func updateJobStatus(jobId: Text, status: JobStatus) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.verified) return #err(#AlreadyVerified);
        if (not isAdmin(msg.caller)) {
          let ok = await checkPropertyAuth(existing.propertyId, existing.homeowner, msg.caller, true);
          if (not ok) return #err(#NotAuthorized);
        };

        let updated: Job = {
          id               = existing.id;
          propertyId       = existing.propertyId;
          homeowner        = existing.homeowner;
          contractor       = existing.contractor;
          title            = existing.title;
          serviceType      = existing.serviceType;
          description      = existing.description;
          contractorName   = existing.contractorName;
          amount           = existing.amount;
          completedDate    = existing.completedDate;
          permitNumber     = existing.permitNumber;
          warrantyMonths   = existing.warrantyMonths;
          isDiy            = existing.isDiy;
          status;
          verified         = existing.verified;
          homeownerSigned  = existing.homeownerSigned;
          contractorSigned = existing.contractorSigned;
          createdAt        = existing.createdAt;
          sourceQuoteId    = existing.sourceQuoteId;
        };
        Map.add(jobs, Text.compare, jobId, updated);
        #ok(updated)
      };
    }
  };

  /// Link a contractor Principal to a job. Only the homeowner can do this.
  /// Not applicable to DIY jobs.
  public shared(msg) func linkContractor(jobId: Text, contractorPrincipal: Principal) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.verified) return #err(#AlreadyVerified);
        let authOk = await checkPropertyAuth(existing.propertyId, existing.homeowner, msg.caller, true);
        if (not authOk) return #err(#NotAuthorized);
        if (existing.isDiy) return #err(#InvalidInput("Cannot link contractor to a DIY job"));

        let updated: Job = {
          id               = existing.id;
          propertyId       = existing.propertyId;
          homeowner        = existing.homeowner;
          contractor       = ?contractorPrincipal;
          title            = existing.title;
          serviceType      = existing.serviceType;
          description      = existing.description;
          contractorName   = existing.contractorName;
          amount           = existing.amount;
          completedDate    = existing.completedDate;
          permitNumber     = existing.permitNumber;
          warrantyMonths   = existing.warrantyMonths;
          isDiy            = existing.isDiy;
          status           = existing.status;
          verified         = existing.verified;
          homeownerSigned  = existing.homeownerSigned;
          contractorSigned = existing.contractorSigned;
          createdAt        = existing.createdAt;
          sourceQuoteId    = existing.sourceQuoteId;
        };
        Map.add(jobs, Text.compare, jobId, updated);
        #ok(updated)
      };
    }
  };

  /// Sign off on a completed job.
  ///
  /// Verification rules:
  ///   DIY job        — homeowner signature alone is sufficient.
  ///   Contractor job — both homeowner AND contractor must sign.
  public shared(msg) func verifyJob(jobId: Text) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(jobs, Text.compare, jobId)) {
      case null {
        Debug.print("job.verifyJob: not found: " # jobId);
        countError("verifyJob");
        #err(#NotFound)
      };
      case (?existing) {
        if (existing.verified) return #err(#AlreadyVerified);

        let caller       = msg.caller;
        let isContractor = switch (existing.contractor) {
          case null    { false };
          case (?con)  { caller == con };
        };
        let isHomeowner = if (isContractor) false else {
          await checkPropertyAuth(existing.propertyId, existing.homeowner, caller, true)
        };

        if (not isHomeowner and not isContractor) {
          Debug.print("job.verifyJob: unauthorized: " # Principal.toText(caller) # " job=" # jobId);
          countError("verifyJob");
          return #err(#NotAuthorized);
        };

        let newHomeownerSigned  = existing.homeownerSigned  or isHomeowner;
        let newContractorSigned = existing.contractorSigned or isContractor;

        // DIY: only homeowner signature needed.
        // Contractor: both signatures needed.
        let fullyVerified = if (existing.isDiy) {
          newHomeownerSigned
        } else {
          newHomeownerSigned and newContractorSigned
        };

        let updated: Job = {
          id               = existing.id;
          propertyId       = existing.propertyId;
          homeowner        = existing.homeowner;
          contractor       = existing.contractor;
          title            = existing.title;
          serviceType      = existing.serviceType;
          description      = existing.description;
          contractorName   = existing.contractorName;
          amount           = existing.amount;
          completedDate    = existing.completedDate;
          permitNumber     = existing.permitNumber;
          warrantyMonths   = existing.warrantyMonths;
          isDiy            = existing.isDiy;
          status           = if (fullyVerified) #Verified else existing.status;
          verified         = fullyVerified;
          homeownerSigned  = newHomeownerSigned;
          contractorSigned = newContractorSigned;
          createdAt        = existing.createdAt;
          sourceQuoteId    = existing.sourceQuoteId;
        };
        Map.add(jobs, Text.compare, jobId, updated);

        // Notify contractor canister when job becomes fully verified
        if (fullyVerified and Text.size(contrCanisterId) > 0) {
          switch (existing.contractor) {
            case (?con) {
              let svcText = switch (existing.serviceType) {
                case (#HVAC)        { "HVAC"        };
                case (#Roofing)     { "Roofing"     };
                case (#Plumbing)    { "Plumbing"    };
                case (#Electrical)  { "Electrical"  };
                case (#Painting)    { "Painting"    };
                case (#Flooring)    { "Flooring"    };
                case (#Windows)     { "Windows"     };
                case (#Landscaping) { "Landscaping" };
              };
              type ContrError = {
                #NotFound; #AlreadyExists; #Unauthorized;
                #Paused; #RateLimitExceeded; #InvalidInput : Text;
              };
              let contrActor = actor(contrCanisterId) : actor {
                recordJobVerified : (Principal, Text, Text, Principal) -> async { #ok : (); #err : ContrError };
              };
              // Await with try/catch so canister traps or network errors don't
              // propagate. #err results (e.g. #Unauthorized) are valid values
              // and are simply discarded — job verification is already committed.
              try {
                ignore await contrActor.recordJobVerified(con, jobId, svcText, existing.homeowner);
              } catch (_e) {};
            };
            case null {};
          };
        };

        #ok(updated)
      };
    }
  };

  // ─── Sensor-Triggered Job Creation ───────────────────────────────────────────

  /// Called exclusively by the Sensor canister to open a pending job on behalf
  /// of a property owner when a critical IoT alert fires.
  ///
  /// contractorName is left null — the homeowner assigns one later.
  /// Returns the new job ID as Text, or an error message as Text.
  public shared(msg) func createSensorJob(
    propertyId  : Text,
    homeowner   : Principal,
    title       : Text,
    serviceType : ServiceType,
    description : Text
  ) : async Result.Result<Text, Text> {
    if (isPaused) return #err("Canister is paused");
    if (not isSensor(msg.caller) and not isAdmin(msg.caller) and not isTrustedCanister(msg.caller))
      return #err("Unauthorized");
    if (Text.size(propertyId) == 0) return #err("propertyId required");
    if (Text.size(title)      == 0) return #err("title required");

    // 14.2.1 — verify that the sensor device's stored homeowner actually owns
    // the property before creating a job on their behalf.
    if (Text.size(propCanisterId) > 0) {
      let propActor = actor(propCanisterId) : actor {
        getPropertyOwner : (Text) -> async ?Principal;
      };
      switch (await propActor.getPropertyOwner(propertyId)) {
        case null     { return #err("Property not found") };
        case (?owner) {
          if (owner != homeowner)
            return #err("Sensor homeowner does not match property owner");
        };
      };
    };

    let id  = nextJobId();
    let now = Time.now();

    let job : Job = {
      id;
      propertyId;
      homeowner;
      contractor       = null;
      title;
      serviceType;
      description;
      contractorName   = null;
      amount           = 0;
      completedDate    = now;
      permitNumber     = null;
      warrantyMonths   = null;
      isDiy            = false;
      status           = #Pending;
      verified         = false;
      homeownerSigned  = false;
      contractorSigned = false;
      createdAt        = now;
      sourceQuoteId    = null;
    };

    Map.add(jobs, Text.compare, id, job);
    #ok(id)
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Wire the job canister to the contractor canister so trust scores
  /// auto-increment on job verification. Must be called once post-deploy.
  public shared(msg) func setContractorCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    contrCanisterId := id;
    #ok(())
  };

  /// Wire the job canister to the property canister for ownership verification.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id;
    #ok(())
  };

  /// Wire the job canister to the payment canister for tier-based cap enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := id;
    #ok(())
  };

  /// Authorize a Sensor canister principal to call createSensorJob().
  public shared(msg) func addSensorCanister(sensor: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    authorizedSensors := Array.concat(authorizedSensors, [sensor]);
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared func setBootstrapNonce(nonce: Text) : async () {
    if (adminInitialized) return;  // already bootstrapped — ignore
    if (bootstrapNonce != null) return;  // nonce already set — can only be set once
    bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    if (adminInitialized) {
      // Normal path: require an existing admin to add new admins.
      if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    } else {
      // Bootstrap path: require the pre-shared nonce.
      switch (bootstrapNonce) {
        case null    { return #err(#NotAuthorized) }; // nonce not set — reject
        case (?n)    { if (nonce != n) return #err(#NotAuthorized) };
      };
      bootstrapNonce := null; // consume the nonce — single use
    };
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Array.filter<Principal>(adminListEntries, func(a) { a != target });
    #ok(())
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters bypass per-principal rate limiting and may call
  /// restricted functions (e.g. createSensorJob). Admin only.
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

  /// Certification data for a property.
  /// Returns how many jobs are verified, how many distinct key systems are verified,
  /// and which key systems (HVAC / Roofing / Plumbing / Electrical) have at least
  /// one verified job.  Callers apply their own score threshold (≥ 88) on top.
  public query func getCertificationData(propertyId: Text) : async {
    verifiedJobCount   : Nat;
    verifiedKeySystems : [Text];
    meetsStructural    : Bool;   // verifiedJobCount >= 3 AND verifiedKeySystems.size() >= 2
  } {
    let _KEY_SYSTEMS : [Text] = ["HVAC", "Roofing", "Plumbing", "Electrical"];
    var verifiedCount : Nat = 0;
    var foundSystems : [Text] = [];

    for (j in Map.values(jobs)) {
      if (j.propertyId == propertyId and j.verified) {
        verifiedCount += 1;
        let svcText = switch (j.serviceType) {
          case (#HVAC)       "HVAC";
          case (#Roofing)    "Roofing";
          case (#Plumbing)   "Plumbing";
          case (#Electrical) "Electrical";
          case _             "";
        };
        if (svcText != "" and Option.isNull(Array.find<Text>(foundSystems, func(s) { s == svcText }))) {
          foundSystems := Array.concat(foundSystems, [svcText]);
        };
      };
    };

    {
      verifiedJobCount   = verifiedCount;
      verifiedKeySystems = foundSystems;
      meetsStructural    = verifiedCount >= 3 and foundSystems.size() >= 2;
    }
  };

  // ─── Builder: subcontractor record import ────────────────────────────────────

  /// Batch-import job records on behalf of a Builder.
  ///
  /// • Designed for the construction phase before first-buyer transfer.
  /// • Jobs are pre-verified — the builder attests to the work.
  /// • Both homeownerSigned and contractorSigned are set to true.
  /// • The `homeowner` field is set to the calling Builder principal.
  ///   After ownership transfer it will not match the new owner; the
  ///   Report canister reads verified=true which is the canonical signal.
  public shared(msg) func builderImportJob(
    propertyId:     Text,
    serviceType:    ServiceType,
    contractorName: Text,
    amount:         Nat,
    completedDate:  Time.Time,
    description:    Text,
    permitNumber:   ?Text,
    warrantyMonths: ?Nat
  ) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    // H-10: Verify property ownership before creating a pre-verified job.
    if (not isAdmin(msg.caller)) {
      let isOwner = await checkPropertyAuth(propertyId, msg.caller, msg.caller, true);
      if (not isOwner) return #err(#NotAuthorized);
    };

    if (Text.size(propertyId)    == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(contractorName) == 0) return #err(#InvalidInput("contractorName is required"));
    if (amount == 0)                   return #err(#InvalidInput("amount must be greater than 0"));
    if (amount > MAX_JOB_AMOUNT_CENTS) return #err(#InvalidInput("amount exceeds maximum of 100,000,000 cents ($1,000,000)"));
    if (Text.size(description)   == 0) return #err(#InvalidInput("description cannot be empty"));

    let id  = nextJobId();
    let now = Time.now();
    let serviceTypeKey = serviceType;

    let job: Job = {
      id;
      propertyId;
      homeowner        = msg.caller;
      contractor       = null;
      title            = contractorName;
      serviceType      = serviceTypeKey;
      description;
      contractorName   = ?contractorName;
      amount;
      completedDate;
      permitNumber;
      warrantyMonths;
      isDiy            = false;
      status           = #Verified;
      verified         = true;
      homeownerSigned  = true;
      contractorSigned = true;
      createdAt        = now;
      sourceQuoteId    = null;
    };

    Map.add(jobs, Text.compare, id, job);
    #ok(job)
  };

  // ─── Contractor Invite Tokens ─────────────────────────────────────────────────

  private func blobToHex(b : Blob) : Text {
    let hex   = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    let bytes = Blob.toArray(b);
    var result = "";
    for (byte in bytes.vals()) {
      let n = Nat8.toNat(byte);
      result #= Text.fromChar(hex[n / 16]);
      result #= Text.fromChar(hex[n % 16]);
    };
    result
  };

  /// Create a single-use invite token for a job so a contractor can sign
  /// without needing a HomeGentic account.  Caller must be the job's homeowner.
  /// propertyAddress is supplied by the frontend (already loaded in the UI).
  /// Token expires after 48 hours.
  public shared(msg) func createInviteToken(
    jobId:           Text,
    propertyAddress: Text
  ) : async Result.Result<Text, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    let job = switch (Map.get(jobs, Text.compare, jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };

    let invOk = await checkPropertyAuth(job.propertyId, job.homeowner, msg.caller, true);
    if (not invOk) return #err(#NotAuthorized);
    if (job.isDiy)                   return #err(#InvalidInput("DIY jobs do not require contractor signature"));
    if (job.contractorSigned)        return #err(#InvalidInput("Contractor has already signed this job"));

    let randBytes = await Random.blob();
    let token     = "INV_" # blobToHex(randBytes);
    let now       = Time.now();
    let entry : InviteToken = {
      token;
      jobId;
      propertyAddress;
      createdAt           = now;
      expiresAt           = now + 48 * 60 * 60 * 1_000_000_000;
      usedAt              = null;
      contractorPrincipal = null; // M-12: not locked to a specific contractor at creation
    };
    Map.add(inviteTokens, Text.compare, token, entry);
    #ok(token)
  };

  /// Return a safe preview of the job for the public verify page.
  /// No authentication required — the token is the credential.
  public query func getJobByInviteToken(token: Text) : async Result.Result<InvitePreview, Error> {
    let invite = switch (Map.get(inviteTokens, Text.compare, token)) {
      case null    { return #err(#NotFound) };
      case (?i)    { i };
    };
    let job = switch (Map.get(jobs, Text.compare, invite.jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };
    #ok({
      jobId           = job.id;
      title           = job.title;
      serviceType     = job.serviceType;
      description     = job.description;
      amount          = job.amount;
      completedDate   = job.completedDate;
      propertyAddress = invite.propertyAddress;
      contractorName  = job.contractorName;
      expiresAt       = invite.expiresAt;
      alreadySigned   = job.contractorSigned;
    })
  };

  /// Redeem an invite token: mark the contractor's signature on the job.
  /// M-12: Caller is captured; if the token was locked to a specific contractor
  /// principal, only that principal may redeem it. Legacy tokens (contractorPrincipal=null)
  /// remain bearer-token accessible for backwards compatibility.
  /// Sets contractorSigned = true; if homeownerSigned is also true, auto-verifies.
  public shared(msg) func redeemInviteToken(token: Text) : async Result.Result<Job, Error> {
    let invite = switch (Map.get(inviteTokens, Text.compare, token)) {
      case null    { return #err(#NotFound) };
      case (?i)    { i };
    };

    if (invite.usedAt != null)            return #err(#InvalidInput("This invite link has already been used"));
    if (Time.now() > invite.expiresAt)    return #err(#InvalidInput("This invite link has expired"));

    // M-12: Validate caller against intended contractor principal (when set).
    switch (invite.contractorPrincipal) {
      case (?intended) {
        if (msg.caller != intended) return #err(#NotAuthorized);
      };
      case null {}; // legacy tokens without contractorPrincipal — allow any bearer
    };

    let job = switch (Map.get(jobs, Text.compare, invite.jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };

    if (job.contractorSigned)             return #err(#AlreadyVerified);

    let bothSigned = job.homeownerSigned;
    let updated : Job = {
      id               = job.id;
      propertyId       = job.propertyId;
      homeowner        = job.homeowner;
      contractor       = job.contractor;
      title            = job.title;
      serviceType      = job.serviceType;
      description      = job.description;
      contractorName   = job.contractorName;
      amount           = job.amount;
      completedDate    = job.completedDate;
      permitNumber     = job.permitNumber;
      warrantyMonths   = job.warrantyMonths;
      isDiy            = job.isDiy;
      status           = if (bothSigned) #Verified else job.status;
      verified         = bothSigned;
      homeownerSigned  = job.homeownerSigned;
      contractorSigned = true;
      createdAt        = job.createdAt;
      sourceQuoteId    = job.sourceQuoteId;
    };
    Map.add(jobs, Text.compare, job.id, updated);

    // Mark token as used
    let usedInvite : InviteToken = {
      token               = invite.token;
      jobId               = invite.jobId;
      propertyAddress     = invite.propertyAddress;
      createdAt           = invite.createdAt;
      expiresAt           = invite.expiresAt;
      usedAt              = ?Time.now();
      contractorPrincipal = invite.contractorPrincipal;
    };
    Map.add(inviteTokens, Text.compare, token, usedInvite);

    #ok(updated)
  };

  // ─── Contractor-initiated Job Proposals ──────────────────────────────────────

  /// Called by a contractor to propose a completed job for homeowner approval.
  ///
  /// The contractor provides the propertyId (resolved client-side via address
  /// search).  This function cross-calls the property canister to confirm the
  /// true homeowner so the job record is attributed correctly.
  ///
  /// Rules:
  ///   - Caller must NOT be the property owner (no self-proposals).
  ///   - Job is created with contractorSigned=true, homeownerSigned=false.
  ///   - Status is set to #PendingHomeownerApproval.
  ///   - contractorName is required (non-DIY by definition).
  public shared(msg) func createJobProposal(
    propertyId:     Text,
    title:          Text,
    serviceType:    ServiceType,
    description:    Text,
    contractorName: ?Text,
    amount:         Nat,
    completedDate:  Time.Time,
    permitNumber:   ?Text,
    warrantyMonths: ?Nat
  ) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)  == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(title)       == 0) return #err(#InvalidInput("title cannot be empty"));
    if (Text.size(title)       > 200) return #err(#InvalidInput("title exceeds 200 characters"));
    if (Text.size(description) == 0) return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description) > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (amount == 0)                    return #err(#InvalidInput("amount must be greater than 0"));
    if (amount > MAX_JOB_AMOUNT_CENTS)  return #err(#InvalidInput("amount exceeds maximum of 100,000,000 cents ($1,000,000)"));

    switch (contractorName) {
      case null    { return #err(#InvalidInput("contractorName is required for proposals")) };
      case (?name) {
        if (Text.size(name) == 0)  return #err(#InvalidInput("contractorName cannot be empty"));
        if (Text.size(name) > 200) return #err(#InvalidInput("contractorName exceeds 200 characters"));
      };
    };

    // Look up the property owner via cross-canister call (if property canister is wired).
    // Falls back to anonymous when not wired — useful in tests without a full deploy.
    let homeowner : Principal = if (Text.size(propCanisterId) > 0) {
      let propActor = actor(propCanisterId) : actor {
        getPropertyOwner : (Text) -> async ?Principal;
      };
      switch (await propActor.getPropertyOwner(propertyId)) {
        case null     { return #err(#InvalidInput("Property not found")) };
        case (?owner) { owner };
      };
    } else {
      // Property canister not wired — for testability only.
      // In production propCanisterId must always be set before this is called.
      Principal.fromText("2vxsx-fae")   // anonymous principal as sentinel
    };

    // Contractor may not propose on their own property
    if (homeowner == msg.caller) {
      return #err(#InvalidInput("You cannot propose a job on a property you own"))
    };

    let id  = nextJobId();
    let now = Time.now();

    let job : Job = {
      id;
      propertyId;
      homeowner;
      contractor       = ?msg.caller;
      title;
      serviceType;
      description;
      contractorName;
      amount;
      completedDate;
      permitNumber;
      warrantyMonths;
      isDiy            = false;
      status           = #PendingHomeownerApproval;
      verified         = false;
      homeownerSigned  = false;
      contractorSigned = true;
      createdAt        = now;
      sourceQuoteId    = null;
    };

    Map.add(jobs, Text.compare, id, job);
    #ok(job)
  };

  /// Return all proposals awaiting the caller's (homeowner's) approval.
  /// Only the property owner sees their own pending proposals.
  public query(msg) func getPendingProposals() : async [Job] {
    Iter.toArray(Iter.filter(Map.values(jobs), func(j: Job) : Bool {
      j.homeowner == msg.caller and j.status == #PendingHomeownerApproval
    }))
  };

  /// Homeowner approves a pending contractor proposal.
  /// Sets homeownerSigned = true and advances status to #Pending so the
  /// normal job lifecycle (verification, photos, etc.) can proceed.
  public shared(msg) func approveJobProposal(jobId: Text) : async Result.Result<Job, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    let existing = switch (Map.get(jobs, Text.compare, jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };

    let approveOk = await checkPropertyAuth(existing.propertyId, existing.homeowner, msg.caller, true);
    if (not approveOk) return #err(#NotAuthorized);
    if (existing.status != #PendingHomeownerApproval) return #err(#InvalidInput("Job is not pending approval"));

    let updated : Job = {
      id               = existing.id;
      propertyId       = existing.propertyId;
      homeowner        = existing.homeowner;
      contractor       = existing.contractor;
      title            = existing.title;
      serviceType      = existing.serviceType;
      description      = existing.description;
      contractorName   = existing.contractorName;
      amount           = existing.amount;
      completedDate    = existing.completedDate;
      permitNumber     = existing.permitNumber;
      warrantyMonths   = existing.warrantyMonths;
      isDiy            = existing.isDiy;
      status           = #Pending;
      verified         = false;
      homeownerSigned  = true;
      contractorSigned = true;
      createdAt        = existing.createdAt;
      sourceQuoteId    = existing.sourceQuoteId;
    };
    Map.add(jobs, Text.compare, jobId, updated);
    #ok(updated)
  };

  /// Homeowner rejects a pending contractor proposal.
  /// The proposal record is removed entirely — no need to retain rejected proposals.
  public shared(msg) func rejectJobProposal(jobId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    let existing = switch (Map.get(jobs, Text.compare, jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };

    let rejectOk = await checkPropertyAuth(existing.propertyId, existing.homeowner, msg.caller, true);
    if (not rejectOk) return #err(#NotAuthorized);
    if (existing.status != #PendingHomeownerApproval) return #err(#InvalidInput("Job is not pending approval"));

    Map.remove(jobs, Text.compare, jobId);
    #ok(())
  };

  /// Returns all jobs that were sourced via a HomeGentic quote request.
  /// H-17: Admin-only — this view exposes quote IDs and referral attribution.
  public shared(msg) func getReferralJobs() : async Result.Result<[Job], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let result = Array.filter<Job>(
      Iter.toArray(Map.values(jobs)),
      func(j: Job) : Bool {
        switch (j.sourceQuoteId) {
          case null    { false };
          case (?qid)  { Text.size(qid) > 0 };
        }
      }
    );
    #ok(result)
  };

  public query func getMetrics() : async Metrics {
    var pending   = 0;
    var completed = 0;
    var verified  = 0;
    var diy       = 0;

    for (j in Map.values(jobs)) {
      if (j.isDiy) { diy += 1 };
      switch (j.status) {
        case (#Pending)                   { pending   += 1 };
        case (#Completed)                 { completed += 1 };
        case (#Verified)                  { verified  += 1 };
        case (#PendingHomeownerApproval)  { pending   += 1 };
        case _                            {};
      };
    };

    {
      totalJobs     = Map.size(jobs);
      pendingJobs   = pending;
      completedJobs = completed;
      verifiedJobs  = verified;
      diyJobs       = diy;
      isPaused;
      errorsByMethod = Iter.toArray(Map.entries(errsByMethod));
    }
  };
}
