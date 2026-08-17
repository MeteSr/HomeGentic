/**
 * HomeGentic Monitoring Canister
 * Cost tracking, metrics aggregation, profitability analysis, and alerting.
 * Aggregates health data pushed by all other canisters.
 */

import Array     "mo:core/Array";
import Error     "mo:core/Error";
import Float     "mo:core/Float";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Timer     "mo:core/Timer";

persistent actor Monitoring {

  // ─── Management canister interface (for checkCycleLevels) ────────────────────

  type ICActor = actor {
    canister_status : shared { canister_id : Principal } -> async {
      status      : { #running; #stopping; #stopped };
      cycles      : Nat;
      memory_size : Nat;
      settings    : {
        controllers        : [Principal];
        freezing_threshold : Nat;
        memory_allocation  : Nat;
        compute_allocation : Nat;
      };
      module_hash : ?Blob;
    };
  };

  private let IC : ICActor = actor("aaaaa-aa");

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type CanisterMetrics = {
    canisterId: Principal;
    cyclesBalance: Nat;      // current balance
    cyclesBurned: Nat;       // consumed since last report
    memoryBytes: Nat;        // current heap usage
    memoryCapacity: Nat;     // max heap (0 = unknown)
    requestCount: Nat;       // cumulative requests
    errorCount: Nat;         // cumulative errors
    avgResponseTimeMs: Nat;  // rolling average
    updatedAt: Time.Time;
  };

  public type CostMetrics = {
    totalCyclesBurned: Nat;
    totalUsdCost: Float;
    storageCostUsd: Float;          // 35 % of total
    computeCostUsd: Float;          // 50 % of total
    networkCostUsd: Float;          // 15 % of total
    projectedMonthlyCostUsd: Float;
    costPerUserUsd: Float;          // 0 if no user count supplied
    calculatedAt: Time.Time;
  };

  public type ProfitabilityMetrics = {
    revenueUsd: Float;
    costUsd: Float;
    profitUsd: Float;
    marginPct: Float;
    arpu: Float;         // average revenue per user
    ltv: Float;          // ARPU × 18 months
    cac: Float;          // customer-acquisition cost (constant $15)
    ltvToCacRatio: Float;
    breakEvenUsers: Nat; // ceil(monthlyCost / ARPU); 0 if ARPU = 0
    calculatedAt: Time.Time;
  };

  public type AlertSeverity = { #Critical; #Warning; #Info };

  public type AlertCategory = {
    #Cycles;
    #ErrorRate;
    #ResponseTime;
    #Memory;
    #Milestone;
    #TopUp;
    #Stale;   // canister has not pushed metrics within the expected window
  };

  public type Alert = {
    id: Text;
    severity: AlertSeverity;
    category: AlertCategory;
    canisterId: ?Principal;
    message: Text;
    resolved: Bool;
    createdAt: Time.Time;
    resolvedAt: ?Time.Time;
  };

  public type BusinessMetrics = {
    totalUsers: Nat;
    activeUsers: Nat;
    newUsersToday: Nat;
    revenueUsd: Float;
    freeUsers: Nat;
    proUsers: Nat;
    premiumUsers: Nat;
    contractorProUsers: Nat;
  };

  /// A registered canister entry for cycle-level polling.
  public type TrackedCanister = {
    id   : Principal;
    name : Text;        // human label, e.g. "auth", "job"
  };

  /// Result of a single canister cycle-level check.
  public type CycleLevelResult = {
    id          : Principal;
    name        : Text;
    cycles      : Nat;          // 0 if canister_status call failed (not a controller)
    status      : Text;         // "ok" | "warning" | "critical" | "unknown"
    fromCache   : Bool;         // true = fell back to last recordCanisterMetrics value
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  public type ProductMetrics = {
    // Property verification funnel
    totalProperties         : Nat;
    unverifiedProperties    : Nat;
    pendingReviewProperties : Nat;
    verifiedProperties      : Nat;   // Basic + Premium combined
    verificationRate        : Float; // verifiedProperties / totalProperties

    // Job activity
    totalJobs        : Nat;
    completedJobs    : Nat;
    verifiedJobs     : Nat;
    diyJobs          : Nat;
    avgJobsPerProperty : Float;  // totalJobs / totalProperties; 0 if no properties

    // Quote funnel
    totalQuoteRequests  : Nat;
    openQuoteRequests   : Nat;
    acceptedQuotes      : Nat;
    quoteAcceptanceRate : Float; // acceptedQuotes / totalQuoteRequests; 0 if no requests

    // Subscription tier distribution
    totalSubscriptions  : Nat;
    freeUsers           : Nat;
    basicUsers          : Nat;
    proUsers            : Nat;
    premiumUsers        : Nat;
    contractorFreeUsers : Nat;
    contractorProUsers  : Nat;
    activePaidUsers     : Nat;
    estimatedMrrUsd     : Nat;

    snapshotAt : Time.Time;
  };

  /// Per-method cycles summary stored by recordCallCycles().
  /// avgCycles is a rolling average; sampleCount tracks how many observations
  /// went into the average so callers can judge statistical confidence.
  public type MethodCyclesSummary = {
    method:       Text;
    avgCycles:    Nat;
    sampleCount:  Nat;
    lastUpdatedAt: Int;
  };

  public type Metrics = {
    totalCanisters: Nat;
    activeAlerts:   Nat;
    criticalAlerts: Nat;
    isPaused:       Bool;
    cyclesPerCall:  [MethodCyclesSummary];   // 13.1.4 — per-method cost baseline
  };

  // ── Frontend Error Monitoring (#297) ──────────────────────────────────────

  public type ErrorSummary = {
    fingerprint : Text;
    message     : Text;
    errorType   : Text;
    firstSeen   : Time.Time;
    lastSeen    : Time.Time;
    count       : Nat;
    tierCounts  : [(Text, Nat)];
    release     : ?Text;
    resolved    : Bool;
  };

  public type ErrorSummaryInput = {
    fingerprint : Text;
    message     : Text;
    errorType   : Text;
    count       : Nat;
    firstSeen   : Time.Time;
    lastSeen    : Time.Time;
    tierCounts  : [(Text, Nat)];
    release     : ?Text;
  };

  public type FrontendErrorStats = {
    total           : Nat;
    unresolved      : Nat;
    topFingerprints : [ErrorSummary];
  };

  // ─── Constants ───────────────────────────────────────────────────────────────

  // 1 trillion cycles = $1.30 USD
  private let cyclesPerTrillion : Float = 1_000_000_000_000.0;
  private let usdPerTrillion    : Float = 1.30;

  private let storageSharePct   : Float = 0.35;
  private let computeSharePct   : Float = 0.50;
  private let networkSharePct   : Float = 0.15;

  private let cacUsd            : Float = 15.0;
  private let ltvMonths         : Float = 18.0;

  // Alert thresholds
  private let criticalCyclesT   : Nat   = 5_000_000_000_000;   // 5T
  private let warningCyclesT    : Nat   = 10_000_000_000_000;  // 10T
  private let criticalErrorPct  : Float = 5.0;
  private let warningErrorPct   : Float = 2.0;
  private let warningResponseMs : Nat   = 2_000;
  private let warningMemoryPct  : Float = 80.0;

  // ─── Cross-canister actor interfaces (for getProductMetrics) ────────────────

  type PropertyActor = actor {
    getMetrics : shared query () -> async {
      totalProperties         : Nat;
      verifiedProperties      : Nat;
      pendingReviewProperties : Nat;
      unverifiedProperties    : Nat;
      isPaused                : Bool;
      errorsByMethod          : [(Text, Nat)];
    };
  };

  type JobActor = actor {
    getMetrics : shared query () -> async {
      totalJobs     : Nat;
      pendingJobs   : Nat;
      completedJobs : Nat;
      verifiedJobs  : Nat;
      diyJobs       : Nat;
      isPaused      : Bool;
      errorsByMethod : [(Text, Nat)];
    };
  };

  type QuoteActor = actor {
    getMetrics : shared query () -> async {
      totalRequests    : Nat;
      openRequests     : Nat;
      acceptedRequests : Nat;
      totalQuotes      : Nat;
      isPaused         : Bool;
    };
  };

  type PaymentActor = actor {
    getSubscriptionStats : shared query () -> async {
      total           : Nat;
      free            : Nat;
      basic           : Nat;
      pro             : Nat;
      premium         : Nat;
      contractorFree  : Nat;
      contractorPro   : Nat;
      activePaid      : Nat;
      estimatedMrrUsd : Nat;
    };
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var alertCounter: Nat = 0;
  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  private var adminListEntries: [Principal] = [];
  /// Registry of canisters to poll in checkCycleLevels().
  private var trackedCanisterEntries : [TrackedCanister] = [];
  /// Configurable low-cycle threshold — default 1T cycles (issue #55).
  private var lowCycleThresholdT : Nat = 1_000_000_000_000;
  /// Canister IDs for cross-canister product metrics pull.
  private var propCanisterId    : Text = "";
  private var jobCanisterId     : Text = "";
  private var quoteCanisterId   : Text = "";
  private var paymentCanisterId : Text = "";
  // ─── Stable State ────────────────────────────────────────────────────────────

  private let canisterMetrics = Map.empty<Principal, CanisterMetrics>();
  private let alerts          = Map.empty<Text, Alert>();
  private let cyclesPerCall   = Map.empty<Text, MethodCyclesSummary>();

  private let MAX_ERROR_SUMMARIES : Nat = 500;
  private let frontendErrors = Map.empty<Text, ErrorSummary>();

  // ─── Private Helpers ─────────────────────────────────────────────────────────

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

  private func _requireActive(caller: Principal) : Result.Result<(), Error> {
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

  private func nextAlertId() : Text {
    alertCounter += 1;
    "ALERT_" # Nat.toText(alertCounter)
  };

  // Returns true if an unresolved alert of this category already exists for the canister.
  private func alertExists(category: AlertCategory, canisterId: ?Principal) : Bool {
    for (a in Map.values(alerts)) {
      if (not a.resolved and a.category == category) {
        switch (canisterId, a.canisterId) {
          case (?c1, ?c2) { if (c1 == c2) return true };
          case (null, null) { return true };
          case _ {};
        };
      };
    };
    false
  };

  private func createAlert(
    severity: AlertSeverity,
    category: AlertCategory,
    canisterId: ?Principal,
    message: Text
  ) {
    if (alertExists(category, canisterId)) return;
    let id = nextAlertId();
    let alert: Alert = {
      id;
      severity;
      category;
      canisterId;
      message;
      resolved   = false;
      createdAt  = Time.now();
      resolvedAt = null;
    };
    Map.add(alerts, Text.compare, id, alert);
  };

  private func float2(f: Float) : Text {
    let scaled = Float.nearest(f * 100.0);
    let whole  = Float.toInt(scaled) / 100;
    let frac   = Int.abs(Float.toInt(scaled) % 100);
    let fracStr = if (frac < 10) "0" # Int.toText(frac) else Int.toText(frac);
    Int.toText(whole) # "." # fracStr
  };

  // Evaluate a single CanisterMetrics record and fire alerts as needed.
  private func evaluateAlerts(m: CanisterMetrics) {
    let cid = ?m.canisterId;

    // ── Cycles alerts ────────────────────────────────────────────────────────
    if (m.cyclesBalance < criticalCyclesT) {
      createAlert(#Critical, #Cycles, cid,
        "Cycles critically low: " # Nat.toText(m.cyclesBalance / 1_000_000_000) # "B remaining");
    } else if (m.cyclesBalance < warningCyclesT) {
      createAlert(#Warning, #Cycles, cid,
        "Cycles balance below 10T: " # Nat.toText(m.cyclesBalance / 1_000_000_000) # "B remaining");
    };

    // ── Error-rate alerts ─────────────────────────────────────────────────────
    if (m.requestCount > 0) {
      let errorRate = Float.fromInt(m.errorCount) / Float.fromInt(m.requestCount) * 100.0;
      if (errorRate > criticalErrorPct) {
        createAlert(#Critical, #ErrorRate, cid,
          "Error rate critical: " # float2(errorRate) # "% (>" # float2(criticalErrorPct) # "%)");
      } else if (errorRate > warningErrorPct) {
        createAlert(#Warning, #ErrorRate, cid,
          "Elevated error rate: " # float2(errorRate) # "% (>" # float2(warningErrorPct) # "%)");
      };
    };

    // ── Response-time alert ───────────────────────────────────────────────────
    if (m.avgResponseTimeMs > warningResponseMs) {
      createAlert(#Warning, #ResponseTime, cid,
        "Slow avg response: " # Nat.toText(m.avgResponseTimeMs) # "ms (>2000ms)");
    };

    // ── Memory alert ──────────────────────────────────────────────────────────
    if (m.memoryCapacity > 0) {
      let memPct = Float.fromInt(m.memoryBytes) / Float.fromInt(m.memoryCapacity) * 100.0;
      if (memPct > warningMemoryPct) {
        createAlert(#Warning, #Memory, cid,
          "Memory usage high: " # float2(memPct) # "% of capacity");
      };
    };
  };

  // ─── Core Functions ───────────────────────────────────────────────────────────

  /// Push a metrics snapshot for a canister. Any principal may record metrics.
  /// Auto-generates alerts when thresholds are breached.
  public func recordCanisterMetrics(
    canisterId: Principal,
    cyclesBalance: Nat,
    cyclesBurned: Nat,
    memoryBytes: Nat,
    memoryCapacity: Nat,
    requestCount: Nat,
    errorCount: Nat,
    avgResponseTimeMs: Nat
  ) : async () {
    let m: CanisterMetrics = {
      canisterId;
      cyclesBalance;
      cyclesBurned;
      memoryBytes;
      memoryCapacity;
      requestCount;
      errorCount;
      avgResponseTimeMs;
      updatedAt = Time.now();
    };
    Map.add(canisterMetrics, Principal.compare, canisterId, m);
    evaluateAlerts(m);
  };

  // ─── 13.1.4: Per-method cycles baseline ──────────────────────────────────────

  /// Record the observed cycles cost for a canister method call.
  /// Uses an exponential moving average (α=0.2) so recent samples have more
  /// weight without requiring a sliding window or full history.
  ///
  /// Callers: any canister may call this after a significant operation completes.
  /// The `method` string should be "canister.methodName" (e.g. "report.generateReport").
  public func recordCallCycles(method: Text, cycles: Nat) : async () {
    if (Text.size(method) == 0) return;
    let now = Time.now();
    let updated : MethodCyclesSummary = switch (Map.get(cyclesPerCall, Text.compare, method)) {
      case null {
        // First observation
        { method; avgCycles = cycles; sampleCount = 1; lastUpdatedAt = now }
      };
      case (?existing) {
        // Exponential moving average: new_avg = 0.8 × old_avg + 0.2 × sample
        let alpha = 20;   // 20% weight to new sample (integer arithmetic: ×100)
        let newAvg = (existing.avgCycles * 80 + cycles * alpha) / 100;
        {
          method;
          avgCycles     = newAvg;
          sampleCount   = existing.sampleCount + 1;
          lastUpdatedAt = now;
        }
      };
    };
    Map.add(cyclesPerCall, Text.compare, method, updated);
  };

  /// Aggregate cost breakdown across all reported canisters.
  /// Pass `userCount` > 0 to get a per-user cost figure.
  public query func calculateCostMetrics(userCount: Nat) : async CostMetrics {
    var totalBurned : Nat = 0;
    for (m in Map.values(canisterMetrics)) { totalBurned += m.cyclesBurned };

    let totalUsd = Float.fromInt(totalBurned) / cyclesPerTrillion * usdPerTrillion;

    // Approximate monthly projection from current snapshot window (assume ~1 day of data)
    let projectedMonthly = totalUsd * 30.0;

    let perUser = if (userCount > 0) totalUsd / Float.fromInt(userCount) else 0.0;

    {
      totalCyclesBurned       = totalBurned;
      totalUsdCost            = totalUsd;
      storageCostUsd          = totalUsd * storageSharePct;
      computeCostUsd          = totalUsd * computeSharePct;
      networkCostUsd          = totalUsd * networkSharePct;
      projectedMonthlyCostUsd = projectedMonthly;
      costPerUserUsd          = perUser;
      calculatedAt            = Time.now();
    }
  };

  /// Compute profitability, LTV, CAC, and break-even for a billing period.
  /// `revenue` is the period's USD revenue; `users` is total users; `activeUsers` is MAU.
  public query func calculateProfitability(
    revenue: Float,
    users: Nat,
    _activeUsers: Nat
  ) : async ProfitabilityMetrics {
    // Derive cost from stored metrics (same logic as calculateCostMetrics)
    var totalBurned : Nat = 0;
    for (m in Map.values(canisterMetrics)) { totalBurned += m.cyclesBurned };
    let costUsd = Float.fromInt(totalBurned) / cyclesPerTrillion * usdPerTrillion;

    let profit = revenue - costUsd;
    let margin = if (revenue > 0.0) profit / revenue * 100.0 else 0.0;

    let arpu = if (users > 0) revenue / Float.fromInt(users) else 0.0;
    let ltv  = arpu * ltvMonths;
    let ltvCacRatio = if (cacUsd > 0.0) ltv / cacUsd else 0.0;

    let projectedMonthly = Float.fromInt(totalBurned) / cyclesPerTrillion * usdPerTrillion * 30.0;
    let breakEven : Nat = if (arpu > 0.0) {
      let raw = projectedMonthly / arpu;
      Int.abs(Float.toInt(Float.ceil(raw)))
    } else { 0 };

    {
      revenueUsd      = revenue;
      costUsd;
      profitUsd       = profit;
      marginPct       = margin;
      arpu;
      ltv;
      cac             = cacUsd;
      ltvToCacRatio   = ltvCacRatio;
      breakEvenUsers  = breakEven;
      calculatedAt    = Time.now();
    }
  };

  /// Return all stored canister metrics snapshots.
  public query func getAllCanisterMetrics() : async [CanisterMetrics] {
    Iter.toArray(Map.values(canisterMetrics))
  };

  /// Return all unresolved alerts, sorted Critical → Warning → Info.
  public query func getActiveAlerts() : async [Alert] {
    let active = Iter.toArray(
      Iter.filter(Map.values(alerts), func(a: Alert) : Bool { not a.resolved })
    );
    // Sort: Critical = 0, Warning = 1, Info = 2
    let rank = func(s: AlertSeverity) : Nat {
      switch s { case (#Critical) 0; case (#Warning) 1; case (#Info) 2 }
    };
    Array.sort(active, func(a: Alert, b: Alert) : { #less; #equal; #greater } {
      let ra = rank(a.severity);
      let rb = rank(b.severity);
      if      (ra < rb) #less
      else if (ra > rb) #greater
      else              #equal
    })
  };

  /// Mark an alert as resolved. Returns true if the alert was found and updated.
  public shared(msg) func resolveAlert(alertId: Text) : async Bool {
    switch (Map.get(alerts, Text.compare, alertId)) {
      case null { false };
      case (?existing) {
        if (existing.resolved) return false;
        if (not isAdmin(msg.caller)) return false;
        let resolved: Alert = {
          id         = existing.id;
          severity   = existing.severity;
          category   = existing.category;
          canisterId = existing.canisterId;
          message    = existing.message;
          resolved   = true;
          createdAt  = existing.createdAt;
          resolvedAt = ?Time.now();
        };
        Map.add(alerts, Text.compare, alertId, resolved);
        true
      };
    }
  };

  /// Fire an info-level milestone or top-up alert manually (admin only).
  public shared(msg) func createInfoAlert(
    category: AlertCategory,
    canisterId: ?Principal,
    message: Text
  ) : async Result.Result<Alert, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(message) == 0)   return #err(#InvalidInput("message cannot be empty"));
    if (Text.size(message) > 2000) return #err(#InvalidInput("message exceeds 2000 characters"));
    let id = nextAlertId();
    let alert: Alert = {
      id;
      severity   = #Info;
      category;
      canisterId;
      message;
      resolved   = false;
      createdAt  = Time.now();
      resolvedAt = null;
    };
    Map.add(alerts, Text.compare, id, alert);
    #ok(alert)
  };

  /// Generate a human-readable daily summary report.
  public query func generateDailyReport(bm: BusinessMetrics) : async Text {
    // Aggregate cycles burned
    var totalBurned : Nat = 0;
    var totalRequests : Nat = 0;
    var totalErrors : Nat = 0;
    var canisterCount : Nat = 0;
    for (m in Map.values(canisterMetrics)) {
      totalBurned   += m.cyclesBurned;
      totalRequests += m.requestCount;
      totalErrors   += m.errorCount;
      canisterCount += 1;
    };

    let totalUsd       = Float.fromInt(totalBurned) / cyclesPerTrillion * usdPerTrillion;
    let monthlyUsd     = totalUsd * 30.0;
    let arpu           = if (bm.totalUsers > 0) bm.revenueUsd / Float.fromInt(bm.totalUsers) else 0.0;
    let profit         = bm.revenueUsd - totalUsd;
    let margin         = if (bm.revenueUsd > 0.0) profit / bm.revenueUsd * 100.0 else 0.0;
    let ltv            = arpu * ltvMonths;
    let overallErrRate = if (totalRequests > 0)
      Float.fromInt(totalErrors) / Float.fromInt(totalRequests) * 100.0 else 0.0;

    var activeAlertCount : Nat = 0;
    var critCount : Nat = 0;
    for (a in Map.values(alerts)) {
      if (not a.resolved) {
        activeAlertCount += 1;
        switch (a.severity) { case (#Critical) { critCount += 1 }; case _ {} };
      };
    };

    "═══════════════════════════════════════════\n" #
    "  HomeGentic Daily Report — " # Int.toText(Time.now() / 1_000_000_000) # "s\n" #
    "═══════════════════════════════════════════\n" #
    "\n── USERS ──────────────────────────────────\n" #
    "  Total users      : " # Nat.toText(bm.totalUsers) # "\n" #
    "  Active (MAU)     : " # Nat.toText(bm.activeUsers) # "\n" #
    "  New today        : " # Nat.toText(bm.newUsersToday) # "\n" #
    "  Free             : " # Nat.toText(bm.freeUsers) # "\n" #
    "  Pro              : " # Nat.toText(bm.proUsers) # "\n" #
    "  Premium          : " # Nat.toText(bm.premiumUsers) # "\n" #
    "  ContractorPro    : " # Nat.toText(bm.contractorProUsers) # "\n" #
    "\n── FINANCIALS ─────────────────────────────\n" #
    "  Revenue (period) : $" # float2(bm.revenueUsd) # "\n" #
    "  ICP cost (period): $" # float2(totalUsd) # "\n" #
    "  Profit           : $" # float2(profit) # "\n" #
    "  Margin           : " # float2(margin) # "%\n" #
    "  ARPU             : $" # float2(arpu) # "\n" #
    "  LTV (18mo)       : $" # float2(ltv) # "\n" #
    "  CAC              : $" # float2(cacUsd) # "\n" #
    "  LTV/CAC          : " # float2(if (cacUsd > 0.0) ltv / cacUsd else 0.0) # "x\n" #
    "\n── INFRASTRUCTURE ─────────────────────────\n" #
    "  Canisters tracked: " # Nat.toText(canisterCount) # "\n" #
    "  Cycles burned    : " # Nat.toText(totalBurned / 1_000_000_000) # "B\n" #
    "  Cost (today)     : $" # float2(totalUsd) # "\n" #
    "  Cost breakdown   : storage $" # float2(totalUsd * storageSharePct) #
                         ", compute $" # float2(totalUsd * computeSharePct) #
                         ", network $" # float2(totalUsd * networkSharePct) # "\n" #
    "  Projected/month  : $" # float2(monthlyUsd) # "\n" #
    "\n── REQUESTS ───────────────────────────────\n" #
    "  Total requests   : " # Nat.toText(totalRequests) # "\n" #
    "  Total errors     : " # Nat.toText(totalErrors) # "\n" #
    "  Error rate       : " # float2(overallErrRate) # "%\n" #
    "\n── ALERTS ─────────────────────────────────\n" #
    "  Active alerts    : " # Nat.toText(activeAlertCount) # "\n" #
    "  Critical         : " # Nat.toText(critCount) # "\n" #
    "═══════════════════════════════════════════\n"
  };

  // ─── Cycle Level Polling (issue #55) ─────────────────────────────────────────

  /// Register a canister for cycle-level polling via checkCycleLevels().
  /// Admin-only. Safe to call multiple times — updates name if already registered.
  public shared(msg) func registerCanister(id: Principal, name: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(name) == 0)   return #err(#InvalidInput("name cannot be empty"));
    // Remove existing entry for this id if present, then append.
    let filtered = Array.filter<TrackedCanister>(
      trackedCanisterEntries, func(c) { c.id != id }
    );
    trackedCanisterEntries := Array.concat(filtered, [{ id; name }]);
    #ok(())
  };

  /// Remove a canister from the polling registry. Admin-only.
  public shared(msg) func unregisterCanister(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trackedCanisterEntries := Array.filter<TrackedCanister>(
      trackedCanisterEntries, func(c) { c.id != id }
    );
    #ok(())
  };

  /// Return the current registry of tracked canisters.
  public query func getTrackedCanisters() : async [TrackedCanister] {
    trackedCanisterEntries
  };

  /// Update the low-cycle alert threshold. Default: 1T cycles. Admin-only.
  public shared(msg) func setLowCycleThreshold(threshold: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    lowCycleThresholdT := threshold;
    #ok(())
  };

  /// Query cycle balances for all registered canisters via the IC management
  /// canister. Requires this canister to be a controller of each target.
  ///
  /// When canister_status is unavailable (not a controller, or local dev),
  /// falls back to the last balance recorded via recordCanisterMetrics().
  /// Results include a `fromCache` flag and a `status` label:
  ///   "ok"       — balance >= 2× lowCycleThresholdT
  ///   "warning"  — balance between lowCycleThresholdT and 2×
  ///   "critical" — balance below lowCycleThresholdT
  ///   "unknown"  — no data available
  public func checkCycleLevels() : async [CycleLevelResult] {
    var results : [CycleLevelResult] = [];
    for (tracked in trackedCanisterEntries.vals()) {
      let result : CycleLevelResult = try {
        let s = await IC.canister_status({ canister_id = tracked.id });
        let bal = s.cycles;
        let st  = if (bal < lowCycleThresholdT)      { "critical" }
                  else if (bal < lowCycleThresholdT * 2) { "warning" }
                  else                               { "ok" };
        // Auto-fire alerts for critical balances found via poll.
        if (bal < criticalCyclesT) {
          createAlert(#Critical, #Cycles, ?tracked.id,
            "Cycles critically low (" # tracked.name # "): " #
            Nat.toText(bal / 1_000_000_000) # "B remaining");
        } else if (bal < warningCyclesT) {
          createAlert(#Warning, #Cycles, ?tracked.id,
            "Cycles below 10T (" # tracked.name # "): " #
            Nat.toText(bal / 1_000_000_000) # "B remaining");
        };
        { id = tracked.id; name = tracked.name; cycles = bal; status = st; fromCache = false }
      } catch (_) {
        // Not a controller or canister unreachable — fall back to stored metrics.
        switch (Map.get(canisterMetrics, Principal.compare, tracked.id)) {
          case (?m) {
            let bal = m.cyclesBalance;
            let st  = if (bal < lowCycleThresholdT)          { "critical" }
                      else if (bal < lowCycleThresholdT * 2) { "warning" }
                      else                                    { "ok" };
            { id = tracked.id; name = tracked.name; cycles = bal; status = st; fromCache = true }
          };
          case null {
            { id = tracked.id; name = tracked.name; cycles = 0; status = "unknown"; fromCache = true }
          };
        }
      };
      results := Array.concat(results, [result]);
    };
    results
  };

  /// Return all unresolved Critical and Warning cycle alerts.
  /// Unauthenticated — intended for the cycle-watchdog cron and /admin/cycle-status
  /// endpoint to query without managing a principal.
  public query func getCriticalCycleAlerts() : async [Alert] {
    var out : [Alert] = [];
    for (a in Map.values(alerts)) {
      if (not a.resolved and a.category == #Cycles) {
        out := Array.concat(out, [a]);
      };
    };
    out
  };

  // ─── Frontend Error Monitoring (#297) ────────────────────────────────────────

  private func strTrunc(text: Text, maxLen: Nat) : Text {
    if (Text.size(text) <= maxLen) return text;
    var result = "";
    var index = 0;
    for (char in text.chars()) {
      if (index < maxLen) { result #= Text.fromChar(char); index += 1 } else return result;
    };
    result
  };

  private func mergeTierCounts(existing: [(Text, Nat)], incoming: [(Text, Nat)]) : [(Text, Nat)] {
    let merged = Map.empty<Text, Nat>();
    for ((tier, count) in existing.vals()) { Map.add(merged, Text.compare, tier, count) };
    for ((tier, count) in incoming.vals()) {
      let prev = Option.get(Map.get(merged, Text.compare, tier), 0);
      Map.add(merged, Text.compare, tier, prev + count);
    };
    Iter.toArray(Map.entries(merged))
  };

  private func evictOldestError() {
    var oldestKey : ?Text = null;
    var oldestTs  : Int   = 0;
    var first             = true;
    for (summary in Map.values(frontendErrors)) {
      if (first or summary.lastSeen < oldestTs) {
        oldestKey := ?summary.fingerprint;
        oldestTs  := summary.lastSeen;
        first     := false;
      };
    };
    switch (oldestKey) {
      case (?oldestFingerprint) { ignore Map.remove(frontendErrors, Text.compare, oldestFingerprint) };
      case null  {};
    };
  };

  /// Record or merge a frontend error summary from the voice server.
  /// Unauthenticated — the voice server calls this after aggregating raw reports.
  /// Cap: 500 entries with LRU eviction.
  public func recordFrontendError(input: ErrorSummaryInput) : async () {
    let normalizedFingerprint = strTrunc(input.fingerprint, 64);
    if (Text.size(normalizedFingerprint) == 0) return;
    switch (Map.get(frontendErrors, Text.compare, normalizedFingerprint)) {
      case (?existing) {
        let updated : ErrorSummary = {
          fingerprint = existing.fingerprint;
          message     = existing.message;
          errorType   = existing.errorType;
          firstSeen   = if (input.firstSeen < existing.firstSeen) input.firstSeen else existing.firstSeen;
          lastSeen    = if (input.lastSeen  > existing.lastSeen)  input.lastSeen  else existing.lastSeen;
          count       = existing.count + input.count;
          tierCounts  = mergeTierCounts(existing.tierCounts, input.tierCounts);
          release     = switch (existing.release) { case null { input.release }; case r { r } };
          resolved    = existing.resolved;
        };
        Map.add(frontendErrors, Text.compare, normalizedFingerprint, updated);
      };
      case null {
        if (Map.size(frontendErrors) >= MAX_ERROR_SUMMARIES) { evictOldestError() };
        let summary : ErrorSummary = {
          fingerprint = normalizedFingerprint;
          message     = strTrunc(input.message,   120);
          errorType   = strTrunc(input.errorType,  80);
          firstSeen   = input.firstSeen;
          lastSeen    = input.lastSeen;
          count       = input.count;
          tierCounts  = input.tierCounts;
          release     = input.release;
          resolved    = false;
        };
        Map.add(frontendErrors, Text.compare, normalizedFingerprint, summary);
      };
    };
  };

  public query(msg) func getFrontendErrors(from: Nat, limit: Nat) : async [ErrorSummary] {
    if (not isAdmin(msg.caller)) return [];
    let all = Array.sort(
      Iter.toArray(Map.values(frontendErrors)),
      func(lhs: ErrorSummary, rhs: ErrorSummary) : { #less; #equal; #greater } {
        if      (lhs.lastSeen > rhs.lastSeen) #less
        else if (lhs.lastSeen < rhs.lastSeen) #greater
        else                                  #equal
      }
    );
    var slice : [ErrorSummary] = [];
    var index = 0;
    for (item in all.vals()) {
      if (index >= from and index < from + limit) { slice := Array.concat(slice, [item]) };
      index += 1;
    };
    slice
  };

  public shared(msg) func resolveFrontendError(fingerprint: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(frontendErrors, Text.compare, fingerprint)) {
      case null { #err(#NotFound) };
      case (?existing) {
        Map.add(frontendErrors, Text.compare, fingerprint, {
          fingerprint = existing.fingerprint;
          message     = existing.message;
          errorType   = existing.errorType;
          firstSeen   = existing.firstSeen;
          lastSeen    = existing.lastSeen;
          count       = existing.count;
          tierCounts  = existing.tierCounts;
          release     = existing.release;
          resolved    = true;
        });
        #ok(())
      };
    }
  };

  public query(msg) func getFrontendErrorStats() : async FrontendErrorStats {
    if (not isAdmin(msg.caller)) return { total = 0; unresolved = 0; topFingerprints = [] };
    var unresolved : Nat = 0;
    for (summary in Map.values(frontendErrors)) {
      if (not summary.resolved) { unresolved += 1 };
    };
    let sorted = Array.sort(
      Iter.toArray(Map.values(frontendErrors)),
      func(lhs: ErrorSummary, rhs: ErrorSummary) : { #less; #equal; #greater } {
        if (lhs.count > rhs.count) #less else if (lhs.count < rhs.count) #greater else #equal
      }
    );
    var top : [ErrorSummary] = [];
    var index = 0;
    for (item in sorted.vals()) {
      if (index < 10) { top := Array.concat(top, [item]); index += 1 };
    };
    { total = Map.size(frontendErrors); unresolved; topFingerprints = top }
  };

  // ─── Product Metrics (cross-canister pull) ───────────────────────────────────

  /// Set the canister IDs used by getProductMetrics(). Admin-only.
  public shared(msg) func setProductCanisterIds(
    prop    : Text;
    job     : Text;
    quote   : Text;
    payment : Text;
  ) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId    := prop;
    jobCanisterId     := job;
    quoteCanisterId   := quote;
    paymentCanisterId := payment;
    #ok(())
  };

  /// Pull live product metrics from property, job, quote, and payment canisters.
  /// Returns #err if any canister ID has not been configured or a call fails.
  public func getProductMetrics() : async Result.Result<ProductMetrics, Text> {
    if (propCanisterId == "" or jobCanisterId == "" or quoteCanisterId == "" or paymentCanisterId == "") {
      return #err("Product canister IDs not configured. Call setProductCanisterIds() first.");
    };

    let propActor    : PropertyActor = actor(propCanisterId);
    let jobActor     : JobActor      = actor(jobCanisterId);
    let quoteActor   : QuoteActor    = actor(quoteCanisterId);
    let paymentActor : PaymentActor  = actor(paymentCanisterId);

    try {
      // Fork all 4 calls before awaiting any — parallel cross-canister execution.
      let fProp    = propActor.getMetrics();
      let fJob     = jobActor.getMetrics();
      let fQuote   = quoteActor.getMetrics();
      let fPayment = paymentActor.getSubscriptionStats();
      let pm = await fProp;
      let jm = await fJob;
      let qm = await fQuote;
      let sm = await fPayment;

      let verificationRate = if (pm.totalProperties > 0)
        Float.fromInt(pm.verifiedProperties) / Float.fromInt(pm.totalProperties)
        else 0.0;

      let avgJobsPerProperty = if (pm.totalProperties > 0)
        Float.fromInt(jm.totalJobs) / Float.fromInt(pm.totalProperties)
        else 0.0;

      let quoteAcceptanceRate = if (qm.totalRequests > 0)
        Float.fromInt(qm.acceptedRequests) / Float.fromInt(qm.totalRequests)
        else 0.0;

      #ok({
        totalProperties         = pm.totalProperties;
        unverifiedProperties    = pm.unverifiedProperties;
        pendingReviewProperties = pm.pendingReviewProperties;
        verifiedProperties      = pm.verifiedProperties;
        verificationRate;

        totalJobs          = jm.totalJobs;
        completedJobs      = jm.completedJobs;
        verifiedJobs       = jm.verifiedJobs;
        diyJobs            = jm.diyJobs;
        avgJobsPerProperty;

        totalQuoteRequests  = qm.totalRequests;
        openQuoteRequests   = qm.openRequests;
        acceptedQuotes      = qm.acceptedRequests;
        quoteAcceptanceRate;

        totalSubscriptions  = sm.total;
        freeUsers           = sm.free;
        basicUsers          = sm.basic;
        proUsers            = sm.pro;
        premiumUsers        = sm.premium;
        contractorFreeUsers = sm.contractorFree;
        contractorProUsers  = sm.contractorPro;
        activePaidUsers     = sm.activePaid;
        estimatedMrrUsd     = sm.estimatedMrrUsd;

        snapshotAt = Time.now();
      })
    } catch (e) {
      #err("Cross-canister call failed: " # Error.message(e))
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Array.filter<Principal>(adminListEntries, func(a) { a != target });
    #ok(())
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

  public query func getMetrics() : async Metrics {
    var active : Nat = 0;
    var critical : Nat = 0;
    for (a in Map.values(alerts)) {
      if (not a.resolved) {
        active += 1;
        switch (a.severity) { case (#Critical) { critical += 1 }; case _ {} };
      };
    };
    {
      totalCanisters = Map.size(canisterMetrics);
      activeAlerts   = active;
      criticalAlerts = critical;
      isPaused;
      cyclesPerCall  = Iter.toArray(Map.values(cyclesPerCall));   // 13.1.4
    }
  };

  // ─── Staleness detection timer ───────────────────────────────────────────────
  //
  // Each canister is expected to push metrics via recordCanisterMetrics() at least
  // once per hour.  A canister approaching freeze will stop executing and therefore
  // stop pushing — meaning the push-based model goes blind at the worst moment.
  //
  // Fires every 5 minutes (300 s) via recurringTimer instead of heartbeat so the
  // canister is NOT woken on every consensus round (~1 s).  Heartbeat would cost
  // ~200 M cycles/tick × 300 ticks/interval ≈ 60 B wasted cycles per check cycle.
  //
  // NOTE: This does NOT require the monitoring canister to be a controller of the
  // monitored canisters — it only reads already-stored metric timestamps.

  private let STALE_THRESHOLD_NS : Int = 3_600_000_000_000; // 1 hour in nanoseconds
  private let STALE_CHECK_NS     : Nat = 300_000_000_000;   // 5 minutes in nanoseconds

  private func checkStaleMetrics() : async () {
    let now = Time.now();
    for (m in Map.values(canisterMetrics)) {
      if (now - m.updatedAt > STALE_THRESHOLD_NS) {
        createAlert(
          #Warning,
          #Stale,
          ?m.canisterId,
          "Stale metrics: canister has not reported in >1 h — may be frozen or unresponsive"
        );
      };
    };
  };

  ignore Timer.recurringTimer<system>(#nanoseconds STALE_CHECK_NS, checkStaleMetrics);
}
