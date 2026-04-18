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
import Blob      "mo:core/Blob";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Nat8      "mo:core/Nat8";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Random    "mo:core/Random";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Property {

  // ─── Constants ────────────────────────────────────────────────────────────

  /// Nanoseconds in 7 days — the conflict resolution window.
  private let SEVEN_DAYS_NS   : Int = 7  * 24 * 3600 * 1_000_000_000;
  /// Nanoseconds in 90 days — the property transfer link expiry window.
  private let NINETY_DAYS_NS  : Int = 90 * 24 * 3600 * 1_000_000_000;

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
    #Free;             // unsubscribed sentinel — 0 properties (blocked)
    #Basic;            // 1 property
    #Pro;              // 5 properties
    #Premium;          // 20 properties
    #ContractorFree;   // 0 properties — contractors work on others' properties
    #ContractorPro;    // unlimited
  };

  /// Full on-chain property record.
  ///
  /// verificationDate / verificationMethod / verificationDocHash are null
  /// until the owner submits verification documents.  Making them optional
  /// keeps canister upgrades backward-compatible.
  public type Property = {
    id                  : Text;
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
    succeeded : [Text];           // property IDs created
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

  // ─── Delegated Management Types ──────────────────────────────────────────

  /// Access level granted to a delegated manager.
  ///
  ///  #Viewer  — read-only: can view all data but cannot make changes.
  ///  #Manager — operational: can add/edit jobs, approve proposals,
  ///             manage rooms/fixtures, upload photos, record bills.
  ///             Cannot transfer the property or manage other managers.
  public type ManagerRole = { #Viewer; #Manager };

  /// A principal that has been granted delegated access to a property.
  public type PropertyManager = {
    principal   : Principal;
    role        : ManagerRole;
    /// Free-text display name set by the owner (e.g. "Sarah - daughter").
    displayName : Text;
    addedAt     : Time.Time;
  };

  /// Pending manager invite — claimed by the invitee via bearer token.
  public type ManagerInvite = {
    propertyId  : Text;
    token       : Text;
    role        : ManagerRole;
    displayName : Text;       // pre-filled name the owner sets
    invitedBy   : Principal;
    createdAt   : Time.Time;
    expiresAt   : Time.Time;
  };

  /// A notification pushed to the property owner when a manager performs
  /// a significant write action (job approval, large expense, etc.).
  public type OwnerNotification = {
    id              : Nat;
    managerPrincipal : Principal;
    managerName      : Text;
    description      : Text;
    timestamp        : Time.Time;
    seen             : Bool;
  };

  // ─── Ownership History Types ──────────────────────────────────────────────

  /// Immutable record of a single ownership transfer event.
  public type TransferRecord = {
    propertyId : Text;
    from       : Principal;
    to         : Principal;
    timestamp  : Time.Time;
    /// Optional hash / txid from an off-chain deed recording or blockchain tx.
    /// Empty string when not provided.
    txHash     : Text;
  };

  /// Pending transfer awaiting claim via bearer token.
  ///
  /// The seller calls initiateTransfer() and receives a URL-safe token.
  /// Any principal that presents the token before expiresAt can claim
  /// the property — no prior knowledge of the buyer's principal needed.
  public type PendingTransfer = {
    propertyId  : Text;
    from        : Principal;
    token       : Text;        // bearer token embedded in the claim URL
    initiatedAt : Time.Time;
    expiresAt   : Time.Time;   // initiatedAt + NINETY_DAYS_NS
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
    floorName:   Text;   // floor/level label e.g. "First Floor", "Basement", "2", "L3"
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
    floorName:  Text;
    floorType:  Text;
    paintColor: Text;
    paintBrand: Text;
    paintCode:  Text;
    notes:      Text;
  };

  public type UpdateRoomArgs = {
    name:       Text;
    floorName:  Text;
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

  private var isPaused          : Bool        = false;
  private var pauseExpiryNs     : ?Int        = null;
  private var admins                   : [Principal] = [];
  private var adminInitialized         : Bool        = false;
  private var trustedCanisterEntries   : [Principal] = [];
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  /// When set, registerProperty() cross-calls getTierForPrincipal() instead of
  /// reading the local tierGrants map.
  private var payCanisterId            : Text        = "";

  private var transferCounter        : Nat                            = 0;

  // Room state
  private var roomCounter    : Nat                  = 0;
  private var fixtureCounter : Nat                  = 0;

  // ─── Stable State ────────────────────────────────────────────────────────

  private let properties      = Map.empty<Text, Property>();
  /// Address key → property ID.
  private let addressIdx      = Map.empty<Text, Text>();
  private let tierGrants      = Map.empty<Text, SubscriptionTier>();
  /// Transfer history keyed by transferCounter (Nat).
  private let transfers        = Map.empty<Nat, TransferRecord>();
  private let pendingTransfers = Map.empty<Text, PendingTransfer>();
  /// token (Text) → propertyId (Text) — secondary index for O(1) claim lookup.
  private let tokenIndex       = Map.empty<Text, Text>();
  private let rooms            = Map.empty<Text, RoomRecord>();

  // ─── Manager delegation state ────────────────────────────────────────────
  /// propertyId → [PropertyManager]
  private let managersMap      = Map.empty<Text, [PropertyManager]>();
  /// token → ManagerInvite (pending invites)
  private let managerInvites   = Map.empty<Text, ManagerInvite>();
  /// token → propertyId (fast invite lookup)
  private let managerTokenIdx  = Map.empty<Text, Text>();
  /// propertyId → [OwnerNotification]
  private let ownerNotifs      = Map.empty<Text, [OwnerNotification]>();
  private var notifCounter     : Nat = 0;

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /// Convert a Blob to a lowercase hex string.
  private func blobToHex(b : Blob) : Text {
    let hex   = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    let bytes = Blob.toArray(b);
    var result = "";
    for (byte in bytes.vals()) {
      let n = Nat8.toNat(byte);
      result := result # Text.fromChar(hex[n / 16]) # Text.fromChar(hex[n % 16]);
    };
    result
  };

  /// Generate a cryptographically random property ID.
  /// Uses IC certified randomness — IDs are unguessable and non-sequential.
  private func nextPropertyId() : async Text {
    let randBytes = await Random.blob();
    "PROP_" # blobToHex(randBytes)
  };

  /// Returns true if `caller` is the property owner OR an authorised manager.
  /// When `requireWrite` is true, a #Viewer manager is not sufficient.
  private func checkAuthorized(propertyId: Text, caller: Principal, requireWrite: Bool) : Bool {
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null false;
      case (?prop) {
        if (prop.owner == caller) return true;
        let mgrs = switch (Map.get(managersMap, Text.compare, propertyId)) {
          case null    [];
          case (?list) list;
        };
        for (m in mgrs.vals()) {
          if (m.principal == caller) {
            if (requireWrite) { return m.role == #Manager };
            return true;
          };
        };
        false
      };
    }
  };

  /// Append a notification to the owner's queue for the given property.
  private func pushNotification(propertyId: Text, managerP: Principal, managerN: Text, desc: Text) {
    notifCounter += 1;
    let notif : OwnerNotification = {
      id               = notifCounter;
      managerPrincipal = managerP;
      managerName      = managerN;
      description      = desc;
      timestamp        = Time.now();
      seen             = false;
    };
    let existing = switch (Map.get(ownerNotifs, Text.compare, propertyId)) {
      case null    [];
      case (?list) list;
    };
    Map.add(ownerNotifs, Text.compare, propertyId, Array.concat<OwnerNotification>(existing, [notif]));
  };

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private transient let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
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
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
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
      case (#Free)             { 0  };  // blocked — unsubscribed
      case (#Basic)            { 1  };
      case (#Pro)              { 5  };
      case (#Premium)          { 20 };
      case (#ContractorFree)   { 0  };  // contractors don't own properties
      case (#ContractorPro)    { 0  };  // 0 = unlimited (ContractorPro)
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
    let currentYear = Int.abs(Time.now()) / 1_000_000_000 / 31_536_000 + 1970;
    if (args.yearBuilt < 1900 or args.yearBuilt > currentYear)
      return #err(#InvalidInput("Year built must be between 1900 and " # Nat.toText(currentYear)));

    let caller = msg.caller;
    let key    = addressKey(args.address, args.city, args.state, args.zipCode);

    // ── Duplicate address check ──────────────────────────────────────────────
    switch (Map.get(addressIdx, Text.compare, key)) {
      case (?existingId) {
        switch (Map.get(properties, Text.compare, existingId)) {
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
    // When payment canister is wired, tier comes from getTierForPrincipal();
    // otherwise falls back to the local admin-grant map.
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = actor(payCanisterId) : actor {
        getTierForPrincipal : (Principal) -> async { #Free; #Basic; #Pro; #Premium; #ContractorFree; #ContractorPro };
      };
      await payActor.getTierForPrincipal(caller)
    } else {
      tierFor(caller)
    };
    let limit = switch (callerTier) {
      case (#Free)             { 0  };  // blocked — unsubscribed
      case (#Basic)            { 1  };
      case (#Pro)              { 5  };
      case (#Premium)          { 20 };
      case (#ContractorFree)   { 0  };  // contractors don't own properties
      case (#ContractorPro)    { 0  };  // 0 = unlimited (ContractorPro)
    };
    if (callerTier == #Free or callerTier == #ContractorFree or (limit > 0 and countOwnerProperties(caller) >= limit)) {
      let tierName = switch (callerTier) {
        case (#Free)             "Free";
        case (#Basic)            "Basic";
        case (#Pro)              "Pro";
        case (#Premium)          "Premium";
        case (#ContractorFree)   "ContractorFree";
        case (#ContractorPro)    "ContractorPro";
      };
      let upgradeMsg = switch (callerTier) {
        case (#Free)  " Subscribe to Basic ($10/mo) for 1 property, or Pro ($20/mo) for 5.";
        case (#Basic) " Upgrade to Pro ($20/mo) for 5, or Premium ($35/mo) for 20.";
        case (#Pro)   " Upgrade to Premium ($35/mo) for 20, or ContractorPro ($30/mo) for unlimited.";
        case _        "";
      };
      return #err(#InvalidInput(
        tierName # " plan limit of " # Nat.toText(limit) # " propert" #
        (if (limit == 1) "y" else "ies") # " reached." # upgradeMsg
      ));
    };

    let now = Time.now();
    let id  = await nextPropertyId();

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

    Map.add(properties, Text.compare, id, prop);
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
    propertyId   : Text,
    method       : Text,
    documentHash : Text
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Text.size(method)       == 0) return #err(#InvalidInput("method required"));
    if (Text.size(documentHash) == 0) return #err(#InvalidInput("documentHash required"));

    switch (Map.get(properties, Text.compare, propertyId)) {
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
        Map.add(properties, Text.compare, propertyId, updated);
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
    id     : Text,
    level  : VerificationLevel,
    method : ?Text
  ) : async Result.Result<Property, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);

    switch (Map.get(properties, Text.compare, id)) {
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
        Map.add(properties, Text.compare, id, updated);
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

  public query func getProperty(id: Text) : async Result.Result<Property, Error> {
    switch (Map.get(properties, Text.compare, id)) {
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
  public query func getVerificationLevel(id: Text) : async ?Text {
    switch (Map.get(properties, Text.compare, id)) {
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
  public query func getPropertyOwner(id: Text) : async ?Principal {
    switch (Map.get(properties, Text.compare, id)) {
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

  // ─── Ownership Transfer (Option B — bearer-token link) ───────────────────
  //
  //  Flow:
  //   1. Seller calls initiateTransfer(propertyId).
  //      Returns a PendingTransfer containing a unique token.
  //      Seller embeds the token in a URL: /transfer/claim/<token>
  //   2. Buyer opens the URL (no prior HomeGentic account required to preview).
  //      Buyer calls claimTransfer(token) after signing in.
  //      Ownership is transferred on-chain; transfer is recorded in history.
  //   3. Seller (or admin) can call cancelTransfer(propertyId) at any time
  //      before the token is claimed.
  //
  //  Tokens expire after NINETY_DAYS_NS from creation.

  /// Step 1: seller generates a bearer token for this property.
  /// Overwrites any existing pending transfer (idempotent for re-sharing).
  public shared(msg) func initiateTransfer(
    propertyId : Text
  ) : async Result.Result<PendingTransfer, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);

        let now = Time.now();
        // Generate a unique URL-safe token from nanosecond timestamp + counter.
        // Collision probability is negligible: counter is per-canister-unique and
        // the timestamp has nanosecond resolution.
        transferCounter += 1;
        let token : Text = Int.toText(Int.abs(now)) # "-" # Nat.toText(transferCounter);

        // Remove previous token from secondary index if one existed
        switch (Map.get(pendingTransfers, Text.compare, propertyId)) {
          case (?old) { Map.remove(tokenIndex, Text.compare, old.token) };
          case null   {};
        };

        let pending : PendingTransfer = {
          propertyId;
          from        = msg.caller;
          token;
          initiatedAt = now;
          expiresAt   = now + NINETY_DAYS_NS;
        };
        Map.add(pendingTransfers, Text.compare, propertyId, pending);
        Map.add(tokenIndex,       Text.compare, token,      propertyId);
        #ok(pending)
      };
    }
  };

  /// Step 2: any authenticated principal with the token claims the property.
  /// The token acts as a bearer credential — possession equals authorization.
  public shared(msg) func claimTransfer(
    token : Text
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (Map.get(tokenIndex, Text.compare, token)) {
      case null { #err(#NotFound) };
      case (?propertyId) {
        switch (Map.get(pendingTransfers, Text.compare, propertyId)) {
          case null { #err(#NotFound) };
          case (?pending) {
            if (pending.token != token) return #err(#NotFound);

            if (Time.now() > pending.expiresAt) {
              // Expired — clean up and surface a clear error
              Map.remove(pendingTransfers, Text.compare, propertyId);
              Map.remove(tokenIndex,       Text.compare, token);
              return #err(#InvalidInput("Transfer link has expired. Ask the seller to generate a new one."));
            };

            if (pending.from == msg.caller) {
              return #err(#InvalidInput("Cannot claim your own property transfer."));
            };

            switch (Map.get(properties, Text.compare, propertyId)) {
              case null { #err(#NotFound) };
              case (?prop) {
                let now = Time.now();

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
                Map.add(properties, Text.compare, propertyId, updated);

                // Append immutable record to ownership history
                let record : TransferRecord = {
                  propertyId;
                  from      = pending.from;
                  to        = msg.caller;
                  timestamp = now;
                  txHash    = "";  // no off-chain hash for token-based transfers
                };
                Map.add(transfers, Nat.compare, transferCounter, record);

                // Invalidate token
                Map.remove(pendingTransfers, Text.compare, propertyId);
                Map.remove(tokenIndex,       Text.compare, token);

                #ok(updated)
              };
            }
          };
        }
      };
    }
  };

  /// Seller (or admin) cancels a pending transfer and invalidates the token.
  public shared(msg) func cancelTransfer(
    propertyId : Text
  ) : async Result.Result<(), Error> {
    switch (Map.get(pendingTransfers, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?pending) {
        if (pending.from != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
        Map.remove(tokenIndex,       Text.compare, pending.token);
        Map.remove(pendingTransfers, Text.compare, propertyId);
        #ok(())
      };
    }
  };

  /// Returns the pending transfer for a property, if any.
  public query func getPendingTransfer(propertyId: Text) : async ?PendingTransfer {
    Map.get(pendingTransfers, Text.compare, propertyId)
  };

  /// Looks up a pending transfer by its bearer token.
  /// Used by the claim page to display property details before the buyer logs in.
  public query func getPendingTransferByToken(token: Text) : async ?PendingTransfer {
    switch (Map.get(tokenIndex, Text.compare, token)) {
      case null          null;
      case (?propertyId) Map.get(pendingTransfers, Text.compare, propertyId);
    }
  };

  /// Public, unauthenticated ownership history for a property.
  /// Returns records sorted by timestamp ascending (oldest first).
  public query func getOwnershipHistory(propertyId: Text) : async [TransferRecord] {
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

  // ─── Delegated Management ─────────────────────────────────────────────────
  //
  //  Flow:
  //   1. Owner calls inviteManager(propertyId, role, displayName).
  //      Returns a ManagerInvite with a bearer token.
  //      Owner shares the URL /manage/claim/<token> with the invitee.
  //   2. Invitee opens the URL, logs in, calls claimManagerRole(token).
  //      They are added to the property's managers list with the chosen role.
  //   3. Owner can later updateManagerRole(), removeManager(), or the manager
  //      can call resignAsManager().
  //   4. When a Manager-role user performs a significant write action, the
  //      frontend calls recordManagerActivity() to notify the owner.

  /// Step 1: owner generates a bearer-token invite for a manager.
  /// Overwrites any existing invite for the same property+role combination.
  public shared(msg) func inviteManager(
    propertyId  : Text,
    role        : ManagerRole,
    displayName : Text
  ) : async Result.Result<ManagerInvite, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        if (Text.size(displayName) == 0) return #err(#InvalidInput("Display name is required."));

        let now = Time.now();
        transferCounter += 1;
        let token : Text = Int.toText(Int.abs(now)) # "-m-" # Nat.toText(transferCounter);

        let invite : ManagerInvite = {
          propertyId;
          token;
          role;
          displayName;
          invitedBy = msg.caller;
          createdAt = now;
          expiresAt = now + NINETY_DAYS_NS;
        };
        Map.add(managerInvites,  Text.compare, token,      invite);
        Map.add(managerTokenIdx, Text.compare, token,      propertyId);
        #ok(invite)
      };
    }
  };

  /// Step 2: invitee claims manager access using the bearer token.
  public shared(msg) func claimManagerRole(
    token : Text
  ) : async Result.Result<{ propertyId: Text; role: ManagerRole }, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (Map.get(managerInvites, Text.compare, token)) {
      case null { #err(#NotFound) };
      case (?invite) {
        if (Time.now() > invite.expiresAt) {
          Map.remove(managerInvites,  Text.compare, token);
          Map.remove(managerTokenIdx, Text.compare, token);
          return #err(#InvalidInput("Invite link has expired."));
        };
        switch (Map.get(properties, Text.compare, invite.propertyId)) {
          case null { #err(#NotFound) };
          case (?prop) {
            if (prop.owner == msg.caller) {
              return #err(#InvalidInput("You already own this property."));
            };
            // Prevent duplicates — remove existing entry for this principal if any
            let existing = switch (Map.get(managersMap, Text.compare, invite.propertyId)) {
              case null    [];
              case (?list) list;
            };
            let filtered = Array.filter<PropertyManager>(existing, func(m) {
              m.principal != msg.caller
            });
            let newMgr : PropertyManager = {
              principal   = msg.caller;
              role        = invite.role;
              displayName = invite.displayName;
              addedAt     = Time.now();
            };
            Map.add(managersMap, Text.compare, invite.propertyId,
              Array.concat<PropertyManager>(filtered, [newMgr]));
            // Consume the token
            Map.remove(managerInvites,  Text.compare, token);
            Map.remove(managerTokenIdx, Text.compare, token);
            #ok({ propertyId = invite.propertyId; role = invite.role })
          };
        }
      };
    }
  };

  /// Owner changes an existing manager's role (Viewer ↔ Manager).
  public shared(msg) func updateManagerRole(
    propertyId       : Text,
    managerPrincipal : Principal,
    newRole          : ManagerRole
  ) : async Result.Result<(), Error> {
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let existing = switch (Map.get(managersMap, Text.compare, propertyId)) {
          case null    return #err(#NotFound);
          case (?list) list;
        };
        // Check the manager exists before updating
        let found = Array.find<PropertyManager>(existing, func(m) { m.principal == managerPrincipal });
        switch found {
          case null return #err(#NotFound);
          case _ {};
        };
        let updated = Array.map<PropertyManager, PropertyManager>(existing, func(m) {
          if (m.principal == managerPrincipal) { { m with role = newRole } } else m
        });
        Map.add(managersMap, Text.compare, propertyId, updated);
        #ok(())
      };
    }
  };

  /// Owner removes a manager from a property.
  public shared(msg) func removeManager(
    propertyId       : Text,
    managerPrincipal : Principal
  ) : async Result.Result<(), Error> {
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let existing = switch (Map.get(managersMap, Text.compare, propertyId)) {
          case null    return #err(#NotFound);
          case (?list) list;
        };
        let filtered = Array.filter<PropertyManager>(existing, func(m) {
          m.principal != managerPrincipal
        });
        Map.add(managersMap, Text.compare, propertyId, filtered);
        #ok(())
      };
    }
  };

  /// Manager voluntarily removes themselves.
  public shared(msg) func resignAsManager(
    propertyId : Text
  ) : async Result.Result<(), Error> {
    let existing = switch (Map.get(managersMap, Text.compare, propertyId)) {
      case null    return #err(#NotFound);
      case (?list) list;
    };
    let filtered = Array.filter<PropertyManager>(existing, func(m) {
      m.principal != msg.caller
    });
    if (filtered.size() == existing.size()) return #err(#NotFound);
    Map.add(managersMap, Text.compare, propertyId, filtered);
    #ok(())
  };

  /// Returns all properties where the caller has been granted manager access.
  public query(msg) func getMyManagedProperties() : async [{ property: Property; role: ManagerRole }] {
    var result : [{ property: Property; role: ManagerRole }] = [];
    for ((propId, mgrs) in Map.entries(managersMap)) {
      for (m in mgrs.vals()) {
        if (m.principal == msg.caller) {
          switch (Map.get(properties, Text.compare, propId)) {
            case null {};
            case (?prop) {
              result := Array.concat<{ property: Property; role: ManagerRole }>(result, [{ property = prop; role = m.role }]);
            };
          };
        };
      };
    };
    result
  };

  /// Returns the managers for a property.
  /// Only the owner may call this.
  public query(msg) func getPropertyManagers(propertyId: Text) : async Result.Result<[PropertyManager], Error> {
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let mgrs = switch (Map.get(managersMap, Text.compare, propertyId)) {
          case null    [];
          case (?list) list;
        };
        #ok(mgrs)
      };
    }
  };

  /// Look up a pending manager invite by token — used by the claim page
  /// to display context before the invitee logs in (unauthenticated query).
  public query func getManagerInviteByToken(token: Text) : async ?ManagerInvite {
    Map.get(managerInvites, Text.compare, token)
  };

  /// Called by a Manager-role user (via the frontend) after completing a
  /// significant write action to notify the property owner.
  public shared(msg) func recordManagerActivity(
    propertyId  : Text,
    description : Text
  ) : async Result.Result<(), Error> {
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    // Resolve manager's display name for the notification
    let managerName : Text = switch (Map.get(managersMap, Text.compare, propertyId)) {
      case null "A manager";
      case (?mgrs) {
        var found = "A manager";
        for (m in mgrs.vals()) {
          if (m.principal == msg.caller) found := m.displayName;
        };
        found
      };
    };
    pushNotification(propertyId, msg.caller, managerName, description);
    #ok(())
  };

  /// Returns unseen (and recently seen) owner notifications for a property.
  /// Newest first. Only the property owner may call this.
  public query(msg) func getOwnerNotifications(
    propertyId : Text
  ) : async Result.Result<[OwnerNotification], Error> {
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let notifs = switch (Map.get(ownerNotifs, Text.compare, propertyId)) {
          case null    [];
          case (?list) list;
        };
        // Return newest first
        let sorted = Array.sort<OwnerNotification>(notifs, func(a, b) {
          if      (a.timestamp > b.timestamp) #less
          else if (a.timestamp < b.timestamp) #greater
          else                                #equal
        });
        #ok(sorted)
      };
    }
  };

  /// Owner dismisses all notifications for a property (marks as seen + clears).
  public shared(msg) func dismissNotifications(
    propertyId : Text
  ) : async Result.Result<(), Error> {
    switch (Map.get(properties, Text.compare, propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        Map.add(ownerNotifs, Text.compare, propertyId, []);
        #ok(())
      };
    }
  };

  /// Public query: returns true if `caller` is the owner OR an authorised manager.
  /// `requireWrite` = true means #Viewer role is not sufficient.
  /// Called cross-canister by job, photo, quote, etc. canisters for auth checks.
  // TODO: update job/photo/quote/maintenance canisters to call this instead of
  //       checking caller == owner directly.
  public query func isAuthorized(
    propertyId  : Text,
    caller      : Principal,
    requireWrite : Bool
  ) : async Bool {
    checkAuthorized(propertyId, caller, requireWrite)
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

  /// Wire the property canister to the payment canister for live tier enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := Principal.toText(id);
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
    if (isPaused)                  { return { succeeded = []; failed = [] } };
    if (not isAdmin(msg.caller))   { return { succeeded = []; failed = [] } };

    var succeeded : [Text]            = [];
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
        let now   = Time.now();
        let newId = await nextPropertyId();
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
        Map.add(properties, Text.compare, newId, prop);
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

    if (Text.size(args.propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (not checkAuthorized(args.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Text.size(args.name)       == 0)   return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)       > 100)  return #err(#InvalidInput("name exceeds 100 characters"));
    if (Text.size(args.floorName)  > 100)  return #err(#InvalidInput("floorName exceeds 100 characters"));
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
      floorName  = args.floorName;
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
        if (Text.size(args.floorName)  > 100)  return #err(#InvalidInput("floorName exceeds 100 characters"));
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
          floorName  = args.floorName;
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
          floorName  = room.floorName;
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
          floorName  = room.floorName;
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
          floorName  = room.floorName;
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
