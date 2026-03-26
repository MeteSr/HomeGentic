persistent actor Price {

  public type Tier = { #Free; #Pro; #Premium; #ContractorPro };

  public type PricingInfo = {
    tier: Tier;
    priceUSD: Nat;
    periodDays: Nat;
    propertyLimit: Nat;
    photosPerJob: Nat;
    quoteRequestsPerMonth: Nat;
  };

  public query func getPricing(tier: Tier) : async PricingInfo {
    switch (tier) {
      case (#Free) { { tier = #Free; priceUSD = 0; periodDays = 0; propertyLimit = 1; photosPerJob = 5; quoteRequestsPerMonth = 3 } };
      case (#Pro) { { tier = #Pro; priceUSD = 9; periodDays = 30; propertyLimit = 5; photosPerJob = 20; quoteRequestsPerMonth = 10 } };
      case (#Premium) { { tier = #Premium; priceUSD = 49; periodDays = 365; propertyLimit = 0; photosPerJob = 0; quoteRequestsPerMonth = 0 } };
      case (#ContractorPro) { { tier = #ContractorPro; priceUSD = 29; periodDays = 30; propertyLimit = 0; photosPerJob = 50; quoteRequestsPerMonth = 0 } };
    }
  };

  public query func getAllPricing() : async [PricingInfo] {
    [
      { tier = #Free; priceUSD = 0; periodDays = 0; propertyLimit = 1; photosPerJob = 5; quoteRequestsPerMonth = 3 },
      { tier = #Pro; priceUSD = 9; periodDays = 30; propertyLimit = 5; photosPerJob = 20; quoteRequestsPerMonth = 10 },
      { tier = #Premium; priceUSD = 49; periodDays = 365; propertyLimit = 0; photosPerJob = 0; quoteRequestsPerMonth = 0 },
      { tier = #ContractorPro; priceUSD = 29; periodDays = 30; propertyLimit = 0; photosPerJob = 50; quoteRequestsPerMonth = 0 },
    ]
  };
}
