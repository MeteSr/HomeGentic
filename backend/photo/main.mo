/**
 * HomeGentic Photo Canister
 * Stores construction/maintenance phase photos with tier-based quotas,
 * SHA-256 duplicate prevention, and multi-approval verification.
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
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Index     "../shared/Index";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";
import Inspect "../shared/Inspect";
import Errors "../shared/Errors";

persistent actor Photo {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type ConstructionPhase = {
    #PreConstruction;
    #Foundation;
    #Framing;
    #Electrical;
    #Plumbing;
    #HVAC;
    #Insulation;
    #Drywall;
    #Finishing;
    #PostConstruction;
    #Warranty;
    #Listing;  // FSBO listing photos — uploaded with synthetic jobId "LISTING_<propertyId>"
  };

  public type SubscriptionTier = {
    #Free;
    #Pro;
    #ContractorFree;
    #ContractorPro;
  };

  public type PhotoQuota = {
    tier: SubscriptionTier;
    maxPerJob: Nat;       // 0 = unlimited
    maxPerProperty: Nat;  // 0 = unlimited
  };

  public type Photo = {
    id: Text;
    jobId: Text;
    propertyId: Text;
    owner: Principal;
    phase: ConstructionPhase;
    description: Text;
    hash: Text;           // SHA-256 hex string, used for duplicate detection
    data: Blob;           // raw image bytes
    size: Nat;            // byte count (mirrors data.size())
    verified: Bool;
    approvals: [Principal];
    createdAt: Time.Time;
  };

  /// A photo without its bytes. List endpoints return these so a reply stays
  /// small however many photos match; bytes come from getPhotoData(Batch).
  public type PhotoMeta = {
    id: Text;
    jobId: Text;
    propertyId: Text;
    owner: Principal;
    phase: ConstructionPhase;
    description: Text;
    hash: Text;
    size: Nat;
    verified: Bool;
    approvals: [Principal];
    createdAt: Time.Time;
    /// The bytes live off-chain (GET /photos/<id> on the voice Worker), so
    /// getPhotoDataBatch has nothing for this photo. Returned only, never stored.
    offChain: Bool;
  };

  /// Pre-Blob storage shape: `[Nat8]` spends a machine word per byte. Only the
  /// legacy `photos` map uses it; postupgrade drains it into `photoStore`.
  type LegacyPhoto = {
    id: Text;
    jobId: Text;
    propertyId: Text;
    owner: Principal;
    phase: ConstructionPhase;
    description: Text;
    hash: Text;
    data: [Nat8];
    size: Nat;
    verified: Bool;
    approvals: [Principal];
    createdAt: Time.Time;
  };

  public type Error = Errors.Common or {
    #QuotaExceeded: Text;
    #Duplicate: Text;     // payload is the existing photo ID
  };

  public type Metrics = {
    totalPhotos: Nat;
    verifiedPhotos: Nat;
    totalStorageBytes: Nat;
    isPaused: Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var photoCounter: Nat = 0;
  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  private var adminListEntries: [Principal] = [];
  private var auditCanisterId : ?Principal  = null;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call when no admins exist yet.
  private var bootstrapNonce: ?Text = null;
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  /// When set, uploadPhoto() cross-calls getTierForPrincipal(); without it every
  /// caller is treated as #Free (fail closed).
  private var payCanisterId: Text = "";
  /// Property canister ID — set post-deploy via setPropertyCanisterId().
  /// When set, uploadPhoto() uses the property owner's tier when the caller
  /// is a delegated manager, so managers don't need their own subscription.
  private var propCanisterId: Text = "";
  /// #716: job canister ID (setJobCanisterId / PUBLIC_CANISTER_ID:job). It
  /// vouches for a contractor uploading the final lien waiver of a job they
  /// signed (beginWaiverUpload). Empty = that path is off.
  private var jobCanisterId: Text = "";
  // ─── Stable State ────────────────────────────────────────────────────────────

  /// Legacy store, kept only so upgrades stay compatible; always empty after
  /// postupgrade has moved its photos into `photoStore`.
  private let photos      = Map.empty<Text, LegacyPhoto>();
  private let photoStore  = Map.empty<Text, Photo>();
  /// Duplicate detection, O(1). L-6: keyed "<owner principal>:<sha256>" so
  /// dedup is per uploader and nobody can squat another user's hash. Entries
  /// written before that change are keyed by the bare sha256 (see dupOf).
  private let hashIndex   = Map.empty<Text, Text>();
  private let photoRateLimits = Map.empty<Text, (Nat, Int)>();
  /// Photos whose bytes live in off-chain storage (the voice Worker's R2
  /// bucket) instead of `data`, which stays empty for them. Created by
  /// beginUpload; the Worker only accepts bytes that hash to `Photo.hash`.
  private let offChainIds = Map.empty<Text, ()>();
  /// Principals (the voice Worker) allowed to call photoAccess.
  private var photoRelays : [Principal] = [];
  /// CD-7 (cycle-drain audit 2026-10-31): on-chain uploads (bytes in this
  /// canister's heap) stay on while off-chain storage is being rolled out;
  /// an admin turns them off with setOnChainUploadsEnabled once R2 is live.
  private var onChainUploadsEnabled : Bool = true;
  /// Part 3 of the off-chain move: while on, the photo relay (the voice
  /// Worker's cron) copies on-chain photos to R2 (onChainPhotoPage) and then
  /// has this canister empty its copy (confirmOffChain). Off until an admin
  /// has taken a snapshot and turns it on. New stable var, inline initializer.
  private var offChainMigrationEnabled : Bool = false;
  /// M-1 (security audit 2026-11-10): photos that stay private to their
  /// uploader after the home changed hands. When the property canister
  /// reports a transfer (propertyTransferred), the previous household's
  /// personal papers (see isPersonal) are added here; from then on only the
  /// uploader and admins can list, read, verify or delete them, and they no
  /// longer count toward the home's limits. A new stable map with an inline
  /// initializer; Photo itself is unchanged.
  private let sealedIds = Map.empty<Text, ()>();

  // Secondary indexes (photo ids by jobId / propertyId), rebuilt on every upgrade.
  private transient let photosByJob      = Index.build(photoStore, func(p) { ?p.jobId });
  private transient let photosByProperty = Index.build(photoStore, func(p) { ?p.propertyId });

  /// M-5: per-uploader usage (photo count, bytes), rebuilt on every upgrade
  /// and kept current by putPhoto / deletePhotoRecord.
  private transient let usageByOwner : Map.Map<Text, (Nat, Nat)> = do {
    let m = Map.empty<Text, (Nat, Nat)>();
    for (p in photoStore.values()) {
      let k = p.owner.toText();
      let (c, b) = m.get(k).get((0, 0));
      m.add(k, (c + 1, b + p.size));
    };
    m
  };

  private func usageOf(owner : Principal) : (Nat, Nat) {
    usageByOwner.get(owner.toText()).get((0, 0))
  };

  private func addUsage(owner : Principal, count : Int, bytes : Int) {
    let (c, b) = usageOf(owner);
    let nc : Int = c + count;
    let nb : Int = b + bytes;
    usageByOwner.add(owner.toText(),
      (if (nc < 0) 0 else Int.abs(nc), if (nb < 0) 0 else Int.abs(nb)));
  };

  private func putPhoto(p: Photo) {
    switch (photoStore.get(p.id)) {
      case (?old) { addUsage(old.owner, -1, -old.size) };
      case null   {};
    };
    photoStore.add(p.id, p);
    Index.add(photosByJob, p.jobId, p.id);
    Index.add(photosByProperty, p.propertyId, p.id);
    addUsage(p.owner, 1, p.size);
  };

  private func deletePhotoRecord(p: Photo) {
    photoStore.remove(p.id);
    offChainIds.remove(p.id);
    sealedIds.remove(p.id);
    Index.remove(photosByJob, p.jobId, p.id);
    Index.remove(photosByProperty, p.propertyId, p.id);
    addUsage(p.owner, -1, -p.size);
  };

  private func hashKey(owner : Principal, hash : Text) : Text {
    owner.toText() # ":" # hash
  };

  /// L-6: the caller's existing photo with this hash, if any. Legacy entries
  /// (bare-hash keys) only count when the caller uploaded that photo.
  private func dupOf(owner : Principal, hash : Text) : ?Text {
    switch (hashIndex.get(hashKey(owner, hash))) {
      case (?id) { return ?id };
      case null {};
    };
    switch (hashIndex.get(hash)) {
      case (?id) {
        switch (photoStore.get(id)) {
          case (?p) { if (p.owner == owner) ?id else null };
          case null null;
        }
      };
      case null null;
    }
  };

  private func dropHash(p : Photo) {
    for (k in [hashKey(p.owner, p.hash), p.hash].values()) {
      if (hashIndex.get(k) == ?p.id) { hashIndex.remove(k) };
    };
  };

  system func postupgrade() {
    for (old in photos.values()) {
      putPhoto({ old with data = old.data.toBlob() });
    };
    photos.clear();
  };

  private func meta(p: Photo) : PhotoMeta {
    {
      id = p.id; jobId = p.jobId; propertyId = p.propertyId; owner = p.owner;
      phase = p.phase; description = p.description; hash = p.hash; size = p.size;
      verified = p.verified; approvals = p.approvals; createdAt = p.createdAt;
      offChain = offChainIds.containsKey(p.id);
    }
  };

  /// Photos are listed by jobId; listing photos use the synthetic jobId
  /// "LISTING_<propertyId>" and are public.
  private func isListingPhoto(p: Photo) : Bool {
    p.jobId == listingJobId(p.propertyId)
  };

  private func listingJobId(propertyId: Text) : Text { "LISTING_" # propertyId };

  /// The type of a vault document, from its description "[Type] filename"
  /// (frontend documentVault.ts). A vault document with no "[…]" prefix is an
  /// older receipt. Null for anything that isn't in the home's vault.
  private func docTypeOf(p : Photo) : ?Text {
    if (not isDocumentJob(p.jobId, p.propertyId)) return null;
    let d = p.description;
    if (not d.startsWith(#char '[')) return ?"Receipt";
    let inner = d.chars().drop(1);
    var t = "";
    for (c in inner) {
      if (c == ']') return ?t;
      if (t.size() >= 40) return ?"Other";
      t #= c.toText();
    };
    ?"Other"
  };

  /// Vault document types that describe the house and go with it when it
  /// changes hands. Every other type (closing papers, title, deed, insurance,
  /// HOA, "other", and any type this canister doesn't know) is personal.
  private transient let HOME_DOC_TYPES : [Text] = [
    "Receipt", "Invoice", "Permit", "Inspection", "Warranty", "LienWaiver", "NOC",
    "Survey", "Elevation", "Manual",
  ];

  /// M-1: whether a file is the household's own paperwork rather than part
  /// of the home's record: personal vault documents, and insurance-claim
  /// ("claim_<id>") and contents-inventory ("inventory_<id>") photos.
  private func isPersonal(p : Photo) : Bool {
    if (p.jobId.startsWith(#text "claim_") or p.jobId.startsWith(#text "inventory_")) return true;
    switch (docTypeOf(p)) {
      case null false;
      case (?t) HOME_DOC_TYPES.find(func x = x == t) == null;
    }
  };

  private func isSealed(p : Photo) : Bool { sealedIds.containsKey(p.id) };

  /// M-1: a sealed photo is hidden from `reader` unless they uploaded it or are an admin.
  private func sealedFrom(p : Photo, reader : Principal) : Bool {
    isSealed(p) and p.owner != reader and not isAdmin(reader)
  };

  /// Home document vault (the Documents tab): files are stored under the
  /// synthetic jobId "docs_<propertyId>"; "receipts_<propertyId>" is the
  /// older id for the same tab. Documents have their own per-home limit
  /// (docLimitFor) instead of the per-job photo limit, and don't count
  /// toward the home's photo limit.
  private func docsJobId(propertyId: Text) : Text { "docs_" # propertyId };
  private func isDocumentJob(jobId: Text, propertyId: Text) : Bool {
    jobId == docsJobId(propertyId) or jobId == "receipts_" # propertyId
  };

  // ─── Ingress Inspection ───────────────────────────────────────────────────────

  /// Refuse anonymous, empty and oversized ingress before it is charged
  /// (shared/Inspect.mo, cycle-drain CD-5). Only `uploadPhoto` may send up to
  /// MAX_UPLOAD_ARG_BYTES; everything else is capped at MAX_ARG_BYTES. Every
  /// public method is listed: the compiler rejects an inspect that misses one,
  /// so a new method has to be added here. Each method keeps its own checks.
  system func inspect({
    caller : Principal;
    arg : Blob;
    msg : {
      #addAdmin : Any;
      #addPhotoRelay : Any;
      #beginUpload : Any;
      #beginWaiverUpload : Any;
      #confirmOffChain : Any;
      #deleteMyData : Any;
      #dropUnuploadedPhotos : Any;
      #deletePhoto : Any;
      #getGuidePhotoData : Any;
      #getListingPhotoDataBatch : Any;
      #getMetrics : Any;
      #getMyOffChainPhotoIds : Any;
      #getOffChainMigrationStatus : Any;
      #getPaperDocument : Any;
      #getOnChainUploadsEnabled : Any;
      #getPhoto : Any;
      #getPhotoData : Any;
      #getPhotoDataBatch : Any;
      #getPhotosByJob : Any;
      #getPhotosByPhase : Any;
      #getPhotosByProperty : Any;
      #getPhotosByRoom : Any;
      #getPublicListingPhotos : Any;
      #guidePhotoAccess : Any;
      #knownPhotoIds : Any;
      #offChainPhotoPage : Any;
      #onChainPhotoPage : Any;
      #pause : Any;
      #photoAccess : Any;
      #propertyTransferred : Any;
      #removeAdmin : Any;
      #removePhotoRelay : Any;
      #setAuditCanisterId : Any;
      #setBootstrapNonce : Any;
      #setJobCanisterId : Any;
      #setOffChainMigrationEnabled : Any;
      #setOnChainUploadsEnabled : Any;
      #setPaymentCanisterId : Any;
      #setPropertyCanisterId : Any;
      #setUpdateRateLimit : Any;
      #unpause : Any;
      #uploadPhoto : Any;
      #uploadWaiver : Any;
      #verifyPhoto : Any;
    };
  }) : Bool {
    let max = switch msg {
      case (#uploadPhoto _) Inspect.MAX_UPLOAD_ARG_BYTES;
      case (#uploadWaiver _) Inspect.MAX_UPLOAD_ARG_BYTES;
      case _ Inspect.MAX_ARG_BYTES;
    };
    Inspect.accept(caller, arg, max)
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Update-call rate limit (cycle-drain protection) ────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(p: Principal) : Bool {
    Admin.contains(adminListEntries, p)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#RateLimited)
    };
    #ok(())
  };

  /// Delegate property-ownership check to the property canister. Fails closed
  /// with #Unavailable when propCanisterId is unset (auth must never silently
  /// degrade) or the property canister didn't answer, rather than trapping
  /// (reviewing-motoko M3, M-4).
  private func checkPropertyAuth(propertyId: Text, _owner: Principal, caller: Principal, requireWrite: Bool) : async* Result.Result<(), Error> {
    if (propCanisterId == "") return #err(#Unavailable("Photo access checks are unavailable right now. Please try again later."));
    await* Canisters.authorize(propCanisterId, propertyId, caller, requireWrite)
  };

  private func nextPhotoId() : Text {
    photoCounter += 1;
    "PHOTO_" # photoCounter.toText()
  };

  // #Pro is the single homeowner plan ($59/year).
  private func quotaFor(tier: SubscriptionTier) : PhotoQuota {
    switch (tier) {
      case (#Free)          { { tier; maxPerJob = 5;   maxPerProperty = 25  } };
      case (#ContractorFree){ { tier; maxPerJob = 5;   maxPerProperty = 25  } };
      case (#Pro)           { { tier; maxPerJob = 30;  maxPerProperty = 0   } };  // 0 = unlimited
      case (#ContractorPro) { { tier; maxPerJob = 50;  maxPerProperty = 0   } };
    }
  };

  /// M-5: hard per-photo limits, independent of tier.
  private transient let MAX_PHOTO_BYTES       : Nat = 1_500_000;
  /// CD-7: on-chain photo bytes accepted per UTC day across every account
  /// (each free account could otherwise add ~37 MB). Transient: resets on
  /// upgrade, like the other daily counters.
  private transient let MAX_ONCHAIN_BYTES_PER_DAY : Nat = 500_000_000;
  private transient var onChainDay        : Int = 0;
  private transient var onChainBytesToday : Nat = 0;
  private func takeOnChainBytes(size : Nat) : Bool {
    let day = Time.now() / 86_400_000_000_000;
    if (day != onChainDay) { onChainDay := day; onChainBytesToday := 0 };
    if (onChainBytesToday + size > MAX_ONCHAIN_BYTES_PER_DAY) return false;
    onChainBytesToday += size;
    true
  };
  private transient let MAX_DESCRIPTION_CHARS : Nat = 1_000;
  private transient let MAX_ID_CHARS          : Nat = 200;

  /// M-5: per-uploader totals (photo count, bytes) across all jobs and
  /// properties — a fresh jobId per upload no longer escapes the quota.
  private func ownerCapFor(tier: SubscriptionTier) : (Nat, Nat) {
    switch (tier) {
      case (#Free or #ContractorFree) { (100,   150_000_000) };    // 100 photos / 150 MB
      case (#Pro or #ContractorPro)   { (5_000, 2_000_000_000) };  // 5,000 photos / 2 GB
    }
  };

  /// Photos under `jobId` that belong to `propertyId`. Only those count
  /// toward a job's quota, so photos someone files under another property's
  /// job, room or listing id can't use up that property's quota.
  private func countByJob(jobId: Text, propertyId: Text) : Nat {
    Index.records(photosByJob, jobId, photoStore).filter(func(p : Photo) : Bool { p.propertyId == propertyId and not isSealed(p) }).size()
  };

  /// Documents in the home's vault (both ids the Documents tab has used).
  private func countDocuments(propertyId: Text) : Nat {
    countByJob(docsJobId(propertyId), propertyId) + countByJob("receipts_" # propertyId, propertyId)
  };

  /// The home's photos, leaving out its documents, for the per-home photo limit.
  private func countPhotosOnProperty(propertyId: Text) : Nat {
    Index.records(photosByProperty, propertyId, photoStore)
      .filter(func p = not isDocumentJob(p.jobId, propertyId) and not isSealed(p))
      .size()
  };

  /// Documents per home. The per-account totals (ownerCapFor) still apply.
  private func docLimitFor(tier: SubscriptionTier) : Nat {
    switch (tier) {
      case (#Free or #ContractorFree) { 25 };
      case (#Pro or #ContractorPro)   { 250 };
    }
  };


  private transient let oneMinuteNs      : Int = 60 * 1_000_000_000;
  private transient let perMinutePhotoLimit : Nat = 10;

  /// Returns true and bumps the counter if the uploader is under the 10/min limit.
  /// Resets the window when 60 s have elapsed.
  private func tryConsumePhotoSlot(uploader: Principal) : Bool {
    let key = uploader.toText();
    let now = Time.now();
    switch (photoRateLimits.get(key)) {
      case null {
        photoRateLimits.add(key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneMinuteNs) {
          photoRateLimits.add(key, (1, now));
          true
        } else if (count >= perMinutePhotoLimit) {
          false
        } else {
          photoRateLimits.add(key, (count + 1, windowStart));
          true
        }
      };
    }
  };

  // ─── Core Functions ───────────────────────────────────────────────────────────

  /// Checks shared by uploadPhoto and beginUpload: input limits, rate limit,
  /// duplicate, property write access and tier quotas. `size` is the byte
  /// count of the photo being added. Returns the error to send, or null.
  /// async* so it runs inline in the caller's message, as these checks did
  /// before they were shared, instead of costing a self-call per upload.
  private func admitUpload(
    caller: Principal,
    jobId: Text,
    propertyId: Text,
    description: Text,
    hash: Text,
    size: Nat,
    vouched: Bool   // #716: the job canister vouched for the caller instead of the property
  ) : async* ?Error {
    if (Text.size(jobId) == 0)      return ?#InvalidInput("jobId cannot be empty");
    if (Text.size(propertyId) == 0) return ?#InvalidInput("propertyId cannot be empty");
    if (Text.size(hash) == 0)       return ?#InvalidInput("hash cannot be empty");
    if (Text.size(hash) != 64)         return ?#InvalidInput("hash must be a 64-character hex string (SHA-256)");
    if (size == 0)                  return ?#InvalidInput("data cannot be empty");
    if (size > MAX_PHOTO_BYTES)
      return ?#InvalidInput("photo exceeds " # MAX_PHOTO_BYTES.toText() # " bytes");
    if (Text.size(description) > MAX_DESCRIPTION_CHARS)
      return ?#InvalidInput("description exceeds " # MAX_DESCRIPTION_CHARS.toText() # " characters");
    if (Text.size(jobId) > MAX_ID_CHARS or Text.size(propertyId) > MAX_ID_CHARS)
      return ?#InvalidInput("jobId/propertyId too long");
    // H-1 (2026-10-28 audit): a listing photo is public on that property's
    // FSBO page, so it may only be filed under the property it is uploaded for.
    if (jobId.startsWith(#text "LISTING_") and jobId != listingJobId(propertyId))
      return ?#InvalidInput("listing photos must be uploaded to their own property");
    // Same for documents, so one home's files can't be listed under another's.
    if (jobId.startsWith(#text "docs_") and jobId != docsJobId(propertyId))
      return ?#InvalidInput("documents must be uploaded to their own property");

    // Per-minute rate limit: 10 uploads/min regardless of tier
    if (not tryConsumePhotoSlot(caller)) {
      return ?#InvalidInput(
        "Upload rate limit reached (10/minute). Please wait before uploading more photos."
      );
    };

    // Duplicate check — O(1) via hash index, scoped to the uploader (L-6)
    switch (dupOf(caller, hash)) {
      case (?existingId) { return ?#Duplicate(existingId) };
      case null          {};
    };

    // Tier quota checks — when payment canister is wired, tier comes from
    // getTierForPrincipal(); otherwise falls back to the local admin-grant map.
    // When the caller is a delegated manager, use the property owner's tier
    // so managers don't need their own paid subscription.
    let effectivePrincipal : Principal = if (propCanisterId != "") {
      switch (await* Canisters.ownerOf(propCanisterId, propertyId)) {
        case (#err(e))     { return ?e };
        case (#ok(?owner)) { owner };
        case (#ok(null))   { caller };
      }
    } else { caller };
    let callerTierRaw : SubscriptionTier = if (payCanisterId != "") {
      switch (await* Canisters.tierOf(payCanisterId, effectivePrincipal)) {
        case (#err(e)) { return ?e };
        case (#ok(t))  { t };
      }
    } else {
      #Free  // payment canister not wired: no tier source, fail closed
    };
    let quota = quotaFor(callerTierRaw);

    let callerTier = quota.tier;
    // Only Free has an upgrade path: Pro is the single $59/year plan.
    let upgradeHint = switch (callerTier) {
      case (#Free) {
        " Upgrade to Pro ($59/year) for 30 photos/job."
      };
      case _ { "" };
    };

    // H-11: Verify caller is authorized for this property before storing the photo.
    if (not isAdmin(caller) and not vouched) {
      switch (await* checkPropertyAuth(propertyId, effectivePrincipal, caller, true)) {
        case (#err(e)) return ?e;
        case (#ok(_)) {};
      };
    };

    if (isDocumentJob(jobId, propertyId)) {
      let limit = docLimitFor(callerTier);
      if (countDocuments(propertyId) >= limit) {
        let docHint = switch (callerTier) {
          case (#Free) { " Upgrade to Pro ($59/year) for up to " # docLimitFor(#Pro).toText() # " documents per home." };
          case _       { "" };
        };
        return ?#QuotaExceeded(
          "Document limit (" # limit.toText() # ") reached for this home on your plan." # docHint
        );
      };
    } else {
      if (quota.maxPerJob > 0 and countByJob(jobId, propertyId) >= quota.maxPerJob) {
        return ?#QuotaExceeded(
          "Job photo limit (" # quota.maxPerJob.toText() # ") reached for your plan." # upgradeHint
        );
      };
    };

    if (not isDocumentJob(jobId, propertyId) and quota.maxPerProperty > 0 and countPhotosOnProperty(propertyId) >= quota.maxPerProperty) {
      return ?#QuotaExceeded(
        "Property photo limit (" # quota.maxPerProperty.toText() # ") reached for your plan." # upgradeHint
      );
    };

    // M-5: per-uploader totals. Read after the awaits above, so concurrent
    // uploads from one principal can't all pass on a stale count.
    if (not isAdmin(caller)) {
      let (maxCount, maxBytes) = ownerCapFor(callerTier);
      let (usedCount, usedBytes) = usageOf(caller);
      if (usedCount >= maxCount or usedBytes + size > maxBytes) {
        return ?#QuotaExceeded(
          "Account photo storage limit (" # maxCount.toText() # " photos / " #
          Nat.toText(maxBytes / 1_000_000) # " MB) reached for your plan." # upgradeHint
        );
      };
    };

    // Re-check the duplicate after the awaits (a concurrent upload of the
    // same image by this caller may have landed meanwhile).
    switch (dupOf(caller, hash)) {
      case (?existingId) { return ?#Duplicate(existingId) };
      case null          {};
    };
    null
  };

  private func addPhoto(
    caller: Principal,
    jobId: Text,
    propertyId: Text,
    phase: ConstructionPhase,
    description: Text,
    hash: Text,
    data: Blob,
    size: Nat
  ) : Photo {
    let id = nextPhotoId();
    let photo: Photo = {
      id;
      jobId;
      propertyId;
      owner       = caller;
      phase;
      description;
      hash;
      data;
      size;
      verified    = false;
      approvals   = [];
      createdAt   = Time.now();
    };
    putPhoto(photo);
    hashIndex.add(hashKey(caller, hash), id);
    photo
  };

  /// Upload a photo. Enforces duplicate (hash) and tier quota checks.
  /// Tier is looked up from the admin-managed grant table — callers cannot
  /// supply or spoof their own tier.
  public shared(msg) func uploadPhoto(
    jobId: Text,
    propertyId: Text,
    phase: ConstructionPhase,
    description: Text,
    hash: Text,
    data: Blob
  ) : async Result.Result<PhotoMeta, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not onChainUploadsEnabled and not isAdmin(msg.caller))
      return #err(#InvalidInput("On-chain photo uploads are off. Please update the app to upload photos."));
    switch (await* admitUpload(msg.caller, jobId, propertyId, description, hash, data.size(), false)) {
      case (?e) return #err(e);
      case null {};
    };
    // CD-7: checked after admitUpload's awaits, right before the bytes are kept.
    if (not isAdmin(msg.caller) and not takeOnChainBytes(data.size()))
      return #err(#InvalidInput("Photo storage is busy today. Please try again tomorrow."));
    #ok(meta(addPhoto(msg.caller, jobId, propertyId, phase, description, hash, data, data.size())))
  };

  /// Register a photo whose bytes go to off-chain storage. Runs every
  /// uploadPhoto check against `size`, creates the record with empty `data`,
  /// and returns it; the client then sends the bytes to the voice Worker,
  /// which stores them only if they are `size` bytes hashing to `hash`.
  public shared(msg) func beginUpload(
    jobId: Text,
    propertyId: Text,
    phase: ConstructionPhase,
    description: Text,
    hash: Text,
    size: Nat
  ) : async Result.Result<PhotoMeta, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (await* admitUpload(msg.caller, jobId, propertyId, description, hash, size, false)) {
      case (?e) return #err(e);
      case null {};
    };
    let photo = addPhoto(msg.caller, jobId, propertyId, phase, description, hash, "", size);
    offChainIds.add(photo.id, ());
    #ok(meta(photo))
  };

  /// #716: where a contractor's final lien waiver for `jobId` goes, or why
  /// it can't. The job canister says whether the caller signed that job
  /// (waiverUploadTarget) and which home it is on. Returns the home's id, the
  /// document job id and the vault description "[LienWaiver] <jobId>|<file>".
  private func waiverTarget(caller : Principal, jobId : Text, filename : Text) : async* Result.Result<(Text, Text, Text), Error> {
    if (Text.size(filename) == 0 or Text.size(filename) > 200)
      return #err(#InvalidInput("The file name must be 1 to 200 characters"));
    if (filename.contains(#char '|')) return #err(#InvalidInput("The file name can't contain |"));
    if (Text.size(jobId) == 0 or Text.size(jobId) > MAX_ID_CHARS) return #err(#NotFound);
    if (Text.size(jobCanisterId) == 0)
      return #err(#Unavailable("Waiver uploads are unavailable right now. Please try again later."));
    let jobActor = actor (jobCanisterId) : actor { waiverUploadTarget : shared query (Text, Principal) -> async ?Text };
    let target = try { await jobActor.waiverUploadTarget(jobId, caller) }
                 catch (_) { return #err(#Unavailable(Canisters.unavailable("job"))) };
    switch (target) {
      case null #err(#NotAuthorized);
      case (?propertyId) #ok((propertyId, docsJobId(propertyId), "[LienWaiver] " # jobId # "|" # filename));
    }
  };

  /// #716: beginUpload for the contractor who signed a job, filing its final
  /// lien waiver in the home's document vault (see waiverTarget). The record
  /// is owned by the contractor, so their upload to the Worker is accepted.
  /// Every other uploadPhoto check runs, with the home owner's plan for the
  /// document limit. The contractor then files the returned id on the job
  /// with job.addJobPaper.
  public shared(msg) func beginWaiverUpload(
    jobId: Text,
    filename: Text,
    hash: Text,
    size: Nat
  ) : async Result.Result<PhotoMeta, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let (propertyId, docs, description) = switch (await* waiverTarget(msg.caller, jobId, filename)) {
      case (#err(e)) return #err(e);
      case (#ok(t)) t;
    };
    switch (await* admitUpload(msg.caller, docs, propertyId, description, hash, size, true)) {
      case (?e) return #err(e);
      case null {};
    };
    let photo = addPhoto(msg.caller, docs, propertyId, #PostConstruction, description, hash, "", size);
    offChainIds.add(photo.id, ());
    #ok(meta(photo))
  };

  /// #716: the same with the bytes, stored on this canister, for files the
  /// Worker doesn't take or when off-chain storage is off. Follows the
  /// on-chain switch like uploadPhoto.
  public shared(msg) func uploadWaiver(
    jobId: Text,
    filename: Text,
    hash: Text,
    data: Blob
  ) : async Result.Result<PhotoMeta, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not onChainUploadsEnabled and not isAdmin(msg.caller))
      return #err(#InvalidInput("That file type can't be uploaded right now. Upload the signed waiver as a PDF or a photo."));
    let (propertyId, docs, description) = switch (await* waiverTarget(msg.caller, jobId, filename)) {
      case (#err(e)) return #err(e);
      case (#ok(t)) t;
    };
    switch (await* admitUpload(msg.caller, docs, propertyId, description, hash, data.size(), true)) {
      case (?e) return #err(e);
      case null {};
    };
    if (not isAdmin(msg.caller) and not takeOnChainBytes(data.size()))
      return #err(#InvalidInput("Photo storage is busy today. Please try again tomorrow."));
    #ok(meta(addPhoto(msg.caller, docs, propertyId, #PostConstruction, description, hash, data, data.size())))
  };

  public type PhotoAccess = {
    owner: Principal;
    hash: Text;
    size: Nat;
    offChain: Bool;   // bytes live in off-chain storage, not in `data`
    isPublic: Bool;   // FSBO listing photo: anyone may read it
    canRead: Bool;    // `reader` may read it
  };

  /// For the voice Worker (a registered photo relay): what it needs to accept
  /// an upload or serve a photo. Null when the photo doesn't exist, which
  /// tells the Worker to drop any stored bytes for it, and for other callers.
  /// A composite query so property access is checked live.
  public composite query(msg) func photoAccess(photoId: Text, reader: Principal) : async ?PhotoAccess {
    if (not Admin.contains(photoRelays, msg.caller) and not isAdmin(msg.caller)) return null;
    switch (photoStore.get(photoId)) {
      case null { null };
      case (?p) {
        let isPublic = isListingPhoto(p);
        let canRead = if (isPublic or reader == p.owner or isAdmin(reader)) { true }
          else if (isSealed(p) or reader.isAnonymous() or Text.size(propCanisterId) == 0) { false }
          else {
            let propActor = Canisters.property(propCanisterId);
            try { await propActor.isAuthorized(p.propertyId, reader, false) } catch (_) { false }
          };
        ?{ owner = p.owner; hash = p.hash; size = p.size; offChain = offChainIds.containsKey(p.id); isPublic; canRead }
      };
    }
  };

  /// #725: whether a photo may be shown through a house guide at all.
  /// Documents never are, and nothing is without the property canister.
  private func guideEligible(p : Photo) : Bool {
    not isDocumentJob(p.jobId, p.propertyId) and not isSealed(p) and Text.size(propCanisterId) > 0
  };

  /// #725: for the voice Worker (a photo relay): photoAccess for someone
  /// holding a house-guide link instead of a signed-in reader. Null for other
  /// callers and for photos that don't exist.
  public composite query(msg) func guidePhotoAccess(photoId: Text, token: Text) : async ?PhotoAccess {
    if (not Admin.contains(photoRelays, msg.caller) and not isAdmin(msg.caller)) return null;
    switch (photoStore.get(photoId)) {
      case null { null };
      case (?p) {
        // A composite query can't call a private async helper, so the
        // property check (guideSharesPhoto) is written out in both methods.
        let canRead = guideEligible(p) and (try {
          await Canisters.property(propCanisterId).guideSharesPhoto(token, p.propertyId, p.id)
        } catch (_) { false });
        ?{ owner = p.owner; hash = p.hash; size = p.size; offChain = offChainIds.containsKey(p.id); isPublic = false; canRead }
      };
    }
  };

  /// #725: a photo's bytes for anyone holding a live house-guide link that
  /// shows it. Empty when the bytes are stored off-chain (the voice Worker
  /// serves those at /photos/<id>?guide=<token>). #NotFound otherwise, the
  /// same answer for a missing photo and one the link doesn't show.
  public composite query func getGuidePhotoData(token: Text, photoId: Text) : async Result.Result<Blob, Error> {
    switch (photoStore.get(photoId)) {
      case null #err(#NotFound);
      case (?p) {
        if (not guideEligible(p)) return #err(#NotFound);
        let shows = try {
          await Canisters.property(propCanisterId).guideSharesPhoto(token, p.propertyId, p.id)
        } catch (_) { false };
        if (shows) #ok(p.data) else #err(#NotFound)
      };
    }
  };

  // ─── Close-out papers (M-2) and transfers (M-1), security audit 2026-11-10 ──

  /// What job.addJobPaper checks before filing a document on a job.
  public type PaperDocument = { propertyId : Text; docType : Text };

  /// M-2: the home and type of a vault document, for the job canister to
  /// check a close-out paper against (a final lien waiver must be a
  /// "[LienWaiver]" document in the job's own home's vault). Null for
  /// anything that isn't a vault document, for documents kept private after
  /// a transfer, and for callers other than the job canister and admins.
  public query(msg) func getPaperDocument(photoId: Text) : async ?PaperDocument {
    if (msg.caller.toText() != jobCanisterId and not isAdmin(msg.caller)) return null;
    switch (photoStore.get(photoId)) {
      case null null;
      case (?p) {
        if (isSealed(p)) return null;
        switch (docTypeOf(p)) {
          case null null;
          case (?t) ?{ propertyId = p.propertyId; docType = t };
        }
      };
    }
  };

  /// M-2: when a waiver or Notice of Commencement leaves the vault, the job
  /// canister takes it off the job it was filed on. Fire-and-forget: the
  /// delete stands whatever the job canister answers.
  private func paperGone(p : Photo) : async* () {
    if (jobCanisterId == "") return;
    switch (docTypeOf(p)) {
      case (?"LienWaiver" or ?"NOC") {
        let jobActor = actor (jobCanisterId) : actor {
          paperDocumentDeleted : shared (Text, Text) -> async { #ok : Nat; #err : Any };
        };
        try { ignore await jobActor.paperDocumentDeleted(p.id, p.propertyId) } catch _ {
          Debug.print("[photo] paperDocumentDeleted call failed");
        };
      };
      case _ {};
    }
  };

  /// M-1: the property canister reports that `propertyId` changed hands (a
  /// sale or a completed successor claim). The previous household's personal
  /// papers on it (closing, title, deed, insurance, HOA and other documents,
  /// insurance-claim and inventory photos) become private to whoever uploaded
  /// them; work records and job photos stay with the home. Returns how many
  /// files were sealed. The property canister and admins only.
  public shared(msg) func propertyTransferred(propertyId: Text) : async Result.Result<Nat, Error> {
    if (msg.caller.toText() != propCanisterId and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    var sealed = 0;
    for (p in Index.records(photosByProperty, propertyId, photoStore)) {
      if (isPersonal(p) and not isSealed(p)) {
        sealedIds.add(p.id, ());
        sealed += 1;
      };
    };
    #ok(sealed)
  };

  /// Register a principal (the voice Worker) that may call photoAccess.
  public shared(msg) func addPhotoRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (p.isAnonymous()) return #err(#InvalidInput("anonymous principal"));
    photoRelays := Admin.add(photoRelays, p);
    try { await auditLog("PhotoRelayAdded", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func removePhotoRelay(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    photoRelays := Admin.remove(photoRelays, p);
    try { await auditLog("PhotoRelayRemoved", ?p, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    #ok(())
  };

  /// Fetch the full photo record (including raw bytes).
  /// Caller must be the photo's owner or an admin.
  public shared(msg) func getPhoto(photoId: Text) : async Result.Result<Photo, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };  // L-7
    switch (photoStore.get(photoId)) {
      case null  { #err(#NotFound) };
      case (?p)  {
        // The uploader may always read their own file (M-1: a seller keeps
        // their papers after the home changes hands); a sealed file is
        // theirs alone.
        if (not isAdmin(msg.caller) and p.owner != msg.caller) {
          if (isSealed(p)) return #err(#NotAuthorized);
          switch (await* checkPropertyAuth(p.propertyId, p.owner, msg.caller, false)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
        };
        #ok(p)
      };
    }
  };

  /// Fetch only the raw bytes — avoids sending the full record for metadata-only callers.
  /// Caller must be the photo's owner or an admin.
  public shared(msg) func getPhotoData(photoId: Text) : async Result.Result<Blob, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };  // L-7
    switch (photoStore.get(photoId)) {
      case null  { #err(#NotFound) };
      case (?p)  {
        // The uploader may always read their own file (M-1: a seller keeps
        // their papers after the home changes hands); a sealed file is
        // theirs alone.
        if (not isAdmin(msg.caller) and p.owner != msg.caller) {
          if (isSealed(p)) return #err(#NotAuthorized);
          switch (await* checkPropertyAuth(p.propertyId, p.owner, msg.caller, false)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
        };
        #ok(p.data)
      };
    }
  };

  /// Reply budget for getPhotoDataBatch — under the 2 MiB reply limit with
  /// room for Candid framing.
  private transient let BATCH_REPLY_BYTES : Nat = 1_500_000;
  private transient let MAX_BATCH_IDS        : Nat = 200;
  private transient let MAX_BATCH_AUTH_CALLS : Nat = 10;

  /// Bytes for several photos in one call, in request order. Returns as many
  /// as fit in ~1.5 MB (always at least one); the caller asks again for the
  /// ids that were left out. Ids that don't exist or that the caller may not
  /// read are skipped. Listing photos are public, like getPublicListingPhotos.
  ///
  /// L-7: anonymous callers get nothing, at most MAX_BATCH_IDS ids are looked
  /// at, and at most MAX_BATCH_AUTH_CALLS distinct properties are checked
  /// cross-canister per call (later ones are skipped; ask again for them).
  public shared(msg) func getPhotoDataBatch(photoIds: [Text]) : async [(Text, Blob)] {
    if (msg.caller.isAnonymous()) return [];
    let admin = isAdmin(msg.caller);
    // One property-auth call per distinct property, not per photo.
    let allowed = Map.empty<Text, Bool>();
    var authCalls = 0;
    let out = List.empty<(Text, Blob)>();
    var bytes = 0;
    let ids = if (photoIds.size() > MAX_BATCH_IDS) photoIds.sliceToArray(0, MAX_BATCH_IDS) else photoIds;
    label fill for (id in ids.values()) {
      switch (photoStore.get(id)) {
        case null {};
        case (?p) {
          let ok = if (admin or isListingPhoto(p) or p.owner == msg.caller) { true }
            else if (isSealed(p)) { false } else {
            switch (allowed.get(p.propertyId)) {
              case (?known) { known };
              case null {
                if (authCalls >= MAX_BATCH_AUTH_CALLS) { false } else {
                  authCalls += 1;
                  let res = switch (await* checkPropertyAuth(p.propertyId, p.owner, msg.caller, false)) { case (#ok(_)) true; case (#err(_)) false };
                  allowed.add(p.propertyId, res);
                  res
                }
              };
            }
          };
          if (ok) {
            if (out.size() > 0 and bytes + p.data.size() > BATCH_REPLY_BYTES) break fill;
            out.add((p.id, p.data));
            bytes += p.data.size();
          };
        };
      };
    };
    out.toArray()
  };

  /// Bytes for FSBO listing photos (public, so anonymous buyers can load
  /// them). Same reply budget and ordering as getPhotoDataBatch; ids that
  /// aren't listing photos are skipped.
  public query func getListingPhotoDataBatch(photoIds: [Text]) : async [(Text, Blob)] {
    let out = List.empty<(Text, Blob)>();
    var bytes = 0;
    label fill for (id in photoIds.values()) {
      switch (photoStore.get(id)) {
        case (?p) {
          if (isListingPhoto(p)) {
            if (out.size() > 0 and bytes + p.data.size() > BATCH_REPLY_BYTES) break fill;
            out.add((p.id, p.data));
            bytes += p.data.size();
          };
        };
        case null {};
      };
    };
    out.toArray()
  };

  /// All photos for a FSBO listing — publicly readable without authentication.
  /// Photos are stored with synthetic jobId "LISTING_<propertyId>" and phase #Listing.
  /// No ownership check so prospective buyers can view listing photos anonymously.
  public query func getPublicListingPhotos(propertyId: Text) : async [PhotoMeta] {
    Index.records(photosByJob, listingJobId(propertyId), photoStore).filter(isListingPhoto).map(meta).toArray()
  };

  /// The photos in `candidates` the caller may list: their own uploads, all
  /// of them for admins, and the photos on properties the caller owns or
  /// manages now, so a buyer sees the seller's photos once a transfer is
  /// claimed. One property check per distinct property, at most
  /// MAX_BATCH_AUTH_CALLS per call (photos past that are left out).
  private func visiblePhotos(candidates: [Photo], caller: Principal) : async* [PhotoMeta] {
    let admin = isAdmin(caller);
    let allowed = Map.empty<Text, Bool>();
    var authCalls = 0;
    let out = List.empty<PhotoMeta>();
    for (p in candidates.values()) {
      let ok = if (admin or p.owner == caller) { true }
        else if (isSealed(p) or caller.isAnonymous() or Text.size(propCanisterId) == 0) { false }
        else {
          switch (allowed.get(p.propertyId)) {
            case (?known) { known };
            case null {
              if (authCalls >= MAX_BATCH_AUTH_CALLS) { false } else {
                authCalls += 1;
                let propActor = Canisters.property(propCanisterId);
                let res = try { await propActor.isAuthorized(p.propertyId, caller, false) } catch (_) { false };
                allowed.add(p.propertyId, res);
                res
              }
            };
          }
        };
      if (ok) out.add(meta(p));
    };
    out.toArray()
  };

  private func jobPhotos(jobId: Text, caller: Principal, keep: Photo -> Bool) : async* [PhotoMeta] {
    await* visiblePhotos(Index.records(photosByJob, jobId, photoStore).filter(keep).toArray(), caller)
  };

  /// All photos linked to a room (stored with synthetic jobId "ROOM_<roomId>").
  public shared(msg) func getPhotosByRoom(roomId: Text) : async [PhotoMeta] {
    await* jobPhotos("ROOM_" # roomId, msg.caller, func(_) { true })
  };

  /// All photos for a job.
  public shared(msg) func getPhotosByJob(jobId: Text) : async [PhotoMeta] {
    await* jobPhotos(jobId, msg.caller, func(_) { true })
  };

  /// All photos for a property.
  public shared(msg) func getPhotosByProperty(propertyId: Text) : async [PhotoMeta] {
    await* visiblePhotos(Index.records(photosByProperty, propertyId, photoStore).toArray(), msg.caller)
  };

  /// Photos for a specific job+phase.
  public shared(msg) func getPhotosByPhase(jobId: Text, phase: ConstructionPhase) : async [PhotoMeta] {
    await* jobPhotos(jobId, msg.caller, func(p) { p.phase == phase })
  };

  /// Approve a photo. Caller must be the owner or an admin.
  /// Adds caller to approvals; sets verified = true on first approval.
  /// Idempotent: calling again after already approving is a no-op.
  public shared(msg) func verifyPhoto(photoId: Text) : async Result.Result<PhotoMeta, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (photoStore.get(photoId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (sealedFrom(existing, msg.caller)) return #err(#NotAuthorized);
        if (not isAdmin(msg.caller)) {
          switch (await* checkPropertyAuth(existing.propertyId, existing.owner, msg.caller, true)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
        };

        let alreadyApproved = Option.isSome(
          existing.approvals.find(func(a) { a == msg.caller })
        );
        if (alreadyApproved) return #ok(meta(existing));

        let updated: Photo = {
          existing with
          verified    = true;
          approvals   = existing.approvals.concat([msg.caller]);
        };
        putPhoto(updated);
        try { await auditLog("PhotoApproved", ?existing.owner, "photoId=" # photoId # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
        #ok(meta(updated))
      };
    }
  };

  /// Delete a photo. Owner or admin only. Also removes the hash index entry.
  public shared(msg) func deletePhoto(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (photoStore.get(photoId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        // M-1: a sealed file is its uploader's alone (they may still delete
        // it, though they no longer have a role on the home).
        if (isSealed(existing)) {
          if (existing.owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        } else if (not isAdmin(msg.caller)) {
          switch (await* checkPropertyAuth(existing.propertyId, existing.owner, msg.caller, true)) { case (#err(e)) return #err(e); case (#ok(_)) {} };
        };
        // Re-read after the await: a concurrent delete may have removed it.
        if (photoStore.get(photoId) == null) return #err(#NotFound);
        deletePhotoRecord(existing);
        dropHash(existing);
        await* paperGone(existing);
        #ok(())
      };
    }
  };

  /// Ids of the caller's photos whose bytes live off-chain. Account deletion
  /// reads them before deleteMyData, then asks the Worker to drop the bytes
  /// (it only does so once the record is gone).
  public query(msg) func getMyOffChainPhotoIds() : async [Text] {
    if (msg.caller.isAnonymous()) return [];
    photoStore.values()
      .filter(func(p : Photo) : Bool { p.owner == msg.caller and offChainIds.containsKey(p.id) })
      .map(func(p : Photo) : Text { p.id })
      .toArray()
  };

  // ─── Moving on-chain photos off-chain (part 3) ──────────────────────────────

  /// A photo whose bytes are still on this canister, for the relay to copy.
  public type MigrationItem = { id : Text; hash : Text; data : Blob };
  /// `next`: pass it back as `after` for the next page; null once the scan
  /// reached the last photo.
  public type MigrationPage = { items : [MigrationItem]; next : ?Text };
  public type MigrationStatus = {
    enabled : Bool;
    onChainPhotos : Nat;   // photos whose bytes are still here
    onChainBytes : Nat;
    offChainPhotos : Nat;  // photos whose bytes live off-chain
  };

  private transient let MIGRATION_OFF = "Photo migration is off. An admin turns it on with setOffChainMigrationEnabled.";
  private transient let MIGRATION_SCAN_LIMIT : Nat = 20_000;
  private transient let MIGRATION_PAGE_ITEMS : Nat = 50;
  private transient let MAX_CONFIRM_ITEMS    : Nat = 100;

  private func isRelayOrAdmin(p : Principal) : Bool {
    Admin.contains(photoRelays, p) or isAdmin(p)
  };

  private func isOnChain(id : Text, p : Photo) : Bool {
    p.data.size() > 0 and not offChainIds.containsKey(id)
  };

  /// A SHA-256 as 64 lowercase hex characters.
  private func isSha256Hex(h : Text) : Bool {
    Text.size(h) == 64 and h.chars().all(func c = (c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'))
  };

  /// Turn the migration on or off. Take a canister snapshot first. Admin only.
  public shared(msg) func setOffChainMigrationEnabled(enabled : Bool) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    offChainMigrationEnabled := enabled;
    try { await auditLog("PhotoMigrationSet", null, "enabled=" # debug_show enabled # " caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    #ok(())
  };

  /// How far the migration has got. Admins and the photo relay only.
  public query(msg) func getOffChainMigrationStatus() : async Result.Result<MigrationStatus, Error> {
    if (not isRelayOrAdmin(msg.caller)) return #err(#NotAuthorized);
    var photos = 0;
    var bytes = 0;
    for ((id, p) in photoStore.entries()) {
      if (isOnChain(id, p)) { photos += 1; bytes += p.data.size() };
    };
    #ok({ enabled = offChainMigrationEnabled; onChainPhotos = photos; onChainBytes = bytes; offChainPhotos = offChainIds.size() })
  };

  /// The next on-chain photos after `after`, in id order: at most
  /// MIGRATION_PAGE_ITEMS photos and ~1.5 MB of bytes, looking at no more
  /// than MIGRATION_SCAN_LIMIT records. An update call, so the relay copies
  /// bytes the subnet agreed on rather than one replica's answer. Photo
  /// relay and admins only, while the migration is on.
  public shared(msg) func onChainPhotoPage(after : ?Text) : async Result.Result<MigrationPage, Error> {
    if (not isRelayOrAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    if (not offChainMigrationEnabled) return #err(#InvalidInput(MIGRATION_OFF));
    let items = List.empty<MigrationItem>();
    var bytes = 0;
    var scanned = 0;
    var last : ?Text = null;
    let entries = switch after { case null photoStore.entries(); case (?k) photoStore.entriesFrom(k) };
    for ((id, p) in entries) {
      if (after != ?id) {
        if (scanned >= MIGRATION_SCAN_LIMIT or items.size() >= MIGRATION_PAGE_ITEMS) {
          return #ok({ items = items.toArray(); next = last });
        };
        if (isOnChain(id, p)) {
          if (items.size() > 0 and bytes + p.data.size() > BATCH_REPLY_BYTES) {
            return #ok({ items = items.toArray(); next = last });
          };
          items.add({ id; hash = p.hash; data = p.data });
          bytes += p.data.size();
        };
        scanned += 1;
        last := ?id;
      };
    };
    #ok({ items = items.toArray(); next = null })
  };

  /// The relay copied these photos off-chain: (id, SHA-256 of the bytes it
  /// wrote and read back). Each one still here with bytes on-chain loses
  /// them and becomes an off-chain photo; its record, size and quota use stay.
  /// When the recorded hash was wrong (uploadPhoto never checked it), the
  /// photo takes the real one and duplicate detection follows. Anything
  /// else (already moved, deleted, unknown, a malformed hash) is skipped, so
  /// a retry is harmless. Returns how many moved. Photo relay and admins
  /// only, while the migration is on.
  public shared(msg) func confirmOffChain(moved : [(Text, Text)]) : async Result.Result<Nat, Error> {
    if (not isRelayOrAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    if (not offChainMigrationEnabled) return #err(#InvalidInput(MIGRATION_OFF));
    if (moved.size() > MAX_CONFIRM_ITEMS)
      return #err(#InvalidInput("At most " # MAX_CONFIRM_ITEMS.toText() # " photos per call"));
    var n = 0;
    for ((id, hash) in moved.values()) {
      switch (photoStore.get(id)) {
        case (?p) {
          if (isOnChain(id, p) and isSha256Hex(hash)) {
            if (hash != p.hash) {
              dropHash(p);
              if (dupOf(p.owner, hash) == null) hashIndex.add(hashKey(p.owner, hash), id);
            };
            putPhoto({ p with hash; data = "" : Blob });
            offChainIds.add(id, ());
            n += 1;
          };
        };
        case null {};
      };
    };
    #ok(n)
  };

  // ─── Orphan sweep (part 4) ──────────────────────────────────────────────────

  /// An off-chain photo and when its record was made.
  public type OffChainPage = { items : [(Text, Time.Time)]; next : ?Text };

  private transient let MAX_KNOWN_IDS          : Nat = 1_000;
  private transient let OFF_CHAIN_PAGE_ITEMS   : Nat = 500;
  private transient let MAX_DROP_ITEMS         : Nat = 100;
  /// An off-chain record whose bytes haven't arrived after this long never will.
  private transient let UNUPLOADED_MIN_AGE_NS  : Int = 7 * 86_400_000_000_000;

  /// Which of `ids` still have a photo record, so the relay can tell stored
  /// bytes that lost their record. At most MAX_KNOWN_IDS ids. Photo relay
  /// and admins only.
  public query(msg) func knownPhotoIds(ids : [Text]) : async Result.Result<[Text], Error> {
    if (not isRelayOrAdmin(msg.caller)) return #err(#NotAuthorized);
    if (ids.size() > MAX_KNOWN_IDS)
      return #err(#InvalidInput("At most " # MAX_KNOWN_IDS.toText() # " ids per call"));
    #ok(ids.filter(func id = photoStore.containsKey(id)))
  };

  /// Off-chain photos after `after`, in id order, with when each record was
  /// made, so the relay can find records whose bytes never arrived. Photo
  /// relay and admins only.
  public query(msg) func offChainPhotoPage(after : ?Text) : async Result.Result<OffChainPage, Error> {
    if (not isRelayOrAdmin(msg.caller)) return #err(#NotAuthorized);
    let items = List.empty<(Text, Time.Time)>();
    let entries = switch after { case null offChainIds.entries(); case (?k) offChainIds.entriesFrom(k) };
    for ((id, _) in entries) {
      if (after != ?id) {
        if (items.size() >= OFF_CHAIN_PAGE_ITEMS) {
          return #ok({ items = items.toArray(); next = ?(items.at(items.size() - 1 : Nat)).0 });
        };
        switch (photoStore.get(id)) {
          case (?p) items.add((id, p.createdAt));
          case null {};
        };
      };
    };
    #ok({ items = items.toArray(); next = null })
  };

  /// The relay found no stored bytes for these off-chain photos. Each one
  /// that is still off-chain, has no bytes here and is over 7 days old is
  /// deleted like deletePhoto would (quota, duplicate index, close-out
  /// papers); anything else is skipped, so a fresh upload still in flight is
  /// never touched. Returns how many were dropped. Photo relay and admins only.
  public shared(msg) func dropUnuploadedPhotos(ids : [Text]) : async Result.Result<Nat, Error> {
    if (not isRelayOrAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#Paused);
    if (ids.size() > MAX_DROP_ITEMS)
      return #err(#InvalidInput("At most " # MAX_DROP_ITEMS.toText() # " photos per call"));
    let cutoff = Time.now() - UNUPLOADED_MIN_AGE_NS;
    let gone = List.empty<Photo>();
    for (id in ids.values()) {
      switch (photoStore.get(id)) {
        case (?p) {
          if (offChainIds.containsKey(id) and p.data.size() == 0 and p.createdAt < cutoff) {
            deletePhotoRecord(p);
            dropHash(p);
            gone.add(p);
          };
        };
        case null {};
      };
    };
    // M-2: close-out papers that pointed at these come off their jobs.
    for (p in gone.values()) await* paperGone(p);
    #ok(gone.size())
  };

  /// Account deletion: removes everything this canister holds for the caller.
  /// Deletes every photo the caller uploaded (owner == caller) through
  /// deletePhotoRecord, so the job/property indexes and the per-owner usage
  /// quota stay right, and drops their dedup hash entries. Approvals live on
  /// the photo record and go with it. Returns how many photos were removed.
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);

    // CD-6: usageByOwner counts every photo an owner has, so a caller with
    // none is answered without scanning every photo record.
    if (usageOf(msg.caller).0 == 0) return #ok(0);
    let mine = photoStore.values().filter(func(p) = p.owner == msg.caller).toArray();
    for (p in mine.values()) {
      deletePhotoRecord(p);
      dropHash(p);
    };
    usageByOwner.remove(msg.caller.toText());
    // M-2: close-out papers that pointed at these documents come off their jobs.
    for (p in mine.values()) await* paperGone(p);
    #ok(mine.size())
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────


  /// CD-7: turn on-chain uploads (uploadPhoto) on or off. Off once off-chain
  /// storage is live, so new photo bytes stop filling this canister's heap.
  /// Admins can still upload on-chain. Admin only.
  public shared(msg) func setOnChainUploadsEnabled(enabled : Bool) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    onChainUploadsEnabled := enabled;
    #ok(())
  };

  public query func getOnChainUploadsEnabled() : async Bool { onChainUploadsEnabled };

  /// Wire the photo canister to the payment canister for live tier enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    payCanisterId := id.toText();
    #ok(())
  };

  /// Wire the photo canister to the property canister for manager tier bypass.
  /// When set, uploadPhoto() uses the property owner's tier when the caller
  /// is a delegated manager.  Must be called once after both canisters are deployed.
  public shared(msg) func setPropertyCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id.toText();
    #ok(())
  };

  /// #716: wire the job canister (vouches for contractor waiver uploads).
  public shared(msg) func setJobCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id.toText();
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once an admin exists, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminListEntries.size() > 0, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  /// Add an admin. When no admins exist yet (bootstrap), requires the pre-shared nonce.
  /// Subsequent calls require an existing admin.
  public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminListEntries.size() > 0, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    adminListEntries := Admin.add(adminListEntries, newAdmin);
    try { await auditLog("AdminAdded", ?newAdmin, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Admin.remove(adminListEntries, target);
    #ok(())
  };

  public shared(msg) func setAuditCanisterId(id : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { await auditLog("AuditCanisterSet", ?id, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    auditCanisterId := ?id;
    #ok(())
  };

  private func auditLog(action : Text, subject : ?Principal, detail : Text) : async () {
    await* Canisters.auditLog(auditCanisterId, "photo", action, subject, detail)
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
    try { await auditLog("CanisterPaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    try { await auditLog("CanisterUnpaused", null, "caller=" # msg.caller.toText()) } catch _ { Debug.print("[photo] fire-and-forget call failed") };
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var verified   = 0;
    var totalBytes = 0;
    for (p in photoStore.values()) {
      if (p.verified) { verified += 1 };
      totalBytes += p.size;
    };
    {
      totalPhotos       = photoStore.size();
      verifiedPhotos    = verified;
      totalStorageBytes = totalBytes;
      isPaused;
    }
  };

  // ─── Sibling canister IDs (M-5) ─────────────────────────────────────────────

  /// Re-read sibling IDs from icp-cli's PUBLIC_CANISTER_ID:<name> variables;
  /// see Canisters.envId. Runs on install and on every upgrade.
  func syncCanisterIds<system>() {
    auditCanisterId := Canisters.envPrincipal<system>("audit", auditCanisterId);
    payCanisterId := Canisters.envId<system>("payment", payCanisterId);
    propCanisterId := Canisters.envId<system>("property", propCanisterId);
    jobCanisterId := Canisters.envId<system>("job", jobCanisterId);
  };
  syncCanisterIds<system>();
}
