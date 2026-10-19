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
import Index     "../shared/Index";
import RateLimit "../shared/RateLimit";

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
    #NotAuthorized;
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
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce    : ?Text       = null;
  /// M8: property canister ID for live owner/manager checks — set post-deploy
  /// via setPropertyCanisterId(). Empty = local dev (falls back to homeowner == caller).
  private var propCanisterId    : Text        = "";
  // ─── Stable State ────────────────────────────────────────────────────────────

  private let services = Map.empty<Text, RecurringService>();
  private let visits   = Map.empty<Text, VisitLog>();

  // Secondary indexes over `visits` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let visitsByService = Index.empty();
  private transient let visitsIndexes : [Index.Keyed<VisitLog>] = Index.indexed<VisitLog>(visits, [
    (visitsByService, func(r : VisitLog) : ?Text { ?r.serviceId }),
  ]);

  // Secondary indexes over `services` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let servicesByProperty = Index.empty();
  private transient let servicesIndexes : [Index.Keyed<RecurringService>] = Index.indexed<RecurringService>(services, [
    (servicesByProperty, func(r : RecurringService) : ?Text { ?r.propertyId }),
  ]);

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };


  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, Principal.toText(caller), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
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

  /// M8: is `caller` the property's owner/manager (write = needs write access)?
  /// Asked live from the property canister so a former owner loses access.
  /// When the property canister isn't wired (local dev), only `fallbackOwner` passes.
  private func checkPropertyAuth(propertyId: Text, fallbackOwner: Principal, caller: Principal, requireWrite: Bool) : async Bool {
    if (isAdmin(caller)) return true;
    if (Text.size(propCanisterId) > 0) {
      let propActor = actor(propCanisterId) : actor {
        isAuthorized : (Text, Principal, Bool) -> async Bool;
      };
      try { await propActor.isAuthorized(propertyId, caller, requireWrite) } catch (_) { false }
    } else {
      caller == fallbackOwner
    }
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

    // M8: only the property's owner or a write-capable manager may add services.
    if (not (await checkPropertyAuth(propertyId, msg.caller, msg.caller, true)))
      return #err(#NotAuthorized);

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

    Index.put(services, servicesIndexes, id, svc);
    #ok(svc)
  };

  /// Fetch a single recurring service by ID.
  /// M8: owner/manager of the property (or admin) only.
  public shared(msg) func getRecurringService(serviceId: Text) : async Result.Result<RecurringService, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(services, Text.compare, serviceId)) {
      case null  { #err(#NotFound) };
      case (?s)  {
        if (not (await checkPropertyAuth(s.propertyId, s.homeowner, msg.caller, false)))
          return #err(#NotAuthorized);
        switch (Map.get(services, Text.compare, serviceId)) {
          case null    { #err(#NotFound) };
          case (?cur)  { #ok(cur) };
        }
      };
    }
  };

  /// Fetch all recurring services for a given property.
  /// M8: owner/manager of the property (or admin) only; others get [].
  public shared(msg) func getByProperty(propertyId: Text) : async [RecurringService] {
    if (Principal.isAnonymous(msg.caller)) return [];
    if (Text.size(propCanisterId) == 0 and not isAdmin(msg.caller)) {
      // Local dev: only the caller's own records.
      return Iter.toArray(Iter.filter<RecurringService>(
        Index.records(servicesByProperty, propertyId, services),
        func(s) { s.homeowner == msg.caller }
      ));
    };
    if (not (await checkPropertyAuth(propertyId, msg.caller, msg.caller, false))) return [];
    Iter.toArray(
      Index.records(servicesByProperty, propertyId, services)
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
      case (?first) {
        // M8: owner/manager of the property, checked live (former owners lose access).
        if (not (await checkPropertyAuth(first.propertyId, first.homeowner, msg.caller, true)))
          return #err(#NotAuthorized);
        // Re-read after the await (TOCTOU).
        let existing = switch (Map.get(services, Text.compare, serviceId)) {
          case null { return #err(#NotFound) };
          case (?cur) { cur };
        };

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
        Index.put(services, servicesIndexes, serviceId, updated);
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
      case (?first) {
        // M8: owner/manager of the property, checked live (former owners lose access).
        if (not (await checkPropertyAuth(first.propertyId, first.homeowner, msg.caller, true)))
          return #err(#NotAuthorized);
        // Re-read after the await (TOCTOU).
        let existing = switch (Map.get(services, Text.compare, serviceId)) {
          case null { return #err(#NotFound) };
          case (?cur) { cur };
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
          status             = existing.status;
          contractDocPhotoId = ?photoId;
          createdAt          = existing.createdAt;
        };
        Index.put(services, servicesIndexes, serviceId, updated);
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
      case (?first) {
        // M8: owner/manager of the property, checked live (former owners lose access).
        if (not (await checkPropertyAuth(first.propertyId, first.homeowner, msg.caller, true)))
          return #err(#NotAuthorized);
        // Re-read after the await (TOCTOU).
        let svc = switch (Map.get(services, Text.compare, serviceId)) {
          case null { return #err(#NotFound) };
          case (?cur) { cur };
        };

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
        Index.put(visits, visitsIndexes, id, entry);
        #ok(entry)
      };
    }
  };

  /// Fetch all visit log entries for a recurring service, sorted by visitDate descending.
  /// M8: owner/manager of the service's property (or admin) only; others get [].
  public shared(msg) func getVisitLogs(serviceId: Text) : async [VisitLog] {
    if (Principal.isAnonymous(msg.caller)) return [];
    switch (Map.get(services, Text.compare, serviceId)) {
      case null { return [] };
      case (?svc) {
        if (not (await checkPropertyAuth(svc.propertyId, svc.homeowner, msg.caller, false))) return [];
      };
    };
    let matches = Iter.toArray(
      Index.records(visitsByService, serviceId, visits)
    );
    // Sort descending by visitDate (lexicographic works for YYYY-MM-DD)
    Array.sort(matches, func(a: VisitLog, b: VisitLog) : { #less; #equal; #greater } {
      if      (a.visitDate > b.visitDate) #less
      else if (a.visitDate < b.visitDate) #greater
      else                                #equal
    })
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// M8: wire the property canister for live owner/manager checks (admin only).
  public shared(msg) func setPropertyCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := Principal.toText(id);
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (not Principal.isController(msg.caller)) return;  // only a controller may open the bootstrap
    if (adminInitialized) return;  // already bootstrapped — ignore
    if (bootstrapNonce != null) return;  // nonce already set — can only be set once
    bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    if (adminInitialized) {
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
    adminInitialized := true;
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
