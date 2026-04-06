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
import Float    "mo:core/Float";
import Map      "mo:core/Map";
import Iter     "mo:core/Iter";
import Nat      "mo:core/Nat";
import Option   "mo:core/Option";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Text     "mo:core/Text";
import Time     "mo:core/Time";

persistent actor Sensor {

  // ─── Job Canister Interface ───────────────────────────────────────────────
  // Configured post-deploy via setJobCanisterId(). Kept as stable Text so it
  // survives upgrades without re-wiring.

  private var jobCanisterId: Text = "";

  type JobServiceType = {
    #Roofing; #HVAC; #Plumbing; #Electrical;
    #Painting; #Flooring; #Windows; #Landscaping;
  };

  // ─── Types ───────────────────────────────────────────────────────────────

  public type DeviceSource = { #Nest; #Ecobee; #MoenFlo; #Manual };

  public type SensorEventType = {
    #WaterLeak;       // Moen Flo active leak
    #LeakDetected;    // Moen Flo flow anomaly / soft leak
    #FloodRisk;       // Moen Flo high-flow + no fixture open
    #LowTemperature;  // Nest/Ecobee < 4 °C → pipe-freeze risk
    #HvacAlert;       // Ecobee system fault
    #HvacFilterDue;   // Ecobee filter reminder
    #HighHumidity;    // Ecobee > 70 % RH
    #HighTemperature; // Nest/Ecobee informational high
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
    #Unauthorized;
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
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var isPaused        : Bool        = false;
  private var pauseExpiryNs   : ?Int        = null;
  private var adminListEntries : [Principal] = [];
  private var authorizedGateways : [Principal] = [];
  private var deviceCounter   : Nat         = 0;
  private var eventCounter    : Nat         = 0;
  private var jobsCreatedCount : Nat        = 0;

  /// Migration buffers — cleared after first upgrade with this code.
  private var devicesEntries       : [(Text, SensorDevice)] = [];
  private var eventsEntries        : [(Text, SensorEvent)]  = [];
  private var externalIdIdxEntries : [(Text, Text)]          = [];

  // ─── Stable State ────────────────────────────────────────────────────────

  private var devices      = Map.empty<Text, SensorDevice>();
  private var events       = Map.empty<Text, SensorEvent>();
  /// externalDeviceId → internal device id
  private var externalIdIdx = Map.empty<Text, Text>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in devicesEntries.vals())       { Map.add(devices,       Text.compare, k, v) };
    devicesEntries := [];
    for ((k, v) in eventsEntries.vals())        { Map.add(events,        Text.compare, k, v) };
    eventsEntries := [];
    for ((k, v) in externalIdIdxEntries.vals()) { Map.add(externalIdIdx, Text.compare, k, v) };
    externalIdIdxEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  private let MAX_UPDATES_PER_MIN : Nat = 120;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
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

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func isGateway(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(authorizedGateways, func(g) { g == p }))
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#InvalidInput("Canister is paused")) };
        case null { return #err(#InvalidInput("Canister is paused")) };
      };
    };
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # Nat.toText(MAX_UPDATES_PER_MIN) # " update calls per minute per principal."))
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
      case (#HvacAlert)       { #Warning  };
      case (#HighTemperature) { #Warning  };
      case (#HighHumidity)    { #Warning  };
      case (#HvacFilterDue)   { #Info     };
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
      // Filter-due and high-humidity/temperature do not auto-create jobs
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

    if (Text.size(propertyId)       == 0)  return #err(#InvalidInput("propertyId required"));
    if (Text.size(propertyId)       > 200) return #err(#InvalidInput("propertyId exceeds 200 characters"));
    if (Text.size(externalDeviceId) == 0)  return #err(#InvalidInput("externalDeviceId required"));
    if (Text.size(externalDeviceId) > 200) return #err(#InvalidInput("externalDeviceId exceeds 200 characters"));
    if (Text.size(name)             == 0)  return #err(#InvalidInput("name required"));
    if (Text.size(name)             > 200) return #err(#InvalidInput("name exceeds 200 characters"));

    switch (Map.get(externalIdIdx, Text.compare, externalDeviceId)) {
      case (?_) { return #err(#AlreadyExists) };
      case null {};
    };

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
    #ok(device)
  };

  /// Deactivate a device (owner or admin only).
  public shared(msg) func deactivateDevice(deviceId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    switch (Map.get(devices, Text.compare, deviceId)) {
      case null { #err(#NotFound) };
      case (?d) {
        if (d.homeowner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
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
        Map.add(devices, Text.compare, deviceId, updated);
        #ok(())
      };
    }
  };

  public query func getDevicesForProperty(propertyId: Text) : async [SensorDevice] {
    Iter.toArray(
      Iter.filter(Map.values(devices), func(d: SensorDevice) : Bool {
        d.propertyId == propertyId and d.isActive
      })
    )
  };

  // ─── Event Recording ─────────────────────────────────────────────────────

  /// Maximum bytes accepted for rawPayload to prevent canister memory exhaustion.
  private let MAX_PAYLOAD_BYTES : Nat = 4096;

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

    if (not isGateway(msg.caller) and not isAdmin(msg.caller))
      return #err(#Unauthorized);

    if (Text.size(rawPayload) > MAX_PAYLOAD_BYTES)
      return #err(#InvalidInput("rawPayload exceeds 4096-byte limit"));

    let deviceId = switch (Map.get(externalIdIdx, Text.compare, externalDeviceId)) {
      case null     { return #err(#NotFound) };
      case (?id)    { id };
    };
    let device = switch (Map.get(devices, Text.compare, deviceId)) {
      case null  { return #err(#NotFound) };
      case (?d)  { d };
    };

    let severity = severityOf(eventType);
    let eventId  = nextEventId();
    let now      = Time.now();

    // Auto-create a pending job for critical events
    var maybeJobId : ?Text = null;
    if (isCritical(severity) and Text.size(jobCanisterId) > 0) {
      switch (jobDetailsFor(eventType, device.name)) {
        case (?(title, svcType, desc)) {
          let jobActor = actor(jobCanisterId) : actor {
            createSensorJob : (
              Text, Principal, Text, JobServiceType, Text
            ) -> async Result.Result<Text, Text>;
          };
          let res = await jobActor.createSensorJob(
            device.propertyId,
            device.homeowner,
            title,
            svcType,
            desc
          );
          switch res {
            case (#ok id)  { maybeJobId := ?id; jobsCreatedCount += 1 };
            case (#err _)  {};   // job creation failed — still record the event
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

    Map.add(events, Text.compare, eventId, event);
    #ok(event)
  };

  public query func getEventsForProperty(propertyId: Text, limit: Nat) : async [SensorEvent] {
    let all = Iter.toArray(
      Iter.filter(Map.values(events), func(e: SensorEvent) : Bool {
        e.propertyId == propertyId
      })
    );
    let total = all.size();
    if (limit == 0 or total <= limit) { all }
    else {
      Array.tabulate<SensorEvent>(limit, func(i) { all[total - limit + i] })
    }
  };

  public query func getPendingAlerts(propertyId: Text) : async [SensorEvent] {
    Iter.toArray(
      Iter.filter(Map.values(events), func(e: SensorEvent) : Bool {
        e.propertyId == propertyId and isAlertworthy(e.severity)
      })
    )
  };

  // ─── Admin & Config ──────────────────────────────────────────────────────

  /// Set the Job canister ID (text principal). Admin only.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    jobCanisterId := id;
    #ok(())
  };

  /// Authorize an IoT gateway identity to call recordEvent().
  public shared(msg) func addGateway(gw: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    authorizedGateways := Array.concat(authorizedGateways, [gw]);
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
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
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var active   : Nat = 0;
    var critical : Nat = 0;
    for (d in Map.values(devices)) { if (d.isActive) { active += 1 } };
    for (e in Map.values(events))  { if (isCritical(e.severity)) { critical += 1 } };
    {
      totalDevices   = Map.size(devices);
      activeDevices  = active;
      totalEvents    = Map.size(events);
      criticalEvents = critical;
      jobsCreated    = jobsCreatedCount;
      isPaused;
    }
  };
}
