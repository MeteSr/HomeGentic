/**
 * HomeFax Property Canister
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

import Array     "mo:base/Array";
import HashMap   "mo:base/HashMap";
import Hash      "mo:base/Hash";
import Int       "mo:base/Int";
import Iter      "mo:base/Iter";
import Nat       "mo:base/Nat";
import Option    "mo:base/Option";
import Principal "mo:base/Principal";
import Result    "mo:base/Result";
import Text      "mo:base/Text";
import Time      "mo:base/Time";

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

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var nextId     : Nat       = 1;
  private var isPaused          : Bool        = false;
  private var admins            : [Principal] = [];
  private var adminInitialized  : Bool        = false;

  private var propertyEntries  : [(Nat, Property)] = [];
  /// Maps normalised address key → property ID of the first registrant.
  private var addressIdxEntries : [(Text, Nat)]     = [];
  /// Admin-managed tier grants keyed by principal text.
  /// Default (missing) → #Free.  Callers cannot supply or spoof their own tier.
  private var tierGrantEntries  : [(Text, SubscriptionTier)] = [];
  /// Append-only ownership transfer log. Key is auto-incrementing transfer ID.
  private var transferCounter   : Nat = 0;
  private var transferEntries   : [(Nat, TransferRecord)]    = [];
  /// Pending transfers keyed by propertyId. At most one pending transfer per property.
  private var pendingTransferEntries : [(Nat, PendingTransfer)] = [];

  // ─── Transient State ──────────────────────────────────────────────────────

  private transient var properties = HashMap.fromIter<Nat, Property>(
    propertyEntries.vals(), 16, Nat.equal, Hash.hash
  );

  /// Address key → first-registered property ID.
  /// Used for duplicate detection and conflict resolution.
  private transient var addressIdx = HashMap.fromIter<Text, Nat>(
    addressIdxEntries.vals(), 16, Text.equal, Text.hash
  );

  private transient var tierGrants = HashMap.fromIter<Text, SubscriptionTier>(
    tierGrantEntries.vals(), 16, Text.equal, Text.hash
  );

  private transient var transfers = HashMap.fromIter<Nat, TransferRecord>(
    transferEntries.vals(), 16, Nat.equal, Hash.hash
  );

  private transient var pendingTransfers = HashMap.fromIter<Nat, PendingTransfer>(
    pendingTransferEntries.vals(), 8, Nat.equal, Hash.hash
  );

  // ─── Upgrade Hooks ────────────────────────────────────────────────────────

  system func preupgrade() {
    propertyEntries        := Iter.toArray(properties.entries());
    addressIdxEntries      := Iter.toArray(addressIdx.entries());
    tierGrantEntries       := Iter.toArray(tierGrants.entries());
    transferEntries        := Iter.toArray(transfers.entries());
    pendingTransferEntries := Iter.toArray(pendingTransfers.entries());
  };

  system func postupgrade() {
    propertyEntries        := [];
    addressIdxEntries      := [];
    tierGrantEntries       := [];
    transferEntries        := [];
    pendingTransferEntries := [];
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(admins, func(a) { a == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) #err(#Paused) else #ok(())
  };

  private func countOwnerProperties(owner: Principal) : Nat {
    var n = 0;
    for (p in properties.vals()) {
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
    switch (tierGrants.get(Principal.toText(p))) {
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
    switch (requireActive()) { case (#err e) return #err e; case _ {} };

    if (Text.size(args.address) == 0)
      return #err(#InvalidInput("Address cannot be empty"));

    let caller = msg.caller;
    let key    = addressKey(args.address, args.city, args.state, args.zipCode);

    // ── Duplicate address check ──────────────────────────────────────────────
    switch (addressIdx.get(key)) {
      case (?existingId) {
        switch (properties.get(existingId)) {
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

    properties.put(id, prop);
    addressIdx.put(key, id);
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
    switch (requireActive()) { case (#err e) return #err e; case _ {} };

    if (Text.size(method)       == 0) return #err(#InvalidInput("method required"));
    if (Text.size(documentHash) == 0) return #err(#InvalidInput("documentHash required"));

    switch (properties.get(propertyId)) {
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
        properties.put(propertyId, updated);
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

    switch (properties.get(id)) {
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
        properties.put(id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query(msg) func getMyProperties() : async [Property] {
    let caller = msg.caller;
    Iter.toArray(
      Iter.filter(properties.vals(), func(p: Property) : Bool {
        p.owner == caller and p.isActive
      })
    )
  };

  public query func getProperty(id: Nat) : async Result.Result<Property, Error> {
    switch (properties.get(id)) {
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
    switch (properties.get(id)) {
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

  /// Returns all properties currently awaiting admin verification review.
  public query func getPendingVerifications() : async [Property] {
    Iter.toArray(
      Iter.filter(properties.vals(), func(p: Property) : Bool {
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
    switch (requireActive()) { case (#err e) return #err e; case _ {} };

    switch (properties.get(propertyId)) {
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
        pendingTransfers.put(propertyId, pending);
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
    switch (requireActive()) { case (#err e) return #err e; case _ {} };

    switch (pendingTransfers.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?pending) {
        if (pending.to != msg.caller) return #err(#NotAuthorized);

        switch (properties.get(propertyId)) {
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
            properties.put(propertyId, updated);

            // Append immutable transfer record
            transferCounter += 1;
            let record : TransferRecord = {
              propertyId;
              from      = pending.from;
              to        = msg.caller;
              timestamp = now;
              txHash;
            };
            transfers.put(transferCounter, record);

            // Clear the pending transfer
            pendingTransfers.delete(propertyId);

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
    switch (pendingTransfers.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?pending) {
        if (pending.from != msg.caller and pending.to != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
        pendingTransfers.delete(propertyId);
        #ok(())
      };
    }
  };

  /// Returns the pending transfer for a property, if any.
  public query func getPendingTransfer(propertyId: Nat) : async ?PendingTransfer {
    pendingTransfers.get(propertyId)
  };

  /// Public, unauthenticated ownership history for a property.
  /// Returns records sorted by timestamp ascending (oldest first).
  public query func getOwnershipHistory(propertyId: Nat) : async [TransferRecord] {
    let filtered = Iter.toArray(
      Iter.filter(transfers.vals(), func(r: TransferRecord) : Bool {
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
    tierGrants.put(Principal.toText(user), tier);
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.append(admins, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func pause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    #ok(())
  };

  // ─── Metrics ──────────────────────────────────────────────────────────────

  public query func getMetrics() : async Metrics {
    var verified      = 0;
    var pendingReview = 0;
    var unverified    = 0;

    for (p in properties.vals()) {
      if (p.isActive) {
        switch (p.verificationLevel) {
          case (#Unverified)    { unverified    += 1 };
          case (#PendingReview) { pendingReview += 1 };
          case (#Basic or #Premium) { verified  += 1 };
        };
      };
    };

    {
      totalProperties         = properties.size();
      verifiedProperties      = verified;
      pendingReviewProperties = pendingReview;
      unverifiedProperties    = unverified;
      isPaused;
    }
  };
}
