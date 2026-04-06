/**
 * HomeGentic Property Canister
 *
 * Handles property registration, ownership verification, and tier-based limits.
 *
 * ── Verification lifecycle ─────────────────────────────────────────────────
 *
 *  #Unverified  ──► submitVerification()  ──► #PendingReview
 *                                                   │
 *                              admin verifyProperty()▼
 *                              ┌─────── #Basic  (utility bill)
 *                              └─────── #Premium (deed / tax record)
 *                              (rejected → back to #Unverified)
 *
 * ── Duplicate-address safeguard ───────────────────────────────────────────
 *
 *  When two users claim the same address:
 *   • First registrant gets a 7-day window to reach #Basic or #Premium.
 *   • If they verify in time  → second registration is rejected outright.
 *   • If 7 days pass without verification → second registrant may register
 *     and race to verify first.
 *   • Whoever verifies first becomes the canonical owner; the other is flagged.
 *
 * ── Value gates (enforced by Report canister) ─────────────────────────────
 *
 *  getVerificationLevel() is a query called cross-canister by the Report
 *  canister before issuing any share link.  Unverified and PendingReview
 *  properties cannot produce shareable reports.
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Property {

  // ─── Constants ────────────────────────────────────────────────────────────

  /// Nanoseconds in 7 days — the conflict resolution window.
  private let SEVEN_DAYS_NS : Int = 7 * 24 * 3600 * 1_000_000_000;

  // ─── Types ────────────────────────────────────────────────────────────────

  public type PropertyType = {
    #SingleFamily;
    #Condo;
    #Townhouse;
    #MultiFamily;
  };

  /// Ownership verification level.
  ///
  ///  #Unverified   — registered, no documents submitted
  ///  #PendingReview — documents uploaded, awaiting admin approval
  ///  #Basic         — utility bill confirmed (self-serve + admin reviewed)
  ///  #Premium       — deed or county tax record confirmed
  public type VerificationLevel = {
    #Unverified;
    #PendingReview;
    #Basic;
    #Premium;
  };

  public type SubscriptionTier = {
    #Free;          // 1 property
    #Pro;           // 5 properties
    #Premium;       // 25 properties
    #ContractorPro; // unlimited
  };

  /// Full on-chain property record.
  ///
  /// verificationDate / verificationMethod / verificationDocHash are null
  /// until the owner submits verification documents.  Making them optional
  /// keeps canister upgrades backward-compatible.
  public type Property = {
    id                  : Nat;
    owner               : Principal;
    address             : Text;
    city                : Text;
    state               : Text;
    zipCode             : Text;
    propertyType        : PropertyType;
    yearBuilt           : Nat;
    squareFeet          : Nat;
    verificationLevel   : VerificationLevel;
    verificationDate    : ?Time.Time;   // set when level moves to Basic/Premium
    verificationMethod  : ?Text;        // "UtilityBill" | "DeedRecord" | "TaxRecord"
    verificationDocHash : ?Text;        // SHA-256 hex of the submitted document
    tier                : SubscriptionTier;
    createdAt           : Int;
    updatedAt           : Int;
    isActive            : Bool;
  };

  public type RegisterPropertyArgs = {
    address      : Text;
    city         : Text;
    state        : Text;
    zipCode      : Text;
    propertyType : PropertyType;
    yearBuilt    : Nat;
    squareFeet   : Nat;
    tier         : SubscriptionTier;
  };

  public type Metrics = {
    totalProperties         : Nat;
    verifiedProperties      : Nat;
    pendingReviewProperties : Nat;
    unverifiedProperties    : Nat;
    isPaused                : Bool;
  };

  public type BulkImportError = {
    index  : Nat;   // 0-based row index in input array
    reason : Text;
  };

  public type BulkImportResult = {
    succeeded : [Nat];            // property IDs created
    failed    : [BulkImportError];
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #Paused;
    #LimitReached;
    #InvalidInput    : Text;
    /// Address is already registered AND verified by another owner.
    #DuplicateAddress;
    /// Address is registered by another user who still has time to verify.
    /// Carries the Unix-nanosecond timestamp when the window expires.
    #AddressConflict : Int;
  };

  /// Immutable record of a single ownership transfer event.
  public type TransferRecord = {
    propertyId : Nat;
    from       : Principal;
    to         : Principal;
    timestamp  : Time.Time;
    /// Optional hash / txid from an off-chain deed recording or blockchain tx.
    /// Empty string when not provided.
    txHash     : Text;
  };

  /// Pending transfer awaiting recipient acceptance.
  public type PendingTransfer = {
    propertyId  : Nat;
    from        : Principal;
    to          : Principal;
    initiatedAt : Time.Time;
  };

  // ─── Room / Fixture types (merged from room canister) ────────────────────

  public type Fixture = {
    id:             Text;
    brand:          Text;
    model:          Text;
    serialNumber:   Text;
    installedDate:  Text;   // YYYY-MM-DD or ""
    warrantyExpiry: Text;   // YYYY-MM-DD or ""
    notes:          Text;
  };

  public type RoomRecord = {
    id:          Text;
    propertyId:  Text;
    owner:       Principal;
    name:        Text;
    floorType:   Text;
    paintColor:  Text;
    paintBrand:  Text;
    paintCode:   Text;
    notes:       Text;
    fixtures:    [Fixture];
    createdAt:   Time.Time;
    updatedAt:   Time.Time;
  };

  public type CreateRoomArgs = {
    propertyId: Text;
    name:       Text;
    floorType:  Text;
    paintColor: Text;
    paintBrand: Text;
    paintCode:  Text;
    notes:      Text;
  };

  public type UpdateRoomArgs = {
    name:       Text;
    floorType:  Text;
    paintColor: Text;
    paintBrand: Text;
    paintCode:  Text;
    notes:      Text;
  };

  public type AddFixtureArgs = {
    brand:          Text;
    model:          Text;
    serialNumber:   Text;
    installedDate:  Text;
    warrantyExpiry: Text;
    notes:          Text;
  };

  public type RoomMetrics = {
    totalRooms:    Nat;
    totalFixtures: Nat;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var nextId     : Nat       = 1;
  private var isPaused          : Bool        = false;
  private var pauseExpiryNs     : ?Int        = null;
  private var admins                   : [Principal] = [];
  private var adminInitialized         : Bool        = false;
  private var trustedCanisterEntries   : [Principal] = [];

  /// Migration buffers — cleared after first upgrade with this code.
  private var propertyEntries        : [(Nat, Property)]              = [];
  private var addressIdxEntries      : [(Text, Nat)]                  = [];
  private var tierGrantEntries       : [(Text, SubscriptionTier)]     = [];
  private var transferCounter        : Nat                            = 0;
  private var transferEntries        : [(Nat, TransferRecord)]        = [];
  private var pendingTransferEntries : [(Nat, PendingTransfer)]       = [];

  // Room state
  private var roomCounter    : Nat                  = 0;
  private var fixtureCounter : Nat                  = 0;
  private var roomEntries    : [(Text, RoomRecord)] = [];

  // ─── Stable State ────────────────────────────────────────────────────────

  private var properties      = Map.empty<Nat, Property>();
  /// Address key → first-registered property ID.
  private var addressIdx      = Map.empty<Text, Nat>();
  private var tierGrants      = Map.empty<Text, SubscriptionTier>();
  private var transfers       = Map.empty<Nat, TransferRecord>();
  private var pendingTransfers = Map.empty<Nat, PendingTransfer>();
  private var rooms           = Map.empty<Text, RoomRecord>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in propertyEntries.vals())        { Map.add(properties,       Nat.compare,  k, v) };
    propertyEntries := [];
    for ((k, v) in addressIdxEntries.vals())      { Map.add(addressIdx,       Text.compare, k, v) };
    addressIdxEntries := [];
    for ((k, v) in tierGrantEntries.vals())       { Map.add(tierGrants,       Text.compare, k, v) };
    tierGrantEntries := [];
    for ((k, v) in transferEntries.vals())        { Map.add(transfers,        Nat.compare,  k, v) };
    transferEntries := [];
    for ((k, v) in pendingTransferEntries.vals()) { Map.add(pendingTransfers, Nat.compare,  k, v) };
    pendingTransferEntries := [];
    for ((k, v) in roomEntries.vals())            { Map.add(rooms,            Text.compare, k, v) };
    roomEntries := [];
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

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

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(admins, func(a) { a == caller }))
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(trustedCanisterEntries, func(t) { t == p }))
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#Paused) };
        case null { return #err(#Paused) };
      };
    };
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # Nat.toText(maxUpdatesPerMin) # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func countOwnerProperties(owner: Principal) : Nat {
    var n = 0;
    for (p in Map.values(properties)) {
      if (p.owner == owner and p.isActive) { n += 1 };
    };
    n
  };

  /// Produces a stable address key for duplicate detection.
  /// Concatenates the four address components with pipe separators.
  /// Case-sensitive — users must enter addresses consistently.
  private func addressKey(address: Text, city: Text, state: Text, zip: Text) : Text {
    address # "|" # city # "|" # state # "|" # zip
  };

  private func isVerified(level: VerificationLevel) : Bool {
    switch level {
      case (#Basic or #Premium) { true };
      case _                    { false };
    }
  };

  /// Returns the authoritative tier for a principal.
  /// Falls back to #Free for principals without an admin-granted tier.
  /// Callers cannot influence this — it is set only via setTier() (admin-only).
  private func tierFor(p: Principal) : SubscriptionTier {
    switch (Map.get(tierGrants, Text.compare, Principal.toText(p))) {
      case (?t) { t };
      case null { #Free };
    }
  };

  // ─── Tier Limits ──────────────────────────────────────────────────────────

  public query func getPropertyLimitForTier(tier: SubscriptionTier) : async Nat {
    switch tier {
      case (#Free)          { 1  };
      case (#Pro)           { 5  };
      case (#Premium)       { 25 };
      case (#ContractorPro) { 0  };  // 0 = unlimited
    }
  };

  // ─── Registration ─────────────────────────────────────────────────────────

  /// Register a new property for the calling principal.
  ///
  /// Duplicate-address rules (Safeguard 1):
  ///  1. If the existing record is Basic/Premium: reject — address is taken.
  ///  2. If the existing record is Unverified/PendingReview and within the
  ///     7-day window: reject with #AddressConflict (carries expiry time).
  ///  3. If the window has expired: allow — the new registration displaces the
  ///     old one in the address index and begins a fresh 7-day window.
  public shared(msg) func registerProperty(
    args: RegisterPropertyArgs
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Text.size(args.address) == 0)
      return #err(#InvalidInput("Address cannot be empty"));
    if (Text.size(args.address) > 500) return #err(#InvalidInput("address exceeds 500 characters"));
    if (Text.size(args.city)    > 100) return #err(#InvalidInput("city exceeds 100 characters"));
    if (Text.size(args.state)   > 50)  return #err(#InvalidInput("state exceeds 50 characters"));
    if (Text.size(args.zipCode) > 20)  return #err(#InvalidInput("zipCode exceeds 20 characters"));

    let caller = msg.caller;
    let key    = addressKey(args.address, args.city, args.state, args.zipCode);

    // ── Duplicate address check ──────────────────────────────────────────────
    switch (Map.get(addressIdx, Text.compare, key)) {
      case (?existingId) {
        switch (Map.get(properties, Nat.compare, existingId)) {
          case (?existing) {
            if (existing.owner == caller) {
              // Same owner re-registering the same address — allow (idempotent).
            } else if (isVerified(existing.verificationLevel)) {
              // Address is already owned and verified — hard reject.
              return #err(#DuplicateAddress);
            } else {
              // Address is claimed but not yet verified.
              let windowEnd : Int = existing.createdAt + SEVEN_DAYS_NS;
              if (Time.now() < windowEnd) {
                return #err(#AddressConflict(windowEnd));
              };
              // Window expired without verification — allow the new registrant.
              // They displace the stale claim in the index.
            }
          };
          case null { /* stale index entry — harmless, overwrite below */ };
        }
      };
      case null {};
    };

    // ── Tier limit check ────────────────────────────────────────────────────
    // Tier is authoritative from admin-managed grants — caller's args.tier is
    // stored as metadata but NEVER used to enforce limits.
    let callerTier = tierFor(caller);
    let limit = switch (callerTier) {
      case (#Free)          { 1  };
      case (#Pro)           { 5  };
      case (#Premium)       { 25 };
      case (#ContractorPro) { 0  };
    };
    if (limit > 0 and countOwnerProperties(caller) >= limit) {
      let tierName = switch (callerTier) {
        case (#Free)          "Free";
        case (#Pro)           "Pro";
        case (#Premium)       "Premium";
        case (#ContractorPro) "ContractorPro";
      };
      let upgradeMsg = switch (callerTier) {
        case (#Free) " Upgrade to Pro ($9.99/mo) for 5, or Premium ($24.99/mo) for 25.";
        case (#Pro)  " Upgrade to Premium ($24.99/mo) for 25, or ContractorPro ($49.99/mo) for unlimited.";
        case _       "";
      };
      return #err(#InvalidInput(
        tierName # " plan limit of " # Nat.toText(limit) # " propert" #
        (if (limit == 1) "y" else "ies") # " reached." # upgradeMsg
      ));
    };

    let id  = nextId;
    nextId += 1;
    let now = Time.now();

    let prop : Property = {
      id;
      owner               = caller;
      address             = args.address;
      city                = args.city;
      state               = args.state;
      zipCode             = args.zipCode;
      propertyType        = args.propertyType;
      yearBuilt           = args.yearBuilt;
      squareFeet          = args.squareFeet;
      verificationLevel   = #Unverified;
      verificationDate    = null;
      verificationMethod  = null;
      verificationDocHash = null;
      tier                = callerTier;  // authoritative from admin grants, not caller's args
      createdAt           = now;
      updatedAt           = now;
      isActive            = true;
    };

    Map.add(properties, Nat.compare, id, prop);
    Map.add(addressIdx, Text.compare, key, id);
    #ok(prop)
  };

  // ─── Self-Service Verification ────────────────────────────────────────────

  /// Homeowner submits a verification document.
  ///
  /// Transitions the property from #Unverified → #PendingReview.
  /// An admin must then call verifyProperty() to approve or reject.
  ///
  /// method     : "UtilityBill" | "DeedRecord" | "TaxRecord"
  /// documentHash: SHA-256 hex digest of the uploaded document (computed
  ///               client-side before upload to off-chain storage).
  public shared(msg) func submitVerification(
    propertyId   : Nat,
    method       : Text,
    documentHash : Text
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Text.size(method)       == 0) return #err(#InvalidInput("method required"));
    if (Text.size(documentHash) == 0) return #err(#InvalidInput("documentHash required"));

    switch (Map.get(properties, Nat.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.owner != msg.caller) return #err(#NotAuthorized);

        // Already verified — no need to re-submit.
        if (isVerified(existing.verificationLevel))
          return #err(#InvalidInput("Property is already verified"));

        let updated : Property = {
          id                  = existing.id;
          owner               = existing.owner;
          address             = existing.address;
          city                = existing.city;
          state               = existing.state;
          zipCode             = existing.zipCode;
          propertyType        = existing.propertyType;
          yearBuilt           = existing.yearBuilt;
          squareFeet          = existing.squareFeet;
          verificationLevel   = #PendingReview;
          verificationDate    = existing.verificationDate;
          verificationMethod  = ?method;
          verificationDocHash = ?documentHash;
          tier                = existing.tier;
          createdAt           = existing.createdAt;
          updatedAt           = Time.now();
          isActive            = existing.isActive;
        };
        Map.add(properties, Nat.compare, propertyId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Admin Verification ───────────────────────────────────────────────────

  /// Admin approves a pending verification request, setting the level to
  /// #Basic or #Premium.  Pass level = #Unverified to reject (rolls back to
  /// unverified without clearing the submitted document hash).
  ///
  /// method is optional — supply it to override the method the homeowner
  /// declared, or leave null to keep whatever they submitted.
  public shared(msg) func verifyProperty(
    id     : Nat,
    level  : VerificationLevel,
    method : ?Text
  ) : async Result.Result<Property, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);

    switch (Map.get(properties, Nat.compare, id)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let now  = Time.now();
        let updated : Property = {
          id                  = existing.id;
          owner               = existing.owner;
          address             = existing.address;
          city                = existing.city;
          state               = existing.state;
          zipCode             = existing.zipCode;
          propertyType        = existing.propertyType;
          yearBuilt           = existing.yearBuilt;
          squareFeet          = existing.squareFeet;
          verificationLevel   = level;
          verificationDate    = if (isVerified(level)) ?now else existing.verificationDate;
          verificationMethod  = switch (method) {
            case (?m) { ?m };
            case null { existing.verificationMethod };
          };
          verificationDocHash = existing.verificationDocHash;
          tier                = existing.tier;
          createdAt           = existing.createdAt;
          updatedAt           = now;
          isActive            = existing.isActive;
        };
        Map.add(properties, Nat.compare, id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query(msg) func getMyProperties() : async [Property] {
    let caller = msg.caller;
    Iter.toArray(
      Iter.filter(Map.values(properties), func(p: Property) : Bool {
        p.owner == caller and p.isActive
      })
    )
  };

  /// 3.3.2 — Unauthenticated public read: returns all active properties owned
  /// by the given principal. Enables data portability — anyone can verify a
  /// homeowner's records using only their Internet Identity principal.
  public query func getPropertiesByOwner(owner: Principal) : async [Property] {
    Iter.toArray(
      Iter.filter(Map.values(properties), func(p: Property) : Bool {
        p.owner == owner and p.isActive
      })
    )
  };

  public query func getProperty(id: Nat) : async Result.Result<Property, Error> {
    switch (Map.get(properties, Nat.compare, id)) {
      case null  { #err(#NotFound) };
      case (?p)  { #ok(p) };
    }
  };

  /// Returns the verification level of a property as a Text string, or null
  /// if the property does not exist.
  ///
  /// Called cross-canister by the Report canister before issuing share links.
  /// Returns Text rather than VerificationLevel to keep the inter-canister
  /// interface simple and stable as new variants are added.
  public query func getVerificationLevel(id: Nat) : async ?Text {
    switch (Map.get(properties, Nat.compare, id)) {
      case null  { null };
      case (?p)  {
        ?(switch (p.verificationLevel) {
          case (#Unverified)    { "Unverified"    };
          case (#PendingReview) { "PendingReview" };
          case (#Basic)         { "Basic"         };
          case (#Premium)       { "Premium"       };
        })
      };
    }
  };

  /// Returns the owner Principal of a property, or null if not found.
  /// Called cross-canister by the Job canister (14.2.1) to verify that
  /// the homeowner stored on a sensor device actually owns the property
  /// before auto-creating a sensor-triggered job.
  public query func getPropertyOwner(id: Nat) : async ?Principal {
    switch (Map.get(properties, Nat.compare, id)) {
      case null  { null };
      case (?p)  { ?p.owner };
    }
  };

  /// Returns all properties currently awaiting admin verification review.
  public query func getPendingVerifications() : async [Property] {
    Iter.toArray(
      Iter.filter(Map.values(properties), func(p: Property) : Bool {
        p.verificationLevel == #PendingReview and p.isActive
      })
    )
  };

  /// Returns true if the given principal is an admin.
  public query func isAdminPrincipal(p: Principal) : async Bool {
    Option.isSome(Array.find<Principal>(admins, func(a) { a == p }))
  };

  // ─── Ownership Transfer ───────────────────────────────────────────────────

  /// Step 1: current owner proposes a transfer to `to`.
  /// Overwrites any existing pending transfer for this property.
  public shared(msg) func initiateTransfer(
    propertyId : Nat,
    to         : Principal
  ) : async Result.Result<PendingTransfer, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (Map.get(properties, Nat.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        if (prop.owner == to)         return #err(#InvalidInput("Cannot transfer to yourself"));

        let pending : PendingTransfer = {
          propertyId;
          from        = msg.caller;
          to;
          initiatedAt = Time.now();
        };
        Map.add(pendingTransfers, Nat.compare, propertyId, pending);
        #ok(pending)
      };
    }
  };

  /// Step 2: recipient accepts; executes the transfer and records it in the log.
  /// `txHash` is optional metadata (off-chain deed or blockchain tx id).
  public shared(msg) func acceptTransfer(
    propertyId : Nat,
    txHash     : Text
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (Map.get(pendingTransfers, Nat.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?pending) {
        if (pending.to != msg.caller) return #err(#NotAuthorized);

        switch (Map.get(properties, Nat.compare, propertyId)) {
          case null { #err(#NotFound) };
          case (?prop) {
            let now = Time.now();

            // Update property owner
            let updated : Property = {
              id                  = prop.id;
              owner               = msg.caller;
              address             = prop.address;
              city                = prop.city;
              state               = prop.state;
              zipCode             = prop.zipCode;
              propertyType        = prop.propertyType;
              yearBuilt           = prop.yearBuilt;
              squareFeet          = prop.squareFeet;
              verificationLevel   = prop.verificationLevel;
              verificationDate    = prop.verificationDate;
              verificationMethod  = prop.verificationMethod;
              verificationDocHash = prop.verificationDocHash;
              tier                = prop.tier;
              createdAt           = prop.createdAt;
              updatedAt           = now;
              isActive            = prop.isActive;
            };
            Map.add(properties, Nat.compare, propertyId, updated);

            // Append immutable transfer record
            transferCounter += 1;
            let record : TransferRecord = {
              propertyId;
              from      = pending.from;
              to        = msg.caller;
              timestamp = now;
              txHash;
            };
            Map.add(transfers, Nat.compare, transferCounter, record);

            // Clear the pending transfer
            Map.remove(pendingTransfers, Nat.compare, propertyId);

            #ok(updated)
          };
        }
      };
    }
  };

  /// Recipient (or original proposer) cancels a pending transfer.
  public shared(msg) func cancelTransfer(
    propertyId : Nat
  ) : async Result.Result<(), Error> {
    switch (Map.get(pendingTransfers, Nat.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?pending) {
        if (pending.from != msg.caller and pending.to != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
        Map.remove(pendingTransfers, Nat.compare, propertyId);
        #ok(())
      };
    }
  };

  /// Returns the pending transfer for a property, if any.
  public query func getPendingTransfer(propertyId: Nat) : async ?PendingTransfer {
    Map.get(pendingTransfers, Nat.compare, propertyId)
  };

  /// Public, unauthenticated ownership history for a property.
  /// Returns records sorted by timestamp ascending (oldest first).
  public query func getOwnershipHistory(propertyId: Nat) : async [TransferRecord] {
    let filtered = Iter.toArray(
      Iter.filter(Map.values(transfers), func(r: TransferRecord) : Bool {
        r.propertyId == propertyId
      })
    );
    // Sort ascending by timestamp
    Array.sort<TransferRecord>(filtered, func(a, b) {
      if      (a.timestamp < b.timestamp) { #less    }
      else if (a.timestamp > b.timestamp) { #greater }
      else                                { #equal   }
    })
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────

  /// Set the subscription tier for a principal.
  /// Called by an admin when a user's subscription changes.
  /// This is the only authoritative source for tier limits — callers cannot spoof.
  public shared(msg) func setTier(user: Principal, tier: SubscriptionTier) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    Map.add(tierGrants, Text.compare, Principal.toText(user), tier);
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.concat(admins, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters (job, report) bypass per-principal rate limiting. Admin only.
  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isTrustedCanister(p)) {
      trustedCanisterEntries := Array.concat(trustedCanisterEntries, [p]);
    };
    #ok(())
  };

  public shared(msg) func removeTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Array.filter<Principal>(trustedCanisterEntries, func(t) { t != p });
    #ok(())
  };

  public query func getTrustedCanisters() : async [Principal] {
    trustedCanisterEntries
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

  // ─── Metrics ──────────────────────────────────────────────────────────────

  public query func getMetrics() : async Metrics {
    var verified      = 0;
    var pendingReview = 0;
    var unverified    = 0;

    for (p in Map.values(properties)) {
      if (p.isActive) {
        switch (p.verificationLevel) {
          case (#Unverified)    { unverified    += 1 };
          case (#PendingReview) { pendingReview += 1 };
          case (#Basic or #Premium) { verified  += 1 };
        };
      };
    };

    {
      totalProperties         = Map.size(properties);
      verifiedProperties      = verified;
      pendingReviewProperties = pendingReview;
      unverifiedProperties    = unverified;
      isPaused;
    }
  };

  // ─── Builder: bulk property import ────────────────────────────────────────

  /// Batch-create properties on behalf of a Builder.
  ///
  /// • Caller must have registered with role #Builder (checked via the auth
  ///   canister in a real deployment; mocked here as a trust boundary note).
  /// • Builder-owned properties bypass the per-owner tier limit — a
  ///   development may have hundreds of units.
  /// • Each unit starts at #Unverified; verification flows normally once
  ///   the first buyer accepts the transfer.
  /// • Rows that fail duplicate-address checks are collected in `failed`;
  ///   the rest proceed — this is NOT all-or-nothing.
  public shared(msg) func bulkRegisterProperties(
    rows : [RegisterPropertyArgs]
  ) : async BulkImportResult {
    if (isPaused) { return { succeeded = []; failed = [] } };

    var succeeded : [Nat]             = [];
    var failed    : [BulkImportError] = [];

    var i = 0;
    for (args in rows.vals()) {
      // Duplicate address check (same logic as registerProperty but simplified)
      let normalised = Text.toLower(args.address # "," # args.city # "," # args.state # "," # args.zipCode);
      var duplicate = false;
      for (prop in Map.values(properties)) {
        let key = Text.toLower(prop.address # "," # prop.city # "," # prop.state # "," # prop.zipCode);
        if (key == normalised and prop.isActive) { duplicate := true };
      };

      if (duplicate) {
        failed := Array.concat(failed, [{ index = i; reason = "DuplicateAddress" }]);
      } else {
        let newId = nextId;
        nextId += 1;
        let now = Time.now();
        let prop : Property = {
          id                  = newId;
          owner               = msg.caller;
          address             = args.address;
          city                = args.city;
          state               = args.state;
          zipCode             = args.zipCode;
          propertyType        = args.propertyType;
          yearBuilt           = args.yearBuilt;
          squareFeet          = args.squareFeet;
          verificationLevel   = #Unverified;
          verificationDate    = null;
          verificationMethod  = null;
          verificationDocHash = null;
          tier                = #ContractorPro; // builders get unlimited tier
          createdAt           = now;
          updatedAt           = now;
          isActive            = true;
        };
        Map.add(properties, Nat.compare, newId, prop);
        succeeded := Array.concat(succeeded, [newId]);
      };
      i += 1;
    };

    { succeeded; failed }
  };

  // ─── Room / Fixture CRUD (merged from room canister) ─────────────────────

  private func nextRoomId() : Text {
    roomCounter += 1;
    "ROOM_" # Nat.toText(roomCounter)
  };

  private func nextFixtureId() : Text {
    fixtureCounter += 1;
    "FIX_" # Nat.toText(fixtureCounter)
  };

  /// Create a new room for a property. Caller becomes the owner.
  public shared(msg) func createRoom(args: CreateRoomArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(args.propertyId) == 0)   return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(args.name)       == 0)   return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)       > 100)  return #err(#InvalidInput("name exceeds 100 characters"));
    if (Text.size(args.floorType)  > 100)  return #err(#InvalidInput("floorType exceeds 100 characters"));
    if (Text.size(args.paintColor) > 100)  return #err(#InvalidInput("paintColor exceeds 100 characters"));
    if (Text.size(args.paintBrand) > 100)  return #err(#InvalidInput("paintBrand exceeds 100 characters"));
    if (Text.size(args.paintCode)  > 50)   return #err(#InvalidInput("paintCode exceeds 50 characters"));
    if (Text.size(args.notes)      > 2000) return #err(#InvalidInput("notes exceed 2000 characters"));

    let now = Time.now();
    let room : RoomRecord = {
      id         = nextRoomId();
      propertyId = args.propertyId;
      owner      = msg.caller;
      name       = args.name;
      floorType  = args.floorType;
      paintColor = args.paintColor;
      paintBrand = args.paintBrand;
      paintCode  = args.paintCode;
      notes      = args.notes;
      fixtures   = [];
      createdAt  = now;
      updatedAt  = now;
    };
    Map.add(rooms, Text.compare, room.id, room);
    #ok(room)
  };

  /// Fetch a single room by ID.
  public query func getRoom(id: Text) : async Result.Result<RoomRecord, Error> {
    switch (Map.get(rooms, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?r)  { #ok(r) };
    }
  };

  /// Fetch all rooms for a property.
  public query func getRoomsByProperty(propertyId: Text) : async [RoomRecord] {
    Iter.toArray(
      Iter.filter(Map.values(rooms), func(r: RoomRecord) : Bool { r.propertyId == propertyId })
    )
  };

  /// Update room metadata. Only the owner may update.
  public shared(msg) func updateRoom(id: Text, args: UpdateRoomArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.owner != msg.caller) return #err(#NotAuthorized);
        if (Text.size(args.name)       == 0)   return #err(#InvalidInput("name cannot be empty"));
        if (Text.size(args.name)       > 100)  return #err(#InvalidInput("name exceeds 100 characters"));
        if (Text.size(args.floorType)  > 100)  return #err(#InvalidInput("floorType exceeds 100 characters"));
        if (Text.size(args.paintColor) > 100)  return #err(#InvalidInput("paintColor exceeds 100 characters"));
        if (Text.size(args.paintBrand) > 100)  return #err(#InvalidInput("paintBrand exceeds 100 characters"));
        if (Text.size(args.paintCode)  > 50)   return #err(#InvalidInput("paintCode exceeds 50 characters"));
        if (Text.size(args.notes)      > 2000) return #err(#InvalidInput("notes exceed 2000 characters"));

        let updated : RoomRecord = {
          id         = existing.id;
          propertyId = existing.propertyId;
          owner      = existing.owner;
          name       = args.name;
          floorType  = args.floorType;
          paintColor = args.paintColor;
          paintBrand = args.paintBrand;
          paintCode  = args.paintCode;
          notes      = args.notes;
          fixtures   = existing.fixtures;
          createdAt  = existing.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  /// Delete a room and all its fixtures. Only the owner may delete.
  public shared(msg) func deleteRoom(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, id)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#NotAuthorized);
        Map.remove(rooms, Text.compare, id);
        #ok(())
      };
    }
  };

  /// Add a fixture to a room. Only the room owner may add fixtures.
  public shared(msg) func addFixture(roomId: Text, args: AddFixtureArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#NotAuthorized);
        if (Text.size(args.brand)          > 100)  return #err(#InvalidInput("brand exceeds 100 characters"));
        if (Text.size(args.model)          > 100)  return #err(#InvalidInput("model exceeds 100 characters"));
        if (Text.size(args.serialNumber)   > 100)  return #err(#InvalidInput("serialNumber exceeds 100 characters"));
        if (Text.size(args.installedDate)  > 20)   return #err(#InvalidInput("installedDate exceeds 20 characters"));
        if (Text.size(args.warrantyExpiry) > 20)   return #err(#InvalidInput("warrantyExpiry exceeds 20 characters"));
        if (Text.size(args.notes)          > 1000) return #err(#InvalidInput("notes exceed 1000 characters"));

        let fixture : Fixture = {
          id             = nextFixtureId();
          brand          = args.brand;
          model          = args.model;
          serialNumber   = args.serialNumber;
          installedDate  = args.installedDate;
          warrantyExpiry = args.warrantyExpiry;
          notes          = args.notes;
        };
        let updated : RoomRecord = {
          id         = room.id;
          propertyId = room.propertyId;
          owner      = room.owner;
          name       = room.name;
          floorType  = room.floorType;
          paintColor = room.paintColor;
          paintBrand = room.paintBrand;
          paintCode  = room.paintCode;
          notes      = room.notes;
          fixtures   = Array.concat(room.fixtures, [fixture]);
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, roomId, updated);
        #ok(updated)
      };
    }
  };

  /// Update an existing fixture within a room.
  public shared(msg) func updateFixture(roomId: Text, fixtureId: Text, args: AddFixtureArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#NotAuthorized);
        if (Text.size(args.brand)          > 100)  return #err(#InvalidInput("brand exceeds 100 characters"));
        if (Text.size(args.model)          > 100)  return #err(#InvalidInput("model exceeds 100 characters"));
        if (Text.size(args.serialNumber)   > 100)  return #err(#InvalidInput("serialNumber exceeds 100 characters"));
        if (Text.size(args.installedDate)  > 20)   return #err(#InvalidInput("installedDate exceeds 20 characters"));
        if (Text.size(args.warrantyExpiry) > 20)   return #err(#InvalidInput("warrantyExpiry exceeds 20 characters"));
        if (Text.size(args.notes)          > 1000) return #err(#InvalidInput("notes exceed 1000 characters"));

        let found = Array.find<Fixture>(room.fixtures, func(f) { f.id == fixtureId });
        switch (found) {
          case null { return #err(#NotFound) };
          case _    {};
        };

        let updatedFixtures = Array.map<Fixture, Fixture>(room.fixtures, func(f) {
          if (f.id != fixtureId) { f } else {
            {
              id             = f.id;
              brand          = args.brand;
              model          = args.model;
              serialNumber   = args.serialNumber;
              installedDate  = args.installedDate;
              warrantyExpiry = args.warrantyExpiry;
              notes          = args.notes;
            }
          }
        });
        let updated : RoomRecord = {
          id         = room.id;
          propertyId = room.propertyId;
          owner      = room.owner;
          name       = room.name;
          floorType  = room.floorType;
          paintColor = room.paintColor;
          paintBrand = room.paintBrand;
          paintCode  = room.paintCode;
          notes      = room.notes;
          fixtures   = updatedFixtures;
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, roomId, updated);
        #ok(updated)
      };
    }
  };

  /// Remove a fixture from a room.
  public shared(msg) func removeFixture(roomId: Text, fixtureId: Text) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#NotAuthorized);
        let updated : RoomRecord = {
          id         = room.id;
          propertyId = room.propertyId;
          owner      = room.owner;
          name       = room.name;
          floorType  = room.floorType;
          paintColor = room.paintColor;
          paintBrand = room.paintBrand;
          paintCode  = room.paintCode;
          notes      = room.notes;
          fixtures   = Array.filter<Fixture>(room.fixtures, func(f) { f.id != fixtureId });
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, roomId, updated);
        #ok(updated)
      };
    }
  };

  /// Room-level metrics (total rooms and fixtures across all properties).
  public query func getRoomMetrics() : async RoomMetrics {
    var totalFixtures = 0;
    for (r in Map.values(rooms)) {
      totalFixtures += r.fixtures.size();
    };
    {
      totalRooms    = Map.size(rooms);
      totalFixtures;
    }
  };
}
