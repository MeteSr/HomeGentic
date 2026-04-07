/**
 * HomeGentic Monitoring Canister
 * Cost tracking, metrics aggregation, profitability analysis, and alerting.
 * Aggregates health data pushed by all other canisters.
 */

import Array     "mo:core/Array";
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

persistent actor Monitoring {

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

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput: Text;
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

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var alertCounter: Nat = 0;
  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  private var adminListEntries: [Principal] = [];
  /// Migration buffers — cleared after first upgrade with this code.
  private var metricsEntries:       [(Principal, CanisterMetrics)]  = [];
  private var alertEntries:         [(Text, Alert)]                 = [];
  private var cyclesPerCallEntries: [(Text, MethodCyclesSummary)]   = [];

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var canisterMetrics = Map.empty<Principal, CanisterMetrics>();
  private var alerts          = Map.empty<Text, Alert>();
  private var cyclesPerCall   = Map.empty<Text, MethodCyclesSummary>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in metricsEntries.vals())       { Map.add(canisterMetrics, Principal.compare, k, v) };
    metricsEntries := [];
    for ((k, v) in alertEntries.vals())         { Map.add(alerts,          Text.compare,      k, v) };
    alertEntries := [];
    for ((k, v) in cyclesPerCallEntries.vals()) { Map.add(cyclesPerCall,   Text.compare,      k, v) };
    cyclesPerCallEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

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
        let newAvg = (existing.avgCycles * (100 - alpha) + cycles * alpha) / 100;
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
    activeUsers: Nat
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
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
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
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
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

  // ─── Heartbeat — pull-side staleness detection ───────────────────────────────
  //
  // Each canister is expected to push metrics via recordCanisterMetrics() at least
  // once per hour.  A canister approaching freeze will stop executing and therefore
  // stop pushing — meaning the push-based model goes blind at the worst moment.
  //
  // This heartbeat runs on every consensus round (~1 s) but only does real work
  // every STALE_CHECK_INTERVAL rounds (~5 min).  It scans stored metrics and fires
  // a #Stale alert for any canister whose updatedAt is > 1 hour old, giving the
  // on-call operator an early warning before cycles actually reach zero.
  //
  // NOTE: This does NOT require the monitoring canister to be a controller of the
  // monitored canisters — it only reads already-stored metric timestamps.

  private var heartbeatTick : Nat = 0;
  private let STALE_CHECK_INTERVAL : Nat = 300;          // ~5 min at ~1 tick/sec
  private let STALE_THRESHOLD_NS   : Int = 3_600_000_000_000; // 1 hour in nanoseconds

  system func heartbeat() : async () {
    heartbeatTick += 1;
    if (heartbeatTick % STALE_CHECK_INTERVAL != 0) return;

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
}
