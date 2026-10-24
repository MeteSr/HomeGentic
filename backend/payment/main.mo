import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Debug     "mo:core/Debug";
import Error     "mo:core/Error";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Nat32     "mo:core/Nat32";
import Nat64     "mo:core/Nat64";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";

persistent actor Payment {

  public type Tier = { #Free; #Pro; #ContractorFree; #ContractorPro };

  public type Subscription = {
    owner:       Principal;
    tier:        Tier;
    expiresAt:   Int;
    createdAt:   Int;
    cancelledAt: ?Int;   // set when user requests cancellation; access remains until expiresAt
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

  public type AgentCreditBalance = {
    balance:   Nat;
    expiresAt: Int;  // nanoseconds; 0 = never expires
  };

  public type Metrics = {
    totalSubscriptions : Nat;
    activePaid         : Nat;
    errorsByMethod     : [(Text, Nat)];
  };

  public type SubscriptionStats = {
    total: Nat;
    free: Nat;
    pro: Nat;
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
  private transient let ICP_FEE : Nat = 10_000;

  transient let icpLedger : actor {
    icrc2_transfer_from : shared (TransferFromArgs) -> async { #Ok: Nat; #Err: TransferFromError };
  } = actor "ryjl3-tyaaa-aaaaa-aaaba-cai";

  // ─── Price helpers ───────────────────────────────────────────────────────────

  /// USD price for each tier (whole dollars).
  /// #Pro is the single homeowner plan at $59/year (annual-only; see priceIdFor
  /// and the #Pro-specific duration handling in subscribe/grantSubscription below).
  private func priceUsd(tier: Tier) : Nat {
    switch tier {
      case (#Free)          { 0  };
      case (#Pro)           { 59 };
      case (#ContractorFree){ 0  };
      case (#ContractorPro) { 40 };
    }
  };

  /// Compute e8s price from USD using fresh XRC rate.
  /// priceE8s = usdPrice * 10^(8 + decimals) / rate
  private func computeE8s(usdPrice: Nat, rate: Nat64, decimals: Nat32) : Nat {
    let rateNat    = rate.toNat();
    let decNat     = decimals.toNat();
    let multiplier = Nat.pow(10, 8 + decNat);
    usdPrice * multiplier / rateNat
  };

  // ─── State ───────────────────────────────────────────────────────────────────

  private let subscriptions        = Map.empty<Principal, Subscription>();
  private let agentCreditBalances  = Map.empty<Principal, AgentCreditBalance>();
  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();

  private func countError(method : Text) {
    let prev = errsByMethod.get(method).get(0);
    errsByMethod.add(method, prev + 1);
  };

  // Admin
  private var adminEntries      : [Principal]  = [];
  private var adminInitialized  : Bool         = false;
  /// Kill switch — payment.mo previously had no way to halt outcall-triggering
  /// endpoints if something went wrong (runaway caller, Stripe/XRC incident).
  private var isPaused          : Bool         = false;
  private var pauseExpiryNs     : ?Int         = null;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first initAdmins() call. Consumed on first successful use.
  private var bootstrapNonce    : ?Text        = null;
  private var auditCanisterId   : ?Principal   = null;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };


  private func isAdmin(caller: Principal) : Bool {
    Admin.contains(adminEntries, caller)
  };

  /// F-9: the voice Worker's identity only needs to activate Stripe-paid
  /// subscriptions, grant/consume agent credits and downgrade on cancellation.
  /// Relays may call exactly those functions — not addAdmin, configureStripe,
  /// grantSubscription, pause, etc.
  private var stripeRelayEntries : [Principal] = [];

  private func isStripeRelay(caller: Principal) : Bool {
    Admin.contains(stripeRelayEntries, caller)
  };

  private func isAdminOrRelay(caller: Principal) : Bool {
    isAdmin(caller) or isStripeRelay(caller)
  };

  /// P-2 / H-1: Stripe objects that have already produced a grant, keyed by a
  /// reference such as "cs:<checkout session id>", "credits:<session id>" or
  /// "sub:<subscription id>:<period end>". Value = the principal credited.
  /// Never pruned, so a replayed verify / credit purchase / gift is a no-op.
  private let consumedStripeRefs = Map.empty<Text, Principal>();

  // Stripe
  private var stripeConfig        : ?StripeConfig                  = null;
  private let pendingGifts        = Map.empty<Text, PendingGift>();  // key = giftToken

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits        : Map.Map<Text, (Nat, Int)> = Map.empty();
  // CallerGuard: prevents concurrent subscribe() calls from the same principal
  private transient let activeSubscribers       : Map.Map<Text, Bool>       = Map.empty();
  private var maxUpdatesPerMin        : Nat = 30;
  private var trustedCanisterEntries  : [Principal] = [];

  // ─── Referral conversion ─────────────────────────────────────────────────────
  // Tiers are not pushed anywhere: property, quote, photo and bills read them
  // live via getTierForPrincipal().

  private var referralsCanisterId  : ?Text      = null;

  // Declared as a supertype of what markConverted can return so Candid
  // decoding never traps on an unexpected variant tag.
  type ReferralsMarkConvertedErr = {
    #AlreadyReferred; #SelfReferral; #CodeNotFound; #AlreadyConverted; #Unauthorized; #InvalidInput : Text;
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Admin.contains(trustedCanisterEntries, p)
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isTrustedCanister(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// Combined guard for endpoints that trigger a real HTTP outcall (Stripe, XRC):
  /// rejects anonymous callers, honors the pause kill-switch, and applies the
  /// per-principal update rate limit.
  private func _requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) return #err(#RateLimited);
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

  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.add(trustedCanisterEntries, p);
    try { ignore await auditLog("TrustedCanisterAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func removeTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.remove(trustedCanisterEntries, p);
    #ok(())
  };

  public query func getTrustedCanisters() : async [Principal] {
    trustedCanisterEntries
  };

  // ─── Admin ───────────────────────────────────────────────────────────────────

  /// H-20: Set the one-time bootstrap nonce before calling initAdmins() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  /// One-time admin bootstrap. Requires the pre-shared bootstrap nonce (H-20) —
  /// without it, anyone racing the deploy could call this first and lock out
  /// the real deployer. Fails if already initialized or called by anonymous principal.
  public shared(msg) func initAdmins(newAdmins: [Principal], nonce: Text) : async Result.Result<(), Error> {
    if (adminInitialized)              return #err(#NotAuthorized);
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    if (newAdmins.size() == 0)         return #err(#InvalidInput("admin list cannot be empty"));
    if (not Admin.nonceMatches(bootstrapNonce, nonce)) return #err(#NotAuthorized);
    bootstrapNonce   := null;
    adminEntries     := newAdmins;
    adminInitialized := true;
    #ok(())
  };

  /// Add a new admin principal (existing admin only).
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Admin.add(adminEntries, newAdmin);
    try { ignore await auditLog("AdminAdded", ?newAdmin, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminEntries := Admin.remove(adminEntries, target);
    try { ignore await auditLog("AdminRemoved", ?target, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(())
  };

  public query func isAdminPrincipal(p: Principal) : async Bool {
    isAdmin(p)
  };

  /// F-9: register a principal (the voice Worker) that may only call the
  /// Stripe activation / agent-credit functions. Use this instead of addAdmin.
  public shared(msg) func addStripeRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (p.isAnonymous()) return #err(#InvalidInput("anonymous principal"));
    stripeRelayEntries := Admin.add(stripeRelayEntries, p);
    try { ignore await auditLog("StripeRelayAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func removeStripeRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    stripeRelayEntries := Admin.remove(stripeRelayEntries, p);
    try { ignore await auditLog("StripeRelayRemoved", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(())
  };

  public query(msg) func listStripeRelays() : async [Principal] {
    if (not isAdmin(msg.caller)) return [];
    stripeRelayEntries
  };

  public shared(msg) func setAuditCanisterId(id : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { ignore await auditLog("AuditCanisterSet", ?id, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    auditCanisterId := ?id;
    #ok(())
  };

  private func auditLog(action : Text, subject : ?Principal, detail : Text) : async () {
    await* Canisters.auditLog(auditCanisterId, "payment", action, subject, detail)
  };

  public shared(msg) func setReferralsCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    referralsCanisterId := ?id;
    #ok(())
  };

  /// Notify the referrals canister that a user's first paid subscription is active.
  /// Fire-and-forget: all errors are swallowed so a referrals failure never blocks payment.
  private func notifyReferralConverted(user: Principal) : async () {
    switch (referralsCanisterId) {
      case null {};
      case (?rid) {
        let a : actor {
          markConverted : (Principal) -> async Result.Result<(), ReferralsMarkConvertedErr>
        } = actor(rid);
        try { ignore await a.markConverted(user) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
      };
    };
  };

  // ─── Stripe (moved off-chain) ────────────────────────────────────────────────
  //
  // M-6: canister memory is readable by node operators, so the Stripe secret
  // key no longer lives here. The voice Worker (agents/voice) holds it, makes
  // every Stripe API call, and reports results through the Stripe-relay-only
  // methods stripeActivateSubscription / stripeGrantAgentCredits /
  // stripeRecordGift. The old outcall methods keep their Candid signatures but
  // only return an error.

  private transient let STRIPE_MOVED_MSG : Text =
    "Stripe moved off-chain: use the voice Worker's /api/stripe/* routes";

  /// M-7: a Stripe Checkout Session id is `cs_test_` / `cs_live_` followed by
  /// letters and digits.
  private func isValidCheckoutSessionId(s: Text) : Bool {
    if (s.size() < 9 or s.size() > 255) return false;
    if (not (s.startsWith(#text "cs_test_") or s.startsWith(#text "cs_live_"))) return false;
    var i = 0;
    for (c in s.chars()) {
      if (i >= 8) {
        let ok = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9');
        if (not ok) return false;
      };
      i += 1;
    };
    true
  };

  private func durationNsFor(billing: BillingPeriod) : Int {
    switch billing {
      case (#Monthly) {  30 * 24 * 60 * 60 * 1_000_000_000 };
      case (#Yearly)  { 365 * 24 * 60 * 60 * 1_000_000_000 };
    }
  };

  /// Drop any Stripe key a previous version stored. Idempotent; runs after
  /// every upgrade and on every call that used to touch the config.
  private func clearStripeConfig() { stripeConfig := null };

  system func postupgrade() { clearStripeConfig() };

  // ─── Stripe config (retired) ─────────────────────────────────────────────────

  /// Refuses to store a key (and clears any stored one).
  public shared(msg) func configureStripe(_config: StripeConfig) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    clearStripeConfig();
    #err(#InvalidInput("Stripe keys are no longer stored on-chain; set them as voice Worker secrets"))
  };

  /// The canister never makes Stripe calls itself any more, so this is always
  /// false; payments are configured when the voice Worker has its secrets.
  public query func isStripeConfigured() : async Bool {
    false
  };

  // ─── Stripe checkout (retired) ───────────────────────────────────────────────

  public shared(msg) func createStripeCheckoutSession(
    _tier    : Tier,
    _billing : BillingPeriod,
    _gift    : ?GiftMeta,
  ) : async Result.Result<CheckoutSession, Error> {
    ignore msg;
    clearStripeConfig();
    #err(#PaymentFailed(STRIPE_MOVED_MSG))
  };

  public shared(msg) func verifyStripeSession(_sessionId: Text) : async Result.Result<Subscription, Error> {
    ignore msg;
    clearStripeConfig();
    #err(#PaymentFailed(STRIPE_MOVED_MSG))
  };

  /// Register a paid gift checkout so the recipient can redeem it with
  /// redeemGift(giftToken). Stripe relay (the voice Worker) or admin only:
  /// the Worker has verified with Stripe that `giftToken` (the checkout
  /// session id) is paid and complete. Idempotent: an existing gift is never
  /// overwritten, so a replay can't reset `redeemedBy` (H-1).
  public shared(msg) func stripeRecordGift(
    giftToken : Text,
    tier      : Tier,
    billing   : BillingPeriod,
    meta      : GiftMeta,
  ) : async Result.Result<(), Error> {
    if (not isAdminOrRelay(msg.caller)) return #err(#NotAuthorized);
    if (not isValidCheckoutSessionId(giftToken)) return #err(#InvalidInput("invalid gift token"));
    switch (tier) {
      case (#Pro or #ContractorPro) {};
      case _ { return #err(#InvalidInput("paid tier required")) };
    };
    let tooLong = func(t: Text) : Bool { t.size() > 500 };
    if (tooLong(meta.recipientEmail) or tooLong(meta.recipientName) or tooLong(meta.senderName)
        or tooLong(meta.giftMessage) or tooLong(meta.deliveryDate)) {
      return #err(#InvalidInput("gift field too long"));
    };
    if (Option.isSome(pendingGifts.get(giftToken))) return #ok(());
    pendingGifts.add(giftToken, {
      giftToken;
      tier;
      billing;
      recipientEmail = meta.recipientEmail;
      recipientName  = meta.recipientName;
      senderName     = meta.senderName;
      giftMessage    = meta.giftMessage;
      deliveryDate   = meta.deliveryDate;
      createdAt      = Time.now();
      redeemedBy     = null;
    });
    #ok(())
  };

  /// For an already-consumed Stripe reference: `?#ok(current subscription)`
  /// when it was consumed by `caller` (an idempotent retry, e.g. a reload of
  /// the success page), `?#err(#NotAuthorized)` when another principal used
  /// it, `null` when it hasn't been consumed.
  private func alreadyConsumed(key: Text, caller: Principal) : ?Result.Result<Subscription, Error> {
    switch (consumedStripeRefs.get(key)) {
      case null { null };
      case (?owner) {
        if (owner != caller) return ?#err(#NotAuthorized);
        switch (subscriptions.get(caller)) {
          case (?sub) { ?#ok(sub) };
          case null   { ?#err(#InvalidInput("Session already redeemed")) };
        }
      };
    }
  };

  /// Redeem a pending gift. Any authenticated principal can call this once with
  /// the gift token (= Stripe session ID) they received via email.
  /// Grants the subscription to msg.caller and marks the gift as redeemed.
  public shared(msg) func redeemGift(giftToken: Text) : async Result.Result<Subscription, Error> {
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    switch (pendingGifts.get(giftToken)) {
      case null { #err(#NotFound) };
      case (?gift) {
        if (Option.isSome(gift.redeemedBy)) return #err(#InvalidInput("Gift already redeemed"));
        let now = Time.now();
        let sub : Subscription = {
          owner       = msg.caller;
          tier        = gift.tier;
          expiresAt   = now + durationNsFor(gift.billing);
          createdAt   = now;
          cancelledAt = null;
        };
        subscriptions.add(msg.caller, sub);
        // Mark redeemed BEFORE the first await so concurrent calls see the guard
        // and return #err(#InvalidInput) instead of granting a second subscription.
        pendingGifts.add(giftToken, {
          gift with redeemedBy = ?msg.caller
        });
        #ok(sub)
      };
    }
  };

  /// Admin: list all pending (unredeemed) gifts.
  public query(msg) func listPendingGifts() : async Result.Result<[PendingGift], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let arr = pendingGifts.values().toArray();
    #ok(arr.filter(func(g) { Option.isNull(g.redeemedBy) }))
  };

  // ─── Payment quote ───────────────────────────────────────────────────────────

  /// Returns the subscription price in e8s with a 5% buffer.
  /// Frontend calls this before icrc2_approve so it knows the allowance to set.
  /// Returns 0 for the Free tier (no payment needed).
  public shared(msg) func getPriceQuote(tier: Tier) : async Result.Result<Nat, Error> {
    switch (_requireActive(msg.caller)) { case (#err(e)) return #err(e); case (#ok(())) {} };
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
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    if (not tryConsumeUpdateSlot(msg.caller)) return #err(#RateLimited);

    // CallerGuard: block concurrent subscribe calls from the same principal.
    // Without this, two concurrent calls could both pass the rate-limit check,
    // then both await xrc and both await icrc2_transfer_from — double-charging.
    let callerKey = msg.caller.toText();
    if (Option.isSome(activeSubscribers.get(callerKey))) {
      return #err(#RateLimited);
    };
    activeSubscribers.add(callerKey, true);

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
          activeSubscribers.remove(callerKey);
          return #err(#PaymentFailed("Could not fetch ICP/USD exchange rate"));
        };
        case (#Ok(r)) {
          if (r.rate == 0) {
            activeSubscribers.remove(callerKey);
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
        memo               = ?Array.toBlob([]);
        // created_at_time gives the ledger a 24-hour deduplication window, preventing
        // replay of an approved allowance if the client retries after a timeout.
        created_at_time    = ?Int.abs(Time.now()).toNat64();
      });
      switch (transferResult) {
        case (#Err(e)) {
          let errMsg = switch e {
            case (#InsufficientFunds { balance }) {
              "Insufficient ICP. Need " # Nat.toText(priceE8s + ICP_FEE) #
              " e8s, have " # balance.toText()
            };
            case (#InsufficientAllowance { allowance }) {
              "ICP allowance too low. Have " # allowance.toText() #
              " e8s, need " # Nat.toText(priceE8s + ICP_FEE) # ". Please re-approve."
            };
            case (#BadFee { expected_fee }) {
              "Wrong fee. Expected " # expected_fee.toText() # " e8s"
            };
            case _ { "Payment transfer failed" };
          };
          activeSubscribers.remove(callerKey);
          return #err(#PaymentFailed(errMsg));
        };
        case (#Ok(_)) {};
      };
    };

    let durationNs : Int = switch (tier) {
      case (#Free or #ContractorFree) { 0 };
      case (#Pro)                     { 365 * 24 * 60 * 60 * 1_000_000_000 };  // Pro is annual-only, $59/year
      case (_)                        { 30 * 24 * 60 * 60 * 1_000_000_000 };
    };
    let now = Time.now();
    let sub: Subscription = {
      owner       = msg.caller;
      tier;
      expiresAt   = if (durationNs == 0) 0 else now + durationNs;
      createdAt   = now;
      cancelledAt = null;
    };
    subscriptions.add(msg.caller, sub);
    activeSubscribers.remove(callerKey);  // release lock before cross-canister calls
    if (usdPrice > 0) { await notifyReferralConverted(msg.caller) };
    #ok(sub)
  };

  /// Admin: set a subscription to `tier` for `months` from now.
  /// Stripe relays (the voice Worker) may only use it to downgrade to a free
  /// tier (cancellation / failed payment); paid activations go through
  /// stripeActivateSubscription, which is idempotent per Stripe reference and
  /// takes its expiry from Stripe instead of "now + months".
  public shared(msg) func adminActivateStripeSubscription(
    userPrincipal : Principal,
    tier           : Tier,
    months         : Nat,
  ) : async Result.Result<Subscription, Error> {
    if (not isAdmin(msg.caller)) {
      if (not isStripeRelay(msg.caller)) return #err(#NotAuthorized);
      switch (tier) {
        case (#Free or #ContractorFree) {};
        case _ { return #err(#NotAuthorized) };
      };
    };
    let now = Time.now();
    let durationNs : Int = months.toInt() * 30 * 24 * 60 * 60 * 1_000_000_000;
    let sub : Subscription = {
      owner       = userPrincipal;
      tier;
      expiresAt   = now + durationNs;
      createdAt   = now;
      cancelledAt = null;
    };
    subscriptions.add(userPrincipal, sub);
    await notifyReferralConverted(userPrincipal);
    try { ignore await auditLog("TierActivated", ?userPrincipal, "months=" # months.toText() # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(sub)
  };

  /// P-2 / F-3: activate a Stripe-paid subscription, idempotently.
  /// `stripeRef` identifies the paid Stripe object and period (the Worker uses
  /// "sub:<subscription id>:<current_period_end>"); `expiresAt` is Stripe's
  /// period end in nanoseconds. Replaying the same reference changes nothing,
  /// so re-verifying a subscription can never extend it past what Stripe says.
  /// Admin or Stripe relay only.
  public shared(msg) func stripeActivateSubscription(
    userPrincipal : Principal,
    tier          : Tier,
    expiresAt     : Int,
    stripeRef     : Text,
  ) : async Result.Result<Subscription, Error> {
    if (not isAdminOrRelay(msg.caller)) return #err(#NotAuthorized);
    switch (tier) {
      case (#Pro or #ContractorPro) {};
      case _ { return #err(#InvalidInput("paid tier required")) };
    };
    if (stripeRef.size() == 0 or stripeRef.size() > 200) return #err(#InvalidInput("invalid stripeRef"));
    let now = Time.now();
    let maxAhead : Int = 400 * 24 * 60 * 60 * 1_000_000_000;
    if (expiresAt <= now or expiresAt > now + maxAhead) return #err(#InvalidInput("expiresAt out of range"));

    switch (alreadyConsumed(stripeRef, userPrincipal)) {
      case (?r) { return r };
      case null {};
    };

    let existing = subscriptions.get(userPrincipal);
    let (createdAt, finalExpiry) = switch (existing) {
      // Same paid tier still running (e.g. a gift): don't shorten it.
      case (?e) {
        if (e.tier == tier and e.expiresAt > expiresAt) (e.createdAt, e.expiresAt)
        else if (e.tier == tier) (e.createdAt, expiresAt)
        else (now, expiresAt)
      };
      case null { (now, expiresAt) };
    };
    let sub : Subscription = {
      owner       = userPrincipal;
      tier;
      expiresAt   = finalExpiry;
      createdAt;
      cancelledAt = null;
    };
    // Consume and write before any await.
    consumedStripeRefs.add(stripeRef, userPrincipal);
    subscriptions.add(userPrincipal, sub);
    await notifyReferralConverted(userPrincipal);
    try { ignore await auditLog("TierActivated", ?userPrincipal, "ref=" # stripeRef # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(sub)
  };

  /// Admin helper: grant a subscription without payment.
  /// Use for local development, support tickets, and trials.
  public shared(msg) func grantSubscription(principal: Principal, tier: Tier) : async Result.Result<Subscription, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let durationNs : Int = switch (tier) {
      case (#Free or #ContractorFree) { 0 };
      case (#Pro)                     { 365 * 24 * 60 * 60 * 1_000_000_000 };  // Pro is annual-only, $59/year
      case (_)                        { 30 * 24 * 60 * 60 * 1_000_000_000 };
    };
    let now = Time.now();
    let sub: Subscription = {
      owner       = principal;
      tier;
      expiresAt   = if (durationNs == 0) 0 else now + durationNs;
      createdAt   = now;
      cancelledAt = null;
    };
    subscriptions.add(principal, sub);
    try { ignore await auditLog("TierGranted", ?principal, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[payment] fire-and-forget call failed") };
    #ok(sub)
  };

  public query(msg) func getMySubscription() : async Result.Result<Subscription, Error> {
    switch (subscriptions.get(msg.caller)) {
      case null { #ok({ owner = msg.caller; tier = #Free; expiresAt = 0; createdAt = Time.now(); cancelledAt = null }) };
      case (?s) { #ok(s) };
    }
  };

  /// Mark the caller's subscription as cancelled-at-end-of-period.
  /// Access is retained until expiresAt; the tier is not changed immediately.
  public shared(msg) func cancelSubscription() : async Result.Result<Subscription, Error> {
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    switch (subscriptions.get(msg.caller)) {
      case null { #err(#NotFound) };
      case (?sub) {
        let now = Time.now();
        if (sub.expiresAt > 0 and sub.expiresAt <= now) {
          return #err(#InvalidInput("Subscription has already expired"));
        };
        if (Option.isSome(sub.cancelledAt)) {
          return #err(#InvalidInput("Subscription is already cancelled"));
        };
        let updated : Subscription = {
          owner       = sub.owner;
          tier        = sub.tier;
          expiresAt   = sub.expiresAt;
          createdAt   = sub.createdAt;
          cancelledAt = ?now;
        };
        subscriptions.add(msg.caller, updated);
        #ok(updated)
      };
    }
  };

  // ─── Pricing queries ─────────────────────────────────────────────────────────

  public query func getPricing(tier: Tier) : async PricingInfo {
    switch (tier) {
      case (#Free)           { { tier = #Free;           priceUSD = 0;  periodDays = 0;  propertyLimit = 1;  photosPerJob = 5;  quoteRequestsPerMonth = 3  } };
      case (#Pro)            { { tier = #Pro;            priceUSD = 59; periodDays = 365; propertyLimit = 20; photosPerJob = 30; quoteRequestsPerMonth = 0  } };
      case (#ContractorFree) { { tier = #ContractorFree; priceUSD = 0;  periodDays = 0;   propertyLimit = 0;  photosPerJob = 5;  quoteRequestsPerMonth = 0  } };
      case (#ContractorPro)  { { tier = #ContractorPro;  priceUSD = 40; periodDays = 30;  propertyLimit = 0;  photosPerJob = 50; quoteRequestsPerMonth = 0  } };
    }
  };

  public query func getAllPricing() : async [PricingInfo] {
    [
      { tier = #Pro;            priceUSD = 59; periodDays = 365; propertyLimit = 20; photosPerJob = 30; quoteRequestsPerMonth = 0  },
      { tier = #ContractorFree; priceUSD = 0;  periodDays = 0;   propertyLimit = 0;  photosPerJob = 5;  quoteRequestsPerMonth = 0  },
      { tier = #ContractorPro;  priceUSD = 40; periodDays = 30;  propertyLimit = 0;  photosPerJob = 50; quoteRequestsPerMonth = 0  },
    ]
  };

  // ─── Stats ───────────────────────────────────────────────────────────────────

  public query func getSubscriptionStats() : async SubscriptionStats {
    let now = Time.now();
    var free            = 0;
    var pro             = 0;
    var contractorFree  = 0;
    var contractorPro   = 0;
    var activePaid      = 0;

    for (sub in subscriptions.values()) {
      let isActive = sub.expiresAt == 0 or sub.expiresAt > now;
      switch (sub.tier) {
        case (#Free)           { free           += 1 };
        case (#Pro)            { pro            += 1; if (isActive) { activePaid += 1 } };
        case (#ContractorFree) { contractorFree += 1 };
        case (#ContractorPro)  { contractorPro  += 1; if (isActive) { activePaid += 1 } };
      };
    };

    {
      total           = subscriptions.size();
      free;
      pro;
      contractorFree;
      contractorPro;
      activePaid;
      // Pro is billed yearly, ContractorPro monthly.
      estimatedMrrUsd = pro * priceUsd(#Pro) / 12 + contractorPro * priceUsd(#ContractorPro);
    }
  };

  public query func getMetrics() : async Metrics {
    let now = Time.now();
    var activePaid = 0;
    for (sub in subscriptions.values()) {
      let isActive = sub.expiresAt == 0 or sub.expiresAt > now;
      switch (sub.tier) {
        case (#Free or #ContractorFree) {};
        case _ { if (isActive) { activePaid += 1 } };
      };
    };
    {
      totalSubscriptions = subscriptions.size();
      activePaid;
      errorsByMethod = errsByMethod.entries().toArray();
    }
  };

  /// Inter-canister helper: returns the effective tier for a principal.
  /// Returns #Free if no subscription exists or if the subscription has expired.
  public query func getTierForPrincipal(p: Principal) : async Tier {
    switch (subscriptions.get(p)) {
      case null  { #Free };
      case (?s)  {
        if (s.expiresAt > 0 and s.expiresAt <= Time.now()) { #Free }
        else { s.tier }
      };
    }
  };

  // ─── Agent Credit Top-Ups (#89) ──────────────────────────────────────────────

  /// Returns the caller's remaining agent credit balance.
  /// Returns 0 if no credits exist or all credits have expired.
  public query(msg) func getMyAgentCredits() : async Nat {
    let now = Time.now();
    switch (agentCreditBalances.get(msg.caller)) {
      case null  { 0 };
      case (?b)  {
        if (b.expiresAt > 0 and b.expiresAt <= now) { 0 }
        else { b.balance }
      };
    }
  };

  /// Admin: grant agent credits to a principal after a verified Stripe payment.
  /// If the principal already has an active balance the new amount is added;
  /// expiry is extended to 12 months from now if that is later than the current expiry.
  public shared(msg) func adminGrantAgentCredits(
    user   : Principal,
    amount : Nat,
  ) : async Result.Result<Nat, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (amount == 0)             return #err(#InvalidInput("amount must be > 0"));
    let now          = Time.now();
    let twelveMonths : Int = 365 * 24 * 60 * 60 * 1_000_000_000;
    let newExpiry    = now + twelveMonths;
    let existing     = switch (agentCreditBalances.get(user)) {
      case null  { { balance = 0; expiresAt = 0 } };
      case (?b)  {
        if (b.expiresAt > 0 and b.expiresAt <= now) { { balance = 0; expiresAt = 0 } }
        else { b }
      };
    };
    let updated : AgentCreditBalance = {
      balance   = existing.balance + amount;
      expiresAt = if (existing.expiresAt > newExpiry) existing.expiresAt else newExpiry;
    };
    agentCreditBalances.add(user, updated);
    #ok(updated.balance)
  };

  /// P-2 / F-2: grant a credit pack once per Stripe reference
  /// ("credits:<checkout session id>"). A replay returns
  /// #err(#InvalidInput("already_consumed")) and grants nothing.
  /// Admin or Stripe relay only.
  public shared(msg) func stripeGrantAgentCredits(
    user      : Principal,
    amount    : Nat,
    stripeRef : Text,
  ) : async Result.Result<Nat, Error> {
    if (not isAdminOrRelay(msg.caller)) return #err(#NotAuthorized);
    if (amount == 0 or amount > 1000) return #err(#InvalidInput("amount out of range"));
    if (stripeRef.size() == 0 or stripeRef.size() > 200) return #err(#InvalidInput("invalid stripeRef"));
    if (Option.isSome(consumedStripeRefs.get(stripeRef))) {
      return #err(#InvalidInput("already_consumed"));
    };
    let now          = Time.now();
    let twelveMonths : Int = 365 * 24 * 60 * 60 * 1_000_000_000;
    let newExpiry    = now + twelveMonths;
    let existing     = switch (agentCreditBalances.get(user)) {
      case null  { { balance = 0; expiresAt = 0 } };
      case (?b)  {
        if (b.expiresAt > 0 and b.expiresAt <= now) { { balance = 0; expiresAt = 0 } }
        else { b }
      };
    };
    let updated : AgentCreditBalance = {
      balance   = existing.balance + amount;
      expiresAt = if (existing.expiresAt > newExpiry) existing.expiresAt else newExpiry;
    };
    consumedStripeRefs.add(stripeRef, user);
    agentCreditBalances.add(user, updated);
    #ok(updated.balance)
  };

  /// Admin: atomically decrement 1 agent credit for a user.
  /// Called by the voice server when the tier quota is exhausted but the user has
  /// purchased top-up credits.  Returns the remaining balance after decrement.
  /// Returns #err(#NotFound) when the user has no credits or all credits have expired.
  public shared(msg) func consumeAgentCredit(user: Principal) : async Result.Result<Nat, Error> {
    if (not isAdminOrRelay(msg.caller)) return #err(#NotAuthorized);
    let now = Time.now();
    switch (agentCreditBalances.get(user)) {
      case null  {
        Debug.print("payment.consumeAgentCredit: no credits for " # user.toText());
        countError("consumeAgentCredit");
        #err(#NotFound)
      };
      case (?b)  {
        if (b.expiresAt > 0 and b.expiresAt <= now) {
          Debug.print("payment.consumeAgentCredit: credits expired for " # user.toText());
          countError("consumeAgentCredit");
          return #err(#NotFound)
        };
        if (b.balance == 0) {
          Debug.print("payment.consumeAgentCredit: balance zero for " # user.toText());
          countError("consumeAgentCredit");
          return #err(#NotFound)
        };
        let updated : AgentCreditBalance = { balance = b.balance - 1; expiresAt = b.expiresAt };
        agentCreditBalances.add(user, updated);
        #ok(updated.balance)
      };
    }
  };
}
