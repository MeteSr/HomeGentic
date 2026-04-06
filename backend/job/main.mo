/**
 * HomeGentic Job Canister
 * Tracks home maintenance jobs with dual-signature verification.
 *
 * DIY jobs (contractor = null) are verified by homeowner signature alone.
 * Contractor jobs require both homeowner AND contractor signatures.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
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
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
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
  };

  /// Short-lived token that lets a contractor sign a job without having an account.
  public type InviteToken = {
    token:           Text;     // "INV_<32 hex chars>" — unguessable
    jobId:           Text;
    propertyAddress: Text;     // denormalised at creation — avoids cross-canister call on verify page
    createdAt:       Int;
    expiresAt:       Int;      // createdAt + 48 hours
    usedAt:          ?Int;     // null until redeemed
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
  private var adminListEntries:   [Principal] = [];
  private var adminInitialized:   Bool        = false;
  private var authorizedSensors: [Principal] = [];
  /// Migration buffers — cleared after first upgrade with this code.
  private var jobsEntries: [(Text, Job)] = [];
  private var inviteTokenEntries: [(Text, InviteToken)] = [];
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

  private var jobs        = Map.empty<Text, Job>();
  private var inviteTokens = Map.empty<Text, InviteToken>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in jobsEntries.vals()) {
      Map.add(jobs, Text.compare, k, v);
    };
    jobsEntries := [];
    for ((k, v) in inviteTokenEntries.vals()) {
      Map.add(inviteTokens, Text.compare, k, v);
    };
    inviteTokenEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func isSensor(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(authorizedSensors, func(s) { s == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (not isPaused) return #ok(());
    switch (pauseExpiryNs) {
      case (?expiry) { if (Time.now() >= expiry) return #ok(()) };
      case null {};
    };
    #err(#InvalidInput("Canister is paused"))
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
    isDiy: Bool
  ) : async Result.Result<Job, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)   == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(title)        == 0) return #err(#InvalidInput("title cannot be empty"));
    if (Text.size(title)        > 200)  return #err(#InvalidInput("title exceeds 200 characters"));
    if (Text.size(description)  == 0) return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description)  > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (amount == 0 and not isDiy)    return #err(#InvalidInput("amount must be greater than 0 for contractor jobs"));
    if (completedDate > Time.now())   return #err(#InvalidInput("completedDate cannot be in the future"));

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

    // ── Free-tier job cap (15.1.1) ──────────────────────────────────────────
    if (payCanisterId != "") {
      let payActor = actor(payCanisterId) : actor {
        getTierForPrincipal : (Principal) -> async { #Free; #Pro; #Premium; #ContractorPro };
      };
      let tier = await payActor.getTierForPrincipal(msg.caller);
      switch (tier) {
        case (#Free) {
          let callerJobCount = Iter.size(
            Iter.filter(Map.values(jobs), func(j: Job) : Bool { j.homeowner == msg.caller })
          );
          if (callerJobCount >= 5) {
            return #err(#TierLimitReached("Free plan is limited to 5 jobs. Upgrade to Pro to continue."));
          };
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
  public query func getJobsForProperty(propertyId: Text) : async Result.Result<[Job], Error> {
    let matches = Iter.toArray(
      Iter.filter(Map.values(jobs), func(j: Job) : Bool { j.propertyId == propertyId })
    );
    #ok(matches)
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

  /// Update a job's status. Only the homeowner (or admin) can do this on unverified jobs.
  public shared(msg) func updateJobStatus(jobId: Text, status: JobStatus) : async Result.Result<Job, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.verified) return #err(#AlreadyVerified);
        if (existing.homeowner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);

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
        };
        Map.add(jobs, Text.compare, jobId, updated);
        #ok(updated)
      };
    }
  };

  /// Link a contractor Principal to a job. Only the homeowner can do this.
  /// Not applicable to DIY jobs.
  public shared(msg) func linkContractor(jobId: Text, contractorPrincipal: Principal) : async Result.Result<Job, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.verified) return #err(#AlreadyVerified);
        if (existing.homeowner != msg.caller) return #err(#Unauthorized);
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.verified) return #err(#AlreadyVerified);

        let caller       = msg.caller;
        let isHomeowner  = caller == existing.homeowner;
        let isContractor = switch (existing.contractor) {
          case null    { false };
          case (?con)  { caller == con };
        };

        if (not isHomeowner and not isContractor) return #err(#Unauthorized);

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
              let contrActor = actor(contrCanisterId) : actor {
                recordJobVerified : (Principal, Text, Text, Principal) -> async { #ok : (); #err : {} };
              };
              ignore contrActor.recordJobVerified(con, jobId, svcText, existing.homeowner);
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
    if (not isSensor(msg.caller) and not isAdmin(msg.caller))
      return #err("Unauthorized");
    if (Text.size(propertyId) == 0) return #err("propertyId required");
    if (Text.size(title)      == 0) return #err("title required");

    // 14.2.1 — verify that the sensor device's stored homeowner actually owns
    // the property before creating a job on their behalf.
    if (Text.size(propCanisterId) > 0) {
      switch (Nat.fromText(propertyId)) {
        case null { return #err("Invalid propertyId format") };
        case (?natId) {
          let propActor = actor(propCanisterId) : actor {
            getPropertyOwner : (Nat) -> async ?Principal;
          };
          switch (await propActor.getPropertyOwner(natId)) {
            case null        { return #err("Property not found") };
            case (?owner) {
              if (owner != homeowner)
                return #err("Sensor homeowner does not match property owner");
            };
          };
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
    };

    Map.add(jobs, Text.compare, id, job);
    #ok(id)
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Wire the job canister to the contractor canister so trust scores
  /// auto-increment on job verification. Must be called once post-deploy.
  public shared(msg) func setContractorCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    contrCanisterId := id;
    #ok(())
  };

  /// Wire the job canister to the property canister for ownership verification.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    propCanisterId := id;
    #ok(())
  };

  /// Wire the job canister to the payment canister for tier-based cap enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    payCanisterId := id;
    #ok(())
  };

  /// Authorize a Sensor canister principal to call createSensorJob().
  public shared(msg) func addSensorCanister(sensor: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    authorizedSensors := Array.concat(authorizedSensors, [sensor]);
    #ok(())
  };

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

  /// Certification data for a property.
  /// Returns how many jobs are verified, how many distinct key systems are verified,
  /// and which key systems (HVAC / Roofing / Plumbing / Electrical) have at least
  /// one verified job.  Callers apply their own score threshold (≥ 88) on top.
  public query func getCertificationData(propertyId: Text) : async {
    verifiedJobCount   : Nat;
    verifiedKeySystems : [Text];
    meetsStructural    : Bool;   // verifiedJobCount >= 3 AND verifiedKeySystems.size() >= 2
  } {
    let KEY_SYSTEMS : [Text] = ["HVAC", "Roofing", "Plumbing", "Electrical"];
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)    == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(contractorName) == 0) return #err(#InvalidInput("contractorName is required"));
    if (amount == 0)                   return #err(#InvalidInput("amount must be greater than 0"));
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    let job = switch (Map.get(jobs, Text.compare, jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };

    if (job.homeowner != msg.caller) return #err(#Unauthorized);
    if (job.isDiy)                   return #err(#InvalidInput("DIY jobs do not require contractor signature"));
    if (job.contractorSigned)        return #err(#InvalidInput("Contractor has already signed this job"));

    let randBytes = await Random.blob();
    let token     = "INV_" # blobToHex(randBytes);
    let now       = Time.now();
    let entry : InviteToken = {
      token;
      jobId;
      propertyAddress;
      createdAt = now;
      expiresAt = now + 48 * 60 * 60 * 1_000_000_000;
      usedAt    = null;
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
  /// Caller identity is not checked — the token is the credential.
  /// Sets contractorSigned = true; if homeownerSigned is also true, auto-verifies.
  public shared func redeemInviteToken(token: Text) : async Result.Result<Job, Error> {
    let invite = switch (Map.get(inviteTokens, Text.compare, token)) {
      case null    { return #err(#NotFound) };
      case (?i)    { i };
    };

    if (invite.usedAt != null)            return #err(#InvalidInput("This invite link has already been used"));
    if (Time.now() > invite.expiresAt)    return #err(#InvalidInput("This invite link has expired"));

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
    };
    Map.add(jobs, Text.compare, job.id, updated);

    // Mark token as used
    let usedInvite : InviteToken = {
      token           = invite.token;
      jobId           = invite.jobId;
      propertyAddress = invite.propertyAddress;
      createdAt       = invite.createdAt;
      expiresAt       = invite.expiresAt;
      usedAt          = ?Time.now();
    };
    Map.add(inviteTokens, Text.compare, token, usedInvite);

    #ok(updated)
  };

  public query func getMetrics() : async Metrics {
    var pending   = 0;
    var completed = 0;
    var verified  = 0;
    var diy       = 0;

    for (j in Map.values(jobs)) {
      if (j.isDiy) { diy += 1 };
      switch (j.status) {
        case (#Pending)   { pending   += 1 };
        case (#Completed) { completed += 1 };
        case (#Verified)  { verified  += 1 };
        case _            {};
      };
    };

    {
      totalJobs     = Map.size(jobs);
      pendingJobs   = pending;
      completedJobs = completed;
      verifiedJobs  = verified;
      diyJobs       = diy;
      isPaused;
    }
  };
}
