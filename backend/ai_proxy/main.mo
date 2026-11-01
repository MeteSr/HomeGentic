/**
 * HomeGentic AI Proxy Canister
 *
 * Replaces deterministic endpoints from agents/voice/server.ts.
 * The 6 Claude AI endpoints (chat, agent, maintenance/chat, classify, pulse,
 * negotiate) remain in the Node.js relay — IC HTTP outcalls require subnet
 * consensus across ~13 nodes, which is incompatible with non-deterministic
 * LLM responses.
 *
 * This canister handles:
 *   Pure computation : getPriceBenchmark, instantForecast
 *   Retired          : importPermits, lookupPropertyDetails and the email
 *                      methods moved to the voice Worker (agents/voice), which
 *                      holds the ATTOM / OpenPermit / Resend keys off-chain.
 *   Stubs            : checkReport, lookupYearBuilt, requestReport
 *   Standard ops     : health, pause, metrics, rate limiting, admin
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Char      "mo:core/Char";
import Nat8      "mo:core/Nat8";
import Nat32     "mo:core/Nat32";
import List      "mo:core/List";
import Int       "mo:core/Int";
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
import Inspect "../shared/Inspect";

persistent actor AiProxy {

  // ── Types ──────────────────────────────────────────────────────────────────

  public type Error = {
    #NotAuthorized;
    #NotFound;
    #InvalidInput : Text;
    #RateLimited;
    #Paused;
    #HttpError : Text;
    #KeyNotConfigured;
  };

  public type HttpHeader   = { name : Text; value : Text };
  public type HttpMethod   = { #get; #post; #head };
  public type HttpResponse = { status : Nat; headers : [HttpHeader]; body : Blob };
  public type TransformArgs = {
    response : HttpResponse;
    context  : Blob;
  };

  public type Metrics = {
    emailSentTotal : Nat;
    permitsFetched : Nat;
    adminCount     : Nat;
    isPaused       : Bool;
    errorsByMethod : [(Text, Nat)];
  };

  // ── Stable state ───────────────────────────────────────────────────────────

  private var adminListEntries       : [Principal] = [];
  private var adminInitialized       : Bool        = false;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce         : ?Text       = null;
  private var trustedCanisterEntries : [Principal] = [];
  private var isPaused               : Bool        = false;
  private var pauseExpiryNs          : ?Int        = null;

  // M-6: retired. Third-party API keys now live only in the voice Worker
  // (wrangler secrets). Kept (always "") so the stable signature is unchanged.
  private var resendApiKey           : Text = "";
  private var openPermitApiKey       : Text = "";
  private var attomApiKey            : Text = "";

  private transient let MOVED_MSG : Text =
    "moved off-chain: call the voice Worker";
  private transient let KEYS_MOVED_MSG : Text =
    "API keys are no longer stored on-chain; set them as voice Worker secrets";

  /// Wipe any key a previous version stored. Idempotent; runs after every
  /// upgrade and on every call that used to read a key.
  private func clearApiKeys() {
    resendApiKey     := "";
    openPermitApiKey := "";
    attomApiKey      := "";
  };

  system func postupgrade() { clearApiKeys() };
  private var resendFromAddress      : Text = "HomeGentic <noreply@homegentic.app>";

  // Email usage counters
  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();


  private var emailSentDaily         : Nat = 0;
  private var emailSentMonthly       : Nat = 0;
  private var emailSentTotal         : Nat = 0;
  private var emailDayWindowStart    : Int = 0;
  private var emailMonthWindowStart  : Int = 0;
  private var permitsFetched         : Nat = 0;
  private var attomLookupCount       : Nat = 0;
  /// M11: global per-day budgets for user-triggered outcalls (admin-adjustable).
  private var attomDailyBudget       : Nat = 300;
  private var permitDailyBudget      : Nat = 1_000;
  private var outcallDayWindowStart  : Int = 0;
  private var attomCallsToday        : Nat = 0;
  private var permitCallsToday       : Nat = 0;

  // Rate limiting
  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  private var maxUpdatesPerMin : Nat = 30;


  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    Inspect.accept(caller, arg, Inspect.MAX_ARG_BYTES)
  };
  // ── Rate limiting helpers ──────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Admin.contains(adminListEntries, p)
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Admin.contains(trustedCanisterEntries, p)
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller) or isTrustedCanister(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    isPaused := false;  // a timed pause that has lapsed is cleared
    if (not tryConsumeUpdateSlot(caller)) return #err(#RateLimited);
    #ok(())
  };

  // ── HTTP outcall transform (strips non-deterministic headers) ──────────────

  public query func transformResponse(args: TransformArgs) : async HttpResponse {
    { status = args.response.status; headers = []; body = args.response.body }
  };

  // ── Price benchmark seed data ──────────────────────────────────────────────
  // Fixed typical U.S. ranges (cents). They are not local and not bids: the
  // frontend labels them as national and prefers quote.getLocalPriceStats
  // once an area has enough accepted quotes.

  type BenchmarkSeed = { low: Nat; median: Nat; high: Nat };

  private transient let PRICE_SEEDS : [(Text, BenchmarkSeed)] = [
    ("Roofing",     { low = 800000;  median = 1400000; high = 2200000 }),
    ("HVAC",        { low = 350000;  median = 650000;  high = 1200000 }),
    ("Plumbing",    { low = 15000;   median = 45000;   high = 180000 }),
    ("Electrical",  { low = 20000;   median = 55000;   high = 250000 }),
    ("Flooring",    { low = 200000;  median = 450000;  high = 900000 }),
    ("Painting",    { low = 60000;   median = 150000;  high = 400000 }),
    ("Landscaping", { low = 30000;   median = 90000;   high = 350000 }),
    ("Windows",     { low = 45000;   median = 120000;  high = 350000 }),
    ("Foundation",  { low = 400000;  median = 900000;  high = 2500000 }),
    ("Other",       { low = 10000;   median = 40000;   high = 200000 }),
  ];

  // ── Instant forecast data (mirrors agents/voice/forecast.ts) ──────────────

  type SystemSpec = { name: Text; lifespanYears: Nat; costLowCents: Nat; costHighCents: Nat };

  private transient let SYSTEMS : [SystemSpec] = [
    { name = "HVAC";         lifespanYears = 18; costLowCents =   800_000; costHighCents = 1_500_000 },
    { name = "Roofing";      lifespanYears = 25; costLowCents = 1_500_000; costHighCents = 3_500_000 },
    { name = "Water Heater"; lifespanYears = 12; costLowCents =   120_000; costHighCents =   350_000 },
    { name = "Windows";      lifespanYears = 22; costLowCents =   800_000; costHighCents = 2_400_000 },
    { name = "Electrical";   lifespanYears = 35; costLowCents =   200_000; costHighCents =   600_000 },
    { name = "Plumbing";     lifespanYears = 50; costLowCents =   400_000; costHighCents = 1_500_000 },
    { name = "Flooring";     lifespanYears = 25; costLowCents =   300_000; costHighCents = 2_000_000 },
    { name = "Insulation";   lifespanYears = 30; costLowCents =   150_000; costHighCents =   500_000 },
    { name = "Solar Panels"; lifespanYears = 25; costLowCents = 1_500_000; costHighCents = 3_500_000 },
  ];

  // Climate zone multipliers (numerator/1000 to avoid floats)
  // Value meaning: effectiveLifespan = floor(base * mult / 1000)
  type ClimateEntry = { sys: Text; multNumerator: Nat }; // denominator is 1000

  private transient let CLIMATE_ZONES : [(Text, [ClimateEntry])] = [
    ("hotHumid", [
      { sys ="HVAC";         multNumerator = 850 },
      { sys ="Roofing";      multNumerator = 880 },
      { sys ="Water Heater"; multNumerator = 900 },
      { sys ="Windows";      multNumerator = 900 },
      { sys ="Insulation";   multNumerator = 850 },
    ]),
    ("hotDry", [
      { sys ="HVAC";         multNumerator = 900 },
      { sys ="Roofing";      multNumerator = 920 },
      { sys ="Windows";      multNumerator = 900 },
      { sys ="Plumbing";     multNumerator = 900 },
    ]),
    ("cold", [
      { sys ="Roofing";      multNumerator = 880 },
      { sys ="Plumbing";     multNumerator = 880 },
      { sys ="HVAC";         multNumerator = 880 },
      { sys ="Windows";      multNumerator = 880 },
      { sys ="Insulation";   multNumerator = 900 },
    ]),
    ("veryCold", [
      { sys ="Roofing";      multNumerator = 820 },
      { sys ="Plumbing";     multNumerator = 830 },
      { sys ="HVAC";         multNumerator = 830 },
      { sys ="Windows";      multNumerator = 830 },
      { sys ="Insulation";   multNumerator = 850 },
    ]),
  ];

  // State abbreviation → climate zone key
  private transient let STATE_ZONES : [(Text, Text)] = [
    ("FL","hotHumid"),("LA","hotHumid"),("MS","hotHumid"),("AL","hotHumid"),
    ("GA","hotHumid"),("SC","hotHumid"),("HI","hotHumid"),
    ("AZ","hotDry"),("NM","hotDry"),("NV","hotDry"),("UT","hotDry"),
    ("MN","veryCold"),("ND","veryCold"),("SD","veryCold"),("WI","veryCold"),
    ("AK","veryCold"),("ME","veryCold"),("VT","veryCold"),("NH","veryCold"),
    ("MI","cold"),("WY","cold"),("MT","cold"),("ID","cold"),("CO","cold"),
    ("IA","cold"),("NE","cold"),("KS","cold"),("MO","cold"),("IL","cold"),
    ("IN","cold"),("OH","cold"),("PA","cold"),("NY","cold"),("MA","cold"),
    ("RI","cold"),("CT","cold"),("NJ","cold"),("WV","cold"),
  ];

  private func climateZoneFor(state: Text) : Text {
    // STATE_ZONES keys are uppercase — callers pass uppercase state codes
    switch (STATE_ZONES.find(func(pair) { pair.0 == state })) {
      case (?(_, zone)) { zone };
      case null         { "mixed" };
    }
  };

  private func climateMultiplierFor(zone: Text, systemName: Text) : Nat {
    switch (CLIMATE_ZONES.find(func(z) { z.0 == zone })) {
      case null { 1000 };
      case (?(_, entries)) {
        switch (entries.find(func(e) { e.sys == systemName })) {
          case null      { 1000 };
          case (?entry)  { entry.multNumerator };
        }
      };
    }
  };

  private func urgencyFor(pctUsed: Int) : Text {
    if (pctUsed >= 100) "Critical"
    else if (pctUsed >= 75)  "Soon"
    else if (pctUsed >= 50)  "Watch"
    else "Good"
  };

  private func urgencyRank(u: Text) : Nat {
    if (u == "Critical") 0
    else if (u == "Soon") 1
    else if (u == "Watch") 2
    else 3
  };

  private func hexDigit(n : Nat8) : Text {
    let digits = "0123456789ABCDEF";
    var i : Nat8 = 0;
    for (c in digits.chars()) { if (i == n) return c.toText(); i += 1 };
    "0"
  };

  // ── JSON building helpers ──────────────────────────────────────────────────

  /// L3: JSON string escaping (quote, backslash, control characters).
  private func jsonEscape(v : Text) : Text {
    var out = "";
    for (c in v.chars()) {
      let n = c.toNat32();
      if (c == '\"') { out #= "\\\"" }
      else if (c == '\\') { out #= "\\\\" }
      else if (c == '\n') { out #= "\\n" }
      else if (c == '\r') { out #= "\\r" }
      else if (c == '\t') { out #= "\\t" }
      else if (n < 0x20 or n == 0x2028 or n == 0x2029) {
        let b = Nat32.toNat(n % 256).toNat8();
        out #= "\\u" # (if (n >= 0x2000) (if (n == 0x2028) "2028" else "2029") else "00" # hexDigit(b / 16) # hexDigit(b % 16));
      }
      else { out #= c.toText() };
    };
    out
  };

  private func jsonStr(k: Text, v: Text) : Text    { "\"" # k # "\":\"" # jsonEscape(v) # "\"" };
  private func jsonNat(k: Text, v: Nat) : Text      { "\"" # k # "\":" # v.toText() };
  private func jsonBool(k: Text, v: Bool) : Text    { "\"" # k # "\":" # (if v "true" else "false") };
  private func jsonNull(k: Text) : Text             { "\"" # k # "\":null" };

  // ── Public: pure functions ─────────────────────────────────────────────────

  public query func getPriceBenchmark(
    service : Text,
    zip     : Text,
  ) : async Result.Result<Text, Text> {
    switch (PRICE_SEEDS.find(func(s) { s.0 == service })) {
      case null        { #err("No benchmark data for service: " # service) };
      case (?(_, seed)) {
        let json = "{" #
          jsonStr("serviceType", service) # "," #
          jsonStr("zipCode", zip) # "," #
          jsonNat("low", seed.low) # "," #
          jsonNat("median", seed.median) # "," #
          jsonNat("high", seed.high) # "," #
          jsonStr("source", "national") #
        "}";
        #ok(json)
      };
    }
  };

  public query func instantForecast(
    address  : Text,
    yearBuilt: Nat,
    state    : ?Text,
    _overrides: Text, // JSON overrides — parsed by frontend; canister uses yearBuilt
  ) : async Result.Result<Text, Text> {
    let nowNs = Time.now();
    let currentYear = 1970 + Int.abs(nowNs) / 31_557_600_000_000_000;

    if (yearBuilt < 1800 or yearBuilt > currentYear) {
      return #err("yearBuilt must be between 1800 and " # currentYear.toText());
    };

    let stateStr  = state.get("");
    let zoneKey   = if (Text.size(stateStr) > 0) climateZoneFor(stateStr) else "mixed";

    // Build system estimates
    var systemsJson = "";
    var tenYearBudget = 0;
    var first = true;

    // Sort by urgency rank — collect first, then sort
    type SE = { name: Text; install: Nat; age: Nat; lifespan: Nat; pct: Int; remaining: Int; urgency: Text; low: Nat; high: Nat };
    let estimatesBuf = List.empty<SE>();

    for (sys in SYSTEMS.values()) {
      let mult        = climateMultiplierFor(zoneKey, sys.name);
      let lifespan    = sys.lifespanYears * mult / 1000;
      let ageInt : Int = (currentYear : Int) - (yearBuilt : Int);
      let age    : Nat = if (ageInt > 0) Int.abs(ageInt) else 0;
      let pctUsed     = if (lifespan > 0) Int.abs(age) * 100 / lifespan else 100;
      let remaining   = (lifespan : Int) - (age : Int);
      let urgency     = urgencyFor(pctUsed);
      let costLow     = sys.costLowCents / 100;
      let costHigh    = sys.costHighCents / 100;

      if (remaining <= 10) {
        tenYearBudget += costLow;
      };

      estimatesBuf.add({
        name     = sys.name;
        install  = yearBuilt;
        age      = age;
        lifespan = lifespan;
        pct      = pctUsed;
        remaining= remaining;
        urgency  = urgency;
        low      = costLow;
        high     = costHigh;
      });
    };

    // Sort by urgency rank
    let estimates = estimatesBuf.toArray().sort(func(a, b) {
      Nat.compare(urgencyRank(a.urgency), urgencyRank(b.urgency))
    });

    for (e in estimates.values()) {
      let pctNat  = if (e.pct >= 0) Int.abs(e.pct) else 0;
      let remText = if (e.remaining < 0) "-" # Int.abs(e.remaining).toText()
                    else Int.abs(e.remaining).toText();
      let entry = "{" #
        jsonStr("systemName", e.name) # "," #
        jsonNat("installYear", e.install) # "," #
        jsonNat("ageYears", e.age) # "," #
        jsonNat("lifespanYears", e.lifespan) # "," #
        jsonNat("percentLifeUsed", pctNat) # "," #
        "\"yearsRemaining\":" # remText # "," #
        jsonStr("urgency", e.urgency) # "," #
        jsonNat("replacementCostLow", e.low) # "," #
        jsonNat("replacementCostHigh", e.high) #
      "}";

      if (not first) { systemsJson #= "," };
      systemsJson #= entry;
      first := false;
    };

    let nowMs = Int.abs(nowNs) / 1_000_000;
    let json = "{" #
      jsonStr("address", address) # "," #
      jsonNat("yearBuilt", yearBuilt) # "," #
      (if (Text.size(stateStr) > 0) jsonStr("state", stateStr) # "," else jsonNull("state") # ",") #
      "\"systems\":[" # systemsJson # "]," #
      jsonNat("tenYearBudget", tenYearBudget) # "," #
      "\"generatedAt\":" # nowMs.toText() #
    "}";
    #ok(json)
  };

  // ── Public: stubs ──────────────────────────────────────────────────────────

  public query func checkReport(address: Text) : async Text {
    "{" # jsonBool("found", false) # "," # jsonStr("address", address) # "}"
  };

  public query func lookupYearBuilt(address: Text) : async Text {
    "{" # jsonStr("address", address) # "," # jsonNull("yearBuilt") # "}"
  };

  /// M11 / M-6: ATTOM lookups moved to the voice Worker (POST
  /// /api/property/details), which holds the API key off-chain and enforces
  /// per-user and global daily quotas. Kept for Candid compatibility.
  public shared(msg) func lookupPropertyDetails(
    _address : Text,
    _city    : Text,
    _state   : Text,
    _zip     : Text,
  ) : async Result.Result<Text, Error> {
    ignore msg;
    clearApiKeys();
    #err(#HttpError(MOVED_MSG # " (POST /api/property/details)"))
  };

  public shared(msg) func requestReport(
    address    : Text,
    _buyerEmail : Text,
  ) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    // Stub: acknowledge without storing
    ignore address;
    #ok(())
  };

  // ── Public: email usage ────────────────────────────────────────────────────

  public query func emailUsage() : async Text {
    "{" #
      jsonNat("dailySent", emailSentDaily) # "," #
      jsonNat("monthlySent", emailSentMonthly) # "," #
      jsonNat("totalSent", emailSentTotal) #
    "}"
  };

  // ── Public: health ─────────────────────────────────────────────────────────

  public query func health() : async Text {
    "{" # jsonBool("ok", true) # "}"
  };

  // ── Public: import permits (IC HTTP outcall) ───────────────────────────────

  /// M11 / M-6: permit imports (ArcGIS / OpenPermit) moved to the voice
  /// Worker (POST /api/permits/import). Kept for Candid compatibility.
  public shared(msg) func importPermits(
    _address : Text,
    _city    : Text,
    _state   : Text,
    _zip     : Text,
  ) : async Result.Result<Text, Error> {
    ignore msg;
    clearApiKeys();
    #err(#HttpError(MOVED_MSG # " (POST /api/permits/import)"))
  };

  // ── Email (moved off-chain) ────────────────────────────────────────────────
  // Transactional email is sent by the voice Worker, which holds the Resend
  // key; no canister calls these. Kept for Candid compatibility.

  public shared(msg) func sendEmail(
    _to      : Text,
    _subject : Text,
    _html    : Text,
    _text    : ?Text,
    _replyTo : ?Text,
    _from    : ?Text,
  ) : async Result.Result<Text, Error> {
    ignore msg;
    clearApiKeys();
    #err(#HttpError(MOVED_MSG # " (/api/email/*)"))
  };

  public shared(msg) func sendInviteEmail(
    _to              : Text,
    _contractorName  : ?Text,
    _propertyAddress : Text,
    _serviceType     : Text,
    _amount          : ?Nat,
    _verifyUrl       : Text,
  ) : async Result.Result<Text, Error> {
    ignore msg;
    clearApiKeys();
    #err(#HttpError(MOVED_MSG # " (POST /api/email/contractor-invite)"))
  };

  public shared(msg) func sendJobMatchEmail(
    _contractorEmail : Text,
    _jobId           : Text,
    _serviceType     : Text,
    _zipCode         : Text,
  ) : async Result.Result<Text, Error> {
    ignore msg;
    clearApiKeys();
    #err(#HttpError(MOVED_MSG))
  };

  // ── Admin functions ────────────────────────────────────────────────────────

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminInitialized, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    adminListEntries := Admin.add(adminListEntries, newAdmin);
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Admin.remove(adminListEntries, target);
    #ok(())
  };

  /// M-6: third-party API keys are no longer stored on-chain (node operators
  /// can read canister memory). These setters refuse and wipe any stored key;
  /// set the keys as voice Worker secrets instead.
  public shared(msg) func setResendApiKey(_key: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    clearApiKeys();
    #err(#InvalidInput(KEYS_MOVED_MSG))
  };

  public shared(msg) func setOpenPermitApiKey(_key: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    clearApiKeys();
    #err(#InvalidInput(KEYS_MOVED_MSG))
  };

  public shared(msg) func setAttomApiKey(_key: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    clearApiKeys();
    #err(#InvalidInput(KEYS_MOVED_MSG))
  };

  public shared(msg) func setResendFromAddress(addr: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    resendFromAddress := addr;
    #ok(())
  };

  public query(msg) func getKeyStatus() : async { resendKeySet: Bool; openPermitKeySet: Bool; attomKeySet: Bool } {
    ignore msg;
    {
      resendKeySet     = Text.size(resendApiKey) > 0;
      openPermitKeySet = Text.size(openPermitApiKey) > 0;
      attomKeySet      = Text.size(attomApiKey) > 0;
    }
  };

  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.add(trustedCanisterEntries, p);
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

  /// M11: set the global per-day budgets for ATTOM lookups and permit imports. Admin only.
  public shared(msg) func setOutcallBudgets(attomPerDay: Nat, permitsPerDay: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    attomDailyBudget  := attomPerDay;
    permitDailyBudget := permitsPerDay;
    #ok(())
  };

  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
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
    isPaused      := false;
    pauseExpiryNs := null;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    {
      emailSentTotal = emailSentTotal;
      permitsFetched = permitsFetched;
      adminCount     = adminListEntries.size();
      isPaused       = isPaused;
      errorsByMethod = errsByMethod.entries().toArray();
    }
  };
}
