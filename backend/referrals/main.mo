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
  private var codeCounter        : Nat = 0;
  private var paused             : Bool = false;

  // code  → referrer (Text principal)
  private let codeOwner    = Map.empty<Text, Text>();
  // referrer (Text principal) → their code
  private let referrerCode = Map.empty<Text, Text>();
  // referee  (Text principal) → Referral record
  private let referralOf   = Map.empty<Text, Referral>();
  // principal (Text) → credit balance in cents
  private let credits      = Map.empty<Text, Nat>();

  private let CREDIT_CENTS : Nat = 1000; // $10.00

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private func isAdmin(caller : Principal) : Bool {
    let t = Principal.toText(caller);
    Option.isSome(Array.find<Text>(adminList, func(a) { a == t }))
  };

  private func padNum(n : Nat) : Text {
    let s = Nat.toText(n);
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

  private func addCredit(p : Text, amount : Nat) {
    let current = Option.get(Map.get(credits, Text.compare, p), 0);
    ignore Map.add(credits, Text.compare, p, current + amount);
  };

  // ─── Public API ───────────────────────────────────────────────────────────────

  /// Get (or lazily create) the caller's unique referral code.
  public shared(msg) func getMyCode() : async Text {
    let key = Principal.toText(msg.caller);
    switch (Map.get(referrerCode, Text.compare, key)) {
      case (?code) code;
      case null {
        let code = makeCode();
        ignore Map.add(referrerCode, Text.compare, key, code);
        ignore Map.add(codeOwner,    Text.compare, code, key);
        code
      };
    }
  };

  /// Record that the caller is signing up via `code`.
  /// Call once during onboarding — idempotent error if already referred.
  public shared(msg) func useReferralCode(code : Text) : async Result.Result<(), Error> {
    if (paused) return #err(#InvalidInput("service paused"));
    let callerId = Principal.toText(msg.caller);

    if (Text.size(code) == 0) return #err(#InvalidInput("code cannot be empty"));

    // Resolve the referrer
    let referrer = switch (Map.get(codeOwner, Text.compare, code)) {
      case null    return #err(#CodeNotFound);
      case (?r)    r;
    };

    if (referrer == callerId) return #err(#SelfReferral);

    // Only allow one referral per referee
    if (Option.isSome(Map.get(referralOf, Text.compare, callerId))) {
      return #err(#AlreadyReferred);
    };

    let r : Referral = {
      referrer;
      referee    = callerId;
      code;
      referredAt = Time.now();
      convertedAt = null;
    };
    ignore Map.add(referralOf, Text.compare, callerId, r);
    #ok(())
  };

  /// Mark a referee as converted (first paid month complete).
  /// Awards $10 credit to both referrer and referee.
  /// Must be called by the registered payment canister.
  public shared(msg) func markConverted(referee : Principal) : async Result.Result<(), Error> {
    let caller = Principal.toText(msg.caller);
    if (caller != paymentCanisterId and not isAdmin(msg.caller)) {
      return #err(#Unauthorized);
    };

    let refText = Principal.toText(referee);
    switch (Map.get(referralOf, Text.compare, refText)) {
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
        ignore Map.add(referralOf, Text.compare, refText, updated);
        addCredit(r.referrer, CREDIT_CENTS);
        addCredit(r.referee,  CREDIT_CENTS);
        #ok(())
      };
    }
  };

  /// All referrals made by the caller (people who used their code).
  public shared query(msg) func getMyReferrals() : async [Referral] {
    let callerId = Principal.toText(msg.caller);
    let all = Iter.toArray(Map.values(referralOf));
    Array.filter<Referral>(all, func(r) { r.referrer == callerId })
  };

  /// Credit balance in cents (1000 = $10.00).
  public shared query(msg) func getCreditBalance() : async Nat {
    let key = Principal.toText(msg.caller);
    Option.get(Map.get(credits, Text.compare, key), 0)
  };

  // ─── Admin ────────────────────────────────────────────────────────────────────

  public shared(msg) func setPaymentCanisterId(id : Text) : async () {
    assert isAdmin(msg.caller);
    paymentCanisterId := id;
  };

  /// First call bootstraps the admin list; subsequent calls require an existing admin.
  public shared(msg) func addAdmin(p : Principal) : async Result.Result<(), Text> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err("unauthorized");
    let t = Principal.toText(p);
    if (Option.isNull(Array.find<Text>(adminList, func(a) { a == t }))) {
      adminList := Array.concat(adminList, [t]);
    };
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func pause()   : async () { assert isAdmin(msg.caller); paused := true };
  public shared(msg) func unpause() : async () { assert isAdmin(msg.caller); paused := false };

  // ─── Metrics ──────────────────────────────────────────────────────────────────

  public query func metrics() : async Stats {
    let all = Iter.toArray(Map.values(referralOf));
    {
      totalCodes     = codeCounter;
      totalReferrals = all.size();
      totalConverted = Array.filter<Referral>(all, func(r) {
        Option.isSome(r.convertedAt)
      }).size();
    }
  };
}
