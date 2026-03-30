/**
 * HomeFax Recurring Services Canister
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

  private var recurringCounter  : Nat         = 0;
  private var visitCounter      : Nat         = 0;
  private var isPaused          : Bool        = false;
  private var pauseExpiryNs     : ?Int        = null;
  private var adminListEntries  : [Principal] = [];
  private var adminInitialized  : Bool        = false;
  private var recurringEntries  : [(Text, RecurringService)] = [];
  private var visitEntries      : [(Text, VisitLog)]         = [];

  // ─── Transient State ─────────────────────────────────────────────────────────

  private transient var services = Map.fromIter<Text, RecurringService>(
    recurringEntries.vals(), Text.compare
  );

  private transient var visits = Map.fromIter<Text, VisitLog>(
    visitEntries.vals(), Text.compare
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  system func preupgrade() {
    recurringEntries := Iter.toArray(Map.entries(services));
    visitEntries     := Iter.toArray(Map.entries(visits));
  };

  system func postupgrade() {
    recurringEntries := [];
    visitEntries     := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (not isPaused) return #ok(());
    switch (pauseExpiryNs) {
      case (?expiry) { if (Time.now() >= expiry) return #ok(()) };
      case null {};
    };
    #err(#InvalidInput("Canister is paused"))
  };

  private func nextRecurringId() : Text {
    recurringCounter += 1;
    "REC_" # Nat.toText(recurringCounter)
  };

  private func nextVisitId() : Text {
    visitCounter += 1;
    "VISIT_" # Nat.toText(visitCounter)
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId)   == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(providerName) == 0) return #err(#InvalidInput("providerName cannot be empty"));
    if (Text.size(startDate)    == 0) return #err(#InvalidInput("startDate cannot be empty"));

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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(visitDate) == 0) return #err(#InvalidInput("visitDate cannot be empty"));

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

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.append(adminListEntries, [newAdmin]);
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
