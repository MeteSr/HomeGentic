/**
 * HomeGentic Bills Canister
 *
 * Stores utility bill records per property, enabling anomaly detection and
 * property-aware expense intelligence (Epic #49).
 *
 * Each bill record captures provider, billing period, amount, and usage
 * so the platform can compute rolling baselines and flag anomalies.
 *
 * Anomaly detection:
 *   - Rolling 3-month average per (propertyId, billType)
 *   - getBillsForProperty returns all records — frontend or future job computes alerts
 *
 * Access control: callers may only read/write their own bills.
 */

import Array     "mo:core/Array";
import Char      "mo:core/Char";
import Float     "mo:core/Float";
import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Nat32     "mo:core/Nat32";
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
  };

  public type Metrics = {
    totalBills  : Nat;
    isPaused    : Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var billCounter      : Nat                   = 0;
  private var isPaused         : Bool                  = false;
  private var adminListEntries : [Principal]           = [];
  private var adminInitialized : Bool                  = false;
  private var billEntries      : [(Text, BillRecord)]  = [];

  private var bills = Map.empty<Text, BillRecord>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in billEntries.vals()) { Map.add(bills, Text.compare, k, v) };
    billEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) return #err(#InvalidInput("Canister is paused"));
    #ok(())
  };

  private func nextBillId() : Text {
    billCounter += 1;
    "BILL_" # Nat.toText(billCounter)
  };

  /// Compute 3-month rolling average amountCents for a (propertyId, billType, homeowner).
  /// Returns null if fewer than 2 prior bills exist (insufficient baseline).
  private func rollingAverage(
    propertyId: Text,
    billType: BillType,
    homeowner: Principal,
    excludeId: Text,
    periodEndRef: Text,   // ISO date of the bill being evaluated
  ) : ?Float {
    var sum  : Float = 0.0;
    var count: Nat   = 0;

    // Rough 90-day window: compare first 7 chars (YYYY-MM) of periodEnd
    let refYear  = if (Text.size(periodEndRef) >= 4) Text.subText(periodEndRef, 0, 4) else "0000";
    let refMonth = if (Text.size(periodEndRef) >= 7) Text.subText(periodEndRef, 5, 7) else "00";

    for ((_, b) in Map.entries(bills)) {
      if (b.id != excludeId
          and b.propertyId == propertyId
          and Principal.equal(b.homeowner, homeowner)
          and billTypeEq(b.billType, billType))
      {
        // Only include bills within the trailing 3 months
        let bYear  = if (Text.size(b.periodEnd) >= 4) Text.subText(b.periodEnd, 0, 4) else "0000";
        let bMonth = if (Text.size(b.periodEnd) >= 7) Text.subText(b.periodEnd, 5, 7) else "00";
        if (withinThreeMonths(bYear, bMonth, refYear, refMonth)) {
          sum   += Float.fromInt(b.amountCents);
          count += 1;
        }
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

  /// Returns true if (y2,m2) is within 3 calendar months before (y1,m1).
  private func withinThreeMonths(y2: Text, m2: Text, y1: Text, m1: Text) : Bool {
    let yi2 = textToNat(y2);
    let mi2 = textToNat(m2);
    let yi1 = textToNat(y1);
    let mi1 = textToNat(m1);
    let total2 = yi2 * 12 + mi2;
    let total1 = yi1 * 12 + mi1;
    // bill must be before ref and within 3 months back
    total2 < total1 and total1 - total2 <= 3
  };

  private func textToNat(t: Text) : Nat {
    var n : Nat = 0;
    for (c in t.chars()) {
      let code = Nat32.toNat(Char.toNat32(c));
      if (code >= 48 and code <= 57) {
        n := n * 10 + (code - 48)
      }
    };
    n
  };

  // ─── Core: Bill Operations ────────────────────────────────────────────────────

  /// Add a bill record for a property. Runs anomaly detection against the 3-month
  /// rolling average for that (property, billType) and sets anomalyFlag if > 20%.
  public shared(msg) func addBill(args: AddBillArgs) : async Result.Result<BillRecord, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(args.propertyId)  == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(args.propertyId)  > 200)  return #err(#InvalidInput("propertyId exceeds 200 characters"));
    if (Text.size(args.provider)    == 0)   return #err(#InvalidInput("provider cannot be empty"));
    if (Text.size(args.provider)    > 200)  return #err(#InvalidInput("provider exceeds 200 characters"));
    if (Text.size(args.periodStart) == 0)   return #err(#InvalidInput("periodStart cannot be empty"));
    if (Text.size(args.periodEnd)   == 0)   return #err(#InvalidInput("periodEnd cannot be empty"));

    let id  = nextBillId();
    let now = Time.now();

    // Anomaly detection: compare against 3-month rolling average
    let (anomalyFlag, anomalyReason) = switch (rollingAverage(
      args.propertyId, args.billType, msg.caller, id, args.periodEnd
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
      Iter.toArray(Map.vals(bills)),
      func(b) {
        b.propertyId == propertyId and Principal.equal(b.homeowner, msg.caller)
      }
    );
    #ok(result)
  };

  /// Delete a specific bill record. Caller must be the owner.
  public shared(msg) func deleteBill(id: Text) : async Result.Result<(), Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(bills, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?b) {
        if (not Principal.equal(b.homeowner, msg.caller) and not isAdmin(msg.caller)) {
          return #err(#Unauthorized)
        };
        Map.delete(bills, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Admin ────────────────────────────────────────────────────────────────────

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := false;
    #ok(())
  };

  public query func metrics() : async Metrics {
    { totalBills = Map.size(bills); isPaused }
  };
}
