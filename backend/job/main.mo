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
import ServiceTypes "../shared/ServiceType";
import Notify       "../shared/Notify";
import Index        "../shared/Index";
import Uuid         "../shared/Uuid";

persistent actor Job {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type ServiceType = ServiceTypes.ServiceType;

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
    contractorPrincipal: ?Principal; // M-12: optional lock to one redeemer; null = bearer link (the guest-contractor flow — createInviteToken always issues these)
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

  /// Legacy sequential counter. New job IDs are random RFC 4122 v4 UUIDs
  /// (see newJobId); kept so the stable signature is unchanged. Existing
  /// "JOB_<n>" IDs stay valid.
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
  /// Currently unused: the product has no per-tier job cap (see CLAUDE.md
  /// tier table); storage is bounded by MAX_JOBS_PER_PROPERTY instead.
  private var payCanisterId:      Text        = "";

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let jobs        = Map.empty<Text, Job>();
  private let inviteTokens = Map.empty<Text, InviteToken>();
  /// R2: jobId → was the contractor who signed a VERIFIED contractor profile
  /// (contractor.isVerified) at signing time? Kept beside `jobs` because a new
  /// field on Job (stored in a Map) is not stable-compatible, even as ?T.
  ///   absent  → no contractor signature recorded since this field existed:
  ///             DIY jobs, admin builder imports, and jobs that were already
  ///             verified before the upgrade. These keep counting as before.
  ///   ?true   → verified contractor signed; counts as a verified job.
  ///   ?false  → unverified contractor signed; the job is still dual-signed
  ///             (#Verified) but does NOT count toward scores, certificates
  ///             or report verified-job counts (see countsAsVerified).
  /// The contractor canister flips entries to true when an admin verifies
  /// the contractor (refreshContractorAttestation).
  private let contractorAttest = Map.empty<Text, Bool>();
  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();

  // Secondary indexes over `jobs` (transient, rebuilt on every upgrade).
  // Writes go through putJob / Index.delete so they stay in step.
  private transient let jobsByProperty   = Index.empty();
  private transient let jobsByHomeowner  = Index.empty();
  private transient let jobsByContractor = Index.empty();
  private transient let jobIndexes : [Index.Keyed<Job>] = Index.indexed<Job>(jobs, [
    (jobsByProperty,   func(j : Job) : ?Text { ?j.propertyId }),
    (jobsByHomeowner,  func(j : Job) : ?Text { ?Principal.toText(j.homeowner) }),
    (jobsByContractor, func(j : Job) : ?Text { Option.map(j.contractor, Principal.toText) }),
  ]);

  private func putJob(j : Job) { Index.put(jobs, jobIndexes, j.id, j) };

  /// Push-notification outbox read by the notification relay (see
  /// shared/Notify.mo). notifierEntries are the principals allowed to read it.
  private let notifyLog       = Map.empty<Nat, Notify.Event>();
  private var notifyLatestSeq : Nat         = 0;
  private var notifierEntries : [Principal] = [];

  private func countError(method : Text) {
    let prev = Option.get(Map.get(errsByMethod, Text.compare, method), 0);
    Map.add(errsByMethod, Text.compare, method, prev + 1);
  };

  // ─── Constants ───────────────────────────────────────────────────────────────

  /// Maximum job amount in cents ($1,000,000). Prevents runaway values in stable storage.
  private transient let MAX_JOB_AMOUNT_CENTS : Nat = 100_000_000;

  /// M-1: hard cap on job records per property (storage-exhaustion guard).
  private transient let MAX_JOBS_PER_PROPERTY : Nat = 2_000;

  /// M-9: caps on open contractor proposals (#PendingHomeownerApproval).
  private transient let MAX_PENDING_PROPOSALS_PER_CONTRACTOR : Nat = 3;   // per property
  private transient let MAX_PENDING_PROPOSALS_PER_PROPERTY   : Nat = 10;

  private transient let MAX_PERMIT_CHARS : Nat = 100;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection, §enterprise/#46) ────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();

  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private transient let ONE_MINUTE_NS       : Int = 60_000_000_000;
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

  private func isNotifier(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(notifierEntries, func(n) { n == p }))
  };

  /// Tell the homeowner a job is waiting for their signature.
  private func notifyAwaitingSignature(job: Job) {
    notifyLatestSeq := Notify.record(
      notifyLog, notifyLatestSeq, "job_awaiting_signature", ?job.homeowner, job.id, job.title
    );
  };

  /// Tell the homeowner their job is now fully verified, when the other
  /// party's signature completed it (they already know when they sign last).
  private func notifyJobVerified(job: Job) {
    notifyLatestSeq := Notify.record(
      notifyLog, notifyLatestSeq, "job_verified", ?job.homeowner, job.id, job.title
    );
  };

  /// Tell the homeowner a critical sensor reading opened a job for them.
  private func notifySensorAlert(job: Job) {
    notifyLatestSeq := Notify.record(
      notifyLog, notifyLatestSeq, "sensor_alert", ?job.homeowner, job.id, job.title
    );
  };

  /// Tell the linked contractor the homeowner has signed and is waiting on them.
  private func notifyAwaitingContractorSignature(job: Job, contractor: Principal) {
    notifyLatestSeq := Notify.record(
      notifyLog, notifyLatestSeq, "job_awaiting_contractor_signature", ?contractor, job.id, job.title
    );
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

  /// New job ID: a random RFC 4122 v4 UUID (owner requirement — IDs must not
  /// be sequential or enumerable). Async because it draws IC randomness, so
  /// every caller re-checks any state it relies on after this await.
  private func newJobId() : async Text {
    Uuid.fromBlob(await Random.blob())
  };

  /// True when `p` has any role (owner / co-owner / manager / viewer) on the
  /// property. Used to stop a homeowner from also acting as the contractor
  /// (M-2). Returns false when the property canister is not wired (local dev).
  private func isPropertyParty(propertyId: Text, p: Principal) : async Bool {
    if (Text.size(propCanisterId) == 0) return false;
    let propActor = actor(propCanisterId) : actor {
      isAuthorized : (Text, Principal, Bool) -> async Bool;
    };
    await propActor.isAuthorized(propertyId, p, false)
  };

  /// D-1/H-5: who may read a full Job record through the public queries.
  /// The job's homeowner and linked contractor, admins and trusted canisters.
  /// Property managers read jobs through getJobsForProperty, which checks the
  /// property canister (a query cannot make that call).
  private func canViewJob(j: Job, caller: Principal) : Bool {
    if (Principal.isAnonymous(caller)) return false;
    if (j.homeowner == caller) return true;
    switch (j.contractor) { case (?c) { if (c == caller) return true }; case null {} };
    isAdmin(caller) or isTrustedCanister(caller)
  };

  private func optTooLong(t: ?Text, max: Nat) : Bool {
    switch (t) { case (?v) { Text.size(v) > max }; case null { false } }
  };

  /// Pending (#PendingHomeownerApproval) proposals on a property: (total, by `contractor`).
  private func pendingProposalCounts(propertyId: Text, contractor: Principal) : (Nat, Nat) {
    var total = 0;
    var mine  = 0;
    for (j in Index.records(jobsByProperty, propertyId, jobs)) {
      if (j.status == #PendingHomeownerApproval) {
        total += 1;
        if (j.contractor == ?contractor) mine += 1;
      };
    };
    (total, mine)
  };

  /// Text label for a ServiceType, used where it crosses a canister boundary
  /// as Text (the contractor canister, job snapshots).
  private func serviceTypeText(s: ServiceType) : Text { ServiceTypes.toText(s) };

  /// R2: a verified job counts toward scores / certificates / reports only when
  /// it is DIY (homeowner-only), or its contractor signature came from a
  /// verified contractor profile. Absent entries (pre-R2 history, admin
  /// imports) keep counting so no historical record silently changes.
  private func countsAsVerified(j: Job) : Bool {
    if (not j.verified) return false;
    if (j.isDiy) return true;
    switch (Map.get(contractorAttest, Text.compare, j.id)) {
      case null   { true };
      case (?ok)  { ok };
    }
  };

  /// R2: look up `p` in the contractor canister.
  /// null = contractor canister not wired (local dev / isolated tests);
  /// ?(hasProfile, isVerified) otherwise. Fails closed: a failed call reads
  /// as "no profile, not verified".
  private func contractorStatus(p: Principal) : async ?(Bool, Bool) {
    if (Text.size(contrCanisterId) == 0) return null;
    let contrActor = actor(contrCanisterId) : actor {
      getContractorStats : query (Principal) -> async ?{ isVerified : Bool };
    };
    try {
      switch (await contrActor.getContractorStats(p)) {
        case null    { ?(false, false) };
        case (?st)   { ?(true, st.isVerified) };
      }
    } catch (_) { ?(false, false) }
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
    if (optTooLong(contractorName, 200))           return #err(#InvalidInput("contractorName exceeds 200 characters"));
    if (optTooLong(permitNumber, MAX_PERMIT_CHARS)) return #err(#InvalidInput("permitNumber exceeds 100 characters"));
    if (optTooLong(sourceQuoteId, 100))            return #err(#InvalidInput("sourceQuoteId exceeds 100 characters"));

    // M-1: caller must have write access (owner / co-owner / manager) to the
    // property. checkPropertyAuth falls back to "allowed" only when the
    // property canister is not wired (local dev / isolated tests).
    if (not isAdmin(msg.caller)) {
      let ok = await checkPropertyAuth(propertyId, msg.caller, msg.caller, true);
      if (not ok) return #err(#NotAuthorized);
    };

    let id  = await newJobId();
    let now = Time.now();

    // State checks after the awaits above (TOCTOU).
    if (Index.count(jobsByProperty, propertyId) >= MAX_JOBS_PER_PROPERTY)
      return #err(#TierLimitReached("This property has reached the maximum number of job records"));
    if (Map.get(jobs, Text.compare, id) != null) return #err(#InvalidInput("ID collision, retry"));

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

    putJob(job);
    #ok(job)
  };

  /// Fetch a single job by ID.
  /// D-1/H-5: only the job's homeowner, its linked contractor, admins and
  /// trusted canisters get the record; everyone else gets #NotFound (so the
  /// call does not reveal whether the ID exists).
  public query(msg) func getJob(jobId: Text) : async Result.Result<Job, Error> {
    switch (Map.get(jobs, Text.compare, jobId)) {
      case null { #err(#NotFound) };
      case (?j) { if (canViewJob(j, msg.caller)) #ok(j) else #err(#NotFound) };
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
      Index.records(jobsByProperty, propertyId, jobs)
    );
    #ok(matches)
  };

  /// Returns a lightweight snapshot of all jobs for a property, suitable for
  /// cross-canister consumption by the market canister's computePropertyScore.
  public query func getJobSnapshotsForProperty(propertyId: Text) : async [JobSnapshot] {
    let secsPerYear : Nat = 31_536_000;
    Iter.toArray(Iter.map<Job, JobSnapshot>(
      Index.records(jobsByProperty, propertyId, jobs),
      func(j: Job) : JobSnapshot {
        let secsSince1970 = Int.abs(j.completedDate) / 1_000_000_000;
        {
          serviceType   = serviceTypeText(j.serviceType);
          completedYear = 1970 + secsSince1970 / secsPerYear;
          amountCents   = j.amount;
          isDiy         = j.isDiy;
          isVerified    = countsAsVerified(j);
        }
      }
    ))
  };

  /// R2: ids of this property's dual-signed jobs whose contractor signature
  /// came from an UNVERIFIED contractor profile. Those jobs are excluded from
  /// scores, certificates and report verified-job counts. Read by the report
  /// canister and by the frontend (to label them).
  public query func getUnattestedJobIds(propertyId: Text) : async [Text] {
    Iter.toArray(Iter.map<Job, Text>(
      Iter.filter<Job>(Index.records(jobsByProperty, propertyId, jobs), func(j: Job) : Bool {
        j.verified and not countsAsVerified(j)
      }),
      func(j: Job) : Text { j.id }
    ))
  };

  /// Returns all jobs whose homeowner field matches the given principal.
  /// D-1/H-5: caller-scoped — only that principal itself, admins and trusted
  /// canisters get the list; anyone else gets [].
  public query(msg) func getJobsByOwner(owner: Principal) : async [Job] {
    if (Principal.isAnonymous(msg.caller)) return [];
    if (msg.caller != owner and not isAdmin(msg.caller) and not isTrustedCanister(msg.caller)) return [];
    Iter.toArray(
      Index.records(jobsByHomeowner, Principal.toText(owner), jobs)
    )
  };

  /// Fetch jobs where the caller is the linked contractor and has not yet signed.
  public query(msg) func getJobsPendingMySignature() : async [Job] {
    Iter.toArray(Iter.filter(Index.records(jobsByContractor, Principal.toText(msg.caller), jobs), func(j: Job) : Bool {
      not j.contractorSigned and not j.verified
    }))
  };

  /// Fetch the caller's own jobs sourced via a HomeGentic quote request — the
  /// bids they won. Contractor-scoped counterpart to getReferralJobs (which is
  /// admin-only and returns every contractor's jobs). Backs the Contractor Plan
  /// & Billing fee ledger.
  public query(msg) func getMyReferralJobs() : async [Job] {
    Iter.toArray(Iter.filter(Index.records(jobsByContractor, Principal.toText(msg.caller), jobs), func(j: Job) : Bool {
      switch (j.sourceQuoteId) {
        case (?qid) { Text.size(qid) > 0 };
        case null   { false };
      }
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

        // Re-read fresh after the await above — a concurrent call (verifyJob,
        // linkContractor, another updateJobStatus) could have already mutated
        // this job while this call was suspended waiting on checkPropertyAuth.
        switch (Map.get(jobs, Text.compare, jobId)) {
          case null { return #err(#NotFound) };
          case (?fresh) {
            if (fresh.verified) return #err(#AlreadyVerified);

            let updated: Job = {
              id               = fresh.id;
              propertyId       = fresh.propertyId;
              homeowner        = fresh.homeowner;
              contractor       = fresh.contractor;
              title            = fresh.title;
              serviceType      = fresh.serviceType;
              description      = fresh.description;
              contractorName   = fresh.contractorName;
              amount           = fresh.amount;
              completedDate    = fresh.completedDate;
              permitNumber     = fresh.permitNumber;
              warrantyMonths   = fresh.warrantyMonths;
              isDiy            = fresh.isDiy;
              status;
              verified         = fresh.verified;
              homeownerSigned  = fresh.homeownerSigned;
              contractorSigned = fresh.contractorSigned;
              createdAt        = fresh.createdAt;
              sourceQuoteId    = fresh.sourceQuoteId;
            };
            putJob(updated);
            #ok(updated)
          };
        }
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
        // M-2: the contractor must be a different party — not the caller, the
        // job's homeowner, or anyone with a role on the property — otherwise
        // the homeowner could complete the "dual" signature alone.
        if (Principal.isAnonymous(contractorPrincipal) or contractorPrincipal == msg.caller
            or contractorPrincipal == existing.homeowner)
          return #err(#InvalidInput("The contractor must be a different person from the homeowner"));
        let authOk = await checkPropertyAuth(existing.propertyId, existing.homeowner, msg.caller, true);
        if (not authOk) return #err(#NotAuthorized);
        if (await isPropertyParty(existing.propertyId, contractorPrincipal))
          return #err(#InvalidInput("The contractor must be a different person from the homeowner"));
        // R2: only principals with a contractor profile can be linked (fails
        // closed if the contractor canister errors; skipped only when it is
        // not wired, i.e. local dev).
        switch (await contractorStatus(contractorPrincipal)) {
          case (?(false, _)) { return #err(#InvalidInput("That principal has no contractor profile")) };
          case _ {};
        };

        // Re-read fresh after the await above — a concurrent call could have
        // already verified or otherwise mutated this job while this call was
        // suspended waiting on checkPropertyAuth.
        switch (Map.get(jobs, Text.compare, jobId)) {
          case null { return #err(#NotFound) };
          case (?fresh) {
            if (fresh.verified) return #err(#AlreadyVerified);
            if (fresh.isDiy) return #err(#InvalidInput("Cannot link contractor to a DIY job"));

            let updated: Job = {
              id               = fresh.id;
              propertyId       = fresh.propertyId;
              homeowner        = fresh.homeowner;
              contractor       = ?contractorPrincipal;
              title            = fresh.title;
              serviceType      = fresh.serviceType;
              description      = fresh.description;
              contractorName   = fresh.contractorName;
              amount           = fresh.amount;
              completedDate    = fresh.completedDate;
              permitNumber     = fresh.permitNumber;
              warrantyMonths   = fresh.warrantyMonths;
              isDiy            = fresh.isDiy;
              status           = fresh.status;
              verified         = fresh.verified;
              homeownerSigned  = fresh.homeownerSigned;
              contractorSigned = fresh.contractorSigned;
              createdAt        = fresh.createdAt;
              sourceQuoteId    = fresh.sourceQuoteId;
            };
            putJob(updated);
            if (fresh.homeownerSigned and not fresh.contractorSigned) {
              notifyAwaitingContractorSignature(updated, contractorPrincipal);
            };
            #ok(updated)
          };
        }
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

        // R2: record whether the contractor signature comes from a verified
        // contractor profile — when the contractor signs now, or when the
        // homeowner completes a job whose contractor signed before R2.
        let attestNow : ?Bool = if (existing.isDiy) null else {
          let needed = isContractor
            or Map.get(contractorAttest, Text.compare, jobId) == null;
          switch (existing.contractor) {
            case (?con) {
              if (not needed) null else switch (await contractorStatus(con)) {
                case null          { null };
                case (?(_, isVer)) { ?isVer };
              }
            };
            case null { null };
          }
        };

        // Re-read fresh after the (conditional) await above — a concurrent
        // verifyJob call from the other party could have already recorded
        // its signature while this call was suspended waiting on
        // checkPropertyAuth. Building newHomeownerSigned/newContractorSigned
        // from the stale pre-await snapshot would let this write clobber the
        // other party's signature instead of combining with it.
        let existing2 = switch (Map.get(jobs, Text.compare, jobId)) {
          case null   { return #err(#NotFound) };
          case (?job) { job };
        };
        if (existing2.verified) return #err(#AlreadyVerified);
        // The linked contractor may have changed while this call awaited.
        if (existing2.contractor != existing.contractor) return #err(#InvalidInput("Job changed, retry"));

        let newHomeownerSigned  = existing2.homeownerSigned  or isHomeowner;
        let newContractorSigned = existing2.contractorSigned or isContractor;

        // DIY: only homeowner signature needed.
        // Contractor: both signatures needed.
        let fullyVerified = if (existing2.isDiy) {
          newHomeownerSigned
        } else {
          newHomeownerSigned and newContractorSigned
        };

        let updated: Job = {
          id               = existing2.id;
          propertyId       = existing2.propertyId;
          homeowner        = existing2.homeowner;
          contractor       = existing2.contractor;
          title            = existing2.title;
          serviceType      = existing2.serviceType;
          description      = existing2.description;
          contractorName   = existing2.contractorName;
          amount           = existing2.amount;
          completedDate    = existing2.completedDate;
          permitNumber     = existing2.permitNumber;
          warrantyMonths   = existing2.warrantyMonths;
          isDiy            = existing2.isDiy;
          status           = if (fullyVerified) #Verified else existing2.status;
          verified         = fullyVerified;
          homeownerSigned  = newHomeownerSigned;
          contractorSigned = newContractorSigned;
          createdAt        = existing2.createdAt;
          sourceQuoteId    = existing2.sourceQuoteId;
        };
        putJob(updated);
        switch (attestNow) {
          case (?ok) {
            if (isContractor or (fullyVerified and Map.get(contractorAttest, Text.compare, jobId) == null))
              Map.add(contractorAttest, Text.compare, jobId, ok);
          };
          case null {};
        };

        if (isContractor and not existing2.contractorSigned and not newHomeownerSigned) {
          notifyAwaitingSignature(updated);
        };
        if (fullyVerified and isContractor) {
          notifyJobVerified(updated);
        };
        if (isHomeowner and not existing2.homeownerSigned and not newContractorSigned) {
          switch (existing2.contractor) {
            case (?con) { notifyAwaitingContractorSignature(updated, con) };
            case null {};  // DIY, or no contractor linked yet — linkContractor notifies later
          };
        };

        // Notify contractor canister when job becomes fully verified
        if (fullyVerified and Text.size(contrCanisterId) > 0) {
          switch (existing2.contractor) {
            case (?con) {
              let svcText = serviceTypeText(existing2.serviceType);
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
                ignore await contrActor.recordJobVerified(con, jobId, svcText, existing2.homeowner);
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

    let id  = await newJobId();
    let now = Time.now();
    if (Index.count(jobsByProperty, propertyId) >= MAX_JOBS_PER_PROPERTY) return #err("Job limit reached for property");
    if (Map.get(jobs, Text.compare, id) != null) return #err("ID collision, retry");

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

    putJob(job);
    notifySensorAlert(job);
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
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (not Principal.isController(msg.caller)) return;  // only a controller may open the bootstrap
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

  // ─── Notification outbox ────────────────────────────────────────────────────

  /// Allow a principal (the notification relay's identity) to read the outbox.
  public shared(msg) func addNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isNotifier(p)) {
      notifierEntries := Array.concat(notifierEntries, [p]);
    };
    #ok(())
  };

  public shared(msg) func removeNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    notifierEntries := Array.filter<Principal>(notifierEntries, func(n) { n != p });
    #ok(())
  };

  /// Outbox events with seq > afterSeq, oldest first (at most 200 per call).
  /// Notifiers and admins only.
  public query(msg) func getNotificationEvents(afterSeq: Nat, limit: Nat) : async Result.Result<Notify.Page, Error> {
    if (not isNotifier(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Notify.page(notifyLog, notifyLatestSeq, afterSeq, limit))
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

  /// R2: called by the contractor canister when an admin verifies (or
  /// un-verifies) a contractor, so that contractor's recorded signatures start
  /// (or stop) counting. Only touches jobs that already have an attestation
  /// entry. Contractor canister or admin only. Returns the entries changed.
  public shared(msg) func refreshContractorAttestation(contractor: Principal, isVerified: Bool) : async Result.Result<Nat, Error> {
    let fromContr = Text.size(contrCanisterId) > 0 and Principal.toText(msg.caller) == contrCanisterId;
    if (not fromContr and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    var changed : Nat = 0;
    for (j in Index.records(jobsByContractor, Principal.toText(contractor), jobs)) {
      switch (Map.get(contractorAttest, Text.compare, j.id)) {
        case (?cur) {
          if (cur != isVerified) {
            Map.add(contractorAttest, Text.compare, j.id, isVerified);
            changed += 1;
          };
        };
        case null {};
      };
    };
    #ok(changed)
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

    for (j in Index.records(jobsByProperty, propertyId, jobs)) {
      if (countsAsVerified(j)) {
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
  /// • Jobs are pre-verified — the importer attests to the work.
  /// • Both homeownerSigned and contractorSigned are set to true.
  /// • The `homeowner` field is set to the property's current owner (or the
  ///   caller when the property canister is not wired).
  ///
  /// J-1/H-2: because these jobs skip the dual signature, only admins and
  /// trusted canisters may call this. The auth canister has no cross-canister
  /// role lookup (hasRole only answers for msg.caller), so a self-declared
  /// Builder role cannot be checked here; builder imports go through an
  /// admin / back-office identity.
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
    if (not isAdmin(msg.caller) and not isTrustedCanister(msg.caller)) return #err(#NotAuthorized);

    if (Text.size(propertyId)    == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(contractorName) == 0) return #err(#InvalidInput("contractorName is required"));
    if (Text.size(contractorName) > 200) return #err(#InvalidInput("contractorName exceeds 200 characters"));
    if (amount == 0)                   return #err(#InvalidInput("amount must be greater than 0"));
    if (amount > MAX_JOB_AMOUNT_CENTS) return #err(#InvalidInput("amount exceeds maximum of 100,000,000 cents ($1,000,000)"));
    if (Text.size(description)   == 0) return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description)   > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (optTooLong(permitNumber, MAX_PERMIT_CHARS)) return #err(#InvalidInput("permitNumber exceeds 100 characters"));
    if (completedDate > Time.now())    return #err(#InvalidInput("completedDate cannot be in the future"));

    // Attribute the job to the property's current owner so they can read it.
    let homeowner : Principal = if (Text.size(propCanisterId) > 0) {
      let propActor = actor(propCanisterId) : actor {
        getPropertyOwner : (Text) -> async ?Principal;
      };
      switch (await propActor.getPropertyOwner(propertyId)) {
        case null     { return #err(#NotFound) };
        case (?owner) { owner };
      };
    } else { msg.caller };

    let id  = await newJobId();
    let now = Time.now();
    if (Index.count(jobsByProperty, propertyId) >= MAX_JOBS_PER_PROPERTY)
      return #err(#TierLimitReached("This property has reached the maximum number of job records"));
    if (Map.get(jobs, Text.compare, id) != null) return #err(#InvalidInput("ID collision, retry"));

    let job: Job = {
      id;
      propertyId;
      homeowner;
      contractor       = null;
      title            = contractorName;
      serviceType;
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

    putJob(job);
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
      // R2: when a contractor is already linked to the job the invite is
      // bound to that profile; otherwise it is a bearer link (guest flow).
      contractorPrincipal = job.contractor;
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
  /// principal, only that principal may redeem it. Tokens without one are bearer links —
  /// the guest-contractor flow, where the homeowner can't know the signer's principal.
  /// Sets contractorSigned = true; if homeownerSigned is also true, auto-verifies.
  ///
  /// #518 — the redeemer now supplies identity fields (name/phone/email,
  /// optional license number). These are cross-called to the contractor
  /// canister to create-or-link a ContractorProfile for the redeeming
  /// principal (admin-approval-gated, isVerified defaults false — same
  /// unverified-tier weight every new contractor starts at; NOT a live
  /// license-registry check, see #518's non-goals) before the job is
  /// mutated, so a rejected identity never burns the single-use token.
  public shared(msg) func redeemInviteToken(
    token:          Text,
    contractorName: Text,
    phone:          Text,
    email:          Text,
    licenseNumber:  ?Text,
  ) : async Result.Result<Job, Error> {
    // M-2: anonymous / pause / rate-limit checks (inspect is not a boundary).
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(token) > 100) return #err(#NotFound);
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
      case null {}; // bearer link (guest contractor) — the link itself is the credential
    };

    let job = switch (Map.get(jobs, Text.compare, invite.jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };

    if (job.contractorSigned)             return #err(#AlreadyVerified);

    if (Text.size(contractorName) == 0) return #err(#InvalidInput("contractorName cannot be empty"));
    if (Text.size(phone) == 0)          return #err(#InvalidInput("phone cannot be empty"));
    if (Text.size(email) == 0)          return #err(#InvalidInput("email cannot be empty"));
    if (Text.size(contractorName) > 200 or Text.size(phone) > 50 or Text.size(email) > 254
        or optTooLong(licenseNumber, 100))
      return #err(#InvalidInput("contractor details are too long"));

    // M-2: the signer must be a different party from the homeowner side.
    // A job already linked to a contractor can only be signed by that contractor.
    if (msg.caller == job.homeowner) return #err(#NotAuthorized);
    switch (job.contractor) {
      case (?linked) { if (msg.caller != linked) return #err(#NotAuthorized) };
      case null {};
    };
    if (await isPropertyParty(job.propertyId, msg.caller)) return #err(#NotAuthorized);

    let svcText = serviceTypeText(job.serviceType);

    // Identity capture happens BEFORE any job/token mutation — a rejected
    // identity (bad format, contractor canister down) must not burn the
    // single-use invite token.
    if (Text.size(contrCanisterId) > 0) {
      type ContrError = {
        #NotFound; #AlreadyExists; #NotAuthorized;
        #Paused; #RateLimitExceeded; #InvalidInput : Text;
      };
      let contrActor = actor(contrCanisterId) : actor {
        createOrLinkGuestProfile : (Principal, Text, Text, Text, ?Text, Text, Text) -> async { #ok : (); #err : ContrError };
      };
      switch (await contrActor.createOrLinkGuestProfile(msg.caller, contractorName, phone, email, licenseNumber, svcText, job.id)) {
        case (#err(_)) { return #err(#InvalidInput("Could not verify contractor identity — check name/phone/email/license format")) };
        case (#ok(())) {};
      };
    };

    // R2: the redeemer must hold a contractor profile (the guest flow above
    // creates one, unverified). Record whether it is admin-verified: only a
    // verified profile's signature counts toward scores and certificates.
    let attest : ?Bool = switch (await contractorStatus(msg.caller)) {
      case null              { null };   // contractor canister not wired (local dev)
      case (?(false, _))     { return #err(#InvalidInput("A contractor profile is required to sign this job")) };
      case (?(true, isVer))  { ?isVer };
    };

    // Re-read fresh after the await above — a concurrent call could have
    // already redeemed this same token (or otherwise mutated the job) while
    // this call was suspended waiting on the contractor canister.
    let freshInvite = switch (Map.get(inviteTokens, Text.compare, token)) {
      case null    { return #err(#NotFound) };
      case (?i)    { i };
    };
    if (freshInvite.usedAt != null)         return #err(#InvalidInput("This invite link has already been used"));
    let freshJob = switch (Map.get(jobs, Text.compare, freshInvite.jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };
    if (freshJob.contractorSigned)          return #err(#AlreadyVerified);
    if (freshJob.verified)                  return #err(#AlreadyVerified);
    if (msg.caller == freshJob.homeowner)   return #err(#NotAuthorized);
    switch (freshJob.contractor) {
      case (?linked) { if (msg.caller != linked) return #err(#NotAuthorized) };
      case null {};
    };
    switch (freshInvite.contractorPrincipal) {
      case (?intended) { if (msg.caller != intended) return #err(#NotAuthorized) };
      case null {};
    };

    let bothSigned = freshJob.homeownerSigned;
    let updated : Job = {
      id               = freshJob.id;
      propertyId       = freshJob.propertyId;
      homeowner        = freshJob.homeowner;
      // Only fill contractor if unset — never clobber a prior linkContractor() call.
      contractor       = switch (freshJob.contractor) { case null { ?msg.caller }; case (?c) { ?c } };
      title            = freshJob.title;
      serviceType      = freshJob.serviceType;
      description      = freshJob.description;
      contractorName   = freshJob.contractorName;
      amount           = freshJob.amount;
      completedDate    = freshJob.completedDate;
      permitNumber     = freshJob.permitNumber;
      warrantyMonths   = freshJob.warrantyMonths;
      isDiy            = freshJob.isDiy;
      status           = if (bothSigned) #Verified else freshJob.status;
      verified         = bothSigned;
      homeownerSigned  = freshJob.homeownerSigned;
      contractorSigned = true;
      createdAt        = freshJob.createdAt;
      sourceQuoteId    = freshJob.sourceQuoteId;
    };
    putJob(updated);
    switch (attest) {
      case (?ok) { Map.add(contractorAttest, Text.compare, updated.id, ok) };
      case null {};
    };

    // Mark token as used
    let usedInvite : InviteToken = {
      token               = freshInvite.token;
      jobId               = freshInvite.jobId;
      propertyAddress     = freshInvite.propertyAddress;
      createdAt           = freshInvite.createdAt;
      expiresAt           = freshInvite.expiresAt;
      usedAt              = ?Time.now();
      contractorPrincipal = freshInvite.contractorPrincipal;
    };
    Map.add(inviteTokens, Text.compare, token, usedInvite);

    if (bothSigned) notifyJobVerified(updated) else notifyAwaitingSignature(updated);

    // Notify contractor canister when the job becomes fully verified —
    // mirrors verifyJob()'s cross-call exactly, same try/catch so a trap or
    // network error doesn't roll back the already-committed signature.
    if (bothSigned and Text.size(contrCanisterId) > 0) {
      type ContrError2 = {
        #NotFound; #AlreadyExists; #NotAuthorized;
        #Paused; #RateLimitExceeded; #InvalidInput : Text;
      };
      let contrActor2 = actor(contrCanisterId) : actor {
        recordJobVerified : (Principal, Text, Text, Principal) -> async { #ok : (); #err : ContrError2 };
      };
      try {
        ignore await contrActor2.recordJobVerified(msg.caller, updated.id, svcText, updated.homeowner);
      } catch (_e) {};
    };

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
    if (optTooLong(permitNumber, MAX_PERMIT_CHARS)) return #err(#InvalidInput("permitNumber exceeds 100 characters"));
    if (completedDate > Time.now())                 return #err(#InvalidInput("completedDate cannot be in the future"));

    // M-9: cheap local caps first — no more than a few open proposals per
    // contractor per property, and a bounded number per property overall.
    let (pendingTotal0, pendingMine0) = pendingProposalCounts(propertyId, msg.caller);
    if (pendingMine0 >= MAX_PENDING_PROPOSALS_PER_CONTRACTOR or pendingTotal0 >= MAX_PENDING_PROPOSALS_PER_PROPERTY)
      return #err(#TierLimitReached("Too many pending proposals for this property"));

    // M-9: only registered contractors (a ContractorProfile exists for the
    // caller) may propose jobs. Fails closed if the contractor canister errors.
    // R2: also record whether that profile is admin-verified.
    let attest : ?Bool = if (isAdmin(msg.caller)) null else {
      switch (await contractorStatus(msg.caller)) {
        case null             { null };
        case (?(false, _))    { return #err(#NotAuthorized) };
        case (?(true, isVer)) { ?isVer };
      }
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

    // Contractor may not propose on their own property (nor on one they manage)
    if (homeowner == msg.caller) {
      return #err(#InvalidInput("You cannot propose a job on a property you own"))
    };
    if (await isPropertyParty(propertyId, msg.caller)) {
      return #err(#InvalidInput("You cannot propose a job on a property you own"))
    };

    let id  = await newJobId();
    let now = Time.now();

    // Re-check the caps after the awaits above (TOCTOU).
    let (pendingTotal, pendingMine) = pendingProposalCounts(propertyId, msg.caller);
    if (pendingMine >= MAX_PENDING_PROPOSALS_PER_CONTRACTOR or pendingTotal >= MAX_PENDING_PROPOSALS_PER_PROPERTY)
      return #err(#TierLimitReached("Too many pending proposals for this property"));
    if (Index.count(jobsByProperty, propertyId) >= MAX_JOBS_PER_PROPERTY)
      return #err(#TierLimitReached("This property has reached the maximum number of job records"));
    if (Map.get(jobs, Text.compare, id) != null) return #err(#InvalidInput("ID collision, retry"));

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

    putJob(job);
    switch (attest) {
      case (?ok) { Map.add(contractorAttest, Text.compare, id, ok) };
      case null {};
    };
    // M-9: the push text is fixed, not the contractor-supplied title, so a
    // proposal can't carry phishing text into the homeowner's notifications.
    notifyLatestSeq := Notify.record(
      notifyLog, notifyLatestSeq, "job_awaiting_signature", ?job.homeowner, job.id,
      "New " # serviceTypeText(job.serviceType) # " job proposal awaiting your review"
    );
    #ok(job)
  };

  /// Return all proposals awaiting the caller's (homeowner's) approval.
  /// Only the property owner sees their own pending proposals.
  public query(msg) func getPendingProposals() : async [Job] {
    Iter.toArray(Iter.filter(Index.records(jobsByHomeowner, Principal.toText(msg.caller), jobs), func(j: Job) : Bool {
      j.status == #PendingHomeownerApproval
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
    // Re-read after the await (TOCTOU): the proposal may have been rejected meanwhile.
    let existing2 = switch (Map.get(jobs, Text.compare, jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { j };
    };
    if (existing2.status != #PendingHomeownerApproval) return #err(#InvalidInput("Job is not pending approval"));

    let updated : Job = {
      id               = existing2.id;
      propertyId       = existing2.propertyId;
      homeowner        = existing2.homeowner;
      contractor       = existing2.contractor;
      title            = existing2.title;
      serviceType      = existing2.serviceType;
      description      = existing2.description;
      contractorName   = existing2.contractorName;
      amount           = existing2.amount;
      completedDate    = existing2.completedDate;
      permitNumber     = existing2.permitNumber;
      warrantyMonths   = existing2.warrantyMonths;
      isDiy            = existing2.isDiy;
      status           = #Pending;
      verified         = false;
      homeownerSigned  = true;
      contractorSigned = true;
      createdAt        = existing2.createdAt;
      sourceQuoteId    = existing2.sourceQuoteId;
    };
    putJob(updated);
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
    switch (Map.get(jobs, Text.compare, jobId)) {
      case null    { return #err(#NotFound) };
      case (?j)    { if (j.status != #PendingHomeownerApproval) return #err(#InvalidInput("Job is not pending approval")) };
    };

    Index.delete(jobs, jobIndexes, jobId);
    Map.remove(contractorAttest, Text.compare, jobId);
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
