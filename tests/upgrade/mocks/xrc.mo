/// Test double for the Exchange Rate Canister, installed at its mainnet id
/// (uf6dk-hyaaa-aaaaq-qaaaq-cai) in PocketIC tests. Answers ICP/USD with the
/// rate set by `setRate`; `setMode("err")` answers #Err, `setMode("trap")`
/// rejects. `callCount` counts answered requests and the cycles attached.
import Cycles "mo:core/Cycles";

persistent actor {
  type AssetClass = { #Cryptocurrency; #FiatCurrency };
  type XrcAsset = { symbol : Text; class_ : AssetClass };
  type XrcRequest = { base_asset : XrcAsset; quote_asset : XrcAsset; timestamp : ?Nat64 };
  type XrcMetadata = {
    decimals : Nat32;
    base_asset_num_queried_sources : Nat32;
    base_asset_num_received_rates : Nat32;
    quote_asset_num_queried_sources : Nat32;
    quote_asset_num_received_rates : Nat32;
    standard_deviation : Nat64;
    forex_timestamp : ?Nat64;
  };
  type XrcRate = { base_asset : XrcAsset; quote_asset : XrcAsset; timestamp : Nat64; rate : Nat64; metadata : XrcMetadata };
  type XrcError = {
    #AnonymousPrincipalNotAllowed;
    #Pending;
    #CryptoBaseAsset : Text;
    #CryptoQuoteAsset : Text;
    #StablecoinRateTooFewRates;
    #StablecoinRateZeroRate;
    #ForexBaseAsset;
    #ForexQuoteAsset;
    #ForexInvalidTimestamp;
    #ForexAssetsNotFound;
    #RateLimited;
    #NotEnoughCycles;
    #Inconsistent;
    #Other : { code : Nat32; description : Text };
  };

  var rate : Nat64 = 1_000_000_000; // $10.00 with 8 decimals
  var decimals : Nat32 = 8;
  var mode : Text = "ok";
  var count : Nat = 0;
  var lastCycles : Nat = 0;

  public func setRate(r : Nat64, d : Nat32) : async () { rate := r; decimals := d };
  public func setMode(m : Text) : async () { mode := m };
  public query func callCount() : async Nat { count };
  public query func lastCyclesAttached() : async Nat { lastCycles };

  public func get_exchange_rate(req : XrcRequest) : async { #Ok : XrcRate; #Err : XrcError } {
    if (mode == "trap") { assert false };
    lastCycles := Cycles.accept<system>(Cycles.available());
    count += 1;
    if (mode == "err") return #Err(#Pending);
    #Ok {
      base_asset = req.base_asset;
      quote_asset = req.quote_asset;
      timestamp = 0;
      rate;
      metadata = {
        decimals;
        base_asset_num_queried_sources = 1;
        base_asset_num_received_rates = 1;
        quote_asset_num_queried_sources = 1;
        quote_asset_num_received_rates = 1;
        standard_deviation = 0;
        forex_timestamp = null;
      };
    }
  };
};
