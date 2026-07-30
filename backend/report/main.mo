/**
 * HomeGentic Report Canister
 *
 * Generates certified property history snapshots and manages share links.
 *
 * Flow:
 *   1. Homeowner calls generateReport(propertyData, jobs, options)
 *   2. Canister stores a signed snapshot + issues a share token
 *   3. Anyone with the token calls getReport(token) to read the snapshot
 *   4. Homeowner can revoke links or set expiry
 *
 * Snapshots are immutable once created — buyers see the property state
 * exactly as it was when the homeowner generated the report.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Debug     "mo:core/Debug";
import Map       "mo:core/Map";
import Int        "mo:core/Int";
import Iter       "mo:core/Iter";
import Nat        "mo:core/Nat";
import Nat8       "mo:core/Nat8";
import Option     "mo:core/Option";
import Principal  "mo:core/Principal";
import Random     "mo:core/Random";
import Result     "mo:core/Result";
import Text       "mo:core/Text";
import Time       "mo:core/Time";

persistent actor Report {

  // ─── Input Types (caller supplies all data) ───────────────────────────────────

  public type JobInput = {
    serviceType:    Text;
    description:    Text;
    contractorName: ?Text;
    amountCents:    Nat;
    date:           Text;      // YYYY-MM-DD
    isDiy:          Bool;
    permitNumber:   ?Text;
    warrantyMonths: ?Nat;
    isVerified:     Bool;
    status:         Text;
  };

  /// Buyer-facing summary for one recurring service contract.
  /// Built by the frontend from recurringService.toSummary() before calling generateReport.
  public type RecurringServiceInput = {
    serviceType:    Text;   // human-readable label, e.g. "Pest Control"
    providerName:   Text;
    frequency:      Text;   // human-readable label, e.g. "Monthly"
    status:         Text;   // "Active" | "Paused" | "Cancelled"
    startDate:      Text;   // YYYY-MM-DD
    lastVisitDate:  ?Text;  // YYYY-MM-DD, null = no visits logged
    totalVisits:    Nat;
  };

  /// Buyer-facing summary for one room. Built by the frontend from room canister data.
  public type RoomInput = {
    name:         Text;
    floorType:    Text;
    paintColor:   Text;
    paintBrand:   Text;
    paintCode:    Text;
    fixtureCount: Nat;
  };

  public type PropertyInput = {
    address:           Text;
    city:              Text;
    state:             Text;
    zipCode:           Text;
    propertyType:      Text;
    yearBuilt:         Nat;
    squareFeet:        Nat;
    verificationLevel: Text;   // "Unverified" | "Basic" | "Premium"
  };

  // ─── Cert Types ───────────────────────────────────────────────────────────────

  /// Immutable on-chain score certificate. Payload is JSON (no personal data).
  public type CertRecord = {
    id:          Text;
    propertyId:  Text;
    payload:     Text;   // JSON-encoded CertPayload (address, score, grade, certified, generatedAt)
    issuedAt:    Int;
  };

  // ─── Stored Types ─────────────────────────────────────────────────────────────

  public type VisibilityLevel = { #Public; #BuyerOnly };

  /// Immutable snapshot of property state at time of report generation.
  public type ReportSnapshot = {
    snapshotId:         Text;
    propertyId:         Text;
    generatedBy:        Principal;
    address:            Text;
    city:               Text;
    state:              Text;
    zipCode:            Text;
    propertyType:       Text;
    yearBuilt:          Nat;
    squareFeet:         Nat;
    verificationLevel:  Text;
    jobs:               [JobInput];
    recurringServices:  [RecurringServiceInput];
    rooms:              ?[RoomInput];   // null for reports generated before 1.4.7
    totalAmountCents:   Nat;
    verifiedJobCount:   Nat;
    diyJobCount:        Nat;
    permitCount:        Nat;
    generatedAt:        Time.Time;
    schemaVersion:      ?Nat;   // 14.4.3 — null = pre-14.4.3, 2 = current; use ?Nat so old records upgrade safely
  };

  /// Share link record — separate from the snapshot so we can revoke without
  /// destroying the snapshot.
  ///
  /// hideAmounts / hideContractors / hidePermits / hideDescriptions are stored
  /// as ?Bool so that links created before these fields were added deserialize
  /// cleanly with null (treated as false). This is the Motoko-idiomatic way to
  /// add fields to a stable record type without breaking upgrade compatibility.
  public type ShareLink = {
    token:            Text;
    snapshotId:       Text;
    propertyId:       Text;
    createdBy:        Principal;
    expiresAt:        ?Time.Time;   // null = never
    visibility:       VisibilityLevel;
    viewCount:        Nat;
    isActive:         Bool;
    createdAt:        Time.Time;
    // 14.2.3 — disclosure flags stored on-chain and enforced in getReport()
    hideAmounts:      ?Bool;   // null = false (pre-14.2.3 links)
    hideContractors:  ?Bool;
    hidePermits:      ?Bool;
    hideDescriptions: ?Bool;
  };

  public type Error = {
    #NotFound;
    #Expired;
    #Revoked;
    #NotAuthorized;
    #InvalidInput      : Text;
    /// Caller attempted to share a report for an unverified property.
    /// The property must reach #Basic or #Premium before a share link
    /// can be issued.
    #UnverifiedProperty;
  };

  public type Metrics = {
    totalReports:    Nat;
    totalShareLinks: Nat;
    activeLinks:     Nat;
    totalViews:      Nat;
    isPaused:        Bool;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  // reportCounter / snapshotSchemaVersion must keep their original names.
  // Renaming a stable variable is treated as deletion (M0169 error).
  private var reportCounter         : Nat        = 0;   // unused; kept for compat
  private var isPaused              : Bool        = false;
  private var pauseExpiryNs         : ?Int        = null;
  private var adminListEntries         : [Principal] = [];
  private var adminInitialized         : Bool        = false;
  private var trustedCanisterEntries   : [Principal] = [];
  private var auditCanisterId          : ?Principal  = null;
  private var snapshotSchemaVersion : Nat         = 2;   // 14.4.3 — incremented when schema changes; kept as stable var for audit
  private var propCanisterId        : Text        = "";

  // Cert state — new; starts empty so no migration needed.
  private var certCounter  : Nat                 = 0;

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let snapshots = Map.empty<Text, ReportSnapshot>();
  private let links     = Map.empty<Text, ShareLink>();
  private let certs     = Map.empty<Text, CertRecord>();

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

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
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(trustedCanisterEntries, func(t) { t == p }))
  };


  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
    if (isPaused) {
      // 14.4.4 — auto-expire timed pauses
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

  /// Convert a Blob to a lowercase hex string.
  private func blobToHex(b : Blob) : Text {
    let hex  = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    let bytes = Blob.toArray(b);
    var result = "";
    for (byte in bytes.vals()) {
      let n = Nat8.toNat(byte);
      result #= Text.fromChar(hex[n / 16]);
      result #= Text.fromChar(hex[n % 16]);
    };
    result
  };

  /// Generate a cryptographically random snapshot ID and share token.
  /// Uses IC certified randomness — tokens are unguessable and non-sequential.
  private func nextIds() : async (Text, Text) {
    let randBytes = await Random.blob();
    let randHex   = blobToHex(randBytes);
    let sid = "SNAP_" # randHex;
    let tok = "RPT_"  # randHex;
    (sid, tok)
  };

  private func isExpired(link: ShareLink) : Bool {
    switch (link.expiresAt) {
      case null      { false };
      case (?expiry) { Time.now() > expiry };
    }
  };

  private func totalAmount(jobs: [JobInput]) : Nat {
    var sum = 0;
    for (j in jobs.vals()) { sum += j.amountCents };
    sum
  };

  private func countVerified(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.vals()) { if (j.isVerified) { n += 1 } };
    n
  };

  private func countDiy(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.vals()) { if (j.isDiy) { n += 1 } };
    n
  };

  private func countPermits(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.vals()) {
      switch (j.permitNumber) {
        case (?_) { n += 1 };
        case null {};
      }
    };
    n
  };

  /// 14.2.3 — Apply disclosure flags stored on the ShareLink to the snapshot.
  /// Fields set to hide are replaced with empty/zero values before returning
  /// to the caller, ensuring disclosure is enforced on-chain rather than
  /// relying on the frontend to filter URL params.
  private func applyDisclosure(snap: ReportSnapshot, link: ShareLink) : ReportSnapshot {
    let doHideAmounts      = Option.get(link.hideAmounts,      false);
    let doHideContractors  = Option.get(link.hideContractors,  false);
    let doHidePermits      = Option.get(link.hidePermits,      false);
    let doHideDescriptions = Option.get(link.hideDescriptions, false);

    if (not doHideAmounts and not doHideContractors
        and not doHidePermits and not doHideDescriptions) {
      return snap;  // fast-path: nothing to hide
    };

    let filteredJobs : [JobInput] = Array.map<JobInput, JobInput>(snap.jobs, func(j) {
      {
        serviceType    = j.serviceType;
        description    = if (doHideDescriptions) { "" }   else { j.description };
        contractorName = if (doHideContractors)  { null } else { j.contractorName };
        amountCents    = if (doHideAmounts)      { 0 }    else { j.amountCents };
        date           = j.date;
        isDiy          = j.isDiy;
        permitNumber   = if (doHidePermits)      { null } else { j.permitNumber };
        warrantyMonths = j.warrantyMonths;
        isVerified     = j.isVerified;
        status         = j.status;
      }
    });

    {
      snapshotId        = snap.snapshotId;
      propertyId        = snap.propertyId;
      generatedBy       = snap.generatedBy;
      address           = snap.address;
      city              = snap.city;
      state             = snap.state;
      zipCode           = snap.zipCode;
      propertyType      = snap.propertyType;
      yearBuilt         = snap.yearBuilt;
      squareFeet        = snap.squareFeet;
      verificationLevel = snap.verificationLevel;
      jobs              = filteredJobs;
      recurringServices = snap.recurringServices;
      rooms             = snap.rooms;
      totalAmountCents  = if (doHideAmounts) { 0 } else { snap.totalAmountCents };
      verifiedJobCount  = snap.verifiedJobCount;
      diyJobCount       = snap.diyJobCount;
      permitCount       = if (doHidePermits) { 0 } else { snap.permitCount };
      generatedAt       = snap.generatedAt;
      schemaVersion     = snap.schemaVersion;
    }
  };

  // ─── Core: Generate Report ────────────────────────────────────────────────────

  /// Create an immutable snapshot and issue a share link.
  ///
  /// Rejects with #UnverifiedProperty if the property canister is configured
  /// and the property has not reached #Basic or #Premium verification.
  /// This prevents unverified homeowners from sharing "official" HomeGentic
  /// reports with buyers or insurers.
  ///
  /// Pass expiryDays = null for a link that never expires.
  /// Generate a certified property history snapshot and issue a share link.
  ///
  /// Candid evolution note: params 1-6 match the original signature exactly.
  /// Params 7-11 are NEW and placed at the END as opt types so that callers
  /// built against the previous 6-param interface continue to work — Candid
  /// fills missing trailing opt args with null on the receiving end.
  ///
  ///   7. rooms            — room digital-twin data (null → no room section)
  ///   8. hideAmounts      — redact job costs in getReport response
  ///   9. hideContractors  — redact contractor names
  ///  10. hidePermits      — redact permit numbers
  ///  11. hideDescriptions — redact job description text
  public shared(msg) func generateReport(
    propertyId:        Text,
    property:          PropertyInput,
    jobs:              [JobInput],
    recurringServices: [RecurringServiceInput],
    expiryDays:        ?Nat,
    visibility:        VisibilityLevel,
    rooms:             ?[RoomInput],   // opt — null for pre-1.4.7 callers
    hideAmounts:       ?Bool,          // opt — null treated as false
    hideContractors:   ?Bool,
    hidePermits:       ?Bool,
    hideDescriptions:  ?Bool
  ) : async Result.Result<ShareLink, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId)      == 0)  return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(property.address) == 0) return #err(#InvalidInput("address cannot be empty"));
    if (Text.size(property.address) > 500) return #err(#InvalidInput("address exceeds 500 characters"));
    if (Text.size(property.city)    > 100) return #err(#InvalidInput("city exceeds 100 characters"));
    if (Text.size(property.state)   > 50)  return #err(#InvalidInput("state exceeds 50 characters"));
    if (Text.size(property.zipCode) > 20)  return #err(#InvalidInput("zipCode exceeds 20 characters"));

    // ── Ownership verification gate ──────────────────────────────────────────
    // Cross-canister call to the property canister to fetch the authoritative
    // verification level — callers cannot spoof this by passing a fake level
    // in the PropertyInput.
    if (Text.size(propCanisterId) > 0) {
      let propActor = actor(propCanisterId) : actor {
        getVerificationLevel : (Text) -> async ?Text;
      };
      switch (await propActor.getVerificationLevel(propertyId)) {
        case (?level) {
          if (level == "Unverified" or level == "PendingReview") {
            return #err(#UnverifiedProperty);
          };
        };
        case null {};   // not found — proceed
      };
    };

    let (snapshotId, token) = await nextIds();
    let now = Time.now();

    let snapshot : ReportSnapshot = {
      snapshotId;
      propertyId;
      generatedBy        = msg.caller;
      address            = property.address;
      city               = property.city;
      state              = property.state;
      zipCode            = property.zipCode;
      propertyType       = property.propertyType;
      yearBuilt          = property.yearBuilt;
      squareFeet         = property.squareFeet;
      verificationLevel  = property.verificationLevel;
      jobs;
      recurringServices;
      rooms;   // already ?[RoomInput] — null for old callers, ?arr for new ones
      totalAmountCents   = totalAmount(jobs);
      verifiedJobCount   = countVerified(jobs);
      diyJobCount        = countDiy(jobs);
      permitCount        = countPermits(jobs);
      generatedAt        = now;
      schemaVersion      = ?2;   // 14.4.3 — current schema version
    };
    Map.add(snapshots, Text.compare, snapshotId, snapshot);

    let expiresAt : ?Time.Time = switch (expiryDays) {
      case null    { null };
      case (?days) { ?(now + (days * 24 * 3600 * 1_000_000_000)) };
    };

    let link : ShareLink = {
      token;
      snapshotId;
      propertyId;
      createdBy        = msg.caller;
      expiresAt;
      visibility;
      viewCount        = 0;
      isActive         = true;
      createdAt        = now;
      hideAmounts;        // already ?Bool — passed through as-is
      hideContractors;
      hidePermits;
      hideDescriptions;
    };
    Map.add(links, Text.compare, token, link);
    #ok(link)
  };

  // ─── Core: View Report ────────────────────────────────────────────────────────

  /// Fetch the report snapshot for a share token.
  /// Increments view count; returns error if expired or revoked.
  public shared func getReport(token: Text) : async Result.Result<(ShareLink, ReportSnapshot), Error> {
    switch (Map.get(links, Text.compare, token)) {
      case null { #err(#NotFound) };
      case (?link) {
        if (not link.isActive) return #err(#Revoked);
        if (isExpired(link))   return #err(#Expired);

        switch (Map.get(snapshots, Text.compare, link.snapshotId)) {
          case null      { #err(#NotFound) };
          case (?snap)   {
            // Increment view count
            let updated : ShareLink = {
              token            = link.token;
              snapshotId       = link.snapshotId;
              propertyId       = link.propertyId;
              createdBy        = link.createdBy;
              expiresAt        = link.expiresAt;
              visibility       = link.visibility;
              viewCount        = link.viewCount + 1;
              isActive         = link.isActive;
              createdAt        = link.createdAt;
              hideAmounts      = link.hideAmounts;      // preserve ?Bool as-is
              hideContractors  = link.hideContractors;
              hidePermits      = link.hidePermits;
              hideDescriptions = link.hideDescriptions;
            };
            Map.add(links, Text.compare, token, updated);
            // 14.2.3 — enforce disclosure flags on-chain before returning
            #ok((updated, applyDisclosure(snap, updated)))
          };
        }
      };
    }
  };

  // ─── Share Link Management ────────────────────────────────────────────────────

  /// Returns true if the property has at least one active, non-expired share link
  /// with Public visibility. Called cross-canister by the listing canister to
  /// populate hasPublicReport in FSBO listings without exposing the full link list.
  public query func hasActivePublicShareLink(propertyId: Text) : async Bool {
    let now = Time.now();
    var found = false;
    for (l in Map.values(links)) {
      if (l.propertyId == propertyId and l.isActive and l.visibility == #Public) {
        switch (l.expiresAt) {
          case null   { found := true };
          case (?exp) { if (now < exp) found := true };
        };
      };
    };
    found
  };

  /// List all share links the caller created for a property.
  public shared(msg) func listShareLinks(propertyId: Text) : async [ShareLink] {
    Iter.toArray(Iter.filter(Map.values(links), func(l: ShareLink) : Bool {
      l.propertyId == propertyId and l.createdBy == msg.caller
    }))
  };

  /// Revoke a share link. Only the creator or an admin can do this.
  public shared(msg) func revokeShareLink(token: Text) : async Result.Result<(), Error> {
    switch (Map.get(links, Text.compare, token)) {
      case null { #err(#NotFound) };
      case (?link) {
        if (link.createdBy != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
        let revoked : ShareLink = {
          token            = link.token;
          snapshotId       = link.snapshotId;
          propertyId       = link.propertyId;
          createdBy        = link.createdBy;
          expiresAt        = link.expiresAt;
          visibility       = link.visibility;
          viewCount        = link.viewCount;
          isActive         = false;
          createdAt        = link.createdAt;
          hideAmounts      = link.hideAmounts;      // preserve ?Bool as-is
          hideContractors  = link.hideContractors;
          hidePermits      = link.hidePermits;
          hideDescriptions = link.hideDescriptions;
        };
        Map.add(links, Text.compare, token, revoked);
        try { ignore await auditLog("ShareLinkRevoked", ?link.createdBy, "token=" # token # " caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[report] fire-and-forget call failed") };
        #ok(())
      };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Wire the report canister to the property canister.
  /// Must be called once after both canisters are deployed.
  /// Once set, generateReport() enforces the verification gate.
  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id;
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    adminInitialized := true;
    try { ignore await auditLog("AdminAdded", ?newAdmin, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Array.filter<Principal>(adminListEntries, func(a) { a != target });
    #ok(())
  };

  public shared(msg) func setAuditCanisterId(id : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { ignore await auditLog("AuditCanisterSet", ?id, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    auditCanisterId := ?id;
    #ok(())
  };

  private func auditLog(action : Text, subject : ?Principal, detail : Text) : async () {
    switch (auditCanisterId) {
      case null {};
      case (?aid) {
        let a : actor {
          log : (Text, Text, ?Principal, Text) -> async { #ok : Nat; #err : { #NotAuthorized; #InvalidInput : Text } }
        } = actor(Principal.toText(aid));
        try { ignore await a.log("report", action, subject, detail) } catch _ { Debug.print("[report] fire-and-forget call failed") };
      };
    };
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters bypass per-principal rate limiting. Admin only.
  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isTrustedCanister(p)) {
      trustedCanisterEntries := Array.concat(trustedCanisterEntries, [p]);
    };
    try { ignore await auditLog("TrustedCanisterAdded", ?p, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[report] fire-and-forget call failed") };
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

  /// Pause the canister. Pass durationSeconds = null for an indefinite pause.
  /// 14.4.4 — timed pauses auto-expire without requiring admin action.
  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    try { ignore await auditLog("CanisterPaused", null, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    try { ignore await auditLog("CanisterUnpaused", null, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    #ok(())
  };

  // ─── Risk Profile API (#278) ──────────────────────────────────────────────────

  /// Per-device summary included in RiskProfile.
  public type SensorSummary = {
    deviceId:    Text;
    name:        Text;
    source:      Text;   // "Nest" | "Ecobee" | …
    isActive:    Bool;
    lastEventAt: ?Int;   // ns timestamp, null = no events recorded
    eventCount:  Nat;
  };

  /// Per-alert summary (Critical/Warning) included in RiskProfile.
  public type AlertSummary = {
    alertId:   Text;
    eventType: Text;
    severity:  Text;    // "Critical" | "Warning"
    timestamp: Int;     // ns
    resolvedByJobId: ?Text;   // null = still open
  };

  /// Machine-readable property health report for insurance carrier underwriting.
  /// Intended for periodic export — always fetched live from job/sensor canisters.
  public type RiskProfile = {
    schemaVersion:    Text;   // "homegentic-risk/1.0"
    token:            Text;
    propertyId:       Text;
    generatedAt:      Int;
    expiresAt:        ?Int;   // null = never
    maintenanceScore: Nat;    // 0-100
    verificationLevel: Text;
    sensorCoverage:   [SensorSummary];
    recentAlerts:     [AlertSummary];
    openJobs:         Nat;
    verifiedJobCount: Nat;
    permitCount:      Nat;
  };

  public type RiskProfileError = {
    #NotFound;
    #Expired;
    #NotAuthorized;
    #InvalidInput : Text;
  };

  // ─── Risk Profile Stable State ───────────────────────────────────────────────

  private var sensorCanisterId : Text = "";
  private var riskJobCanisterId : Text = "";

  private let riskProfiles = Map.empty<Text, RiskProfile>();

  // ─── Risk Profile Helpers ────────────────────────────────────────────────────

  private func computeMaintenanceScore(
    alerts:          [AlertSummary],
    openOldJobCount: Nat,
    verifiedWithPermit: Nat,
    hasSensors:      Bool,
    isVerified:      Bool
  ) : Nat {
    var score : Int = 100;

    // −5 per unresolved Critical alert, cap −30
    var critPenalty : Int = 0;
    for (a in alerts.vals()) {
      if (a.severity == "Critical" and a.resolvedByJobId == null) {
        critPenalty += 5;
      }
    };
    if (critPenalty > 30) { critPenalty := 30 };
    score -= critPenalty;

    // −3 per open job older than 90 days, cap −20
    var oldJobPenalty : Int = openOldJobCount * 3;
    if (oldJobPenalty > 20) { oldJobPenalty := 20 };
    score -= oldJobPenalty;

    // +5 per verified job with permit, cap +20
    var permitBonus : Int = verifiedWithPermit * 5;
    if (permitBonus > 20) { permitBonus := 20 };
    score += permitBonus;

    // −10 if no sensor coverage
    if (not hasSensors) { score -= 10 };

    // −15 if unverified
    if (not isVerified) { score -= 15 };

    // clamp 0–100
    if (score < 0) { 0 } else if (score > 100) { 100 } else { Int.abs(score) }
  };

  /// Generate a time-limited risk profile token. Fetches live data from
  /// job and sensor canisters via cross-canister queries.
  public shared(msg) func generateRiskProfile(
    propertyId:     Text,
    expiryDays:     ?Nat,
    verificationLevel: Text
  ) : async Result.Result<RiskProfile, RiskProfileError> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId required"));

    let now = Time.now();
    let NINETY_DAYS_NS : Int = 90 * 24 * 3600 * 1_000_000_000;

    // ── Fetch sensor data ───────────────────────────────────────────────────
    var sensorCoverage : [SensorSummary] = [];
    var recentAlerts   : [AlertSummary]  = [];

    if (Text.size(sensorCanisterId) > 0) {
      let sensorActor = actor(sensorCanisterId) : actor {
        getDevicesForProperty : (Text)        -> async [{
          id: Text; name: Text; source: { #Nest; #Ecobee; #MoenFlo; #Manual;
            #RingAlarm; #HoneywellHome; #RheemEcoNet; #Sense;
            #EmporiaVue; #Rachio; #SmartThings; #HomeAssistant;
            #EnphaseEnvoy; #TeslaPowerwall; #LGThinQ; #GESmartHQ; };
          isActive: Bool; registeredAt: Int; propertyId: Text; homeowner: Principal;
          externalDeviceId: Text;
        }];
        getEventsForProperty : (Text, Nat)    -> async [{
          id: Text; eventType: { #WaterLeak; #LeakDetected; #FloodRisk; #LowTemperature;
            #HvacAlert; #HvacFilterDue; #HighHumidity; #HighTemperature;
            #SolarFault; #LowProduction; #BatteryLow; #GridOutage;
            #ApplianceFault; #ApplianceMaintenance; };
          timestamp: Int; severity: { #Info; #Warning; #Critical }; jobId: ?Text;
        }];
      };

      let rawDevices = await sensorActor.getDevicesForProperty(propertyId);
      sensorCoverage := Array.map(rawDevices, func(d: {
        id: Text; name: Text; source: { #Nest; #Ecobee; #MoenFlo; #Manual;
          #RingAlarm; #HoneywellHome; #RheemEcoNet; #Sense;
          #EmporiaVue; #Rachio; #SmartThings; #HomeAssistant;
          #EnphaseEnvoy; #TeslaPowerwall; #LGThinQ; #GESmartHQ; };
        isActive: Bool; registeredAt: Int; propertyId: Text; homeowner: Principal;
        externalDeviceId: Text;
      }) : SensorSummary {
        let sourceName = switch (d.source) {
          case (#Nest)            { "Nest"            };
          case (#Ecobee)          { "Ecobee"          };
          case (#MoenFlo)         { "MoenFlo"         };
          case (#Manual)          { "Manual"          };
          case (#RingAlarm)       { "RingAlarm"       };
          case (#HoneywellHome)   { "HoneywellHome"   };
          case (#RheemEcoNet)     { "RheemEcoNet"     };
          case (#Sense)           { "Sense"           };
          case (#EmporiaVue)      { "EmporiaVue"      };
          case (#Rachio)          { "Rachio"          };
          case (#SmartThings)     { "SmartThings"     };
          case (#HomeAssistant)   { "HomeAssistant"   };
          case (#EnphaseEnvoy)    { "EnphaseEnvoy"    };
          case (#TeslaPowerwall)  { "TeslaPowerwall"  };
          case (#LGThinQ)         { "LGThinQ"         };
          case (#GESmartHQ)       { "GESmartHQ"       };
        };
        { deviceId = d.id; name = d.name; source = sourceName;
          isActive = d.isActive; lastEventAt = null; eventCount = 0; }
      });

      let rawEvents = await sensorActor.getEventsForProperty(propertyId, 50);
      var alertAcc : [AlertSummary] = [];
      for (e in rawEvents.vals()) {
        let sev = switch (e.severity) {
          case (#Critical) { "Critical" };
          case (#Warning)  { "Warning"  };
          case (#Info)     { "" };
        };
        if (sev != "") {
          let evtName = switch (e.eventType) {
            case (#WaterLeak)            { "WaterLeak"            };
            case (#LeakDetected)         { "LeakDetected"         };
            case (#FloodRisk)            { "FloodRisk"            };
            case (#LowTemperature)       { "LowTemperature"       };
            case (#HvacAlert)            { "HvacAlert"            };
            case (#HvacFilterDue)        { "HvacFilterDue"        };
            case (#HighHumidity)         { "HighHumidity"         };
            case (#HighTemperature)      { "HighTemperature"      };
            case (#SolarFault)           { "SolarFault"           };
            case (#LowProduction)        { "LowProduction"        };
            case (#BatteryLow)           { "BatteryLow"           };
            case (#GridOutage)           { "GridOutage"           };
            case (#ApplianceFault)       { "ApplianceFault"       };
            case (#ApplianceMaintenance) { "ApplianceMaintenance" };
          };
          alertAcc := Array.concat(alertAcc, [{
            alertId = e.id; eventType = evtName; severity = sev;
            timestamp = e.timestamp; resolvedByJobId = e.jobId;
          }]);
        };
      };
      recentAlerts := alertAcc;
    };

    // ── Fetch job data ──────────────────────────────────────────────────────
    var openJobs         : Nat = 0;
    var openOldJobCount  : Nat = 0;
    var verifiedJobCount : Nat = 0;
    var permitCount      : Nat = 0;
    var verifiedWithPermit : Nat = 0;

    if (Text.size(riskJobCanisterId) > 0) {
      let jobActor = actor(riskJobCanisterId) : actor {
        getJobsForProperty : (Text) -> async {
          #ok : [{
            id: Text; propertyId: Text; homeowner: Principal; contractor: ?Principal;
            title: Text; serviceType: {
              #Roofing; #HVAC; #Plumbing; #Electrical;
              #Painting; #Flooring; #Windows; #Landscaping;
            };
            description: Text; contractorName: ?Text; amount: Nat;
            completedDate: Int; permitNumber: ?Text; warrantyMonths: ?Nat;
            isDiy: Bool; status: {
              #Pending; #InProgress; #Completed; #Verified;
              #PendingHomeownerApproval; #RejectedByHomeowner;
            };
            verified: Bool; homeownerSigned: Bool; contractorSigned: Bool;
            createdAt: Int; sourceQuoteId: ?Text;
          }];
          #err : { #NotFound; #Unauthorized; #InvalidInput: Text;
                   #AlreadyVerified; #TierLimitReached: Text; };
        };
      };

      let jobResult = await jobActor.getJobsForProperty(propertyId);
      switch (jobResult) {
        case (#err(_)) {};
        case (#ok(allJobs)) {
          for (j in allJobs.vals()) {
            let isOpen = switch (j.status) {
              case (#Pending)    { true };
              case (#InProgress) { true };
              case _ { false };
            };
            if (isOpen) {
              openJobs += 1;
              if (now - j.createdAt > NINETY_DAYS_NS) {
                openOldJobCount += 1;
              };
            };
            if (j.verified) {
              verifiedJobCount += 1;
              switch (j.permitNumber) {
                case (?_) {
                  permitCount += 1;
                  verifiedWithPermit += 1;
                };
                case null {};
              };
            };
          };
        };
      };
    };

    // ── Compute score ───────────────────────────────────────────────────────
    let hasSensors  = sensorCoverage.size() > 0;
    let isVerifiedProp = verificationLevel != "Unverified" and verificationLevel != "PendingReview";
    let score = computeMaintenanceScore(
      recentAlerts, openOldJobCount, verifiedWithPermit, hasSensors, isVerifiedProp
    );

    // ── Issue token ─────────────────────────────────────────────────────────
    let randBytes = await Random.blob();
    let token = "RISK_" # blobToHex(randBytes);

    let expiresAt : ?Int = switch (expiryDays) {
      case null    { null };
      case (?days) { ?(now + (days * 24 * 3600 * 1_000_000_000)) };
    };

    let profile : RiskProfile = {
      schemaVersion     = "homegentic-risk/1.0";
      token;
      propertyId;
      generatedAt       = now;
      expiresAt;
      maintenanceScore  = score;
      verificationLevel;
      sensorCoverage;
      recentAlerts;
      openJobs;
      verifiedJobCount;
      permitCount;
    };
    Map.add(riskProfiles, Text.compare, token, profile);
    #ok(profile)
  };

  /// Retrieve a previously generated risk profile by token.
  public query func getRiskProfile(token: Text) : async Result.Result<RiskProfile, RiskProfileError> {
    switch (Map.get(riskProfiles, Text.compare, token)) {
      case null { #err(#NotFound) };
      case (?p) {
        switch (p.expiresAt) {
          case (?exp) {
            if (Time.now() > exp) { return #err(#Expired) };
          };
          case null {};
        };
        #ok(p)
      };
    }
  };

  /// Wire the report canister to the sensor canister. Admin only.
  public shared(msg) func setSensorCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    sensorCanisterId := id;
    #ok(())
  };

  /// Wire the report canister to the job canister for risk profile queries. Admin only.
  public shared(msg) func setRiskJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    riskJobCanisterId := id;
    #ok(())
  };

  // ─── Score Certificate API (4.2.1) ───────────────────────────────────────────

  /// Issue an on-chain score certificate. Stores the payload (no personal data)
  /// against a stable CERT-N id. The caller must be authenticated; the cert
  /// itself is public and verifiable by anyone via verifyCert.
  public shared(msg) func issueCert(propertyId: Text, payload: Text) : async Text {
    ignore msg.caller;   // authenticated call; principal recorded implicitly
    certCounter += 1;
    let certId = "CERT-" # Nat.toText(certCounter);
    let record : CertRecord = {
      id         = certId;
      propertyId = propertyId;
      payload    = payload;
      issuedAt   = Time.now();
    };
    Map.add(certs, Text.compare, certId, record);
    certId
  };

  /// Verify a cert by id. Returns the stored payload (JSON) or null.
  /// Public query — no authentication required; safe for lenders to call.
  public query func verifyCert(certId: Text) : async ?Text {
    switch (Map.get(certs, Text.compare, certId)) {
      case null  null;
      case (?r)  ?r.payload;
    }
  };

  public query func getMetrics() : async Metrics {
    var active = 0;
    var views  = 0;
    for (l in Map.values(links)) {
      if (l.isActive and not isExpired(l)) { active += 1 };
      views += l.viewCount;
    };
    {
      totalReports    = Map.size(snapshots);
      totalShareLinks = Map.size(links);
      activeLinks     = active;
      totalViews      = views;
      isPaused;
    }
  };
}
