/**
 * HomeGentic Quote Canister
 * Quote request / submission system with tier-based rate limiting.
 * Homeowners post requests; contractors submit quotes; homeowner accepts one.
 */

import Array    "mo:core/Array";
import Debug    "mo:core/Debug";
import Blob     "mo:core/Blob";
import Char     "mo:core/Char";
import Map      "mo:core/Map";
import Int      "mo:core/Int";
import Iter     "mo:core/Iter";
import Nat      "mo:core/Nat";
import Nat8     "mo:core/Nat8";
import Nat32    "mo:core/Nat32";
import Option   "mo:core/Option";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Set      "mo:core/Set";
import Text     "mo:core/Text";
import Time     "mo:core/Time";
import ServiceTypes "../shared/ServiceType";
import Notify       "../shared/Notify";
import Index        "../shared/Index";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";

persistent actor Quote {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type ServiceType = ServiceTypes.ServiceType;

  public type UrgencyLevel = {
    #Low;
    #Medium;
    #High;
    #Emergency;
  };

  public type RequestStatus = {
    #Open;
    #Quoted;     // at least one quote submitted
    #Accepted;   // homeowner accepted a quote
    #Closed;     // manually closed by homeowner
    #Cancelled;  // cancelled by homeowner before acceptance; bidders notified
  };

  public type QuoteStatus = {
    #Pending;
    #Accepted;
    #Rejected;
    #Expired;
  };

  public type SubscriptionTier = {
    #Free;             // unsubscribed sentinel — blocked (0)
    #Pro;              // 10
    #ContractorFree;   // unlimited (999_999) — contractors get unlimited quote requests
    #ContractorPro;    // unlimited (999_999)
  };

  public type QuoteRequest = {
    id: Text;
    propertyId: Text;
    homeowner: Principal;
    serviceType: ServiceType;
    description: Text;
    urgency: UrgencyLevel;
    status: RequestStatus;
    createdAt: Time.Time;
    closeAt: ?Time.Time;      // bid-window close time; null = no sealed-bid window
    zipCode: ?Text;           // property zip code; null = visible to all contractors
    minTrustScore:    ?Nat;   // contractor trustScore must be >= this (null = no filter)
    minJobsCompleted: ?Nat;   // contractor jobsCompleted must be >= this
    minReviews:       ?Nat;   // contractor reviewCount must be >= this
    maxBids:          ?Nat;   // cap on total bids accepted (null = unlimited)
  };

  /// A sealed bid submitted by a contractor before the bid window closes.
  /// The amountCents is hidden inside `ciphertext` (IBE-encrypted in production).
  /// In dev/mock: ciphertext is the little-endian Nat8 encoding of amountCents.
  public type SealedBid = {
    id: Text;
    requestId: Text;
    contractor: Principal;
    ciphertext: [Nat8];    // IBE ciphertext; in production: vetKeys IBE output
    timelineDays: Nat;
    submittedAt: Time.Time;
  };

  /// A bid after the homeowner triggers reveal (post closeAt).
  public type RevealedBid = {
    id: Text;
    requestId: Text;
    contractor: Principal;
    amountCents: Nat;
    timelineDays: Nat;
    submittedAt: Time.Time;
    isWinner: Bool;
  };

  public type Quote = {
    id: Text;
    requestId: Text;
    contractor: Principal;
    amount: Nat;        // cents
    timeline: Nat;      // days to complete
    validUntil: Time.Time;
    status: QuoteStatus;
    createdAt: Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  /// Returned by revealBidsEncrypted — homeowner's IBE private key (encrypted to
  /// their transport public key) plus the raw sealed bids.
  /// The frontend uses @dfinity/vetkeys to decrypt each ciphertext locally.
  public type SealedBidReveal = {
    encryptedKey: Blob;   // vetkd_derive_key response, encrypted to transportPublicKey
    bids:         [SealedBid];
  };

  /// Utility usage a homeowner can attach to a quote request. Only the
  /// utilities relevant to the request's service type are accepted (see
  /// relevantUsage), so e.g. a roofer never receives any bill data.
  public type UsageCategory = { #Electric; #Gas; #Water };

  public type UsageMonth = {
    month:       Text;     // YYYY-MM
    amountCents: Nat;      // billed total for the month
    usage:       ?Float;   // metered usage in `unit`, when every bill reported it
  };

  public type UsageSeries = {
    category: UsageCategory;
    unit:     ?Text;       // "kWh" | "therms" | "gallons" …
    months:   [UsageMonth];
  };

  public type UsageSummary = {
    series: [UsageSeries];
    asOf:   Text;          // YYYY-MM-DD
  };

  public type Metrics = {
    totalRequests: Nat;
    openRequests: Nat;
    acceptedRequests: Nat;
    totalQuotes: Nat;
    isPaused: Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  private var adminListEntries: [Principal] = [];
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce: ?Text = null;
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  /// When set, createQuoteRequest() cross-calls getTierForPrincipal(); without it every
  /// caller is treated as #Free (fail closed).
  private var payCanisterId: Text = "";
  /// Property canister ID — set post-deploy via setPropertyCanisterId().
  /// When set, quote creation uses the property owner's tier when the caller
  /// is a delegated manager, so managers don't need their own subscription.
  private var propCanisterId: Text = "";
  /// Contractor canister ID — set post-deploy via setContractorCanisterId().
  /// When set, getOpenRequestsForMe() filters requests by the caller's serviceZips.
  private var contrCanisterId: Text = "";
  /// Fee canister ID — set post-deploy via setFeeCanisterId(). When set, a
  /// contractor without ContractorPro needs a saved card to bid, and each of
  /// their bids and acceptances is recorded for the 3% referral fee.
  private var feeCanisterId: Text = "";

  private var reqCounter: Nat = 0;
  private var quoteCounter: Nat = 0;
  private var sealedBidCounter: Nat = 0;

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let requests               = Map.empty<Text, QuoteRequest>();
  private let quotes                 = Map.empty<Text, Quote>();
  private let contractorRateLimits   = Map.empty<Principal, (Nat, Int)>();
  private let sealedBids             = Map.empty<Text, SealedBid>();
  private let sealedBidsByRequest    = Map.empty<Text, [Text]>();
  private let sealedBidsByContractor = Map.empty<Text, Text>();
  private let revealedBids           = Map.empty<Text, [RevealedBid]>();
  /// requestId → usage the homeowner chose to share with contractors.
  private let usageSummaries         = Map.empty<Text, UsageSummary>();

  // Secondary indexes (transient, rebuilt on every upgrade). Writes to
  // `requests` / `quotes` go through putRequest / putQuote.
  private transient let requestsByHomeowner = Index.empty();
  /// Requests still taking bids (#Open or #Quoted), all under OPEN_KEY.
  private transient let openRequestIdx      = Index.empty();
  private transient let OPEN_KEY            = "open";
  private transient let requestIndexes : [Index.Keyed<QuoteRequest>] = Index.indexed(requests, [
    (requestsByHomeowner, func(r : QuoteRequest) : ?Text { ?r.homeowner.toText() }),
    (openRequestIdx, func(r : QuoteRequest) : ?Text {
      if (r.status == #Open or r.status == #Quoted) ?OPEN_KEY else null
    }),
  ]);
  private transient let quotesByRequest    = Index.empty();
  private transient let quotesByContractor = Index.empty();
  private transient let quoteIndexes : [Index.Keyed<Quote>] = Index.indexed(quotes, [
    (quotesByRequest,    func(q : Quote) : ?Text { ?q.requestId }),
    (quotesByContractor, func(q : Quote) : ?Text { ?q.contractor.toText() }),
  ]);

  private func putRequest(r : QuoteRequest) { Index.put(requests, requestIndexes, r.id, r) };
  private func putQuote(q : Quote)          { Index.put(quotes, quoteIndexes, q.id, q) };

  private func openRequests() : Iter.Iter<QuoteRequest> {
    Index.records(openRequestIdx, OPEN_KEY, requests)
  };

  private func quotesFor(requestId : Text) : Iter.Iter<Quote> {
    Index.records(quotesByRequest, requestId, quotes)
  };

  /// Push-notification outbox read by the notification relay (see
  /// shared/Notify.mo). notifierEntries are the principals allowed to read it.
  private let notifyLog       = Map.empty<Nat, Notify.Event>();
  private var notifyLatestSeq : Nat         = 0;
  private var notifierEntries : [Principal] = [];

  // ─── vetKeys IBE (sealed-bid confidentiality) ─────────────────────────────────
  // Domain separator "hg-bid-v1" — must match the context used by @dfinity/vetkeys
  // on the frontend.  Changing this invalidates all existing ciphertexts.
  private transient let IBE_CONTEXT : Blob = Array.toBlob([
    0x68, 0x67, 0x2D, 0x62, 0x69, 0x64, 0x2D, 0x76, 0x31   // "hg-bid-v1"
  ]);
  // "test_key_1" for local/testnet (~10B cycles per derive call).
  // Switch to "key_1" before mainnet launch (~26B cycles per derive call).
  /// vetKD master key. "test_key_1" is the IC's test key; production deploys set
  /// "key_1" via setVetkdKeyName (scripts/deploy.sh does this for ic). Stored —
  /// not a constant — so it can be changed without reinstalling.
  private var vetkdKeyName : Text = "test_key_1";
  /// H2/V-1: vetkd_derive_key fee. key_1 costs ~26.15B cycles; the old flat 10B
  /// made every mainnet reveal fail. Unused cycles are refunded.
  private transient let VETKD_KEY_CYCLES : Nat  = 26_153_846_153;
  private func vetkdDeriveCycles() : Nat {
    if (vetkdKeyName == "key_1") VETKD_KEY_CYCLES else 10_000_000_000
  };
  /// L1: per-request IBE identity. Contractors encrypt to the UTF-8 bytes of
  /// the requestId (not the homeowner principal), so one reveal key opens one
  /// request's bids only — and bidders never need the homeowner's principal.
  private func bidIdentity(requestId: Text) : Blob { requestId.encodeUtf8() };
  /// M2: an IBE ciphertext of a 4-byte amount is ~150 bytes.
  private transient let MAX_CIPHERTEXT_BYTES : Nat = 1024;

  type VetKdCurve              = { #bls12_381_g2 };
  type VetKdKeyId              = { curve: VetKdCurve; name: Text };
  type VetKdPublicKeyRequest   = { canister_id: ?Principal; context: Blob; key_id: VetKdKeyId };
  type VetKdPublicKeyResponse  = { public_key: Blob };
  type VetKdDeriveKeyRequest   = {
    input:                Blob;
    context:              Blob;
    transport_public_key: Blob;
    key_id:               VetKdKeyId;
  };
  type VetKdDeriveKeyResponse  = { encrypted_key: Blob };

  transient let managementCanister : actor {
    vetkd_public_key : VetKdPublicKeyRequest -> async VetKdPublicKeyResponse;
    vetkd_derive_key : VetKdDeriveKeyRequest -> async VetKdDeriveKeyResponse;
  } = actor "aaaaa-aa";

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private transient let oneDayNs : Int = 24 * 60 * 60 * 1_000_000_000;
  private transient let dailyQuoteLimit : Nat = 20;

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };


  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(caller: Principal) : Bool {
    Admin.contains(adminListEntries, caller)
  };

  private func isNotifier(p: Principal) : Bool {
    Admin.contains(notifierEntries, p)
  };

  private func notify(kind: Text, recipient: ?Principal, refId: Text, summary: Text) {
    notifyLatestSeq := Notify.record(notifyLog, notifyLatestSeq, kind, recipient, refId, summary);
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  type ContractorStats = {
    trustScore:    Nat;
    jobsCompleted: Nat;
    reviewCount:   Nat;
    isVerified:    Bool;
    serviceZips:   [Text];
  };

  /// Registered-contractor stats from the contractor canister (null = not a contractor).
  private func contractorStats(p: Principal) : async ?ContractorStats {
    let contrActor = actor(contrCanisterId) : actor {
      getContractorStats : (Principal) -> async ?ContractorStats;
    };
    await contrActor.getContractorStats(p)
  };

  /// Whether a request is visible to a contractor: service-zip match, then the
  /// homeowner's quality thresholds (verified contractors bypass thresholds).
  private func contractorMatches(r: QuoteRequest, s: ContractorStats) : Bool {
    // Zip filter: if contractor has no serviceZips, they see all zips
    let zipOk : Bool = if (s.serviceZips.size() == 0) { true }
    else {
      switch (r.zipCode) {
        case null    { true };
        case (?zip)  { Option.isSome(s.serviceZips.find(func(z) { z == zip })) };
      }
    };
    if (not zipOk) return false;

    // Verified contractors bypass all quality thresholds
    if (s.isVerified) return true;

    switch (r.minTrustScore) {
      case null {};
      case (?minT) { if (s.trustScore < minT) return false };
    };
    switch (r.minJobsCompleted) {
      case null {};
      case (?minJ) { if (s.jobsCompleted < minJ) return false };
    };
    switch (r.minReviews) {
      case null {};
      case (?minR) { if (s.reviewCount < minR) return false };
    };
    true
  };

  /// Delegate property-ownership check to the property canister.
  /// Falls back to direct principal comparison when propCanisterId is unset (local dev).
  private func checkPropertyAuth(propertyId: Text, owner: Principal, caller: Principal, requireWrite: Bool) : async Bool {
    if (Text.size(propCanisterId) > 0) {
      let propActor = Canisters.property(propCanisterId);
      await propActor.isAuthorized(propertyId, caller, requireWrite)
    } else {
      caller == owner
    }
  };

  /// L8/H1: strangers (contractors browsing leads) don't get the homeowner
  /// principal or propertyId — either resolves to a street address via the
  /// property canister. The homeowner and admins see the full record.
  private func redactFor(r: QuoteRequest, caller: Principal) : QuoteRequest {
    if (caller == r.homeowner or isAdmin(caller)) r
    else { { r with propertyId = ""; homeowner = Principal.anonymous() } }
  };

  /// M1: the caller must own or manage (write access) the property before a
  /// request is created against it. Without the property canister (local dev
  /// only — deploy.sh always wires it) there is nothing to check against.
  private func canCreateFor(propertyId: Text, caller: Principal) : async Bool {
    if (Text.size(propCanisterId) == 0) return true;
    let propActor = Canisters.property(propCanisterId);
    await propActor.isAuthorized(propertyId, caller, true)
  };

  /// M2: only registered contractors the request is visible to (zip + quality
  /// thresholds) may bid. Without the contractor canister (local dev only —
  /// deploy.sh always wires it) the gate can't be evaluated.
  private func canBidOn(r: QuoteRequest, caller: Principal) : async Bool {
    if (caller == r.homeowner) return false;
    if (Text.size(contrCanisterId) == 0) return true;
    switch (await contractorStats(caller)) {
      case null    { false };
      case (?st)   { contractorMatches(r, st) };
    }
  };

  private func nextReqId() : Text {
    reqCounter += 1;
    "REQ_" # reqCounter.toText()
  };

  private func nextQuoteId() : Text {
    quoteCounter += 1;
    "QUOTE_" # quoteCounter.toText()
  };

  private func nextSealedBidId() : Text {
    sealedBidCounter += 1;
    "SB_" # sealedBidCounter.toText()
  };

  /// Decode little-endian Nat8 bytes back to Nat (mock vetKeys IBE decryption).
  /// In production: call vetkd_derive_key to get IBE private key, then decrypt.
  private func mockDecryptBytes(ciphertext: [Nat8]) : Nat {
    var result: Nat = 0;
    var multiplier: Nat = 1;
    for (byte in ciphertext.values()) {
      result      := result + byte.toNat() * multiplier;
      multiplier  := multiplier * 256;
    };
    result
  };

  /// Encode Nat to little-endian Nat8 bytes (mock client-side IBE encryption).
  private func _mockEncryptBytes(amount: Nat) : [Nat8] {
    if (amount == 0) return [0];
    var n = amount;
    var bytes: [Nat8] = [];
    while (n > 0) {
      bytes := bytes.concat([Nat.toNat8(n % 256)]);
      n     := n / 256;
    };
    bytes
  };

  /// Count open requests for a homeowner.
  private func countOpenRequests(homeowner: Principal) : Nat {
    var n = 0;
    for (r in Index.records(requestsByHomeowner, homeowner.toText(), requests)) {
      if (r.status == #Open) { n += 1 };
    };
    n
  };

  /// Max concurrent open requests for a tier. 0 = blocked/unlimited sentinel — see callers.
  /// #Pro is the single homeowner plan ($59/year), with unlimited requests.
  private func tierOpenLimit(tier: SubscriptionTier) : Nat {
    switch tier {
      case (#Free)             { 3       };
      case (#Pro)              { 999_999 };  // effectively unlimited
      case (#ContractorFree)   { 999_999 };  // effectively unlimited for contractors
      case (#ContractorPro)    { 999_999 };  // effectively unlimited
    }
  };


  /// Returns true and bumps the counter if the contractor is under their daily limit.
  /// Resets the window when 24 h have elapsed.
  private func tryConsumeSubmissionSlot(contractor: Principal) : Bool {
    let now = Time.now();
    switch (contractorRateLimits.get(contractor)) {
      case null {
        contractorRateLimits.add(contractor, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneDayNs) {
          // new day — reset window
          contractorRateLimits.add(contractor, (1, now));
          true
        } else if (count >= dailyQuoteLimit) {
          false
        } else {
          contractorRateLimits.add(contractor, (count + 1, windowStart));
          true
        }
      };
    }
  };

  // ─── Core Functions ───────────────────────────────────────────────────────────

  /// Create a quote request for a property.
  /// Open-request quota is enforced against the admin-managed tier — callers
  /// cannot bypass limits by supplying a fake tier.
  public shared(msg) func createQuoteRequest(
    propertyId:       Text,
    serviceType:      ServiceType,
    description:      Text,
    urgency:          UrgencyLevel,
    zipCode:          ?Text,
    minTrustScore:    ?Nat,
    minJobsCompleted: ?Nat,
    minReviews:       ?Nat,
    maxBids:          ?Nat
  ) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)  == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(description) == 0)   return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description) > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (Text.size(propertyId) > 200)   return #err(#InvalidInput("propertyId too long"));
    switch (zipCode) { case (?z) { if (Text.size(z) > 20) return #err(#InvalidInput("zipCode too long")) }; case null {} };

    // M1: caller must own or manage the property — no requests (and no lead
    // notifications) against other people's homes, no borrowing their tier.
    if (not (await canCreateFor(propertyId, msg.caller))) return #err(#NotAuthorized);

    // When payment canister is wired, tier comes from getTierForPrincipal();
    // otherwise falls back to the local admin-grant map.
    // When the caller is a delegated manager (authorisation checked above),
    // use the property owner's tier so managers don't need their own paid
    // subscription.
    let effectivePrincipal : Principal = if (propCanisterId != "") {
      let propActor = Canisters.property(propCanisterId);
      switch (await propActor.getPropertyOwner(propertyId)) {
        case (?owner) { if (owner != msg.caller) { owner } else { msg.caller } };
        case null     { msg.caller };
      }
    } else { msg.caller };
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = Canisters.payment(payCanisterId);
      await payActor.getTierForPrincipal(effectivePrincipal)
    } else {
      #Free  // payment canister not wired: no tier source, fail closed
    };
    let limit = tierOpenLimit(callerTier);
    if (countOpenRequests(msg.caller) >= limit) {
      // Only Free has an upgrade path: Pro is the single $59/year plan.
      let upgradeHint = switch (callerTier) {
        case (#Free) {
          " Upgrade to Pro ($59/year) for unlimited concurrent requests."
        };
        case _ { "" };
      };
      return #err(#InvalidInput(
        "Open request limit reached for your " # (switch callerTier {
          case (#Free) "Free"; case (#Pro) "Pro"; case (#ContractorFree) "ContractorFree";
          case (#ContractorPro) "ContractorPro";
        }) # " plan (" # limit.toText() # " max)." # upgradeHint
      ));
    };

    let id = nextReqId();
    let req: QuoteRequest = {
      id;
      propertyId;
      homeowner = msg.caller;
      serviceType;
      description;
      urgency;
      status           = #Open;
      createdAt        = Time.now();
      closeAt          = null;
      zipCode;
      minTrustScore;
      minJobsCompleted;
      minReviews;
      maxBids;
    };
    putRequest(req);
    // The relay picks the matching contractors (trade, zip, push opt-in).
    notify("new_lead", null, id, ServiceTypes.toText(serviceType));
    #ok(req)
  };

  /// Fetch a single quote request by ID.
  public query(msg) func getQuoteRequest(requestId: Text) : async Result.Result<QuoteRequest, Error> {
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?r) { #ok(redactFor(r, msg.caller)) };
    }
  };

  /// Fetch open/quoted requests filtered by the caller's declared service zips.
  ///
  /// - If the contractor canister is not wired, returns all requests (backward compatible).
  /// - If the caller has no serviceZips configured (empty), returns all requests (opt-in).
  /// - Otherwise returns only requests whose zipCode is in the caller's serviceZips,
  ///   plus requests with no zipCode set (visible to everyone).
  public shared(msg) func getOpenRequestsForMe() : async [QuoteRequest] {
    // L8: rate-limit — this makes an inter-canister call per invocation.
    switch (requireActive(msg.caller)) { case (#err(_)) return []; case _ {} };
    let caller = msg.caller;
    let allOpen = openRequests().map(func(r) { redactFor(r, caller) }).toArray(
      
    );

    if (Text.size(contrCanisterId) == 0) return allOpen;

    let stats = await contractorStats(msg.caller);

    switch (stats) {
      case null {
        // Not registered as a contractor — no zip or quality filtering
        allOpen
      };
      case (?s) {
        allOpen.filter(func(r: QuoteRequest) : Bool { contractorMatches(r, s) })
      };
    }
  };

  /// Fetch all open or quoted requests — unfiltered, visible to any contractor.
  /// Capped at 200 entries; use getOpenRequestsPage for full pagination.
  public query(msg) func getOpenRequests() : async [QuoteRequest] {
    let open = openRequests().map(func(r) { redactFor(r, msg.caller) }).toArray(
      
    );
    if (open.size() <= 200) open
    else Array.tabulate(200, func(i) { open[i] })
  };

  public query(msg) func getOpenRequestsPage(from : Nat, limit : Nat) : async [QuoteRequest] {
    let open = openRequests().map(func(r) { redactFor(r, msg.caller) }).toArray(
      
    );
    let total = open.size();
    if (from >= total) return [];
    let bound = Nat.min(from + Nat.min(limit, 100), total);
    Array.tabulate((bound - from : Nat), func(i) { open[from + i] })
  };

  /// Fetch all requests created by the caller.
  public query(msg) func getMyQuoteRequests() : async [QuoteRequest] {
    Index.records(requestsByHomeowner, msg.caller.toText(), requests).toArray(
      
    )
  };

  /// Fetch all quotes submitted by the caller (contractor bid history).
  public query(msg) func getMyQuotes() : async [Quote] {
    Index.records(quotesByContractor, msg.caller.toText(), quotes).toArray(
      
    )
  };

  /// Whether `caller`'s bid carries the referral fee (the plan at bid time
  /// decides), or why they can't bid yet. No fee while `fee` isn't wired.
  private func referralGate(caller: Principal) : async* Result.Result<Bool, Error> {
    if (feeCanisterId == "") return #ok(false);
    let tier : SubscriptionTier = if (payCanisterId != "") {
      await Canisters.payment(payCanisterId).getTierForPrincipal(caller)
    } else { #ContractorFree };
    if (tier == #ContractorPro) return #ok(false);
    switch (await Canisters.fee(feeCanisterId).referralBidAllowed(caller)) {
      case (#ok)        { #ok(true) };
      case (#needsCard) { #err(#InvalidInput("Save a card for the 3% referral fee before you bid (Settings, Subscription on the HomeGentic website).")) };
      case (#overdue)   { #err(#InvalidInput("A referral fee invoice is more than 30 days overdue. Pay it (Settings, Subscription) to bid again.")) };
    }
  };

  /// Tells `fee` about a bid that carries the referral fee. A failed call is
  /// printed, not returned: the bid is already stored.
  private func recordReferralBid(q: Quote, req: QuoteRequest) : async* () {
    try {
      switch (await Canisters.fee(feeCanisterId).recordReferralBid({
        quoteId = q.id; requestId = req.id; contractor = q.contractor; homeowner = req.homeowner;
        propertyId = req.propertyId; serviceType = ServiceTypes.toText(req.serviceType);
        bidCents = q.amount; bidAt = q.createdAt;
      })) {
        case (#err(_)) { Debug.print("quote: fee.recordReferralBid rejected " # q.id) };
        case (#ok(())) {};
      };
    } catch (_) { Debug.print("quote: fee.recordReferralBid failed " # q.id) };
  };

  /// Submit a quote for an open request.
  /// Subject to 20-submissions-per-day limit per contractor.
  public shared(msg) func submitQuote(
    requestId: Text,
    amount: Nat,
    timeline: Nat,
    validUntil: Time.Time
  ) : async Result.Result<Quote, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    // M2: registered contractor the request is visible to (never the homeowner).
    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?r0) { if (not (await canBidOn(r0, msg.caller))) return #err(#NotAuthorized) };
    };
    let carriesFee = switch (await* referralGate(msg.caller)) {
      case (#err(e)) { return #err(e) };
      case (#ok(b))  { b };
    };

    // Everything below re-reads state after the await (TOCTOU).
    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        if (req.status != #Open and req.status != #Quoted)
          return #err(#InvalidInput(
            if (req.status == #Cancelled) "This request has been cancelled"
            else "Request is not open for quotes"
          ));
        // M2: one live quote per contractor per request.
        if (Option.isSome(quotesFor(requestId).find(func(q: Quote) : Bool {
          q.contractor == msg.caller and q.status == #Pending
        }))) return #err(#InvalidInput("You already have a pending quote on this request"));
        if (amount == 0)    return #err(#InvalidInput("Amount must be greater than 0"));
        if (timeline == 0)  return #err(#InvalidInput("Timeline must be greater than 0"));
        if (validUntil <= Time.now()) return #err(#InvalidInput("validUntil must be in the future"));

        // Enforce maxBids cap
        switch (req.maxBids) {
          case null {};
          case (?cap) {
            var bidCount = 0;
            for (q in quotesFor(requestId)) {
              if (q.status == #Pending) {
                bidCount += 1;
              };
            };
            if (bidCount >= cap) {
              return #err(#InvalidInput(
                "This request has reached its maximum number of bids (" # cap.toText() # ")"
              ));
            };
          };
        };

        if (not tryConsumeSubmissionSlot(msg.caller))
          return #err(#InvalidInput(
            "Daily quote submission limit reached (20/day per contractor). Resets at midnight UTC."
          ));

        let id = nextQuoteId();
        let q: Quote = {
          id;
          requestId;
          contractor = msg.caller;
          amount;
          timeline;
          validUntil;
          status = #Pending;
          createdAt = Time.now();
        };
        putQuote(q);
        notify("quote_received", ?req.homeowner, requestId, ServiceTypes.toText(req.serviceType));

        // Advance request status to #Quoted if still #Open
        if (req.status == #Open) {
          let updated: QuoteRequest = {
            id               = req.id;
            propertyId       = req.propertyId;
            homeowner        = req.homeowner;
            serviceType      = req.serviceType;
            description      = req.description;
            urgency          = req.urgency;
            status           = #Quoted;
            createdAt        = req.createdAt;
            closeAt          = req.closeAt;
            zipCode          = req.zipCode;
            minTrustScore    = req.minTrustScore;
            minJobsCompleted = req.minJobsCompleted;
            minReviews       = req.minReviews;
            maxBids          = req.maxBids;
          };
          putRequest(updated);
        };
        if (carriesFee) await* recordReferralBid(q, req);

        #ok(q)
      };
    }
  };

  /// Fetch all quotes for a given request.
  /// M-05: homeowner and admin see all quotes; contractors see only their own quote.
  public query(msg) func getQuotesForRequest(requestId: Text) : async Result.Result<[Quote], Error> {
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        let allQuotes = quotesFor(requestId).toArray(
          
        );
        if (isAdmin(msg.caller) or req.homeowner == msg.caller) {
          // Admin or homeowner sees all quotes
          #ok(allQuotes)
        } else {
          // Contractor: return only their own quote
          #ok(allQuotes.filter(func(q: Quote) : Bool { q.contractor == msg.caller }))
        }
      };
    }
  };

  /// Accept a quote. Only the request's homeowner may call this.
  /// Accepting one quote rejects all others and closes the request.
  public shared(msg) func acceptQuote(quoteId: Text) : async Result.Result<Quote, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (quotes.get(quoteId)) {
      case null { return #err(#NotFound) };
      case (?q) {
        switch (requests.get(q.requestId)) {
          case null { return #err(#NotFound) };
          case (?req) {
            let acceptOk = await checkPropertyAuth(req.propertyId, req.homeowner, msg.caller, true);
            if (not acceptOk) return #err(#NotAuthorized);

            // Re-read both maps fresh after the await above: a concurrent
            // acceptQuote/closeQuoteRequest/cancelQuoteRequest call could
            // have already mutated this request or quote while this call
            // was suspended waiting on checkPropertyAuth. Validating against
            // the pre-await `req`/`q` snapshot would let two concurrent
            // accepts on the same request both pass.
            switch (requests.get(q.requestId)) {
              case null { return #err(#NotFound) };
              case (?freshReq) {
                switch (quotes.get(quoteId)) {
                  case null { return #err(#NotFound) };
                  case (?freshQ) {
                    if (freshReq.status == #Accepted or freshReq.status == #Closed)
                      return #err(#InvalidInput("Request is already closed"));
                    if (freshReq.status == #Cancelled)
                      return #err(#InvalidInput("Cannot accept a quote on a cancelled request"));
                    if (freshQ.status != #Pending) return #err(#InvalidInput("Quote is no longer pending"));
                    if (freshQ.validUntil <= Time.now()) return #err(#InvalidInput("This quote has expired; ask the contractor for a new one"));

                    // Accept this quote
                    let accepted: Quote = {
                      id         = freshQ.id;
                      requestId  = freshQ.requestId;
                      contractor = freshQ.contractor;
                      amount     = freshQ.amount;
                      timeline   = freshQ.timeline;
                      validUntil = freshQ.validUntil;
                      status     = #Accepted;
                      createdAt  = freshQ.createdAt;
                    };
                    putQuote(accepted);
                    let svcLabel = ServiceTypes.toText(freshReq.serviceType);
                    notify("bid_accepted", ?accepted.contractor, accepted.id, svcLabel);

                    // Reject all other pending quotes for the same request
                    // Snapshot first: the loop writes quotes back.
                    for (other in quotesFor(freshQ.requestId).toArray().values()) {
                      let otherId = other.id;
                      if (otherId != quoteId and other.status == #Pending) {
                        let rejected: Quote = {
                          id         = other.id;
                          requestId  = other.requestId;
                          contractor = other.contractor;
                          amount     = other.amount;
                          timeline   = other.timeline;
                          validUntil = other.validUntil;
                          status     = #Rejected;
                          createdAt  = other.createdAt;
                        };
                        putQuote(rejected);
                        notify("bid_declined", ?rejected.contractor, rejected.id, svcLabel);
                      };
                    };

                    // Close the request
                    let closed: QuoteRequest = {
                      id               = freshReq.id;
                      propertyId       = freshReq.propertyId;
                      homeowner        = freshReq.homeowner;
                      serviceType      = freshReq.serviceType;
                      description      = freshReq.description;
                      urgency          = freshReq.urgency;
                      status           = #Accepted;
                      createdAt        = freshReq.createdAt;
                      closeAt          = freshReq.closeAt;
                      zipCode          = freshReq.zipCode;
                      minTrustScore    = freshReq.minTrustScore;
                      minJobsCompleted = freshReq.minJobsCompleted;
                      minReviews       = freshReq.minReviews;
                      maxBids          = freshReq.maxBids;
                    };
                    putRequest(closed);

                    // Opens the referral fee when the bid carried one.
                    if (feeCanisterId != "") {
                      try {
                        switch (await Canisters.fee(feeCanisterId).recordReferralAccepted(quoteId)) {
                          case (#err(_)) { Debug.print("quote: fee.recordReferralAccepted rejected " # quoteId) };
                          case (#ok(_)) {};
                        };
                      } catch (_) { Debug.print("quote: fee.recordReferralAccepted failed " # quoteId) };
                    };

                    #ok(accepted)
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  /// Manually close an open request. Only the homeowner may do this.
  public shared(msg) func closeQuoteRequest(requestId: Text) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        let closeOk = await checkPropertyAuth(req.propertyId, req.homeowner, msg.caller, true);
        if (not closeOk) return #err(#NotAuthorized);

        // Re-read fresh after the await above — a concurrent call could have
        // already accepted/closed/cancelled this request while this call was
        // suspended waiting on checkPropertyAuth.
        switch (requests.get(requestId)) {
          case null { return #err(#NotFound) };
          case (?freshReq) {
            if (freshReq.status == #Accepted or freshReq.status == #Closed)
              return #err(#InvalidInput("Request is already closed"));
            if (freshReq.status == #Cancelled)
              return #err(#InvalidInput("Request is already cancelled"));

            let updated: QuoteRequest = {
              id               = freshReq.id;
              propertyId       = freshReq.propertyId;
              homeowner        = freshReq.homeowner;
              serviceType      = freshReq.serviceType;
              description      = freshReq.description;
              urgency          = freshReq.urgency;
              status           = #Closed;
              createdAt        = freshReq.createdAt;
              closeAt          = freshReq.closeAt;
              zipCode          = freshReq.zipCode;
              minTrustScore    = freshReq.minTrustScore;
              minJobsCompleted = freshReq.minJobsCompleted;
              minReviews       = freshReq.minReviews;
              maxBids          = freshReq.maxBids;
            };
            putRequest(updated);
            #ok(updated)
          };
        }
      };
    }
  };

  /// Cancel an open or quoted request. Only the homeowner may call this.
  /// Only allowed while status is #Open or #Quoted.
  /// Returns the list of contractor principals who submitted bids so the caller
  /// can dispatch notifications outside the canister.
  public shared(msg) func cancelQuoteRequest(requestId: Text) : async Result.Result<[Principal], Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        let cancelOk = await checkPropertyAuth(req.propertyId, req.homeowner, msg.caller, true);
        if (not cancelOk) return #err(#NotAuthorized);

        // Re-read fresh after the await above — a concurrent call could have
        // already accepted/closed/cancelled this request while this call was
        // suspended waiting on checkPropertyAuth.
        switch (requests.get(requestId)) {
          case null { return #err(#NotFound) };
          case (?freshReq) {
            switch (freshReq.status) {
              case (#Open or #Quoted) {};
              case (#Accepted)  { return #err(#InvalidInput("Cannot cancel an accepted request")) };
              case (#Closed)    { return #err(#InvalidInput("Cannot cancel a closed request")) };
              case (#Cancelled) { return #err(#InvalidInput("Request is already cancelled")) };
            };

            let updated: QuoteRequest = {
              id               = freshReq.id;
              propertyId       = freshReq.propertyId;
              homeowner        = freshReq.homeowner;
              serviceType      = freshReq.serviceType;
              description      = freshReq.description;
              urgency          = freshReq.urgency;
              status           = #Cancelled;
              createdAt        = freshReq.createdAt;
              closeAt          = freshReq.closeAt;
              zipCode          = freshReq.zipCode;
              minTrustScore    = freshReq.minTrustScore;
              minJobsCompleted = freshReq.minJobsCompleted;
              minReviews       = freshReq.minReviews;
              maxBids          = freshReq.maxBids;
            };
            putRequest(updated);

            // Collect principals of contractors who bid on this request
            #ok(quotesFor(requestId).map(func(q : Quote) : Principal { q.contractor }).toArray())
          };
        }
      };
    }
  };

  // ─── Sealed-Bid Functions (2.4) ───────────────────────────────────────────────

  /// Create a quote request with a bid-window close time.
  /// After closeAt the canister will accept reveal requests but reject new bids.
  public shared(msg) func createSealedBidRequest(
    propertyId:       Text,
    serviceType:      ServiceType,
    description:      Text,
    urgency:          UrgencyLevel,
    closeAtNs:        Time.Time,
    zipCode:          ?Text,
    minTrustScore:    ?Nat,
    minJobsCompleted: ?Nat,
    minReviews:       ?Nat,
    maxBids:          ?Nat
  ) : async Result.Result<QuoteRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)  == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(description) == 0)   return #err(#InvalidInput("description cannot be empty"));
    if (Text.size(description) > 5000) return #err(#InvalidInput("description exceeds 5000 characters"));
    if (closeAtNs <= Time.now())        return #err(#InvalidInput("closeAt must be in the future"));
    if (Text.size(propertyId) > 200)   return #err(#InvalidInput("propertyId too long"));
    switch (zipCode) { case (?z) { if (Text.size(z) > 20) return #err(#InvalidInput("zipCode too long")) }; case null {} };

    // M1: caller must own or manage the property.
    if (not (await canCreateFor(propertyId, msg.caller))) return #err(#NotAuthorized);

    let effectivePrincipalSB : Principal = if (propCanisterId != "") {
      let propActor = Canisters.property(propCanisterId);
      switch (await propActor.getPropertyOwner(propertyId)) {
        case (?owner) { if (owner != msg.caller) { owner } else { msg.caller } };
        case null     { msg.caller };
      }
    } else { msg.caller };
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = Canisters.payment(payCanisterId);
      await payActor.getTierForPrincipal(effectivePrincipalSB)
    } else {
      #Free  // payment canister not wired: no tier source, fail closed
    };
    if (callerTier == #Free) return #err(#InvalidInput("Quote requests require an active subscription."));
    let limit = tierOpenLimit(callerTier);
    if (countOpenRequests(msg.caller) >= limit)
      return #err(#InvalidInput("Open request limit reached for your plan"));

    let id  = nextReqId();
    let req: QuoteRequest = {
      id;
      propertyId;
      homeowner        = msg.caller;
      serviceType;
      description;
      urgency;
      status           = #Open;
      createdAt        = Time.now();
      closeAt          = ?closeAtNs;
      zipCode;
      minTrustScore;
      minJobsCompleted;
      minReviews;
      maxBids;
    };
    putRequest(req);
    // The relay picks the matching contractors (trade, zip, push opt-in).
    notify("new_lead", null, id, ServiceTypes.toText(serviceType));
    #ok(req)
  };

  /// Submit a sealed (IBE-encrypted) bid for a request.
  /// Rejects submissions after the bid window closes.
  ///
  /// ciphertext: in production — IBE ciphertext from @dfinity/vetkeys.
  ///             in dev/mock  — little-endian Nat8 encoding of amountCents.
  public shared(msg) func submitSealedBid(
    requestId:    Text,
    ciphertext:   [Nat8],
    timelineDays: Nat
  ) : async Result.Result<SealedBid, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (ciphertext.size() > MAX_CIPHERTEXT_BYTES)
      return #err(#InvalidInput("ciphertext too large"));

    // M2: registered contractor the request is visible to (never the homeowner).
    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?r0) { if (not (await canBidOn(r0, msg.caller))) return #err(#NotAuthorized) };
    };
    // Sealed amounts stay encrypted, so no fee is recorded for them, but the
    // same card and overdue rules apply before a contractor can bid.
    switch (await* referralGate(msg.caller)) { case (#err(e)) return #err(e); case (#ok(_)) {} };

    // Everything below re-reads state after the await (TOCTOU).
    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        if (req.status != #Open and req.status != #Quoted)
          return #err(#InvalidInput("Request is not open for bids"));
        if (ciphertext.size() == 0)
          return #err(#InvalidInput("ciphertext cannot be empty"));
        // M2: one sealed bid per contractor per request.
        let contractorKey = msg.caller.toText() # ":" # requestId;
        if (Option.isSome(sealedBidsByContractor.get(contractorKey)))
          return #err(#InvalidInput("You already have a sealed bid on this request"));
        // M2: maxBids applies to sealed bids too.
        let bidCount = switch (sealedBidsByRequest.get(requestId)) { case null 0; case (?xs) xs.size() };
        switch (req.maxBids) {
          case (?cap) { if (bidCount >= cap) return #err(#InvalidInput("This request has reached its maximum number of bids (" # cap.toText() # ")")) };
          case null {};
        };
        if (timelineDays == 0)
          return #err(#InvalidInput("timelineDays must be greater than 0"));

        // Enforce bid window
        switch (req.closeAt) {
          case (?closeAt) {
            if (Time.now() >= closeAt)
              return #err(#InvalidInput("Bid window has closed"));
          };
          case null {};
        };

        // M2: sealed bids share the 20/day submission cap with quotes.
        if (not tryConsumeSubmissionSlot(msg.caller))
          return #err(#InvalidInput("Daily bid submission limit reached (20/day per contractor)."));

        let id  = nextSealedBidId();
        let bid: SealedBid = {
          id;
          requestId;
          contractor  = msg.caller;
          ciphertext;
          timelineDays;
          submittedAt = Time.now();
        };
        sealedBids.add(id, bid);
        notify("quote_received", ?req.homeowner, requestId, ServiceTypes.toText(req.serviceType));

        // Index by request
        let existing = switch (sealedBidsByRequest.get(requestId)) {
          case null  { [] };
          case (?xs) { xs };
        };
        sealedBidsByRequest.add(requestId, existing.concat([id]));

        // Index by contractor (one bid per contractor per request)
        let key = msg.caller.toText() # ":" # requestId;
        sealedBidsByContractor.add(key, id);

        #ok(bid)
      };
    }
  };

  /// Returns the caller's own sealed bid for a request (ciphertext only).
  /// Returns #NotFound if the caller has not submitted a bid.
  public query(msg) func getMyBid(requestId: Text) : async Result.Result<SealedBid, Error> {
    let key = msg.caller.toText() # ":" # requestId;
    switch (sealedBidsByContractor.get(key)) {
      case null     { #err(#NotFound) };
      case (?bidId) {
        switch (sealedBids.get(bidId)) {
          case null  { #err(#NotFound) };
          case (?b)  { #ok(b) };
        }
      };
    }
  };

  /// Reveal all sealed bids for a request after the bid window closes.
  ///
  /// Only the homeowner of the request may call this.
  /// Decrypts every ciphertext (mock: reads bytes; production: vetkd_derive_key),
  /// marks the lowest price as winner, stores the result, and returns it.
  ///
  /// Idempotent: calling twice returns the same result.
  ///
  /// V-1/H2: this decodes *mock* ciphertexts (little-endian bytes). Real IBE
  /// ciphertexts would decode to garbage and be cached, so it only runs when
  /// the canister is explicitly in local mock mode (vetKD key "dfx_test_key").
  /// Everywhere else use revealBidsEncrypted and decrypt client-side.
  public shared(msg) func revealBids(requestId: Text) : async Result.Result<[RevealedBid], Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (vetkdKeyName != "dfx_test_key")
      return #err(#InvalidInput("Mock reveal is disabled; use revealBidsEncrypted"));

    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        let revealOk = await checkPropertyAuth(req.propertyId, req.homeowner, msg.caller, true);
        if (not revealOk) return #err(#NotAuthorized);

        // Enforce: window must be closed before reveal
        switch (req.closeAt) {
          case (?closeAt) {
            if (Time.now() < closeAt)
              return #err(#InvalidInput("Bid window has not yet closed"));
          };
          case null {
            return #err(#InvalidInput("This request does not use sealed bids"));
          };
        };

        // Return cached reveal if already done
        switch (revealedBids.get(requestId)) {
          case (?cached) { return #ok(cached) };
          case null {};
        };

        // Decrypt all bids and determine winner
        let bidIds = switch (sealedBidsByRequest.get(requestId)) {
          case null  { [] };
          case (?xs) { xs };
        };

        var decoded: [(SealedBid, Nat)] = [];
        for (bidId in bidIds.values()) {
          switch (sealedBids.get(bidId)) {
            case null {};
            case (?b) {
              // In production: call vetkd_derive_key to get IBE private key, then decrypt.
              // Mock: decode little-endian bytes back to Nat.
              let amount = mockDecryptBytes(b.ciphertext);
              decoded := decoded.concat([(b, amount)]);
            };
          };
        };

        if (decoded.size() == 0) return #err(#InvalidInput("No bids to reveal"));

        // Find minimum amount
        var minAmount: Nat = decoded[0].1;
        for ((_, amt) in decoded.values()) {
          if (amt < minAmount) { minAmount := amt };
        };

        let revealed: [RevealedBid] = decoded.map(
          func((b, amt)) {
            {
              id          = b.id;
              requestId   = b.requestId;
              contractor  = b.contractor;
              amountCents = amt;
              timelineDays = b.timelineDays;
              submittedAt = b.submittedAt;
              isWinner    = amt == minAmount;
            }
          }
        );

        revealedBids.add(requestId, revealed);
        #ok(revealed)
      };
    }
  };

  /// Returns already-revealed bids for a request, or an empty array if not yet revealed.
  /// L2: the homeowner and admins see every revealed bid; a bidder sees only
  /// their own; anyone else gets [].
  public query(msg) func getRevealedBids(requestId: Text) : async [RevealedBid] {
    let all = switch (revealedBids.get(requestId)) {
      case null  { return [] };
      case (?rb) { rb };
    };
    let full = isAdmin(msg.caller) or (switch (requests.get(requestId)) {
      case (?r) { r.homeowner == msg.caller };
      case null { false };
    });
    if (full) all else all.filter(func(b) { b.contractor == msg.caller })
  };

  // ─── vetKeys Public Methods ───────────────────────────────────────────────────

  /// Returns the canister's BLS12-381 IBE public key for the sealed-bid context.
  /// Contractors call this before encrypting bid amounts with @dfinity/vetkeys.
  /// vetkd_public_key requires no cycles.
  public func getIbePublicKey() : async Blob {
    let response = await managementCanister.vetkd_public_key({
      canister_id = null;
      context     = IBE_CONTEXT;
      key_id      = { curve = #bls12_381_g2; name = vetkdKeyName };
    });
    response.public_key
  };

  /// Derive the homeowner's IBE private key (encrypted to their transport public key)
  /// and return it together with all sealed bids for a request.
  ///
  /// Only the request's homeowner may call this; the bid window must have closed.
  /// The frontend decrypts `encryptedKey` using the transport secret key → VetKey,
  /// then decrypts each bid's ciphertext with IbeCiphertext.deserialize().decrypt(vetKey).
  ///
  /// Costs VETKD_KEY_CYCLES per call.
  public shared(msg) func revealBidsEncrypted(
    requestId:          Text,
    transportPublicKey: Blob
  ) : async Result.Result<SealedBidReveal, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    // Capture caller before any await — required for vetKeys security.
    let caller = msg.caller;

    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        let authOk = await checkPropertyAuth(req.propertyId, req.homeowner, caller, true);
        if (not authOk) return #err(#NotAuthorized);

        // Bid window must be closed before reveal
        switch (req.closeAt) {
          case (?closeAt) {
            if (Time.now() < closeAt)
              return #err(#InvalidInput("Bid window has not yet closed"));
          };
          case null {
            return #err(#InvalidInput("This request does not use sealed bids"));
          };
        };

        // Derive the homeowner's IBE private key encrypted to their transport key.
        // L1: derive for the request's identity, not the caller's principal —
        // the key opens this request's bids only, and works for a delegated
        // manager as well as the homeowner.
        let deriveResponse = await (with cycles = vetkdDeriveCycles()) managementCanister.vetkd_derive_key({
          input                = bidIdentity(requestId);
          context              = IBE_CONTEXT;
          transport_public_key = transportPublicKey;
          key_id               = { curve = #bls12_381_g2; name = vetkdKeyName };
        });

        // Collect all sealed bids for this request
        let bidIds = switch (sealedBidsByRequest.get(requestId)) {
          case null  { [] };
          case (?xs) { xs };
        };
        var bidList: [SealedBid] = [];
        for (bidId in bidIds.values()) {
          switch (sealedBids.get(bidId)) {
            case null {};
            case (?b) { bidList := bidList.concat([b]) };
          };
        };

        #ok({
          encryptedKey = deriveResponse.encrypted_key;
          bids         = bidList;
        })
      };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the subscription tier for a principal.
  /// Called by an admin when a user's subscription changes.
  /// This is the only authoritative source for tier limits — callers cannot spoof.
  // ─── Usage sharing ───────────────────────────────────────────────────────────

  private transient let MAX_USAGE_MONTHS      : Nat   = 12;
  private transient let MAX_USAGE_MONTH_CENTS : Nat   = 10_000_000;   // $100k/month — anything above is a typo
  private transient let MAX_USAGE_AMOUNT      : Float = 1_000_000_000.0;

  /// Utilities a contractor for this service type has a real use for.
  private func relevantUsage(t: ServiceType) : [UsageCategory] {
    switch t {
      case (#HVAC or #Windows or #Insulation) { [#Electric, #Gas] };   // load sizing, efficiency
      case (#Electrical or #Solar)            { [#Electric] };         // panel/array sizing
      case (#Plumbing or #Landscaping)        { [#Water] };            // leaks, irrigation
      case (#Pool)                            { [#Water, #Electric] }; // fill/leaks, pump
      case (#Roofing or #Painting or #Flooring or #Gutters or #GeneralHandyman or #Pest
            or #Concrete or #Fencing or #Foundation or #Drywall or #KitchenRemodel
            or #BathroomRemodel or #Other) { [] };
    }
  };

  private func validMonth(m: Text) : Bool {
    let cs = m.toArray();
    if (cs.size() != 7 or cs[4] != '-') return false;
    for (i in [0, 1, 2, 3, 5, 6].values()) {
      if (cs[i] < '0' or cs[i] > '9') return false;
    };
    // Digits checked above, so the wrapping ops can't wrap.
    let mm = Nat32.toNat((cs[5].toNat32() -% 48) *% 10 +% (cs[6].toNat32() -% 48));
    mm >= 1 and mm <= 12
  };

  private func validateUsage(r: QuoteRequest, u: UsageSummary) : Result.Result<(), Error> {
    if (Text.size(u.asOf) != 10) return #err(#InvalidInput("asOf must be YYYY-MM-DD"));
    if (u.series.size() == 0) return #err(#InvalidInput("usage summary has no series"));
    let allowed = relevantUsage(r.serviceType);
    for ((s, i) in u.series.values().zip(Nat.range(0, u.series.size()))) {
      if (Option.isNull(allowed.find(func(c) { c == s.category })))
        return #err(#InvalidInput("category not relevant to this service type"));
      for (j in Nat.range(0, i)) {
        if (u.series[j].category == s.category) return #err(#InvalidInput("duplicate category"));
      };
      if (s.months.size() == 0 or s.months.size() > MAX_USAGE_MONTHS)
        return #err(#InvalidInput("each series needs 1–12 months"));
      switch (s.unit) { case (?unit) { if (Text.size(unit) == 0 or Text.size(unit) > 16) return #err(#InvalidInput("invalid unit")) }; case null {} };
      for ((m, k) in s.months.values().zip(Nat.range(0, s.months.size()))) {
        if (not validMonth(m.month)) return #err(#InvalidInput("month must be YYYY-MM"));
        for (l in Nat.range(0, k)) {
          if (s.months[l].month == m.month) return #err(#InvalidInput("duplicate month"));
        };
        if (m.amountCents > MAX_USAGE_MONTH_CENTS) return #err(#InvalidInput("monthly amount out of range"));
        switch (m.usage) {
          // Written so NaN fails too.
          case (?x) { if (not (x >= 0.0 and x <= MAX_USAGE_AMOUNT)) return #err(#InvalidInput("usage out of range")) };
          case null {};
        };
      };
    };
    #ok(())
  };

  /// Attach (or replace) utility usage on the caller's own open request.
  public shared(msg) func attachUsageSummary(requestId: Text, summary: UsageSummary) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?r) {
        if (r.homeowner != msg.caller) return #err(#NotAuthorized);
        if (r.status != #Open and r.status != #Quoted)
          return #err(#InvalidInput("request is no longer open"));
        switch (validateUsage(r, summary)) { case (#err(e)) return #err(e); case _ {} };
        usageSummaries.add(requestId, summary);
        #ok(())
      };
    }
  };

  /// Stop sharing usage on the caller's request.
  public shared(msg) func removeUsageSummary(requestId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?r) {
        if (r.homeowner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        usageSummaries.remove(requestId);
        #ok(())
      };
    }
  };

  /// Usage attached to a request. Readable by the requester, admins, any
  /// contractor who has quoted on it, and — while it's open — registered
  /// contractors the request is visible to (zip + quality thresholds).
  /// Everyone else gets NotAuthorized; no summary is #ok(null).
  public shared(msg) func getUsageSummary(requestId: Text) : async Result.Result<?UsageSummary, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let r = switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?r) r;
    };
    let quoted = Option.isSome(quotesFor(requestId).find(func(q: Quote) : Bool {
      q.contractor == msg.caller
    }));
    if (r.homeowner != msg.caller and not isAdmin(msg.caller) and not quoted) {
      if (r.status != #Open and r.status != #Quoted) return #err(#NotAuthorized);
      if (Text.size(contrCanisterId) == 0) return #err(#NotAuthorized);   // can't verify — fail closed
      switch (await contractorStats(msg.caller)) {
        case null { return #err(#NotAuthorized) };
        case (?st) { if (not contractorMatches(r, st)) return #err(#NotAuthorized) };
      };
    };
    // Re-read after the await: the homeowner may have removed it meanwhile.
    #ok(usageSummaries.get(requestId))
  };

  // ─── Account Deletion ────────────────────────────────────────────────────────

  /// Removes one sealed bid and its by-request / by-contractor index entries.
  private func deleteSealedBid(bidId: Text) {
    switch (sealedBids.get(bidId)) {
      case null {};
      case (?b) {
        sealedBids.remove(bidId);
        sealedBidsByContractor.remove(b.contractor.toText() # ":" # b.requestId);
        switch (sealedBidsByRequest.get(b.requestId)) {
          case null {};
          case (?xs) {
            let rest = xs.filter(func(x) { x != bidId });
            if (rest.size() == 0) sealedBidsByRequest.remove(b.requestId)
            else sealedBidsByRequest.add(b.requestId, rest);
          };
        };
      };
    };
  };

  /// Account deletion: removes everything this canister holds for the caller.
  /// Returns how many records were removed.
  ///
  ///   - Quote requests the caller made as homeowner, with every quote, sealed
  ///     bid, revealed-bid snapshot and usage summary on them.
  ///   - Quotes and sealed bids the caller placed as a contractor, but only on
  ///     requests still taking bids (#Open/#Quoted, sealed-bid window not
  ///     closed, not yet revealed). Bids on accepted/closed/cancelled or
  ///     revealed requests are kept: they are the other homeowner's record of
  ///     who bid what.
  ///   - Push-outbox events addressed to the caller or about deleted records.
  ///
  /// Kept on purpose: the caller's entries in contractorRateLimits /
  /// updateCallLimits (rate-limit windows; deleting them would reset limits).
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    let caller = msg.caller;
    let now = Time.now();
    var removed = 0;
    let deletedRefs = Set.empty<Text>();

    // 1. The caller's own requests and everything on them.
    let myRequestIds = Index.ids(requestsByHomeowner, caller.toText()).toArray();
    for (reqId in myRequestIds.values()) {
      let quoteIds = quotesFor(reqId).map(func(q) { q.id }).toArray();
      for (qid in quoteIds.values()) {
        Index.delete(quotes, quoteIndexes, qid);
        deletedRefs.add(qid);
        removed += 1;
      };
      let bidIds = switch (sealedBidsByRequest.get(reqId)) { case null []; case (?xs) xs };
      for (bidId in bidIds.values()) { deleteSealedBid(bidId); removed += 1 };
      sealedBidsByRequest.remove(reqId);
      revealedBids.remove(reqId);
      usageSummaries.remove(reqId);
      Index.delete(requests, requestIndexes, reqId);
      deletedRefs.add(reqId);
      removed += 1;
    };

    // 2. Bids the caller placed on other homeowners' requests that are still open.
    func stillOpen(reqId: Text) : Bool {
      switch (requests.get(reqId)) {
        case null { false };
        case (?r) { r.status == #Open or r.status == #Quoted };
      }
    };
    let myQuoteIds = Index.records(quotesByContractor, caller.toText(), quotes)
      .filter(func(q) { stillOpen(q.requestId) and q.status == #Pending })
      .map(func(q) { q.id })
      .toArray();
    for (qid in myQuoteIds.values()) {
      switch (quotes.get(qid)) {
        case null {};
        case (?q) {
          Index.delete(quotes, quoteIndexes, qid);
          deletedRefs.add(qid);
          removed += 1;
          // A #Quoted request with no quotes left goes back to #Open.
          switch (requests.get(q.requestId)) {
            case (?r) {
              if (r.status == #Quoted and Option.isNull(quotesFor(r.id).next())) {
                putRequest({ r with status = #Open });
              };
            };
            case null {};
          };
        };
      };
    };
    let mySealedBidIds = sealedBids.values()
      .filter(func(b) {
        b.contractor == caller and stillOpen(b.requestId)
          and Option.isNull(revealedBids.get(b.requestId))
          and (switch (requests.get(b.requestId)) {
                 case (?r) { switch (r.closeAt) { case (?c) now < c; case null true } };
                 case null false;
               })
      })
      .map(func(b) { b.id })
      .toArray();
    for (bidId in mySealedBidIds.values()) { deleteSealedBid(bidId); removed += 1 };

    // 3. Outbox events addressed to the caller or about deleted records.
    let eventSeqs = notifyLog.values()
      .filter(func(e) { e.recipient == ?caller or deletedRefs.contains(e.refId) })
      .map(func(e) { e.seq })
      .toArray();
    for (seq in eventSeqs.values()) { notifyLog.remove(seq) };

    #ok(removed)
  };


  /// Select the vetKD master key ("key_1" in production). Admin only.
  public shared(msg) func setVetkdKeyName(name: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (name != "key_1" and name != "test_key_1" and name != "dfx_test_key")
      return #err(#InvalidInput("unknown vetKD key name"));
    vetkdKeyName := name;
    #ok(())
  };

  public query func getVetkdKeyName() : async Text { vetkdKeyName };

  /// Wire the quote canister to the payment canister for live tier enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := id.toText();
    #ok(())
  };

  /// Wire the quote canister to the contractor canister for service-area filtering.
  /// When set, getOpenRequestsForMe() queries the contractor's serviceZips before filtering.
  public shared(msg) func setContractorCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    contrCanisterId := id.toText();
    #ok(())
  };

  /// Wire the quote canister to the fee canister for the Contractor Free
  /// referral fee. fee.setQuoteCanisterId must name this canister too.
  public shared(msg) func setFeeCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    feeCanisterId := id.toText();
    #ok(())
  };

  /// Wire the quote canister to the property canister for manager tier bypass.
  /// When set, quote creation uses the property owner's tier when the caller
  /// is a delegated manager.  Must be called once after both canisters are deployed.
  public shared(msg) func setPropertyCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id.toText();
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  // ─── Notification outbox ────────────────────────────────────────────────────

  /// Allow a principal (the notification relay's identity) to read the outbox.
  public shared(msg) func addNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    notifierEntries := Admin.add(notifierEntries, p);
    #ok(())
  };

  public shared(msg) func removeNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    notifierEntries := Admin.remove(notifierEntries, p);
    #ok(())
  };

  /// Outbox events with seq > afterSeq, oldest first (at most 200 per call).
  /// Notifiers and admins only.
  public query(msg) func getNotificationEvents(afterSeq: Nat, limit: Nat) : async Result.Result<Notify.Page, Error> {
    if (not isNotifier(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Notify.page(notifyLog, notifyLatestSeq, afterSeq, limit))
  };

  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once the admin list is initialized, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminListEntries.size() > 0, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  /// Add an admin. First call requires the bootstrap nonce (H-20).
  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminListEntries.size() > 0, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    adminListEntries := Admin.add(adminListEntries, newAdmin);
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Admin.remove(adminListEntries, target);
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

  public query func getMetrics() : async Metrics {
    var open     = 0;
    var accepted = 0;
    for (r in requests.values()) {
      switch (r.status) {
        case (#Open or #Quoted) { open     += 1 };
        case (#Accepted)        { accepted += 1 };
        case (#Cancelled or #Closed) {};
      };
    };
    {
      totalRequests   = requests.size();
      openRequests    = open;
      acceptedRequests = accepted;
      totalQuotes     = quotes.size();
      isPaused;
    }
  };
}
