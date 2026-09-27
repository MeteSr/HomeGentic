/**
 * HomeGentic Bills Canister
 *
 * Stores utility bill records per property, enabling anomaly detection and
 * property-aware expense intelligence (Epic #49).
 *
 * Tier-based upload limits (enforced server-side via payment canister):
 *   Free          — blocked (bills need a subscription)
 *   Pro           — unlimited
 *   ContractorFree / ContractorPro — unlimited
 *
 * When payCanisterId is set (post-deploy wiring), the tier is resolved live
 * via getTierForPrincipal(). Without it there is no tier source and every
 * caller is treated as #Free (fail closed).
 *
 * Anomaly detection:
 *   - Rolling 3-month average per (propertyId, billType, homeowner)
 *   - Bills > 20% above baseline are flagged with a natural-language reason
 *
 * Recurring expenses:
 *   - Fixed housing costs (mortgage, property tax, HOA, insurance) entered once
 *     with a frequency and start/end date instead of per-statement uploads
 *
 * Access control: callers may only read/write their own bills.
 */

import Array     "mo:core/Array";
import Char      "mo:core/Char";
import Float     "mo:core/Float";
import List      "mo:core/List";
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

  /// Kept separate from BillType on purpose: BillRecord lives in a Map (mutable,
  /// hence invariant), so widening BillType would need an explicit migration.
  public type ExpenseCategory = {
    #Mortgage;
    #PropertyTax;
    #HOA;
    #HomeInsurance;
    #Other;
  };

  public type ExpenseFrequency = {
    #Monthly;
    #Quarterly;
    #SemiAnnual;
    #Annual;
  };

  /// A fixed, scheduled housing cost (mortgage, tax, HOA, insurance) entered
  /// once instead of uploading every statement.
  public type RecurringExpense = {
    id          : Text;
    propertyId  : Text;
    homeowner   : Principal;
    category    : ExpenseCategory;
    provider    : Text;           // lender, county, HOA, insurer
    amountCents : Nat;            // per occurrence, not per month
    frequency   : ExpenseFrequency;
    startDate   : Text;           // YYYY-MM-DD
    endDate     : ?Text;          // YYYY-MM-DD; null = ongoing
    createdAt   : Time.Time;
    updatedAt   : Time.Time;
  };

  public type RecurringExpenseFields = {
    category    : ExpenseCategory;
    provider    : Text;
    amountCents : Nat;
    frequency   : ExpenseFrequency;
    startDate   : Text;
    endDate     : ?Text;
  };

  public type SubscriptionTier = {
    #Free;
    #Pro;
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
    #NotAuthorized;
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
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce   : ?Text                      = null;
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  private var payCanisterId    : Text                       = "";

  private let bills      = Map.empty<Text, BillRecord>();

  private var recurringCounter  : Nat = 0;
  private let recurringExpenses = Map.empty<Text, RecurringExpense>();
  private transient let MAX_RECURRING_PER_PROPERTY : Nat = 50;

  /// Property canister ID — set post-deploy via setPropertyCanisterId(). While
  /// unset, every record is visible only to the principal who created it.
  private var propCanisterId : Text = "";


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
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
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


  /// Monthly upload limit for a tier. 0 = unlimited. 999 = blocked sentinel.
  private func monthlyUploadLimit(tier: SubscriptionTier) : Nat {
    switch tier {
      case (#Free)             { 999 };  // blocked — unsubscribed (checked separately)
      case (#Pro)              { 0   };
      case (#ContractorFree)   { 0   };  // unlimited for free contractor tier
      case (#ContractorPro)    { 0   };
    }
  };

  /// Count bills uploaded by this principal in the same calendar month as `nowNs`.
  /// Month boundary is approximate: 1 month ≈ 30.44 days in nanoseconds.
  private transient let ONE_MONTH_NS : Int = 2_629_800_000_000_000; // ~30.44 days

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

  /// Resolve the caller's subscription tier — live from the payment canister
  /// when wired, else from the local grant map (dev fallback).
  private func resolveTier(caller: Principal) : async* SubscriptionTier {
    if (payCanisterId != "") {
      let payActor = actor(payCanisterId) : actor {
        getTierForPrincipal : (Principal) -> async { #Free; #Pro; #ContractorFree; #ContractorPro };
      };
      await payActor.getTierForPrincipal(caller)
    } else {
      #Free  // payment canister not wired: no tier source, fail closed
    }
  };

  // ─── Property access ─────────────────────────────────────────────────────────

  type AccessRole = { #Owner; #CoOwner; #Manager; #Viewer; #NoAccess };

  /// The caller's role on a property, from the property canister. null means the
  /// canister isn't wired or doesn't know the property — records are then
  /// visible only to their author, exactly as before sharing existed.
  private func accessRole(propertyId: Text, caller: Principal) : async* ?AccessRole {
    if (propCanisterId == "") return null;
    let propActor = actor(propCanisterId) : actor {
      getAccessRole : (Text, Principal) -> async ?AccessRole;
    };
    await propActor.getAccessRole(propertyId, caller)
  };

  private func canWrite(role: ?AccessRole) : Bool {
    switch role { case (null or ?#Owner or ?#CoOwner or ?#Manager) true; case _ false }
  };

  /// Owner and co-owners control every record on the property, and alone see
  /// or write the mortgage.
  private func hasFullControl(role: ?AccessRole) : Bool {
    switch role { case (?#Owner or ?#CoOwner) true; case _ false }
  };

  private func seesProperty(role: ?AccessRole) : Bool {
    switch role { case (?#Owner or ?#CoOwner or ?#Manager or ?#Viewer) true; case _ false }
  };

  private func mortgageAllowed(role: ?AccessRole) : Bool {
    role == null or hasFullControl(role)
  };

  private func isMortgage(c: ExpenseCategory) : Bool {
    switch c { case (#Mortgage) true; case _ false }
  };

  private func isIsoDate(t: Text) : Bool {
    let cs = Text.toArray(t);
    if (cs.size() != 10) return false;
    for (i in cs.keys()) {
      let ok = if (i == 4 or i == 7) cs[i] == '-' else Char.isDigit(cs[i]);
      if (not ok) return false;
    };
    true
  };

  private func validateRecurringFields(f: RecurringExpenseFields) : ?Text {
    if (Text.size(f.provider) == 0)   return ?"provider cannot be empty";
    if (Text.size(f.provider) > 200)  return ?"provider exceeds 200 characters";
    if (f.amountCents == 0)           return ?"amountCents must be greater than 0";
    if (not isIsoDate(f.startDate))   return ?"startDate must be YYYY-MM-DD";
    switch (f.endDate) {
      case null {};
      case (?e) {
        if (not isIsoDate(e)) return ?"endDate must be YYYY-MM-DD";
        if (Text.compare(e, f.startDate) == #less) return ?"endDate cannot be before startDate";
      };
    };
    null
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

    if (not canWrite(await* accessRole(args.propertyId, msg.caller))) return #err(#NotAuthorized);

    // ── Tier enforcement ──────────────────────────────────────────────────────
    let callerTier = await* resolveTier(msg.caller);

    if (callerTier == #Free) {
      return #err(#TierLimitReached(
        "Bill uploads require an active subscription. Subscribe to Pro ($59/year) to get started."
      ));
    };

    let limit = monthlyUploadLimit(callerTier);
    let now   = Time.now();

    if (limit > 0 and countUploadsThisMonth(msg.caller, now) >= limit) {
      return #err(#TierLimitReached(
        "Monthly upload limit reached. Upgrade to Pro ($59/year) for unlimited bill uploads."
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

  /// Return a property's bills: all of them for anyone with a role on the
  /// property (owner, co-owner, manager, viewer), otherwise only the caller's own.
  public shared(msg) func getBillsForProperty(propertyId: Text) : async Result.Result<[BillRecord], Error> {
    let shared_ = seesProperty(await* accessRole(propertyId, msg.caller));
    let result = Array.filter<BillRecord>(
      Iter.toArray(Map.values(bills)),
      func(b) {
        b.propertyId == propertyId and (shared_ or Principal.equal(b.homeowner, msg.caller))
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
    let shared_ = seesProperty(await* accessRole(propertyId, msg.caller));
    let cutoffNs : Int = Time.now() - (months * 30 * 24 * 3_600_000_000_000 : Nat);
    let periodsBuf = List.empty<UsagePeriod>();

    for ((_, b) in Map.entries(bills)) {
      if (b.propertyId == propertyId
          and (shared_ or Principal.equal(b.homeowner, msg.caller))
          and billTypeEq(b.billType, billType)
          and b.uploadedAt >= cutoffNs)
      {
        switch (b.usageAmount) {
          case null {};
          case (?amount) {
            switch (b.usageUnit) {
              case null {};
              case (?unit) {
                List.add(periodsBuf, {
                  periodStart = b.periodStart;
                  usageAmount = amount;
                  usageUnit   = unit;
                });
              };
            };
          };
        };
      };
    };

    // Sort chronologically by periodStart (lexicographic on YYYY-MM-DD is correct)
    let sorted = Array.sort<UsagePeriod>(List.toArray(periodsBuf), func(a, b) {
      Text.compare(a.periodStart, b.periodStart)
    });
    #ok(sorted)
  };

  /// Delete a bill. Allowed for its author, the property's owner or co-owners, or an admin.
  public shared(msg) func deleteBill(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let propertyId = switch (Map.get(bills, Text.compare, id)) {
      case null { return #err(#NotFound) };
      case (?b) {
        if (Principal.equal(b.homeowner, msg.caller) or isAdmin(msg.caller)) {
          ignore Map.delete(bills, Text.compare, id);
          return #ok(());
        };
        b.propertyId
      };
    };
    if (not hasFullControl(await* accessRole(propertyId, msg.caller))) return #err(#NotAuthorized);
    // Re-check after the await: the bill may have been removed meanwhile.
    if (Map.get(bills, Text.compare, id) == null) return #err(#NotFound);
    ignore Map.delete(bills, Text.compare, id);
    #ok(())
  };

  // ─── Core: Recurring Expenses ─────────────────────────────────────────────────

  /// Add a fixed recurring housing cost. Same subscription gate as addBill,
  /// but no monthly upload quota — one entry covers every future occurrence.
  public shared(msg) func addRecurringExpense(
    propertyId : Text,
    fields     : RecurringExpenseFields,
  ) : async Result.Result<RecurringExpense, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0)  return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(propertyId) > 200) return #err(#InvalidInput("propertyId exceeds 200 characters"));
    switch (validateRecurringFields(fields)) { case (?m) return #err(#InvalidInput(m)); case null {} };

    let role = await* accessRole(propertyId, msg.caller);
    if (not canWrite(role)) return #err(#NotAuthorized);
    if (isMortgage(fields.category) and not mortgageAllowed(role)) return #err(#NotAuthorized);

    if ((await* resolveTier(msg.caller)) == #Free) {
      return #err(#TierLimitReached(
        "Bill tracking requires an active subscription. Subscribe to Pro ($59/year) to get started."
      ));
    };

    var existing : Nat = 0;
    for (e in Map.values(recurringExpenses)) {
      if (e.propertyId == propertyId) existing += 1;
    };
    if (existing >= MAX_RECURRING_PER_PROPERTY) {
      return #err(#InvalidInput("Recurring expense limit reached for this property"));
    };

    recurringCounter += 1;
    let now = Time.now();
    let expense : RecurringExpense = {
      id          = "REC_" # Nat.toText(recurringCounter);
      propertyId;
      homeowner   = msg.caller;
      category    = fields.category;
      provider    = fields.provider;
      amountCents = fields.amountCents;
      frequency   = fields.frequency;
      startDate   = fields.startDate;
      endDate     = fields.endDate;
      createdAt   = now;
      updatedAt   = now;
    };
    Map.add(recurringExpenses, Text.compare, expense.id, expense);
    #ok(expense)
  };

  /// Return a property's recurring expenses, oldest start first. Anyone with a
  /// role on the property sees them all except the mortgage, which only the
  /// owner and co-owners see; others see only entries they created.
  public shared(msg) func getRecurringExpensesForProperty(propertyId: Text) : async Result.Result<[RecurringExpense], Error> {
    let role = await* accessRole(propertyId, msg.caller);
    let visible = Array.filter<RecurringExpense>(
      Iter.toArray(Map.values(recurringExpenses)),
      func(e) {
        e.propertyId == propertyId and (
          Principal.equal(e.homeowner, msg.caller)
          or (seesProperty(role) and (not isMortgage(e.category) or hasFullControl(role)))
        )
      }
    );
    #ok(Array.sort<RecurringExpense>(visible, func(a, b) { Text.compare(a.startDate, b.startDate) }))
  };

  /// Replace the editable fields of a recurring expense (e.g. a refinance or
  /// an insurance renewal). Allowed for its author or the property's owner or
  /// co-owners; only they may set or change a mortgage entry.
  public shared(msg) func updateRecurringExpense(
    id     : Text,
    fields : RecurringExpenseFields,
  ) : async Result.Result<RecurringExpense, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (validateRecurringFields(fields)) { case (?m) return #err(#InvalidInput(m)); case null {} };
    let propertyId = switch (Map.get(recurringExpenses, Text.compare, id)) {
      case null { return #err(#NotFound) };
      case (?e) e.propertyId;
    };
    let role = await* accessRole(propertyId, msg.caller);
    // Re-read after the await so a concurrent edit or delete isn't clobbered.
    switch (Map.get(recurringExpenses, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?e) {
        if (not Principal.equal(e.homeowner, msg.caller) and not hasFullControl(role)) return #err(#NotAuthorized);
        if ((isMortgage(e.category) or isMortgage(fields.category)) and not mortgageAllowed(role)) {
          return #err(#NotAuthorized)
        };
        let updated : RecurringExpense = {
          e with
          category    = fields.category;
          provider    = fields.provider;
          amountCents = fields.amountCents;
          frequency   = fields.frequency;
          startDate   = fields.startDate;
          endDate     = fields.endDate;
          updatedAt   = Time.now();
        };
        Map.add(recurringExpenses, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  /// Delete a recurring expense. Allowed for its author, the property's owner
  /// or co-owners, or an admin.
  public shared(msg) func deleteRecurringExpense(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let propertyId = switch (Map.get(recurringExpenses, Text.compare, id)) {
      case null { return #err(#NotFound) };
      case (?e) {
        if (Principal.equal(e.homeowner, msg.caller) or isAdmin(msg.caller)) {
          ignore Map.delete(recurringExpenses, Text.compare, id);
          return #ok(());
        };
        e.propertyId
      };
    };
    if (not hasFullControl(await* accessRole(propertyId, msg.caller))) return #err(#NotAuthorized);
    if (Map.get(recurringExpenses, Text.compare, id) == null) return #err(#NotFound);
    ignore Map.delete(recurringExpenses, Text.compare, id);
    #ok(())
  };

  // ─── Admin ────────────────────────────────────────────────────────────────────

  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id;
    #ok(())
  };

  public shared(msg) func setPaymentCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := id;
    #ok(())
  };


  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared func setBootstrapNonce(nonce: Text) : async () {
    if (adminInitialized) return;  // already bootstrapped — ignore
    if (bootstrapNonce != null) return;  // nonce already set — can only be set once
    bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    if (adminInitialized) {
      if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    } else {
      switch (bootstrapNonce) {
        case null { return #err(#NotAuthorized) };
        case (?n) { if (nonce != n) return #err(#NotAuthorized) };
      };
      bootstrapNonce := null;
    };
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    adminInitialized := true;
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
      case null { null };
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
    { totalBills = Map.size(bills); isPaused }
  };
}
