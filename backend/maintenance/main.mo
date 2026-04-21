/**
 * HomeGentic Maintenance Prediction Canister
 *
 * Deterministic prediction engine for home system health and maintenance scheduling.
 *
 * - `predictMaintenance` is a stateless query — no cycles, instant response.
 * - Schedule entries are stored on-chain so homeowners track planned work.
 * - Embedded cost tables use 2024 national averages (Angi / HomeAdvisor data).
 */

import Array    "mo:core/Array";
import Map      "mo:core/Map";
import Int      "mo:core/Int";
import Iter     "mo:core/Iter";
import Nat      "mo:core/Nat";
import Option   "mo:core/Option";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Text     "mo:core/Text";
import Time     "mo:core/Time";

persistent actor Maintenance {

  // ─── Input Types ──────────────────────────────────────────────────────────────

  /// Minimal job summary the frontend passes in.
  public type JobInput = {
    serviceType:   Text;
    completedYear: Nat;
  };

  // ─── Output Types ─────────────────────────────────────────────────────────────

  public type UrgencyLevel = { #Critical; #Soon; #Watch; #Good };

  public type SystemPrediction = {
    systemName:             Text;
    lastServiceYear:        Nat;      // 0 = never serviced (using original install)
    percentLifeUsed:        Nat;      // 0–100+; can exceed 100 if overdue
    yearsRemaining:         Int;      // negative = overdue
    urgency:                UrgencyLevel;
    estimatedCostLowCents:  Nat;
    estimatedCostHighCents: Nat;
    recommendation:         Text;
    diyViable:              Bool;     // true if typical homeowner can DIY
  };

  public type AnnualTask = {
    task:          Text;
    frequency:     Text;   // "Monthly" | "Quarterly" | "Semi-annually" | "Annually"
    season:        ?Text;  // "Spring" | "Fall" | null = any time
    estimatedCost: Text;   // "$0 (DIY)" or "$X–$Y"
    diyViable:     Bool;
  };

  public type MaintenanceReport = {
    systemPredictions: [SystemPrediction];
    annualTasks:       [AnnualTask];
    totalBudgetLowCents:  Nat;    // sum of all Critical + Soon low estimates
    totalBudgetHighCents: Nat;
    generatedAt:       Time.Time;
  };

  /// A scheduled maintenance entry the homeowner commits to.
  public type ScheduleEntry = {
    id:                Text;
    propertyId:        Text;
    systemName:        Text;
    taskDescription:   Text;
    plannedYear:       Nat;
    plannedMonth:      ?Nat;
    estimatedCostCents: ?Nat;
    isCompleted:       Bool;
    createdBy:         Principal;
    createdAt:         Time.Time;
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput: Text;
  };

  public type Metrics = {
    scheduleEntries: Nat;
    completedEntries: Nat;
    isPaused: Bool;
  };

  // ─── Embedded System Tables ───────────────────────────────────────────────────

  private type SystemSpec = {
    name:            Text;
    lifespanYears:   Nat;
    costLowCents:    Nat;
    costHighCents:   Nat;
    diyViable:       Bool;
  };

  private let SYSTEMS : [SystemSpec] = [
    { name = "HVAC";         lifespanYears = 18; costLowCents = 800_000;   costHighCents = 1_500_000; diyViable = false },
    { name = "Roofing";      lifespanYears = 25; costLowCents = 1_500_000; costHighCents = 3_500_000; diyViable = false },
    { name = "Water Heater"; lifespanYears = 12; costLowCents = 120_000;   costHighCents = 350_000;   diyViable = false },
    { name = "Windows";      lifespanYears = 22; costLowCents = 800_000;   costHighCents = 2_400_000; diyViable = false },
    { name = "Electrical";   lifespanYears = 35; costLowCents = 200_000;   costHighCents = 600_000;   diyViable = false },
    { name = "Plumbing";     lifespanYears = 50; costLowCents = 400_000;   costHighCents = 1_500_000; diyViable = false },
    { name = "Flooring";     lifespanYears = 25; costLowCents = 300_000;   costHighCents = 2_000_000; diyViable = true  },
    { name = "Insulation";   lifespanYears = 30; costLowCents = 150_000;   costHighCents = 500_000;   diyViable = true  },
  ];

  private let ANNUAL_TASKS : [AnnualTask] = [
    { task = "Replace HVAC air filter";          frequency = "Quarterly";     season = null;       estimatedCost = "$10–$30 (DIY)";     diyViable = true  },
    { task = "Clean gutters";                    frequency = "Semi-annually"; season = ?"Fall";    estimatedCost = "$100–$250";          diyViable = true  },
    { task = "Clean dryer vent";                 frequency = "Annually";      season = null;       estimatedCost = "$0–$150";            diyViable = true  },
    { task = "Flush water heater";               frequency = "Annually";      season = null;       estimatedCost = "$0 (DIY)";           diyViable = true  },
    { task = "Test smoke & CO detectors";        frequency = "Annually";      season = null;       estimatedCost = "$0 (DIY)";           diyViable = true  },
    { task = "Inspect roof for damage";          frequency = "Annually";      season = ?"Spring";  estimatedCost = "$0–$300";            diyViable = true  },
    { task = "Check weatherstripping & caulk";   frequency = "Annually";      season = ?"Fall";    estimatedCost = "$20–$80 (DIY)";     diyViable = true  },
    { task = "Service garage door springs/tracks"; frequency = "Annually";    season = null;       estimatedCost = "$0–$200";            diyViable = true  },
    { task = "HVAC professional tune-up";        frequency = "Annually";      season = ?"Spring";  estimatedCost = "$80–$150";           diyViable = false },
    { task = "Chimney inspection & cleaning";    frequency = "Annually";      season = ?"Fall";    estimatedCost = "$150–$350";          diyViable = false },
  ];

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var scheduleCounter: Nat = 0;
  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  private var adminListEntries: [Principal] = [];
  /// Property canister ID — set post-deploy via setPropertyCanisterId().
  private var propCanisterId: Text = "";
  // ─── Stable State ────────────────────────────────────────────────────────────

  private let schedule = Map.empty<Text, ScheduleEntry>();

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

  private func currentYear() : Nat {
    let secsPerYear : Nat = 31_536_000;
    let secsSinceEpoch = Int.abs(Time.now()) / 1_000_000_000;
    1970 + secsSinceEpoch / secsPerYear
  };

  private func urgencyFor(pctUsed: Nat) : UrgencyLevel {
    if      (pctUsed >= 100) #Critical
    else if (pctUsed >= 75)  #Soon
    else if (pctUsed >= 50)  #Watch
    else                     #Good
  };

  private func recommendationFor(sys: SystemSpec, urgency: UrgencyLevel, yearsRemaining: Int) : Text {
    switch (urgency) {
      case (#Critical) {
        "⚠️ " # sys.name # " is past expected lifespan. " #
        "Budget $" # Nat.toText(sys.costLowCents / 100) # "–$" # Nat.toText(sys.costHighCents / 100) #
        " and plan replacement immediately."
      };
      case (#Soon) {
        "📅 " # sys.name # " has roughly " # Int.toText(yearsRemaining) # " year(s) remaining. " #
        "Start saving now — typical cost $" # Nat.toText(sys.costLowCents / 100) #
        "–$" # Nat.toText(sys.costHighCents / 100) # "."
      };
      case (#Watch) {
        "👁 " # sys.name # " is in good shape but worth monitoring. " #
        "Schedule routine inspection every 2–3 years."
      };
      case (#Good) {
        "✅ " # sys.name # " is well within expected lifespan. No action needed."
      };
    }
  };

  // ─── Core: Predict Maintenance ────────────────────────────────────────────────

  /// Stateless query — no state change, no cycles cost.
  /// Pass all job history so the engine can determine last service year per system.
  public query func predictMaintenance(
    yearBuilt: Nat,
    jobs:      [JobInput]
  ) : async MaintenanceReport {
    let year = currentYear();

    var predictions : [SystemPrediction] = [];
    var budgetLow  : Nat = 0;
    var budgetHigh : Nat = 0;

    for (sys in SYSTEMS.vals()) {
      // Find the most recent job year for this system
      var lastYear : Nat = yearBuilt;
      for (job in jobs.vals()) {
        if (job.serviceType == sys.name and job.completedYear > lastYear) {
          lastYear := job.completedYear;
        };
      };

      let age        : Nat = if (year > lastYear) year - lastYear else 0;
      let pctUsed    : Nat = age * 100 / sys.lifespanYears;
      let remaining  : Int = (sys.lifespanYears : Int) - (age : Int);
      let urgency                = urgencyFor(pctUsed);

      let pred : SystemPrediction = {
        systemName             = sys.name;
        lastServiceYear        = lastYear;
        percentLifeUsed        = pctUsed;
        yearsRemaining         = remaining;
        urgency;
        estimatedCostLowCents  = sys.costLowCents;
        estimatedCostHighCents = sys.costHighCents;
        recommendation         = recommendationFor(sys, urgency, remaining);
        diyViable              = sys.diyViable;
      };
      predictions := Array.concat(predictions, [pred]);

      // Accumulate budget for Critical and Soon items only
      switch (urgency) {
        case (#Critical) { budgetLow += sys.costLowCents; budgetHigh += sys.costHighCents };
        case (#Soon)     { budgetLow += sys.costLowCents; budgetHigh += sys.costHighCents };
        case _           {};
      };
    };

    // Sort predictions: Critical first, then Soon, Watch, Good
    let sorted = Array.sort<SystemPrediction>(
      predictions,
      func(a, b) {
        let rankA = switch (a.urgency) { case (#Critical) 0; case (#Soon) 1; case (#Watch) 2; case (#Good) 3 };
        let rankB = switch (b.urgency) { case (#Critical) 0; case (#Soon) 1; case (#Watch) 2; case (#Good) 3 };
        if      (rankA < rankB) #less
        else if (rankA > rankB) #greater
        else                    #equal
      }
    );

    {
      systemPredictions    = sorted;
      annualTasks          = ANNUAL_TASKS;
      totalBudgetLowCents  = budgetLow;
      totalBudgetHighCents = budgetHigh;
      generatedAt          = Time.now();
    }
  };

  // ─── Schedule Management ─────────────────────────────────────────────────────

  public shared(msg) func createScheduleEntry(
    propertyId:         Text,
    systemName:         Text,
    taskDescription:    Text,
    plannedYear:        Nat,
    plannedMonth:       ?Nat,
    estimatedCostCents: ?Nat
  ) : async Result.Result<ScheduleEntry, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId)    == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(propertyId)    > 200)  return #err(#InvalidInput("propertyId exceeds 200 characters"));
    if (Text.size(systemName)    == 0)   return #err(#InvalidInput("systemName cannot be empty"));
    if (Text.size(systemName)    > 100)  return #err(#InvalidInput("systemName exceeds 100 characters"));
    if (Text.size(taskDescription) > 2000) return #err(#InvalidInput("taskDescription exceeds 2000 characters"));

    scheduleCounter += 1;
    let id = "SCH_" # Nat.toText(scheduleCounter);

    let entry : ScheduleEntry = {
      id;
      propertyId;
      systemName;
      taskDescription;
      plannedYear;
      plannedMonth;
      estimatedCostCents;
      isCompleted = false;
      createdBy   = msg.caller;
      createdAt   = Time.now();
    };
    Map.add(schedule, Text.compare, id, entry);
    #ok(entry)
  };

  public query func getScheduleByProperty(propertyId: Text) : async [ScheduleEntry] {
    Iter.toArray(Iter.filter(Map.values(schedule), func(e: ScheduleEntry) : Bool {
      e.propertyId == propertyId
    }))
  };

  public shared(msg) func markCompleted(entryId: Text) : async Result.Result<ScheduleEntry, Error> {
    switch (Map.get(schedule, Text.compare, entryId)) {
      case null { #err(#NotFound) };
      case (?entry) {
        if (not isAdmin(msg.caller)) {
          let authOk = await checkPropertyAuth(entry.propertyId, entry.createdBy, msg.caller, true);
          if (not authOk) return #err(#Unauthorized);
        };
        let updated : ScheduleEntry = {
          id                 = entry.id;
          propertyId         = entry.propertyId;
          systemName         = entry.systemName;
          taskDescription    = entry.taskDescription;
          plannedYear        = entry.plannedYear;
          plannedMonth       = entry.plannedMonth;
          estimatedCostCents = entry.estimatedCostCents;
          isCompleted        = true;
          createdBy          = entry.createdBy;
          createdAt          = entry.createdAt;
        };
        Map.add(schedule, Text.compare, entryId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Wire the property canister for centralized ownership checks.
  /// Must be called once after deploy by an admin.
  public shared(msg) func setPropertyCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    propCanisterId := Principal.toText(id);
    #ok(())
  };

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
    var completed = 0;
    for (e in Map.values(schedule)) { if (e.isCompleted) { completed += 1 } };
    { scheduleEntries = Map.size(schedule); completedEntries = completed; isPaused }
  };
}
