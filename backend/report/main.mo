/**
 * HomeGentic Report Canister
 *
 * Generates certified property history snapshots and manages share links.
 *
 * Flow:
 *   1. Homeowner calls generateReport(propertyData, jobs, options)
 *   2. Canister stores the snapshot, issues a share token, and signs what the
 *      link shows with a threshold Ed25519 key (see "Signed attestations")
 *   3. Anyone with the token calls getReport(token) to read the snapshot
 *   4. Homeowner can revoke links or set expiry
 *
 * Snapshots are immutable once created — buyers see the property state
 * exactly as it was when the homeowner generated the report.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Char      "mo:core/Char";
import Cycles    "mo:core/Cycles";
import Debug     "mo:core/Debug";
import Error     "mo:core/Error";
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
import ServiceTypes "../shared/ServiceType";
import Index     "../shared/Index";
import Uuid      "../shared/Uuid";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";
import ThresholdCost "../shared/ThresholdCost";
import Inspect "../shared/Inspect";

persistent actor Report {

  // ─── Input Types ──────────────────────────────────────────────────────────────
  // generateReport ignores the caller-supplied PropertyInput and JobInput list
  // (J-2/H-3) and rebuilds both on-chain; the types stay for Candid and for the
  // stored snapshot. Rooms and recurring services are still owner-supplied.

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

  /// Cost categories a shared report may carry. Deliberately has no mortgage or
  /// "other housing" entry — those stay private to the household.
  public type BillsCategory = {
    #Electric; #Gas; #Water; #Internet; #Telecom; #OtherUtility;
    #PropertyTax; #HOA; #HomeInsurance;
  };

  /// #Statements n = average of n months of bills; #Scheduled = from a fixed schedule.
  public type BillsBasis = { #Statements : Nat; #Scheduled };

  public type BillsSummaryLine = {
    category        : BillsCategory;
    avgMonthlyCents : Nat;
    basis           : BillsBasis;
  };

  /// Owner-chosen monthly cost averages attached to a report for buyers/agents.
  public type BillsSummary = {
    lines : [BillsSummaryLine];
    asOf  : Text;   // YYYY-MM-DD
  };

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

  private var isPaused              : Bool        = false;
  private var pauseExpiryNs         : ?Int        = null;
  private var adminListEntries         : [Principal] = [];
  private var adminInitialized         : Bool        = false;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce           : ?Text       = null;
  private var trustedCanisterEntries   : [Principal] = [];
  private var auditCanisterId          : ?Principal  = null;
  /// 14.4.3 — bump when the snapshot schema changes.
  /// 3 = property facts and the job list are read on-chain from the property
  ///     and job canisters (J-2/H-3); rooms and recurring services are still
  ///     owner-supplied (self-reported).
  private transient let SNAPSHOT_SCHEMA_VERSION : Nat = 3;
  private var propCanisterId        : Text        = "";

  // Cert state — new; starts empty so no migration needed.
  /// Legacy sequential counter ("CERT-N"). New cert IDs are random UUIDs;
  /// kept so the stable signature is unchanged.
  private var certCounter  : Nat                 = 0;

  /// M-4/M-5: per-property daily windows (count, windowStart) for
  /// generateRiskProfile and issueCert.
  private let riskWindowByProperty : Map.Map<Text, (Nat, Int)> = Map.empty();
  private let certWindowByProperty : Map.Map<Text, (Nat, Int)> = Map.empty();

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let snapshots = Map.empty<Text, ReportSnapshot>();
  private let links     = Map.empty<Text, ShareLink>();

  // Secondary indexes over `links` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let linksByProperty = Index.empty();
  /// CD-6: deleteMyData finds the caller's snapshots and links by index.
  private transient let linksByCreator  = Index.empty();
  private transient let linksBySnapshot = Index.empty();
  private transient let linksIndexes : [Index.Keyed<ShareLink>] = Index.indexed(links, [
    (linksByProperty, func(r : ShareLink) : ?Text { ?r.propertyId }),
    (linksByCreator,  func(r : ShareLink) : ?Text { ?r.createdBy.toText() }),
    (linksBySnapshot, func(r : ShareLink) : ?Text { ?r.snapshotId }),
  ]);
  private transient let snapshotsByCreator = Index.build(snapshots, func(r : ReportSnapshot) : ?Text { ?r.generatedBy.toText() });
  private let certs     = Map.empty<Text, CertRecord>();
  /// Keyed by snapshotId. Kept out of ReportSnapshot, which lives in a Map
  /// (invariant), so adding a field there would need an explicit migration.
  private let billsSummaries = Map.empty<Text, BillsSummary>();

  /// Owners who turned off "Public HomeGentic Report" in Settings → Privacy.
  /// While they're in here every #Public link they created behaves as
  /// #BuyerOnly (viewers must sign in); turning it back on restores them.
  private let publicReportsOff = Map.empty<Principal, ()>();

  // ─── Signed attestations ─────────────────────────────────────────────────────
  /// Each report (as its share link shows it) and each score certificate is
  /// signed with an Ed25519 key held by the IC's threshold signing service
  /// (sign_with_schnorr), derived for this canister. `message` is the exact
  /// UTF-8 JSON that was signed, so anyone with the public key can check it
  /// with any Ed25519 library; the web app's /verify-record page does it in
  /// the browser. Kept in side maps (not new fields on ReportSnapshot or
  /// CertRecord) per the stable-memory rule.
  public type Attestation = {
    message   : Text;   // the signed JSON
    signature : Blob;   // 64-byte Ed25519 signature over message's UTF-8 bytes
    publicKey : Blob;   // 32-byte Ed25519 public key that signed it
    keyName   : Text;   // IC master key it was derived from ("key_1" on mainnet)
    signedAt  : Int;    // ns
  };
  /// "test_key_1" until deploy.sh sets "key_1" on mainnet (like quote/market's vetKD key).
  private var attestKeyName : Text = "test_key_1";
  /// "report:<snapshotId>" / "cert:<certId>" → attestation.
  private let attestations = Map.empty<Text, Attestation>();
  /// keyName → this canister's derived public key (cached; it never changes).
  private let attestPublicKeys = Map.empty<Text, Blob>();
  /// snapshotId → the on-chain score (market.computePropertyScore) when the report was made.
  private let reportScores = Map.empty<Text, Nat>();

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Refuse anonymous, empty and oversized ingress before it is charged
  /// (shared/Inspect.mo, cycle-drain CD-5). Only `generateReport` may send up to
  /// MAX_UPLOAD_ARG_BYTES; everything else is capped at MAX_ARG_BYTES. Every
  /// public method is listed: the compiler rejects an inspect that misses one,
  /// so a new method has to be added here. Each method keeps its own checks.
  system func inspect({
    caller : Principal;
    arg : Blob;
    msg : {
      #addAdmin : Any;
      #addTrustedCanister : Any;
      #deleteMyData : Any;
      #findPublicReport : Any;
      #generateReport : Any;
      #generateRiskProfile : Any;
      #getAllowPublicReports : Any;
      #getAttestationKey : Any;
      #getBillsSummary : Any;
      #getCertAttestation : Any;
      #getMetrics : Any;
      #getReport : Any;
      #getReportAttestation : Any;
      #getReportScore : Any;
      #getRiskProfile : Any;
      #getTrustedCanisters : Any;
      #hasActivePublicShareLink : Any;
      #issueCert : Any;
      #listShareLinks : Any;
      #pause : Any;
      #refreshAttestationKey : Any;
      #removeAdmin : Any;
      #removeTrustedCanister : Any;
      #revokeShareLink : Any;
      #setAllowPublicReports : Any;
      #setAttestationKeyName : Any;
      #setAuditCanisterId : Any;
      #setBootstrapNonce : Any;
      #setMarketCanisterId : Any;
      #setPropertyCanisterId : Any;
      #setRiskJobCanisterId : Any;
      #setSensorCanisterId : Any;
      #setUpdateRateLimit : Any;
      #unpause : Any;
      #verifyCert : Any;
    };
  }) : Bool {
    let max = switch msg {
      case (#generateReport _) Inspect.MAX_UPLOAD_ARG_BYTES;
      case _ Inspect.MAX_ARG_BYTES;
    };
    Inspect.accept(caller, arg, max)
  };


  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller) or isTrustedCanister(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(p: Principal) : Bool {
    Admin.contains(adminListEntries, p)
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Admin.contains(trustedCanisterEntries, p)
  };


  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  /// Convert a Blob to a lowercase hex string.
  private func blobToHex(b : Blob) : Text {
    let hex  = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    let bytes = b.toArray();
    var result = "";
    for (byte in bytes.values()) {
      let n = byte.toNat();
      result #= hex[n / 16].toText();
      result #= hex[n % 16].toText();
    };
    result
  };

  /// Generate a random snapshot ID (UUID v4) and share token.
  /// L-2: the two come from disjoint halves of the 32-byte random blob, so a
  /// snapshotId reveals nothing about the bearer token.
  private func nextIds() : async (Text, Text) {
    let bytes = Blob.toArray(await Random.blob());
    let sid = Uuid.fromBlob(bytes.sliceToArray(0, 16).toBlob());
    let tok = "RPT_" # blobToHex(bytes.sliceToArray(16, 32).toBlob());
    (sid, tok)
  };

  // ─── On-chain sources (J-2/H-3/H-4/M-4) ─────────────────────────────────────

  private transient let DAY_NS : Int = 24 * 3600 * 1_000_000_000;

  /// M-5: caps on share links / snapshots per property.
  private transient let MAX_LINKS_PER_PROPERTY      : Nat = 200;
  private transient let MAX_LINKS_PER_PROPERTY_DAY  : Nat = 10;
  private transient let MAX_RISK_PER_PROPERTY_DAY   : Nat = 20;
  private transient let MAX_CERTS_PER_PROPERTY_DAY  : Nat = 5;
  private transient let MAX_ROOMS                   : Nat = 100;
  private transient let MAX_RECURRING               : Nat = 50;
  private transient let MAX_FIELD_CHARS             : Nat = 200;
  private transient let MAX_CERT_PAYLOAD_CHARS      : Nat = 8_192;

  /// Subset of property.Property (Candid record subtyping drops the rest).
  type PropFacts = {
    owner             : Principal;
    address           : Text;
    city              : Text;
    state             : Text;
    zipCode           : Text;
    propertyType      : { #SingleFamily; #Condo; #Townhouse; #MultiFamily };
    yearBuilt         : Nat;
    squareFeet        : Nat;
    verificationLevel : { #Unverified; #PendingReview; #Basic; #Premium };
  };

  /// Shape of job.Job as returned by job.getJobsForProperty.
  type JobRec = {
    id: Text; propertyId: Text; homeowner: Principal; contractor: ?Principal;
    title: Text; serviceType: ServiceTypes.ServiceType;
    description: Text; contractorName: ?Text; amount: Nat;
    completedDate: Int; permitNumber: ?Text; warrantyMonths: ?Nat;
    isDiy: Bool; status: {
      #Pending; #InProgress; #Completed; #Verified;
      #PendingHomeownerApproval; #RejectedByHomeowner;
    };
    verified: Bool; homeownerSigned: Bool; contractorSigned: Bool;
    createdAt: Int; sourceQuoteId: ?Text;
  };

  private func levelText(l : { #Unverified; #PendingReview; #Basic; #Premium }) : Text {
    switch l { case (#Unverified) "Unverified"; case (#PendingReview) "PendingReview"; case (#Basic) "Basic"; case (#Premium) "Premium" }
  };

  private func propertyTypeText(t : { #SingleFamily; #Condo; #Townhouse; #MultiFamily }) : Text {
    switch t { case (#SingleFamily) "SingleFamily"; case (#Condo) "Condo"; case (#Townhouse) "Townhouse"; case (#MultiFamily) "MultiFamily" }
  };

  /// Fetch the property record from the property canister (report is a
  /// trusted canister there). null = not wired, not found, or call failed.
  private func fetchProperty(propertyId : Text) : async ?PropFacts {
    if (Text.size(propCanisterId) == 0) return null;
    let propActor = actor(propCanisterId) : actor {
      getProperty : query (Text) -> async { #ok : PropFacts; #err : Any };
    };
    try {
      switch (await propActor.getProperty(propertyId)) { case (#ok(p)) ?p; case (#err(_)) null }
    } catch (_) { null }
  };

  /// Fetch every job for the property from the job canister (report must be a
  /// trusted canister there). null = not wired or call failed.
  ///
  /// R2: jobs whose contractor signature came from an unverified contractor
  /// profile (job.getUnattestedJobIds) come back with verified = false, so
  /// they don't count as verified in snapshots or risk profiles.
  private func fetchJobs(propertyId : Text) : async ?[JobRec] {
    if (Text.size(riskJobCanisterId) == 0) return null;
    let jobActor = actor(riskJobCanisterId) : actor {
      getJobsForProperty  : (Text) -> async { #ok : [JobRec]; #err : Any };
      getUnattestedJobIds : query (Text) -> async [Text];
    };
    try {
      let js = switch (await jobActor.getJobsForProperty(propertyId)) { case (#ok(js)) js; case (#err(_)) return null };
      let unattested = await jobActor.getUnattestedJobIds(propertyId);
      if (unattested.size() == 0) return ?js;
      ?js.map(func(j) {
        if (not j.verified or Option.isNull(unattested.find(func(id) { id == j.id }))) j
        else { { j with verified = false } }
      })
    } catch (_) { null }
  };

  /// Frontend display label for a service type (matches serviceTypes.ts).
  private func serviceLabel(s : ServiceTypes.ServiceType) : Text {
    switch s {
      case (#GeneralHandyman) "General Handyman";
      case (#Pest)            "Pest Control";
      case (#KitchenRemodel)  "Kitchen Remodel";
      case (#BathroomRemodel) "Bathroom Remodel";
      case _                  ServiceTypes.toText(s);
    }
  };

  private func pad2(n : Nat) : Text { if (n < 10) "0" # n.toText() else n.toText() };

  /// Nanosecond timestamp → "YYYY-MM-DD" (UTC; Hinnant's civil_from_days).
  private func isoDate(ns : Int) : Text {
    let days : Int = if (ns >= 0) ns / DAY_NS else (ns - DAY_NS + 1) / DAY_NS;
    let z   : Int = days + 719_468;
    let era : Int = (if (z >= 0) z else z - 146_096) / 146_097;
    let doe : Int = z - era * 146_097;
    let yoe : Int = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy : Int = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp  : Int = (5 * doy + 2) / 153;
    let d   : Int = doy - (153 * mp + 2) / 5 + 1;
    let m   : Int = if (mp < 10) mp + 3 else mp - 9;
    let y   : Int = yoe + era * 400 + (if (m <= 2) 1 else 0);
    y.toText() # "-" # pad2(Int.abs(m)) # "-" # pad2(Int.abs(d))
  };

  private func statusText(j : JobRec) : Text {
    switch (j.status) {
      case (#Pending)                  "pending";
      case (#InProgress)               "in_progress";
      case (#Completed)                "completed";
      case (#Verified)                 "verified";
      case (#PendingHomeownerApproval) "pending_homeowner_approval";
      case (#RejectedByHomeowner)      "rejected_by_homeowner";
    }
  };

  /// Job record (on-chain) → snapshot JobInput. Proposals the homeowner has not
  /// approved (or rejected) are left out.
  private func jobsToInputs(js : [JobRec]) : [JobInput] {
    let kept = js.filter(func(j) {
      j.status != #PendingHomeownerApproval and j.status != #RejectedByHomeowner
    });
    kept.map(func(j) {
      {
        serviceType    = serviceLabel(j.serviceType);
        description    = j.description;
        contractorName = j.contractorName;
        amountCents    = j.amount;
        date           = isoDate(j.completedDate);
        isDiy          = j.isDiy;
        permitNumber   = j.permitNumber;
        warrantyMonths = j.warrantyMonths;
        isVerified     = j.verified;
        status         = statusText(j);
      }
    })
  };

  /// Sliding one-day per-property counter. Returns false when over `max`.
  private func consumePropertySlot(m : Map.Map<Text, (Nat, Int)>, propertyId : Text, max : Nat) : Bool {
    let now = Time.now();
    switch (m.get(propertyId)) {
      case null { m.add(propertyId, (1, now)); true };
      case (?(count, start)) {
        if (now - start >= DAY_NS) { m.add(propertyId, (1, now)); true }
        else if (count >= max) { false }
        else { m.add(propertyId, (count + 1, start)); true }
      };
    }
  };

  /// M-5: (total links, links created in the last 24h) for a property.
  private func linkCounts(propertyId : Text) : (Nat, Nat) {
    let now = Time.now();
    var total = 0;
    var recent = 0;
    for (l in Index.records(linksByProperty, propertyId, links)) {
      total += 1;
      if (now - l.createdAt < DAY_NS) recent += 1;
    };
    (total, recent)
  };

  private func validateSelfReported(rooms : ?[RoomInput], recurring : [RecurringServiceInput]) : ?Text {
    if (recurring.size() > MAX_RECURRING) return ?"too many recurring services";
    for (r in recurring.values()) {
      if (Text.size(r.serviceType) > MAX_FIELD_CHARS or Text.size(r.providerName) > MAX_FIELD_CHARS
          or Text.size(r.frequency) > MAX_FIELD_CHARS or Text.size(r.status) > MAX_FIELD_CHARS
          or Text.size(r.startDate) > 10) return ?"recurring service field too long";
      switch (r.lastVisitDate) { case (?d) { if (Text.size(d) > 10) return ?"recurring service field too long" }; case null {} };
    };
    switch (rooms) {
      case null {};
      case (?rs) {
        if (rs.size() > MAX_ROOMS) return ?"too many rooms";
        for (r in rs.values()) {
          if (Text.size(r.name) > MAX_FIELD_CHARS or Text.size(r.floorType) > MAX_FIELD_CHARS
              or Text.size(r.paintColor) > MAX_FIELD_CHARS or Text.size(r.paintBrand) > MAX_FIELD_CHARS
              or Text.size(r.paintCode) > MAX_FIELD_CHARS) return ?"room field too long";
        };
      };
    };
    null
  };

  /// JSON string literal (with quotes) for arbitrary text.
  private func jsonStr(t : Text) : Text {
    var out = "\"";
    for (c in t.chars()) {
      if (c == '\"') { out #= "\\\"" }
      else if (c == '\\') { out #= "\\\\" }
      else if (c == '\n') { out #= "\\n" }
      else if (c == '\r') { out #= "\\r" }
      else if (c == '\t') { out #= "\\t" }
      else if (c.toNat32() < 0x20) { out #= " " }
      else { out #= c.toText() };
    };
    out # "\""
  };

  // ─── Attestation helpers ─────────────────────────────────────────────────────

  type SchnorrAlgorithm = { #ed25519; #bip340secp256k1 };
  type SchnorrKeyId     = { algorithm : SchnorrAlgorithm; name : Text };

  transient let thresholdSigner : actor {
    schnorr_public_key : ({ canister_id : ?Principal; derivation_path : [Blob]; key_id : SchnorrKeyId })
      -> async { public_key : Blob; chain_code : Blob };
    sign_with_schnorr : ({ message : Blob; derivation_path : [Blob]; key_id : SchnorrKeyId })
      -> async { signature : Blob };
  } = actor "aaaaa-aa";

  /// Domain separator: keys derived on this path sign nothing but attestations.
  private transient let ATTEST_PATH : [Blob] = ["hg-attest-v1".encodeUtf8()];

  /// sign_with_schnorr fee, as the IC prices it for this key. Unused cycles are refunded.
  private func attestSignCycles(name : Text) : Nat { ThresholdCost.schnorrEd25519(name) };

  private func attestPublicKey(name : Text) : async* Blob {
    switch (attestPublicKeys.get(name)) {
      case (?k) k;
      case null {
        let r = await thresholdSigner.schnorr_public_key({
          canister_id = null; derivation_path = ATTEST_PATH; key_id = { algorithm = #ed25519; name };
        });
        attestPublicKeys.add(name, r.public_key);
        r.public_key
      };
    }
  };

  /// Sign `message` and store it under `ref`. Never fails the caller: if
  /// signing is unavailable (no key on a local replica, out of cycles) the
  /// record is kept unsigned and the pages say so.
  /// M-3 (2026-10-28 audit): canister-wide cap on threshold signatures per
  /// day (~26B cycles each on key_1), so a crowd of throwaway accounts can't
  /// drain cycles. Past it, records are kept unsigned, as when signing is down.
  /// Transient: a counter that resets on upgrade (reviewing-motoko S2).
  private transient let MAX_ATTESTS_PER_DAY : Nat = 500;
  private transient var attestDay   : Int = 0;
  private transient var attestsToday : Nat = 0;

  private func takeAttestSlot() : Bool {
    let day = Time.now() / 86_400_000_000_000;
    if (day != attestDay) { attestDay := day; attestsToday := 0 };
    if (attestsToday >= MAX_ATTESTS_PER_DAY) return false;
    attestsToday += 1;
    true
  };

  private func attest(ref : Text, message : Text) : async* () {
    let name = attestKeyName;
    if (not takeAttestSlot()) {
      Debug.print("attest " # ref # " skipped: daily signing budget used");
      return;
    };
    // Attaching more cycles than the canister holds would trap after the
    // record is saved; skip signing instead and leave it unsigned.
    if (Cycles.balance() < 2 * attestSignCycles(name)) {
      Debug.print("attest " # ref # " skipped: low cycles");
      return;
    };
    try {
      let publicKey = await* attestPublicKey(name);
      let r = await (with cycles = attestSignCycles(name)) thresholdSigner.sign_with_schnorr({
        message = message.encodeUtf8(); derivation_path = ATTEST_PATH; key_id = { algorithm = #ed25519; name };
      });
      attestations.add(ref, { message; signature = r.signature; publicKey; keyName = name; signedAt = Time.now() });
    } catch (e) {
      Debug.print("attest " # ref # " failed: " # e.message());
    };
  };

  private func jsonBool(b : Bool) : Text { if (b) "true" else "false" };
  private func jsonOptText(t : ?Text) : Text { switch (t) { case (?v) jsonStr(v); case null "null" } };
  private func jsonOptNat(n : ?Nat) : Text { switch (n) { case (?v) v.toText(); case null "null" } };

  /// The signed statement for one share link: the snapshot exactly as that
  /// link shows it. Fields the owner hid are left out (not zeroed), so the
  /// statement can't be read as "this job cost $0". Rooms and recurring
  /// services are owner-supplied and sit under "selfReported".
  private func reportMessage(snap : ReportSnapshot, link : ShareLink, score : ?Nat) : Text {
    let hideAmounts      = link.hideAmounts.get(false);
    let hideContractors  = link.hideContractors.get(false);
    let hidePermits      = link.hidePermits.get(false);
    let hideDescriptions = link.hideDescriptions.get(false);
    var jobs = "";
    for (j in snap.jobs.values()) {
      var o = "{\"serviceType\":" # jsonStr(j.serviceType) # ",\"date\":" # jsonStr(j.date);
      if (not hideDescriptions) o #= ",\"description\":" # jsonStr(j.description);
      if (not hideContractors)  o #= ",\"contractorName\":" # jsonOptText(j.contractorName);
      if (not hideAmounts)      o #= ",\"amountCents\":" # j.amountCents.toText();
      if (not hidePermits)      o #= ",\"permitNumber\":" # jsonOptText(j.permitNumber);
      o #= ",\"warrantyMonths\":" # jsonOptNat(j.warrantyMonths)
        # ",\"isDiy\":" # jsonBool(j.isDiy)
        # ",\"verified\":" # jsonBool(j.isVerified)
        # ",\"status\":" # jsonStr(j.status) # "}";
      jobs #= (if (jobs == "") "" else ",") # o;
    };
    var recurring = "";
    for (r in snap.recurringServices.values()) {
      recurring #= (if (recurring == "") "" else ",")
        # "{\"serviceType\":" # jsonStr(r.serviceType)
        # ",\"providerName\":" # jsonStr(r.providerName)
        # ",\"frequency\":" # jsonStr(r.frequency)
        # ",\"status\":" # jsonStr(r.status)
        # ",\"startDate\":" # jsonStr(r.startDate)
        # ",\"lastVisitDate\":" # jsonOptText(r.lastVisitDate)
        # ",\"totalVisits\":" # r.totalVisits.toText() # "}";
    };
    var rooms = "";
    for (r in (snap.rooms.get([])).values()) {
      rooms #= (if (rooms == "") "" else ",")
        # "{\"name\":" # jsonStr(r.name) # ",\"floorType\":" # jsonStr(r.floorType)
        # ",\"fixtureCount\":" # r.fixtureCount.toText() # "}";
    };
    "{\"type\":\"homegentic.report\",\"v\":1"
      # ",\"issuer\":"            # jsonStr(Principal.fromActor(Report).toText())
      # ",\"snapshotId\":"        # jsonStr(snap.snapshotId)
      # ",\"propertyId\":"        # jsonStr(snap.propertyId)
      # ",\"generatedAtMs\":"     # Int.toText(snap.generatedAt / 1_000_000)
      # ",\"property\":{\"address\":" # jsonStr(snap.address)
        # ",\"city\":"            # jsonStr(snap.city)
        # ",\"state\":"           # jsonStr(snap.state)
        # ",\"zipCode\":"         # jsonStr(snap.zipCode)
        # ",\"propertyType\":"    # jsonStr(snap.propertyType)
        # ",\"yearBuilt\":"       # snap.yearBuilt.toText()
        # ",\"squareFeet\":"      # snap.squareFeet.toText()
        # ",\"verificationLevel\":" # jsonStr(snap.verificationLevel) # "}"
      # ",\"score\":"             # jsonOptNat(score)
      # ",\"hidden\":{\"amounts\":" # jsonBool(hideAmounts)
        # ",\"contractors\":"     # jsonBool(hideContractors)
        # ",\"permits\":"         # jsonBool(hidePermits)
        # ",\"descriptions\":"    # jsonBool(hideDescriptions) # "}"
      # ",\"totals\":{\"jobs\":" # snap.jobs.size().toText()
        # ",\"verifiedJobs\":"    # snap.verifiedJobCount.toText()
        # ",\"diyJobs\":"         # snap.diyJobCount.toText()
        # ",\"permits\":"         # snap.permitCount.toText()
        # (if (hideAmounts) "" else ",\"amountCents\":" # snap.totalAmountCents.toText()) # "}"
      # ",\"jobs\":["             # jobs # "]"
      # ",\"selfReported\":{\"recurringServices\":[" # recurring # "],\"rooms\":[" # rooms # "]}"
      # "}"
  };

  private transient let MAX_MONTHLY_CENTS : Nat = 100_000_000;   // $1M/month — far beyond any household cost

  private func billsCategoryKey(c: BillsCategory) : Nat {
    switch c {
      case (#Electric) 0; case (#Gas) 1; case (#Water) 2; case (#Internet) 3; case (#Telecom) 4;
      case (#OtherUtility) 5; case (#PropertyTax) 6; case (#HOA) 7; case (#HomeInsurance) 8;
    }
  };

  private func validateBillsSummary(s: BillsSummary) : ?Text {
    if (Text.size(s.asOf) != 10) return ?"billsSummary.asOf must be YYYY-MM-DD";
    if (s.lines.size() > 9) return ?"billsSummary has too many lines";
    var seen : [Nat] = [];
    for (l in s.lines.values()) {
      let k = billsCategoryKey(l.category);
      if (Option.isSome(seen.find(func(x) { x == k }))) return ?"billsSummary has a duplicate category";
      seen := seen.concat([k]);
      if (l.avgMonthlyCents > MAX_MONTHLY_CENTS) return ?"billsSummary amount out of range";
      switch (l.basis) {
        case (#Statements n) { if (n == 0 or n > 12) return ?"billsSummary months must be 1-12" };
        case (#Scheduled) {};
      };
    };
    null
  };

  private func isExpired(link: ShareLink) : Bool {
    switch (link.expiresAt) {
      case null      { false };
      case (?expiry) { Time.now() > expiry };
    }
  };

  private func totalAmount(jobs: [JobInput]) : Nat {
    var sum = 0;
    for (j in jobs.values()) { sum += j.amountCents };
    sum
  };

  private func countVerified(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.values()) { if (j.isVerified) { n += 1 } };
    n
  };

  private func countDiy(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.values()) { if (j.isDiy) { n += 1 } };
    n
  };

  private func countPermits(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.values()) {
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
    let doHideAmounts      = link.hideAmounts.get(false);
    let doHideContractors  = link.hideContractors.get(false);
    let doHidePermits      = link.hidePermits.get(false);
    let doHideDescriptions = link.hideDescriptions.get(false);

    if (not doHideAmounts and not doHideContractors
        and not doHidePermits and not doHideDescriptions) {
      return snap;  // fast-path: nothing to hide
    };

    let filteredJobs : [JobInput] = snap.jobs.map(func(j) {
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
  ///  12. billsSummary     — owner-chosen monthly cost averages (see getBillsSummary)
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
    hideDescriptions:  ?Bool,
    billsSummary:      ?BillsSummary   // opt — null / omitted = no cost summary
  ) : async Result.Result<ShareLink, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId)      == 0)  return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(propertyId)      > 100) return #err(#InvalidInput("propertyId too long"));
    switch (billsSummary) {
      case (?b) { switch (validateBillsSummary(b)) { case (?m) return #err(#InvalidInput(m)); case null {} } };
      case null {};
    };
    switch (validateSelfReported(rooms, recurringServices)) { case (?m) return #err(#InvalidInput(m)); case null {} };
    // J-2/H-3: `property` and `jobs` are accepted for Candid compatibility but
    // IGNORED — property facts, the verification level and the job list
    // (amounts, permits, verified flags) are read from the property and job
    // canisters below. Only redaction choices, rooms and recurring services
    // come from the caller (schemaVersion 3 marks this).
    ignore property; ignore jobs;

    // M-5: cheap early cap check (re-checked after the awaits).
    do {
      let (total0, recent0) = linkCounts(propertyId);
      if (total0 >= MAX_LINKS_PER_PROPERTY or recent0 >= MAX_LINKS_PER_PROPERTY_DAY)
        return #err(#InvalidInput("Report limit reached for this property; try again later"));
    };

    // ── Authoritative property record + owner-only gate ─────────────────────
    let prop = switch (await fetchProperty(propertyId)) {
      case null { return #err(if (isAdmin(msg.caller)) #NotFound else #NotAuthorized) };
      case (?p) { p };
    };
    if (prop.owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let level = levelText(prop.verificationLevel);
    if (level == "Unverified" or level == "PendingReview") return #err(#UnverifiedProperty);

    // ── Authoritative job list ──────────────────────────────────────────────
    let onChainJobs : [JobInput] = switch (await fetchJobs(propertyId)) {
      case null { return #err(#InvalidInput("Could not load job history; try again later")) };
      case (?js) { jobsToInputs(js) };
    };

    let (snapshotId, token) = await nextIds();
    let now = Time.now();

    // Re-check state after the awaits (TOCTOU).
    do {
      let (total1, recent1) = linkCounts(propertyId);
      if (total1 >= MAX_LINKS_PER_PROPERTY or recent1 >= MAX_LINKS_PER_PROPERTY_DAY)
        return #err(#InvalidInput("Report limit reached for this property; try again later"));
    };
    if (links.get(token) != null or snapshots.get(snapshotId) != null)
      return #err(#InvalidInput("ID collision, retry"));

    let snapshot : ReportSnapshot = {
      snapshotId;
      propertyId;
      generatedBy        = msg.caller;
      address            = prop.address;
      city               = prop.city;
      state              = prop.state;
      zipCode            = prop.zipCode;
      propertyType       = propertyTypeText(prop.propertyType);
      yearBuilt          = prop.yearBuilt;
      squareFeet         = prop.squareFeet;
      verificationLevel  = level;
      jobs               = onChainJobs;
      recurringServices;
      rooms;   // owner-supplied (self-reported) — null for old callers
      totalAmountCents   = totalAmount(onChainJobs);
      verifiedJobCount   = countVerified(onChainJobs);
      diyJobCount        = countDiy(onChainJobs);
      permitCount        = countPermits(onChainJobs);
      generatedAt        = now;
      schemaVersion      = ?SNAPSHOT_SCHEMA_VERSION;
    };
    snapshots.add(snapshotId, snapshot);
    Index.add(snapshotsByCreator, snapshot.generatedBy.toText(), snapshotId);
    switch (billsSummary) {
      case (?b) { if (b.lines.size() > 0) billsSummaries.add(snapshotId, b) };
      case null {};
    };

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
    Index.put(links, linksIndexes, token, link);

    // The on-chain score at this moment, then a signature over what this
    // link shows. Both are best-effort: the report is already saved.
    let score : ?Nat = if (Text.size(marketCanisterId) == 0) null else {
      let marketActor = actor(marketCanisterId) : actor { computePropertyScore : (Text) -> async ?Nat };
      try { await marketActor.computePropertyScore(propertyId) } catch (_) { null }
    };
    switch (score) { case (?n) reportScores.add(snapshotId, n); case null {} };
    await* attest("report:" # snapshotId, reportMessage(applyDisclosure(snapshot, link), link, score));
    #ok(link)
  };

  // ─── Core: View Report ────────────────────────────────────────────────────────

  /// The visibility a link has right now: #Public links of an owner who
  /// turned public reports off need a signed-in viewer.
  private func effectiveVisibility(link: ShareLink) : VisibilityLevel {
    if (link.visibility == #Public and publicReportsOff.containsKey(link.createdBy)) #BuyerOnly
    else link.visibility
  };

  /// Fetch the report snapshot for a share token.
  /// Increments view count; returns error if expired or revoked.
  /// L-1: #BuyerOnly links require a signed-in (non-anonymous) caller. There
  /// is no buyer allow-list yet, so this is "authenticated viewers only".
  public shared(msg) func getReport(token: Text) : async Result.Result<(ShareLink, ReportSnapshot), Error> {
    switch (links.get(token)) {
      case null { #err(#NotFound) };
      case (?link) {
        if (not link.isActive) return #err(#Revoked);
        if (isExpired(link))   return #err(#Expired);
        let visibility = effectiveVisibility(link);
        if (visibility == #BuyerOnly and msg.caller.isAnonymous()) return #err(#NotAuthorized);

        switch (snapshots.get(link.snapshotId)) {
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
            Index.put(links, linksIndexes, token, updated);
            // 14.2.3 — enforce disclosure flags on-chain before returning
            #ok(({ updated with visibility }, applyDisclosure(snap, updated)))
          };
        }
      };
    }
  };

  /// The cost summary attached to a report, if the owner included one. Same
  /// link checks as getReport; withheld when the link hides amounts.
  public query(msg) func getBillsSummary(token: Text) : async ?BillsSummary {
    switch (links.get(token)) {
      case null null;
      case (?link) {
        if (not link.isActive or isExpired(link)) return null;
        if (effectiveVisibility(link) == #BuyerOnly and msg.caller.isAnonymous()) return null;
        if (link.hideAmounts == ?true) return null;
        billsSummaries.get(link.snapshotId)
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
    for (l in Index.records(linksByProperty, propertyId, links)) {
      if (l.isActive and effectiveVisibility(l) == #Public) {
        switch (l.expiresAt) {
          case null   { found := true };
          case (?exp) { if (now < exp) found := true };
        };
      };
    };
    found
  };

  /// Buyer lookup (/check): the newest active, unexpired #Public report whose
  /// street address matches. Anonymous query, so it only returns what the
  /// public report itself shows. `address` is what the buyer typed: the street
  /// line, optionally followed by city, state and ZIP; when it contains a
  /// 5-digit ZIP that differs from the report's, it doesn't match.
  /// Scans every link; fine at today's volumes, an address index would be the
  /// next step if this grows.
  public type PublicReportMatch = {
    token:             Text;
    address:           Text;
    city:              Text;
    state:             Text;
    zipCode:           Text;
    propertyType:      Text;
    yearBuilt:         Nat;
    verificationLevel: Text;
  };

  public query func findPublicReport(address: Text) : async ?PublicReportMatch {
    if (address.size() == 0 or address.size() > 300) return null;
    let wanted = addressWords(address);
    if (wanted.size() == 0) return null;
    var best : ?(Int, PublicReportMatch) = null;
    for (link in links.values()) {
      if (link.isActive and not isExpired(link) and effectiveVisibility(link) == #Public) {
        switch (snapshots.get(link.snapshotId)) {
          case null {};
          case (?snap) {
            if (streetMatches(wanted, snap.address, snap.zipCode)) {
              let newer = switch (best) { case null true; case (?(t, _)) link.createdAt > t };
              if (newer) best := ?(link.createdAt, {
                token             = link.token;
                address           = snap.address;
                city              = snap.city;
                state             = snap.state;
                zipCode           = snap.zipCode;
                propertyType      = snap.propertyType;
                yearBuilt         = snap.yearBuilt;
                verificationLevel = snap.verificationLevel;
              });
            };
          };
        };
      };
    };
    switch (best) { case null null; case (?(_, m)) ?m }
  };

  /// Lowercased words with punctuation dropped: "12 Main St., Apt 4" → ["12","main","st","apt","4"].
  private func addressWords(t: Text) : [Text] {
    var cleaned = "";
    for (c in t.toLower().chars()) {
      cleaned #= (if (c.isAlphabetic() or c.isDigit()) c.toText() else " ");
    };
    cleaned.split(#char ' ').filter(func(w : Text) : Bool { w != "" }).toArray()
  };

  private func streetMatches(wanted: [Text], street: Text, zip: Text) : Bool {
    let streetWords = addressWords(street);
    if (streetWords.size() == 0 or wanted.size() < streetWords.size()) return false;
    var i = 0;
    while (i < streetWords.size()) {
      if (wanted[i] != streetWords[i]) return false;
      i += 1;
    };
    // Any 5-digit word after the street line is taken as a ZIP.
    let zipWords = addressWords(zip);
    while (i < wanted.size()) {
      let w = wanted[i];
      if (w.size() == 5 and w.chars().all(func(c : Char) : Bool { c.isDigit() })) {
        if (zipWords.size() > 0 and w != zipWords[0]) return false;
      };
      i += 1;
    };
    true
  };

  /// Settings → Privacy: whether anyone with a #Public link can view the
  /// caller's reports without signing in.
  public shared(msg) func setAllowPublicReports(allow: Bool) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    if (allow) publicReportsOff.remove(msg.caller) else publicReportsOff.add(msg.caller, ());
    #ok(())
  };

  public query(msg) func getAllowPublicReports() : async Bool {
    not publicReportsOff.containsKey(msg.caller)
  };

  /// List all share links the caller created for a property.
  public shared(msg) func listShareLinks(propertyId: Text) : async [ShareLink] {
    Iter.toArray(Index.records(linksByProperty, propertyId, links).filter(func(l: ShareLink) : Bool {
      l.createdBy == msg.caller
    }))
  };

  /// Revoke a share link. Only the creator or an admin can do this.
  public shared(msg) func revokeShareLink(token: Text) : async Result.Result<(), Error> {
    switch (links.get(token)) {
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
        Index.put(links, linksIndexes, token, revoked);
        try { await auditLog("ShareLinkRevoked", ?link.createdBy, "token=" # token # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[report] fire-and-forget call failed") };
        #ok(())
      };
    }
  };

  // ─── Account Deletion ─────────────────────────────────────────────────────────

  /// Account deletion: removes everything this canister holds for the caller.
  /// Returns how many records were removed.
  ///
  /// Deletes every snapshot the caller generated and every share link the
  /// caller created, plus any link pointing at a deleted snapshot (so shared
  /// URLs stop resolving) and the bills summaries keyed by those snapshots.
  /// Certificates and risk profiles are keyed by property and record no
  /// issuer, so they are not attributable to a caller and are kept.
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    let caller = msg.caller;

    // CD-6: by index, not a scan of every snapshot and link.
    let snapIds = Index.ids(snapshotsByCreator, caller.toText()).toArray();
    let tokenSet = Map.empty<Text, ()>();
    for (t in Index.ids(linksByCreator, caller.toText())) { tokenSet.add(t, ()) };
    for (id in snapIds.values()) {
      for (t in Index.ids(linksBySnapshot, id)) { tokenSet.add(t, ()) };
    };
    let linkTokens = Iter.toArray(tokenSet.keys());

    var removed = 0;
    for (t in linkTokens.values()) {
      Index.delete(links, linksIndexes, t);
      removed += 1;
    };
    for (id in snapIds.values()) {
      snapshots.remove(id);
      Index.remove(snapshotsByCreator, caller.toText(), id);
      billsSummaries.remove(id);
      reportScores.remove(id);
      attestations.remove("report:" # id);
      removed += 1;
    };
    if (publicReportsOff.containsKey(caller)) { publicReportsOff.remove(caller); removed += 1 };
    #ok(removed)
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
    adminListEntries := Admin.add(adminListEntries, newAdmin);
    adminInitialized := true;
    try { await auditLog("AdminAdded", ?newAdmin, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Admin.remove(adminListEntries, target);
    #ok(())
  };

  public shared(msg) func setAuditCanisterId(id : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { await auditLog("AuditCanisterSet", ?id, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    auditCanisterId := ?id;
    #ok(())
  };

  private func auditLog(action : Text, subject : ?Principal, detail : Text) : async () {
    await* Canisters.auditLog(auditCanisterId, "report", action, subject, detail)
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters bypass per-principal rate limiting. Admin only.
  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.add(trustedCanisterEntries, p);
    try { await auditLog("TrustedCanisterAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[report] fire-and-forget call failed") };
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

  /// Pause the canister. Pass durationSeconds = null for an indefinite pause.
  /// 14.4.4 — timed pauses auto-expire without requiring admin action.
  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
    try { await auditLog("CanisterPaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[report] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    try { await auditLog("CanisterUnpaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[report] fire-and-forget call failed") };
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
  /// R2: market canister — issueCert reads the on-chain score from
  /// market.computePropertyScore (report must be wired there with
  /// market.setReportCanisterId).
  private var marketCanisterId : Text = "";

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
    for (a in alerts.values()) {
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
  ///
  /// M-4: `verificationLevel` is accepted for Candid compatibility but
  /// IGNORED — the level is read from the property canister. Only the owner,
  /// a co-owner or a manager (write access) may generate a profile.
  public shared(msg) func generateRiskProfile(
    propertyId:     Text,
    expiryDays:     ?Nat,
    verificationLevel: Text
  ) : async Result.Result<RiskProfile, RiskProfileError> {
    ignore verificationLevel;
    switch (requireActive(msg.caller)) {
      case (#err(#InvalidInput(m))) return #err(#InvalidInput(m));
      case (#err(_)) return #err(#NotAuthorized);
      case _ {};
    };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId required"));
    if (Text.size(propertyId) > 100) return #err(#InvalidInput("propertyId too long"));
    if (Text.size(propCanisterId) == 0) return #err(#NotAuthorized);

    let propActor = Canisters.property(propCanisterId);
    // H-14 / M-4: write access (owner / co-owner / manager) required.
    if (not isAdmin(msg.caller)) {
      let authorized = await propActor.isAuthorized(propertyId, msg.caller, true);
      if (not authorized) return #err(#NotAuthorized);
    };
    let onChainLevel : Text = switch (await propActor.getVerificationLevel(propertyId)) {
      case null { return #err(#NotFound) };
      case (?l) { l };
    };

    let now = Time.now();
    let NINETY_DAYS_NS : Int = 90 * 24 * 3600 * 1_000_000_000;

    // ── Fetch sensor data ───────────────────────────────────────────────────
    var sensorCoverage : [SensorSummary] = [];
    var recentAlerts   : [AlertSummary]  = [];

    if (Text.size(sensorCanisterId) > 0) {
      // sensor answers these only for trusted readers (deploy.sh registers
      // report); the caller's access was checked above.
      let sensorActor = actor(sensorCanisterId) : actor {
        getDevicesForReader : (Text)          -> async [{
          id: Text; name: Text; source: { #Nest; #Ecobee; #MoenFlo; #Manual;
            #RingAlarm; #HoneywellHome; #RheemEcoNet; #Sense;
            #EmporiaVue; #Rachio; #SmartThings; #HomeAssistant;
            #EnphaseEnvoy; #TeslaPowerwall; #LGThinQ; #GESmartHQ; #SolarEdge; };
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

      let rawDevices = await sensorActor.getDevicesForReader(propertyId);
      sensorCoverage := rawDevices.map(func(d: {
        id: Text; name: Text; source: { #Nest; #Ecobee; #MoenFlo; #Manual;
          #RingAlarm; #HoneywellHome; #RheemEcoNet; #Sense;
          #EmporiaVue; #Rachio; #SmartThings; #HomeAssistant;
          #EnphaseEnvoy; #TeslaPowerwall; #LGThinQ; #GESmartHQ; #SolarEdge; };
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
          case (#SolarEdge)       { "SolarEdge"       };
        };
        { deviceId = d.id; name = d.name; source = sourceName;
          isActive = d.isActive; lastEventAt = null; eventCount = 0; }
      });

      let rawEvents = await sensorActor.getEventsForProperty(propertyId, 50);
      var alertAcc : [AlertSummary] = [];
      for (e in rawEvents.values()) {
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
          alertAcc := alertAcc.concat([{
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

    do {
      switch (await fetchJobs(propertyId)) {
        case null {};
        case (?allJobs) {
          for (j in allJobs.values()) {
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
    let isVerifiedProp = onChainLevel != "Unverified" and onChainLevel != "PendingReview";
    let score = computeMaintenanceScore(
      recentAlerts, openOldJobCount, verifiedWithPermit, hasSensors, isVerifiedProp
    );

    // ── Issue token ─────────────────────────────────────────────────────────
    let randBytes = await Random.blob();
    let token = "RISK_" # blobToHex(randBytes);
    // M-5: per-property daily cap, checked after the awaits (TOCTOU).
    if (not isAdmin(msg.caller) and not consumePropertySlot(riskWindowByProperty, propertyId, MAX_RISK_PER_PROPERTY_DAY))
      return #err(#InvalidInput("Risk profile limit reached for this property; try again tomorrow"));

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
      verificationLevel = onChainLevel;
      sensorCoverage;
      recentAlerts;
      openJobs;
      verifiedJobCount;
      permitCount;
    };
    riskProfiles.add(token, profile);
    #ok(profile)
  };

  /// Retrieve a previously generated risk profile by token.
  public query func getRiskProfile(token: Text) : async Result.Result<RiskProfile, RiskProfileError> {
    switch (riskProfiles.get(token)) {
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

  /// R2: wire the market canister (on-chain certificate score). Admin only.
  public shared(msg) func setMarketCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    marketCanisterId := id;
    #ok(())
  };

  /// Wire the report canister to the job canister for risk profile queries. Admin only.
  public shared(msg) func setRiskJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    riskJobCanisterId := id;
    #ok(())
  };

  // ─── Score Certificate API (4.2.1) ───────────────────────────────────────────

  /// Issue an on-chain score certificate.
  ///
  /// H-4/J-2/R2: owner (or admin) only. Everything stored is read on-chain:
  /// property facts and the verification level from the property canister,
  /// verified-job facts from job.getCertificationData, and the score from
  /// market.computePropertyScore (which reads the job canister itself). The
  /// caller's `payload` is ignored apart from the size check — it stays in the
  /// signature for Candid compatibility. Jobs whose contractor signature came
  /// from an unverified contractor profile are excluded by the job canister.
  ///
  /// Stored JSON (v3):
  ///   {"v":3,"propertyId","address","city","state","zipCode",
  ///    "verificationLevel","verifiedJobCount","verifiedKeySystems",
  ///    "meetsStructural","score":<nat>|null,"certified"(score>=88 and
  ///    meetsStructural),"issuedAt"(ms)}
  /// v2 certificates (score only under "selfReported") stay readable as-is.
  public shared(msg) func issueCert(propertyId: Text, payload: Text) : async Result.Result<Text, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0 or Text.size(propertyId) > 100) return #err(#InvalidInput("invalid propertyId"));
    if (Text.size(payload) > MAX_CERT_PAYLOAD_CHARS) return #err(#InvalidInput("payload too large"));

    let prop = switch (await fetchProperty(propertyId)) {
      case null { return #err(if (isAdmin(msg.caller)) #NotFound else #NotAuthorized) };
      case (?p) { p };
    };
    if (prop.owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    // M-3: like generateReport, only verified homes get a signed certificate.
    let level = levelText(prop.verificationLevel);
    if (level == "Unverified" or level == "PendingReview") return #err(#UnverifiedProperty);

    if (Text.size(riskJobCanisterId) == 0) return #err(#InvalidInput("Job canister not configured"));
    if (Text.size(marketCanisterId) == 0) return #err(#InvalidInput("Score service not configured"));
    let jobActor = actor(riskJobCanisterId) : actor {
      getCertificationData : query (Text) -> async {
        verifiedJobCount : Nat; verifiedKeySystems : [Text]; meetsStructural : Bool;
      };
    };
    let cert = try { await jobActor.getCertificationData(propertyId) } catch (_) {
      return #err(#InvalidInput("Could not load job history; try again later"))
    };
    let marketActor = actor(marketCanisterId) : actor {
      computePropertyScore : (Text) -> async ?Nat;
    };
    let score : ?Nat = try { await marketActor.computePropertyScore(propertyId) } catch (_) {
      return #err(#InvalidInput("Could not compute the score; try again later"))
    };

    let certId = Uuid.fromBlob(await Random.blob());
    let now = Time.now();
    // State checks after the awaits (TOCTOU).
    if (certs.get(certId) != null) return #err(#InvalidInput("ID collision, retry"));
    if (not isAdmin(msg.caller) and not consumePropertySlot(certWindowByProperty, propertyId, MAX_CERTS_PER_PROPERTY_DAY))
      return #err(#InvalidInput("Certificate limit reached for this property; try again tomorrow"));

    var systems = "";
    for (k in cert.verifiedKeySystems.values()) {
      systems #= (if (systems == "") "" else ",") # jsonStr(k);
    };
    let certified = switch (score) { case (?n) { n >= 88 and cert.meetsStructural }; case null { false } };
    let json = "{\"v\":3"
      # ",\"propertyId\":"        # jsonStr(propertyId)
      # ",\"address\":"           # jsonStr(prop.address)
      # ",\"city\":"              # jsonStr(prop.city)
      # ",\"state\":"             # jsonStr(prop.state)
      # ",\"zipCode\":"           # jsonStr(prop.zipCode)
      # ",\"verificationLevel\":" # jsonStr(levelText(prop.verificationLevel))
      # ",\"verifiedJobCount\":"  # cert.verifiedJobCount.toText()
      # ",\"verifiedKeySystems\":[" # systems # "]"
      # ",\"meetsStructural\":"   # (if (cert.meetsStructural) "true" else "false")
      # ",\"score\":"             # (switch (score) { case (?n) n.toText(); case null "null" })
      # ",\"certified\":"         # (if (certified) "true" else "false")
      # ",\"issuedAt\":"          # Int.toText(now / 1_000_000)
      # "}";

    let record : CertRecord = {
      id         = certId;
      propertyId = propertyId;
      payload    = json;
      issuedAt   = now;
    };
    certs.add(certId, record);
    await* attest("cert:" # certId,
      "{\"type\":\"homegentic.scoreCertificate\",\"v\":1"
      # ",\"issuer\":" # jsonStr(Principal.fromActor(Report).toText())
      # ",\"certId\":" # jsonStr(certId)
      # ",\"certificate\":" # json # "}");
    #ok(certId)
  };

  /// Verify a cert by id. Returns the stored payload (JSON) or null. For v3
  /// certificates every field, including the score, was computed on-chain.
  /// Public query — no authentication required; safe for lenders to call.
  public query func verifyCert(certId: Text) : async ?Text {
    switch (certs.get(certId)) {
      case null  null;
      case (?r)  ?r.payload;
    }
  };

  // ─── Attestation API ─────────────────────────────────────────────────────────

  /// The signed statement for a share link, under the same checks as
  /// getReport (active, unexpired, signed-in viewer for #BuyerOnly). Null when
  /// the link can't be viewed or the report was never signed.
  public query(msg) func getReportAttestation(token : Text) : async ?Attestation {
    switch (links.get(token)) {
      case null null;
      case (?link) {
        if (not link.isActive or isExpired(link)) return null;
        if (effectiveVisibility(link) == #BuyerOnly and msg.caller.isAnonymous()) return null;
        attestations.get("report:" # link.snapshotId)
      };
    }
  };

  /// The on-chain score stored with a report (same checks as getReport).
  public query(msg) func getReportScore(token : Text) : async ?Nat {
    switch (links.get(token)) {
      case null null;
      case (?link) {
        if (not link.isActive or isExpired(link)) return null;
        if (effectiveVisibility(link) == #BuyerOnly and msg.caller.isAnonymous()) return null;
        reportScores.get(link.snapshotId)
      };
    }
  };

  /// The signed statement for a score certificate. Public, like verifyCert.
  public query func getCertAttestation(certId : Text) : async ?Attestation {
    attestations.get("cert:" # certId)
  };

  /// The key this canister signs with now, once it has been fetched (first
  /// signature, or refreshAttestationKey). Published on /verify-record.
  public query func getAttestationKey() : async ?{ keyName : Text; publicKey : Blob } {
    switch (attestPublicKeys.get(attestKeyName)) {
      case (?publicKey) ?{ keyName = attestKeyName; publicKey };
      case null null;
    }
  };

  /// Fetch and cache the current key's public key. Admin only (deploy.sh).
  public shared(msg) func refreshAttestationKey() : async Result.Result<Blob, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { #ok(await* attestPublicKey(attestKeyName)) } catch (e) { #err(#InvalidInput(e.message())) }
  };

  /// Select the threshold signing key ("key_1" on mainnet). Admin only.
  /// Existing attestations keep the key they were signed with.
  public shared(msg) func setAttestationKeyName(name : Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (name != "key_1" and name != "test_key_1" and name != "dfx_test_key")
      return #err(#InvalidInput("unknown signing key name"));
    attestKeyName := name;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var active = 0;
    var views  = 0;
    for (l in links.values()) {
      if (l.isActive and not isExpired(l)) { active += 1 };
      views += l.viewCount;
    };
    {
      totalReports    = snapshots.size();
      totalShareLinks = links.size();
      activeLinks     = active;
      totalViews      = views;
      isPaused;
    }
  };
}
