/**
 * HomeFax Job Canister
 * Tracks home maintenance jobs with dual-signature verification.
 *
 * DIY jobs (contractor = null) are verified by homeowner signature alone.
 * Contractor jobs require both homeowner AND contractor signatures.
 */

import Array  "mo:base/Array";
import HashMap "mo:base/HashMap";
import Iter   "mo:base/Iter";
import Nat    "mo:base/Nat";
import Option "mo:base/Option";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text   "mo:base/Text";
import Time   "mo:base/Time";

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
  };

  public type Metrics = {
    totalJobs: Nat;
    pendingJobs: Nat;
    completedJobs: Nat;
    verifiedJobs: Nat;
    diyJobs: Nat;
    isPaused: Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var jobCounter: Nat = 0;
  private var isPaused:           Bool        = false;
  private var adminListEntries:   [Principal] = [];
  private var adminInitialized:   Bool        = false;
  private var authorizedSensors: [Principal] = [];
  private var jobsEntries: [(Text, Job)] = [];

  // ─── Transient State ─────────────────────────────────────────────────────────

  private transient var jobs = HashMap.fromIter<Text, Job>(
    jobsEntries.vals(), 16, Text.equal, Text.hash
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  system func preupgrade() {
    jobsEntries := Iter.toArray(jobs.entries());
  };

  system func postupgrade() {
    jobsEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func isSensor(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(authorizedSensors, func(s) { s == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) #err(#InvalidInput("Canister is paused")) else #ok(())
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
    if (Text.size(description)  == 0) return #err(#InvalidInput("description cannot be empty"));
    if (amount == 0 and not isDiy)    return #err(#InvalidInput("amount must be greater than 0 for contractor jobs"));
    if (completedDate > Time.now())   return #err(#InvalidInput("completedDate cannot be in the future"));

    // Contractor name is required for non-DIY jobs
    if (not isDiy) {
      switch (contractorName) {
        case null    { return #err(#InvalidInput("contractorName is required for non-DIY jobs")) };
        case (?name) { if (Text.size(name) == 0) return #err(#InvalidInput("contractorName cannot be empty")) };
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

    jobs.put(id, job);
    #ok(job)
  };

  /// Fetch a single job by ID.
  public query func getJob(jobId: Text) : async Result.Result<Job, Error> {
    switch (jobs.get(jobId)) {
      case null { #err(#NotFound) };
      case (?j) { #ok(j) };
    }
  };

  /// Fetch all jobs for a given property.
  public query func getJobsForProperty(propertyId: Text) : async Result.Result<[Job], Error> {
    let matches = Iter.toArray(
      Iter.filter(jobs.vals(), func(j: Job) : Bool { j.propertyId == propertyId })
    );
    #ok(matches)
  };

  /// Fetch jobs where the caller is the linked contractor and has not yet signed.
  public query(msg) func getJobsPendingMySignature() : async [Job] {
    Iter.toArray(Iter.filter(jobs.vals(), func(j: Job) : Bool {
      switch (j.contractor) {
        case (?con) { con == msg.caller and not j.contractorSigned and not j.verified };
        case null   { false };
      }
    }))
  };

  /// Update a job's status. Only the homeowner (or admin) can do this on unverified jobs.
  public shared(msg) func updateJobStatus(jobId: Text, status: JobStatus) : async Result.Result<Job, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (jobs.get(jobId)) {
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
        jobs.put(jobId, updated);
        #ok(updated)
      };
    }
  };

  /// Link a contractor Principal to a job. Only the homeowner can do this.
  /// Not applicable to DIY jobs.
  public shared(msg) func linkContractor(jobId: Text, contractorPrincipal: Principal) : async Result.Result<Job, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (jobs.get(jobId)) {
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
        jobs.put(jobId, updated);
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

    switch (jobs.get(jobId)) {
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
        jobs.put(jobId, updated);
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

    jobs.put(id, job);
    #ok(id)
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Authorize a Sensor canister principal to call createSensorJob().
  public shared(msg) func addSensorCanister(sensor: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    authorizedSensors := Array.append(authorizedSensors, [sensor]);
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.append(adminListEntries, [newAdmin]);
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
    var pending   = 0;
    var completed = 0;
    var verified  = 0;
    var diy       = 0;

    for (j in jobs.vals()) {
      if (j.isDiy) { diy += 1 };
      switch (j.status) {
        case (#Pending)   { pending   += 1 };
        case (#Completed) { completed += 1 };
        case (#Verified)  { verified  += 1 };
        case _            {};
      };
    };

    {
      totalJobs     = jobs.size();
      pendingJobs   = pending;
      completedJobs = completed;
      verifiedJobs  = verified;
      diyJobs       = diy;
      isPaused;
    }
  };
}
