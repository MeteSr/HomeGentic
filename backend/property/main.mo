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
import Order     "mo:core/Order";
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
import Inspect "../shared/Inspect";
import Errors "../shared/Errors";
import ApiDoc "ApiDoc";
import Insurance "Insurance";
import HouseGuide "HouseGuide";
import Hoa "Hoa";
import HomeFinance "HomeFinance";
import FloodZone "FloodZone";
import MoveIn "MoveIn";
import PropertyTax "PropertyTax";
import Succession "Succession";
import Notify "../shared/Notify";

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

  /// #711: the hurricane deductible on a home insurance policy, as printed on
  /// the declarations page: a whole percent of Coverage A (1–25) or a dollar
  /// amount in cents.
  public type HurricaneDeductible = {
    #PercentOfCoverageA : Nat;
    #Amount             : Nat;
  };

  /// #711: the household's own copy of the home's insurance policy details.
  /// `renewalDate` is a calendar date, "YYYY-MM-DD". Nothing here is checked
  /// with the carrier.
  public type InsurancePolicyInput = {
    carrier             : Text;
    policyNumber        : Text;
    renewalDate         : Text;
    coverageACents      : ?Nat;
    hurricaneDeductible : ?HurricaneDeductible;
  };

  public type InsurancePolicy = {
    carrier             : Text;
    policyNumber        : Text;
    renewalDate         : Text;
    coverageACents      : ?Nat;
    hurricaneDeductible : ?HurricaneDeductible;
    updatedAt           : Int;
  };

  /// #711: what the weekly Home Pulse email needs for a renewal reminder.
  public type PulseInsurance = {
    propertyId  : Text;
    carrier     : Text;
    renewalDate : Text;
  };

  public type ClaimStatus    = Insurance.ClaimStatus;
  public type ClaimInput     = Insurance.ClaimInput;
  public type ClaimLogEntry  = Insurance.ClaimLogEntry;
  public type InsuranceClaim = Insurance.InsuranceClaim;
  public type InventoryItemInput = Insurance.InventoryItemInput;
  public type InventoryItem      = Insurance.InventoryItem;
  public type GuideContact       = HouseGuide.GuideContact;
  public type HouseGuideInput    = HouseGuide.GuideInput;
  public type HouseGuideRecord   = HouseGuide.HouseGuide;
  public type HouseGuideLink     = HouseGuide.GuideLink;
  public type SharedHouseGuide   = HouseGuide.SharedHouseGuide;
  public type ReviewStatus        = Hoa.ReviewStatus;
  public type ReviewInput         = Hoa.ReviewInput;
  public type ArchitecturalReview = Hoa.ArchitecturalReview;
  public type AssessmentInput     = Hoa.AssessmentInput;
  public type SpecialAssessment   = Hoa.SpecialAssessment;
  public type CondoRecordInput    = Hoa.CondoRecordInput;
  public type CondoRecord         = Hoa.CondoRecord;
  public type HomeWarrantyPlanInput  = HomeFinance.PlanInput;
  public type HomeWarrantyPlan       = HomeFinance.Plan;
  public type WarrantyClaimOutcome   = HomeFinance.ClaimOutcome;
  public type HomeWarrantyClaimInput = HomeFinance.ClaimInput;
  public type HomeWarrantyClaim      = HomeFinance.Claim;
  public type MortgageLoanInput      = HomeFinance.LoanInput;
  public type MortgageLoan           = HomeFinance.Loan;
  public type PulseHomeFinance       = HomeFinance.PulseHomeFinance;
  public type FloodZoneStatus        = FloodZone.Status;
  public type FloodZoneInput         = FloodZone.Input;
  public type FloodZoneRecord        = FloodZone.FloodZone;
  public type FloodTarget            = FloodZone.Target;
  public type MoveInTaskUrgency      = MoveIn.TaskUrgency;
  public type TaxExemption           = PropertyTax.Exemption;
  public type PropertyTaxYearInput   = PropertyTax.YearInput;
  public type PropertyTaxYear        = PropertyTax.Year;
  public type PulsePropertyTax       = PropertyTax.PulsePropertyTax;
  public type MoveInTaskInput        = MoveIn.TaskInput;
  public type MoveInTask             = MoveIn.Task;
  public type MoveInPlan             = MoveIn.Plan;
  public type SuccessorInput         = Succession.SuccessorInput;
  public type Successor              = Succession.Successor;
  public type SuccessionProofKind    = Succession.ProofKind;
  public type SuccessionClaimInput   = Succession.ClaimInput;
  public type SuccessionClaimStatus  = Succession.ClaimStatus;
  public type SuccessionClaim        = Succession.Claim;
  public type SuccessionProof        = Succession.Proof;
  /// What a successor link shows: the home (identity and verification
  /// evidence blanked), who the owner named, and the waiting period.
  public type SuccessionInvite = {
    property      : Property;
    successorName : Text;
    waitDays      : Nat;
  };
  /// One claim in the admin review queue.
  public type SuccessionReview = {
    claim     : SuccessionClaim;
    property  : Property;
    successor : ?Successor;
  };
  /// What the notification relay needs to send a waiting-period reminder.
  public type SuccessionNotice = {
    claim     : SuccessionClaim;
    address   : Text;
    household : [Principal];
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

  public type Error = Errors.Common or {
    #LimitReached;
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
  /// Photo canister ID (setPhotoCanisterId / PUBLIC_CANISTER_ID:photo). M-1
  /// (security audit 2026-11-10): a hand-over tells it to keep the previous
  /// household's personal papers private to them (photo.propertyTransferred).
  private var photoCanisterId          : Text        = "";

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
  /// #711: propertyId → the home's insurance policy (setInsurancePolicy). A
  /// side map, since a new field on Property (stored in a Map) is not
  /// stable-compatible. Dropped when the home changes hands (claimTransfer)
  /// or its owner deletes their data.
  private let insurancePolicies = Map.empty<Text, InsurancePolicy>();

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

  /// #711 claim kit: claimId → the household's record of an insurance claim
  /// on the home. Indexed by property (transient, rebuilt on upgrade). Dropped
  /// with the policy on claimTransfer and deleteMyData.
  private let insuranceClaims = Map.empty<Text, InsuranceClaim>();
  private transient let claimsByProperty = Index.empty();
  private transient let claimIndexes : [Index.Keyed<InsuranceClaim>] = Index.indexed(insuranceClaims, [
    (claimsByProperty, func(c : InsuranceClaim) : ?Text { ?c.propertyId }),
  ]);
  private func putClaim(c : InsuranceClaim) { Index.put(insuranceClaims, claimIndexes, c.id, c) };
  /// Removes every claim on a property; returns how many.
  private func dropClaims(propertyId : Text) : Nat {
    let ids = Index.ids(claimsByProperty, propertyId).toArray();
    for (id in ids.values()) { Index.delete(insuranceClaims, claimIndexes, id) };
    ids.size()
  };

  /// #711 contents inventory: itemId → one thing in the home and its value.
  /// Indexed by property (transient). Dropped on claimTransfer and deleteMyData.
  private let inventoryItems = Map.empty<Text, InventoryItem>();
  private transient let inventoryByProperty = Index.empty();
  private transient let inventoryIndexes : [Index.Keyed<InventoryItem>] = Index.indexed(inventoryItems, [
    (inventoryByProperty, func(i : InventoryItem) : ?Text { ?i.propertyId }),
  ]);
  private func putItem(i : InventoryItem) { Index.put(inventoryItems, inventoryIndexes, i.id, i) };
  private func dropInventory(propertyId : Text) : Nat {
    let ids = Index.ids(inventoryByProperty, propertyId).toArray();
    for (id in ids.values()) { Index.delete(inventoryItems, inventoryIndexes, id) };
    ids.size()
  };

  /// #725 house guide: propertyId → the guide the household wrote for
  /// sitters and guests. Dropped (with its links) on claimTransfer and
  /// deleteMyData: Wi-Fi and alarm details are the seller's.
  private let houseGuides = Map.empty<Text, HouseGuide.HouseGuide>();
  /// #725: token → a link that shares one home's guide. Indexed by property.
  private let guideLinks = Map.empty<Text, HouseGuide.GuideLink>();
  private transient let guideLinksByProperty = Index.empty();
  private transient let guideLinkIndexes : [Index.Keyed<HouseGuide.GuideLink>] = Index.indexed(guideLinks, [
    (guideLinksByProperty, func(l : HouseGuide.GuideLink) : ?Text { ?l.propertyId }),
  ]);
  /// Removes a home's guide and every link to it; returns how many records.
  private func dropGuide(propertyId : Text) : Nat {
    var n = 0;
    if (houseGuides.get(propertyId) != null) { houseGuides.remove(propertyId); n += 1 };
    let tokens = Index.ids(guideLinksByProperty, propertyId).toArray();
    for (t in tokens.values()) { Index.delete(guideLinks, guideLinkIndexes, t) };
    n + tokens.size()
  };

  /// #726 HOA paperwork: review requests and special assessments by id,
  /// indexed by property, and propertyId → the condo association record.
  /// These stay with the home when it changes hands (an approval runs with
  /// the property); deleteMyData drops them.
  private let archReviews = Map.empty<Text, Hoa.ArchitecturalReview>();
  private transient let reviewsByProperty = Index.empty();
  private transient let reviewIndexes : [Index.Keyed<Hoa.ArchitecturalReview>] = Index.indexed(archReviews, [
    (reviewsByProperty, func(r : Hoa.ArchitecturalReview) : ?Text { ?r.propertyId }),
  ]);
  private let specialAssessments = Map.empty<Text, Hoa.SpecialAssessment>();
  private transient let assessmentsByProperty = Index.empty();
  private transient let assessmentIndexes : [Index.Keyed<Hoa.SpecialAssessment>] = Index.indexed(specialAssessments, [
    (assessmentsByProperty, func(a : Hoa.SpecialAssessment) : ?Text { ?a.propertyId }),
  ]);
  private let condoRecords = Map.empty<Text, Hoa.CondoRecord>();
  private func dropHoa(propertyId : Text) : Nat {
    let r = Index.ids(reviewsByProperty, propertyId).toArray();
    for (id in r.values()) { Index.delete(archReviews, reviewIndexes, id) };
    let a = Index.ids(assessmentsByProperty, propertyId).toArray();
    for (id in a.values()) { Index.delete(specialAssessments, assessmentIndexes, id) };
    var n = r.size() + a.size();
    if (condoRecords.get(propertyId) != null) { condoRecords.remove(propertyId); n += 1 };
    n
  };

  /// #719: propertyId → the home warranty plan (service contract), and
  /// claimId → a claim filed under it, indexed by property. The plan is the
  /// seller's contract, so it goes on claimTransfer; the claim history stays
  /// with the home like its jobs. deleteMyData drops both.
  private let homeWarrantyPlans = Map.empty<Text, HomeFinance.Plan>();
  private let homeWarrantyClaims = Map.empty<Text, HomeFinance.Claim>();
  private transient let hwClaimsByProperty = Index.empty();
  private transient let hwClaimIndexes : [Index.Keyed<HomeFinance.Claim>] = Index.indexed(homeWarrantyClaims, [
    (hwClaimsByProperty, func(c : HomeFinance.Claim) : ?Text { ?c.propertyId }),
  ]);
  private func dropWarrantyClaims(propertyId : Text) : Nat {
    let ids = Index.ids(hwClaimsByProperty, propertyId).toArray();
    for (id in ids.values()) { Index.delete(homeWarrantyClaims, hwClaimIndexes, id) };
    ids.size()
  };

  /// #722: propertyId → the owner's mortgage details. Owner and co-owners
  /// only. Dropped on claimTransfer and deleteMyData.
  private let mortgageLoans = Map.empty<Text, HomeFinance.Loan>();

  /// #718: propertyId → the FEMA flood zone the Worker last read for the
  /// address. It describes the land, so it stays on claimTransfer;
  /// deleteMyData drops it with the home.
  private let floodZones = Map.empty<Text, FloodZone.FloodZone>();

  /// #714: propertyId → the owner's property-tax years, newest first, one
  /// per tax year. Owner and co-owners only (the exemption is the owner's).
  /// Dropped on claimTransfer and deleteMyData.
  private let propertyTaxYears = Map.empty<Text, [PropertyTax.Year]>();

  /// #712: propertyId → the household's move-in plan (steps done, tasks from
  /// the purchase inspection). A buyer gets a fresh one on claimTransfer (the
  /// seller's goes); deleteMyData drops it.
  private let moveInPlans = Map.empty<Text, MoveIn.Plan>();
  /// Next move-in task id ("mt-<n>").
  private var moveInTaskCounter : Nat = 0;

  /// #724: propertyId → the successor the owner named, and the successor
  /// link's token → propertyId. Owner only. Dropped when the home changes
  /// hands (a new owner names their own) and on deleteMyData.
  private let successors        = Map.empty<Text, Succession.Successor>();
  private let successorTokenIdx = Map.empty<Text, Text>();
  /// #724: claimId → claim (resolved ones kept as the claimant's record),
  /// propertyId → its one open claim, and claimId → the proof file, held
  /// only while the claim is open.
  private let successionClaims   = Map.empty<Text, Succession.Claim>();
  private let openClaimByProperty = Map.empty<Text, Text>();
  private let successionProofs   = Map.empty<Text, Succession.Proof>();
  private var successionClaimCounter : Nat = 0;

  /// Push/email outbox read by the notification relay (shared/Notify.mo).
  /// #724 waiting-period notices: succession_claim_opened / _approved /
  /// _rejected / _cancelled; refId is the claim id, summary the address.
  private let notifyLog       = Map.empty<Nat, Notify.Event>();
  private var notifyLatestSeq : Nat = 0;

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
  /// Reject anonymous callers, zero-byte payloads and oversized arguments
  /// before execution (shared/Inspect.mo, cycle-drain CD-5). Only
  /// `openSuccessionClaim` (#724, carries the proof document) may send up to
  /// MAX_UPLOAD_ARG_BYTES; everything else is capped at MAX_ARG_BYTES. Every
  /// public method is listed: the compiler rejects an inspect that misses one,
  /// so a new method has to be added here. Each method keeps its own checks.
  system func inspect({
    caller : Principal;
    arg : Blob;
    msg : {
      #addAdmin : Any;
      #addArchitecturalReview : Any;
      #addFixture : Any;
      #addHomeWarrantyClaim : Any;
      #addIdentityRelay : Any;
      #addInsuranceClaimLog : Any;
      #addInventoryItem : Any;
      #addMoveInTasks : Any;
      #addNotifier : Any;
      #addSpecialAssessment : Any;
      #addTrustedCanister : Any;
      #bulkRegisterProperties : Any;
      #cancelManagerInvite : Any;
      #cancelSuccessionClaim : Any;
      #cancelTransfer : Any;
      #claimManagerRole : Any;
      #claimTransfer : Any;
      #completeSuccessionClaim : Any;
      #createHouseGuideLink : Any;
      #createInsuranceClaim : Any;
      #createRoom : Any;
      #deleteArchitecturalReview : Any;
      #deleteHomeWarrantyClaim : Any;
      #deleteInsuranceClaim : Any;
      #deleteInventoryItem : Any;
      #deleteMoveInTask : Any;
      #deleteMyData : Any;
      #deletePropertyTaxYear : Any;
      #deleteRoom : Any;
      #deleteSpecialAssessment : Any;
      #dismissNotifications : Any;
      #endMoveInPlan : Any;
      #findPropertiesByAddress : Any;
      #getAccessRole : Any;
      #getAccessRoles : Any;
      #getApiDoc : Any;
      #getApprovals : Any;
      #getArchitecturalReviews : Any;
      #getCondoAssociationRecord : Any;
      #getFloodZone : Any;
      #getHomeWarrantyClaims : Any;
      #getHomeWarrantyPlan : Any;
      #getHouseGuide : Any;
      #getInsuranceClaims : Any;
      #getInsurancePolicy : Any;
      #getInventory : Any;
      #getJobPropertyAddresses : Any;
      #getManagerInviteByToken : Any;
      #getMetrics : Any;
      #getMortgageLoan : Any;
      #getMoveInPlan : Any;
      #getMyManagedProperties : Any;
      #getMyProperties : Any;
      #getMySuccessionClaims : Any;
      #getNotificationEvents : Any;
      #getOpenSuccessionClaim : Any;
      #getOwnerNotifications : Any;
      #getOwnershipHistory : Any;
      #getPendingInvitesForProperty : Any;
      #getPendingTransfer : Any;
      #getPendingTransferByToken : Any;
      #getPendingVerifications : Any;
      #getPropertiesByOwner : Any;
      #getProperty : Any;
      #getPropertyAddress : Any;
      #getPropertyByManagerInviteToken : Any;
      #getPropertyByTransferToken : Any;
      #getPropertyLimitForTier : Any;
      #getPropertyManagers : Any;
      #getPropertyOwner : Any;
      #getPropertyTaxYears : Any;
      #getPropertyYearBuilt : Any;
      #getPulseHomeFinance : Any;
      #getPulseInsurance : Any;
      #getPulseProperties : Any;
      #getPulsePropertyTax : Any;
      #getRoom : Any;
      #getRoomMetrics : Any;
      #getRoomsByProperty : Any;
      #getSharedHouseGuide : Any;
      #getSpecialAssessments : Any;
      #getSuccessionInvite : Any;
      #getSuccessionNotice : Any;
      #getSuccessionProof : Any;
      #getSuccessor : Any;
      #getTrustedCanisters : Any;
      #getVerificationLevel : Any;
      #getVerifyStatus : Any;
      #guideSharesPhoto : Any;
      #initiateTransfer : Any;
      #inviteManager : Any;
      #isAdminPrincipal : Any;
      #isAuthorized : Any;
      #listHouseGuideLinks : Any;
      #listIdentityRelays : Any;
      #listSuccessionClaimsForReview : Any;
      #markIdentityCleared : Any;
      #openSuccessionClaim : Any;
      #pause : Any;
      #recordManagerActivity : Any;
      #registerProperty : Any;
      #relayFloodTarget : Any;
      #relayMarkIdentityCleared : Any;
      #relaySetFloodZone : Any;
      #removeAdmin : Any;
      #removeFixture : Any;
      #removeIdentityRelay : Any;
      #removeManager : Any;
      #removeNotifier : Any;
      #removeSuccessor : Any;
      #removeTrustedCanister : Any;
      #requestApproval : Any;
      #resignAsManager : Any;
      #respondToApproval : Any;
      #reviewSuccessionClaim : Any;
      #revokeHouseGuideLink : Any;
      #setAuditCanisterId : Any;
      #setBootstrapNonce : Any;
      #setCondoAssociationRecord : Any;
      #setHomeWarrantyPlan : Any;
      #setHouseGuide : Any;
      #setInsurancePolicy : Any;
      #setJobCanisterId : Any;
      #setListingCanisterId : Any;
      #setMortgageLoan : Any;
      #setMoveInStep : Any;
      #setPaymentCanisterId : Any;
      #setPhotoCanisterId : Any;
      #setPropertyTaxYear : Any;
      #setSuccessor : Any;
      #setUpdateRateLimit : Any;
      #startMoveInPlan : Any;
      #submitVerification : Any;
      #unpause : Any;
      #updateArchitecturalReview : Any;
      #updateFixture : Any;
      #updateHomeWarrantyClaim : Any;
      #updateInsuranceClaim : Any;
      #updateInventoryItem : Any;
      #updateManagerRole : Any;
      #updateRoom : Any;
      #updateSpecialAssessment : Any;
      #verifyProperty : Any;
    };
  }) : Bool {
    let max = switch msg {
      case (#openSuccessionClaim _) Inspect.MAX_UPLOAD_ARG_BYTES;
      case _ Inspect.MAX_ARG_BYTES;
    };
    Inspect.accept(caller, arg, max)
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
      return #err(#RateLimited)
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

  /// The caller's active home at address key `key`, if they have one.
  private func ownedAt(owner : Principal, key : Text) : ?Property {
    for (p in ownedBy(owner)) {
      if (p.isActive and addressKey(p.address, p.city, p.state, p.zipCode) == key) return ?p;
    };
    null
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

    // ── Re-registering a home the caller already owns ────────────────────────
    // Returns that home unchanged (Mete, 2026-11-03), before the tier limit,
    // so a retry or a second tap never makes a duplicate.
    switch (ownedAt(caller, key)) {
      case (?existing) return #ok(existing);
      case null {};
    };

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
    // Released in `finally`, which runs on every return, on a rejected
    // payment or randomness call, and when a callback traps
    // (canister-security skill, CallerGuard).
    try {
      await* registerLocked(caller, args, key)
    } catch (_) {
      #err(#Unavailable("Registration is briefly unavailable. Please try again."))
    } finally {
      inFlightRegistrations.remove(callerKey);
    }
  };

  /// registerProperty's body, run while the caller's in-flight lock is held.
  private func registerLocked(caller : Principal, args : RegisterPropertyArgs, key : Text) : async* Result.Result<Property, Error> {

    // ── Tier limit check ────────────────────────────────────────────────────
    // When payment canister is wired, tier comes from getTierForPrincipal();
    // otherwise falls back to the local admin-grant map.
    let callerTier : SubscriptionTier = if (payCanisterId != "") {
      let payActor = Canisters.payment(payCanisterId);
      await payActor.getTierForPrincipal(caller)
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
      return #err(#InvalidInput(
        tierName # " plan limit of " # limit.toText() # " propert" #
        (if (limit == 1) "y" else "ies") # " reached." # upgradeMsg
      ));
    };

    let id  = await nextPropertyId();
    let now = Time.now();

    // M-8: re-check after the awaits — another registration of this address
    // may have landed while this call was suspended.
    switch (addressConflict(key, caller)) {
      case (?e) {
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
        try { await auditLog("PropertyVerified", ?existing.owner, "propertyId=" # id # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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

  public type AddressMatch = {
    id      : Text;
    owner   : Principal;
    address : Text;   // "12 Elm St, Austin, TX 78701"
  };

  /// Properties whose street address matches `search`, for a contractor who
  /// knows the job's address but not the property id (the voice agent's
  /// propose_job tool). Only the property that holds each address (the one in
  /// addressIdx: verified wins, else the newest claim) is a candidate, so a
  /// stale or competing claim never receives the proposal. `search` must start
  /// with the street address; a city or ZIP after it narrows the matches.
  /// Spelling of common street words is ignored ("Street" = "St", "N." = "N").
  /// Addresses are already public (claim pages show them), and an id already
  /// maps to its owner through getPropertyOwner. Anonymous callers get [].
  public query(msg) func findPropertiesByAddress(search : Text) : async [AddressMatch] {
    if (msg.caller.isAnonymous() or search.size() > 300) return [];
    let q = canonAddress(search);
    if (q == "") return [];
    let streetHits = List.empty<(Property, Text)>();   // property, text after the street
    for (id in addressIdx.values()) {
      switch (properties.get(id)) {
        case (?p) {
          let street = canonAddress(p.address);
          if (p.isActive and street != "") {
            if (q == street) { streetHits.add((p, "")) }
            else switch (q.stripStart(#text (street # " "))) {
              case (?rest) { streetHits.add((p, rest)) };
              case null {};
            };
          };
        };
        case null {};
      };
    };
    // Keep the hits whose city or ZIP appears after the street, unless the
    // query names neither (then every street match stays a candidate).
    let narrowed = streetHits.filter(func((p, rest) : (Property, Text)) : Bool {
      if (rest == "") return true;
      let padded = " " # rest # " ";
      let city = canonAddress(p.city);
      let zip  = canonAddress(p.zipCode);
      (city != "" and padded.contains(#text (" " # city # " "))) or
      (zip  != "" and padded.contains(#text (" " # zip  # " ")))
    });
    let hits = if (narrowed.isEmpty()) {
      // The text after the street named a place no hit is in: no match,
      // unless that text is just a unit ("apt 4"), which records don't hold.
      streetHits.filter(func((_, rest) : (Property, Text)) : Bool { isUnitOnly(rest) })
    } else narrowed;
    let out = List.empty<AddressMatch>();
    for ((p, _) in hits.values()) {
      if (out.size() < 5) {
        out.add({ id = p.id; owner = p.owner; address = p.address # ", " # p.city # ", " # p.state # " " # p.zipCode });
      };
    };
    out.toArray()
  };

  /// Lowercase, punctuation to spaces, single spaces, and common street
  /// words in their USPS short form, so "12 N. Elm Street" = "12 n elm st".
  private func canonAddress(t : Text) : Text {
    let spaced = t.toLower().map(func(c : Char) : Char { if (c.isAlphabetic() or c.isDigit()) c else ' ' });
    let words = spaced.split(#predicate(Char.isWhitespace)).filter(func(w : Text) : Bool { w != "" }).map(shortStreetWord);
    words.join(" ")
  };

  private func shortStreetWord(w : Text) : Text {
    switch w {
      case "street"    "st";   case "avenue"  "ave";  case "av"        "ave";
      case "road"      "rd";   case "drive"   "dr";   case "lane"      "ln";
      case "boulevard" "blvd"; case "court"   "ct";   case "place"     "pl";
      case "circle"    "cir";  case "terrace" "ter";  case "parkway"   "pkwy";
      case "highway"   "hwy";  case "trail"   "trl";  case "square"    "sq";
      case "north"     "n";    case "south"   "s";    case "east"      "e";
      case "west"      "w";    case "northeast" "ne"; case "northwest" "nw";
      case "southeast" "se";   case "southwest" "sw"; case "apartment" "apt";
      case "suite"     "ste";  case "unit"    "unit";
      case _ w;
    }
  };

  /// True when `rest` is only a unit designator such as "apt 4" or "unit 2b".
  private func isUnitOnly(rest : Text) : Bool {
    let words = rest.split(#char ' ').toArray();
    words.size() == 2 and (words[0] == "apt" or words[0] == "ste" or words[0] == "unit")
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
    try { await auditLog("IdentityRelayAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func removeIdentityRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    identityRelayEntries := Admin.remove(identityRelayEntries, p);
    try { await auditLog("IdentityRelayRemoved", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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

  /// Hands a home record to `to`: the new owner, the transfer history entry,
  /// and everything that was the previous household's dropped. Shared by
  /// claimTransfer (sale) and completeSuccessionClaim (#724). Synchronous;
  /// afterMove does the cross-canister part.
  private func moveRecord(prop : Property, to : Principal, txHash : Text, now : Int) : Property {
    let propertyId = prop.id;
    // M-6 (2026-10-28 audit): the seller's ID check and ownership
    // evidence are about the seller, not the buyer.
    let updated : Property = {
      prop with
      owner               = to;
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
    // #711: the seller's insurance policy and claims aren't the buyer's.
    insurancePolicies.remove(propertyId);
    ignore dropClaims(propertyId);
    ignore dropInventory(propertyId);
    // #725: the seller's house guide (Wi-Fi, alarm) and its links.
    ignore dropGuide(propertyId);
    // #719 / #722: the seller's home warranty contract and mortgage.
    homeWarrantyPlans.remove(propertyId);
    mortgageLoans.remove(propertyId);
    // #714: the seller's tax years and exemption status.
    propertyTaxYears.remove(propertyId);
    // #712: a fresh move-in plan for the buyer; the seller's goes.
    moveInPlans.add(propertyId, MoveIn.fresh(now));
    // #724: the new owner names their own successor; an open claim on the
    // previous owner's record ends (completeSuccessionClaim marks its own
    // claim Completed after this).
    dropSuccessor(propertyId);
    ignore cancelOpenClaim(propertyId, prop.owner, now);

    // Append immutable record to ownership history. L-3: take a
    // fresh key per claim so two claims never share a record slot.
    transferCounter += 1;
    transfers.add(transferCounter, {
      propertyId;
      from      = prop.owner;
      to;
      timestamp = now;
      txHash;
    });

    // A transfer link that's still out stops working.
    switch (pendingTransfers.get(propertyId)) {
      case (?pt) { tokenIndex.remove(pt.token); pendingTransfers.remove(propertyId) };
      case null {};
    };
    updated
  };

  /// The cross-canister part of a hand-over: the previous owner's FSBO
  /// listing comes down, and payment decides on the new owner's handoff year.
  /// The hand-over stands whatever they answer.
  private func afterMove(propertyId : Text, to : Principal, prop : Property) : async* () {
    // M-1 (security audit 2026-11-10): the previous household's closing,
    // title, insurance and other personal papers stay theirs.
    if (photoCanisterId != "") {
      let photo : actor { propertyTransferred : shared Text -> async { #ok : Nat; #err : Any } } = actor (photoCanisterId);
      try { ignore await photo.propertyTransferred(propertyId) } catch _ { Debug.print("[property] photo transfer call failed") };
    };
    if (listingCanisterId != "") {
      let listing : actor { propertyTransferred : shared Text -> async { #ok : Any; #err : Any } } = actor (listingCanisterId);
      try { ignore await listing.propertyTransferred(propertyId) } catch _ { Debug.print("[property] listing transfer call failed") };
    };
    // A year of Pro for the new owner when the home's ownership was
    // verified. payment.grantHandoffYear decides eligibility (once per
    // person, once a year per home, no paid plan running).
    if (payCanisterId != "" and (prop.verificationLevel == #Basic or prop.verificationLevel == #Premium)) {
      let pay : actor { grantHandoffYear : shared (Principal, Text) -> async { #ok : Any; #err : Any } } = actor (payCanisterId);
      try { ignore await pay.grantHandoffYear(to, propertyId) } catch _ { Debug.print("[property] handoff grant call failed") };
    };
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
                let updated = moveRecord(prop, msg.caller, "", Time.now());
                await* afterMove(propertyId, msg.caller, prop);
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
      switch (await* Canisters.tierOf(payCanisterId, msg.caller)) {
        case (#ok(t)) t;
        case (#err(e)) return #err(e);   // payment didn't answer: #Unavailable
      }
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
    Array.tabulate(propertyIds.size(), func(i) {
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

  /// Wire the photo canister, which keeps the previous household's personal
  /// papers private when a home changes hands (M-1).
  public shared(msg) func setPhotoCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    photoCanisterId := id.toText();
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
    try { await auditLog("AdminAdded", ?newAdmin, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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
    try { await auditLog("AuditCanisterSet", ?id, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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
    try { await auditLog("TrustedCanisterAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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

  /// #711: renewal reminders for the weekly Home Pulse email: the carrier
  /// and renewal date of each of `owner`'s active homes that has a policy on
  /// record. No policy number or coverage. Notifiers and admins only.
  public query(msg) func getPulseInsurance(owner: Principal) : async Result.Result<[PulseInsurance], Error> {
    if (not Admin.contains(notifierEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let out = List.empty<PulseInsurance>();
    for (p in ownedBy(owner)) {
      if (p.isActive) {
        switch (insurancePolicies.get(p.id)) {
          case (?pol) out.add({ propertyId = p.id; carrier = pol.carrier; renewalDate = pol.renewalDate });
          case null {};
        };
      };
    };
    #ok(out.toArray())
  };

  // ─── Insurance policy (#711) ──────────────────────────────────────────────

  /// Most a Coverage A limit or dollar deductible may be: $100,000,000.
  private transient let MAX_INSURANCE_CENTS : Nat = 10_000_000_000;

  private func validatePolicy(p : InsurancePolicyInput) : ?Text {
    let carrier = p.carrier.trim(#char ' ');
    if (carrier.size() == 0)        return ?"Enter the insurance company";
    if (p.carrier.size() > 100)     return ?"Insurance company name is over 100 characters";
    if (p.policyNumber.size() > 60) return ?"Policy number is over 60 characters";
    if (not Insurance.isIsoDate(p.renewalDate)) return ?"Renewal date must be a real date written YYYY-MM-DD";
    switch (p.coverageACents) {
      case (?c) { if (c > MAX_INSURANCE_CENTS) return ?"Coverage A is over $100,000,000" };
      case null {};
    };
    switch (p.hurricaneDeductible) {
      case (?#PercentOfCoverageA(pct)) { if (pct < 1 or pct > 25) return ?"Hurricane deductible percent must be 1 to 25" };
      case (?#Amount(c)) { if (c > MAX_INSURANCE_CENTS) return ?"Hurricane deductible is over $100,000,000" };
      case null {};
    };
    null
  };

  /// #711: save the home's insurance policy details, or clear them with null.
  /// Needs write access to the home (owner, co-owner or manager).
  public shared(msg) func setInsurancePolicy(propertyId: Text, policy: ?InsurancePolicyInput) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    switch (policy) {
      case null { insurancePolicies.remove(propertyId) };
      case (?p) {
        switch (validatePolicy(p)) { case (?why) return #err(#InvalidInput(why)); case null {} };
        insurancePolicies.add(propertyId, {
          carrier             = p.carrier.trim(#char ' ');
          policyNumber        = p.policyNumber.trim(#char ' ');
          renewalDate         = p.renewalDate;
          coverageACents      = p.coverageACents;
          hurricaneDeductible = p.hurricaneDeductible;
          updatedAt           = Time.now();
        });
      };
    };
    #ok(())
  };

  // ─── Per-home record caps by plan (M-3, security audit 2026-11-10) ───────

  /// How many of each record a home may hold. Free accounts cost nothing to
  /// make, so Free homes get smaller caps (about 0.75 MB of these records per
  /// home instead of about 11 MB); Pro keeps the module limits.
  type RecordCaps = {
    free           : Bool;
    claims         : Nat;
    claimLog       : Nat;
    inventory      : Nat;
    reviews        : Nat;
    assessments    : Nat;
    warrantyClaims : Nat;
  };

  private func capsForTier(t : Canisters.Tier) : RecordCaps {
    switch t {
      case (#Pro or #ContractorPro) {
        {
          free = false;
          claims = Insurance.MAX_CLAIMS_PER_PROPERTY; claimLog = Insurance.MAX_LOG_ENTRIES;
          inventory = Insurance.MAX_INVENTORY_ITEMS;
          reviews = Hoa.MAX_REVIEWS_PER_PROPERTY; assessments = Hoa.MAX_ASSESSMENTS_PER_PROPERTY;
          warrantyClaims = HomeFinance.MAX_CLAIMS_PER_PROPERTY;
        }
      };
      case (#Free or #ContractorFree) {
        { free = true; claims = 10; claimLog = 50; inventory = 100; reviews = 25; assessments = 25; warrantyClaims = 25 }
      };
    }
  };

  /// The caps for `propertyId`, from its owner's plan (a manager adds under
  /// the owner's plan). Free when payment isn't wired (fail closed);
  /// #Unavailable when it didn't answer.
  private func capsFor(propertyId : Text) : async* Result.Result<RecordCaps, Error> {
    let owner = switch (properties.get(propertyId)) { case (?p) p.owner; case null return #err(#NotFound) };
    if (payCanisterId == "") return #ok(capsForTier(#Free));
    switch (await* Canisters.tierOf(payCanisterId, owner)) {
      case (#ok(t)) #ok(capsForTier(t));
      case (#err(e)) #err(e);
    }
  };

  /// The refusal when a home is at a cap: what to do about it.
  private func capReached(what : Text, caps : RecordCaps) : Error {
    #InvalidInput(what # (if (caps.free) "; delete an old one first, or upgrade to Pro ($59/year) for more" else "; delete an old one first"))
  };

  // ─── Insurance claim kit (#711) ───────────────────────────────────────────

  /// The claim and its property, when `caller` may change it. NotFound comes
  /// before NotAuthorized, as elsewhere in this canister.
  private func writableClaim(claimId : Text, caller : Principal) : Result.Result<InsuranceClaim, Error> {
    switch (insuranceClaims.get(claimId)) {
      case null #err(#NotFound);
      case (?c) {
        if (not checkAuthorized(c.propertyId, caller, true)) #err(#NotAuthorized) else #ok(c)
      };
    }
  };

  /// #711: start a record of an insurance claim on the home. Needs write
  /// access to the home. Records only what the household enters: nothing is
  /// filed with the insurer.
  public shared(msg) func createInsuranceClaim(propertyId: Text, input: ClaimInput) : async Result.Result<InsuranceClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let c = Insurance.clean(input);
    switch (Insurance.validateClaim(c)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let caps = switch (await* capsFor(propertyId)) { case (#err(e)) return #err(e); case (#ok(x)) x };
    let id = Uuid.fromBlob(await Random.blob());
    // Re-check after the awaits: the home may have changed hands meanwhile.
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Index.ids(claimsByProperty, propertyId).size() >= caps.claims)
      return #err(capReached("This home already has " # caps.claims.toText() # " claim records", caps));
    let now = Time.now();
    let claim : InsuranceClaim = {
      id; propertyId;
      title = c.title; dateOfLoss = c.dateOfLoss; cause = c.cause; description = c.description;
      claimNumber = c.claimNumber; adjusterName = c.adjusterName; adjusterContact = c.adjusterContact;
      status = c.status; log = []; createdAt = now; updatedAt = now;
    };
    putClaim(claim);
    #ok(claim)
  };

  /// #711: change a claim's details (not its log). Needs write access to the home.
  public shared(msg) func updateInsuranceClaim(claimId: Text, input: ClaimInput) : async Result.Result<InsuranceClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (writableClaim(claimId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(c)) c };
    let c = Insurance.clean(input);
    switch (Insurance.validateClaim(c)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let updated : InsuranceClaim = {
      existing with
      title = c.title; dateOfLoss = c.dateOfLoss; cause = c.cause; description = c.description;
      claimNumber = c.claimNumber; adjusterName = c.adjusterName; adjusterContact = c.adjusterContact;
      status = c.status; updatedAt = Time.now();
    };
    putClaim(updated);
    #ok(updated)
  };

  /// #711: add a dated line to a claim's log. Needs write access to the home.
  public shared(msg) func addInsuranceClaimLog(claimId: Text, date: Text, note: Text) : async Result.Result<InsuranceClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let first = switch (writableClaim(claimId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(c)) c };
    let n = Insurance.trim(note);
    switch (Insurance.validateLogEntry(date, n)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let caps = switch (await* capsFor(first.propertyId)) { case (#err(e)) return #err(e); case (#ok(x)) x };
    // Re-read after the await: the claim may have changed or the home changed hands.
    let existing = switch (writableClaim(claimId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(c)) c };
    if (existing.log.size() >= caps.claimLog)
      return #err(capReached("This claim's log is full (" # caps.claimLog.toText() # " entries)", caps));
    let now = Time.now();
    let updated : InsuranceClaim = {
      existing with
      log = existing.log.concat([{ date; note = n; addedAt = now }]);
      updatedAt = now;
    };
    putClaim(updated);
    #ok(updated)
  };

  /// #711: delete a claim record and its log. Can't be undone. Needs write
  /// access to the home. Damage photos stay in the photo canister.
  public shared(msg) func deleteInsuranceClaim(claimId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (writableClaim(claimId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
    Index.delete(insuranceClaims, claimIndexes, claimId);
    #ok(())
  };

  /// #711: the home's claim records, newest date of loss first. Anyone with a
  /// role on the home and admins.
  public query(msg) func getInsuranceClaims(propertyId: Text) : async Result.Result<[InsuranceClaim], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let list = Index.records(claimsByProperty, propertyId, insuranceClaims).toArray();
    #ok(list.sort(func(a : InsuranceClaim, b : InsuranceClaim) : Order.Order {
      switch (Text.compare(b.dateOfLoss, a.dateOfLoss)) {
        case (#equal) Int.compare(b.createdAt, a.createdAt);
        case o o;
      }
    }))
  };

  // ─── Contents inventory (#711) ────────────────────────────────────────────

  /// The problem with an item for `propertyId`, including its room, or null.
  private func itemProblem(propertyId : Text, i : InventoryItemInput) : ?Text {
    switch (Insurance.validateItem(i)) { case (?why) return ?why; case null {} };
    switch (i.roomId) {
      case (?rid) {
        switch (rooms.get(rid)) {
          case (?r) { if (r.propertyId != propertyId) return ?"That room is in another home" };
          case null { return ?"That room doesn't exist" };
        };
      };
      case null {};
    };
    null
  };

  /// #711: add something in the home to its contents inventory. Needs write
  /// access to the home; at most 500 items per home.
  public shared(msg) func addInventoryItem(propertyId: Text, input: InventoryItemInput) : async Result.Result<InventoryItem, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let i = Insurance.cleanItem(input);
    switch (itemProblem(propertyId, i)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let caps = switch (await* capsFor(propertyId)) { case (#err(e)) return #err(e); case (#ok(x)) x };
    let id = Uuid.fromBlob(await Random.blob());
    // Re-check after the awaits: the home may have changed hands meanwhile.
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Index.ids(inventoryByProperty, propertyId).size() >= caps.inventory)
      return #err(capReached("This home's inventory is full (" # caps.inventory.toText() # " items)", caps));
    let now = Time.now();
    let item : InventoryItem = {
      id; propertyId;
      roomId = i.roomId; name = i.name; category = i.category; quantity = i.quantity;
      valueCents = i.valueCents; purchaseDate = i.purchaseDate; serialNumber = i.serialNumber; notes = i.notes;
      createdAt = now; updatedAt = now;
    };
    putItem(item);
    #ok(item)
  };

  /// #711: change an inventory item, including moving it to another room of
  /// the same home (or none). Needs write access to the home.
  public shared(msg) func updateInventoryItem(itemId: Text, input: InventoryItemInput) : async Result.Result<InventoryItem, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (inventoryItems.get(itemId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let i = Insurance.cleanItem(input);
    switch (itemProblem(existing.propertyId, i)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let updated : InventoryItem = {
      existing with
      roomId = i.roomId; name = i.name; category = i.category; quantity = i.quantity;
      valueCents = i.valueCents; purchaseDate = i.purchaseDate; serialNumber = i.serialNumber; notes = i.notes;
      updatedAt = Time.now();
    };
    putItem(updated);
    #ok(updated)
  };

  /// #711: remove an item from the inventory. Can't be undone. Its photos and
  /// receipts stay in the photo canister.
  public shared(msg) func deleteInventoryItem(itemId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (inventoryItems.get(itemId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    Index.delete(inventoryItems, inventoryIndexes, itemId);
    #ok(())
  };

  /// #711: the home's contents inventory. Anyone with a role on the home and admins.
  public query(msg) func getInventory(propertyId: Text) : async Result.Result<[InventoryItem], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Index.records(inventoryByProperty, propertyId, inventoryItems).toArray())
  };

  /// #711: the home's insurance policy, or null when none is on record. Anyone
  /// with a role on the home (owner, co-owner, manager, viewer) and admins.
  public query(msg) func getInsurancePolicy(propertyId: Text) : async Result.Result<?InsurancePolicy, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(insurancePolicies.get(propertyId))
  };

  // ─── House guide (#725) ───────────────────────────────────────────────────

  private transient let DAY_NS : Int = 24 * 3600 * 1_000_000_000;

  /// #725: save the home's house guide, or clear it with null (which also
  /// ends every link to it). Needs write access to the home. Text is stored
  /// as typed, Wi-Fi passwords and alarm codes included.
  public shared(msg) func setHouseGuide(propertyId: Text, guide: ?HouseGuideInput) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    switch (guide) {
      case null { ignore dropGuide(propertyId) };
      case (?raw) {
        let g = HouseGuide.clean(raw);
        switch (HouseGuide.validate(g)) { case (?why) return #err(#InvalidInput(why)); case null {} };
        houseGuides.add(propertyId, {
          wifiName = g.wifiName; wifiPassword = g.wifiPassword; alarm = g.alarm;
          trashDay = g.trashDay; recyclingDay = g.recyclingDay;
          waterShutoff = g.waterShutoff; gasShutoff = g.gasShutoff; electricPanel = g.electricPanel;
          contacts = g.contacts; notes = g.notes; photoIds = g.photoIds;
          updatedAt = Time.now();
        });
      };
    };
    #ok(())
  };

  /// #725: the home's house guide, or null. Anyone with a role on the home and admins.
  public query(msg) func getHouseGuide(propertyId: Text) : async Result.Result<?HouseGuideRecord, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(houseGuides.get(propertyId))
  };

  /// #725: a link that shows the home's guide (and address) to anyone who has
  /// it, for 1 to 90 days. Needs write access and a saved guide; at most 10
  /// live links per home.
  public shared(msg) func createHouseGuideLink(propertyId: Text, name: Text, expiryDays: Nat) : async Result.Result<HouseGuideLink, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let n = HouseGuide.cleanName(name);
    if (n.size() > HouseGuide.MAX_LINK_NAME) return #err(#InvalidInput("Link name is over 60 characters"));
    if (expiryDays < 1 or expiryDays > HouseGuide.MAX_LINK_DAYS)
      return #err(#InvalidInput("A guide link lasts 1 to 90 days"));
    if (houseGuides.get(propertyId) == null) return #err(#InvalidInput("Write the house guide before sharing it"));
    let token = blobToHex(await Random.blob());
    // Re-check after the await: the home may have changed hands meanwhile.
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (houseGuides.get(propertyId) == null) return #err(#InvalidInput("Write the house guide before sharing it"));
    let now = Time.now();
    let all = Index.records(guideLinksByProperty, propertyId, guideLinks).toArray();
    let live = all.filter(func(l : HouseGuide.GuideLink) : Bool { HouseGuide.isLive(l, now) }).size();
    if (live >= HouseGuide.MAX_LIVE_LINKS)
      return #err(#InvalidInput("This home already has 10 live guide links; revoke one first"));
    // Keep only the newest dead (expired or revoked) links, so storage per
    // home stays bounded however many links are made and turned off.
    let dead = all
      .filter(func(l : HouseGuide.GuideLink) : Bool { not HouseGuide.isLive(l, now) })
      .sort(func(a : HouseGuide.GuideLink, b : HouseGuide.GuideLink) : Order.Order { Int.compare(b.createdAt, a.createdAt) });
    // The new link makes room for itself: keep at most MAX_DEAD_LINKS - 1 dead ones.
    var kept = 0;
    for (l in dead.values()) {
      kept += 1;
      if (kept >= HouseGuide.MAX_DEAD_LINKS) Index.delete(guideLinks, guideLinkIndexes, l.token);
    };
    let link : HouseGuideLink = {
      token; propertyId; name = n; createdBy = msg.caller;
      createdAt = now; expiresAt = now + expiryDays * DAY_NS; revoked = false;
    };
    Index.put(guideLinks, guideLinkIndexes, token, link);
    #ok(link)
  };

  /// #725: the home's guide links, newest first, live or not. Links are bearer
  /// tokens, so only those with write access to the home (and admins) see them.
  public query(msg) func listHouseGuideLinks(propertyId: Text) : async Result.Result<[HouseGuideLink], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let list = Index.records(guideLinksByProperty, propertyId, guideLinks).toArray();
    #ok(list.sort(func(a : HouseGuideLink, b : HouseGuideLink) : Order.Order { Int.compare(b.createdAt, a.createdAt) }))
  };

  /// #725: end a guide link now. Needs write access to its home.
  public shared(msg) func revokeHouseGuideLink(token: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let link = switch (guideLinks.get(token)) { case null return #err(#NotFound); case (?l) l };
    if (not checkAuthorized(link.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    Index.put(guideLinks, guideLinkIndexes, token, { link with revoked = true });
    #ok(())
  };

  /// The live link for `token` and its home's guide, if any.
  private func liveGuide(token : Text) : ?(HouseGuideLink, HouseGuideRecord) {
    switch (guideLinks.get(token)) {
      case null null;
      case (?link) {
        if (not HouseGuide.isLive(link, Time.now())) return null;
        switch (houseGuides.get(link.propertyId)) { case null null; case (?g) ?(link, g) };
      };
    }
  };

  /// #725: what a guide link shows: the guide and the home's address. Anyone
  /// may call it; unknown, revoked and expired links are all #NotFound.
  public query func getSharedHouseGuide(token: Text) : async Result.Result<SharedHouseGuide, Error> {
    switch (liveGuide(token)) {
      case null #err(#NotFound);
      case (?(link, guide)) {
        switch (properties.get(link.propertyId)) {
          case null #err(#NotFound);
          case (?p) #ok({ address = p.address; city = p.city; state = p.state; zipCode = p.zipCode; guide; expiresAt = link.expiresAt });
        }
      };
    }
  };

  /// #725: for the photo canister: true when `token` is a live link to the
  /// guide of `propertyId` and that guide shows `photoId`.
  public query func guideSharesPhoto(token: Text, propertyId: Text, photoId: Text) : async Bool {
    switch (liveGuide(token)) {
      case null false;
      case (?(link, guide)) {
        link.propertyId == propertyId and guide.photoIds.find(func(id : Text) : Bool { id == photoId }) != null
      };
    }
  };

  // ─── HOA and condo paperwork (#726) ───────────────────────────────────────

  /// #726: log an architectural review request to the association. Needs
  /// write access to the home; at most 100 per home. Nothing is sent to the
  /// association.
  public shared(msg) func addArchitecturalReview(propertyId: Text, input: ReviewInput) : async Result.Result<ArchitecturalReview, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let r = Hoa.cleanReview(input);
    switch (Hoa.validateReview(r)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let caps = switch (await* capsFor(propertyId)) { case (#err(e)) return #err(e); case (#ok(x)) x };
    let id = Uuid.fromBlob(await Random.blob());
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Index.ids(reviewsByProperty, propertyId).size() >= caps.reviews)
      return #err(capReached("This home already has " # caps.reviews.toText() # " review requests", caps));
    let now = Time.now();
    let rec : ArchitecturalReview = {
      id; propertyId;
      project = r.project; details = r.details; submittedDate = r.submittedDate; status = r.status;
      decisionDate = r.decisionDate; conditions = r.conditions; approvalDocId = r.approvalDocId; jobId = r.jobId;
      createdAt = now; updatedAt = now;
    };
    Index.put(archReviews, reviewIndexes, id, rec);
    #ok(rec)
  };

  /// #726: change a review request (for example, record the decision).
  public shared(msg) func updateArchitecturalReview(reviewId: Text, input: ReviewInput) : async Result.Result<ArchitecturalReview, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (archReviews.get(reviewId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let r = Hoa.cleanReview(input);
    switch (Hoa.validateReview(r)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let rec : ArchitecturalReview = {
      existing with
      project = r.project; details = r.details; submittedDate = r.submittedDate; status = r.status;
      decisionDate = r.decisionDate; conditions = r.conditions; approvalDocId = r.approvalDocId; jobId = r.jobId;
      updatedAt = Time.now();
    };
    Index.put(archReviews, reviewIndexes, reviewId, rec);
    #ok(rec)
  };

  /// #726: delete a review request. Can't be undone.
  public shared(msg) func deleteArchitecturalReview(reviewId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (archReviews.get(reviewId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    Index.delete(archReviews, reviewIndexes, reviewId);
    #ok(())
  };

  /// #726: the home's review requests, newest first. Anyone with a role on the home and admins.
  public query(msg) func getArchitecturalReviews(propertyId: Text) : async Result.Result<[ArchitecturalReview], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let list = Index.records(reviewsByProperty, propertyId, archReviews).toArray();
    #ok(list.sort(func(a : ArchitecturalReview, b : ArchitecturalReview) : Order.Order { Int.compare(b.createdAt, a.createdAt) }))
  };

  /// #726: record a special assessment (a dated cost). Needs write access; at most 100 per home.
  public shared(msg) func addSpecialAssessment(propertyId: Text, input: AssessmentInput) : async Result.Result<SpecialAssessment, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let a = Hoa.cleanAssessment(input);
    switch (Hoa.validateAssessment(a)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let caps = switch (await* capsFor(propertyId)) { case (#err(e)) return #err(e); case (#ok(x)) x };
    let id = Uuid.fromBlob(await Random.blob());
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Index.ids(assessmentsByProperty, propertyId).size() >= caps.assessments)
      return #err(capReached("This home already has " # caps.assessments.toText() # " special assessments", caps));
    let now = Time.now();
    let rec : SpecialAssessment = {
      id; propertyId;
      title = a.title; amountCents = a.amountCents; dueDate = a.dueDate; paidDate = a.paidDate;
      notes = a.notes; documentId = a.documentId; createdAt = now; updatedAt = now;
    };
    Index.put(specialAssessments, assessmentIndexes, id, rec);
    #ok(rec)
  };

  /// #726: change a special assessment (for example, mark it paid).
  public shared(msg) func updateSpecialAssessment(assessmentId: Text, input: AssessmentInput) : async Result.Result<SpecialAssessment, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (specialAssessments.get(assessmentId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let a = Hoa.cleanAssessment(input);
    switch (Hoa.validateAssessment(a)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let rec : SpecialAssessment = {
      existing with
      title = a.title; amountCents = a.amountCents; dueDate = a.dueDate; paidDate = a.paidDate;
      notes = a.notes; documentId = a.documentId; updatedAt = Time.now();
    };
    Index.put(specialAssessments, assessmentIndexes, assessmentId, rec);
    #ok(rec)
  };

  /// #726: delete a special assessment. Can't be undone.
  public shared(msg) func deleteSpecialAssessment(assessmentId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (specialAssessments.get(assessmentId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    Index.delete(specialAssessments, assessmentIndexes, assessmentId);
    #ok(())
  };

  /// #726: the home's special assessments, latest due date first.
  public query(msg) func getSpecialAssessments(propertyId: Text) : async Result.Result<[SpecialAssessment], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let list = Index.records(assessmentsByProperty, propertyId, specialAssessments).toArray();
    #ok(list.sort(func(a : SpecialAssessment, b : SpecialAssessment) : Order.Order {
      switch (Text.compare(b.dueDate, a.dueDate)) { case (#equal) Int.compare(b.createdAt, a.createdAt); case o o }
    }))
  };

  /// #726: save what the owner knows of the condo association's milestone
  /// inspection and reserve study, or clear it with null. Condo homes only;
  /// needs write access. HomeGentic doesn't check any of it.
  public shared(msg) func setCondoAssociationRecord(propertyId: Text, record: ?CondoRecordInput) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let prop = switch (properties.get(propertyId)) { case null return #err(#NotFound); case (?p) p };
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    switch (record) {
      case null { condoRecords.remove(propertyId) };
      case (?raw) {
        if (prop.propertyType != #Condo)
          return #err(#InvalidInput("Milestone inspection and reserve study records are for condo homes"));
        let c = Hoa.cleanCondo(raw);
        switch (Hoa.validateCondo(c)) { case (?why) return #err(#InvalidInput(why)); case null {} };
        condoRecords.add(propertyId, {
          associationName = c.associationName;
          milestoneLastDate = c.milestoneLastDate; milestoneNextDue = c.milestoneNextDue; milestoneDocId = c.milestoneDocId;
          reserveStudyLastDate = c.reserveStudyLastDate; reserveStudyNextDue = c.reserveStudyNextDue; reserveStudyDocId = c.reserveStudyDocId;
          notes = c.notes; updatedAt = Time.now();
        });
      };
    };
    #ok(())
  };

  /// #726: the condo association record, or null. Anyone with a role on the home and admins.
  public query(msg) func getCondoAssociationRecord(propertyId: Text) : async Result.Result<?CondoRecord, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(condoRecords.get(propertyId))
  };

  // ─── Home warranty plan (#719) ────────────────────────────────────────────

  /// #719: save the home warranty plan, or clear it with null. Needs write
  /// access. Records what the owner enters; nothing is checked with the company.
  public shared(msg) func setHomeWarrantyPlan(propertyId: Text, plan: ?HomeWarrantyPlanInput) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    switch (plan) {
      case null { homeWarrantyPlans.remove(propertyId) };
      case (?raw) {
        let p = HomeFinance.cleanPlan(raw);
        switch (HomeFinance.validatePlan(p)) { case (?why) return #err(#InvalidInput(why)); case null {} };
        homeWarrantyPlans.add(propertyId, HomeFinance.toPlan(p, Time.now()));
      };
    };
    #ok(())
  };

  /// #719: the home warranty plan, or null. Anyone with a role on the home and admins.
  public query(msg) func getHomeWarrantyPlan(propertyId: Text) : async Result.Result<?HomeWarrantyPlan, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(homeWarrantyPlans.get(propertyId))
  };

  /// #719: log a claim filed with the home warranty company. Needs write
  /// access; at most 100 per home.
  public shared(msg) func addHomeWarrantyClaim(propertyId: Text, input: HomeWarrantyClaimInput) : async Result.Result<HomeWarrantyClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let c = HomeFinance.cleanClaim(input);
    switch (HomeFinance.validateClaim(c)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let caps = switch (await* capsFor(propertyId)) { case (#err(e)) return #err(e); case (#ok(x)) x };
    let id = Uuid.fromBlob(await Random.blob());
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    if (Index.ids(hwClaimsByProperty, propertyId).size() >= caps.warrantyClaims)
      return #err(capReached("This home already has " # caps.warrantyClaims.toText() # " home warranty claims", caps));
    let now = Time.now();
    let rec : HomeWarrantyClaim = {
      id; propertyId;
      dateFiled = c.dateFiled; issue = c.issue; claimNumber = c.claimNumber; jobId = c.jobId;
      serviceFeePaidCents = c.serviceFeePaidCents; outcome = c.outcome; outcomeNotes = c.outcomeNotes;
      createdAt = now; updatedAt = now;
    };
    Index.put(homeWarrantyClaims, hwClaimIndexes, id, rec);
    #ok(rec)
  };

  /// #719: change a home warranty claim (for example, record the outcome).
  public shared(msg) func updateHomeWarrantyClaim(claimId: Text, input: HomeWarrantyClaimInput) : async Result.Result<HomeWarrantyClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (homeWarrantyClaims.get(claimId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    let c = HomeFinance.cleanClaim(input);
    switch (HomeFinance.validateClaim(c)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let rec : HomeWarrantyClaim = {
      existing with
      dateFiled = c.dateFiled; issue = c.issue; claimNumber = c.claimNumber; jobId = c.jobId;
      serviceFeePaidCents = c.serviceFeePaidCents; outcome = c.outcome; outcomeNotes = c.outcomeNotes;
      updatedAt = Time.now();
    };
    Index.put(homeWarrantyClaims, hwClaimIndexes, claimId, rec);
    #ok(rec)
  };

  /// #719: delete a home warranty claim. Can't be undone.
  public shared(msg) func deleteHomeWarrantyClaim(claimId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let existing = switch (homeWarrantyClaims.get(claimId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(existing.propertyId, msg.caller, true)) return #err(#NotAuthorized);
    Index.delete(homeWarrantyClaims, hwClaimIndexes, claimId);
    #ok(())
  };

  /// #719: the home's warranty claims, latest filed first.
  public query(msg) func getHomeWarrantyClaims(propertyId: Text) : async Result.Result<[HomeWarrantyClaim], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let list = Index.records(hwClaimsByProperty, propertyId, homeWarrantyClaims).toArray();
    #ok(list.sort(func(a : HomeWarrantyClaim, b : HomeWarrantyClaim) : Order.Order {
      switch (Text.compare(b.dateFiled, a.dateFiled)) { case (#equal) Int.compare(b.createdAt, a.createdAt); case o o }
    }))
  };

  // ─── Mortgage details (#722) ──────────────────────────────────────────────

  /// Owner or co-owner: the people who see the mortgage (bills canister's rule too).
  private func hasFullControl(propertyId : Text, caller : Principal) : Bool {
    switch (properties.get(propertyId)) {
      case null false;
      case (?prop) {
        if (prop.owner == caller) return true;
        let mgrs = switch (managersMap.get(propertyId)) { case null []; case (?list) list };
        mgrs.find(func(m : PropertyManager) : Bool { m.principal == caller and m.role == #CoOwner }) != null
      };
    }
  };

  /// #722: save the owner's mortgage details, or clear them with null. Owner
  /// and co-owners only. A calculator's inputs; nothing goes to the lender.
  public shared(msg) func setMortgageLoan(propertyId: Text, loan: ?MortgageLoanInput) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not hasFullControl(propertyId, msg.caller)) return #err(#NotAuthorized);
    switch (loan) {
      case null { mortgageLoans.remove(propertyId) };
      case (?raw) {
        let l = HomeFinance.cleanLoan(raw);
        switch (HomeFinance.validateLoan(l)) { case (?why) return #err(#InvalidInput(why)); case null {} };
        mortgageLoans.add(propertyId, HomeFinance.toLoan(l, Time.now()));
      };
    };
    #ok(())
  };

  /// #722: the mortgage details, or null. Owner and co-owners only.
  public query(msg) func getMortgageLoan(propertyId: Text) : async Result.Result<?MortgageLoan, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not hasFullControl(propertyId, msg.caller)) return #err(#NotAuthorized);
    #ok(mortgageLoans.get(propertyId))
  };

  /// #719 / #722: for the weekly Home Pulse email, each of `owner`'s active
  /// homes with a home warranty renewal or a loan on record: the warranty
  /// company and renewal date, and the loan terms the PMI reminder needs (no
  /// lender, balance or value). Notifiers and admins only.
  public query(msg) func getPulseHomeFinance(owner: Principal) : async Result.Result<[PulseHomeFinance], Error> {
    if (not Admin.contains(notifierEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let out = List.empty<PulseHomeFinance>();
    for (p in ownedBy(owner)) {
      if (p.isActive) {
        let warranty = switch (homeWarrantyPlans.get(p.id)) {
          case (?w) ?{ provider = w.provider; renewalDate = w.renewalDate };
          case null null;
        };
        let loan = switch (mortgageLoans.get(p.id)) { case (?l) ?HomeFinance.pulseLoan(l); case null null };
        if (warranty != null or loan != null) out.add({ propertyId = p.id; warranty; loan });
      };
    };
    #ok(out.toArray())
  };

  // ─── FEMA flood zone (#718) ───────────────────────────────────────────────

  /// #718: the flood zone FEMA's map showed for the address when it was last
  /// looked up, or null. Anyone with a role on the home and admins.
  public query(msg) func getFloodZone(propertyId: Text) : async Result.Result<?FloodZoneRecord, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(floodZones.get(propertyId))
  };

  /// #718: the Worker (an identity relay) reads the address to look up, and
  /// any saved result, for `user`, who must have a role on the home.
  public query(msg) func relayFloodTarget(propertyId: Text, user: Principal) : async Result.Result<FloodTarget, Error> {
    if (not isIdentityRelay(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let p = switch (properties.get(propertyId)) { case null return #err(#NotFound); case (?x) x };
    if (not checkAuthorized(propertyId, user, false)) return #err(#NotAuthorized);
    #ok({ address = p.address; city = p.city; state = p.state; zipCode = p.zipCode; floodZone = floodZones.get(propertyId) })
  };

  /// #718: the Worker saves what FEMA's map shows for the address, for `user`,
  /// who must have a role on the home.
  public shared(msg) func relaySetFloodZone(propertyId: Text, user: Principal, input: FloodZoneInput) : async Result.Result<FloodZoneRecord, Error> {
    if (not isIdentityRelay(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, user, false)) return #err(#NotAuthorized);
    switch (FloodZone.validate(input)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let rec = FloodZone.toRecord(input, Time.now());
    floodZones.add(propertyId, rec);
    #ok(rec)
  };

  // ─── Property-tax years (#714) ────────────────────────────────────────────

  /// #714: save one tax year's values and exemption status, replacing that
  /// year if it's already saved. Owner and co-owners only; at most 60 years
  /// per home. Records what the owner enters; nothing is checked with the county.
  public shared(msg) func setPropertyTaxYear(propertyId: Text, input: PropertyTaxYearInput) : async Result.Result<PropertyTaxYear, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not hasFullControl(propertyId, msg.caller)) return #err(#NotAuthorized);
    let y = PropertyTax.clean(input);
    switch (PropertyTax.validate(y)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let existing = propertyTaxYears.get(propertyId) ?? [];
    let others = existing.filter(func(r : PropertyTax.Year) : Bool { r.year != y.year });
    if (others.size() >= PropertyTax.MAX_YEARS)
      return #err(#InvalidInput("This home already has 60 tax years; delete an old one first"));
    let rec = PropertyTax.toYear(y, Time.now());
    propertyTaxYears.add(propertyId, others.concat([rec]).sort(PropertyTax.newestFirst));
    #ok(rec)
  };

  /// #714: delete one saved tax year. Owner and co-owners only. Can't be undone.
  public shared(msg) func deletePropertyTaxYear(propertyId: Text, year: Nat) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not hasFullControl(propertyId, msg.caller)) return #err(#NotAuthorized);
    let existing = propertyTaxYears.get(propertyId) ?? [];
    let kept = existing.filter(func(r : PropertyTax.Year) : Bool { r.year != year });
    if (kept.size() == existing.size()) return #err(#NotFound);
    if (kept.size() == 0) propertyTaxYears.remove(propertyId) else propertyTaxYears.add(propertyId, kept);
    #ok(())
  };

  /// #714: the saved tax years, newest first. Owner and co-owners only.
  public query(msg) func getPropertyTaxYears(propertyId: Text) : async Result.Result<[PropertyTaxYear], Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not hasFullControl(propertyId, msg.caller)) return #err(#NotAuthorized);
    #ok(propertyTaxYears.get(propertyId) ?? [])
  };

  /// #714: for the weekly Home Pulse email, each of `owner`'s active homes
  /// with tax years saved: the two newest years' exemption status and
  /// petition deadline (no values or notes). Notifiers and admins only.
  public query(msg) func getPulsePropertyTax(owner: Principal) : async Result.Result<[PulsePropertyTax], Error> {
    if (not Admin.contains(notifierEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let out = List.empty<PulsePropertyTax>();
    for (p in ownedBy(owner)) {
      if (p.isActive) {
        switch (propertyTaxYears.get(p.id)) {
          case (?ys) {
            let newest = ys.sliceToArray(0, Nat.min(ys.size(), PropertyTax.PULSE_YEARS));
            out.add({ propertyId = p.id; years = newest.map(PropertyTax.pulseYear) });
          };
          case null {};
        };
      };
    };
    #ok(out.toArray())
  };

  // ─── Successor / legacy contact (#724) ───────────────────────────────────
  //
  //  1. The owner names a successor (setSuccessor) and gets a successor link
  //     (/successor/<token>) to give them or keep with their estate papers.
  //     HomeGentic doesn't email the successor.
  //  2. The successor opens a claim from the link with a proof document
  //     (openSuccessionClaim). The owner and co-owners are told at once.
  //  3. A HomeGentic admin reads the document and approves or rejects it
  //     (reviewSuccessionClaim).
  //  4. Once approved AND 30 days after it was opened, the successor finishes
  //     it (completeSuccessionClaim) and the record moves like claimTransfer.
  //     The owner or a co-owner can cancel at any point before that.
  //  HomeGentic passes on the record only; it doesn't transfer the property.

  private func household(propertyId : Text, owner : Principal) : [Principal] {
    let mgrs = managersMap.get(propertyId) ?? [];
    [owner].concat(mgrs.filter(func(m : PropertyManager) : Bool { m.role == #CoOwner }).map(func(m : PropertyManager) : Principal { m.principal }))
  };

  private func notify(kind : Text, recipient : Principal, refId : Text, summary : Text) {
    notifyLatestSeq := Notify.record(notifyLog, notifyLatestSeq, kind, ?recipient, refId, summary);
  };

  private func addressOf(propertyId : Text) : Text {
    switch (properties.get(propertyId)) { case (?p) p.address; case null "" }
  };

  private func dropSuccessor(propertyId : Text) {
    switch (successors.get(propertyId)) {
      case (?s) { successorTokenIdx.remove(s.token); successors.remove(propertyId) };
      case null {};
    };
  };

  /// Ends a claim: new status, proof deleted, no longer the home's open claim.
  private func closeClaim(c : SuccessionClaim, status : SuccessionClaimStatus) : SuccessionClaim {
    let closed = { c with status };
    successionClaims.add(c.id, closed);
    successionProofs.remove(c.id);
    if (openClaimByProperty.get(c.propertyId) == ?c.id) openClaimByProperty.remove(c.propertyId);
    closed
  };

  /// Cancels the home's open claim, if any, and tells the claimant.
  private func cancelOpenClaim(propertyId : Text, by : Principal, now : Int) : ?SuccessionClaim {
    switch (openClaimByProperty.get(propertyId)) {
      case null null;
      case (?id) {
        switch (successionClaims.get(id)) {
          case null { openClaimByProperty.remove(propertyId); null };
          case (?c) {
            let closed = closeClaim(c, #Cancelled({ at = now; by }));
            if (by != c.claimant) notify("succession_claim_cancelled", c.claimant, c.id, addressOf(propertyId));
            ?closed
          };
        }
      };
    }
  };

  /// Removes every claim `pick` selects, with its proof and open slot.
  private func dropSuccessionClaims(pick : SuccessionClaim -> Bool) : Nat {
    let gone = successionClaims.values().filter(pick).toArray();
    for (c in gone.values()) {
      successionClaims.remove(c.id);
      successionProofs.remove(c.id);
      if (openClaimByProperty.get(c.propertyId) == ?c.id) openClaimByProperty.remove(c.propertyId);
    };
    gone.size()
  };

  /// #724: name (or rename) the home's successor. Owner only. Every call
  /// issues a new successor link; the old one stops working. Refused while a
  /// claim is open.
  public shared(msg) func setSuccessor(propertyId: Text, input: SuccessorInput) : async Result.Result<Successor, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    // Randomness first, so the checks and writes below run as one step.
    let rand = await Random.blob();
    let prop = switch (properties.get(propertyId)) { case null return #err(#NotFound); case (?p) p };
    if (prop.owner != msg.caller) return #err(#NotAuthorized);
    if (openClaimByProperty.get(propertyId) != null)
      return #err(#InvalidInput("A successor claim is open on this home; cancel it before changing your successor"));
    let s = Succession.cleanSuccessor(input);
    switch (Succession.validateSuccessor(s)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    dropSuccessor(propertyId);
    let rec : Successor = { s with token = blobToHex(rand); namedAt = Time.now() };
    successors.add(propertyId, rec);
    successorTokenIdx.add(rec.token, propertyId);
    #ok(rec)
  };

  /// #724: the home's successor and link, or null. Owner only.
  public query(msg) func getSuccessor(propertyId: Text) : async Result.Result<?Successor, Error> {
    let prop = switch (properties.get(propertyId)) { case null return #err(#NotFound); case (?p) p };
    if (prop.owner != msg.caller) return #err(#NotAuthorized);
    #ok(successors.get(propertyId))
  };

  /// #724: remove the successor; the link stops working. Owner only.
  /// Refused while a claim is open.
  public shared(msg) func removeSuccessor(propertyId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let prop = switch (properties.get(propertyId)) { case null return #err(#NotFound); case (?p) p };
    if (prop.owner != msg.caller) return #err(#NotAuthorized);
    if (openClaimByProperty.get(propertyId) != null)
      return #err(#InvalidInput("A successor claim is open on this home; cancel it first"));
    dropSuccessor(propertyId);
    #ok(())
  };

  /// #724: what a successor link shows, or null for an unknown link. The
  /// token is the credential.
  public query func getSuccessionInvite(token: Text) : async ?SuccessionInvite {
    let pid = switch (successorTokenIdx.get(token)) { case null return null; case (?p) p };
    switch (successors.get(pid), properties.get(pid)) {
      case (?s, ?p) {
        if (s.token != token or not p.isActive) return null;
        ?{ property = redactProperty(p); successorName = s.name; waitDays = Succession.WAIT_DAYS }
      };
      case _ null;
    }
  };

  /// #724: the successor opens a claim from their link, with a proof
  /// document (PDF, JPEG or PNG, at most 1.8 MB). One open claim per home;
  /// the owner can't claim their own home. The owner and co-owners are
  /// told at once and can cancel until the record moves.
  public shared(msg) func openSuccessionClaim(token: Text, input: SuccessionClaimInput, proof: Blob) : async Result.Result<SuccessionClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let pid = switch (successorTokenIdx.get(token)) { case null return #err(#NotFound); case (?p) p };
    let prop = switch (properties.get(pid)) { case null return #err(#NotFound); case (?p) p };
    if (not prop.isActive) return #err(#NotFound);
    if (prop.owner == msg.caller) return #err(#InvalidInput("You own this home; only your successor can open a claim"));
    if (openClaimByProperty.get(pid) != null)
      return #err(#InvalidInput("A claim is already open on this home"));
    let c = Succession.cleanClaim(input);
    switch (Succession.validateClaim(c, proof)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let onHome = successionClaims.values().filter(func(x : SuccessionClaim) : Bool { x.propertyId == pid }).size();
    if (onHome >= Succession.MAX_CLAIMS_PER_PROPERTY)
      return #err(#InvalidInput("This home has had too many claims; contact HomeGentic support"));

    successionClaimCounter += 1;
    let id = "sc-" # successionClaimCounter.toText();
    let claim = Succession.open(id, pid, msg.caller, c, proof.size(), Time.now());
    successionClaims.add(id, claim);
    successionProofs.add(id, { fileName = c.fileName; mimeType = c.mimeType; data = proof });
    openClaimByProperty.add(pid, id);
    for (p in household(pid, prop.owner).values()) notify("succession_claim_opened", p, id, prop.address);
    #ok(claim)
  };

  /// #724: the home's open claim, or null. Owner and co-owners only.
  public query(msg) func getOpenSuccessionClaim(propertyId: Text) : async Result.Result<?SuccessionClaim, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not hasFullControl(propertyId, msg.caller)) return #err(#NotAuthorized);
    #ok(switch (openClaimByProperty.get(propertyId)) { case (?id) successionClaims.get(id); case null null })
  };

  /// #724: the claims the caller opened, newest first.
  public query(msg) func getMySuccessionClaims() : async [SuccessionClaim] {
    successionClaims.values()
      .filter(func(c : SuccessionClaim) : Bool { c.claimant == msg.caller })
      .toArray()
      .sort(func(a : SuccessionClaim, b : SuccessionClaim) : Order.Order { Int.compare(b.openedAt, a.openedAt) })
  };

  /// #724: cancel an open claim. The home's owner or a co-owner, the
  /// claimant (withdrawing it) or an admin. The proof is deleted.
  public shared(msg) func cancelSuccessionClaim(claimId: Text) : async Result.Result<SuccessionClaim, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let c = switch (successionClaims.get(claimId)) { case null return #err(#NotFound); case (?x) x };
    if (c.claimant != msg.caller and not hasFullControl(c.propertyId, msg.caller) and not isAdmin(msg.caller))
      return #err(#NotAuthorized);
    if (not Succession.isOpen(c)) return #err(#InvalidInput("This claim is no longer open"));
    let closed = closeClaim(c, #Cancelled({ at = Time.now(); by = msg.caller }));
    if (msg.caller != c.claimant) notify("succession_claim_cancelled", c.claimant, c.id, addressOf(c.propertyId));
    #ok(closed)
  };

  /// #724: claims waiting for review, oldest first, with the home and the
  /// successor the owner named. Admins only.
  public query(msg) func listSuccessionClaimsForReview() : async Result.Result<[SuccessionReview], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let out = List.empty<SuccessionReview>();
    for (c in successionClaims.values()) {
      if (c.status == #AwaitingReview) {
        switch (properties.get(c.propertyId)) {
          case (?p) out.add({ claim = c; property = p; successor = successors.get(c.propertyId) });
          case null {};
        };
      };
    };
    #ok(out.toArray().sort(func(a : SuccessionReview, b : SuccessionReview) : Order.Order { Int.compare(a.claim.openedAt, b.claim.openedAt) }))
  };

  /// #724: the proof document of an open claim. Admins only.
  public query(msg) func getSuccessionProof(claimId: Text) : async Result.Result<SuccessionProof, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (successionProofs.get(claimId)) { case null #err(#NotFound); case (?p) #ok(p) }
  };

  /// #724: an admin approves or rejects a claim waiting for review. A
  /// rejection needs a reason the claimant will read; its proof is deleted.
  /// Approval doesn't move the record: the claimant finishes it after the wait.
  public shared(msg) func reviewSuccessionClaim(claimId: Text, approve: Bool, reason: Text) : async Result.Result<SuccessionClaim, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let c = switch (successionClaims.get(claimId)) { case null return #err(#NotFound); case (?x) x };
    if (c.status != #AwaitingReview) return #err(#InvalidInput("This claim isn't waiting for review"));
    let why = Succession.trim(reason);
    if (not approve and why.size() == 0) return #err(#InvalidInput("Give the claimant a reason"));
    if (why.size() > 500) return #err(#InvalidInput("Reason is over 500 characters"));
    let now = Time.now();
    let address = addressOf(c.propertyId);
    let out = if (approve) {
      let approved = { c with status = #Approved({ at = now }) };
      successionClaims.add(c.id, approved);
      let owner = switch (properties.get(c.propertyId)) { case (?p) p.owner; case null c.claimant };
      for (p in household(c.propertyId, owner).values()) notify("succession_claim_approved", p, c.id, address);
      notify("succession_claim_approved", c.claimant, c.id, address);
      approved
    } else {
      let rejected = closeClaim(c, #Rejected({ at = now; reason = why }));
      notify("succession_claim_rejected", c.claimant, c.id, address);
      rejected
    };
    try { await auditLog(if (approve) "SuccessionClaimApproved" else "SuccessionClaimRejected", ?c.claimant, "claimId=" # c.id # " propertyId=" # c.propertyId # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(out)
  };

  /// #724: the claimant finishes an approved claim once the 30-day wait is
  /// over, and the record moves to them like a transfer (the previous
  /// household loses access; the history records "succession:<claimId>").
  public shared(msg) func completeSuccessionClaim(claimId: Text) : async Result.Result<Property, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let c = switch (successionClaims.get(claimId)) { case null return #err(#NotFound); case (?x) x };
    if (c.claimant != msg.caller) return #err(#NotAuthorized);
    let now = Time.now();
    switch (Succession.blockToComplete(c, now)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    let prop = switch (properties.get(c.propertyId)) { case null return #err(#NotFound); case (?p) p };
    // Take the claim out of the open slot first so moveRecord doesn't cancel it.
    ignore closeClaim(c, #Completed({ at = now }));
    let updated = moveRecord(prop, msg.caller, "succession:" # c.id, now);
    await* afterMove(c.propertyId, msg.caller, prop);
    #ok(updated)
  };

  /// #724: for a waiting-period reminder: the claim, the address and who is
  /// in the household now. Notifiers and admins only.
  public query(msg) func getSuccessionNotice(claimId: Text) : async Result.Result<?SuccessionNotice, Error> {
    if (not Admin.contains(notifierEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (successionClaims.get(claimId)) {
      case null #ok(null);
      case (?c) {
        switch (properties.get(c.propertyId)) {
          case null #ok(null);
          case (?p) #ok(?{ claim = c; address = p.address; household = household(p.id, p.owner) });
        }
      };
    }
  };

  /// Outbox events with seq > afterSeq, oldest first (at most 200 per call).
  /// Notifiers and admins only.
  public query(msg) func getNotificationEvents(afterSeq: Nat, limit: Nat) : async Result.Result<Notify.Page, Error> {
    if (not Admin.contains(notifierEntries, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Notify.page(notifyLog, notifyLatestSeq, afterSeq, limit))
  };

  // ─── Move-in plan (#712) ──────────────────────────────────────────────────

  /// The plan on a home the caller can change, or the error to return.
  private func writablePlan(propertyId : Text, caller : Principal) : Result.Result<MoveIn.Plan, Error> {
    switch (requireActive(caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, caller, true)) return #err(#NotAuthorized);
    switch (moveInPlans.get(propertyId)) { case null #err(#NotFound); case (?p) #ok(p) }
  };

  /// #712: start a move-in plan on the home, or return the one it has. Needs
  /// write access. A buyer who claims a home gets one without asking.
  public shared(msg) func startMoveInPlan(propertyId: Text) : async Result.Result<MoveInPlan, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    switch (moveInPlans.get(propertyId)) {
      case (?p) #ok(p);
      case null {
        let p = MoveIn.fresh(Time.now());
        moveInPlans.add(propertyId, p);
        #ok(p)
      };
    }
  };

  /// #712: the home's move-in plan, or null. Anyone with a role on the home and admins.
  public query(msg) func getMoveInPlan(propertyId: Text) : async Result.Result<?MoveInPlan, Error> {
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, false) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(moveInPlans.get(propertyId))
  };

  /// #712: mark a step (or a task, by its id) done or not done.
  public shared(msg) func setMoveInStep(propertyId: Text, stepId: Text, done: Bool) : async Result.Result<MoveInPlan, Error> {
    if (not MoveIn.isStepId(stepId)) return #err(#InvalidInput("That step doesn't exist"));
    let plan = switch (writablePlan(propertyId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(p)) p };
    if (done and plan.doneSteps.size() >= MoveIn.MAX_DONE and plan.doneSteps.find(func s = s == stepId) == null)
      return #err(#InvalidInput("This plan has too many finished steps"));
    let next = MoveIn.mark(plan, stepId, done, Time.now());
    moveInPlans.add(propertyId, next);
    #ok(next)
  };

  /// #712: add tasks the owner reviewed (usually from the purchase
  /// inspection). 1 to 25 per call, at most 60 on a plan.
  public shared(msg) func addMoveInTasks(propertyId: Text, inputs: [MoveInTaskInput]) : async Result.Result<MoveInPlan, Error> {
    let plan = switch (writablePlan(propertyId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(p)) p };
    if (inputs.size() == 0) return #err(#InvalidInput("Choose at least one task to add"));
    if (inputs.size() > MoveIn.MAX_TASKS_PER_CALL) return #err(#InvalidInput("Add up to 25 tasks at a time"));
    if (plan.tasks.size() + inputs.size() > MoveIn.MAX_TASKS)
      return #err(#InvalidInput("A move-in plan can hold up to 60 tasks; delete some first"));
    let cleaned = inputs.map(MoveIn.clean);
    for (t in cleaned.values()) {
      switch (MoveIn.validate(t)) { case (?why) return #err(#InvalidInput(why)); case null {} };
    };
    let now = Time.now();
    let added = cleaned.map(func(t : MoveIn.TaskInput) : MoveIn.Task {
      moveInTaskCounter += 1;
      { id = "mt-" # moveInTaskCounter.toText(); title = t.title; detail = t.detail; area = t.area; urgency = t.urgency; createdAt = now }
    });
    let next = { plan with tasks = plan.tasks.concat(added); updatedAt = now };
    moveInPlans.add(propertyId, next);
    #ok(next)
  };

  /// #712: delete a task from the plan (and its tick).
  public shared(msg) func deleteMoveInTask(propertyId: Text, taskId: Text) : async Result.Result<MoveInPlan, Error> {
    let plan = switch (writablePlan(propertyId, msg.caller)) { case (#err(e)) return #err(e); case (#ok(p)) p };
    if (plan.tasks.find(func(t : MoveIn.Task) : Bool { t.id == taskId }) == null) return #err(#NotFound);
    let now = Time.now();
    let next = MoveIn.mark({ plan with tasks = plan.tasks.filter(func(t : MoveIn.Task) : Bool { t.id != taskId }) }, taskId, false, now);
    moveInPlans.add(propertyId, next);
    #ok(next)
  };

  /// #712: end the move-in plan (removes it). Needs write access.
  public shared(msg) func endMoveInPlan(propertyId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (properties.get(propertyId) == null) return #err(#NotFound);
    if (not checkAuthorized(propertyId, msg.caller, true)) return #err(#NotAuthorized);
    moveInPlans.remove(propertyId);
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
    try { await auditLog("CanisterPaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    try { await auditLog("CanisterUnpaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[property] fire-and-forget call failed") };
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
      return #err(#Unavailable("A property registration is in progress; try again shortly"));

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

      // #711: the home's insurance policy.
      if (insurancePolicies.get(pid) != null) { insurancePolicies.remove(pid); removed += 1 };
      removed += dropClaims(pid);
      removed += dropInventory(pid);
      // #725 house guide and links; #726 HOA paperwork.
      removed += dropGuide(pid);
      removed += dropHoa(pid);
      // #719 home warranty plan and claims, #722 mortgage, #718 flood zone.
      if (homeWarrantyPlans.get(pid) != null) { homeWarrantyPlans.remove(pid); removed += 1 };
      removed += dropWarrantyClaims(pid);
      if (mortgageLoans.get(pid) != null) { mortgageLoans.remove(pid); removed += 1 };
      if (floodZones.get(pid) != null) { floodZones.remove(pid); removed += 1 };
      // #714 property-tax years.
      switch (propertyTaxYears.get(pid)) {
        case (?ys) { propertyTaxYears.remove(pid); removed += ys.size() };
        case null {};
      };
      // #712 move-in plan.
      if (moveInPlans.get(pid) != null) { moveInPlans.remove(pid); removed += 1 };
      // #724 successor, its link, and the claims on this home (with proofs).
      if (successors.get(pid) != null) { dropSuccessor(pid); removed += 1 };
      removed += dropSuccessionClaims(func(c : SuccessionClaim) : Bool { c.propertyId == pid });

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

    // #724: claims the caller opened on other owners' homes (open ones end
    // with their proof).
    removed += dropSuccessionClaims(func(c : SuccessionClaim) : Bool { c.claimant == caller });

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
      let addressTaken = func() : Bool {
        switch (addressIdx.get(key)) {
          case (?existingId) {
            switch (properties.get(existingId)) {
              case (?existing) { existing.isActive };
              case null        { false };
            }
          };
          case null { false };
        }
      };

      if (addressTaken()) {
        failed.add({ index = i; reason = "DuplicateAddress" });
      } else {
        let newId = await nextPropertyId();
        // Checked again after the await: a registerProperty for the same
        // address can finish while we wait, and must not be duplicated.
        if (addressTaken()) {
          failed.add({ index = i; reason = "DuplicateAddress" });
        } else {
          let now   = Time.now();
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

  /// A guide for AI assistants and other integrators to how this canister
  /// behaves: units, auth, what can't be undone, fees (service-discoverability
  /// skill, Layer 3; read through ICP MCP). Text in ./ApiDoc.mo.
  public query func getApiDoc() : async Text { ApiDoc.text() };

  // ─── Sibling canister IDs (M-5) ─────────────────────────────────────────────

  /// Re-read sibling IDs from icp-cli's PUBLIC_CANISTER_ID:<name> variables;
  /// see Canisters.envId. Runs on install and on every upgrade.
  func syncCanisterIds<system>() {
    auditCanisterId := Canisters.envPrincipal<system>("audit", auditCanisterId);
    payCanisterId := Canisters.envId<system>("payment", payCanisterId);
    jobCanisterId := Canisters.envPrincipal<system>("job", jobCanisterId);
    listingCanisterId := Canisters.envId<system>("listing", listingCanisterId);
    photoCanisterId := Canisters.envId<system>("photo", photoCanisterId);
  };
  syncCanisterIds<system>();
}
