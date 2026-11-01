/**
 * HomeGentic Market Intelligence Canister
 *
 * On-chain competitive analysis and ROI-ranked project recommendations.
 *
 * Design principles:
 * - Query functions accept rich input from the frontend; no inter-canister calls needed.
 *   The frontend already holds property + job data, so we avoid ICP cross-canister
 *   latency and canister-ID coupling.
 * - ROI tables and system lifespans are embedded constants derived from the
 *   2024 Remodeling Magazine Cost vs Value report (national averages).
 * - Admins can push zip-level MarketSnapshots to improve local accuracy.
 */

import Array    "mo:core/Array";
import Blob     "mo:core/Blob";
import List     "mo:core/List";
import Map      "mo:core/Map";
import Int      "mo:core/Int";
import Nat      "mo:core/Nat";
import Option   "mo:core/Option";
import Order    "mo:core/Order";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Set      "mo:core/Set";
import Text     "mo:core/Text";
import Time     "mo:core/Time";
import Cycles   "mo:core/Cycles";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Score "../shared/Score";
import Canisters "../shared/Canisters";
import ThresholdCost "../shared/ThresholdCost";
import Inspect "../shared/Inspect";

persistent actor MarketIntelligence {

  // ─── Input Types ──────────────────────────────────────────────────────────────

  /// Lightweight job summary the frontend passes in — no canister call needed.
  public type JobSummary = {
    serviceType:   Text;   // "HVAC" | "Roofing" | "Plumbing" | "Electrical" | "Windows" | "Flooring" | ...
    completedYear: Nat;    // 4-digit year, e.g. 2022
    amountCents:   Nat;
    isDiy:         Bool;
    isVerified:    Bool;
  };

  /// Full snapshot of one property's profile + job history.
  public type PropertyJobSummary = {
    propertyId:   Text;
    yearBuilt:    Nat;
    squareFeet:   Nat;
    propertyType: Text;   // "SingleFamily" | "Condo" | "Townhouse" | "MultiFamily"
    state:        Text;   // 2-letter abbreviation, e.g. "TX"
    zipCode:      Text;
    jobs:         [JobSummary];
  };

  /// Lightweight profile used for project recommendation calls.
  public type PropertyProfile = {
    yearBuilt:    Nat;
    squareFeet:   Nat;
    propertyType: Text;
    state:        Text;
    zipCode:      Text;
  };

  // ─── Output Types ─────────────────────────────────────────────────────────────

  public type DimensionScore = {
    score:  Nat;   // 0-100
    grade:  Text;  // "A" | "B" | "C" | "D" | "F"
    detail: Text;  // human-readable explanation
  };

  public type CompetitiveAnalysis = {
    maintenanceScore:    DimensionScore;
    systemModernization: DimensionScore;
    verificationDepth:   DimensionScore;
    overallScore:        Nat;    // weighted composite 0-100
    overallGrade:        Text;
    rankOutOf:           Nat;    // subject's rank among all (1 = best)
    totalCompared:       Nat;
    strengths:           [Text];
    improvements:        [Text];
  };

  public type Priority = { #High; #Medium; #Low };

  public type ProjectRecommendation = {
    name:                Text;
    category:            Text;
    estimatedCostCents:  Nat;
    estimatedRoiPercent: Nat;   // e.g. 96 = 96 %
    estimatedGainCents:  Nat;   // cost × roi / 100
    paybackMonths:       Nat;
    priority:            Priority;
    rationale:           Text;
    requiresPermit:      Bool;
  };

  public type MarketSnapshot = {
    zipCode:           Text;
    medianSaleCents:   Nat;    // median sale price in cents
    medianDaysOnMarket: Nat;
    pricePerSqFtCents: Nat;
    marketTrend:       { #Rising; #Stable; #Declining };
    recordedAt:        Time.Time;
  };

  // ─── Neighbourhood Score Types (4.3.4) ───────────────────────────────────────

  /// Individual score record stored per homeowner. Never returned by a public query;
  /// only accessible through getMyScoreEncrypted (vetKeys-gated).
  public type StoredScore = {
    score:     Nat;          // composite 0-100
    zipCode:   Text;
    updatedAt: Time.Time;
  };

  /// Zip-level aggregate — the only publicly queryable form of score data.
  public type ZipStats = {
    zipCode:    Text;
    mean:       Nat;
    median:     Nat;
    sampleSize: Nat;
    grade:      Text;
  };

  /// Returned by getMyScoreEncrypted.
  /// encryptedKey is the caller's vetKey encrypted to their transport public key.
  /// score + zipCode are the authenticated plaintext payload for this MVP;
  /// a future upgrade can store IBE ciphertext instead.
  public type ScoreEnvelope = {
    encryptedKey: Blob;
    score:        Nat;
    zipCode:      Text;
    updatedAt:    Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  public type Metrics = {
    marketSnapshotCount: Nat;
    scoreCount:          Nat;
    isPaused:            Bool;
  };

  // ─── vetKeys Management Canister Interface ────────────────────────────────────
  // Direct management canister calls per ICP vetKeys skill guidance.

  type VetKdCurve = { #bls12_381_g2 };
  type VetKdKeyId = { curve : VetKdCurve; name : Text };
  type VetKdPublicKeyRequest = {
    canister_id        : ?Principal;
    context            : Blob;
    key_id             : VetKdKeyId;
  };
  type VetKdPublicKeyResponse = { public_key : Blob };
  type VetKdDeriveKeyRequest = {
    input                : Blob;
    context              : Blob;
    transport_public_key : Blob;
    key_id               : VetKdKeyId;
  };
  type VetKdDeriveKeyResponse = { encrypted_key : Blob };

  transient let managementCanister : actor {
    vetkd_public_key : VetKdPublicKeyRequest -> async VetKdPublicKeyResponse;
    vetkd_derive_key : VetKdDeriveKeyRequest -> async VetKdDeriveKeyResponse;
  } = actor "aaaaa-aa";

  // Domain separator — "hg-score-v1" as UTF-8 bytes.
  // Must match the context value used on the frontend with @dfinity/vetkeys.
  transient let SCORE_CONTEXT : Blob = Array.toBlob([
    0x68, 0x67, 0x2D, 0x73, 0x63, 0x6F, 0x72, 0x65, 0x2D, 0x76, 0x31
  ]);

  // Use "test_key_1" locally and on testnet (~10B cycles per derive call).
  // Switch to "key_1" for mainnet production (~26B cycles per derive call).
  /// vetKD master key. "test_key_1" is the IC's test key; production deploys set
  /// "key_1" via setVetkdKeyName (scripts/deploy.sh does this for ic). Stored —
  /// not a constant — so it can be changed without reinstalling.
  private var vetkdKeyName : Text = "test_key_1";
  /// H2/V-1: vetkd_derive_key fee, as the IC prices it for this key (a flat
  /// 10B made every key_1 derive fail). Unused cycles are refunded.
  private func vetkdDeriveCycles() : Nat { ThresholdCost.vetkdDerive(vetkdKeyName) };
  /// M12: per-principal cap on vetKD derives (each one burns cycles).
  private let deriveLimits = Map.empty<Principal, (Nat, Int)>();
  /// CD-2 (cycle-drain audit 2026-10-31): 3 a day is plenty to read your own
  /// score; the canister-wide budget below is what bounds spend, since
  /// principals are free.
  transient let MAX_DERIVES_PER_DAY : Nat = 3;
  transient let MAX_DERIVES_PER_DAY_TOTAL : Nat = 200;
  transient let deriveBudget = ThresholdCost.newBudget();
  transient let ONE_DAY_NS : Int = 86_400_000_000_000;
  /// M12: zip aggregates are suppressed below this many submitters, so a
  /// lone submitter's exact score isn't published.
  transient let MIN_ZIP_SAMPLE : Nat = 5;
  transient let MAX_SCORE_JOBS : Nat = 500;

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var isPaused:          Bool = false;
  private var pauseExpiryNs:     ?Int = null;
  private var adminListEntries: [Principal] = [];
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce: ?Text = null;
  /// Canister IDs for computePropertyScore — set post-deploy via setXxxCanisterId().
  private var propCanisterId : Text = "";
  private var jobCanisterId  : Text = "";
  /// M12: the listing canister may compute any property's score (FSBO index).
  private var listingCanisterId : Text = "";
  /// R2: the report canister computes the score it stores on certificates.
  private var reportCanisterId : Text = "";
  // ─── Stable State ────────────────────────────────────────────────────────────

  private let snapshots  = Map.empty<Text, MarketSnapshot>();

  // Neighbourhood score store (4.3.4).
  // All let/var declarations in a persistent actor are automatically stable —
  // no upgrade hooks needed per stable-memory skill guidance.
  private let scoreStore = Map.empty<Principal, StoredScore>();
  /// Legacy zip → [principals] index. postupgrade moves it into zipMembers and
  /// empties it; kept declared because dropping a stable variable is a
  /// stable-memory break (CLAUDE.md).
  private let zipIndex   = Map.empty<Text, [Principal]>();
  /// CD-10 (cycle-drain audit 2026-10-31): zip → principals scored there, as
  /// a set. The array copied itself on every join and was scanned on every
  /// move and deletion. A principal is only ever in its current score's zip.
  private let zipMembers = Map.empty<Text, Set.Set<Principal>>();

  private func joinZip(zip : Text, p : Principal) {
    switch (zipMembers.get(zip)) {
      case (?set) { set.add(Principal.compare, p) };
      case null {
        let set = Set.empty<Principal>();
        set.add(Principal.compare, p);
        zipMembers.add(zip, set);
      };
    };
  };

  private func leaveZip(zip : Text, p : Principal) {
    switch (zipMembers.get(zip)) {
      case (?set) {
        set.remove(Principal.compare, p);
        if (set.isEmpty()) zipMembers.remove(zip);
      };
      case null {};
    };
  };

  /// One-time, idempotent: move the legacy array index into zipMembers. Once
  /// zipIndex is empty this does nothing.
  system func postupgrade() {
    for ((zip, ps) in zipIndex.entries()) {
      for (p in ps.values()) { joinZip(zip, p) };
    };
    zipIndex.clear();
  };

  // ─── Embedded ROI / Lifespan Tables ──────────────────────────────────────────
  //
  // Source: Remodeling Magazine 2024 Cost vs Value (national averages).
  // Costs in cents; ROI expressed as an integer percentage (96 = 96 %).

  private type ProjectTemplate = {
    name:            Text;
    category:        Text;    // matches JobSummary.serviceType for dedup check
    baseCostCents:   Nat;
    roiPercent:      Nat;
    paybackMonths:   Nat;
    requiresPermit:  Bool;
    minPropertyAge:  Nat;     // 0 = always eligible; N = only if yearBuilt ≤ currentYear - N
  };

  private transient let PROJECT_TEMPLATES : [ProjectTemplate] = [
    { name = "Energy Efficiency Upgrade";   category = "Insulation"; baseCostCents = 400_000;   roiPercent = 102; paybackMonths = 12; requiresPermit = false; minPropertyAge = 10 },
    { name = "Hardwood Floor Refinish";     category = "Flooring";   baseCostCents = 500_000;   roiPercent = 147; paybackMonths = 8;  requiresPermit = false; minPropertyAge = 5  },
    { name = "Minor Kitchen Remodel";       category = "Kitchen";    baseCostCents = 2_700_000; roiPercent = 96;  paybackMonths = 18; requiresPermit = true;  minPropertyAge = 0  },
    { name = "Curb Appeal / Landscaping";   category = "Landscaping";baseCostCents = 500_000;   roiPercent = 87;  paybackMonths = 14; requiresPermit = false; minPropertyAge = 0  },
    { name = "HVAC Replacement";            category = "HVAC";       baseCostCents = 1_200_000; roiPercent = 85;  paybackMonths = 24; requiresPermit = true;  minPropertyAge = 15 },
    { name = "Bathroom Remodel";            category = "Bathroom";   baseCostCents = 2_500_000; roiPercent = 74;  paybackMonths = 20; requiresPermit = true;  minPropertyAge = 0  },
    { name = "Window Replacement";          category = "Windows";    baseCostCents = 2_000_000; roiPercent = 69;  paybackMonths = 28; requiresPermit = true;  minPropertyAge = 20 },
    { name = "Roof Replacement";            category = "Roofing";    baseCostCents = 3_000_000; roiPercent = 61;  paybackMonths = 36; requiresPermit = true;  minPropertyAge = 20 },
    { name = "Solar Installation";          category = "Solar";      baseCostCents = 2_500_000; roiPercent = 50;  paybackMonths = 60; requiresPermit = true;  minPropertyAge = 0  },
  ];

  // System lifespans in years (used for modernization scoring).
  private type SystemLifespan = { category: Text; lifespanYears: Nat; weight: Nat };

  private transient let SYSTEM_LIFESPANS : [SystemLifespan] = [
    { category = "HVAC";      lifespanYears = 18; weight = 25 },
    { category = "Roofing";   lifespanYears = 25; weight = 25 },
    { category = "Plumbing";  lifespanYears = 50; weight = 15 },
    { category = "Electrical";lifespanYears = 35; weight = 15 },
    { category = "Windows";   lifespanYears = 22; weight = 10 },
    { category = "Flooring";  lifespanYears = 25; weight = 10 },
  ];

  // State market multipliers (percentage applied on top of base ROI).
  // Hot / appreciating markets see ROI captured faster.
  private func stateMultiplier(state: Text) : Nat {
    let hot    = ["CA", "NY", "MA", "WA", "OR", "CO"];
    let warm   = ["TX", "FL", "AZ", "GA", "NC", "TN", "NV"];
    if (Option.isSome(hot.find(func(s) { s == state }))) { 115 }
    else if (Option.isSome(warm.find(func(s) { s == state }))) { 108 }
    else { 100 }
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    Inspect.accept(caller, arg, Inspect.MAX_ARG_BYTES)
  };


  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(p: Principal) : Bool {
    Admin.contains(adminListEntries, p)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func currentYear() : Nat { Score.yearOf(Time.now()) };

  private func scoreGrade(score: Nat) : Text {
    if      (score >= 90) "A"
    else if (score >= 80) "B"
    else if (score >= 65) "C"
    else if (score >= 50) "D"
    else                  "F"
  };

  private func scoreDetail(score: Nat) : Text {
    if      (score >= 90) "Excellent — top tier maintenance record"
    else if (score >= 80) "Good — well-maintained with minor gaps"
    else if (score >= 65) "Fair — some documentation present"
    else if (score >= 50) "Below average — buyers may discount asking price"
    else                  "Needs attention — little or no verifiable history"
  };

  // The score formula lives in shared/Score.mo (mirrored by
  // packages/shared/src/score.ts for the apps), so every surface agrees.
  private func maintenanceScore(jobs: [JobSummary]) : Nat { Score.maintenance(jobs) };
  private func modernizationScore(jobs: [JobSummary], yearBuilt: Nat) : Nat {
    Score.modernization(jobs, yearBuilt, currentYear())
  };
  private func verificationDepth(jobs: [JobSummary]) : Nat { Score.verification(jobs) };
  private func compositeScore(m: Nat, mod: Nat, v: Nat) : Nat { Score.combine(m, mod, v) };

  // ─── Core: Competitive Analysis ───────────────────────────────────────────────

  /// Compare a subject property against a set of comparable properties.
  /// Returns a scored, graded competitive analysis with strengths and improvement areas.
  ///
  /// Call this with the subject property first, then pass all comparison properties
  /// (typically 3-5 nearby homes at similar price/size).
  public query func analyzeCompetitivePosition(
    subject: PropertyJobSummary,
    comparisons: [PropertyJobSummary]
  ) : async CompetitiveAnalysis {

    // Score subject
    let mS   = maintenanceScore(subject.jobs);
    let modS = modernizationScore(subject.jobs, subject.yearBuilt);
    let vS   = verificationDepth(subject.jobs);
    let compS = compositeScore(mS, modS, vS);

    // Score each comparison and build ranked list
    type Scored = { id: Text; score: Nat };
    let allScores : [Scored] = comparisons.map(
      func(c) {
        let cm   = maintenanceScore(c.jobs);
        let cmod = modernizationScore(c.jobs, c.yearBuilt);
        let cv   = verificationDepth(c.jobs);
        { id = c.propertyId; score = compositeScore(cm, cmod, cv) }
      }
    );

    // Count how many comparisons beat the subject
    let beatenBy = allScores.filter(func(s) { s.score > compS }).size();
    let rank = beatenBy + 1;   // 1-indexed, lower = better
    let total = comparisons.size() + 1;

    // Strengths: dimensions ≥ 70
    var strengths : [Text] = [];
    if (mS   >= 70) { strengths := strengths.concat(["Strong documented maintenance history"]) };
    if (modS >= 70) { strengths := strengths.concat(["Systems are modern and recently updated"]) };
    if (vS   >= 70) { strengths := strengths.concat(["High proportion of blockchain-verified records"]) };

    // Improvements: dimensions < 50
    var improvements : [Text] = [];
    if (mS   < 50) { improvements := improvements.concat(["Add maintenance records — buyers discount undocumented homes 3-5 %"]) };
    if (modS < 50) { improvements := improvements.concat(["Key systems may be near end-of-life — consider targeted upgrades"]) };
    if (vS   < 50) { improvements := improvements.concat(["Get existing jobs co-signed to boost buyer confidence"]) };

    if (strengths.size() == 0 and improvements.size() == 0) {
      improvements := ["Logging more jobs will increase your competitive score"];
    };

    {
      maintenanceScore    = { score = mS;   grade = scoreGrade(mS);   detail = scoreDetail(mS)   };
      systemModernization = { score = modS; grade = scoreGrade(modS); detail = scoreDetail(modS) };
      verificationDepth   = { score = vS;   grade = scoreGrade(vS);   detail = scoreDetail(vS)   };
      overallScore        = compS;
      overallGrade        = scoreGrade(compS);
      rankOutOf           = rank;
      totalCompared       = total;
      strengths;
      improvements;
    }
  };

  // ─── Core: Project Recommendations ───────────────────────────────────────────

  /// Return budget-filtered, ROI-ranked improvement projects for a property.
  ///
  /// Projects already documented in the job history within their expected lifespan
  /// are excluded automatically. ROI is adjusted for the state's market multiplier.
  public query func recommendValueAddingProjects(
    profile:     PropertyProfile,
    currentJobs: [JobSummary],
    budget:      Nat   // max cost in cents; 0 = no budget cap
  ) : async [ProjectRecommendation] {

    let year      = currentYear();
    let propAgeInt : Int = (year : Int) - (profile.yearBuilt : Int);
    let propAge    : Nat = if (propAgeInt > 0) Int.abs(propAgeInt) else 0;
    let stateMult = stateMultiplier(profile.state);
    let zipSnap   = snapshots.get(profile.zipCode);

    // Market premium for zip: if median price > national average ($400K) scale up slightly
    let zipPremium : Nat = switch (zipSnap) {
      case null    { 100 };
      case (?snap) {
        if      (snap.medianSaleCents >= 100_000_000) { 115 }  // ≥ $1M
        else if (snap.medianSaleCents >= 60_000_000)  { 108 }  // ≥ $600K
        else                                          { 100 }
      };
    };

    let recsBuf = List.empty<ProjectRecommendation>();

    for (tmpl in PROJECT_TEMPLATES.values()) {

      // 1. Property must be old enough to need this project
      if (propAge < tmpl.minPropertyAge) {
        // Skip — property too new
      } else {

        // 2. Check if it's already been done within its expected lifespan
        let lifespan = switch (
          SYSTEM_LIFESPANS.find(func(s) { s.category == tmpl.category })
        ) {
          case null    { 999 };   // no lifespan entry = never auto-skip
          case (?sys)  { sys.lifespanYears };
        };

        let alreadyDone = Option.isSome(currentJobs.find(func(j) {
          j.serviceType == tmpl.category
          and j.completedYear + lifespan > year   // within remaining lifespan
        }));

        if (alreadyDone) {
          // Skip — recently done
        } else {

          // 3. Apply state + zip multipliers to cost and roi
          let adjustedCost = tmpl.baseCostCents * stateMult / 100;
          if (budget > 0 and adjustedCost > budget) {
            // Skip — over budget
          } else {

            let adjustedRoi  = tmpl.roiPercent * stateMult / 100 * zipPremium / 100;
            let estimatedGain = adjustedCost * adjustedRoi / 100;

            // 4. Assign priority
            let urgency = propAge >= tmpl.minPropertyAge + 10;  // 10 yrs past threshold = urgent
            let highRoi  = adjustedRoi >= 85;
            let priority : Priority =
              if (urgency and highRoi) #High
              else if (urgency or highRoi) #Medium
              else #Low;

            // 5. Generate rationale
            let ageNote = if (propAge > 0)
              "Your home is " # propAge.toText() # " years old. "
              else "";
            let roiNote = "National average ROI: " # adjustedRoi.toText() # " %.";
            let stateNote = if (stateMult > 100)
              " " # profile.state # " markets typically realize value faster."
              else "";

            let rationale = ageNote # roiNote # stateNote;

            recsBuf.add({
              name                = tmpl.name;
              category            = tmpl.category;
              estimatedCostCents  = adjustedCost;
              estimatedRoiPercent = adjustedRoi;
              estimatedGainCents  = estimatedGain;
              paybackMonths       = tmpl.paybackMonths;
              priority;
              rationale;
              requiresPermit      = tmpl.requiresPermit;
            });
          }
        }
      }
    };

    // Sort descending by adjustedRoi (higher ROI first)
    recsBuf.toArray().sort(
      func(a, b) : Order.Order {
        if      (a.estimatedRoiPercent > b.estimatedRoiPercent) #less     // reversed for descending
        else if (a.estimatedRoiPercent < b.estimatedRoiPercent) #greater
        else                                                    #equal
      }
    )
  };

  // ─── On-Chain Property Score ─────────────────────────────────────────────────

  /// Compute the composite HomeGentic score (0-100) for a property by fetching
  /// its job history and yearBuilt cross-canister, then applying the same
  /// maintenance/modernization/verification formula used in analyzeCompetitivePosition.
  ///
  /// Returns null when either canister is not yet wired, the property is not found,
  /// or the job list is empty (score would be 0, indistinguishable from no data).
  /// Listing canister calls this during activateFsboListing so the FSBO buyer index
  /// always shows an authoritative on-chain score rather than a caller-supplied value.
  ///
  /// M12: restricted to admins, the wired listing canister, the wired report
  /// canister (R2: score certificates), and principals authorised on the
  /// property (owner/manager/viewer). Anyone else gets null.
  /// The inputs are read on-chain (property yearBuilt, job snapshots from the
  /// job canister, whose isVerified excludes unverified-contractor signatures);
  /// nothing is taken from the caller.
  public shared(msg) func computePropertyScore(propertyId: Text) : async ?Nat {
    if (propCanisterId == "" or jobCanisterId == "") return null;
    let callerText = msg.caller.toText();
    let trusted = isAdmin(msg.caller)
      or (listingCanisterId != "" and callerText == listingCanisterId)
      or (reportCanisterId  != "" and callerText == reportCanisterId);
    if (not trusted) {
      switch (requireActive(msg.caller)) { case (#err(_)) return null; case _ {} };
      let authActor = Canisters.property(propCanisterId);
      if (not (await authActor.isAuthorized(propertyId, msg.caller, false))) return null;
    };

    let propActor = actor(propCanisterId) : actor {
      getPropertyYearBuilt : query (Text) -> async ?Nat;
    };
    let jobActor = actor(jobCanisterId) : actor {
      getJobSnapshotsForProperty : query (Text) -> async [JobSummary];
    };

    let yearBuilt = switch (await propActor.getPropertyYearBuilt(propertyId)) {
      case null    { return null };
      case (?y)    { y };
    };

    let snapshots = await jobActor.getJobSnapshotsForProperty(propertyId);
    if (snapshots.size() == 0) return null;

    let score = compositeScore(
      maintenanceScore(snapshots),
      modernizationScore(snapshots, yearBuilt),
      verificationDepth(snapshots),
    );
    ?score
  };

  // ─── Market Snapshot Management ───────────────────────────────────────────────

  /// Push a zip-level market snapshot. Admin only.
  public shared(msg) func recordMarketSnapshot(
    zipCode:            Text,
    medianSaleCents:    Nat,
    medianDaysOnMarket: Nat,
    pricePerSqFtCents:  Nat,
    trend:              { #Rising; #Stable; #Declining }
  ) : async Result.Result<MarketSnapshot, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(zipCode) == 0)  return #err(#InvalidInput("zipCode cannot be empty"));
    if (Text.size(zipCode) > 20)  return #err(#InvalidInput("zipCode exceeds 20 characters"));

    let snap : MarketSnapshot = {
      zipCode;
      medianSaleCents;
      medianDaysOnMarket;
      pricePerSqFtCents;
      marketTrend = trend;
      recordedAt  = Time.now();
    };
    snapshots.add(zipCode, snap);
    #ok(snap)
  };

  /// Retrieve the latest market snapshot for a zip code.
  public query func getMarketSnapshot(zipCode: Text) : async Result.Result<MarketSnapshot, Error> {
    switch (snapshots.get(zipCode)) {
      case null    { #err(#NotFound) };
      case (?snap) { #ok(snap) };
    }
  };

  // ─── Neighbourhood Score (4.3.4) ─────────────────────────────────────────────

  /// The last space-separated part of a property's address, which is its zip
  /// (property.getPropertyAddress ends "… ST 12345", and property only
  /// accepts 5-digit or ZIP+4 zips).
  private func zipOfAddress(address : Text) : ?Text {
    var last : ?Text = null;
    for (part in address.split(#char ' ')) { if (part != "") last := ?part };
    last
  };

  /// Homeowner asks the canister to score one of their properties. The score
  /// is computed here from the property and job canisters' own records, so a
  /// caller can't post made-up jobs or a made-up zip (CD-2, CD-10: throwaway
  /// principals used to be able to store a score, then burn a vetKD derive a
  /// day each, and skew zip averages). The caller needs write access to the
  /// property, and the property needs at least one job. Individual scores are
  /// never exposed via public query — only zip-level aggregates are public.
  /// Use getMyScoreEncrypted to read back your own score.
  public shared(msg) func submitScore(propertyId : Text) : async Result.Result<StoredScore, Error> {
    let caller = msg.caller;
    switch (requireActive(caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0 or Text.size(propertyId) > 200)
      return #err(#InvalidInput("propertyId must be 1-200 characters"));
    if (propCanisterId == "" or jobCanisterId == "")
      return #err(#InvalidInput("Scores are not available yet"));

    if (not (await Canisters.property(propCanisterId).isAuthorized(propertyId, caller, true)))
      return #err(#NotAuthorized);

    let propActor = actor(propCanisterId) : actor {
      getPropertyYearBuilt : query (Text) -> async ?Nat;
      getPropertyAddress   : query (Text) -> async ?Text;
    };
    let jobActor = actor(jobCanisterId) : actor {
      getJobSnapshotsForProperty : query (Text) -> async [JobSummary];
    };
    let yearBuilt = switch (await propActor.getPropertyYearBuilt(propertyId)) {
      case null { return #err(#NotFound) };
      case (?y) { y };
    };
    let zipCode = switch (await propActor.getPropertyAddress(propertyId)) {
      case null { return #err(#NotFound) };
      case (?a) {
        switch (zipOfAddress(a)) { case (?z) z; case null { return #err(#NotFound) } }
      };
    };
    if (Text.size(zipCode) > 20) return #err(#InvalidInput("zipCode exceeds 20 characters"));
    let jobs = await jobActor.getJobSnapshotsForProperty(propertyId);
    if (jobs.size() == 0) return #err(#InvalidInput("Add a job to this home before scoring it"));
    let scored = if (jobs.size() > MAX_SCORE_JOBS) Array.sliceToArray(jobs, 0, MAX_SCORE_JOBS) else jobs;

    let score = compositeScore(
      maintenanceScore(scored),
      modernizationScore(scored, yearBuilt),
      verificationDepth(scored),
    );

    // State is read again here, after the awaits: another submitScore from
    // the same caller may have moved them to a different zip meanwhile.
    switch (scoreStore.get(caller)) {
      case (?old) {
        if (old.zipCode != zipCode) leaveZip(old.zipCode, caller);
      };
      case null {};
    };

    let stored : StoredScore = { score; zipCode; updatedAt = Time.now() };
    scoreStore.add(caller, stored);

    joinZip(zipCode, caller);

    #ok(stored)
  };

  /// Public zip-level aggregate statistics.
  /// Never exposes individual scores or principals — only mean, median, and sample size.
  public query func getZipStats(zipCode: Text) : async Result.Result<ZipStats, Error> {
    let principals = switch (zipMembers.get(zipCode)) {
      case (?set) set;
      case null { return #err(#NotFound) };
    };

    let scoresBuf = List.empty<Nat>();
    for (p in principals.values()) {
      switch (scoreStore.get(p)) {
        case (?s) { scoresBuf.add(s.score) };
        case null {};
      };
    };
    if (scoresBuf.size() < MIN_ZIP_SAMPLE) return #err(#NotFound);  // M12: k-anonymity

    var total : Nat = 0;
    scoresBuf.forEach(func(s : Nat) { total += s });
    let mean = total / scoresBuf.size();

    let sorted = scoresBuf.toArray().sort();
    let n = sorted.size();
    let median = if (n % 2 == 1) {
      sorted[n / 2]
    } else {
      (sorted[(n / 2) - 1] + sorted[n / 2]) / 2
    };

    #ok({ zipCode; mean; median; sampleSize = scoresBuf.size(); grade = scoreGrade(median) })
  };

  /// Returns the canister's vetKeys public key for the neighbourhood score context.
  /// The frontend uses this to verify decrypted vetKeys via DerivedPublicKey.deserialize.
  /// vetkd_public_key requires no cycles.
  public func getNeighborhoodPublicKey() : async Blob {
    let response = await managementCanister.vetkd_public_key({
      canister_id = null;
      context     = SCORE_CONTEXT;
      key_id      = { curve = #bls12_381_g2; name = vetkdKeyName };
    });
    response.public_key
  };

  /// Returns the caller's stored score encrypted to their transport public key
  /// via vetKeys key derivation. The encryptedKey allows the frontend to prove
  /// the canister issued this response for this specific principal.
  ///
  /// Caller must have previously called submitScore. Costs one vetkd_derive_key fee.
  public shared(msg) func getMyScoreEncrypted(
    transportPublicKey: Blob,
  ) : async Result.Result<ScoreEnvelope, Error> {
    // Capture caller before await — required per vetKeys skill guidance.
    let caller = msg.caller;
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    // M12: pause + per-minute limit, then a per-day derive cap.
    switch (requireActive(caller)) { case (#err(e)) return #err(e); case _ {} };

    let stored = switch (scoreStore.get(caller)) {
      case null    { return #err(#NotFound) };
      case (?s)    { s };
    };

    // CD-2: never attach more cycles than the canister can spare.
    if (not ThresholdCost.affordable(Cycles.balance(), vetkdDeriveCycles()))
      return #err(#InvalidInput("Encrypted scores are unavailable right now. Please try again later."));

    if (not isAdmin(caller)) {
      let now = Time.now();
      let next : (Nat, Int) = switch (deriveLimits.get(caller)) {
        case (?(count, start)) {
          if (now - start < ONE_DAY_NS) {
            if (count >= MAX_DERIVES_PER_DAY) return #err(#InvalidInput("Daily encrypted-score limit reached"));
            (count + 1, start)
          } else { (1, now) };
        };
        case null { (1, now) };
      };
      // CD-2: canister-wide daily budget, checked before the caller's slot is
      // used so a refusal here doesn't cost them one.
      if (not ThresholdCost.take(deriveBudget, now, MAX_DERIVES_PER_DAY_TOTAL))
        return #err(#InvalidInput("Encrypted scores are busy today. Please try again tomorrow."));
      deriveLimits.add(caller, next);
    };

    let response = await (with cycles = vetkdDeriveCycles()) managementCanister.vetkd_derive_key({
      input                = caller.toBlob();
      context              = SCORE_CONTEXT;
      transport_public_key = transportPublicKey;
      key_id               = { curve = #bls12_381_g2; name = vetkdKeyName };
    });

    #ok({
      encryptedKey = response.encrypted_key;
      score        = stored.score;
      zipCode      = stored.zipCode;
      updatedAt    = stored.updatedAt;
    })
  };

  // ─── Account Deletion ─────────────────────────────────────────────────────────

  /// Account deletion: removes everything this canister holds for the caller.
  /// Returns how many records were removed.
  ///
  /// Deletes the caller's stored neighbourhood score and drops the caller from
  /// that score's zip (CD-6: no scan over every zip). The per-day vetKD derive counter (deriveLimits) is
  /// kept until it expires so deletion can't be used to reset the cycle cap.
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    let caller = msg.caller;

    switch (scoreStore.get(caller)) {
      case (?s) {
        scoreStore.remove(caller);
        leaveZip(s.zipCode, caller);
        #ok(1)
      };
      case null { #ok(0) };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Wire the property canister for yearBuilt lookups in computePropertyScore.
  /// Select the vetKD master key ("key_1" in production). Admin only.
  public shared(msg) func setVetkdKeyName(name: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (name != "key_1" and name != "test_key_1" and name != "dfx_test_key")
      return #err(#InvalidInput("unknown vetKD key name"));
    vetkdKeyName := name;
    #ok(())
  };

  public query func getVetkdKeyName() : async Text { vetkdKeyName };

  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id;
    #ok(())
  };

  /// M12: wire the listing canister, the only non-admin canister allowed to
  /// compute arbitrary properties' scores (FSBO activation).
  public shared(msg) func setListingCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    listingCanisterId := id;
    #ok(())
  };

  /// R2: wire the report canister so issueCert can compute the on-chain score.
  public shared(msg) func setReportCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    reportCanisterId := id;
    #ok(())
  };

  /// Wire the job canister for job-snapshot lookups in computePropertyScore.
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id;
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once the admin list is initialized, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminListEntries.size() > 0, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminListEntries.size() > 0, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    adminListEntries := Admin.add(adminListEntries, newAdmin);
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Admin.remove(adminListEntries, target);
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

  public query func getMetrics() : async Metrics {
    {
      marketSnapshotCount = snapshots.size();
      scoreCount          = scoreStore.size();
      isPaused;
    }
  };
}
