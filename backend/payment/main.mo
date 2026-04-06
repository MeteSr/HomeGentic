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

  public type Error = { #NotFound; #NotAuthorized; #PaymentFailed: Text; #RateLimited };

  public type SubscriptionStats = {
    total: Nat;       // number of principals with an explicit subscription record
    free: Nat;
    pro: Nat;
    premium: Nat;
    contractorPro: Nat;
    activePaid: Nat;           // paid tiers whose expiresAt > now
    estimatedMrrUsd: Nat;      // pro*10 + premium*49 + contractorPro*49
  };

  // Merged from price canister
  public type PricingInfo = {
    tier:                  Tier;
    priceUSD:              Nat;
    periodDays:            Nat;
    propertyLimit:         Nat;
    photosPerJob:          Nat;
    quoteRequestsPerMonth: Nat;
  };

  /// Migration buffer — cleared after first upgrade with this code.
  private var subscriptionEntries: [(Principal, Subscription)] = [];

  private var subscriptions = Map.empty<Principal, Subscription>();

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  private let MAX_UPDATES_PER_MIN : Nat = 120;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    let key = Principal.toText(caller);
    let now = Time.now();
    switch (Map.get(updateCallLimits, Text.compare, key)) {
      case null { Map.add(updateCallLimits, Text.compare, key, (1, now)); true };
      case (?(count, windowStart)) {
        if (now - windowStart >= ONE_MINUTE_NS) { Map.add(updateCallLimits, Text.compare, key, (1, now)); true }
        else if (count >= MAX_UPDATES_PER_MIN) { false }
        else { Map.add(updateCallLimits, Text.compare, key, (count + 1, windowStart)); true }
      };
    }
  };

  system func postupgrade() {
    for ((k, v) in subscriptionEntries.vals()) {
      Map.add(subscriptions, Principal.compare, k, v);
    };
    subscriptionEntries := [];
  };

  public shared(msg) func subscribe(tier: Tier) : async Result.Result<Subscription, Error> {
    if (not tryConsumeUpdateSlot(msg.caller)) return #err(#RateLimited);
    let durationNs : Int = switch (tier) {
      case (#Free) { 0 };
      case (#Pro) { 30 * 24 * 60 * 60 * 1_000_000_000 };
      case (#Premium) { 30 * 24 * 60 * 60 * 1_000_000_000 };
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

  // ─── Pricing queries (merged from price canister) ────────────────────────────

  public query func getPricing(tier: Tier) : async PricingInfo {
    switch (tier) {
      case (#Free)          { { tier = #Free;          priceUSD = 0;  periodDays = 0;   propertyLimit = 1; photosPerJob = 5;  quoteRequestsPerMonth = 3  } };
      case (#Pro)           { { tier = #Pro;           priceUSD = 10;  periodDays = 30;  propertyLimit = 5; photosPerJob = 20; quoteRequestsPerMonth = 10 } };
      case (#Premium)       { { tier = #Premium;       priceUSD = 49; periodDays = 30;  propertyLimit = 0; photosPerJob = 0;  quoteRequestsPerMonth = 0  } };
      case (#ContractorPro) { { tier = #ContractorPro; priceUSD = 29; periodDays = 30;  propertyLimit = 0; photosPerJob = 50; quoteRequestsPerMonth = 0  } };
    }
  };

  public query func getAllPricing() : async [PricingInfo] {
    [
      { tier = #Free;          priceUSD = 0;  periodDays = 0;   propertyLimit = 1; photosPerJob = 5;  quoteRequestsPerMonth = 3  },
      { tier = #Pro;           priceUSD = 10;  periodDays = 30;  propertyLimit = 5; photosPerJob = 20; quoteRequestsPerMonth = 10 },
      { tier = #Premium;       priceUSD = 49; periodDays = 30;  propertyLimit = 0; photosPerJob = 0;  quoteRequestsPerMonth = 0  },
      { tier = #ContractorPro; priceUSD = 29; periodDays = 30;  propertyLimit = 0; photosPerJob = 50; quoteRequestsPerMonth = 0  },
    ]
  };

  /// Aggregate subscription stats for the admin dashboard.
  public query func getSubscriptionStats() : async SubscriptionStats {
    let now = Time.now();
    var free         = 0;
    var pro          = 0;
    var premium      = 0;
    var contractorPro = 0;
    var activePaid   = 0;

    for (sub in Map.values(subscriptions)) {
      let isActive = sub.expiresAt == 0 or sub.expiresAt > now;
      switch (sub.tier) {
        case (#Free)          { free          += 1 };
        case (#Pro)           { pro           += 1; if (isActive) { activePaid += 1 } };
        case (#Premium)       { premium       += 1; if (isActive) { activePaid += 1 } };
        case (#ContractorPro) { contractorPro += 1; if (isActive) { activePaid += 1 } };
      };
    };

    {
      total           = Map.size(subscriptions);
      free;
      pro;
      premium;
      contractorPro;
      activePaid;
      estimatedMrrUsd = pro * 10 + premium * 49 + contractorPro * 49;
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
