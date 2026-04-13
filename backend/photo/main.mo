/**
 * HomeGentic Photo Canister
 * Stores construction/maintenance phase photos with tier-based quotas,
 * SHA-256 duplicate prevention, and multi-approval verification.
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

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
  };

  public type SubscriptionTier = {
    #Free;
    #Pro;
    #Premium;
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
    data: [Nat8];         // raw image bytes
    size: Nat;            // byte count (mirrors data.size())
    verified: Bool;
    approvals: [Principal];
    createdAt: Time.Time;
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #QuotaExceeded: Text;
    #Duplicate: Text;     // payload is the existing photo ID
    #InvalidInput: Text;
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
  /// Payment canister ID — set post-deploy via setPaymentCanisterId().
  /// When set, uploadPhoto() cross-calls getTierForPrincipal() instead of
  /// reading the local tierGrants map.
  private var payCanisterId: Text = "";
  /// Migration buffers — cleared after first upgrade with this code.
  private var photoEntries:          [(Text, Photo)]              = [];
  private var hashIndexEntries:      [(Text, Text)]               = [];
  private var tierGrantEntries:      [(Text, SubscriptionTier)]   = [];
  private var photoRateLimitEntries: [(Text, (Nat, Int))]         = [];

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var photos      = Map.empty<Text, Photo>();
  /// sha256 → photoId — O(1) duplicate detection.
  private var hashIndex   = Map.empty<Text, Text>();
  private var tierGrants  = Map.empty<Text, SubscriptionTier>();
  private var photoRateLimits = Map.empty<Text, (Nat, Int)>();

  // ─── Upgrade Hook ────────────────────────────────────────────────────────────

  system func postupgrade() {
    for ((k, v) in photoEntries.vals())          { Map.add(photos,          Text.compare, k, v) };
    photoEntries := [];
    for ((k, v) in hashIndexEntries.vals())      { Map.add(hashIndex,       Text.compare, k, v) };
    hashIndexEntries := [];
    for ((k, v) in tierGrantEntries.vals())      { Map.add(tierGrants,      Text.compare, k, v) };
    tierGrantEntries := [];
    for ((k, v) in photoRateLimitEntries.vals()) { Map.add(photoRateLimits, Text.compare, k, v) };
    photoRateLimitEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Update-call rate limit (cycle-drain protection) ────────────────────────

  private transient var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

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

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
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

  private func nextPhotoId() : Text {
    photoCounter += 1;
    "PHOTO_" # Nat.toText(photoCounter)
  };

  private func quotaFor(tier: SubscriptionTier) : PhotoQuota {
    switch (tier) {
      case (#Free)          { { tier; maxPerJob = 2;   maxPerProperty = 10  } };
      case (#Pro)           { { tier; maxPerJob = 10;  maxPerProperty = 100 } };
      case (#Premium)       { { tier; maxPerJob = 30;  maxPerProperty = 0   } };
      case (#ContractorPro) { { tier; maxPerJob = 50;  maxPerProperty = 0   } };
    }
  };

  private func countByJob(jobId: Text) : Nat {
    var n = 0;
    for (p in Map.values(photos)) { if (p.jobId == jobId) { n += 1 } };
    n
  };

  private func countByProperty(propertyId: Text) : Nat {
    var n = 0;
    for (p in Map.values(photos)) { if (p.propertyId == propertyId) { n += 1 } };
    n
  };

  /// Returns the authoritative tier for a principal.
  /// Falls back to #Free for principals that have no admin-granted tier.
  /// Callers cannot influence this — it is set only via setTier() (admin-only).
  private func tierFor(p: Principal) : SubscriptionTier {
    switch (Map.get(tierGrants, Text.compare, Principal.toText(p))) {
      case (?t) { t };
      case null { #Free };
    }
  };

  private let oneMinuteNs      : Int = 60 * 1_000_000_000;
  private let perMinutePhotoLimit : Nat = 10;

  /// Returns true and bumps the counter if the uploader is under the 10/min limit.
  /// Resets the window when 60 s have elapsed.
  private func tryConsumePhotoSlot(uploader: Principal) : Bool {
    let key = Principal.toText(uploader);
    let now = Time.now();
    switch (Map.get(photoRateLimits, Text.compare, key)) {
      case null {
        Map.add(photoRateLimits, Text.compare, key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= oneMinuteNs) {
          Map.add(photoRateLimits, Text.compare, key, (1, now));
          true
        } else if (count >= perMinutePhotoLimit) {
          false
        } else {
          Map.add(photoRateLimits, Text.compare, key, (count + 1, windowStart));
          true
        }
      };
    }
  };

  // ─── Core Functions ───────────────────────────────────────────────────────────

  /// Upload a photo. Enforces duplicate (hash) and tier quota checks.
  /// Tier is looked up from the admin-managed grant table — callers cannot
  /// supply or spoof their own tier.
  public shared(msg) func uploadPhoto(
    jobId: Text,
    propertyId: Text,
    phase: ConstructionPhase,
    description: Text,
    hash: Text,
    data: [Nat8]
  ) : async Result.Result<Photo, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(jobId) == 0)      return #err(#InvalidInput("jobId cannot be empty"));
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(hash) == 0)       return #err(#InvalidInput("hash cannot be empty"));
    if (data.size() == 0)           return #err(#InvalidInput("data cannot be empty"));

    // Per-minute rate limit: 10 uploads/min regardless of tier
    if (not tryConsumePhotoSlot(msg.caller)) {
      return #err(#InvalidInput(
        "Upload rate limit reached (10/minute). Please wait before uploading more photos."
      ));
    };

    // Duplicate check — O(1) via hash index
    switch (Map.get(hashIndex, Text.compare, hash)) {
      case (?existingId) { return #err(#Duplicate(existingId)) };
      case null          {};
    };

    // Tier quota checks — when payment canister is wired, tier comes from
    // getTierForPrincipal(); otherwise falls back to the local admin-grant map.
    let callerTierRaw : SubscriptionTier = if (payCanisterId != "") {
      let payActor = actor(payCanisterId) : actor {
        getTierForPrincipal : (Principal) -> async { #Free; #Pro; #Premium; #ContractorPro };
      };
      await payActor.getTierForPrincipal(msg.caller)
    } else {
      tierFor(msg.caller)
    };
    let quota = quotaFor(callerTierRaw);

    let callerTier = quota.tier;
    let upgradeHint = switch (callerTier) {
      case (#Free) {
        " Upgrade to Pro ($10/mo) for 10 photos/job, or Premium ($20/mo) for unlimited."
      };
      case (#Pro) {
        " Upgrade to Premium ($20/mo) for 30 photos/job, or ContractorPro ($30/mo) for 50."
      };
      case _ { "" };
    };

    if (quota.maxPerJob > 0 and countByJob(jobId) >= quota.maxPerJob) {
      return #err(#QuotaExceeded(
        "Job photo limit (" # Nat.toText(quota.maxPerJob) # ") reached for your plan." # upgradeHint
      ));
    };

    if (quota.maxPerProperty > 0 and countByProperty(propertyId) >= quota.maxPerProperty) {
      return #err(#QuotaExceeded(
        "Property photo limit (" # Nat.toText(quota.maxPerProperty) # ") reached for your plan." # upgradeHint
      ));
    };

    let id = nextPhotoId();
    let photo: Photo = {
      id;
      jobId;
      propertyId;
      owner       = msg.caller;
      phase;
      description;
      hash;
      data;
      size        = data.size();
      verified    = false;
      approvals   = [];
      createdAt   = Time.now();
    };

    Map.add(photos, Text.compare, id, photo);
    Map.add(hashIndex, Text.compare, hash, id);
    #ok(photo)
  };

  /// Fetch the full photo record (including raw bytes).
  /// Caller must be the photo's owner or an admin.
  public shared(msg) func getPhoto(photoId: Text) : async Result.Result<Photo, Error> {
    switch (Map.get(photos, Text.compare, photoId)) {
      case null  { #err(#NotFound) };
      case (?p)  {
        if (p.owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
        #ok(p)
      };
    }
  };

  /// Fetch only the raw bytes — avoids sending the full record for metadata-only callers.
  /// Caller must be the photo's owner or an admin.
  public shared(msg) func getPhotoData(photoId: Text) : async Result.Result<[Nat8], Error> {
    switch (Map.get(photos, Text.compare, photoId)) {
      case null  { #err(#NotFound) };
      case (?p)  {
        if (p.owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
        #ok(p.data)
      };
    }
  };

  /// All photos linked to a room (stored with synthetic jobId "ROOM_<roomId>").
  /// Caller must be the photo owner or an admin.
  public shared(msg) func getPhotosByRoom(roomId: Text) : async [Photo] {
    let syntheticJobId = "ROOM_" # roomId;
    let caller = msg.caller;
    let admin  = isAdmin(caller);
    Iter.toArray(Iter.filter(Map.values(photos), func(p: Photo) : Bool {
      p.jobId == syntheticJobId and (admin or p.owner == caller)
    }))
  };

  /// All photos for a job the caller owns. Admins see all photos for the job.
  public shared(msg) func getPhotosByJob(jobId: Text) : async [Photo] {
    let caller = msg.caller;
    let admin  = isAdmin(caller);
    Iter.toArray(Iter.filter(Map.values(photos), func(p: Photo) : Bool {
      p.jobId == jobId and (admin or p.owner == caller)
    }))
  };

  /// All photos for a property the caller owns. Admins see all photos for the property.
  public shared(msg) func getPhotosByProperty(propertyId: Text) : async [Photo] {
    let caller = msg.caller;
    let admin  = isAdmin(caller);
    Iter.toArray(Iter.filter(Map.values(photos), func(p: Photo) : Bool {
      p.propertyId == propertyId and (admin or p.owner == caller)
    }))
  };

  /// Photos for a specific job+phase the caller owns. Admins see all.
  public shared(msg) func getPhotosByPhase(jobId: Text, phase: ConstructionPhase) : async [Photo] {
    let caller = msg.caller;
    let admin  = isAdmin(caller);
    Iter.toArray(Iter.filter(Map.values(photos), func(p: Photo) : Bool {
      p.jobId == jobId and p.phase == phase and (admin or p.owner == caller)
    }))
  };

  /// Approve a photo. Caller must be the owner or an admin.
  /// Adds caller to approvals; sets verified = true on first approval.
  /// Idempotent: calling again after already approving is a no-op.
  public shared(msg) func verifyPhoto(photoId: Text) : async Result.Result<Photo, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(photos, Text.compare, photoId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);

        let alreadyApproved = Option.isSome(
          Array.find<Principal>(existing.approvals, func(a) { a == msg.caller })
        );
        if (alreadyApproved) return #ok(existing);

        let updated: Photo = {
          id          = existing.id;
          jobId       = existing.jobId;
          propertyId  = existing.propertyId;
          owner       = existing.owner;
          phase       = existing.phase;
          description = existing.description;
          hash        = existing.hash;
          data        = existing.data;
          size        = existing.size;
          verified    = true;
          approvals   = Array.concat(existing.approvals, [msg.caller]);
          createdAt   = existing.createdAt;
        };
        Map.add(photos, Text.compare, photoId, updated);
        #ok(updated)
      };
    }
  };

  /// Delete a photo. Owner or admin only. Also removes the hash index entry.
  public shared(msg) func deletePhoto(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(photos, Text.compare, photoId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
        Map.remove(photos, Text.compare, photoId);
        Map.remove(hashIndex, Text.compare, existing.hash);
        #ok(())
      };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Set the subscription tier for a principal.
  /// Called by an admin (or a future subscription canister) when a user upgrades or downgrades.
  /// This is the only way to change quota limits — callers cannot pass their own tier.
  public shared(msg) func setTier(user: Principal, tier: SubscriptionTier) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    Map.add(tierGrants, Text.compare, Principal.toText(user), tier);
    #ok(())
  };

  /// Wire the photo canister to the payment canister for live tier enforcement.
  /// Must be called once after both canisters are deployed.
  public shared(msg) func setPaymentCanisterId(id: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    payCanisterId := Principal.toText(id);
    #ok(())
  };

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// Add an admin. First call is open (bootstrap); subsequent calls require an existing admin.
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
    var verified   = 0;
    var totalBytes = 0;
    for (p in Map.values(photos)) {
      if (p.verified) { verified += 1 };
      totalBytes += p.size;
    };
    {
      totalPhotos       = Map.size(photos);
      verifiedPhotos    = verified;
      totalStorageBytes = totalBytes;
      isPaused;
    }
  };
}
