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
 *   IC HTTP outcalls : importPermits (ArcGIS / OpenPermit), sendEmail (Resend)
 *   Stubs            : checkReport, lookupYearBuilt, requestReport
 *   Standard ops     : health, pause, metrics, rate limiting, admin
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Nat64     "mo:core/Nat64";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor AiProxy {

  // ── Types ──────────────────────────────────────────────────────────────────

  public type Error = {
    #Unauthorized;
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
  };

  // ── IC Management Canister (HTTP outcalls) ─────────────────────────────────

  let ic : actor {
    http_request : shared ({
      url               : Text;
      max_response_bytes : ?Nat64;
      headers           : [HttpHeader];
      body              : ?Blob;
      method            : HttpMethod;
      transform         : ?{
        function : shared query (TransformArgs) -> async HttpResponse;
        context  : Blob;
      };
    }) -> async HttpResponse;
  } = actor "aaaaa-aa";

  // ── Stable state ───────────────────────────────────────────────────────────

  private var adminListEntries       : [Principal] = [];
  private var adminInitialized       : Bool        = false;
  private var trustedCanisterEntries : [Principal] = [];
  private var isPaused               : Bool        = false;
  private var pauseExpiryNs          : ?Int        = null;

  // API keys (set by admin post-deploy; never exposed via query)
  private var resendApiKey           : Text = "";
  private var openPermitApiKey       : Text = "";
  private var resendFromAddress      : Text = "HomeGentic <noreply@homegentic.app>";

  // Email usage counters
  private var emailSentDaily         : Nat = 0;
  private var emailSentMonthly       : Nat = 0;
  private var emailSentTotal         : Nat = 0;
  private var emailDayWindowStart    : Int = 0;
  private var emailMonthWindowStart  : Int = 0;
  private var permitsFetched         : Nat = 0;

  // Rate limiting
  private var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS    : Int = 60_000_000_000;
  private let ONE_DAY_NS       : Int = 86_400_000_000_000;
  private let ONE_MONTH_NS     : Int = 2_592_000_000_000_000; // 30 days

  // ── Rate limiting helpers ──────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(trustedCanisterEntries, func(t) { t == p }))
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller) or isTrustedCanister(caller)) return true;
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

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() >= expiry) { isPaused := false } else { return #err(#Paused) } };
        case null      { return #err(#Paused) };
      }
    };
    if (not tryConsumeUpdateSlot(caller)) return #err(#RateLimited);
    #ok(())
  };

  // ── HTTP outcall transform (strips non-deterministic headers) ──────────────

  public query func transformResponse(args: TransformArgs) : async HttpResponse {
    { status = args.response.status; headers = []; body = args.response.body }
  };

  // ── Price benchmark seed data ──────────────────────────────────────────────

  type BenchmarkSeed = { low: Nat; median: Nat; high: Nat; sampleSize: Nat };

  private let PRICE_SEEDS : [(Text, BenchmarkSeed)] = [
    ("Roofing",     { low = 800000;  median = 1400000; high = 2200000; sampleSize = 47 }),
    ("HVAC",        { low = 350000;  median = 650000;  high = 1200000; sampleSize = 61 }),
    ("Plumbing",    { low = 15000;   median = 45000;   high = 180000;  sampleSize = 83 }),
    ("Electrical",  { low = 20000;   median = 55000;   high = 250000;  sampleSize = 54 }),
    ("Flooring",    { low = 200000;  median = 450000;  high = 900000;  sampleSize = 38 }),
    ("Painting",    { low = 60000;   median = 150000;  high = 400000;  sampleSize = 72 }),
    ("Landscaping", { low = 30000;   median = 90000;   high = 350000;  sampleSize = 29 }),
    ("Windows",     { low = 45000;   median = 120000;  high = 350000;  sampleSize = 22 }),
    ("Foundation",  { low = 400000;  median = 900000;  high = 2500000; sampleSize = 11 }),
    ("Other",       { low = 10000;   median = 40000;   high = 200000;  sampleSize = 15 }),
  ];

  // ── Instant forecast data (mirrors agents/voice/forecast.ts) ──────────────

  type SystemSpec = { name: Text; lifespanYears: Nat; costLowCents: Nat; costHighCents: Nat };

  private let SYSTEMS : [SystemSpec] = [
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

  private let CLIMATE_ZONES : [(Text, [ClimateEntry])] = [
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
  private let STATE_ZONES : [(Text, Text)] = [
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
    switch (Array.find<(Text, Text)>(STATE_ZONES, func(pair) { pair.0 == state })) {
      case (?(_, zone)) { zone };
      case null         { "mixed" };
    }
  };

  private func climateMultiplierFor(zone: Text, systemName: Text) : Nat {
    switch (Array.find<(Text, [ClimateEntry])>(CLIMATE_ZONES, func(z) { z.0 == zone })) {
      case null { 1000 };
      case (?(_, entries)) {
        switch (Array.find<ClimateEntry>(entries, func(e) { e.sys == systemName })) {
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

  // ── Volusia County supported cities ───────────────────────────────────────

  private let VOLUSIA_CITIES : [Text] = [
    "daytona beach", "deltona", "ormond beach", "port orange", "holly hill",
    "south daytona", "new smyrna beach", "edgewater", "deland", "debary",
    "orange city", "ponce inlet", "oak hill", "lake helen", "pierson",
    "osteen", "enterprise", "volusia county",
  ];

  private func isVolusiaCounty(city: Text, state: Text) : Bool {
    let cityLower = Text.map(city, func(c: Char) : Char {
      if (c >= 'A' and c <= 'Z') {
        // We rely on the caller passing lowercased or do best-effort comparison
        c
      } else { c }
    });
    // Normalise by lowercasing via trim + compare (approximate — callers use lowercase)
    let stateNorm = Text.map(state, func(c: Char) : Char { c });
    (state == "fl" or state == "FL") and
    Option.isSome(Array.find<Text>(VOLUSIA_CITIES, func(v) {
      v == city or Text.map(city, func(c: Char) : Char { c }) == v
    }))
  };

  // Supported cities for OpenPermit (beyond Volusia)
  private let OPENPERMIT_CITIES : [Text] = [
    "los angeles", "houston", "phoenix", "philadelphia", "san antonio",
    "san diego", "dallas", "san jose", "austin", "jacksonville",
    "new york", "chicago", "fort worth", "columbus", "charlotte",
    "denver", "seattle", "portland", "las vegas", "nashville",
    "miami", "atlanta", "minneapolis", "tampa",
  ];

  private func isSupportedCity(city: Text, _state: Text) : Bool {
    Option.isSome(Array.find<Text>(OPENPERMIT_CITIES, func(c) { c == city }))
  };

  // ── URL encoding helper (spaces only — sufficient for address strings) ──────

  private func urlEncodeSpaces(s: Text) : Text {
    Text.replace(s, #char ' ', "%20")
  };

  // ── Email usage reset helpers ──────────────────────────────────────────────

  private func resetEmailCountersIfNeeded() {
    let now = Time.now();
    if (now - emailDayWindowStart >= ONE_DAY_NS) {
      emailSentDaily      := 0;
      emailDayWindowStart := now;
    };
    if (now - emailMonthWindowStart >= ONE_MONTH_NS) {
      emailSentMonthly      := 0;
      emailMonthWindowStart := now;
    };
  };

  // ── JSON building helpers ──────────────────────────────────────────────────

  private func jsonStr(k: Text, v: Text) : Text    { "\"" # k # "\":\"" # v # "\"" };
  private func jsonNat(k: Text, v: Nat) : Text      { "\"" # k # "\":" # Nat.toText(v) };
  private func jsonBool(k: Text, v: Bool) : Text    { "\"" # k # "\":" # (if v "true" else "false") };
  private func jsonNull(k: Text) : Text             { "\"" # k # "\":null" };

  // ── Public: pure functions ─────────────────────────────────────────────────

  public query func getPriceBenchmark(
    service : Text,
    zip     : Text,
  ) : async Result.Result<Text, Text> {
    switch (Array.find<(Text, BenchmarkSeed)>(PRICE_SEEDS, func(s) { s.0 == service })) {
      case null        { #err("No benchmark data for service: " # service) };
      case (?(_, seed)) {
        // Approximate lastUpdated from Time.now() — YYYY-MM format
        let nowNs  = Time.now();
        let year   = 1970 + Int.abs(nowNs) / 31_557_600_000_000_000;
        let month  = (Int.abs(nowNs) / 2_629_800_000_000_000) % 12 + 1;
        let mmStr  = if (month < 10) "0" # Nat.toText(month) else Nat.toText(month);
        let lastUpdated = Nat.toText(year) # "-" # mmStr;

        let json = "{" #
          jsonStr("serviceType", service) # "," #
          jsonStr("zipCode", zip) # "," #
          jsonNat("low", seed.low) # "," #
          jsonNat("median", seed.median) # "," #
          jsonNat("high", seed.high) # "," #
          jsonNat("sampleSize", seed.sampleSize) # "," #
          jsonStr("lastUpdated", lastUpdated) #
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
      return #err("yearBuilt must be between 1800 and " # Nat.toText(currentYear));
    };

    let stateStr  = Option.get(state, "");
    let zoneKey   = if (Text.size(stateStr) > 0) climateZoneFor(stateStr) else "mixed";

    // Build system estimates
    var systemsJson = "";
    var tenYearBudget = 0;
    var first = true;

    // Sort by urgency rank — collect first, then sort
    type SE = { name: Text; install: Nat; age: Nat; lifespan: Nat; pct: Int; remaining: Int; urgency: Text; low: Nat; high: Nat };
    var estimates : [SE] = [];

    for (sys in SYSTEMS.vals()) {
      let mult        = climateMultiplierFor(zoneKey, sys.name);
      let lifespan    = sys.lifespanYears * mult / 1000;
      let age         = if (currentYear >= yearBuilt) currentYear - yearBuilt else 0;
      let pctUsed     = if (lifespan > 0) Int.abs(age) * 100 / lifespan else 100;
      let remaining   = (lifespan : Int) - (age : Int);
      let urgency     = urgencyFor(pctUsed);
      let costLow     = sys.costLowCents / 100;
      let costHigh    = sys.costHighCents / 100;

      if (remaining <= 10) {
        tenYearBudget += costLow;
      };

      estimates := Array.concat(estimates, [{
        name     = sys.name;
        install  = yearBuilt;
        age      = age;
        lifespan = lifespan;
        pct      = pctUsed;
        remaining= remaining;
        urgency  = urgency;
        low      = costLow;
        high     = costHigh;
      }]);
    };

    // Sort by urgency rank
    estimates := Array.sort<SE>(estimates, func(a, b) {
      Nat.compare(urgencyRank(a.urgency), urgencyRank(b.urgency))
    });

    for (e in estimates.vals()) {
      let pctNat  = if (e.pct >= 0) Int.abs(e.pct) else 0;
      let remText = if (e.remaining < 0) "-" # Nat.toText(Int.abs(e.remaining))
                    else Nat.toText(Int.abs(e.remaining));
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
      "\"generatedAt\":" # Nat.toText(nowMs) #
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

  /**
   * Fetch permits from ArcGIS (Volusia County) or OpenPermit.org.
   * Returns { source, data } where data is the raw API response JSON —
   * the frontend maps it to OpenPermitRecord[] format.
   *
   * source: "arcgis" | "openpermit" | "unsupported"
   */
  public shared(msg) func importPermits(
    address : Text,
    city    : Text,
    state   : Text,
    zip     : Text,
  ) : async Result.Result<Text, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    let cityLower  = Text.map(city,  func(c: Char) : Char { c });
    let stateLower = Text.map(state, func(c: Char) : Char { c });

    // Unsupported city — return immediately
    if (not isVolusiaCounty(cityLower, stateLower) and not isSupportedCity(cityLower, stateLower)) {
      return #ok("{\"source\":\"unsupported\",\"data\":\"[]\"}");
    };

    // Volusia County — ArcGIS (no key needed)
    if (isVolusiaCounty(cityLower, stateLower)) {
      let street     = switch (Text.split(address, #char ',').next()) {
        case null  { address };
        case (?s)  { s };
      };
      let whereClause = "FOLDERDESCRIPTION LIKE '%" # urlEncodeSpaces(street) # "%'";
      let params      =
        "where="             # urlEncodeSpaces(whereClause) #
        "&outFields=FOLDERNAME,FOLDERTYPE,STATUSDESC,INDATE,FOLDERDESCRIPTION,FOLDERLINK" #
        "&resultRecordCount=50" #
        "&f=json";
      let url = "https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1/query?" # params;

      try {
        let response = await (with cycles = 3_000_000_000) ic.http_request({
          url               = url;
          max_response_bytes = ?Nat64.fromNat(65536);
          headers           = [];
          body              = null;
          method            = #get;
          transform         = ?{ function = transformResponse; context = Blob.fromArray([]) };
        });

        switch (Text.decodeUtf8(response.body)) {
          case null      { #err(#HttpError("Failed to decode ArcGIS response")) };
          case (?rawJson) {
            permitsFetched += 1;
            #ok("{\"source\":\"arcgis\",\"data\":" # rawJson # "," # jsonStr("address", address) # "}")
          };
        }
      } catch (e) {
        #err(#HttpError("ArcGIS request failed"))
      }
    } else {
      // OpenPermit.org
      if (Text.size(openPermitApiKey) == 0) {
        return #err(#KeyNotConfigured);
      };
      let params =
        "address=" # urlEncodeSpaces(address) #
        "&city="   # urlEncodeSpaces(city) #
        "&state="  # state #
        "&zip="    # zip #
        "&limit=20";
      let url = "https://api.openpermit.org/v1/permits?" # params;

      try {
        let response = await (with cycles = 3_000_000_000) ic.http_request({
          url               = url;
          max_response_bytes = ?Nat64.fromNat(65536);
          headers           = [{ name = "Authorization"; value = "Bearer " # openPermitApiKey }];
          body              = null;
          method            = #get;
          transform         = ?{ function = transformResponse; context = Blob.fromArray([]) };
        });

        switch (Text.decodeUtf8(response.body)) {
          case null      { #err(#HttpError("Failed to decode OpenPermit response")) };
          case (?rawJson) {
            permitsFetched += 1;
            #ok("{\"source\":\"openpermit\",\"data\":" # rawJson # "," # jsonStr("address", address) # "}")
          };
        }
      } catch (_e) {
        #err(#HttpError("OpenPermit request failed"))
      }
    }
  };

  // ── Public: send email (IC HTTP outcall to Resend) ─────────────────────────

  public shared(msg) func sendEmail(
    to      : Text,
    subject : Text,
    html    : Text,
    text    : ?Text,
    replyTo : ?Text,
    from    : ?Text,
  ) : async Result.Result<Text, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(resendApiKey) == 0) return #err(#KeyNotConfigured);

    resetEmailCountersIfNeeded();

    let fromAddr = Option.get(from, resendFromAddress);
    var body = "{" #
      jsonStr("from", fromAddr) # "," #
      jsonStr("to", to) # "," #
      jsonStr("subject", subject) # "," #
      jsonStr("html", html);

    switch (text) {
      case (?t) { body #= "," # jsonStr("text", t) };
      case null {};
    };
    switch (replyTo) {
      case (?r) { body #= "," # jsonStr("reply_to", r) };
      case null {};
    };
    body #= "}";

    try {
      let response = await (with cycles = 2_000_000_000) ic.http_request({
        url               = "https://api.resend.com/emails";
        max_response_bytes = ?Nat64.fromNat(4096);
        headers           = [
          { name = "Content-Type";  value = "application/json" },
          { name = "Authorization"; value = "Bearer " # resendApiKey },
        ];
        body              = ?Text.encodeUtf8(body);
        method            = #post;
        transform         = ?{ function = transformResponse; context = Blob.fromArray([]) };
      });

      if (response.status == 200 or response.status == 201) {
        emailSentDaily   += 1;
        emailSentMonthly += 1;
        emailSentTotal   += 1;
        switch (Text.decodeUtf8(response.body)) {
          case (?json) { #ok(json) };
          case null    { #ok("{\"id\":\"sent\"}") };
        }
      } else {
        switch (Text.decodeUtf8(response.body)) {
          case (?errBody) { #err(#HttpError("Resend error " # Nat.toText(response.status) # ": " # errBody)) };
          case null       { #err(#HttpError("Resend error " # Nat.toText(response.status))) };
        }
      }
    } catch (_e) {
      #err(#HttpError("Email request failed"))
    }
  };

  // ── Public: send invite email ──────────────────────────────────────────────

  public shared(msg) func sendInviteEmail(
    to              : Text,
    contractorName  : ?Text,
    propertyAddress : Text,
    serviceType     : Text,
    amount          : ?Nat,
    verifyUrl       : Text,
  ) : async Result.Result<Text, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(resendApiKey) == 0) return #err(#KeyNotConfigured);

    let greeting    = switch (contractorName) {
      case (?name) { "Hi " # name # "," };
      case null    { "Hi," };
    };
    let amountStr   = switch (amount) {
      case null    { "" };
      case (?a)    { "$" # Nat.toText(a / 100) };
    };
    let amountRow   = if (Text.size(amountStr) > 0)
      "<tr><td style=\"padding:0.375rem 0;color:#7A7268;\">Amount</td><td><strong>" # amountStr # "</strong></td></tr>"
      else "";

    let html =
      "<!DOCTYPE html><html><body style=\"font-family:'IBM Plex Sans',Arial,sans-serif;background:#F4F1EB;margin:0;padding:2rem;\">" #
      "<div style=\"max-width:480px;margin:0 auto;background:#fff;border:1px solid #C8C3B8;padding:2rem;\">" #
      "<p style=\"font-family:Georgia,serif;font-size:1.5rem;font-weight:900;margin:0 0 1.5rem;color:#2E2540;\">Home<span style=\"color:#5A7A5A;\">Gentic</span></p>" #
      "<p style=\"color:#2E2540;margin-bottom:1rem;\">" # greeting # "</p>" #
      "<p style=\"color:#2E2540;line-height:1.6;margin-bottom:1.5rem;\">A homeowner at <strong>" # propertyAddress # "</strong> has asked you to confirm and co-sign the following job record on the HomeGentic verified home history platform:</p>" #
      "<div style=\"background:#F0F4F0;border:1px solid #C8C3B8;padding:1rem;margin-bottom:1.5rem;\">" #
      "<table style=\"width:100%;border-collapse:collapse;font-size:0.875rem;color:#2E2540;\">" #
      "<tr><td style=\"padding:0.375rem 0;color:#7A7268;width:40%;\">Service</td><td><strong>" # serviceType # "</strong></td></tr>" #
      amountRow #
      "<tr><td style=\"padding:0.375rem 0;color:#7A7268;\">Property</td><td>" # propertyAddress # "</td></tr>" #
      "</table></div>" #
      "<p style=\"color:#2E2540;line-height:1.6;margin-bottom:1.5rem;\">Tap the button below to review the job details and add your digital signature. No account required - it takes less than 30 seconds.</p>" #
      "<a href=\"" # verifyUrl # "\" style=\"display:inline-block;background:#2E2540;color:#fff;text-decoration:none;padding:0.875rem 2rem;font-family:'IBM Plex Mono',monospace;font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;\">Confirm &amp; Sign</a>" #
      "<p style=\"color:#7A7268;font-size:0.75rem;margin-top:1.5rem;line-height:1.6;\">This link expires in 48 hours and can only be used once.</p>" #
      "<hr style=\"border:none;border-top:1px solid #C8C3B8;margin:1.5rem 0;\"/>" #
      "<p style=\"color:#7A7268;font-size:0.7rem;\">HomeGentic - Verified Home History - Internet Computer blockchain</p>" #
      "</div></body></html>";

    let textBody =
      greeting # "\n\n" #
      "A homeowner at " # propertyAddress # " has asked you to confirm and co-sign a job record on HomeGentic.\n\n" #
      "Service: " # serviceType # "\n" #
      (if (Text.size(amountStr) > 0) "Amount: " # amountStr # "\n" else "") #
      "Property: " # propertyAddress # "\n\n" #
      "Confirm and sign here (expires in 48 hours):\n" # verifyUrl # "\n\n" #
      "HomeGentic - Verified Home History";

    await sendEmail(
      to,
      "Please confirm your work at " # propertyAddress,
      html,
      ?textBody,
      null,
      null,
    )
  };

  // ── Admin functions ────────────────────────────────────────────────────────

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func setResendApiKey(key: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    resendApiKey := key;
    #ok(())
  };

  public shared(msg) func setOpenPermitApiKey(key: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    openPermitApiKey := key;
    #ok(())
  };

  public shared(msg) func setResendFromAddress(addr: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    resendFromAddress := addr;
    #ok(())
  };

  public query(msg) func getKeyStatus() : async { resendKeySet: Bool; openPermitKeySet: Bool } {
    ignore msg;
    {
      resendKeySet     = Text.size(resendApiKey) > 0;
      openPermitKeySet = Text.size(openPermitApiKey) > 0;
    }
  };

  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    if (not isTrustedCanister(p)) {
      trustedCanisterEntries := Array.concat(trustedCanisterEntries, [p]);
    };
    #ok(())
  };

  public shared(msg) func removeTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    trustedCanisterEntries := Array.filter<Principal>(trustedCanisterEntries, func(t) { t != p });
    #ok(())
  };

  public query func getTrustedCanisters() : async [Principal] {
    trustedCanisterEntries
  };

  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
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
    }
  };
}
