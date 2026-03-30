/**
 * HomeFax Photo Canister
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
  private var photoEntries: [(Text, Photo)] = [];
  private var hashIndexEntries: [(Text, Text)] = []; // sha256 -> photoId
  /// Admin-managed tier grants keyed by principal text.
  /// Default (missing) → #Free.  Updated by setTier() when a subscription event fires.
  private var tierGrantEntries: [(Text, SubscriptionTier)] = [];
  /// (count, windowStartNs) for per-minute upload rate limiting, keyed by principal text.
  private var photoRateLimitEntries: [(Text, (Nat, Int))] = [];

  // ─── Transient State (rebuilt from stable after each upgrade) ────────────────

  private transient var photos = Map.fromIter<Text, Photo>(
    photoEntries.vals(), Text.compare
  );

  // Separate index for O(1) duplicate detection without scanning all photos
  private transient var hashIndex = Map.fromIter<Text, Text>(
    hashIndexEntries.vals(), Text.compare
  );

  private transient var tierGrants = Map.fromIter<Text, SubscriptionTier>(
    tierGrantEntries.vals(), Text.compare
  );

  /// Per-minute upload rate limits keyed by principal text.
  private transient var photoRateLimits = Map.fromIter<Text, (Nat, Int)>(
    photoRateLimitEntries.vals(), Text.compare
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  system func preupgrade() {
    photoEntries          := Iter.toArray(Map.entries(photos));
    hashIndexEntries      := Iter.toArray(Map.entries(hashIndex));
    tierGrantEntries      := Iter.toArray(Map.entries(tierGrants));
    photoRateLimitEntries := Iter.toArray(Map.entries(photoRateLimits));
  };

  system func postupgrade() {
    photoEntries          := [];
    hashIndexEntries      := [];
    tierGrantEntries      := [];
    photoRateLimitEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (not isPaused) return #ok(());
    switch (pauseExpiryNs) {
      case (?expiry) { if (Time.now() >= expiry) return #ok(()) };
      case null {};
    };
    #err(#InvalidInput("Canister is paused"))
  };

  private func nextPhotoId() : Text {
    photoCounter += 1;
    "PHOTO_" # Nat.toText(photoCounter)
  };

  private func quotaFor(tier: SubscriptionTier) : PhotoQuota {
    switch (tier) {
      case (#Free)          { { tier; maxPerJob = 5;   maxPerProperty = 25  } };
      case (#Pro)           { { tier; maxPerJob = 50;  maxPerProperty = 500 } };
      case (#Premium)       { { tier; maxPerJob = 100; maxPerProperty = 0   } };
      case (#ContractorPro) { { tier; maxPerJob = 200; maxPerProperty = 0   } };
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

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

    // Tier quota checks — tier is authoritative from canister state, not caller input
    let quota = quotaFor(tierFor(msg.caller));

    let callerTier = quota.tier;
    let upgradeHint = switch (callerTier) {
      case (#Free) {
        " Upgrade to Pro ($9.99/mo) for 50 photos/job, or Premium ($24.99/mo) for 100."
      };
      case (#Pro) {
        " Upgrade to Premium ($24.99/mo) for 100 photos/job, or ContractorPro ($49.99/mo) for 200."
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

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
          approvals   = Array.append(existing.approvals, [msg.caller]);
          createdAt   = existing.createdAt;
        };
        Map.add(photos, Text.compare, photoId, updated);
        #ok(updated)
      };
    }
  };

  /// Delete a photo. Owner or admin only. Also removes the hash index entry.
  public shared(msg) func deletePhoto(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

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

  /// Add an admin. First call is open (bootstrap); subsequent calls require an existing admin.
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    adminListEntries := Array.append(adminListEntries, [newAdmin]);
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
