import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Nat32     "mo:core/Nat32";
import Nat64     "mo:core/Nat64";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import OutCall   "mo:caffeineai-http-outcalls/outcall";

persistent actor Payment {

  public type Tier = { #Free; #Pro; #Premium; #ContractorFree; #ContractorPro };

  public type Subscription = {
    owner: Principal;
    tier: Tier;
    expiresAt: Int;
    createdAt: Int;
  };

  public type Error = { #NotFound; #NotAuthorized; #PaymentFailed: Text; #RateLimited; #InvalidInput: Text };

  public type BillingPeriod = { #Monthly; #Yearly };

  public type GiftMeta = {
    recipientEmail : Text;
    recipientName  : Text;
    senderName     : Text;
    giftMessage    : Text;
    deliveryDate   : Text;
  };

  public type StripePriceIds = {
    proMonthly           : Text;
    proYearly            : Text;
    premiumMonthly       : Text;
    premiumYearly        : Text;
    contractorProMonthly : Text;
    contractorProYearly  : Text;
  };

  public type StripeConfig = {
    secretKey  : Text;
    priceIds   : StripePriceIds;
    successUrl : Text;
    cancelUrl  : Text;
  };

  public type CheckoutSession = { id: Text; url: Text };

  public type PendingGift = {
    giftToken      : Text;
    tier           : Tier;
    billing        : BillingPeriod;
    recipientEmail : Text;
    recipientName  : Text;
    senderName     : Text;
    giftMessage    : Text;
    deliveryDate   : Text;
    createdAt      : Int;
    redeemedBy     : ?Principal;
  };

  public type SubscriptionStats = {
    total: Nat;
    free: Nat;
    pro: Nat;
    premium: Nat;
    contractorFree: Nat;
    contractorPro: Nat;
    activePaid: Nat;
    estimatedMrrUsd: Nat;
  };

  public type PricingInfo = {
    tier:                  Tier;
    priceUSD:              Nat;
    periodDays:            Nat;
    propertyLimit:         Nat;
    photosPerJob:          Nat;
    quoteRequestsPerMonth: Nat;
  };

  // ─── XRC (Exchange Rate Canister) ────────────────────────────────────────────
  // class_ serialises to `class` in Candid (trailing underscore escapes keyword).

  type AssetClass = { #Cryptocurrency; #FiatCurrency };

  type XrcAsset = { symbol: Text; class_: AssetClass };

  type XrcRequest = {
    base_asset:  XrcAsset;
    quote_asset: XrcAsset;
    timestamp:   ?Nat64;
  };

  type XrcMetadata = {
    decimals:                        Nat32;
    base_asset_num_queried_sources:  Nat32;
    base_asset_num_received_rates:   Nat32;
    quote_asset_num_queried_sources: Nat32;
    quote_asset_num_received_rates:  Nat32;
    standard_deviation:              Nat64;
    forex_timestamp:                 ?Nat64;
  };

  type XrcRate = {
    base_asset:  XrcAsset;
    quote_asset: XrcAsset;
    timestamp:   Nat64;
    rate:        Nat64;  // rate * 10^metadata.decimals USD per 1 ICP
    metadata:    XrcMetadata;
  };

  type XrcError = {
    #AnonymousPrincipalNotAllowed;
    #Pending;
    #CryptoBaseAsset:          Text;
    #CryptoQuoteAsset:         Text;
    #StablecoinRateTooFewRates;
    #StablecoinRateZeroRate;
    #ForexBaseAsset;
    #ForexQuoteAsset;
    #ForexInvalidTimestamp;
    #ForexAssetsNotFound;
    #RateLimited;
    #NotEnoughCycles;
    #Inconsistent;
    #Other: { code: Nat32; description: Text };
  };

  transient let xrc : actor {
    get_exchange_rate : shared (XrcRequest) -> async { #Ok: XrcRate; #Err: XrcError };
  } = actor "uf6dk-hyaaa-aaaaq-qaaaq-cai";

  // ─── ICP Ledger (ICRC-2) ─────────────────────────────────────────────────────

  type Account = { owner: Principal; subaccount: ?Blob };

  type TransferFromArgs = {
    spender_subaccount: ?Blob;
    from:               Account;
    to:                 Account;
    amount:             Nat;
    fee:                ?Nat;
    memo:               ?Blob;
    created_at_time:    ?Nat64;
  };

  type TransferFromError = {
    #BadFee:             { expected_fee: Nat };
    #BadBurn:            { min_burn_amount: Nat };
    #InsufficientFunds:  { balance: Nat };
    #InsufficientAllowance: { allowance: Nat };
    #TooOld;
    #CreatedInFuture:    { ledger_time: Nat64 };
    #Duplicate:          { duplicate_of: Nat };
    #TemporarilyUnavailable;
    #GenericError:       { error_code: Nat; message: Text };
  };

  /// Transfer fee for the ICP ledger: 0.0001 ICP = 10_000 e8s.
  private let ICP_FEE : Nat = 10_000;

  transient let icpLedger : actor {
    icrc2_transfer_from : shared (TransferFromArgs) -> async { #Ok: Nat; #Err: TransferFromError };
  } = actor "ryjl3-tyaaa-aaaaa-aaaba-cai";

  // ─── IC Management Canister (HTTP outcalls for Stripe) ───────────────────────

  /// Transform function required by caffeineai-http-outcalls for subnet consensus.
  public query func transform(args: OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(args)
  };

  // ─── Price helpers ───────────────────────────────────────────────────────────

  /// USD price for each tier (whole dollars).
  private func priceUsd(tier: Tier) : Nat {
    switch tier {
      case (#Free)          { 0  };
      case (#Pro)           { 10 };
      case (#Premium)       { 20 };
      case (#ContractorFree){ 0  };
      case (#ContractorPro) { 30 };
    }
  };

  /// Compute e8s price from USD using fresh XRC rate.
  /// priceE8s = usdPrice * 10^(8 + decimals) / rate
  private func computeE8s(usdPrice: Nat, rate: Nat64, decimals: Nat32) : Nat {
    let rateNat    = Nat64.toNat(rate);
    let decNat     = Nat32.toNat(decimals);
    let multiplier = Nat.pow(10, 8 + decNat);
    usdPrice * multiplier / rateNat
  };

  // ─── State ───────────────────────────────────────────────────────────────────

  private var subscriptionEntries: [(Principal, Subscription)] = [];
  private var subscriptions = Map.empty<Principal, Subscription>();

  // Admin
  private var adminEntries     : [Principal] = [];
  private var adminInitialized : Bool        = false;

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminEntries, func(a) { a == caller }))
  };

  // Stripe
  private var stripeConfig        : ?StripeConfig                  = null;
  private var pendingGiftEntries  : [(Text, PendingGift)]          = [];
  private var pendingGifts        = Map.empty<Text, PendingGift>();  // key = giftToken

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private transient var updateCallLimits        : Map.Map<Text, (Nat, Int)> = Map.empty();
  // CallerGuard: prevents concurrent subscribe() calls from the same principal
  private transient var activeSubscribers       : Map.Map<Text, Bool>       = Map.empty();
  private var maxUpdatesPerMin        : Nat = 30;
  private let ONE_MINUTE_NS           : Int = 60_000_000_000;
  private var trustedCanisterEntries  : [Principal] = [];

  private func isTrustedCanister(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(trustedCanisterEntries, func(t) { t == p }))
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isTrustedCanister(caller)) return true;
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

  public shared func setUpdateRateLimit(n: Nat) : async () {
    maxUpdatesPerMin := n;
  };

  public shared func addTrustedCanister(p: Principal) : async () {
    if (not isTrustedCanister(p)) {
      trustedCanisterEntries := Array.concat(trustedCanisterEntries, [p]);
    };
  };

  public shared func removeTrustedCanister(p: Principal) : async () {
    trustedCanisterEntries := Array.filter<Principal>(trustedCanisterEntries, func(t) { t != p });
  };

  public query func getTrustedCanisters() : async [Principal] {
    trustedCanisterEntries
  };

  system func postupgrade() {
    for ((k, v) in subscriptionEntries.vals()) {
      Map.add(subscriptions, Principal.compare, k, v);
    };
    subscriptionEntries := [];
    for ((k, v) in pendingGiftEntries.vals()) {
      Map.add(pendingGifts, Text.compare, k, v);
    };
    pendingGiftEntries := [];
  };

  // ─── Admin ───────────────────────────────────────────────────────────────────

  /// One-time admin bootstrap. Fails if already initialized.
  public shared(msg) func initAdmins(newAdmins: [Principal]) : async Result.Result<(), Error> {
    if (adminInitialized) return #err(#NotAuthorized);
    adminEntries     := newAdmins;
    adminInitialized := true;
    #ok(())
  };

  public query func isAdminPrincipal(p: Principal) : async Bool {
    isAdmin(p)
  };

  // ─── Stripe helpers ──────────────────────────────────────────────────────────

  /// Extract a quoted string value for `key` from a flat JSON object.
  /// Works for simple string fields; does not handle nested objects or escaped quotes.
  private func jsonExtract(json: Text, key: Text) : ?Text {
    let needle = "\"" # key # "\":\"";
    let parts  = Text.split(json, #text needle);
    ignore parts.next();
    switch (parts.next()) {
      case null    { null };
      case (?rest) { Text.split(rest, #text "\"").next() };
    }
  };

  /// Escape backslashes then double-quotes for embedding in a JSON string value.
  private func jsonEsc(s: Text) : Text {
    let s1 = Text.replace(s, #text "\\", "\\\\");
    Text.replace(s1, #text "\"", "\\\"")
  };

  /// Percent-encode a string for use as a value in application/x-www-form-urlencoded.
  private func urlEncode(s: Text) : Text {
    var result = "";
    for (c in s.chars()) {
      result #= switch (c) {
        case ' '  { "+" };
        case ':'  { "%3A" };
        case '/'  { "%2F" };
        case '?'  { "%3F" };
        case '='  { "%3D" };
        case '&'  { "%26" };
        case '{'  { "%7B" };
        case '}'  { "%7D" };
        case '@'  { "%40" };
        case '+'  { "%2B" };
        case '#'  { "%23" };
        case _    { Text.fromChar(c) };
      };
    };
    result
  };

  private func priceIdFor(cfg: StripeConfig, tier: Tier, billing: BillingPeriod) : ?Text {
    switch (tier, billing) {
      case (#Pro,           #Monthly) { ?cfg.priceIds.proMonthly };
      case (#Pro,           #Yearly)  { ?cfg.priceIds.proYearly };
      case (#Premium,       #Monthly) { ?cfg.priceIds.premiumMonthly };
      case (#Premium,       #Yearly)  { ?cfg.priceIds.premiumYearly };
      case (#ContractorPro, #Monthly) { ?cfg.priceIds.contractorProMonthly };
      case (#ContractorPro, #Yearly)  { ?cfg.priceIds.contractorProYearly };
      case _                          { null };
    }
  };

  private func tierFromText(t: Text) : ?Tier {
    switch t {
      case "Pro"           { ?#Pro };
      case "Premium"       { ?#Premium };
      case "ContractorPro" { ?#ContractorPro };
      case _               { null };
    }
  };

  private func tierToText(t: Tier) : Text {
    switch t {
      case (#Free)           { "Free" };
      case (#Pro)            { "Pro" };
      case (#Premium)        { "Premium" };
      case (#ContractorFree) { "ContractorFree" };
      case (#ContractorPro)  { "ContractorPro" };
    }
  };

  private func billingToText(b: BillingPeriod) : Text {
    switch b { case (#Monthly) { "Monthly" }; case (#Yearly) { "Yearly" } }
  };

  private func billingFromText(b: Text) : BillingPeriod {
    if (b == "Yearly") { #Yearly } else { #Monthly }
  };

  private func durationNsFor(billing: BillingPeriod) : Int {
    switch billing {
      case (#Monthly) {  30 * 24 * 60 * 60 * 1_000_000_000 };
      case (#Yearly)  { 365 * 24 * 60 * 60 * 1_000_000_000 };
    }
  };

  // ─── Stripe config (admin-only) ───────────────────────────────────────────────

  public shared(msg) func configureStripe(config: StripeConfig) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    stripeConfig := ?config;
    #ok(())
  };

  public query(msg) func isStripeConfigured() : async Bool {
    if (not isAdmin(msg.caller)) return false;
    Option.isSome(stripeConfig)
  };

  // ─── Stripe checkout ─────────────────────────────────────────────────────────

  /// Create a Stripe Checkout Session for a subscription upgrade.
  /// Pass `gift` when the payer (e.g. a realtor) is buying for someone else.
  /// The session URL is returned — redirect the user there immediately.
  public shared(msg) func createStripeCheckoutSession(
    tier    : Tier,
    billing : BillingPeriod,
    gift    : ?GiftMeta,
  ) : async Result.Result<CheckoutSession, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);

    let cfg = switch (stripeConfig) {
      case null  { return #err(#PaymentFailed("Stripe is not configured")) };
      case (?c)  { c };
    };

    let priceId = switch (priceIdFor(cfg, tier, billing)) {
      case null    { return #err(#InvalidInput("No Stripe price configured for " # tierToText(tier) # " " # billingToText(billing))) };
      case (?pid)  { pid };
    };

    let callerText = Principal.toText(msg.caller);
    let isGift     = Option.isSome(gift);

    let successUrl = cfg.successUrl #
      (if (Text.contains(cfg.successUrl, #char '?')) "&" else "?") #
      "session_id={CHECKOUT_SESSION_ID}";

    var body =
      "mode=subscription" #
      "&line_items[0][price]="    # priceId #
      "&line_items[0][quantity]=1" #
      "&success_url="             # urlEncode(successUrl) #
      "&cancel_url="              # urlEncode(cfg.cancelUrl) #
      "&metadata[principal]="     # urlEncode(callerText) #
      "&metadata[tier]="          # urlEncode(tierToText(tier)) #
      "&metadata[billing]="       # urlEncode(billingToText(billing)) #
      "&metadata[is_gift]="       # (if isGift "true" else "false");

    switch (gift) {
      case (?g) {
        body #=
          "&metadata[recipient_email]=" # urlEncode(g.recipientEmail) #
          "&metadata[recipient_name]="  # urlEncode(g.recipientName)  #
          "&metadata[sender_name]="     # urlEncode(g.senderName)     #
          "&metadata[delivery_date]="   # urlEncode(g.deliveryDate)   #
          "&metadata[gift_message]="    # urlEncode(g.giftMessage);
      };
      case null {};
    };

    try {
      let json = await OutCall.httpPostRequest(
        "https://api.stripe.com/v1/checkout/sessions",
        [
          { name = "content-type";  value = "application/x-www-form-urlencoded" },
          { name = "authorization"; value = "Bearer " # cfg.secretKey },
        ],
        body,
        transform,
      );
      let id  = switch (jsonExtract(json, "id"))  { case (?v) v; case null return #err(#PaymentFailed("No session ID in Stripe response: " # json)) };
      let url = switch (jsonExtract(json, "url")) { case (?v) v; case null return #err(#PaymentFailed("No URL in Stripe response: " # json)) };
      #ok({ id; url })
    } catch (_e) {
      #err(#PaymentFailed("Stripe checkout request failed"))
    }
  };

  /// Verify a completed Stripe Checkout Session and activate the subscription.
  /// For self-subscriptions: grants the sub to msg.caller.
  /// For gift sessions: creates a PendingGift redeemable via redeemGift(giftToken).
  /// Returns the new subscription for self-subscriptions, or #err(#NotFound) with
  /// the gift token embedded in the message for gift sessions.
  public shared(msg) func verifyStripeSession(sessionId: Text) : async Result.Result<Subscription, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);

    let cfg = switch (stripeConfig) {
      case null  { return #err(#PaymentFailed("Stripe is not configured")) };
      case (?c)  { c };
    };

    try {
      let json = await OutCall.httpGetRequest(
        "https://api.stripe.com/v1/checkout/sessions/" # sessionId,
        [{ name = "authorization"; value = "Bearer " # cfg.secretKey }],
        transform,
      );

      if (json.contains(#text "\"error\"")) {
        return #err(#PaymentFailed("Stripe error: " # json));
      };

      let payStatus = switch (jsonExtract(json, "payment_status")) {
        case (?s) s;
        case null return #err(#PaymentFailed("Missing payment_status in session"));
      };
      let sessStatus = switch (jsonExtract(json, "status")) {
        case (?s) s;
        case null return #err(#PaymentFailed("Missing status in session"));
      };

      if (payStatus != "paid" or sessStatus != "complete") {
        return #err(#PaymentFailed(
          "Payment not complete — status: " # sessStatus # ", payment_status: " # payStatus
        ));
      };

      let tierText_ = switch (jsonExtract(json, "tier")) {
        case (?t) t;
        case null return #err(#PaymentFailed("Missing tier in session metadata"));
      };
      let tier = switch (tierFromText(tierText_)) {
        case (?t) t;
        case null return #err(#PaymentFailed("Unknown tier: " # tierText_));
      };
      let billing  = billingFromText(Option.get(jsonExtract(json, "billing"), "Monthly"));
      let isGift   = Option.get(jsonExtract(json, "is_gift"), "false") == "true";
      let now = Time.now();

      if (isGift) {
        let gift : PendingGift = {
          giftToken      = sessionId;
          tier;
          billing;
          recipientEmail = Option.get(jsonExtract(json, "recipient_email"), "");
          recipientName  = Option.get(jsonExtract(json, "recipient_name"),  "");
          senderName     = Option.get(jsonExtract(json, "sender_name"),     "");
          giftMessage    = Option.get(jsonExtract(json, "gift_message"),    "");
          deliveryDate   = Option.get(jsonExtract(json, "delivery_date"),   "");
          createdAt      = now;
          redeemedBy     = null;
        };
        Map.add(pendingGifts, Text.compare, sessionId, gift);
        #err(#NotFound) // frontend detects this + sessionId to show gift-sent screen
      } else {
        let sessionPrincipal = Option.get(jsonExtract(json, "principal"), "");
        if (sessionPrincipal != Principal.toText(msg.caller)) {
          return #err(#NotAuthorized);
        };
        let sub : Subscription = {
          owner     = msg.caller;
          tier;
          expiresAt = now + durationNsFor(billing);
          createdAt = now;
        };
        Map.add(subscriptions, Principal.compare, msg.caller, sub);
        #ok(sub)
      }
    } catch (_e) {
      #err(#PaymentFailed("Stripe verification request failed"))
    }
  };

  /// Redeem a pending gift. Any authenticated principal can call this once with
  /// the gift token (= Stripe session ID) they received via email.
  /// Grants the subscription to msg.caller and marks the gift as redeemed.
  public shared(msg) func redeemGift(giftToken: Text) : async Result.Result<Subscription, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(pendingGifts, Text.compare, giftToken)) {
      case null { #err(#NotFound) };
      case (?gift) {
        if (Option.isSome(gift.redeemedBy)) return #err(#InvalidInput("Gift already redeemed"));
        let now = Time.now();
        let sub : Subscription = {
          owner     = msg.caller;
          tier      = gift.tier;
          expiresAt = now + durationNsFor(gift.billing);
          createdAt = now;
        };
        Map.add(subscriptions, Principal.compare, msg.caller, sub);
        let updated : PendingGift = {
          giftToken      = gift.giftToken;
          tier           = gift.tier;
          billing        = gift.billing;
          recipientEmail = gift.recipientEmail;
          recipientName  = gift.recipientName;
          senderName     = gift.senderName;
          giftMessage    = gift.giftMessage;
          deliveryDate   = gift.deliveryDate;
          createdAt      = gift.createdAt;
          redeemedBy     = ?msg.caller;
        };
        Map.add(pendingGifts, Text.compare, giftToken, updated);
        #ok(sub)
      };
    }
  };

  /// Admin: list all pending (unredeemed) gifts.
  public query(msg) func listPendingGifts() : async Result.Result<[PendingGift], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let arr = Array.fromIter(Map.values(pendingGifts));
    #ok(Array.filter<PendingGift>(arr, func(g) { Option.isNull(g.redeemedBy) }))
  };

  // ─── Payment quote ───────────────────────────────────────────────────────────

  /// Returns the subscription price in e8s with a 5% buffer.
  /// Frontend calls this before icrc2_approve so it knows the allowance to set.
  /// Returns 0 for the Free tier (no payment needed).
  public shared func getPriceQuote(tier: Tier) : async Result.Result<Nat, Error> {
    let usdPrice = priceUsd(tier);
    if (usdPrice == 0) return #ok(0);
    let rateResult = await xrc.get_exchange_rate({
      base_asset  = { symbol = "ICP"; class_ = #Cryptocurrency };
      quote_asset = { symbol = "USD"; class_ = #FiatCurrency  };
      timestamp   = null;
    });
    switch (rateResult) {
      case (#Err(_)) { #err(#PaymentFailed("Could not fetch ICP/USD exchange rate")) };
      case (#Ok(r)) {
        if (r.rate == 0) return #err(#PaymentFailed("Invalid exchange rate: zero"));
        let exact      = computeE8s(usdPrice, r.rate, r.metadata.decimals);
        // 5% buffer covers rate fluctuation between approve and subscribe
        let withBuffer = exact * 105 / 100;
        #ok(withBuffer)
      };
    }
  };

  // ─── Subscribe ───────────────────────────────────────────────────────────────

  /// Subscribe to a tier.
  /// For paid tiers: fetches fresh ICP/USD rate and pulls payment via icrc2_transfer_from.
  /// The frontend must call icrc2_approve on the ICP ledger first (use getPriceQuote for amount).
  /// For Free: records the subscription immediately with no payment.
  public shared(msg) func subscribe(tier: Tier) : async Result.Result<Subscription, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (not tryConsumeUpdateSlot(msg.caller)) return #err(#RateLimited);

    // CallerGuard: block concurrent subscribe calls from the same principal.
    // Without this, two concurrent calls could both pass the rate-limit check,
    // then both await xrc and both await icrc2_transfer_from — double-charging.
    let callerKey = Principal.toText(msg.caller);
    if (Option.isSome(Map.get(activeSubscribers, Text.compare, callerKey))) {
      return #err(#RateLimited);
    };
    Map.add(activeSubscribers, Text.compare, callerKey, true);

    let usdPrice = priceUsd(tier);
    if (usdPrice > 0) {
      // Fetch fresh rate at subscription time (separate from quote to get current price)
      let rateResult = await xrc.get_exchange_rate({
        base_asset  = { symbol = "ICP"; class_ = #Cryptocurrency };
        quote_asset = { symbol = "USD"; class_ = #FiatCurrency  };
        timestamp   = null;
      });
      let priceE8s = switch (rateResult) {
        case (#Err(_)) {
          Map.remove(activeSubscribers, Text.compare, callerKey);
          return #err(#PaymentFailed("Could not fetch ICP/USD exchange rate"));
        };
        case (#Ok(r)) {
          if (r.rate == 0) {
            Map.remove(activeSubscribers, Text.compare, callerKey);
            return #err(#PaymentFailed("Invalid exchange rate"));
          };
          computeE8s(usdPrice, r.rate, r.metadata.decimals)
        };
      };

      let transferResult = await icpLedger.icrc2_transfer_from({
        spender_subaccount = null;
        from               = { owner = msg.caller; subaccount = null };
        to                 = { owner = Principal.fromActor(Payment); subaccount = null };
        amount             = priceE8s;
        fee                = ?ICP_FEE;
        memo               = null;
        created_at_time    = null;
      });
      switch (transferResult) {
        case (#Err(e)) {
          let errMsg = switch e {
            case (#InsufficientFunds { balance }) {
              "Insufficient ICP. Need " # Nat.toText(priceE8s + ICP_FEE) #
              " e8s, have " # Nat.toText(balance)
            };
            case (#InsufficientAllowance { allowance }) {
              "ICP allowance too low. Have " # Nat.toText(allowance) #
              " e8s, need " # Nat.toText(priceE8s + ICP_FEE) # ". Please re-approve."
            };
            case (#BadFee { expected_fee }) {
              "Wrong fee. Expected " # Nat.toText(expected_fee) # " e8s"
            };
            case _ { "Payment transfer failed" };
          };
          Map.remove(activeSubscribers, Text.compare, callerKey);
          return #err(#PaymentFailed(errMsg));
        };
        case (#Ok(_)) {};
      };
    };

    let durationNs : Int = switch (tier) {
      case (#Free)           { 0 };
      case (#ContractorFree) { 0 };
      case (_)               { 30 * 24 * 60 * 60 * 1_000_000_000 };
    };
    let now = Time.now();
    let sub: Subscription = {
      owner     = msg.caller;
      tier;
      expiresAt = if (durationNs == 0) 0 else now + durationNs;
      createdAt = now;
    };
    Map.add(subscriptions, Principal.compare, msg.caller, sub);
    Map.remove(activeSubscribers, Text.compare, callerKey);
    #ok(sub)
  };

  /// Called by the Express voice server after Stripe confirms payment.
  /// Admin-guarded: only principals in adminEntries may call this.
  /// months = 1 for monthly, 12 for yearly.
  public shared(msg) func adminActivateStripeSubscription(
    userPrincipal : Principal,
    tier           : Tier,
    months         : Nat,
  ) : async Result.Result<Subscription, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let now = Time.now();
    let durationNs : Int = Int.fromNat(months) * 30 * 24 * 60 * 60 * 1_000_000_000;
    let sub : Subscription = {
      owner     = userPrincipal;
      tier;
      expiresAt = now + durationNs;
      createdAt = now;
    };
    Map.add(subscriptions, Principal.compare, userPrincipal, sub);
    #ok(sub)
  };

  /// Admin helper: grant a subscription without payment.
  /// Use for local development, support tickets, and trials.
  public shared(msg) func grantSubscription(principal: Principal, tier: Tier) : async Result.Result<Subscription, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let durationNs : Int = switch (tier) {
      case (#Free)           { 0 };
      case (#ContractorFree) { 0 };
      case (_)               { 30 * 24 * 60 * 60 * 1_000_000_000 };
    };
    let now = Time.now();
    let sub: Subscription = {
      owner     = principal;
      tier;
      expiresAt = if (durationNs == 0) 0 else now + durationNs;
      createdAt = now;
    };
    Map.add(subscriptions, Principal.compare, principal, sub);
    #ok(sub)
  };

  public query(msg) func getMySubscription() : async Result.Result<Subscription, Error> {
    switch (Map.get(subscriptions, Principal.compare, msg.caller)) {
      case null { #ok({ owner = msg.caller; tier = #Free; expiresAt = 0; createdAt = Time.now() }) };
      case (?s) { #ok(s) };
    }
  };

  // ─── Pricing queries ─────────────────────────────────────────────────────────

  public query func getPricing(tier: Tier) : async PricingInfo {
    switch (tier) {
      case (#Free)           { { tier = #Free;           priceUSD = 0;  periodDays = 0;  propertyLimit = 1;  photosPerJob = 2;  quoteRequestsPerMonth = 3  } };
      case (#Pro)            { { tier = #Pro;            priceUSD = 10; periodDays = 30; propertyLimit = 5;  photosPerJob = 10; quoteRequestsPerMonth = 10 } };
      case (#Premium)        { { tier = #Premium;        priceUSD = 20; periodDays = 30; propertyLimit = 20; photosPerJob = 30; quoteRequestsPerMonth = 0  } };
      case (#ContractorFree) { { tier = #ContractorFree; priceUSD = 0;  periodDays = 0;  propertyLimit = 0;  photosPerJob = 5;  quoteRequestsPerMonth = 0  } };
      case (#ContractorPro)  { { tier = #ContractorPro;  priceUSD = 30; periodDays = 30; propertyLimit = 0;  photosPerJob = 50; quoteRequestsPerMonth = 0  } };
    }
  };

  public query func getAllPricing() : async [PricingInfo] {
    [
      { tier = #Free;           priceUSD = 0;  periodDays = 0;  propertyLimit = 1;  photosPerJob = 2;  quoteRequestsPerMonth = 3  },
      { tier = #Pro;            priceUSD = 10; periodDays = 30; propertyLimit = 5;  photosPerJob = 10; quoteRequestsPerMonth = 10 },
      { tier = #Premium;        priceUSD = 20; periodDays = 30; propertyLimit = 20; photosPerJob = 30; quoteRequestsPerMonth = 0  },
      { tier = #ContractorFree; priceUSD = 0;  periodDays = 0;  propertyLimit = 0;  photosPerJob = 5;  quoteRequestsPerMonth = 0  },
      { tier = #ContractorPro;  priceUSD = 30; periodDays = 30; propertyLimit = 0;  photosPerJob = 50; quoteRequestsPerMonth = 0  },
    ]
  };

  // ─── Stats ───────────────────────────────────────────────────────────────────

  public query func getSubscriptionStats() : async SubscriptionStats {
    let now = Time.now();
    var free            = 0;
    var pro             = 0;
    var premium         = 0;
    var contractorFree  = 0;
    var contractorPro   = 0;
    var activePaid      = 0;

    for (sub in Map.values(subscriptions)) {
      let isActive = sub.expiresAt == 0 or sub.expiresAt > now;
      switch (sub.tier) {
        case (#Free)           { free           += 1 };
        case (#Pro)            { pro            += 1; if (isActive) { activePaid += 1 } };
        case (#Premium)        { premium        += 1; if (isActive) { activePaid += 1 } };
        case (#ContractorFree) { contractorFree += 1 };
        case (#ContractorPro)  { contractorPro  += 1; if (isActive) { activePaid += 1 } };
      };
    };

    {
      total           = Map.size(subscriptions);
      free;
      pro;
      premium;
      contractorFree;
      contractorPro;
      activePaid;
      estimatedMrrUsd = pro * 10 + premium * 20 + contractorPro * 30;
    }
  };

  /// Inter-canister helper: returns the effective tier for a principal.
  /// Returns #Free if no subscription exists or if the subscription has expired.
  public query func getTierForPrincipal(p: Principal) : async Tier {
    switch (Map.get(subscriptions, Principal.compare, p)) {
      case null  { #Free };
      case (?s)  {
        if (s.expiresAt > 0 and s.expiresAt <= Time.now()) { #Free }
        else { s.tier }
      };
    }
  };
}
