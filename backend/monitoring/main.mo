/**
 * HomeFax Monitoring Canister
 * Cost tracking, metrics aggregation, profitability analysis, and alerting.
 * Aggregates health data pushed by all other canisters.
 */

import Array     "mo:base/Array";
import Float     "mo:base/Float";
import HashMap   "mo:base/HashMap";
import Int       "mo:base/Int";
import Iter      "mo:base/Iter";
import Nat       "mo:base/Nat";
import Option    "mo:base/Option";
import Principal "mo:base/Principal";
import Result    "mo:base/Result";
import Text      "mo:base/Text";
import Time      "mo:base/Time";

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

  public type Metrics = {
    totalCanisters: Nat;
    activeAlerts: Nat;
    criticalAlerts: Nat;
    isPaused: Bool;
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
  private var adminListEntries: [Principal] = [];
  private var metricsEntries: [(Principal, CanisterMetrics)] = [];
  private var alertEntries: [(Text, Alert)] = [];

  // ─── Transient State ─────────────────────────────────────────────────────────

  private transient var canisterMetrics = HashMap.fromIter<Principal, CanisterMetrics>(
    metricsEntries.vals(), 16, Principal.equal, Principal.hash
  );

  private transient var alerts = HashMap.fromIter<Text, Alert>(
    alertEntries.vals(), 16, Text.equal, Text.hash
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  system func preupgrade() {
    metricsEntries := Iter.toArray(canisterMetrics.entries());
    alertEntries   := Iter.toArray(alerts.entries());
  };

  system func postupgrade() {
    metricsEntries := [];
    alertEntries   := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) #err(#InvalidInput("Canister is paused")) else #ok(())
  };

  private func nextAlertId() : Text {
    alertCounter += 1;
    "ALERT_" # Nat.toText(alertCounter)
  };

  // Returns true if an unresolved alert of this category already exists for the canister.
  private func alertExists(category: AlertCategory, canisterId: ?Principal) : Bool {
    for (a in alerts.vals()) {
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
    alerts.put(id, alert);
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
    canisterMetrics.put(canisterId, m);
    evaluateAlerts(m);
  };

  /// Aggregate cost breakdown across all reported canisters.
  /// Pass `userCount` > 0 to get a per-user cost figure.
  public query func calculateCostMetrics(userCount: Nat) : async CostMetrics {
    var totalBurned : Nat = 0;
    for (m in canisterMetrics.vals()) { totalBurned += m.cyclesBurned };

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
    for (m in canisterMetrics.vals()) { totalBurned += m.cyclesBurned };
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
    Iter.toArray(canisterMetrics.vals())
  };

  /// Return all unresolved alerts, sorted Critical → Warning → Info.
  public query func getActiveAlerts() : async [Alert] {
    let active = Iter.toArray(
      Iter.filter(alerts.vals(), func(a: Alert) : Bool { not a.resolved })
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
    switch (alerts.get(alertId)) {
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
        alerts.put(alertId, resolved);
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
    alerts.put(id, alert);
    #ok(alert)
  };

  /// Generate a human-readable daily summary report.
  public query func generateDailyReport(bm: BusinessMetrics) : async Text {
    // Aggregate cycles burned
    var totalBurned : Nat = 0;
    var totalRequests : Nat = 0;
    var totalErrors : Nat = 0;
    var canisterCount : Nat = 0;
    for (m in canisterMetrics.vals()) {
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
    for (a in alerts.vals()) {
      if (not a.resolved) {
        activeAlertCount += 1;
        switch (a.severity) { case (#Critical) { critCount += 1 }; case _ {} };
      };
    };

    "═══════════════════════════════════════════\n" #
    "  HomeFax Daily Report — " # Int.toText(Time.now() / 1_000_000_000) # "s\n" #
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

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    adminListEntries := Array.append(adminListEntries, [newAdmin]);
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
    var active : Nat = 0;
    var critical : Nat = 0;
    for (a in alerts.vals()) {
      if (not a.resolved) {
        active += 1;
        switch (a.severity) { case (#Critical) { critical += 1 }; case _ {} };
      };
    };
    {
      totalCanisters = canisterMetrics.size();
      activeAlerts   = active;
      criticalAlerts = critical;
      isPaused;
    }
  };
}
