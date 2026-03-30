import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

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
  private transient var subscriptions = Map.fromIter<Principal, Subscription>(
    subscriptionEntries.vals(), Principal.compare
  );

  system func preupgrade() {
    subscriptionEntries := Iter.toArray(Map.entries(subscriptions));
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
    Map.add(subscriptions, Principal.compare, msg.caller, sub);
    #ok(sub)
  };

  public query(msg) func getMySubscription() : async Result.Result<Subscription, Error> {
    switch (Map.get(subscriptions, Principal.compare, msg.caller)) {
      case null { #ok({ owner = msg.caller; tier = #Free; expiresAt = 0; createdAt = Time.now() }) };
      case (?s) { #ok(s) };
    }
  };

  /// Inter-canister helper: look up the tier for an explicit Principal.
  /// Used by the job canister to enforce per-tier job caps without the
  /// caller identity shifting to the job canister principal.
  public query func getTierForPrincipal(p: Principal) : async Tier {
    switch (Map.get(subscriptions, Principal.compare, p)) {
      case null  { #Free };
      case (?s)  { s.tier };
    }
  };
}
