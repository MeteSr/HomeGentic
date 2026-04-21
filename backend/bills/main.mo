/**
 * HomeGentic Bills Canister
 *
 * Stores utility bill records per property, enabling anomaly detection and
 * property-aware expense intelligence (Epic #49).
 *
 * Tier-based upload limits (enforced server-side via payment canister):
 *   Free         — 1 upload per calendar month
 *   Pro          — unlimited
 *   Premium      — unlimited
 *   ContractorPro — unlimited
 *
 * When payCanisterId is set (post-deploy wiring), the tier is resolved live
 * via getTierForPrincipal(). Falls back to the local tierGrants admin map
 * for dev environments where the payment canister is not wired.
 *
 * Anomaly detection:
 *   - Rolling 3-month average per (propertyId, billType, homeowner)
 *   - Bills > 20% above baseline are flagged with a natural-language reason
 *
 * Access control: callers may only read/write their own bills.
 */

import Array     "mo:core/Array";
import Float     "mo:core/Float";
import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Bills {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type BillType = {
    #Electric;
    #Gas;
    #Water;
    #Internet;
    #Telecom;
    #Other;
  };

  public type SubscriptionTier = {
    #Free;
    #Basic;
    #Pro;
    #Premium;
    #ContractorFree;
    #ContractorPro;
  };

  public type BillRecord = {
    id            : Text;
    propertyId    : Text;
    homeowner     : Principal;
    billType      : BillType;
    provider      : Text;           // e.g. "FPL", "TECO"
    periodStart   : Text;           // YYYY-MM-DD
    periodEnd     : Text;           // YYYY-MM-DD
    amountCents   : Nat;            // bill total in cents
    usageAmount   : ?Float;         // kWh / gallons / therms / Mbps
    usageUnit     : ?Text;          // "kWh" | "gallons" | "therms" | "Mbps"
    uploadedAt    : Time.Time;
    anomalyFlag   : Bool;           // true if > 20% above 3-month baseline
    anomalyReason : ?Text;          // natural-language explanation
  };

  public type AddBillArgs = {
    propertyId  : Text;
    billType    : BillType;
    provider    : Text;
    periodStart : Text;
    periodEnd   : Text;
    amountCents : Nat;
    usageAmount : ?Float;
    usageUnit   : ?Text;
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput : Text;
    #TierLimitReached : Text;
  };

  public type UsagePeriod = {
    periodStart : Text;
    usageAmount : Float;
    usageUnit   : Text;
  };

  public type Metrics = {
    totalBills  : Nat;
    isPaused    : Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var billCounter      : Nat                        = 0;
  private var isPaused         : Bool                       = false;
  private var pauseExpiryNs    : ?Int                       = null;
  private var adminListEntries : [Principal]                = [];
  private var adminInitialized : Bool                       = false;
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  private var payCanisterId    : Text                       = "";

  private let bills      = Map.empty<Text, BillRecord>();
  private let tierGrants = Map.empty<Text, SubscriptionTier>();


  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };
  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#Unauthorized);
    if (isPaused) {
      // 14.4.4 — auto-expire timed pauses
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#InvalidInput("Canister is paused")) };
        case null { return #err(#InvalidInput("Canister is paused")) };
      };
    };
    #ok(())
  };

  private func nextBillId() : Text {
    billCounter += 1;
    "BILL_" # Nat.toText(billCounter)
  };

  /// Return the tier from the local grant map (dev fallback).
  private func tierFor(p: Principal) : SubscriptionTier {
    switch (Map.get(tierGrants, Text.compare, Principal.toText(p))) {
      case (?t) t;
      case null #Free;
    }
  };

  /// Monthly upload limit for a tier. 0 = unlimited. 999 = blocked sentinel.
  private func monthlyUploadLimit(tier: SubscriptionTier) : Nat {
    switch tier {
      case (#Free)             { 999 };  // blocked — unsubscribed (checked separately)
      case (#Basic)            { 0   };  // unlimited
      case (#Pro)              { 0   };
      case (#Premium)          { 0   };
      case (#ContractorFree)   { 0   };  // unlimited for free contractor tier
      case (#ContractorPro)    { 0   };
    }
  };

  /// Count bills uploaded by this principal in the same calendar month as `nowNs`.
  /// Month boundary is approximate: 1 month ≈ 30.44 days in nanoseconds.
  private let ONE_MONTH_NS : Int = 2_629_800_000_000_000; // ~30.44 days

  private func countUploadsThisMonth(caller: Principal, nowNs: Int) : Nat {
    var count : Nat = 0;
    for ((_, b) in Map.entries(bills)) {
      if (Principal.equal(b.homeowner, caller)
          and nowNs - b.uploadedAt <= ONE_MONTH_NS) {
        count += 1;
      }
    };
    count
  };

  /// Compute 3-month rolling average amountCents for a (propertyId, billType, homeowner).
  /// Uses uploadedAt timestamps — bills uploaded within the last 3 months relative to
  /// `refNs` are included. Returns null if fewer than 2 prior bills exist.
  private func rollingAverage(
    propertyId: Text,
    billType: BillType,
    homeowner: Principal,
    excludeId: Text,
    refNs: Int,
  ) : ?Float {
    var sum  : Float = 0.0;
    var count: Nat   = 0;
    let threeMonthsNs : Int = 3 * ONE_MONTH_NS;

    for ((_, b) in Map.entries(bills)) {
      if (b.id != excludeId
          and b.propertyId == propertyId
          and Principal.equal(b.homeowner, homeowner)
          and billTypeEq(b.billType, billType)
          and b.uploadedAt < refNs
          and refNs - b.uploadedAt <= threeMonthsNs)
      {
        sum   += Float.fromInt(b.amountCents);
        count += 1;
      }
    };
    if (count < 2) null
    else ?(sum / Float.fromInt(count))
  };

  private func billTypeEq(a: BillType, b: BillType) : Bool {
    switch (a, b) {
      case (#Electric, #Electric) true;
      case (#Gas,      #Gas)      true;
      case (#Water,    #Water)    true;
      case (#Internet, #Internet) true;
      case (#Telecom,  #Telecom)  true;
      case (#Other,    #Other)    true;
      case _                      false;
    }
  };

  // ─── Core: Bill Operations ────────────────────────────────────────────────────

  /// Add a bill record for a property.
  ///
  /// Tier check (server-side, non-bypassable):
  ///   Free tier callers may upload at most 1 bill per calendar month.
  ///   Exceeding the limit returns #TierLimitReached with an upgrade prompt.
  ///
  /// Anomaly detection runs after the tier check against the 3-month rolling
  /// average for (propertyId, billType) and sets anomalyFlag if > 20%.
  public shared(msg) func addBill(args: AddBillArgs) : async Result.Result<BillRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(args.propertyId)  == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(args.propertyId)  > 200)  return #err(#InvalidInput("propertyId exceeds 200 characters"));
    if (Text.size(args.provider)    == 0)   return #err(#InvalidInput("provider cannot be empty"));
    if (Text.size(args.provider)    > 200)  return #err(#InvalidInput("provider exceeds 200 characters"));
    if (Text.size(args.periodStart) == 0)   return #err(#InvalidInput("periodStart cannot be empty"));
    if (Text.size(args.periodEnd)   == 0)   return #err(#InvalidInput("periodEnd cannot be empty"));

    // ── Tier enforcement ──────────────────────────────────────────────────────
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = actor(payCanisterId) : actor {
        getTierForPrincipal : (Principal) -> async { #Free; #Basic; #Pro; #Premium; #ContractorFree; #ContractorPro };
      };
      await payActor.getTierForPrincipal(msg.caller)
    } else {
      tierFor(msg.caller)
    };

    if (callerTier == #Free) {
      return #err(#TierLimitReached(
        "Bill uploads require an active subscription. Subscribe to Basic ($10/mo) to get started."
      ));
    };

    let limit = monthlyUploadLimit(callerTier);
    let now   = Time.now();

    if (limit > 0 and countUploadsThisMonth(msg.caller, now) >= limit) {
      return #err(#TierLimitReached(
        "Monthly upload limit reached. Upgrade to Pro ($20/mo) for unlimited bill uploads."
      ));
    };

    // ── Anomaly detection ─────────────────────────────────────────────────────
    let id = nextBillId();

    let (anomalyFlag, anomalyReason) = switch (rollingAverage(
      args.propertyId, args.billType, msg.caller, id, now
    )) {
      case null { (false, null) };
      case (?avg) {
        let amount = Float.fromInt(args.amountCents);
        if (avg > 0.0 and amount > avg * 1.2) {
          let pct = Float.toText(Float.nearest((amount / avg - 1.0) * 100.0));
          (true, ?("Bill is " # pct # "% above your 3-month average for " # args.provider))
        } else {
          (false, null)
        }
      };
    };

    let record : BillRecord = {
      id;
      propertyId    = args.propertyId;
      homeowner     = msg.caller;
      billType      = args.billType;
      provider      = args.provider;
      periodStart   = args.periodStart;
      periodEnd     = args.periodEnd;
      amountCents   = args.amountCents;
      usageAmount   = args.usageAmount;
      usageUnit     = args.usageUnit;
      uploadedAt    = now;
      anomalyFlag;
      anomalyReason;
    };

    Map.add(bills, Text.compare, id, record);
    #ok(record)
  };

  /// Return all bills for a property. Caller must be the homeowner.
  public shared(msg) func getBillsForProperty(propertyId: Text) : async Result.Result<[BillRecord], Error> {
    let result = Array.filter<BillRecord>(
      Iter.toArray(Map.values(bills)),
      func(b) {
        b.propertyId == propertyId and Principal.equal(b.homeowner, msg.caller)
      }
    );
    #ok(result)
  };

  /// Return usage-tracked periods for (propertyId, billType) sorted chronologically,
  /// limited to the last `months` months. Only bills with a usageAmount are included.
  public shared(msg) func getUsageTrend(
    propertyId : Text,
    billType   : BillType,
    months     : Nat,
  ) : async Result.Result<[UsagePeriod], Error> {
    let cutoffNs : Int = Time.now() - (months * 30 * 24 * 3_600_000_000_000 : Nat);
    var periods : [UsagePeriod] = [];

    for ((_, b) in Map.entries(bills)) {
      if (b.propertyId == propertyId
          and Principal.equal(b.homeowner, msg.caller)
          and billTypeEq(b.billType, billType)
          and b.uploadedAt >= cutoffNs)
      {
        switch (b.usageAmount) {
          case null {};
          case (?amount) {
            switch (b.usageUnit) {
              case null {};
              case (?unit) {
                periods := Array.concat(periods, [{
                  periodStart = b.periodStart;
                  usageAmount = amount;
                  usageUnit   = unit;
                }]);
              };
            };
          };
        };
      };
    };

    // Sort chronologically by periodStart (lexicographic on YYYY-MM-DD is correct)
    let sorted = Array.sort<UsagePeriod>(periods, func(a, b) {
      Text.compare(a.periodStart, b.periodStart)
    });
    #ok(sorted)
  };

  /// Delete a specific bill record. Caller must be the owner or an admin.
  public shared(msg) func deleteBill(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(bills, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?b) {
        if (not Principal.equal(b.homeowner, msg.caller) and not isAdmin(msg.caller)) {
          return #err(#Unauthorized)
        };
        ignore Map.delete(bills, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Admin ────────────────────────────────────────────────────────────────────

  public shared(msg) func setPaymentCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    payCanisterId := id;
    #ok(())
  };

  /// Grant a tier override for a principal (dev / support use).
  public shared(msg) func grantTier(p: Principal, tier: SubscriptionTier) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    Map.add(tierGrants, Text.compare, Principal.toText(p), tier);
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null { null };
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

  public query func metrics() : async Metrics {
    { totalBills = Map.size(bills); isPaused }
  };
}
