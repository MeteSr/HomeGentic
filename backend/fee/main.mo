/**
 * HomeGentic Fee Canister
 * Platform fee tracking for Bid to List. A fee record is created (Owed) the
 * moment a homeowner accepts a proposal; it becomes Paid only on a settled
 * Stripe webhook, which is also what triggers identity release in the
 * listing canister (invariant 04: charge then release, never the reverse).
 */

import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Index     "../shared/Index";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";

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
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first initAdmins() call. Consumed on first successful use.
  private var bootstrapNonce:    ?Text = null;
  private var listingCanisterId: Text = "";

  private let fees = Map.empty<Text, FeeRecord>();

  // Secondary indexes over `fees` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let feesByAgent = Index.empty();
  private transient let feesIndexes : [Index.Keyed<FeeRecord>] = Index.indexed(fees, [
    (feesByAgent, func(r : FeeRecord) : ?Text { ?r.agentId.toText() }),
  ]);
  /// requestId → feeId, so a second recordFeeOwed for the same request is rejected.
  private let feeByRequest = Map.empty<Text, Text>();

  private let updateCallLimits = Map.empty<Text, (Nat, Int)>();
  private var maxUpdatesPerMin : Nat = 30;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };

  private func isAdmin(caller: Principal) : Bool {
    Admin.contains(adminEntries, caller)
  };

  private func isTrusted(caller: Principal) : Bool {
    isAdmin(caller) or caller.toText() == listingCanisterId
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func nextFeeId() : Text {
    feeCounter += 1;
    "FEE_" # feeCounter.toText()
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
    switch (feeByRequest.get(requestId)) {
      case (?existingId) {
        switch (fees.get(existingId)) {
          case null { #err(#NotFound) }; // unreachable: index and map are kept in sync
          case (?existing) {
            if (existing.status == #Paid) return #err(#AlreadyExists);
            // Homeowner re-selected a different bid before payment settled — retarget
            // the still-open fee record rather than erroring.
            let updated = { existing with proposalId; agentId; homeownerId; amountCents; updatedAt = now };
            Index.put(fees, feesIndexes, existingId, updated);
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
        Index.put(fees, feesIndexes, id, record);
        feeByRequest.add(requestId, id);
        #ok(record)
      };
    }
  };

  /// M13: the fee record for a Bid to List request. Read cross-canister by the
  /// listing canister in markListingFeePaid, so an award is only released for
  /// the proposal the homeowner selected and whose fee actually settled.
  /// Admins and the wired listing canister only; everyone else gets null.
  public query(msg) func getFeeForRequest(requestId: Text) : async ?FeeRecord {
    if (not isTrusted(msg.caller)) return null;
    switch (feeByRequest.get(requestId)) {
      case null { null };
      case (?feeId) { fees.get(feeId) };
    }
  };

  public query(msg) func getMyFees() : async [FeeRecord] {
    Index.records(feesByAgent, msg.caller.toText(), fees).toArray()
  };

  public query(msg) func getAllFees() : async Result.Result<[FeeRecord], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(fees.values().toArray())
  };

  public query(msg) func getFeesDue() : async Result.Result<[FeeRecord], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(fees.values().filter(func(f: FeeRecord) : Bool { f.status == #Owed or f.status == #Invoiced }).toArray())
  };

  public shared(msg) func markFeeInvoiced(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (fees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        let updated = { f with status = #Invoiced; updatedAt = Time.now() };
        Index.put(fees, feesIndexes, feeId, updated);
        #ok(updated)
      };
    }
  };

  /// Called only from the settled Stripe webhook (via an admin-held identity).
  /// This is the single trigger for identity release — see invariant 04.
  public shared(msg) func markFeePaid(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (fees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        if (f.status == #Paid) return #ok(f); // idempotent on webhook retry
        let updated = { f with status = #Paid; updatedAt = Time.now() };
        Index.put(fees, feesIndexes, feeId, updated);
        #ok(updated)
      };
    }
  };

  /// 30-day "we did not sign" refund path (H6 / A3's stated refund term).
  public shared(msg) func waiveFee(feeId: Text) : async Result.Result<FeeRecord, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (fees.get(feeId)) {
      case null { #err(#NotFound) };
      case (?f) {
        let updated = { f with status = #Waived; updatedAt = Time.now() };
        Index.put(fees, feesIndexes, feeId, updated);
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

  /// H-20: Set the one-time bootstrap nonce before calling initAdmins() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  public shared(msg) func initAdmins(newAdmins: [Principal], nonce: Text) : async Result.Result<(), Error> {
    if (adminInitialized) return #err(#NotAuthorized);
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    if (newAdmins.size() == 0) return #err(#InvalidInput("admin list cannot be empty"));
    if (not Admin.nonceMatches(bootstrapNonce, nonce)) return #err(#NotAuthorized);
    bootstrapNonce := null;
    adminEntries := newAdmins;
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Admin.add(adminEntries, newAdmin);
    #ok(())
  };

  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Admin.remove(adminEntries, target);
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

  public query func metrics() : async Metrics {
    var owed = 0;
    var paid = 0;
    for (f in fees.values()) {
      if (f.status == #Owed or f.status == #Invoiced) { owed += f.amountCents };
      if (f.status == #Paid) { paid += f.amountCents };
    };
    { totalFees = fees.size(); owedCents = owed; paidCents = paid; isPaused }
  };
}
