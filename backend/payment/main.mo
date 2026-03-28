import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";

persistent actor Payment {

  public type Tier = { #Free; #Pro; #Premium; #ContractorPro };

  public type Subscription = {
    owner: Principal;
    tier: Tier;
    expiresAt: Int;
    createdAt: Int;
  };

  public type Error = { #NotFound; #NotAuthorized; #PaymentFailed: Text };

  private var subscriptionEntries: [(Principal, Subscription)] = [];
  private transient var subscriptions = HashMap.fromIter<Principal, Subscription>(
    subscriptionEntries.vals(), 16, Principal.equal, Principal.hash
  );

  system func preupgrade() {
    subscriptionEntries := Iter.toArray(subscriptions.entries());
  };

  system func postupgrade() {
    subscriptionEntries := [];
  };

  public shared(msg) func subscribe(tier: Tier) : async Result.Result<Subscription, Error> {
    let durationNs : Int = switch (tier) {
      case (#Free) { 0 };
      case (#Pro) { 30 * 24 * 60 * 60 * 1_000_000_000 };
      case (#Premium) { 365 * 24 * 60 * 60 * 1_000_000_000 };
      case (#ContractorPro) { 30 * 24 * 60 * 60 * 1_000_000_000 };
    };
    let now = Time.now();
    let sub: Subscription = {
      owner = msg.caller;
      tier;
      expiresAt = if (durationNs == 0) 0 else now + durationNs;
      createdAt = now;
    };
    subscriptions.put(msg.caller, sub);
    #ok(sub)
  };

  public query(msg) func getMySubscription() : async Result.Result<Subscription, Error> {
    switch (subscriptions.get(msg.caller)) {
      case null { #ok({ owner = msg.caller; tier = #Free; expiresAt = 0; createdAt = Time.now() }) };
      case (?s) { #ok(s) };
    }
  };

  /// Inter-canister helper: look up the tier for an explicit Principal.
  /// Used by the job canister to enforce per-tier job caps without the
  /// caller identity shifting to the job canister principal.
  public query func getTierForPrincipal(p: Principal) : async Tier {
    switch (subscriptions.get(p)) {
      case null  { #Free };
      case (?s)  { s.tier };
    }
  };
}
