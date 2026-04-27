/**
 * HomeGentic Recurring Services Canister
 *
 * Tracks ongoing home service contracts (lawn care, pest control, pool
 * maintenance, etc.) with a lightweight visit log per service.
 *
 * Design intent:
 *   - One contract document (photoId from the photo canister) per service
 *   - Visit log entries are date + optional note — no per-visit doc upload
 *   - Buyer-facing summary: provider, contract status, frequency, last visit
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Nat        "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Recurring {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type RecurringServiceType = {
    #LawnCare;
    #PestControl;
    #PoolMaintenance;
    #GutterCleaning;
    #PressureWashing;
    #Other;
  };

  public type Frequency = {
    #Weekly;
    #BiWeekly;
    #Monthly;
    #Quarterly;
    #SemiAnnually;
    #Annually;
  };

  public type ServiceStatus = {
    #Active;
    #Paused;
    #Cancelled;
  };

  public type RecurringService = {
    id:                 Text;
    propertyId:         Text;
    homeowner:          Principal;
    serviceType:        RecurringServiceType;
    providerName:       Text;
    providerLicense:    ?Text;
    providerPhone:      ?Text;
    frequency:          Frequency;
    startDate:          Text;          // YYYY-MM-DD
    contractEndDate:    ?Text;         // YYYY-MM-DD, null = open-ended
    notes:              ?Text;
    status:             ServiceStatus;
    contractDocPhotoId: ?Text;         // photoId from photo canister, null = no doc yet
    createdAt:          Time.Time;
  };

  public type VisitLog = {
    id:         Text;
    serviceId:  Text;
    propertyId: Text;   // denormalized for O(1) property-level filtering
    visitDate:  Text;   // YYYY-MM-DD
    note:       ?Text;
    createdAt:  Time.Time;
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput : Text;
    #AlreadyCancelled;
  };

  public type Metrics = {
    totalServices:   Nat;
    activeServices:  Nat;
    pausedServices:  Nat;
    totalVisitLogs:  Nat;
    isPaused:        Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var isPaused          : Bool        = false;
  private var pauseExpiryNs     : ?Int        = null;
  private var adminListEntries  : [Principal] = [];
  private var adminInitialized  : Bool        = false;
  // ─── Stable State ────────────────────────────────────────────────────────────

  private let services = Map.empty<Text, RecurringService>();
  private let visits   = Map.empty<Text, VisitLog>();

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private transient let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };


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

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#Unauthorized);
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

  private func nextRecurringId() : Text {
    "REC_" # Int.toText(Int.abs(Time.now()) / 1_000_000)
  };

  private func nextVisitId() : Text {
    "VISIT_" # Int.toText(Int.abs(Time.now()) / 1_000_000)
  };

  // ─── Core: Recurring Services ────────────────────────────────────────────────

  /// Create a new recurring service record. Caller becomes the homeowner.
  public shared(msg) func createRecurringService(
    propertyId:      Text,
    serviceType:     RecurringServiceType,
    providerName:    Text,
    providerLicense: ?Text,
    providerPhone:   ?Text,
    frequency:       Frequency,
    startDate:       Text,
    contractEndDate: ?Text,
    notes:           ?Text
  ) : async Result.Result<RecurringService, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)   == 0)  return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(propertyId)   > 200) return #err(#InvalidInput("propertyId exceeds 200 characters"));
    if (Text.size(providerName) == 0)  return #err(#InvalidInput("providerName cannot be empty"));
    if (Text.size(providerName) > 200) return #err(#InvalidInput("providerName exceeds 200 characters"));
    if (Text.size(startDate)    == 0)  return #err(#InvalidInput("startDate cannot be empty"));
    if (Text.size(startDate)    > 10)  return #err(#InvalidInput("startDate exceeds 10 characters"));
    switch (providerLicense) { case (?v) { if (Text.size(v) > 200) return #err(#InvalidInput("providerLicense exceeds 200 characters")) }; case null {} };
    switch (providerPhone)   { case (?v) { if (Text.size(v) > 30)  return #err(#InvalidInput("providerPhone exceeds 30 characters"))   }; case null {} };
    switch (contractEndDate) { case (?v) { if (Text.size(v) > 10)  return #err(#InvalidInput("contractEndDate exceeds 10 characters"))  }; case null {} };
    switch (notes)           { case (?v) { if (Text.size(v) > 2000) return #err(#InvalidInput("notes exceed 2000 characters"))          }; case null {} };

    let id  = nextRecurringId();
    let now = Time.now();

    let svc : RecurringService = {
      id;
      propertyId;
      homeowner          = msg.caller;
      serviceType;
      providerName;
      providerLicense;
      providerPhone;
      frequency;
      startDate;
      contractEndDate;
      notes;
      status             = #Active;
      contractDocPhotoId = null;
      createdAt          = now;
    };

    Map.add(services, Text.compare, id, svc);
    #ok(svc)
  };

  /// Fetch a single recurring service by ID.
  public query func getRecurringService(serviceId: Text) : async Result.Result<RecurringService, Error> {
    switch (Map.get(services, Text.compare, serviceId)) {
      case null  { #err(#NotFound) };
      case (?s)  { #ok(s) };
    }
  };

  /// Fetch all recurring services for a given property.
  public query func getByProperty(propertyId: Text) : async [RecurringService] {
    Iter.toArray(
      Iter.filter(Map.values(services), func(s: RecurringService) : Bool {
        s.propertyId == propertyId
      })
    )
  };

  /// Update the status of a recurring service.
  /// Only the homeowner or admin may do this.
  /// Cancelled services are tombstoned — no further status changes allowed.
  public shared(msg) func updateStatus(
    serviceId: Text,
    status:    ServiceStatus
  ) : async Result.Result<RecurringService, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(services, Text.compare, serviceId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.homeowner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);

        switch (existing.status) {
          case (#Cancelled) { return #err(#AlreadyCancelled) };
          case _ {};
        };

        let updated : RecurringService = {
          id                 = existing.id;
          propertyId         = existing.propertyId;
          homeowner          = existing.homeowner;
          serviceType        = existing.serviceType;
          providerName       = existing.providerName;
          providerLicense    = existing.providerLicense;
          providerPhone      = existing.providerPhone;
          frequency          = existing.frequency;
          startDate          = existing.startDate;
          contractEndDate    = existing.contractEndDate;
          notes              = existing.notes;
          status;
          contractDocPhotoId = existing.contractDocPhotoId;
          createdAt          = existing.createdAt;
        };
        Map.add(services, Text.compare, serviceId, updated);
        #ok(updated)
      };
    }
  };

  /// Attach a contract document (photoId from the photo canister).
  /// Only the homeowner may do this.
  public shared(msg) func attachContractDoc(
    serviceId: Text,
    photoId:   Text
  ) : async Result.Result<RecurringService, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(photoId) == 0) return #err(#InvalidInput("photoId cannot be empty"));

    switch (Map.get(services, Text.compare, serviceId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.homeowner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);

        let updated : RecurringService = {
          id                 = existing.id;
          propertyId         = existing.propertyId;
          homeowner          = existing.homeowner;
          serviceType        = existing.serviceType;
          providerName       = existing.providerName;
          providerLicense    = existing.providerLicense;
          providerPhone      = existing.providerPhone;
          frequency          = existing.frequency;
          startDate          = existing.startDate;
          contractEndDate    = existing.contractEndDate;
          notes              = existing.notes;
          status             = existing.status;
          contractDocPhotoId = ?photoId;
          createdAt          = existing.createdAt;
        };
        Map.add(services, Text.compare, serviceId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Core: Visit Log ─────────────────────────────────────────────────────────

  /// Add a visit log entry for a recurring service.
  /// Only the homeowner may log visits. No doc upload required.
  public shared(msg) func addVisitLog(
    serviceId: Text,
    visitDate: Text,
    note:      ?Text
  ) : async Result.Result<VisitLog, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(visitDate) == 0) return #err(#InvalidInput("visitDate cannot be empty"));
    if (Text.size(visitDate) > 10) return #err(#InvalidInput("visitDate exceeds 10 characters"));
    switch (note) { case (?v) { if (Text.size(v) > 2000) return #err(#InvalidInput("note exceeds 2000 characters")) }; case null {} };

    switch (Map.get(services, Text.compare, serviceId)) {
      case null { #err(#NotFound) };
      case (?svc) {
        if (svc.homeowner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);

        let id  = nextVisitId();
        let now = Time.now();

        let entry : VisitLog = {
          id;
          serviceId;
          propertyId = svc.propertyId;
          visitDate;
          note;
          createdAt  = now;
        };
        Map.add(visits, Text.compare, id, entry);
        #ok(entry)
      };
    }
  };

  /// Fetch all visit log entries for a recurring service, sorted by visitDate descending.
  public query func getVisitLogs(serviceId: Text) : async [VisitLog] {
    let matches = Iter.toArray(
      Iter.filter(Map.values(visits), func(v: VisitLog) : Bool { v.serviceId == serviceId })
    );
    // Sort descending by visitDate (lexicographic works for YYYY-MM-DD)
    Array.sort(matches, func(a: VisitLog, b: VisitLog) : { #less; #equal; #greater } {
      if      (a.visitDate > b.visitDate) #less
      else if (a.visitDate < b.visitDate) #greater
      else                                #equal
    })
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    adminInitialized := true;
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
    var active  = 0;
    var paused  = 0;

    for (s in Map.values(services)) {
      switch (s.status) {
        case (#Active)    { active  += 1 };
        case (#Paused)    { paused  += 1 };
        case (#Cancelled) {};
      };
    };

    {
      totalServices  = Map.size(services);
      activeServices = active;
      pausedServices = paused;
      totalVisitLogs = Map.size(visits);
      isPaused;
    }
  };
}
