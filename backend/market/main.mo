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
import Map      "mo:core/Map";
import Int      "mo:core/Int";
import Nat      "mo:core/Nat";
import Option   "mo:core/Option";
import Order    "mo:core/Order";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Text     "mo:core/Text";
import Time     "mo:core/Time";

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
    #Unauthorized;
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

  let managementCanister : actor {
    vetkd_public_key : VetKdPublicKeyRequest -> async VetKdPublicKeyResponse;
    vetkd_derive_key : VetKdDeriveKeyRequest -> async VetKdDeriveKeyResponse;
  } = actor "aaaaa-aa";

  // Domain separator — "hg-score-v1" as UTF-8 bytes.
  // Must match the context value used on the frontend with @dfinity/vetkeys.
  let SCORE_CONTEXT : Blob = Blob.fromArray([
    0x68, 0x67, 0x2D, 0x73, 0x63, 0x6F, 0x72, 0x65, 0x2D, 0x76, 0x31
  ]);

  // Use "test_key_1" locally and on testnet (~10B cycles per derive call).
  // Switch to "key_1" for mainnet production (~26B cycles per derive call).
  let VETKD_KEY_NAME   : Text = "test_key_1";
  let VETKD_KEY_CYCLES : Nat  = 10_000_000_000;

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var isPaused:          Bool = false;
  private var pauseExpiryNs:     ?Int = null;
  private var adminListEntries: [Principal] = [];
  // ─── Stable State ────────────────────────────────────────────────────────────

  private let snapshots  = Map.empty<Text, MarketSnapshot>();

  // Neighbourhood score store (4.3.4).
  // All let/var declarations in a persistent actor are automatically stable —
  // no upgrade hooks needed per stable-memory skill guidance.
  private let scoreStore = Map.empty<Principal, StoredScore>();
  // zip → [principals] index for O(1) zip lookup during aggregation.
  private let zipIndex   = Map.empty<Text, [Principal]>();

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

  private let PROJECT_TEMPLATES : [ProjectTemplate] = [
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

  private let SYSTEM_LIFESPANS : [SystemLifespan] = [
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
    if (Option.isSome(Array.find<Text>(hot,  func(s) { s == state }))) { 115 }
    else if (Option.isSome(Array.find<Text>(warm, func(s) { s == state }))) { 108 }
    else { 100 }
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private transient let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
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
    if (isAdmin(caller)) return true;
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

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#Unauthorized);
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

  private func currentYear() : Nat {
    let secsPerYear : Nat = 31_536_000;
    let secsSinceEpoch = Int.abs(Time.now()) / 1_000_000_000;
    1970 + secsSinceEpoch / secsPerYear
  };

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

  // Maintenance score: weighted coverage of key systems.
  // Each system has a weight; documented + verified jobs earn full weight.
  private func maintenanceScore(jobs: [JobSummary]) : Nat {
    let systems : [(Text, Nat)] = [
      ("HVAC",       25),
      ("Roofing",    25),
      ("Plumbing",   15),
      ("Electrical", 15),
      ("Windows",    10),
      ("other",      10),
    ];

    var total : Nat = 0;

    for ((sysName, weight) in systems.vals()) {
      // Find best job for this system (prefer verified)
      let match = Array.find<JobSummary>(jobs, func(j) {
        if (sysName == "other") {
          not (j.serviceType == "HVAC"       or
               j.serviceType == "Roofing"    or
               j.serviceType == "Plumbing"   or
               j.serviceType == "Electrical" or
               j.serviceType == "Windows")
        } else {
          j.serviceType == sysName
        }
      });
      switch (match) {
        case null    { /* no job — 0 contribution */ };
        case (?job)  {
          // verified = full points, completed/DIY = 80%, other statuses = 50%
          let factor = if (job.isVerified) 10
                       else if (job.isDiy) 8  // DIY homeowner verified = trusted
                       else 5;
          total += weight * factor / 10;
        };
      };
    };
    total  // 0-100
  };

  // Modernization score: weighted freshness of each key system.
  private func modernizationScore(jobs: [JobSummary], yearBuilt: Nat) : Nat {
    let year = currentYear();
    var weightedSum : Nat = 0;
    var totalWeight : Nat = 0;

    for (sys in SYSTEM_LIFESPANS.vals()) {
      totalWeight += sys.weight;

      // Find most recent job year for this system
      let lastYear : Nat = switch (
        Array.find<JobSummary>(jobs, func(j) { j.serviceType == sys.category })
      ) {
        case null    { yearBuilt };   // assume original if never replaced
        case (?job)  { job.completedYear };
      };

      let ageInt : Int = (year : Int) - (lastYear : Int);
      let age    : Nat = if (ageInt > 0) Int.abs(ageInt) else 0;

      // Score = remaining life fraction × 100, clamped to 0-100
      let fraction : Nat = if (age >= sys.lifespanYears) {
        0
      } else {
        (sys.lifespanYears - age) * 100 / sys.lifespanYears
      };
      weightedSum += sys.weight * fraction;
    };

    if (totalWeight == 0) 0 else weightedSum / totalWeight
  };

  // Verification depth: % of jobs that are on-chain verified.
  private func verificationDepth(jobs: [JobSummary]) : Nat {
    if (jobs.size() == 0) return 0;
    let verified = Array.filter<JobSummary>(jobs, func(j) { j.isVerified }).size();
    verified * 100 / jobs.size()
  };

  // Composite score: maintenance 40 %, modernization 35 %, verification 25 %.
  private func compositeScore(m: Nat, mod: Nat, v: Nat) : Nat {
    (m * 40 + mod * 35 + v * 25) / 100
  };

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
    let allScores : [Scored] = Array.map<PropertyJobSummary, Scored>(
      comparisons,
      func(c) {
        let cm   = maintenanceScore(c.jobs);
        let cmod = modernizationScore(c.jobs, c.yearBuilt);
        let cv   = verificationDepth(c.jobs);
        { id = c.propertyId; score = compositeScore(cm, cmod, cv) }
      }
    );

    // Count how many comparisons beat the subject
    let beatenBy = Array.filter<Scored>(allScores, func(s) { s.score > compS }).size();
    let rank = beatenBy + 1;   // 1-indexed, lower = better
    let total = comparisons.size() + 1;

    // Strengths: dimensions ≥ 70
    var strengths : [Text] = [];
    if (mS   >= 70) { strengths := Array.concat(strengths, ["Strong documented maintenance history"]) };
    if (modS >= 70) { strengths := Array.concat(strengths, ["Systems are modern and recently updated"]) };
    if (vS   >= 70) { strengths := Array.concat(strengths, ["High proportion of blockchain-verified records"]) };

    // Improvements: dimensions < 50
    var improvements : [Text] = [];
    if (mS   < 50) { improvements := Array.concat(improvements, ["Add maintenance records — buyers discount undocumented homes 3-5 %"]) };
    if (modS < 50) { improvements := Array.concat(improvements, ["Key systems may be near end-of-life — consider targeted upgrades"]) };
    if (vS   < 50) { improvements := Array.concat(improvements, ["Get existing jobs co-signed to boost buyer confidence"]) };

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
    let zipSnap   = Map.get(snapshots, Text.compare, profile.zipCode);

    // Market premium for zip: if median price > national average ($400K) scale up slightly
    let zipPremium : Nat = switch (zipSnap) {
      case null    { 100 };
      case (?snap) {
        if      (snap.medianSaleCents >= 100_000_000) { 115 }  // ≥ $1M
        else if (snap.medianSaleCents >= 60_000_000)  { 108 }  // ≥ $600K
        else                                          { 100 }
      };
    };

    var recommendations : [ProjectRecommendation] = [];

    for (tmpl in PROJECT_TEMPLATES.vals()) {

      // 1. Property must be old enough to need this project
      if (propAge < tmpl.minPropertyAge) {
        // Skip — property too new
      } else {

        // 2. Check if it's already been done within its expected lifespan
        let lifespan = switch (
          Array.find<SystemLifespan>(SYSTEM_LIFESPANS, func(s) { s.category == tmpl.category })
        ) {
          case null    { 999 };   // no lifespan entry = never auto-skip
          case (?sys)  { sys.lifespanYears };
        };

        let alreadyDone = Option.isSome(Array.find<JobSummary>(currentJobs, func(j) {
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
              "Your home is " # Nat.toText(propAge) # " years old. "
              else "";
            let roiNote = "National average ROI: " # Nat.toText(adjustedRoi) # " %.";
            let stateNote = if (stateMult > 100)
              " " # profile.state # " markets typically realize value faster."
              else "";

            let rationale = ageNote # roiNote # stateNote;

            let rec : ProjectRecommendation = {
              name                = tmpl.name;
              category            = tmpl.category;
              estimatedCostCents  = adjustedCost;
              estimatedRoiPercent = adjustedRoi;
              estimatedGainCents  = estimatedGain;
              paybackMonths       = tmpl.paybackMonths;
              priority;
              rationale;
              requiresPermit      = tmpl.requiresPermit;
            };
            recommendations := Array.concat(recommendations, [rec]);
          }
        }
      }
    };

    // Sort descending by adjustedRoi (higher ROI first)
    Array.sort<ProjectRecommendation>(
      recommendations,
      func(a, b) : Order.Order {
        if      (a.estimatedRoiPercent > b.estimatedRoiPercent) #less     // reversed for descending
        else if (a.estimatedRoiPercent < b.estimatedRoiPercent) #greater
        else                                                    #equal
      }
    )
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
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
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
    Map.add(snapshots, Text.compare, zipCode, snap);
    #ok(snap)
  };

  /// Retrieve the latest market snapshot for a zip code.
  public query func getMarketSnapshot(zipCode: Text) : async Result.Result<MarketSnapshot, Error> {
    switch (Map.get(snapshots, Text.compare, zipCode)) {
      case null    { #err(#NotFound) };
      case (?snap) { #ok(snap) };
    }
  };

  // ─── Neighbourhood Score (4.3.4) ─────────────────────────────────────────────

  /// Homeowner submits their property's job summary; canister computes and stores
  /// the composite score. Individual scores are never exposed via public query —
  /// only zip-level aggregates are public. Use getMyScoreEncrypted to read back
  /// your own score, authenticated via vetKeys.
  public shared(msg) func submitScore(
    jobs:      [JobSummary],
    yearBuilt: Nat,
    zipCode:   Text,
  ) : async Result.Result<StoredScore, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Principal.isAnonymous(msg.caller)) return #err(#Unauthorized);
    if (Text.size(zipCode) == 0 or Text.size(zipCode) > 20)
      return #err(#InvalidInput("zipCode must be 1-20 characters"));

    let caller = msg.caller;

    // If homeowner previously had a different zip, remove from old zip index.
    switch (Map.get(scoreStore, Principal.compare, caller)) {
      case (?old) {
        if (old.zipCode != zipCode) {
          let oldList = Option.get(Map.get(zipIndex, Text.compare, old.zipCode), []);
          let trimmed = Array.filter<Principal>(oldList, func(p) { p != caller });
          Map.add(zipIndex, Text.compare, old.zipCode, trimmed);
        };
      };
      case null {};
    };

    let score = compositeScore(
      maintenanceScore(jobs),
      modernizationScore(jobs, yearBuilt),
      verificationDepth(jobs),
    );

    let stored : StoredScore = { score; zipCode; updatedAt = Time.now() };
    Map.add(scoreStore, Principal.compare, caller, stored);

    // Add caller to zip index if not already present.
    let current = Option.get(Map.get(zipIndex, Text.compare, zipCode), []);
    if (not Option.isSome(Array.find<Principal>(current, func(p) { p == caller }))) {
      Map.add(zipIndex, Text.compare, zipCode, Array.concat(current, [caller]));
    };

    #ok(stored)
  };

  /// Public zip-level aggregate statistics.
  /// Never exposes individual scores or principals — only mean, median, and sample size.
  public query func getZipStats(zipCode: Text) : async Result.Result<ZipStats, Error> {
    let principals = Option.get(Map.get(zipIndex, Text.compare, zipCode), []);
    if (principals.size() == 0) return #err(#NotFound);

    var scores : [Nat] = [];
    for (p in principals.vals()) {
      switch (Map.get(scoreStore, Principal.compare, p)) {
        case (?s) { scores := Array.concat(scores, [s.score]) };
        case null {};
      };
    };
    if (scores.size() == 0) return #err(#NotFound);

    var total : Nat = 0;
    for (s in scores.vals()) { total += s };
    let mean = total / scores.size();

    let sorted = Array.sort<Nat>(scores, Nat.compare);
    let n = sorted.size();
    let median = if (n % 2 == 1) {
      sorted[n / 2]
    } else {
      (sorted[(n / 2) - 1] + sorted[n / 2]) / 2
    };

    #ok({ zipCode; mean; median; sampleSize = scores.size(); grade = scoreGrade(median) })
  };

  /// Returns the canister's vetKeys public key for the neighbourhood score context.
  /// The frontend uses this to verify decrypted vetKeys via DerivedPublicKey.deserialize.
  /// vetkd_public_key requires no cycles.
  public func getNeighborhoodPublicKey() : async Blob {
    let response = await managementCanister.vetkd_public_key({
      canister_id = null;
      context     = SCORE_CONTEXT;
      key_id      = { curve = #bls12_381_g2; name = VETKD_KEY_NAME };
    });
    response.public_key
  };

  /// Returns the caller's stored score encrypted to their transport public key
  /// via vetKeys key derivation. The encryptedKey allows the frontend to prove
  /// the canister issued this response for this specific principal.
  ///
  /// Caller must have previously called submitScore. Costs VETKD_KEY_CYCLES cycles.
  public shared(msg) func getMyScoreEncrypted(
    transportPublicKey: Blob,
  ) : async Result.Result<ScoreEnvelope, Error> {
    // Capture caller before await — required per vetKeys skill guidance.
    let caller = msg.caller;
    if (Principal.isAnonymous(caller)) return #err(#Unauthorized);

    let stored = switch (Map.get(scoreStore, Principal.compare, caller)) {
      case null    { return #err(#NotFound) };
      case (?s)    { s };
    };

    let response = await (with cycles = VETKD_KEY_CYCLES) managementCanister.vetkd_derive_key({
      input                = Principal.toBlob(caller);
      context              = SCORE_CONTEXT;
      transport_public_key = transportPublicKey;
      key_id               = { curve = #bls12_381_g2; name = VETKD_KEY_NAME };
    });

    #ok({
      encryptedKey = response.encrypted_key;
      score        = stored.score;
      zipCode      = stored.zipCode;
      updatedAt    = stored.updatedAt;
    })
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
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

  public query func getMetrics() : async Metrics {
    {
      marketSnapshotCount = Map.size(snapshots);
      scoreCount          = Map.size(scoreStore);
      isPaused;
    }
  };
}
