/**
 * HomeGentic Referrals Canister
 *
 * Each user gets a unique shareable code (HG-000001 format).
 * When a new user signs up via a referral link and completes their
 * first paid subscription month, both parties receive a $10 credit
 * (tracked as 1000 cents in this canister).
 *
 * Credit redemption against actual payment is wired in a future
 * payment-canister integration; this canister is the source of truth
 * for balances and conversion state.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";
import Inspect "../shared/Inspect";

persistent actor Referrals {

  // ─── Types ────────────────────────────────────────────────────────────────────

  public type Referral = {
    referrer    : Text;   // Principal as text
    referee     : Text;
    code        : Text;
    referredAt  : Int;
    convertedAt : ?Int;
  };

  public type Error = {
    #AlreadyReferred;
    #SelfReferral;
    #CodeNotFound;
    #AlreadyConverted;
    #Unauthorized;
    #InvalidInput : Text;
  };

  public type Stats = {
    totalCodes     : Nat;
    totalReferrals : Nat;
    totalConverted : Nat;
  };

  // ─── State ────────────────────────────────────────────────────────────────────

  private var paymentCanisterId  : Text = "";
  private var adminList          : [Text] = [];
  private var adminInitialized   : Bool = false;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce     : ?Text = null;
  private var codeCounter        : Nat = 0;
  private var paused             : Bool = false;
  private var pauseExpiryNs      : ?Int = null;

  // code  → referrer (Text principal)
  private let codeOwner    = Map.empty<Text, Text>();
  // referrer (Text principal) → their code
  private let referrerCode = Map.empty<Text, Text>();
  // referee  (Text principal) → Referral record
  private let referralOf   = Map.empty<Text, Referral>();
  // principal (Text) → credit balance in cents
  private let credits      = Map.empty<Text, Nat>();

  private transient let CREDIT_CENTS : Nat = 1000; // $10.00

  // L6: per-principal rate limit (transient — a DoS guard, resets on upgrade).
  private transient let callLimits = Map.empty<Text, (Nat, Int)>();
  private transient let MAX_CALLS_PER_MIN : Nat = 10;

  private func tryConsumeSlot(caller : Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(callLimits, caller.toText(), Time.now(), MAX_CALLS_PER_MIN)
  };

  /// Cycle-saving ingress filter only (the real checks are in each method).
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    Inspect.accept(caller, arg, Inspect.MAX_ARG_BYTES)
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private func isAdmin(caller : Principal) : Bool {
    let t = caller.toText();
    Option.isSome(adminList.find(func(a) { a == t }))
  };

  private func padNum(n : Nat) : Text {
    let s = n.toText();
    let len = Text.size(s);
    if (len >= 6) { s } else {
      var pad = s;
      var i = len;
      while (i < 6) { pad := "0" # pad; i += 1 };
      pad
    }
  };

  private func makeCode() : Text {
    codeCounter += 1;
    "HG-" # padNum(codeCounter)
  };

  private func requireActive(caller : Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#Unauthorized);
    if (Admin.pausedNow(paused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeSlot(caller)) return #err(#InvalidInput("Rate limit exceeded. Try again in a minute."));
    #ok(())
  };

  private func addCredit(p : Text, amount : Nat) {
    let current = credits.get(p).get(0);
    credits.add(p, current + amount);
  };

  // ─── Public API ───────────────────────────────────────────────────────────────

  /// Get (or lazily create) the caller's unique referral code.
  /// L6: the anonymous principal gets no code (it would be a shared identity).
  public shared(msg) func getMyCode() : async Text {
    if (msg.caller.isAnonymous()) return "";
    let key = msg.caller.toText();
    switch (referrerCode.get(key)) {
      case (?code) code;
      case null {
        switch (requireActive(msg.caller)) { case (#err _) return ""; case _ {} };
        let code = makeCode();
        referrerCode.add(key, code);
        codeOwner.add(code, key);
        code
      };
    }
  };

  /// Record that the caller is signing up via `code`.
  /// Call once during onboarding — idempotent error if already referred.
  public shared(msg) func useReferralCode(code : Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let callerId = msg.caller.toText();

    if (Text.size(code) == 0) return #err(#InvalidInput("code cannot be empty"));
    if (Text.size(code) > 32) return #err(#InvalidInput("code too long"));

    // Resolve the referrer
    let referrer = switch (codeOwner.get(code)) {
      case null    return #err(#CodeNotFound);
      case (?r)    r;
    };

    if (referrer == callerId) return #err(#SelfReferral);

    // Only allow one referral per referee
    if (Option.isSome(referralOf.get(callerId))) {
      return #err(#AlreadyReferred);
    };

    // L6: a code can only be attached at onboarding, i.e. while the caller is
    // not on a paid plan. Otherwise an existing subscriber could attach a code
    // before a renewal (payment calls markConverted on every paid activation).
    if (Text.size(paymentCanisterId) > 0 and not isAdmin(msg.caller)) {
      let pay = Canisters.payment(paymentCanisterId);
      let tier = try { await pay.getTierForPrincipal(msg.caller) } catch (_) {
        return #err(#InvalidInput("Could not verify subscription status; try again later"))
      };
      switch (tier) {
        case (#Free or #ContractorFree) {};
        case _ { return #err(#InvalidInput("Referral codes can only be used before your first paid subscription")) };
      };
      // Re-check after the await (TOCTOU): one referral per referee.
      if (Option.isSome(referralOf.get(callerId))) {
        return #err(#AlreadyReferred);
      };
    };

    let r : Referral = {
      referrer;
      referee    = callerId;
      code;
      referredAt = Time.now();
      convertedAt = null;
    };
    referralOf.add(callerId, r);
    #ok(())
  };

  /// Mark a referee as converted (first paid month complete).
  /// Awards $10 credit to both referrer and referee.
  /// Must be called by the registered payment canister.
  public shared(msg) func markConverted(referee : Principal) : async Result.Result<(), Error> {
    let caller = msg.caller.toText();
    if (caller != paymentCanisterId and not isAdmin(msg.caller)) {
      return #err(#Unauthorized);
    };

    let refText = referee.toText();
    switch (referralOf.get(refText)) {
      case null   return #err(#CodeNotFound);
      case (?r) {
        if (Option.isSome(r.convertedAt)) return #err(#AlreadyConverted);
        let updated : Referral = {
          referrer    = r.referrer;
          referee     = r.referee;
          code        = r.code;
          referredAt  = r.referredAt;
          convertedAt = ?Time.now();
        };
        referralOf.add(refText, updated);
        addCredit(r.referrer, CREDIT_CENTS);
        addCredit(r.referee,  CREDIT_CENTS);
        #ok(())
      };
    }
  };

  /// All referrals made by the caller (people who used their code).
  public shared query(msg) func getMyReferrals() : async [Referral] {
    let callerId = msg.caller.toText();
    let all = referralOf.values().toArray();
    all.filter(func(r) { r.referrer == callerId })
  };

  /// Credit balance in cents (1000 = $10.00).
  public shared query(msg) func getCreditBalance() : async Nat {
    if (msg.caller.isAnonymous()) return 0;
    let key = msg.caller.toText();
    credits.get(key).get(0)
  };

  // ─── Admin ────────────────────────────────────────────────────────────────────

  public shared(msg) func setPaymentCanisterId(id : Text) : async () {
    assert isAdmin(msg.caller);
    paymentCanisterId := id;
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  /// First call requires the bootstrap nonce (H-20); subsequent calls require an existing admin.
  public shared(msg) func addAdmin(p : Principal, nonce : Text) : async Result.Result<(), Text> {
    switch (Admin.authorizeAdd(adminInitialized, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err("unauthorized") };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    let t = p.toText();
    if (Option.isNull(adminList.find(func(a) { a == t }))) {
      adminList := adminList.concat([t]);
    };
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func pause(durationSeconds : ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    paused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    paused        := false;
    pauseExpiryNs := null;
    #ok(())
  };

  // ─── Metrics ──────────────────────────────────────────────────────────────────

  public query func metrics() : async Stats {
    let all = referralOf.values().toArray();
    {
      totalCodes     = codeCounter;
      totalReferrals = all.size();
      totalConverted = all.filter(func(r) {
        Option.isSome(r.convertedAt)
      }).size();
    }
  };
}
