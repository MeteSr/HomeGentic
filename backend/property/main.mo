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
 *   • If 7 days pass without verification → anyone may register the address
 *     (no new exclusive window) and race to verify first.
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
import Char      "mo:core/Char";
import Debug     "mo:core/Debug";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import List      "mo:core/List";
import Nat       "mo:core/Nat";
import Nat8      "mo:core/Nat8";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Random    "mo:core/Random";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Index     "../shared/Index";
import Uuid      "../shared/Uuid";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";

persistent actor Property {

  // ─── Constants ────────────────────────────────────────────────────────────

  /// Nanoseconds in 7 days — the conflict resolution window.
  private transient let SEVEN_DAYS_NS   : Int = 7  * 24 * 3600 * 1_000_000_000;
  /// Nanoseconds in 90 days — the property transfer link expiry window.
  private transient let NINETY_DAYS_NS  : Int = 90 * 24 * 3600 * 1_000_000_000;

  /// M-5: storage caps for caller-supplied collections.
  private transient let MAX_ROOMS_PER_PROPERTY : Nat = 100;
  private transient let MAX_FIXTURES_PER_ROOM  : Nat = 100;
  private transient let MAX_NOTIFS_PER_PROPERTY : Nat = 200;
  private transient let MAX_APPROVALS_PER_PROPERTY : Nat = 200;
  private transient let MAX_DESCRIPTION_CHARS  : Nat = 1000;

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
    #Pro;              // 5 properties
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
    // ── Verify v2 fields ──────────────────────────────────────────────────
    identityVerified     : ?Bool;       // null = not started, true = cleared by Stripe
    identityVerifiedAt   : ?Time.Time;
    identitySessionId    : ?Text;       // Stripe VerificationSession ID
    nameOnId             : ?Text;       // legal name extracted from Stripe
    nameOnDocument       : ?Text;       // name on the submitted ownership document
    contestedWithId      : ?Text;       // property ID of the competing claim
    conflictWindowEndsAt : ?Time.Time;  // set when both proofs submitted (#PendingReview)
  };

  public type PulseProperty = {
    id        : Text;
    address   : Text;
    city      : Text;
    state     : Text;
    zipCode   : Text;
    yearBuilt : Nat;
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
    errorsByMethod          : [(Text, Nat)];
  };

  /// Aggregated verification status for the v2 verify flow.
  public type VerifyStatus = {
    propertyId           : Text;
    address              : Text;
    city                 : Text;
    state                : Text;
    verificationLevel    : VerificationLevel;
    claimStartedAt       : Int;          // nanoseconds — property.createdAt
    claimWindowEndsAt    : Int;          // end of the 7-day window addressConflict enforces
    identityVerified     : Bool;
    identityVerifiedAt   : ?Time.Time;
    identitySessionId    : ?Text;
    nameOnId             : ?Text;
    verificationDocHash  : ?Text;
    verificationMethod   : ?Text;
    nameOnDocument       : ?Text;
    contestedWithId      : ?Text;
    conflictWindowEndsAt : ?Time.Time;
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
  ///  #CoOwner — full control alongside the owner (no spend limit, no
  ///             approvals) but cannot remove the original owner.
  public type ManagerRole = { #Viewer; #Manager; #CoOwner };

  /// A principal's standing on one property (see getAccessRole).
  public type AccessRole = { #Owner; #CoOwner; #Manager; #Viewer; #NoAccess };

  /// A principal that has been granted delegated access to a property.
  public type PropertyManager = {
    principal   : Principal;
    role        : ManagerRole;
    /// Free-text display name set by the owner (e.g. "Sarah - daughter").
    displayName : Text;
    addedAt     : Time.Time;
    /// Spend threshold in cents — actions at or under this amount don't need
    /// owner approval. Null means no limit (full trust). Not meaningful for
    /// #Viewer (read-only) or #CoOwner (never limited).
    spendLimitCents : ?Nat;
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
    spendLimitCents : ?Nat;
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

  /// Status of a manager's request to spend above their limit.
  public type ApprovalStatus = { #Pending; #Approved; #Declined };

  /// A manager's request to exceed their spend limit — sits in the owner's
  /// approval queue until the owner responds.
  public type PendingApprovalRequest = {
    id            : Nat;
    propertyId    : Text;
    requestedBy   : Principal;
    requesterName : Text;
    description   : Text;
    amountCents   : Nat;
    createdAt     : Time.Time;
    status        : ApprovalStatus;
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
  /// The voice Worker's principal: may only record Stripe Identity results
  /// (relayMarkIdentityCleared), for the property owner Stripe verified.
  private var identityRelayEntries     : [Principal] = [];
  /// The notification relay's principal: may read the minimal property
  /// summaries the weekly Home Pulse email needs (getPulseProperties).
  private var notifierEntries          : [Principal] = [];
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce           : ?Text       = null;
  private var auditCanisterId          : ?Principal  = null;
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  /// When set, registerProperty() cross-calls getTierForPrincipal(); without it every
  /// caller is treated as #Free (fail closed).
  private var payCanisterId            : Text        = "";
  /// Job canister ID — set post-deploy via setJobCanisterId(). Used by
  /// getJobPropertyAddresses() to confirm the caller is a party to a job
  /// before revealing that job's street address. Unset = fail closed.
  private var jobCanisterId            : ?Principal  = null;
  /// Listing canister ID — set post-deploy via setListingCanisterId(). A
  /// claimed transfer tells it to take the seller's FSBO listing down (M-6).
  private var listingCanisterId        : Text        = "";

  private var transferCounter        : Nat                            = 0;

  // Room state
  private var roomCounter    : Nat                  = 0;
  private var fixtureCounter : Nat                  = 0;

  // ─── Stable State ────────────────────────────────────────────────────────

  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();

  private func countError(method : Text) {
    let prev = errsByMethod.get(method).get(0);
    errsByMethod.add(method, prev + 1);
  };

  private let properties      = Map.empty<Text, Property>();
  /// Address key → property ID.
  private let addressIdx      = Map.empty<Text, Text>();
  /// M-8: address key → when the current run of unverified claims on that
  /// address began. The 7-day exclusive window is measured from here, so a
  /// lapsed unverified claim can't be renewed by re-registering from a fresh
  /// principal. Absent for addresses claimed before this field existed
  /// (falls back to the indexed property's createdAt).
  private let addressClaimSince = Map.empty<Text, Int>();
  /// Transfer history keyed by transferCounter (Nat).
  private let transfers        = Map.empty<Nat, TransferRecord>();
  private let pendingTransfers = Map.empty<Text, PendingTransfer>();
  /// token (Text) → propertyId (Text) — secondary index for O(1) claim lookup.
  private let tokenIndex       = Map.empty<Text, Text>();
  private let rooms            = Map.empty<Text, RoomRecord>();

  // Secondary indexes (transient, rebuilt on every upgrade). Writes to
  // `properties` / `rooms` go through putProperty / putRoom / Index.delete.
  private transient let propertiesByOwner = Index.empty();
  private transient let propertyIndexes : [Index.Keyed<Property>] = Index.indexed(properties, [
    (propertiesByOwner, func(p : Property) : ?Text { ?p.owner.toText() }),
  ]);
  private transient let roomsByProperty = Index.empty();
  private transient let roomIndexes : [Index.Keyed<RoomRecord>] = Index.indexed(rooms, [
    (roomsByProperty, func(r : RoomRecord) : ?Text { ?r.propertyId }),
  ]);

  private func putProperty(p : Property) { Index.put(properties, propertyIndexes, p.id, p) };
  private func putRoom(r : RoomRecord)   { Index.put(rooms, roomIndexes, r.id, r) };

  /// An owner's properties (active and inactive).
  private func ownedBy(owner : Principal) : Iter.Iter<Property> {
    Index.records(propertiesByOwner, owner.toText(), properties)
  };

  // ─── Manager delegation state ────────────────────────────────────────────
  /// propertyId → [PropertyManager]
  private let managersMap      = Map.empty<Text, [PropertyManager]>();
  /// token → ManagerInvite (pending invites)
  private let managerInvites   = Map.empty<Text, ManagerInvite>();
  /// token → propertyId (fast invite lookup)
  private let managerTokenIdx  = Map.empty<Text, Text>();
  /// propertyId → [token] — lets the owner list/cancel their own pending invites.
  private let propertyInvitesIdx = Map.empty<Text, [Text]>();
  /// propertyId → [OwnerNotification]
  private let ownerNotifs      = Map.empty<Text, [OwnerNotification]>();
  private var notifCounter     : Nat = 0;
  /// propertyId → [PendingApprovalRequest]
  private let approvalsMap     = Map.empty<Text, [PendingApprovalRequest]>();
  private var approvalCounter  : Nat = 0;

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /// Convert a Blob to a lowercase hex string.
  private func blobToHex(b : Blob) : Text {
    let hex   = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    let bytes = b.toArray();
    var result = "";
    for (byte in bytes.values()) {
      let n = byte.toNat();
      result := result # hex[n / 16].toText() # hex[n % 16].toText();
    };
    result
  };

  /// Generate a cryptographically random property ID: an RFC 4122 version-4
  /// UUID (lowercase 8-4-4-4-12 hex) from IC randomness — unguessable and
  /// non-sequential. Properties registered before this change keep their
  /// legacy "PROP_<hex>" IDs; both forms are opaque Text everywhere.
  private func nextPropertyId() : async Text {
    Uuid.fromBlob(await Random.blob())
  };

  /// Returns true if `caller` is the property owner OR an authorised manager.
  /// When `requireWrite` is true, a #Viewer manager is not sufficient.
  private func checkAuthorized(propertyId: Text, caller: Principal, requireWrite: Bool) : Bool {
    switch (properties.get(propertyId)) {
      case null false;
      case (?prop) {
        if (prop.owner == caller) return true;
        let mgrs = switch (managersMap.get(propertyId)) {
          case null    [];
          case (?list) list;
        };
        for (m in mgrs.values()) {
          if (m.principal == caller) {
            if (requireWrite) { return m.role == #Manager or m.role == #CoOwner };
            return true;
          };
        };
        false
      };
    }
  };

  /// Append a notification to the owner's queue for the given property.
  /// Removes a consumed/cancelled/expired invite from all three indexes.
  private func dropInvite(propertyId: Text, token: Text) {
    managerInvites.remove(token);
    managerTokenIdx.remove(token);
    let existingTokens = switch (propertyInvitesIdx.get(propertyId)) {
      case null    [];
      case (?list) list;
    };
    propertyInvitesIdx.add(propertyId,
      existingTokens.filter(func(t) { t != token }));
  };

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
    let existing = switch (ownerNotifs.get(propertyId)) {
      case null    [];
      case (?list) list;
    };
    // M-5: keep only the newest MAX_NOTIFS_PER_PROPERTY entries.
    let kept = if (existing.size() >= MAX_NOTIFS_PER_PROPERTY) {
      existing.sliceToArray((existing.size() + 1 - MAX_NOTIFS_PER_PROPERTY : Int), existing.size())
    } else existing;
    ownerNotifs.add(propertyId, kept.concat([notif]));
  };

  /// M-3: drops every delegated grant on a property — managers, pending
  /// invites, approval requests and owner notifications. Called when
  /// ownership changes hands so the previous owner's delegates (including an
  /// alt principal the seller invited) lose access.
  private func clearDelegatedAccess(propertyId : Text) {
    managersMap.remove(propertyId);
    let tokens = switch (propertyInvitesIdx.get(propertyId)) {
      case null    [];
      case (?list) list;
    };
    for (t in tokens.values()) {
      managerInvites.remove(t);
      managerTokenIdx.remove(t);
    };
    propertyInvitesIdx.remove(propertyId);
    approvalsMap.remove(propertyId);
    ownerNotifs.remove(propertyId);
  };

  /// D-1/H-5: true when `caller` may see a property's verification PII
  /// (legal names, Stripe Identity session ID, document hash, competing
  /// claim): the owner, a delegated manager, an admin or a trusted canister.
  private func canSeePrivate(p : Property, caller : Principal) : Bool {
    p.owner == caller or isAdmin(caller) or isTrustedCanister(caller)
      or checkAuthorized(p.id, caller, false)
  };

  /// D-1/H-5: a property with identity and verification evidence blanked.
  /// The street address stays — this is the view for token holders (a buyer
  /// with a transfer link, an invitee with a manager-invite link) who need to
  /// see which home they are accepting. Strangers get publicView instead.
  private func redactProperty(p : Property) : Property {
    {
      p with
      verificationDocHash  = null;
      verificationMethod   = null;
      identitySessionId    = null;
      identityVerifiedAt   = null;
      nameOnId             = null;
      nameOnDocument       = null;
      contestedWithId      = null;
      conflictWindowEndsAt = null;
    }
  };

  /// The view for a caller with no relationship to the property: also blanks
  /// the street address. City, state, ZIP, type, year built and size stay
  /// public (coarse, non-identifying on their own; FSBO / report pages use
  /// them). Token holders and job contractors get the address through
  /// getPropertyByTransferToken / getPropertyByManagerInviteToken /
  /// getJobPropertyAddresses.
  private func publicView(p : Property) : Property {
    { redactProperty(p) with address = "" }
  };

  private func viewFor(p : Property, caller : Principal) : Property {
    if (canSeePrivate(p, caller)) p else publicView(p)
  };

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// In-flight guard for registerProperty: caller principal → true while a registration is live.
  private transient let inFlightRegistrations = Map.empty<Text, Bool>();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller) or isTrustedCanister(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(caller: Principal) : Bool {
    Admin.contains(admins, caller)
  };

  private func isTrustedCanister(p: Principal) : Bool {
    Admin.contains(trustedCanisterEntries, p)
  };

  private func isIdentityRelay(p: Principal) : Bool {
    Admin.contains(identityRelayEntries, p)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func countOwnerProperties(owner: Principal) : Nat {
    var n = 0;
    for (p in ownedBy(owner)) {
      if (p.isActive) { n += 1 };
    };
    n
  };

  /// Produces a stable address key for duplicate detection: the four address
  /// components, each trimmed, lowercased and with runs of whitespace
  /// collapsed, joined with pipes. "12 Main St" and " 12  main st" collide.
  private func addressKey(address: Text, city: Text, state: Text, zip: Text) : Text {
    normalisePart(address) # "|" # normalisePart(city) # "|" # normalisePart(state) # "|" # normalisePart(zip)
  };

  private func normalisePart(t: Text) : Text {
    let words = t.toLower().split(#predicate(Char.isWhitespace)).filter(func(w) { w != "" });
    words.join(" ")
  };

  /// Re-keys addressIdx with the current addressKey. Idempotent, so it runs on
  /// every upgrade; it converts keys written before addresses were normalised.
  /// When several properties now share a key, a verified one wins, otherwise
  /// the newest, which is the property registerProperty would have kept.
  private func rekeyAddressIndex() {
    let ids = addressIdx.values().toArray();
    addressIdx.clear();
    for (id in ids.values()) {
      switch (properties.get(id)) {
        case null {};
        case (?p) {
          let key = addressKey(p.address, p.city, p.state, p.zipCode);
          let keep = switch (addressIdx.get(key)) {
            case null { true };
            case (?otherId) {
              switch (properties.get(otherId)) {
                case null { true };
                case (?other) {
                  if (isVerified(other.verificationLevel) != isVerified(p.verificationLevel)) {
                    isVerified(p.verificationLevel)
                  } else { p.createdAt > other.createdAt }
                };
              }
            };
          };
          if (keep) { addressIdx.add(key, id) };
        };
      };
    };
  };

  system func postupgrade() {
    rekeyAddressIndex();
  };

  private func isVerified(level: VerificationLevel) : Bool {
    switch level {
      case (#Basic or #Premium) { true };
      case _                    { false };
    }
  };


  // ─── Tier Limits ──────────────────────────────────────────────────────────

  // #Pro is the single homeowner plan ($59/year).
  public query func getPropertyLimitForTier(tier: SubscriptionTier) : async Nat {
    switch tier {
      case (#Free)             { 1  };
      case (#Pro)              { 20 };
      case (#ContractorFree)   { 0  };  // contractors don't own properties
      case (#ContractorPro)    { 0  };  // 0 = unlimited (ContractorPro)
    }
  };

  // ─── Validation Helpers ───────────────────────────────────────────────────

  /// Accepts 5-digit ("12345") or ZIP+4 ("12345-6789") formats.
  private func validateZipCode(zip: Text) : Bool {
    let size = Text.size(zip);
    if (size != 5 and size != 10) return false;
    var i = 0;
    for (c in zip.chars()) {
      if (i < 5 and (c < '0' or c > '9')) return false;
      if (i == 5 and c != '-')            return false;
      if (i > 5 and (c < '0' or c > '9')) return false;
      i += 1;
    };
    true
  };

  /// Accepts exactly 2 uppercase US state letters (e.g. "TX", "CA").
  private func validateStateCode(state: Text) : Bool {
    if (Text.size(state) != 2) return false;
    for (c in state.chars()) {
      if (c < 'A' or c > 'Z') return false;
    };
    true
  };

  // ─── Registration ─────────────────────────────────────────────────────────

  /// M-8: why `caller` may not register the address `key` right now, or null
  /// when they may. A verified claim blocks outright; an unverified claim by
  /// someone else blocks until 7 days after the address's unverified claims
  /// began (addressClaimSince) — re-registering from a fresh principal does
  /// not restart that window.
  private func addressConflict(key : Text, caller : Principal) : ?Error {
    switch (addressIdx.get(key)) {
      case null null;
      case (?existingId) {
        switch (properties.get(existingId)) {
          case null null;  // stale index entry — harmless, overwritten on write
          case (?existing) {
            if (existing.owner == caller) return null;  // idempotent re-registration
            if (isVerified(existing.verificationLevel)) return ?#DuplicateAddress;
            let windowEnd : Int = claimStart(key, existing.createdAt) + SEVEN_DAYS_NS;
            if (Time.now() < windowEnd) ?#AddressConflict(windowEnd) else null
          };
        }
      };
    }
  };

  /// When the current run of unverified claims on `key` began. Falls back to
  /// the indexed unverified property's createdAt (claims made before
  /// addressClaimSince existed), else `dflt`.
  private func claimStart(key : Text, dflt : Int) : Int {
    switch (addressClaimSince.get(key)) {
      case (?t) t;
      case null {
        switch (addressIdx.get(key)) {
          case null dflt;
          case (?id) {
            switch (properties.get(id)) {
              case (?p) { if (isVerified(p.verificationLevel) or p.createdAt > dflt) dflt else p.createdAt };
              case null dflt;
            }
          };
        }
      };
    }
  };

  /// Register a new property for the calling principal.
  ///
  /// Duplicate-address rules (Safeguard 1):
  ///  1. If the existing record is Basic/Premium: reject — address is taken.
  ///  2. If the existing record is Unverified/PendingReview and within the
  ///     7-day window: reject with #AddressConflict (carries expiry time).
  ///  3. If the window has expired: allow — the new registration displaces the
  ///     old one in the address index but does NOT get a fresh 7-day window
  ///     (M-8: the window runs from the first unverified claim on the address,
  ///     so it can't be renewed forever by rotating principals). Whoever an
  ///     admin verifies first wins; verifyProperty rejects a second one.
  public shared(msg) func registerProperty(
    args: RegisterPropertyArgs
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    if (Text.size(args.address) == 0)
      return #err(#InvalidInput("address cannot be empty"));
    if (Text.size(args.address) > 500) return #err(#InvalidInput("address exceeds 500 characters"));
    if (Text.size(args.city)    == 0)  return #err(#InvalidInput("city cannot be empty"));
    if (Text.size(args.city)    > 100) return #err(#InvalidInput("city exceeds 100 characters"));
    if (not validateStateCode(args.state))
      return #err(#InvalidInput("state must be a 2-letter uppercase US state code (e.g. TX)"));
    if (not validateZipCode(args.zipCode))
      return #err(#InvalidInput("zipCode must be 5 digits or ZIP+4 format (e.g. 12345 or 12345-6789)"));
    if (args.squareFeet == 0 or args.squareFeet > 100_000)
      return #err(#InvalidInput("squareFeet must be between 1 and 100,000"));
    let currentYear = Int.abs(Time.now()) / 1_000_000_000 / 31_536_000 + 1970;
    if (args.yearBuilt < 1600 or args.yearBuilt > currentYear)
      return #err(#InvalidInput("yearBuilt must be between 1600 and " # currentYear.toText()));

    let caller = msg.caller;
    let key    = addressKey(args.address, args.city, args.state, args.zipCode);

    // ── Duplicate address check ──────────────────────────────────────────────
    // Checked here and again after the last await below (M-8): two principals
    // registering the same address concurrently would otherwise both pass.
    switch (addressConflict(key, caller)) {
      case (?e) {
        Debug.print("property.registerProperty: address conflict: " # key);
        countError("registerProperty");
        return #err(e);
      };
      case null {};
    };

    // ── Per-caller in-flight guard ───────────────────────────────────────────
    // Prevents concurrent calls from the same principal all passing the tier
    // limit check before any property is written (tier-limit bypass race).
    let callerKey = caller.toText();
    switch (inFlightRegistrations.get(callerKey)) {
      case (?_) { return #err(#InvalidInput("A property registration is already in progress for this account")) };
      case null {};
    };
    inFlightRegistrations.add(callerKey, true);

    // ── Tier limit check ────────────────────────────────────────────────────
    // When payment canister is wired, tier comes from getTierForPrincipal();
    // otherwise falls back to the local admin-grant map.
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = Canisters.payment(payCanisterId);
      // A rejected call must not leave the in-flight lock set, or the
      // caller could never register again.
      try { await payActor.getTierForPrincipal(caller) } catch (e) {
        inFlightRegistrations.remove(callerKey);
        throw e;
      }
    } else {
      #Free  // payment canister not wired: no tier source, fail closed
    };
    let limit = switch (callerTier) {
      case (#Free)             { 1  };
      case (#Pro)              { 20 };
      case (#ContractorFree)   { 0  };  // contractors don't own properties
      case (#ContractorPro)    { 0  };  // 0 = unlimited (ContractorPro)
    };
    if (callerTier == #ContractorFree or (limit > 0 and countOwnerProperties(caller) >= limit)) {
      let tierName = switch (callerTier) {
        case (#Free)             "Free";
        case (#Pro)              "Pro";
        case (#ContractorFree)   "ContractorFree";
        case (#ContractorPro)    "ContractorPro";
      };
      // Pro is the top homeowner tier, so only Free has somewhere to go.
      let upgradeMsg = switch (callerTier) {
        case (#Free)  " Subscribe to Pro ($59/year) for 20 properties.";
        case _        "";
      };
      inFlightRegistrations.remove(callerKey);
      return #err(#InvalidInput(
        tierName # " plan limit of " # limit.toText() # " propert" #
        (if (limit == 1) "y" else "ies") # " reached." # upgradeMsg
      ));
    };

    let id  = try { await nextPropertyId() } catch (e) {
      inFlightRegistrations.remove(callerKey);
      throw e;
    };
    let now = Time.now();

    // M-8: re-check after the awaits — another registration of this address
    // may have landed while this call was suspended.
    switch (addressConflict(key, caller)) {
      case (?e) {
        inFlightRegistrations.remove(callerKey);
        countError("registerProperty");
        return #err(e);
      };
      case null {};
    };

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
      identityVerified     = null;
      identityVerifiedAt   = null;
      identitySessionId    = null;
      nameOnId             = null;
      nameOnDocument       = null;
      contestedWithId      = null;
      conflictWindowEndsAt = null;
    };

    let since = claimStart(key, now);
    putProperty(prop);
    // A verified property keeps the address index (only its own owner gets
    // here past addressConflict), so verifyProperty can still see it.
    let indexedVerified = switch (addressIdx.get(key)) {
      case (?otherId) {
        switch (properties.get(otherId)) {
          case (?other) { isVerified(other.verificationLevel) };
          case null     { false };
        }
      };
      case null { false };
    };
    if (not indexedVerified) { addressIdx.add(key, id) };
    addressClaimSince.add(key, since);
    inFlightRegistrations.remove(callerKey);
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
    documentHash : Text,
    nameOnDoc    : ?Text
  ) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

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
          existing with
          verificationLevel    = #PendingReview;
          verificationMethod   = ?method;
          verificationDocHash  = ?documentHash;
          updatedAt            = Time.now();
          nameOnDocument       = nameOnDoc;
          conflictWindowEndsAt = ?(Time.now() + SEVEN_DAYS_NS);
          identityVerified     = existing.identityVerified;
          identityVerifiedAt   = existing.identityVerifiedAt;
          identitySessionId    = existing.identitySessionId;
          nameOnId             = existing.nameOnId;
          contestedWithId      = existing.contestedWithId;
        };
        putProperty(updated);
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

    switch (properties.get(id)) {
      case null {
        Debug.print("property.verifyProperty: not found: " # id);
        countError("verifyProperty");
        #err(#NotFound)
      };
      case (?existing) {
        // M-8: only one verified owner per address. If another active
        // property at the same address is already verified, refuse; else the
        // newly verified property takes the address index.
        let key = addressKey(existing.address, existing.city, existing.state, existing.zipCode);
        if (isVerified(level)) {
          switch (addressIdx.get(key)) {
            case (?otherId) {
              if (otherId != id) {
                switch (properties.get(otherId)) {
                  case (?other) {
                    if (other.isActive and isVerified(other.verificationLevel)) {
                      countError("verifyProperty");
                      return #err(#DuplicateAddress);
                    };
                  };
                  case null {};
                };
              };
            };
            case null {};
          };
        };
        let now  = Time.now();
        let updated : Property = {
          existing with
          verificationLevel   = level;
          verificationDate    = if (isVerified(level)) ?now else existing.verificationDate;
          verificationMethod  = switch (method) {
            case (?m) { ?m };
            case null { existing.verificationMethod };
          };
          updatedAt           = now;
        };
        putProperty(updated);
        if (isVerified(level)) { addressIdx.add(key, id) };
        try { ignore await auditLog("PropertyVerified", ?existing.owner, "propertyId=" # id # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query(msg) func getMyProperties() : async [Property] {
    let caller = msg.caller;
    ownedBy(caller).filter(func(p: Property) : Bool { p.isActive }).toArray(
      
    )
  };

  /// Active properties owned by `owner`.
  /// D-1/H-5: only `owner` themself, an admin or a trusted canister may list
  /// them; anyone else gets []. (This used to be public, which mapped any
  /// principal to their home addresses, legal names and Stripe session IDs.)
  public query(msg) func getPropertiesByOwner(owner: Principal) : async [Property] {
    if (msg.caller != owner and not isAdmin(msg.caller) and not isTrustedCanister(msg.caller)) return [];
    ownedBy(owner).filter(func(p: Property) : Bool { p.isActive }).toArray(
      
    )
  };

  /// D-1/H-5: the owner, a delegated manager, an admin or a trusted canister
  /// gets the full record; anyone else gets the public view with identity and
  /// verification evidence blanked (see redactProperty).
  public query(msg) func getProperty(id: Text) : async Result.Result<Property, Error> {
    switch (properties.get(id)) {
      case null  { #err(#NotFound) };
      case (?p)  { #ok(viewFor(p, msg.caller)) };
    }
  };

  /// Returns the verification level of a property as a Text string, or null
  /// if the property does not exist.
  ///
  /// Called cross-canister by the Report canister before issuing share links.
  /// Returns Text rather than VerificationLevel to keep the inter-canister
  /// interface simple and stable as new variants are added.
  public query func getVerificationLevel(id: Text) : async ?Text {
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

  /// Returns the year a property was built, or null if not found.
  /// Called cross-canister by the market canister's computePropertyScore.
  public query func getPropertyYearBuilt(id: Text) : async ?Nat {
    switch (properties.get(id)) {
      case null  { null };
      case (?p)  { ?p.yearBuilt };
    }
  };

  /// The property's full street address ("12 Elm St, Austin, TX 78701"), or
  /// null if not found. Called by job.createInviteToken so the address on a
  /// contractor's sign link comes from the record, not from what the
  /// homeowner typed. Addresses are already public (claim pages show them).
  public query func getPropertyAddress(id: Text) : async ?Text {
    switch (properties.get(id)) {
      case null  { null };
      case (?p)  { ?(p.address # ", " # p.city # ", " # p.state # " " # p.zipCode) };
    }
  };

  /// Returns the owner Principal of a property, or null if not found.
  /// Called cross-canister by the Job canister (14.2.1) to verify that
  /// the homeowner stored on a sensor device actually owns the property
  /// before auto-creating a sensor-triggered job.
  public query func getPropertyOwner(id: Text) : async ?Principal {
    switch (properties.get(id)) {
      case null  { null };
      case (?p)  { ?p.owner };
    }
  };

  /// Returns all properties currently awaiting admin verification review.
  /// H-12: Admin-only — these records contain legal names, Stripe session IDs,
  /// and document hashes that must not be exposed to arbitrary callers.
  public shared(msg) func getPendingVerifications() : async Result.Result<[Property], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let pending = Iter.toArray(
      properties.values().filter(func(p: Property) : Bool {
        p.verificationLevel == #PendingReview and p.isActive
      })
    );
    #ok(pending)
  };

  /// Returns true if the given principal is an admin.
  public query func isAdminPrincipal(p: Principal) : async Bool {
    Admin.contains(admins, p)
  };

  /// Returns the aggregated verification status for the v2 verify flow.
  /// Only the property owner or an authorised manager may call this.
  public query(msg) func getVerifyStatus(
    propertyId : Text
  ) : async Result.Result<VerifyStatus, Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?p) {
        if (not checkAuthorized(propertyId, msg.caller, false)) return #err(#NotAuthorized);
        #ok({
          propertyId           = p.id;
          address              = p.address;
          city                 = p.city;
          state                = p.state;
          verificationLevel    = p.verificationLevel;
          claimStartedAt       = p.createdAt;
          // The window addressConflict actually enforces: 7 days from when
          // the address's unverified claims began.
          claimWindowEndsAt    = claimStart(addressKey(p.address, p.city, p.state, p.zipCode), p.createdAt) + SEVEN_DAYS_NS;
          identityVerified     = switch (p.identityVerified) { case (?v) v; case null false };
          identityVerifiedAt   = p.identityVerifiedAt;
          identitySessionId    = p.identitySessionId;
          nameOnId             = p.nameOnId;
          verificationDocHash  = p.verificationDocHash;
          verificationMethod   = p.verificationMethod;
          nameOnDocument       = p.nameOnDocument;
          contestedWithId      = p.contestedWithId;
          conflictWindowEndsAt = p.conflictWindowEndsAt;
        })
      };
    }
  };

  /// Called by the backend webhook handler after Stripe Identity confirms verification.
  /// Admin or trusted canister only.
  public shared(msg) func markIdentityCleared(
    propertyId : Text,
    sessionId  : Text,
    name       : Text
  ) : async Result.Result<Property, Error> {
    if (not isAdmin(msg.caller) and not isTrustedCanister(msg.caller)) return #err(#NotAuthorized);
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        let now = Time.now();
        let updated : Property = {
          existing with
          identityVerified   = ?true;
          identityVerifiedAt = ?now;
          identitySessionId  = ?sessionId;
          nameOnId           = ?name;
          updatedAt          = now;
        };
        putProperty(updated);
        #ok(updated)
      };
    }
  };

  /// Stripe Identity webhook path. The Worker (an identity relay) passes the
  /// principal Stripe's verification session was created for; the result is
  /// recorded only if that principal still owns the property, so a relay can
  /// never clear identity on someone else's claim.
  public shared(msg) func relayMarkIdentityCleared(
    propertyId : Text,
    owner      : Principal,
    sessionId  : Text,
    name       : Text
  ) : async Result.Result<(), Error> {
    if (not isIdentityRelay(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not sessionId.startsWith(#text "vs_") or sessionId.size() > 255) return #err(#InvalidInput("invalid verification session id"));
    if (name.size() > 200) return #err(#InvalidInput("name too long"));
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.owner != owner) return #err(#NotAuthorized);
        let now = Time.now();
        putProperty({
          existing with
          identityVerified   = ?true;
          identityVerifiedAt = ?now;
          identitySessionId  = ?sessionId;
          nameOnId           = ?name;
          updatedAt          = now;
        });
        #ok(())
      };
    }
  };

  public shared(msg) func addIdentityRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (p.isAnonymous()) return #err(#InvalidInput("anonymous principal"));
    identityRelayEntries := Admin.add(identityRelayEntries, p);
    try { ignore await auditLog("IdentityRelayAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func removeIdentityRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    identityRelayEntries := Admin.remove(identityRelayEntries, p);
    try { ignore await auditLog("IdentityRelayRemoved", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  public query(msg) func listIdentityRelays() : async [Principal] {
    if (not isAdmin(msg.caller)) return [];
    identityRelayEntries
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

    // Fetch randomness before any state read/write so everything from the
    // ownership check through the map writes below executes as one atomic
    // step with no reentrancy window — awaiting *between* the check and the
    // write would let two concurrent calls both pass the check first.
    let randBytes = await Random.blob();

    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);

        let now = Time.now();
        // Cryptographically random, unguessable bearer token. This used to be
        // derived from the timestamp plus a shared counter, which is
        // predictable enough to brute-force — possession of this token is
        // sole authorization for the transfer (see claimTransfer below), so
        // it must not be guessable.
        let token : Text = blobToHex(randBytes);

        // Remove previous token from secondary index if one existed
        switch (pendingTransfers.get(propertyId)) {
          case (?old) { tokenIndex.remove(old.token) };
          case null   {};
        };

        let pending : PendingTransfer = {
          propertyId;
          from        = msg.caller;
          token;
          initiatedAt = now;
          expiresAt   = now + NINETY_DAYS_NS;
        };
        pendingTransfers.add(propertyId, pending);
        tokenIndex.add(token,      propertyId);
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

    switch (tokenIndex.get(token)) {
      case null { #err(#NotFound) };
      case (?propertyId) {
        switch (pendingTransfers.get(propertyId)) {
          case null { #err(#NotFound) };
          case (?pending) {
            if (pending.token != token) return #err(#NotFound);

            if (Time.now() > pending.expiresAt) {
              // Expired — clean up and surface a clear error
              pendingTransfers.remove(propertyId);
              tokenIndex.remove(token);
              return #err(#InvalidInput("Transfer link has expired. Ask the seller to generate a new one."));
            };

            if (pending.from == msg.caller) {
              return #err(#InvalidInput("Cannot claim your own property transfer."));
            };

            switch (properties.get(propertyId)) {
              case null { #err(#NotFound) };
              case (?prop) {
                let now = Time.now();

                // M-6 (2026-10-28 audit): the seller's ID check and ownership
                // evidence are about the seller, not the buyer.
                let updated : Property = {
                  prop with
                  owner               = msg.caller;
                  updatedAt           = now;
                  identityVerified    = null;
                  identityVerifiedAt  = null;
                  identitySessionId   = null;
                  nameOnId            = null;
                  nameOnDocument      = null;
                  verificationDocHash = null;
                };
                putProperty(updated);

                // M-3: the previous owner's delegates (managers, co-owners,
                // pending invites) must not keep access to the buyer's home.
                clearDelegatedAccess(propertyId);

                // Append immutable record to ownership history. L-3: take a
                // fresh key per claim so two claims never share a record slot.
                transferCounter += 1;
                let record : TransferRecord = {
                  propertyId;
                  from      = pending.from;
                  to        = msg.caller;
                  timestamp = now;
                  txHash    = "";  // no off-chain hash for token-based transfers
                };
                transfers.add(transferCounter, record);

                // Invalidate token
                pendingTransfers.remove(propertyId);
                tokenIndex.remove(token);

                // The seller's FSBO listing, showings and offers come down.
                if (listingCanisterId != "") {
                  let listing : actor { propertyTransferred : shared Text -> async { #ok : Any; #err : Any } } = actor (listingCanisterId);
                  try { ignore await listing.propertyTransferred(propertyId) } catch _ { Debug.print("[property] listing transfer call failed") };
                };

                // A year of Pro for the buyer when the home's ownership was
                // verified. payment.grantHandoffYear decides eligibility (once
                // per buyer, once a year per home, no paid plan running); the
                // transfer above stands whatever it answers.
                if (payCanisterId != "" and (prop.verificationLevel == #Basic or prop.verificationLevel == #Premium)) {
                  let pay : actor { grantHandoffYear : shared (Principal, Text) -> async { #ok : Any; #err : Any } } = actor (payCanisterId);
                  try { ignore await pay.grantHandoffYear(msg.caller, propertyId) } catch _ { Debug.print("[property] handoff grant call failed") };
                };

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
    switch (pendingTransfers.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?pending) {
        if (pending.from != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
        tokenIndex.remove(pending.token);
        pendingTransfers.remove(propertyId);
        #ok(())
      };
    }
  };

  /// Returns the pending transfer for a property, if any.
  /// C-1: the record carries the bearer claim token, so only the current
  /// owner (who created it) or an admin may read it; everyone else gets null.
  public query(msg) func getPendingTransfer(propertyId: Text) : async ?PendingTransfer {
    switch (properties.get(propertyId)) {
      case null null;
      case (?prop) {
        if (prop.owner != msg.caller and not isAdmin(msg.caller)) return null;
        pendingTransfers.get(propertyId)
      };
    }
  };

  /// Looks up a pending transfer by its bearer token.
  /// Used by the claim page to display property details before the buyer logs in.
  public query func getPendingTransferByToken(token: Text) : async ?PendingTransfer {
    switch (tokenIndex.get(token)) {
      case null          null;
      case (?propertyId) pendingTransfers.get(propertyId);
    }
  };

  /// The property behind a live transfer link, for the claim page. The token
  /// is the credential: the buyer sees the street address of the home they
  /// are about to accept, with identity/verification evidence blanked.
  /// Returns null for an unknown or expired token.
  public query func getPropertyByTransferToken(token: Text) : async ?Property {
    switch (tokenIndex.get(token)) {
      case null null;
      case (?propertyId) {
        switch (pendingTransfers.get(propertyId)) {
          case null null;
          case (?pt) {
            if (pt.token != token or Time.now() > pt.expiresAt) return null;
            switch (properties.get(propertyId)) {
              case null null;
              case (?p) ?redactProperty(p);
            }
          };
        }
      };
    }
  };

  /// Public, unauthenticated ownership history for a property.
  /// Returns records sorted by timestamp ascending (oldest first).
  public query func getOwnershipHistory(propertyId: Text) : async [TransferRecord] {
    let filtered = Iter.toArray(
      transfers.values().filter(func(r: TransferRecord) : Bool {
        r.propertyId == propertyId
      })
    );
    // Sort ascending by timestamp
    filtered.sort(func(a, b) {
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
  /// Overwrites any existing pending invite for the same property+role combination.
  public shared(msg) func inviteManager(
    propertyId      : Text,
    role            : ManagerRole,
    displayName     : Text,
    spendLimitCents : ?Nat
  ) : async Result.Result<ManagerInvite, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    // Fetch randomness alongside the tier-gate check below (both awaits
    // happen before any property-specific read/write), so the ownership
    // check through the map writes further down still executes as one
    // atomic step with no new reentrancy window.
    let randBytes = await Random.blob();

    // ── Tier gate ────────────────────────────────────────────────────────────
    // Shared access (People) is Pro/Premium-only — mirrors the tier lookup in
    // registerProperty(). Existing managers/invites from before this gate keep
    // working; only granting a *new* invite is blocked on Free/Basic.
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = Canisters.payment(payCanisterId);
      await payActor.getTierForPrincipal(msg.caller)
    } else {
      #Free  // payment canister not wired: no tier source, fail closed
    };
    switch (callerTier) {
      case (#Pro) {};
      case _ { return #err(#InvalidInput("Shared access is a Pro feature. Subscribe to Pro ($59/year) to invite a manager or viewer.")) };
    };

    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        if (Text.size(displayName) == 0) return #err(#InvalidInput("Display name is required."));

        let existingTokens = switch (propertyInvitesIdx.get(propertyId)) {
          case null    [];
          case (?list) list;
        };
        // Drop any prior pending invite for this same role — only one pending
        // invite per role per property at a time.
        var keptTokens : [Text] = [];
        for (t in existingTokens.values()) {
          switch (managerInvites.get(t)) {
            case null {};
            case (?inv) {
              if (inv.role == role) {
                managerInvites.remove(t);
                managerTokenIdx.remove(t);
              } else {
                keptTokens := keptTokens.concat([t]);
              };
            };
          };
        };

        let now = Time.now();
        // Cryptographically random, unguessable bearer token — see the note
        // above initiateTransfer's token for why timestamp+counter isn't safe
        // here (possession of this token grants manager access to the property).
        let token : Text = "m-" # blobToHex(randBytes);

        let invite : ManagerInvite = {
          propertyId;
          token;
          role;
          displayName;
          invitedBy = msg.caller;
          createdAt = now;
          expiresAt = now + NINETY_DAYS_NS;
          spendLimitCents;
        };
        managerInvites.add(token,      invite);
        managerTokenIdx.add(token,      propertyId);
        propertyInvitesIdx.add(propertyId, keptTokens.concat([token]));
        #ok(invite)
      };
    }
  };

  /// Owner cancels a pending (not yet claimed) invite before it's accepted.
  public shared(msg) func cancelManagerInvite(
    propertyId : Text,
    token      : Text
  ) : async Result.Result<(), Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        switch (managerInvites.get(token)) {
          case null { #err(#NotFound) };
          case (?invite) {
            if (invite.propertyId != propertyId) return #err(#NotFound);
            dropInvite(propertyId, token);
            #ok(())
          };
        }
      };
    }
  };

  /// Owner lists all pending (not yet claimed) invites for a property,
  /// including ones past their expiry — the frontend shows those as expired
  /// rather than hiding them, so the owner knows to re-invite.
  public query(msg) func getPendingInvitesForProperty(
    propertyId : Text
  ) : async Result.Result<[ManagerInvite], Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let tokens = switch (propertyInvitesIdx.get(propertyId)) {
          case null    [];
          case (?list) list;
        };
        var invites : [ManagerInvite] = [];
        for (t in tokens.values()) {
          switch (managerInvites.get(t)) {
            case null {};
            case (?inv) { invites := invites.concat([inv]) };
          };
        };
        #ok(invites)
      };
    }
  };

  /// Step 2: invitee claims manager access using the bearer token.
  public shared(msg) func claimManagerRole(
    token : Text
  ) : async Result.Result<{ propertyId: Text; role: ManagerRole }, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };

    switch (managerInvites.get(token)) {
      case null { #err(#NotFound) };
      case (?invite) {
        if (Time.now() > invite.expiresAt) {
          dropInvite(invite.propertyId, token);
          return #err(#InvalidInput("Invite link has expired."));
        };
        switch (properties.get(invite.propertyId)) {
          case null { #err(#NotFound) };
          case (?prop) {
            if (prop.owner == msg.caller) {
              return #err(#InvalidInput("You already own this property."));
            };
            // Prevent duplicates — remove existing entry for this principal if any
            let existing = switch (managersMap.get(invite.propertyId)) {
              case null    [];
              case (?list) list;
            };
            let filtered = existing.filter(func(m) {
              m.principal != msg.caller
            });
            let newMgr : PropertyManager = {
              principal   = msg.caller;
              role        = invite.role;
              displayName = invite.displayName;
              addedAt     = Time.now();
              spendLimitCents = invite.spendLimitCents;
            };
            managersMap.add(invite.propertyId,
              filtered.concat([newMgr]));
            // Consume the token
            dropInvite(invite.propertyId, token);
            #ok({ propertyId = invite.propertyId; role = invite.role })
          };
        }
      };
    }
  };

  /// Owner changes an existing manager's role and/or spend limit.
  public shared(msg) func updateManagerRole(
    propertyId          : Text,
    managerPrincipal    : Principal,
    newRole             : ManagerRole,
    newSpendLimitCents  : ?Nat
  ) : async Result.Result<(), Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let existing = switch (managersMap.get(propertyId)) {
          case null    return #err(#NotFound);
          case (?list) list;
        };
        // Check the manager exists before updating
        let found = existing.find(func(m) { m.principal == managerPrincipal });
        switch found {
          case null return #err(#NotFound);
          case _ {};
        };
        let updated = existing.map(func(m) {
          if (m.principal == managerPrincipal) {
            { m with role = newRole; spendLimitCents = newSpendLimitCents }
          } else m
        });
        managersMap.add(propertyId, updated);
        #ok(())
      };
    }
  };

  /// Owner removes a manager from a property.
  public shared(msg) func removeManager(
    propertyId       : Text,
    managerPrincipal : Principal
  ) : async Result.Result<(), Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let existing = switch (managersMap.get(propertyId)) {
          case null    return #err(#NotFound);
          case (?list) list;
        };
        let filtered = existing.filter(func(m) {
          m.principal != managerPrincipal
        });
        managersMap.add(propertyId, filtered);
        #ok(())
      };
    }
  };

  /// Manager voluntarily removes themselves.
  public shared(msg) func resignAsManager(
    propertyId : Text
  ) : async Result.Result<(), Error> {
    let existing = switch (managersMap.get(propertyId)) {
      case null    return #err(#NotFound);
      case (?list) list;
    };
    let filtered = existing.filter(func(m) {
      m.principal != msg.caller
    });
    if (filtered.size() == existing.size()) return #err(#NotFound);
    managersMap.add(propertyId, filtered);
    #ok(())
  };

  /// Returns all properties where the caller has been granted manager access.
  public query(msg) func getMyManagedProperties() : async [{ property: Property; role: ManagerRole }] {
    var result : [{ property: Property; role: ManagerRole }] = [];
    for ((propId, mgrs) in managersMap.entries()) {
      for (m in mgrs.values()) {
        if (m.principal == msg.caller) {
          switch (properties.get(propId)) {
            case null {};
            case (?prop) {
              result := result.concat([{ property = prop; role = m.role }]);
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
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let mgrs = switch (managersMap.get(propertyId)) {
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
    managerInvites.get(token)
  };

  /// The property behind a live manager invite, for the claim page. Same
  /// rules as getPropertyByTransferToken: token-gated, address included,
  /// identity/verification evidence blanked, null when unknown or expired.
  public query func getPropertyByManagerInviteToken(token: Text) : async ?Property {
    switch (managerInvites.get(token)) {
      case null null;
      case (?invite) {
        if (Time.now() > invite.expiresAt) return null;
        switch (properties.get(invite.propertyId)) {
          case null null;
          case (?p) ?redactProperty(p);
        }
      };
    }
  };

  public type JobPropertyAddress = {
    jobId      : Text;
    propertyId : Text;
    address    : Text;
  };

  private let MAX_JOB_ADDRESS_LOOKUPS : Nat = 50;

  /// Street addresses for the caller's own jobs (contractor views list jobs on
  /// other people's homes). For each job ID, the job canister is asked for the
  /// job as this (trusted) canister; the address is returned only when the
  /// caller is that job's homeowner, or its linked contractor once the
  /// homeowner has accepted the job (an unaccepted proposal reveals nothing: any
  /// contractor can propose a job on any property ID). Jobs the caller
  /// is not a party to, and unknown IDs, are left out. Capped at 50 IDs.
  /// Returns [] when the job canister is not wired (fail closed).
  public shared(msg) func getJobPropertyAddresses(jobIds: [Text]) : async [JobPropertyAddress] {
    switch (requireActive(msg.caller)) { case (#err _) return []; case _ {} };
    let jid = switch (jobCanisterId) { case null return []; case (?j) j };
    if (jobIds.size() > MAX_JOB_ADDRESS_LOOKUPS) return [];
    let jobActor = actor (jid.toText()) : actor {
      getJob : query (Text) -> async { #ok : { propertyId : Text; homeowner : Principal; contractor : ?Principal; status : { #Pending; #InProgress; #Completed; #Verified; #PendingHomeownerApproval; #RejectedByHomeowner } }; #err : Any };
    };
    // Start every lookup first, then await them, so the calls run concurrently.
    var pending : [async { #ok : { propertyId : Text; homeowner : Principal; contractor : ?Principal; status : { #Pending; #InProgress; #Completed; #Verified; #PendingHomeownerApproval; #RejectedByHomeowner } }; #err : Any }] = [];
    for (id in jobIds.values()) {
      pending := pending.concat([jobActor.getJob(id)]);
    };
    var out : [JobPropertyAddress] = [];
    var i = 0;
    for (f in pending.values()) {
      let jobId = jobIds[i];
      i += 1;
      let r = try { await f } catch _ { #err(()) };
      switch (r) {
        case (#ok(j)) {
          let accepted = switch (j.status) {
            case (#PendingHomeownerApproval or #RejectedByHomeowner) false;
            case _ true;
          };
          let isParty = j.homeowner == msg.caller or
            (accepted and (switch (j.contractor) { case (?c) c == msg.caller; case null false }));
          if (isParty) {
            // Read the property after the await (state may have changed).
            switch (properties.get(j.propertyId)) {
              case (?p) {
                if (p.isActive) {
                  out := out.concat([{ jobId; propertyId = p.id; address = p.address }]);
                };
              };
              case null {};
            };
          };
        };
        case (#err(_)) {};
      };
    };
    out
  };

  /// Called by a Manager-role user (via the frontend) after completing a
  /// significant write action to notify the property owner.
  public shared(msg) func recordManagerActivity(
    propertyId  : Text,
    description : Text
  ) : async Result.Result<(), Error> {
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Text.size(description) > MAX_DESCRIPTION_CHARS)
      return #err(#InvalidInput("description exceeds " # MAX_DESCRIPTION_CHARS.toText() # " characters"));
    // Resolve manager's display name for the notification
    let managerName : Text = switch (managersMap.get(propertyId)) {
      case null "A manager";
      case (?mgrs) {
        var found = "A manager";
        for (m in mgrs.values()) {
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
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let notifs = switch (ownerNotifs.get(propertyId)) {
          case null    [];
          case (?list) list;
        };
        // Return newest first
        let sorted = notifs.sort(func(a, b) {
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
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        ownerNotifs.add(propertyId, []);
        #ok(())
      };
    }
  };

  /// Called by a Manager who wants to spend above their limit (or a Viewer
  /// requesting an action they can't take directly). Sits in the owner's
  /// approval queue until respondToApproval() is called.
  public shared(msg) func requestApproval(
    propertyId  : Text,
    description : Text,
    amountCents : Nat
  ) : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (not checkAuthorized(propertyId, msg.caller, false)) return #err(#NotAuthorized);
    if (Text.size(description) > MAX_DESCRIPTION_CHARS)
      return #err(#InvalidInput("description exceeds " # MAX_DESCRIPTION_CHARS.toText() # " characters"));
    let pendingCount = switch (approvalsMap.get(propertyId)) {
      case null    0;
      case (?list) list.filter(func(a) { a.status == #Pending }).size();
    };
    if (pendingCount >= MAX_APPROVALS_PER_PROPERTY)
      return #err(#InvalidInput("Too many pending approval requests for this property"));
    let requesterName : Text = switch (managersMap.get(propertyId)) {
      case null "A manager";
      case (?mgrs) {
        var found = "A manager";
        for (m in mgrs.values()) {
          if (m.principal == msg.caller) found := m.displayName;
        };
        found
      };
    };
    approvalCounter += 1;
    let req : PendingApprovalRequest = {
      id = approvalCounter;
      propertyId;
      requestedBy = msg.caller;
      requesterName;
      description;
      amountCents;
      createdAt = Time.now();
      status = #Pending;
    };
    let existing = switch (approvalsMap.get(propertyId)) {
      case null    [];
      case (?list) list;
    };
    // M-5: once the history is full, drop the oldest resolved requests.
    var trimmed = existing;
    while (trimmed.size() >= MAX_APPROVALS_PER_PROPERTY) {
      var dropped = false;
      trimmed := trimmed.filter(func(a) {
        if (not dropped and a.status != #Pending) { dropped := true; false } else true
      });
      if (not dropped) return #err(#InvalidInput("Too many pending approval requests for this property"));
    };
    approvalsMap.add(propertyId, trimmed.concat([req]));
    pushNotification(propertyId, msg.caller, requesterName, "Requested approval: " # description);
    #ok(approvalCounter)
  };

  /// Owner approves or declines a pending approval request.
  public shared(msg) func respondToApproval(
    propertyId : Text,
    approvalId : Nat,
    approve    : Bool
  ) : async Result.Result<(), Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let existing = switch (approvalsMap.get(propertyId)) {
          case null    return #err(#NotFound);
          case (?list) list;
        };
        let found = existing.find(func(a) { a.id == approvalId });
        switch found {
          case null return #err(#NotFound);
          case _ {};
        };
        let newStatus = if (approve) #Approved else #Declined;
        let updated = existing.map(func(a) {
          if (a.id == approvalId) { { a with status = newStatus } } else a
        });
        approvalsMap.add(propertyId, updated);
        #ok(())
      };
    }
  };

  /// Returns all approval requests for a property (any status), newest first.
  /// Only the property owner may call this.
  public query(msg) func getApprovals(propertyId: Text) : async Result.Result<[PendingApprovalRequest], Error> {
    switch (properties.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?prop) {
        if (prop.owner != msg.caller) return #err(#NotAuthorized);
        let list = switch (approvalsMap.get(propertyId)) {
          case null    [];
          case (?l)    l;
        };
        let sorted = list.sort(func(a, b) {
          if      (a.createdAt > b.createdAt) #less
          else if (a.createdAt < b.createdAt) #greater
          else                                #equal
        });
        #ok(sorted)
      };
    }
  };

  /// Public query: returns true if `caller` is the owner OR an authorised manager.
  /// `requireWrite` = true means #Viewer role is not sufficient.
  /// Called cross-canister by job, photo, quote, and maintenance canisters for auth checks.
  public query func isAuthorized(
    propertyId  : Text,
    caller      : Principal,
    requireWrite : Bool
  ) : async Bool {
    checkAuthorized(propertyId, caller, requireWrite)
  };

  /// Public query: the principal's role on a property, or null when the
  /// property doesn't exist. Finer-grained than isAuthorized — called
  /// cross-canister by bills, which hides mortgage entries from #Manager/#Viewer.
  public query func getAccessRole(propertyId : Text, principal : Principal) : async ?AccessRole {
    accessRoleOf(propertyId, principal)
  };

  /// Most property ids getAccessRoles answers in one call; the rest come back null.
  private transient let MAX_ROLE_BATCH : Nat = 100;

  /// getAccessRole for many properties at once, in the same order. Lets job,
  /// bills and recurring answer "records for all my properties" with one
  /// cross-canister call instead of one per property.
  public query func getAccessRoles(propertyIds : [Text], principal : Principal) : async [?AccessRole] {
    Array.tabulate<?AccessRole>(propertyIds.size(), func(i) {
      if (i < MAX_ROLE_BATCH) accessRoleOf(propertyIds[i], principal) else null
    })
  };

  private func accessRoleOf(propertyId : Text, principal : Principal) : ?AccessRole {
    switch (properties.get(propertyId)) {
      case null null;
      case (?prop) {
        if (prop.owner == principal) return ?#Owner;
        let mgrs = switch (managersMap.get(propertyId)) {
          case null    [];
          case (?list) list;
        };
        for (m in mgrs.values()) {
          if (m.principal == principal) {
            return ?(switch (m.role) {
              case (#CoOwner) #CoOwner;
              case (#Manager) #Manager;
              case (#Viewer)  #Viewer;
            });
          };
        };
        ?#NoAccess
      };
    }
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────


  /// Wire the property canister to the payment canister for live tier enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := id.toText();
    #ok(())
  };

  /// Wire the property canister to the job canister (admin only). The job
  /// canister must also list this canister as trusted so getJob answers it.
  public shared(msg) func setJobCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := ?id;
    #ok(())
  };

  public shared(msg) func setListingCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    listingCanisterId := id.toText();
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
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminInitialized, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    admins := Admin.add(admins, newAdmin);
    adminInitialized := true;
    try { ignore await auditLog("AdminAdded", ?newAdmin, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Admin.remove(admins, target);
    #ok(())
  };

  public shared(msg) func setAuditCanisterId(id : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { ignore await auditLog("AuditCanisterSet", ?id, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    auditCanisterId := ?id;
    #ok(())
  };

  private func auditLog(action : Text, subject : ?Principal, detail : Text) : async () {
    await* Canisters.auditLog(auditCanisterId, "property", action, subject, detail)
  };

  /// Register a canister principal as trusted for inter-canister calls.
  /// Trusted canisters (job, report) bypass per-principal rate limiting. Admin only.
  public shared(msg) func addTrustedCanister(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisterEntries := Admin.add(trustedCanisterEntries, p);
    try { ignore await auditLog("TrustedCanisterAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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

  /// Allow the notification relay to read Home Pulse property summaries. Admin only.
  public shared(msg) func addNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    notifierEntries := Admin.add(notifierEntries, p);
    #ok(())
  };

  public shared(msg) func removeNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    notifierEntries := Admin.remove(notifierEntries, p);
    #ok(())
  };

  /// What the weekly Home Pulse email needs about `owner`'s active
  /// properties: address, zip (for the climate zone) and year built. No
  /// identity or verification evidence. Notifiers and admins only.
  public query(msg) func getPulseProperties(owner: Principal) : async Result.Result<[PulseProperty], Error> {
    if (not Admin.contains(notifierEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(ownedBy(owner).filter(func(p: Property) : Bool { p.isActive }).map(func(p: Property) : PulseProperty {
      { id = p.id; address = p.address; city = p.city; state = p.state; zipCode = p.zipCode; yearBuilt = p.yearBuilt }
    }).toArray())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
    try { ignore await auditLog("CanisterPaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    try { ignore await auditLog("CanisterUnpaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  // ─── Metrics ──────────────────────────────────────────────────────────────

  public query func getMetrics() : async Metrics {
    var verified      = 0;
    var pendingReview = 0;
    var unverified    = 0;

    for (p in properties.values()) {
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
      errorsByMethod          = errsByMethod.entries().toArray();
    }
  };

  // ─── Account deletion ─────────────────────────────────────────────────────

  /// Account deletion: removes everything this canister holds for the caller.
  /// Every property the caller owns goes, with its rooms/fixtures, managers,
  /// manager invites, approval requests, owner notifications, pending
  /// transfer and transfer history. Identity-check and verification-document
  /// data live on the Property record itself, so they go with it. The address
  /// index is re-pointed at another claim on the same address if one exists,
  /// otherwise the address is released (index + addressClaimSince dropped) so
  /// someone else can claim it. The caller is also removed as a manager from
  /// other owners' properties. Synchronous: nothing can interleave.
  /// Returns how many records were removed.
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err e) return #err e; case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    let caller = msg.caller;
    // A registration suspended at an await would write a property after us.
    if (inFlightRegistrations.get(caller.toText()) != null)
      return #err(#InvalidInput("A property registration is in progress; try again shortly"));

    var removed = 0;
    let owned = ownedBy(caller).toArray();

    for (p in owned.values()) {
      let pid = p.id;

      // Rooms (and their fixtures) on this property.
      let roomIds = Index.ids(roomsByProperty, pid).toArray();
      for (rid in roomIds.values()) {
        Index.delete(rooms, roomIndexes, rid);
        removed += 1;
      };

      // Managers, invites (+ token index), approvals, owner notifications.
      clearDelegatedAccess(pid);

      // Pending transfer and its token index.
      switch (pendingTransfers.get(pid)) {
        case (?pt) { tokenIndex.remove(pt.token); pendingTransfers.remove(pid); removed += 1 };
        case null  {};
      };

      // Transfer history for this property.
      let histKeys = transfers.entries()
        .filter(func((_, r) : (Nat, TransferRecord)) : Bool { r.propertyId == pid })
        .map(func((k, _) : (Nat, TransferRecord)) : Nat { k })
        .toArray();
      for (k in histKeys.values()) { transfers.remove(k); removed += 1 };

      // The property itself (also unfiles it from propertiesByOwner).
      Index.delete(properties, propertyIndexes, pid);
      removed += 1;

      // Address index: only touch it if it points at this property.
      let key = addressKey(p.address, p.city, p.state, p.zipCode);
      switch (addressIdx.get(key)) {
        case (?indexedId) {
          if (indexedId == pid) {
            // Re-point at the best remaining claim on the same address
            // (verified wins, else newest — same rule as rekeyAddressIndex).
            var best : ?Property = null;
            for (other in properties.values()) {
              if (addressKey(other.address, other.city, other.state, other.zipCode) == key) {
                best := switch (best) {
                  case null ?other;
                  case (?b) {
                    if (isVerified(b.verificationLevel) != isVerified(other.verificationLevel)) {
                      if (isVerified(other.verificationLevel)) ?other else ?b
                    } else if (other.createdAt > b.createdAt) ?other else ?b
                  };
                };
              };
            };
            switch (best) {
              case (?b) { addressIdx.add(key, b.id) };
              case null {
                // No claim left on this address: release it entirely so the
                // next registrant starts clean and nothing dangles.
                addressIdx.remove(key);
                addressClaimSince.remove(key);
              };
            };
          };
        };
        case null {
          // Unindexed address: drop the claim-run start only if no property
          // at this address remains.
          let anyLeft = properties.values().find(func(o : Property) : Bool {
            addressKey(o.address, o.city, o.state, o.zipCode) == key
          });
          if (anyLeft == null) { addressClaimSince.remove(key) };
        };
      };
    };

    // Remove the caller as a delegated manager on other owners' properties.
    let managedIds = managersMap.entries()
      .filter(func((_, ms) : (Text, [PropertyManager])) : Bool {
        ms.find(func(m : PropertyManager) : Bool { m.principal == caller }) != null
      })
      .map(func((k, _) : (Text, [PropertyManager])) : Text { k })
      .toArray();
    for (pid in managedIds.values()) {
      switch (managersMap.get(pid)) {
        case (?ms) {
          managersMap.add(pid, ms.filter(func(m : PropertyManager) : Bool { m.principal != caller }));
          removed += 1;
        };
        case null {};
      };
    };

    // L-7 (2026-10-28 audit): homes the caller sold or bought keep their
    // ownership history, with the deleted account replaced by the anonymous
    // principal.
    let anon = Principal.anonymous();
    let named = transfers.entries()
      .filter(func((_, r) : (Nat, TransferRecord)) : Bool { r.from == caller or r.to == caller })
      .toArray();
    for ((k, r) in named.values()) {
      transfers.add(k, {
        r with
        from = if (r.from == caller) anon else r.from;
        to   = if (r.to == caller) anon else r.to;
      });
      removed += 1;
    };

    updateCallLimits.remove(caller.toText());
    #ok(removed)
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

    let succeeded = List.empty<Text>();
    let failed    = List.empty<BulkImportError>();

    var i = 0;
    for (args in rows.values()) {
      // Duplicate address check against the same index registerProperty uses
      // (an active property at this address, or an earlier row in this batch).
      let key = addressKey(args.address, args.city, args.state, args.zipCode);
      let duplicate = switch (addressIdx.get(key)) {
        case (?existingId) {
          switch (properties.get(existingId)) {
            case (?existing) { existing.isActive };
            case null        { false };
          }
        };
        case null { false };
      };

      if (duplicate) {
        failed.add({ index = i; reason = "DuplicateAddress" });
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
          identityVerified     = null;
          identityVerifiedAt   = null;
          identitySessionId    = null;
          nameOnId             = null;
          nameOnDocument       = null;
          contestedWithId      = null;
          conflictWindowEndsAt = null;
        };
        putProperty(prop);
        addressIdx.add(key, newId);
        succeeded.add(newId);
      };
      i += 1;
    };

    { succeeded = succeeded.toArray(); failed = failed.toArray() }
  };

  // ─── Room / Fixture CRUD (merged from room canister) ─────────────────────

  private func nextRoomId() : Text {
    roomCounter += 1;
    "ROOM_" # roomCounter.toText()
  };

  private func nextFixtureId() : Text {
    fixtureCounter += 1;
    "FIX_" # fixtureCounter.toText()
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
    // M-5: bound rooms per property.
    if (Index.count(roomsByProperty, args.propertyId) >= MAX_ROOMS_PER_PROPERTY)
      return #err(#InvalidInput("A property can have at most " # MAX_ROOMS_PER_PROPERTY.toText() # " rooms"));

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
    putRoom(room);
    #ok(room)
  };

  /// Room data (fixture serial numbers, notes) is visible to anyone with
  /// access to the property, admins and trusted canisters.
  private func canReadRooms(propertyId : Text, caller : Principal) : Bool {
    checkAuthorized(propertyId, caller, false) or isAdmin(caller) or isTrustedCanister(caller)
  };

  /// M-3: room writes are authorised by the caller's current write access to
  /// the room's property, not by who created the room — so a previous owner
  /// or a removed manager loses control, and the current owner gains it.
  private func canWriteRoom(room : RoomRecord, caller : Principal) : Bool {
    checkAuthorized(room.propertyId, caller, true)
  };

  /// Fetch a single room by ID.
  public query(msg) func getRoom(id: Text) : async Result.Result<RoomRecord, Error> {
    switch (rooms.get(id)) {
      case null  { #err(#NotFound) };
      case (?r)  {
        if (not canReadRooms(r.propertyId, msg.caller)) return #err(#NotAuthorized);
        #ok(r)
      };
    }
  };

  /// Fetch all rooms for a property ([] for callers without access).
  public query(msg) func getRoomsByProperty(propertyId: Text) : async [RoomRecord] {
    if (not canReadRooms(propertyId, msg.caller)) return [];
    Index.records(roomsByProperty, propertyId, rooms).toArray(
      
    )
  };

  /// Update room metadata. Requires write access to the room's property.
  public shared(msg) func updateRoom(id: Text, args: UpdateRoomArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (rooms.get(id)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (not canWriteRoom(existing, msg.caller)) return #err(#NotAuthorized);
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
        putRoom(updated);
        #ok(updated)
      };
    }
  };

  /// Delete a room and all its fixtures. Requires write access to the property.
  public shared(msg) func deleteRoom(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (rooms.get(id)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (not canWriteRoom(room, msg.caller)) return #err(#NotAuthorized);
        Index.delete(rooms, roomIndexes, id);
        #ok(())
      };
    }
  };

  /// Add a fixture to a room. Requires write access to the room's property.
  public shared(msg) func addFixture(roomId: Text, args: AddFixtureArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (rooms.get(roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (not canWriteRoom(room, msg.caller)) return #err(#NotAuthorized);
        if (Text.size(args.brand)          > 100)  return #err(#InvalidInput("brand exceeds 100 characters"));
        if (Text.size(args.model)          > 100)  return #err(#InvalidInput("model exceeds 100 characters"));
        if (Text.size(args.serialNumber)   > 100)  return #err(#InvalidInput("serialNumber exceeds 100 characters"));
        if (Text.size(args.installedDate)  > 20)   return #err(#InvalidInput("installedDate exceeds 20 characters"));
        if (Text.size(args.warrantyExpiry) > 20)   return #err(#InvalidInput("warrantyExpiry exceeds 20 characters"));
        if (Text.size(args.notes)          > 1000) return #err(#InvalidInput("notes exceed 1000 characters"));
        // M-5: bound fixtures per room.
        if (room.fixtures.size() >= MAX_FIXTURES_PER_ROOM)
          return #err(#InvalidInput("A room can have at most " # MAX_FIXTURES_PER_ROOM.toText() # " fixtures"));

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
          fixtures   = room.fixtures.concat([fixture]);
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        putRoom(updated);
        #ok(updated)
      };
    }
  };

  /// Update an existing fixture within a room.
  public shared(msg) func updateFixture(roomId: Text, fixtureId: Text, args: AddFixtureArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (rooms.get(roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (not canWriteRoom(room, msg.caller)) return #err(#NotAuthorized);
        if (Text.size(args.brand)          > 100)  return #err(#InvalidInput("brand exceeds 100 characters"));
        if (Text.size(args.model)          > 100)  return #err(#InvalidInput("model exceeds 100 characters"));
        if (Text.size(args.serialNumber)   > 100)  return #err(#InvalidInput("serialNumber exceeds 100 characters"));
        if (Text.size(args.installedDate)  > 20)   return #err(#InvalidInput("installedDate exceeds 20 characters"));
        if (Text.size(args.warrantyExpiry) > 20)   return #err(#InvalidInput("warrantyExpiry exceeds 20 characters"));
        if (Text.size(args.notes)          > 1000) return #err(#InvalidInput("notes exceed 1000 characters"));

        let found = room.fixtures.find(func(f) { f.id == fixtureId });
        switch (found) {
          case null { return #err(#NotFound) };
          case _    {};
        };

        let updatedFixtures = room.fixtures.map(func(f) {
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
        putRoom(updated);
        #ok(updated)
      };
    }
  };

  /// Remove a fixture from a room.
  public shared(msg) func removeFixture(roomId: Text, fixtureId: Text) : async Result.Result<RoomRecord, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (rooms.get(roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (not canWriteRoom(room, msg.caller)) return #err(#NotAuthorized);
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
          fixtures   = room.fixtures.filter(func(f) { f.id != fixtureId });
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        putRoom(updated);
        #ok(updated)
      };
    }
  };

  /// Room-level metrics (total rooms and fixtures across all properties).
  public query func getRoomMetrics() : async RoomMetrics {
    var totalFixtures = 0;
    for (r in rooms.values()) {
      totalFixtures += r.fixtures.size();
    };
    {
      totalRooms    = rooms.size();
      totalFixtures;
    }
  };
}
