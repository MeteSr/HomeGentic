/**
 * HomeGentic Sensor Canister
 *
 * Manages IoT device registrations and processes inbound sensor events from
 * smart-home platforms (Nest, Ecobee, Moen Flo).
 *
 * Critical events (water leak, HVAC failure, pipe-freeze risk) automatically
 * trigger a cross-canister call to the Job canister to open a pending job for
 * the property owner — making HomeGentic genuinely passive for smart-home owners.
 *
 * Flow:
 *   IoT gateway (Node.js) → recordEvent() → classify severity
 *                         → if Critical → jobCanister.createSensorJob()
 */

import Array    "mo:core/Array";
import Debug    "mo:core/Debug";
import Float    "mo:core/Float";
import Map      "mo:core/Map";
import Iter     "mo:core/Iter";
import Nat      "mo:core/Nat";
import Option   "mo:core/Option";
import Set      "mo:core/Set";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Text     "mo:core/Text";
import Time     "mo:core/Time";
import ServiceTypes "../shared/ServiceType";
import Index    "../shared/Index";

persistent actor Sensor {

  // ─── Job Canister Interface ───────────────────────────────────────────────
  // Configured post-deploy via setJobCanisterId(). Kept as stable Text so it
  // survives upgrades without re-wiring.

  private var jobCanisterId:  Text = "";
  private var propCanisterId: Text = "";

  type JobServiceType = ServiceTypes.ServiceType;

  // ─── Types ───────────────────────────────────────────────────────────────

  public type DeviceSource = {
    #Nest; #Ecobee; #MoenFlo; #Manual;
    #RingAlarm; #HoneywellHome; #RheemEcoNet; #Sense;
    #EmporiaVue; #Rachio; #SmartThings; #HomeAssistant;
    #EnphaseEnvoy; #TeslaPowerwall;
    #LGThinQ; #GESmartHQ;
    #SolarEdge;
  };

  public type SensorEventType = {
    #WaterLeak;       // Moen Flo active leak
    #LeakDetected;    // Moen Flo flow anomaly / soft leak
    #FloodRisk;       // Moen Flo high-flow + no fixture open
    #LowTemperature;  // Nest/Ecobee < 4 °C → pipe-freeze risk
    #HvacAlert;       // Ecobee system fault
    #HvacFilterDue;   // Ecobee filter reminder
    #HighHumidity;    // Ecobee > 70 % RH
    #HighTemperature; // Nest/Ecobee informational high
    #SolarFault;      // Enphase inverter error or system offline
    #LowProduction;   // Enphase production near-zero during daylight
    #BatteryLow;          // Tesla Powerwall charge critically low
    #GridOutage;          // Tesla Powerwall: grid disconnected (islanded)
    #ApplianceFault;      // LG ThinQ / GE SmartHQ appliance fault or error code
    #ApplianceMaintenance; // LG ThinQ / GE SmartHQ maintenance due (filter, descaling …)
  };

  public type Severity = { #Info; #Warning; #Critical };

  public type SensorDevice = {
    id               : Text;
    propertyId       : Text;
    homeowner        : Principal;
    externalDeviceId : Text;     // ID assigned by Nest/Ecobee/Moen Flo cloud
    source           : DeviceSource;
    name             : Text;
    registeredAt     : Int;
    isActive         : Bool;
  };

  public type SensorEvent = {
    id          : Text;
    deviceId    : Text;
    propertyId  : Text;
    homeowner   : Principal;
    eventType   : SensorEventType;
    value       : Float;         // numeric reading (°C, % RH, L/min …)
    unit        : Text;          // "°C", "%RH", "L/min", ""
    rawPayload  : Text;          // original JSON string from gateway
    timestamp   : Int;
    severity    : Severity;
    jobId       : ?Text;         // set when a job was auto-created
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput : Text;
    #AlreadyExists;
  };

  public type Metrics = {
    totalDevices   : Nat;
    activeDevices  : Nat;
    totalEvents    : Nat;
    criticalEvents : Nat;
    jobsCreated    : Nat;
    isPaused       : Bool;
    errorsByMethod : [(Text, Nat)];
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var isPaused        : Bool        = false;
  private var pauseExpiryNs   : ?Int        = null;
  private var adminListEntries : [Principal] = [];
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce : ?Text = null;
  private var authorizedGateways : [Principal] = [];
  private var deviceCounter   : Nat         = 0;
  private var eventCounter    : Nat         = 0;
  private var jobsCreatedCount : Nat        = 0;

  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();

  private func countError(method : Text) {
    let prev = Option.get(Map.get(errsByMethod, Text.compare, method), 0);
    Map.add(errsByMethod, Text.compare, method, prev + 1);
  };

  // ─── Stable State ────────────────────────────────────────────────────────

  private let devices      = Map.empty<Text, SensorDevice>();
  /// Legacy event store keyed by "EVT_<n>" text, which sorts EVT_10 before
  /// EVT_9. Kept only for upgrade compatibility; postupgrade drains it into
  /// `eventLog`.
  private let events       = Map.empty<Text, SensorEvent>();
  /// Events keyed by sequence number (the <n> in "EVT_<n>"), oldest first.
  private let eventLog     = Map.empty<Nat, SensorEvent>();
  /// externalDeviceId → internal device id
  private let externalIdIdx = Map.empty<Text, Text>();

  /// M9 / F-14: devices whose ownership the IoT gateway verified through the
  /// vendor's own API (OAuth device picker). Keyed by
  /// "<source>\n<vendorAccountId>\n<externalDeviceId>" → internal device id.
  private let verifiedIdx = Map.empty<Text, Text>();
  /// Internal device id → vendor account it was verified under. Presence of
  /// an entry marks the device as verified.
  private let deviceVendorAccount = Map.empty<Text, Text>();
  /// Sources that, once a gateway is registered, may only be bound through the
  /// gateway's vendor-account flow (registerVerifiedDevice). These are the
  /// platforms the gateway has an OAuth device picker for. Admin-adjustable as
  /// the gateway gains flows for more platforms.
  private var verifiedOnlySources : [DeviceSource] = [#Ecobee, #HoneywellHome, #LGThinQ, #GESmartHQ];

  // ─── Ingress Inspection ───────────────────────────────────────────────────────

  /// Reject recordEvent and registerDevice calls from principals that are neither
  /// a registered gateway nor an admin. Checked at the boundary before execution —
  /// saves cycles and prevents arbitrary principals from probing the sensor pipeline.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    // Reject anonymous principals and empty-payload calls before execution.
    // isGateway / isAdmin checks remain in each function body for per-method
    // enforcement; this guard saves cycles on clearly invalid ingress messages.
    not Principal.isAnonymous(caller) and arg.size() > 0
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private transient let ONE_MINUTE_NS       : Int = 60_000_000_000;

  /// Per-device last auto-job creation timestamp (internal device ID → nanoseconds).
  /// Transient: resets on upgrade — acceptable, it is a DoS guard not business logic.
  private let lastCriticalJobNs : Map.Map<Text, Int> = Map.empty();

  // ─── Secondary indexes (transient, rebuilt on every upgrade) ──────────────

  /// Newest events kept per property; older ones are pruned as new ones arrive.
  private transient let MAX_EVENTS_PER_PROPERTY : Nat = 1_000;

  private transient let devicesByProperty = Index.build<SensorDevice>(devices, func(d) { ?d.propertyId });

  private func fileEvent(ix : Map.Map<Text, Set.Set<Nat>>, seq : Nat, propertyId : Text) {
    switch (Map.get(ix, Text.compare, propertyId)) {
      case (?seqs) { Set.add(seqs, Nat.compare, seq) };
      case null {
        let seqs = Set.empty<Nat>();
        Set.add(seqs, Nat.compare, seq);
        Map.add(ix, Text.compare, propertyId, seqs);
      };
    };
  };

  /// propertyId → event sequence numbers.
  private transient let eventsByProperty : Map.Map<Text, Set.Set<Nat>> = do {
    let ix = Map.empty<Text, Set.Set<Nat>>();
    for ((seq, e) in Map.entries(eventLog)) { fileEvent(ix, seq, e.propertyId) };
    ix
  };

  /// "EVT_42" → 42. Every id this canister issued has that shape.
  private func eventSeq(id : Text) : Nat {
    switch (Text.stripStart(id, #text "EVT_")) {
      case (?digits) { Option.get(Nat.fromText(digits), 0) };
      case null      { 0 };
    }
  };

  /// Stores an event and prunes the property's oldest beyond the cap.
  private func putEvent(seq : Nat, e : SensorEvent) {
    Map.add(eventLog, Nat.compare, seq, e);
    fileEvent(eventsByProperty, seq, e.propertyId);
    switch (Map.get(eventsByProperty, Text.compare, e.propertyId)) {
      case (?seqs) {
        while (Set.size(seqs) > MAX_EVENTS_PER_PROPERTY) {
          switch (Set.min(seqs)) {
            case (?oldest) {
              Set.remove(seqs, Nat.compare, oldest);
              Map.remove(eventLog, Nat.compare, oldest);
            };
            case null {};
          };
        };
      };
      case null {};
    };
  };

  /// A property's events, oldest first.
  private func propertyEvents(propertyId : Text) : Iter.Iter<SensorEvent> {
    switch (Map.get(eventsByProperty, Text.compare, propertyId)) {
      case (?seqs) {
        Iter.filterMap<Nat, SensorEvent>(Set.values(seqs), func(seq) { Map.get(eventLog, Nat.compare, seq) })
      };
      case null { Iter.empty<SensorEvent>() };
    }
  };

  /// True when `caller` registered a still-active device on `propertyId`.
  /// Only used as the local-dev fallback when the property canister isn't wired.
  private func ownsDeviceOn(propertyId : Text, caller : Principal) : Bool {
    Option.isSome(Iter.find<SensorDevice>(
      Index.records(devicesByProperty, propertyId, devices),
      func(d) { d.homeowner == caller and d.isActive }
    ))
  };

  type PropertyAuth = actor {
    isAuthorized : shared query (Text, Principal, Bool) -> async Bool;
  };

  /// M9: live property-role check (owner / manager) against the property
  /// canister, so a former owner or revoked manager loses access at once.
  /// Falls back to "registered an active device here" in local dev.
  private func authorizedOn(propertyId : Text, p : Principal, requireWrite : Bool) : async Bool {
    switch (await authCheck(propertyId, p, requireWrite)) { case (?b) b; case null false }
  };

  /// Like authorizedOn, but null when the property canister couldn't be reached.
  private func authCheck(propertyId : Text, p : Principal, requireWrite : Bool) : async ?Bool {
    if (Text.size(propCanisterId) == 0) return ?ownsDeviceOn(propertyId, p);
    let propActor : PropertyAuth = actor(propCanisterId);
    try { ?(await propActor.isAuthorized(propertyId, p, requireWrite)) } catch (_) { null }
  };

  /// M9: mark a device inactive and release its external ID so it can be
  /// registered again (by the new owner after a sale, for instance).
  private func retireDevice(d : SensorDevice) {
    let updated : SensorDevice = {
      id               = d.id;
      propertyId       = d.propertyId;
      homeowner        = d.homeowner;
      externalDeviceId = d.externalDeviceId;
      source           = d.source;
      name             = d.name;
      registeredAt     = d.registeredAt;
      isActive         = false;
    };
    Map.add(devices, Text.compare, d.id, updated);
    switch (Map.get(externalIdIdx, Text.compare, d.externalDeviceId)) {
      case (?idxId) { if (idxId == d.id) { Map.remove(externalIdIdx, Text.compare, d.externalDeviceId) } };
      case null {};
    };
    switch (Map.get(deviceVendorAccount, Text.compare, d.id)) {
      case (?acct) {
        let key = verifiedKey(d.source, acct, d.externalDeviceId);
        switch (Map.get(verifiedIdx, Text.compare, key)) {
          case (?idxId) { if (idxId == d.id) { Map.remove(verifiedIdx, Text.compare, key) } };
          case null {};
        };
      };
      case null {};
    };
  };

  private func verifiedKey(source : DeviceSource, vendorAccountId : Text, externalDeviceId : Text) : Text {
    debug_show(source) # "\n" # vendorAccountId # "\n" # externalDeviceId
  };

  private func isVerifiedDevice(id : Text) : Bool {
    Option.isSome(Map.get(deviceVendorAccount, Text.compare, id))
  };

  private func requiresVerification(source : DeviceSource) : Bool {
    Option.isSome(Array.find<DeviceSource>(verifiedOnlySources, func(v) { v == source }))
  };

  /// The active device an index entry points to; drops dangling/inactive entries.
  private func activeAt(ix : Map.Map<Text, Text>, key : Text) : ?SensorDevice {
    switch (Map.get(ix, Text.compare, key)) {
      case null { null };
      case (?id) {
        switch (Map.get(devices, Text.compare, id)) {
          case (?d) { if (d.isActive) ?d else { Map.remove(ix, Text.compare, key); null } };
          case null { Map.remove(ix, Text.compare, key); null };
        }
      };
    }
  };

  /// Validation shared by both registration paths.
  private func validateRegistration(propertyId : Text, externalDeviceId : Text, name : Text) : ?Error {
    if (Text.size(propertyId)       == 0)  return ?#InvalidInput("propertyId required");
    if (Text.size(propertyId)       > 200) return ?#InvalidInput("propertyId exceeds 200 characters");
    if (Text.size(externalDeviceId) == 0)  return ?#InvalidInput("externalDeviceId required");
    if (Text.size(externalDeviceId) > 200) return ?#InvalidInput("externalDeviceId exceeds 200 characters");
    if (Text.size(name)             == 0)  return ?#InvalidInput("name required");
    if (Text.size(name)             > 200) return ?#InvalidInput("name exceeds 200 characters");
    null
  };

  system func postupgrade() {
    for ((id, e) in Map.entries(events)) { putEvent(eventSeq(id), e) };
    Map.clear(events);
  };
  private transient let CRITICAL_JOB_COOLDOWN_NS : Int = 60 * 60 * 1_000_000_000;  // 1 hour

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
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

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func isGateway(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(authorizedGateways, func(g) { g == p }))
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#InvalidInput("Canister is paused")) };
        case null { return #err(#InvalidInput("Canister is paused")) };
      };
    };
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # Nat.toText(maxUpdatesPerMin) # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func nextDeviceId() : Text {
    deviceCounter += 1;
    "DEV_" # Nat.toText(deviceCounter)
  };

  private func nextEventId() : Text {
    eventCounter += 1;
    "EVT_" # Nat.toText(eventCounter)
  };

  private func severityOf(t: SensorEventType) : Severity {
    switch t {
      case (#WaterLeak)       { #Critical };
      case (#LeakDetected)    { #Critical };
      case (#FloodRisk)       { #Critical };
      case (#LowTemperature)  { #Warning  };
      case (#HvacAlert)       { #Critical };
      case (#HighTemperature) { #Warning  };
      case (#HighHumidity)    { #Warning  };
      case (#HvacFilterDue)   { #Info     };
      case (#SolarFault)      { #Critical };
      case (#LowProduction)   { #Warning  };
      case (#BatteryLow)          { #Critical };
      case (#GridOutage)          { #Warning  };
      case (#ApplianceFault)      { #Warning  };
      case (#ApplianceMaintenance){ #Info     };
    }
  };

  private func isCritical(s: Severity) : Bool {
    switch s { case (#Critical) { true }; case _ { false } }
  };

  private func isAlertworthy(s: Severity) : Bool {
    switch s {
      case (#Critical) { true };
      case (#Warning)  { true };
      case _           { false };
    }
  };

  /// Returns (title, serviceType, description) for events that should auto-create a job.
  /// Returns null for informational events that do not warrant a job.
  private func jobDetailsFor(t: SensorEventType, deviceName: Text)
    : ?(Text, JobServiceType, Text)
  {
    switch t {
      case (#WaterLeak) {
        ?(
          "Water Leak Detected – Immediate Inspection Required",
          #Plumbing,
          "IoT sensor \"" # deviceName # "\" detected an active water leak. " #
          "Immediate inspection required to prevent structural water damage."
        )
      };
      case (#LeakDetected) {
        ?(
          "Possible Leak – Plumbing Inspection",
          #Plumbing,
          "Moen Flo detected unusual water flow or a soft leak at \"" # deviceName # "\". " #
          "Plumbing inspection recommended."
        )
      };
      case (#FloodRisk) {
        ?(
          "Flood-Risk Alert – Emergency Plumbing",
          #Plumbing,
          "Sensor \"" # deviceName # "\" is reporting high-flow flood-risk conditions. " #
          "Emergency plumbing service required."
        )
      };
      case (#LowTemperature) {
        ?(
          "Low Temperature Alert – Pipe Freeze Risk",
          #Plumbing,
          "Thermostat \"" # deviceName # "\" reports near-freezing temperatures. " #
          "Inspect and insulate exposed pipes before a burst occurs."
        )
      };
      case (#HvacAlert) {
        ?(
          "HVAC System Fault – Service Required",
          #HVAC,
          "HVAC system \"" # deviceName # "\" is reporting an operational fault. " #
          "Technician inspection recommended."
        )
      };
      case (#SolarFault) {
        ?(
          "Solar System Fault – Inspection Required",
          #Electrical,
          "Solar inverter or Enphase Envoy \"" # deviceName # "\" is reporting a fault. " #
          "Electrical inspection required to restore production."
        )
      };
      case (#BatteryLow) {
        ?(
          "Battery Critically Low – Electrical Inspection",
          #Electrical,
          "Tesla Powerwall \"" # deviceName # "\" battery is critically low. " #
          "Inspect the battery system and grid connection."
        )
      };
      // LowProduction, GridOutage, filter-due, high-humidity/temperature do not auto-create jobs
      case _ { null };
    }
  };

  // ─── Device Registration ─────────────────────────────────────────────────

  /// Register an IoT device for a property.
  /// The caller's Principal is stored as the homeowner — must be the property owner.
  public shared(msg) func registerDevice(
    propertyId       : Text,
    externalDeviceId : Text,
    source           : DeviceSource,
    name             : Text
  ) : async Result.Result<SensorDevice, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (validateRegistration(propertyId, externalDeviceId, name)) { case (?e) return #err e; case null {} };

    // M9 / F-14: platforms the gateway can verify through the vendor account
    // must be linked that way (registerVerifiedDevice) once a gateway is
    // registered, so nobody can claim a device ID they merely know. Without a
    // gateway (local dev) the old self-asserted path still works.
    if (requiresVerification(source) and authorizedGateways.size() > 0 and not isAdmin(msg.caller)) {
      return #err(#InvalidInput("Connect your " # debug_show(source) # " account to add this device"));
    };

    // H-15: verify caller owns the property before registering a device
    if (not isAdmin(msg.caller)) {
      if (Text.size(propCanisterId) > 0) {
        let propActor = actor(propCanisterId) : actor {
          isAuthorized : (Text, Principal, Bool) -> async Bool;
        };
        let authorized = await propActor.isAuthorized(propertyId, msg.caller, true);
        if (not authorized) return #err(#NotAuthorized);
      };
      // If propCanisterId is not set, allow (dev/local environment)
    };

    // M9: an external ID can be bound to one active device at a time. A
    // binding is refused while its registrant still has access to the
    // property it was registered on; a stale binding (former owner, revoked
    // manager, or deactivated device) is released and can be re-registered.
    // A #Manual device never receives gateway events, so its (self-chosen) ID
    // must not block a vendor device with the same ID: drop its index entry.
    if (source != #Manual) {
      switch (activeAt(externalIdIdx, externalDeviceId)) {
        case (?m) { if (m.source == #Manual) Map.remove(externalIdIdx, Text.compare, externalDeviceId) };
        case null {};
      };
    };
    switch (Map.get(externalIdIdx, Text.compare, externalDeviceId)) {
      case null {};
      case (?existingId) {
        switch (Map.get(devices, Text.compare, existingId)) {
          case (?old) {
            if (old.isActive) {
              let stillOwned = await authorizedOn(old.propertyId, old.homeowner, true);
              // Re-check after the await (TOCTOU): the binding may have changed.
              switch (Map.get(externalIdIdx, Text.compare, externalDeviceId)) {
                case (?nowId) {
                  if (nowId != existingId) return #err(#AlreadyExists);
                  switch (Map.get(devices, Text.compare, nowId)) {
                    case (?cur) {
                      if (cur.isActive) {
                        if (stillOwned) return #err(#AlreadyExists);
                        retireDevice(cur);
                      };
                    };
                    case null { Map.remove(externalIdIdx, Text.compare, externalDeviceId) };
                  };
                };
                case null {};
              };
            } else {
              Map.remove(externalIdIdx, Text.compare, externalDeviceId);
            };
          };
          case null { Map.remove(externalIdIdx, Text.compare, externalDeviceId) };
        };
      };
    };
    if (Map.get(externalIdIdx, Text.compare, externalDeviceId) != null) return #err(#AlreadyExists);

    let id = nextDeviceId();
    let device : SensorDevice = {
      id;
      propertyId;
      homeowner        = msg.caller;
      externalDeviceId;
      source;
      name;
      registeredAt     = Time.now();
      isActive         = true;
    };

    Map.add(devices, Text.compare, id, device);
    Map.add(externalIdIdx, Text.compare, externalDeviceId, id);
    Index.add(devicesByProperty, propertyId, id);
    #ok(device)
  };

  /// M9 / F-14: bind a vendor device whose ownership the IoT gateway proved.
  ///
  /// Gateway (or admin) only. The gateway calls this after the homeowner, whose
  /// HomeGentic principal it resolved from an auth-canister session token,
  /// completed the vendor's OAuth flow; `externalDeviceId` must be one of the
  /// devices the vendor API listed for that OAuth token. `owner`'s write access
  /// to the property is re-checked here, live.
  ///
  /// Identity is scoped per (source, vendorAccountId, externalDeviceId). A
  /// verified binding replaces any unverified (self-asserted) one with the same
  /// external ID, and is itself only replaced once its registrant has lost
  /// access to the property it was registered on.
  public shared(msg) func registerVerifiedDevice(
    owner            : Principal,
    propertyId       : Text,
    externalDeviceId : Text,
    source           : DeviceSource,
    vendorAccountId  : Text,
    name             : Text
  ) : async Result.Result<SensorDevice, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (not isGateway(msg.caller) and not isAdmin(msg.caller)) {
      countError("registerVerifiedDevice");
      return #err(#NotAuthorized);
    };
    if (Principal.isAnonymous(owner)) return #err(#NotAuthorized);
    if (source == #Manual) return #err(#InvalidInput("Manual devices are registered with registerDevice"));
    switch (validateRegistration(propertyId, externalDeviceId, name)) { case (?e) return #err e; case null {} };
    if (Text.size(vendorAccountId) > 200) return #err(#InvalidInput("vendorAccountId exceeds 200 characters"));

    // The homeowner must hold write access to the property right now.
    if (Text.size(propCanisterId) > 0) {
      let ok = switch (await authCheck(propertyId, owner, true)) { case (?b) b; case null false };
      if (not ok) return #err(#NotAuthorized);
    };

    let key = verifiedKey(source, vendorAccountId, externalDeviceId);

    // Re-linking the same device to the same property is a no-op.
    switch (activeAt(verifiedIdx, key)) {
      case (?d) { if (d.homeowner == owner and d.propertyId == propertyId) return #ok(d) };
      case null {};
    };

    // Resolve the (at most two) existing bindings: the verified one for this
    // exact key and whatever holds the global external-ID slot.
    for ((useVerified, k) in [(true, key), (false, externalDeviceId)].vals()) {
      let ix = if useVerified verifiedIdx else externalIdIdx;
      switch (activeAt(ix, k)) {
        case null {};
        case (?d) {
          if (not isVerifiedDevice(d.id)) {
            // Verified beats unverified (self-asserted or #Manual).
            retireDevice(d);
          } else {
            let held = await authorizedOn(d.propertyId, d.homeowner, true);
            // Re-read after the await (TOCTOU).
            switch (Map.get(devices, Text.compare, d.id)) {
              case (?cur) {
                if (cur.isActive) {
                  if (held) return #err(#AlreadyExists);
                  retireDevice(cur);
                };
              };
              case null {};
            };
          };
        };
      };
    };
    // Something may have been bound while we awaited.
    if (Option.isSome(activeAt(verifiedIdx, key)) or Option.isSome(activeAt(externalIdIdx, externalDeviceId))) {
      return #err(#AlreadyExists);
    };

    let id = nextDeviceId();
    let device : SensorDevice = {
      id;
      propertyId;
      homeowner        = owner;
      externalDeviceId;
      source;
      name;
      registeredAt     = Time.now();
      isActive         = true;
    };
    Map.add(devices, Text.compare, id, device);
    Map.add(externalIdIdx, Text.compare, externalDeviceId, id);
    Map.add(verifiedIdx, Text.compare, key, id);
    Map.add(deviceVendorAccount, Text.compare, id, vendorAccountId);
    Index.add(devicesByProperty, propertyId, id);
    #ok(device)
  };

  /// Deactivate a device (owner or admin only).
  public shared(msg) func deactivateDevice(deviceId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    switch (Map.get(devices, Text.compare, deviceId)) {
      case null { #err(#NotFound) };
      case (?first) {
        // The registrant, an admin, or the property's current owner/manager
        // (so a new owner can remove a former owner's device).
        if (first.homeowner != msg.caller and not isAdmin(msg.caller)) {
          if (not (await authorizedOn(first.propertyId, msg.caller, true)))
            return #err(#NotAuthorized);
        };
        // Re-read after the await (TOCTOU).
        switch (Map.get(devices, Text.compare, deviceId)) {
          case null { #err(#NotFound) };
          case (?d) {
            // M9: release the external ID so the device can be registered again.
            retireDevice(d);
            #ok(())
          };
        }
      };
    }
  };

  /// M9: only the property's current owner/manager, an admin or a gateway may
  /// list its devices (external device IDs are what a hijacker needs). A
  /// composite query so the property role can be checked live.
  public composite query(msg) func getDevicesForProperty(propertyId: Text) : async [SensorDevice] {
    if (Principal.isAnonymous(msg.caller)) return [];
    if (not isAdmin(msg.caller) and not isGateway(msg.caller)) {
      if (Text.size(propCanisterId) == 0) {
        if (not ownsDeviceOn(propertyId, msg.caller)) return [];
      } else {
        let propActor : PropertyAuth = actor(propCanisterId);
        let ok = try { await propActor.isAuthorized(propertyId, msg.caller, false) } catch (_) { false };
        if (not ok) return [];
      };
    };
    Iter.toArray(
      Iter.filter(Index.records(devicesByProperty, propertyId, devices), func(d: SensorDevice) : Bool {
        d.isActive
      })
    )
  };

  // ─── Event Recording ─────────────────────────────────────────────────────

  /// Maximum bytes accepted for rawPayload to prevent canister memory exhaustion.
  private transient let MAX_PAYLOAD_BYTES : Nat = 4096;

  /// Called by the IoT gateway (authorized principal) to record a sensor event.
  ///
  /// For Critical events this function makes an inter-canister call to the Job
  /// canister to create a pending job. The caller MUST be an authorized gateway
  /// principal (added via addGateway()) or an admin.
  public shared(msg) func recordEvent(
    externalDeviceId : Text,
    eventType        : SensorEventType,
    value            : Float,
    unit             : Text,
    rawPayload       : Text
  ) : async Result.Result<SensorEvent, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (not isGateway(msg.caller) and not isAdmin(msg.caller)) {
      Debug.print("sensor.recordEvent: unauthorized caller: " # Principal.toText(msg.caller));
      countError("recordEvent");
      return #err(#NotAuthorized);
    };

    if (Text.size(rawPayload) > MAX_PAYLOAD_BYTES) {
      countError("recordEvent");
      return #err(#InvalidInput("rawPayload exceeds 4096-byte limit"));
    };

    let device = switch (activeAt(externalIdIdx, externalDeviceId)) {
      case null  {
        // M9: unknown or deactivated devices record nothing and create no jobs.
        Debug.print("sensor.recordEvent: device not found: " # externalDeviceId);
        countError("recordEvent");
        return #err(#NotFound);
      };
      case (?d)  { d };
    };
    // F-14: a #Manual device's ID is self-chosen, so gateway traffic never
    // lands on one (it could otherwise squat a vendor device's ID).
    if (device.source == #Manual and not isAdmin(msg.caller)) {
      countError("recordEvent");
      return #err(#NotFound);
    };
    await* ingest(device, eventType, value, unit, rawPayload)
  };

  /// M9 / F-14: platform- and vendor-account-scoped event ingestion for the
  /// gateway. With a non-empty `vendorAccountId` the event only lands on the
  /// device verified under that vendor account (or on a legacy unverified
  /// device of that platform); with an empty one (the gateway received the
  /// event on a channel that doesn't name the account, e.g. a webhook carrying
  /// only a device ID) it lands on the platform's active binding for the ID.
  /// Never lands on a device registered for a different platform.
  public shared(msg) func recordEventFor(
    source           : DeviceSource,
    vendorAccountId  : Text,
    externalDeviceId : Text,
    eventType        : SensorEventType,
    value            : Float,
    unit             : Text,
    rawPayload       : Text
  ) : async Result.Result<SensorEvent, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (not isGateway(msg.caller) and not isAdmin(msg.caller)) {
      countError("recordEventFor");
      return #err(#NotAuthorized);
    };
    if (Text.size(rawPayload) > MAX_PAYLOAD_BYTES) {
      countError("recordEventFor");
      return #err(#InvalidInput("rawPayload exceeds 4096-byte limit"));
    };
    if (source == #Manual) return #err(#InvalidInput("Manual devices receive no gateway events"));

    let exact = if (Text.size(vendorAccountId) > 0) {
      activeAt(verifiedIdx, verifiedKey(source, vendorAccountId, externalDeviceId))
    } else { null };
    let device = switch (exact) {
      case (?d) { d };
      case null {
        switch (activeAt(externalIdIdx, externalDeviceId)) {
          case null { countError("recordEventFor"); return #err(#NotFound) };
          case (?d) {
            if (d.source != source) { countError("recordEventFor"); return #err(#NotFound) };
            // A device verified under another vendor account doesn't take
            // events the gateway received under this one.
            switch (Map.get(deviceVendorAccount, Text.compare, d.id)) {
              case (?acct) {
                if (Text.size(vendorAccountId) > 0 and Text.size(acct) > 0 and acct != vendorAccountId) {
                  countError("recordEventFor");
                  return #err(#NotFound);
                };
              };
              case null {};
            };
            d
          };
        }
      };
    };
    await* ingest(device, eventType, value, unit, rawPayload)
  };

  /// Classify, maybe open a job, and store an event for an active device.
  private func ingest(
    device     : SensorDevice,
    eventType  : SensorEventType,
    value      : Float,
    unit       : Text,
    rawPayload : Text
  ) : async* Result.Result<SensorEvent, Error> {
    let deviceId = device.id;
    let severity = severityOf(eventType);
    let eventId  = nextEventId();
    let now      = Time.now();

    // Auto-create a pending job for critical events (max one per device per hour).
    var maybeJobId : ?Text = null;
    if (isCritical(severity) and Text.size(jobCanisterId) > 0) {
      switch (jobDetailsFor(eventType, device.name)) {
        case (?(title, svcType, desc)) {
          let prevT = Map.get(lastCriticalJobNs, Text.compare, deviceId);
          let lastT = Option.get(prevT, 0);
          if (now - lastT >= CRITICAL_JOB_COOLDOWN_NS) {
            // L8: reserve the cooldown slot before the await so concurrent
            // Critical events from one device can't each create a job.
            Map.add(lastCriticalJobNs, Text.compare, deviceId, now);
            let restore = func() {
              switch (prevT) {
                case (?t) { Map.add(lastCriticalJobNs, Text.compare, deviceId, t) };
                case null { Map.remove(lastCriticalJobNs, Text.compare, deviceId) };
              };
            };
            // M9: only open a job for a registrant who still has the property.
            let auth = await authCheck(device.propertyId, device.homeowner, false);
            if (auth == ?false) {
              // Former owner / revoked manager: retire the device, record nothing.
              switch (Map.get(devices, Text.compare, deviceId)) {
                case (?cur) { if (cur.isActive) retireDevice(cur) };
                case null {};
              };
              restore();
              countError("recordEvent");
              return #err(#NotAuthorized);
            };
            let jobActor = actor(jobCanisterId) : actor {
              createSensorJob : (
                Text, Principal, Text, JobServiceType, Text
              ) -> async Result.Result<Text, Text>;
            };
            let res : Result.Result<Text, Text> = if (auth == null) {
              // Property canister unreachable: record the event, skip the job.
              #err("property check unavailable")
            } else {
              try {
                await jobActor.createSensorJob(
                  device.propertyId,
                  device.homeowner,
                  title,
                  svcType,
                  desc
                )
              } catch (_) { #err("job canister call failed") }
            };
            switch res {
              case (#ok id)  {
                maybeJobId := ?id;
                jobsCreatedCount += 1;
              };
              case (#err _)  { restore() };   // job creation failed — still record the event
            };
          };
        };
        case null {};
      }
    };

    let event : SensorEvent = {
      id         = eventId;
      deviceId;
      propertyId = device.propertyId;
      homeowner  = device.homeowner;
      eventType;
      value;
      unit;
      rawPayload;
      timestamp  = now;
      severity;
      jobId      = maybeJobId;
    };

    putEvent(eventSeq(eventId), event);
    #ok(event)
  };

  // M-07: restrict getEventsForProperty to property owner, admin, or trusted canister
  public shared(msg) func getEventsForProperty(propertyId: Text, limit: Nat) : async [SensorEvent] {
    if (Principal.isAnonymous(msg.caller)) return [];
    if (not isAdmin(msg.caller) and not isGateway(msg.caller)) {
      // M9: current owner/manager of the property, checked live.
      if (not (await authorizedOn(propertyId, msg.caller, false))) return [];
    };
    // The latest `limit` events (all when limit = 0), oldest first.
    let seqs = switch (Map.get(eventsByProperty, Text.compare, propertyId)) {
      case (?seqs) { seqs };
      case null    { return [] };
    };
    let newest = Iter.filterMap<Nat, SensorEvent>(Set.reverseValues(seqs), func(seq) { Map.get(eventLog, Nat.compare, seq) });
    let picked = if (limit == 0) { Iter.toArray(newest) } else { Iter.toArray(Iter.take(newest, limit)) };
    Array.reverse(picked)
  };

  // M-07: restrict getPendingAlerts to property owner, admin, or trusted gateway
  public shared(msg) func getPendingAlerts(propertyId: Text) : async [SensorEvent] {
    if (Principal.isAnonymous(msg.caller)) return [];
    if (not isAdmin(msg.caller) and not isGateway(msg.caller)) {
      // M9: current owner/manager of the property, checked live.
      if (not (await authorizedOn(propertyId, msg.caller, false))) return [];
    };
    Iter.toArray(
      Iter.filter(propertyEvents(propertyId), func(e: SensorEvent) : Bool {
        isAlertworthy(e.severity)
      })
    )
  };

  // ─── Admin & Config ──────────────────────────────────────────────────────

  /// Set the Job canister ID (text principal). Admin only.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id;
    #ok(())
  };

  /// Wire the sensor canister to the property canister for ownership checks. Admin only.
  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id;
    #ok(())
  };

  /// Authorize an IoT gateway identity to call recordEvent().
  public shared(msg) func addGateway(gw: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    // L8: no duplicates.
    if (not isGateway(gw)) {
      authorizedGateways := Array.concat(authorizedGateways, [gw]);
    };
    #ok(())
  };

  /// L8: revoke an IoT gateway identity (e.g. a compromised gateway key). Admin only.
  public shared(msg) func removeGateway(gw: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    authorizedGateways := Array.filter<Principal>(authorizedGateways, func(g) { g != gw });
    #ok(())
  };

  /// F-14: which sources must be linked through the gateway's vendor-account
  /// flow once a gateway is registered. Admin only.
  public shared(msg) func setVerifiedOnlySources(sources : [DeviceSource]) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Option.isSome(Array.find<DeviceSource>(sources, func(v) { v == #Manual }))) {
      return #err(#InvalidInput("Manual devices cannot require vendor verification"));
    };
    verifiedOnlySources := sources;
    #ok(())
  };

  public query func getVerifiedOnlySources() : async [DeviceSource] { verifiedOnlySources };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once the admin list is initialized, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (not Principal.isController(msg.caller)) return;  // only a controller may open the bootstrap
    if (adminListEntries.size() > 0) return;  // already bootstrapped — ignore
    if (bootstrapNonce != null) return;  // nonce already set — can only be set once
    bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0) {
      if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    } else {
      switch (bootstrapNonce) {
        case null { return #err(#NotAuthorized) };
        case (?n) { if (nonce != n) return #err(#NotAuthorized) };
      };
      bootstrapNonce := null;
    };
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Array.filter<Principal>(adminListEntries, func(a) { a != target });
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var active   : Nat = 0;
    var critical : Nat = 0;
    for (d in Map.values(devices)) { if (d.isActive) { active += 1 } };
    for (e in Map.values(eventLog)) { if (isCritical(e.severity)) { critical += 1 } };
    {
      totalDevices   = Map.size(devices);
      activeDevices  = active;
      totalEvents    = Map.size(eventLog);
      criticalEvents = critical;
      jobsCreated    = jobsCreatedCount;
      isPaused;
      errorsByMethod = Iter.toArray(Map.entries(errsByMethod));
    }
  };
}
