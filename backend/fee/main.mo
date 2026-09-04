/**
 * HomeGentic Fee Canister
 * Platform fee tracking for Bid to List. A fee record is created (Owed) the
 * moment a homeowner accepts a proposal; it becomes Paid only on a settled
 * Stripe webhook, which is also what triggers identity release in the
 * listing canister (invariant 04: charge then release, never the reverse).
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Fee {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type FeeStatus = { #Owed; #Invoiced; #Paid; #Waived };

  public type FeeRecord = {
    id:          Text;
    requestId:   Text;
    proposalId:  Text;
    agentId:     Principal;
    homeownerId: Principal;
    amountCents: Nat;
    status:      FeeStatus;
    createdAt:   Int;
    updatedAt:   Int;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #InvalidInput: Text;
  };

  public type Metrics = {
    totalFees:      Nat;
    owedCents:      Nat;
    paidCents:      Nat;
    isPaused:       Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var feeCounter:        Nat = 0;
  private var isPaused:          Bool = false;
  private var pauseExpiryNs:     ?Int = null;
  private var adminEntries:      [Principal] = [];
  private var adminInitialized:  Bool = false;
  private var listingCanisterId: Text = "";

  private let fees = Map.empty<Text, FeeRecord>();
  /// requestId → feeId, so a second recordFeeOwed for the same request is rejected.
  private let feeByRequest = Map.empty<Text, Text>();

  private let updateCallLimits = Map.empty<Text, (Nat, Int)>();
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS : Int = 60_000_000_000;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminEntries, func(a) { a == caller }))
  };

  private func isTrusted(caller: Principal) : Bool {
    isAdmin(caller) or Principal.toText(caller) == listingCanisterId
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

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
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

  private func nextFeeId() : Text {
    feeCounter += 1;
    "FEE_" # Nat.toText(feeCounter)
  };

  // ─── Fee lifecycle ───────────────────────────────────────────────────────────

  /// Create a fee-owed record on selection. Callable by an admin or by the wired
  /// listing canister only — a fee must never be creatable by an arbitrary caller.
  public shared(msg) func recordFeeOwed(
    requestId:   Text,
    proposalId:  Text,
    agentId:     Principal,
    homeownerId: Principal,
    amountCents: Nat
  ) : async Result.Result<FeeRecord, Error> {
    if (not isTrusted(msg.caller)) return #err(#NotAuthorized);
    if (amountCents == 0) return #err(#InvalidInput("amountCents must be positive"));
    let now = Time.now();
    switch (Map.get(feeByRequest, Text.compare, requestId)) {
      case (?existingId) {
        switch (Map.get(fees, Text.compare, existingId)) {
          case null { #err(#NotFound) }; // unreachable: index and map are kept in sync
          case (?existing) {
            if (existing.status == #Paid) return #err(#AlreadyExists);
            // Homeowner re-selected a different bid before payment settled — retarget
            // the still-open fee record rather than erroring.
            let updated = { existing with proposalId; agentId; homeownerId; amountCents; updatedAt = now };
            Map.add(fees, Text.compare, existingId, updated);
            #ok(updated)
          };
        }
      };
      case null {
        let id = nextFeeId();
        let record: FeeRecord = {
          id; requestId; proposalId; agentId; homeownerId; amountCents;
          status = #Owed; createdAt = now; updatedAt = now;
        };
        Map.add(fees, Text.compare, id, record);
        Map.add(feeByRequest, Text.compare, requestId, id);
        #ok(record)
      };
    }
  };

  public query(msg) func getMyFees() : async [FeeRecord] {
    Iter.toArray(Iter.filter(Map.values(fees), func(f: FeeRecord) : Bool { f.agentId == msg.caller }))
  };

  public query(msg) func getAllFees() : async Result.Result<[FeeRecord], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Iter.toArray(Map.values(fees)))
  };

  public query(msg) func getFeesDue() : async Result.Result<[FeeRecord], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Iter.toArray(Iter.filter(Map.values(fees), func(f: FeeRecord) : Bool { f.status == #Owed or f.status == #Invoiced })))
  };

  public shared(msg) func markFeeInvoiced(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(fees, Text.compare, feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        let updated = { f with status = #Invoiced; updatedAt = Time.now() };
        Map.add(fees, Text.compare, feeId, updated);
        #ok(updated)
      };
    }
  };

  /// Called only from the settled Stripe webhook (via an admin-held identity).
  /// This is the single trigger for identity release — see invariant 04.
  public shared(msg) func markFeePaid(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(fees, Text.compare, feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        if (f.status == #Paid) return #ok(f); // idempotent on webhook retry
        let updated = { f with status = #Paid; updatedAt = Time.now() };
        Map.add(fees, Text.compare, feeId, updated);
        #ok(updated)
      };
    }
  };

  /// 30-day "we did not sign" refund path (H6 / A3's stated refund term).
  public shared(msg) func waiveFee(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(fees, Text.compare, feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        let updated = { f with status = #Waived; updatedAt = Time.now() };
        Map.add(fees, Text.compare, feeId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Admin ───────────────────────────────────────────────────────────────────

  public shared(msg) func setListingCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    listingCanisterId := id;
    #ok(())
  };

  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func initAdmins(newAdmins: [Principal]) : async Result.Result<(), Error> {
    if (adminInitialized) return #err(#NotAuthorized);
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (newAdmins.size() == 0) return #err(#InvalidInput("admin list cannot be empty"));
    adminEntries := newAdmins;
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) { adminEntries := Array.concat(adminEntries, [newAdmin]) };
    #ok(())
  };

  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Array.filter<Principal>(adminEntries, func(a) { a != target });
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

  public query func metrics() : async Metrics {
    var owed = 0;
    var paid = 0;
    for (f in Map.values(fees)) {
      if (f.status == #Owed or f.status == #Invoiced) { owed += f.amountCents };
      if (f.status == #Paid) { paid += f.amountCents };
    };
    { totalFees = Map.size(fees); owedCents = owed; paidCents = paid; isPaused }
  };
}
