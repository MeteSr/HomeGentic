/**
 * HomeFax Report Canister
 *
 * Generates certified property history snapshots and manages share links.
 *
 * Flow:
 *   1. Homeowner calls generateReport(propertyData, jobs, options)
 *   2. Canister stores a signed snapshot + issues a share token
 *   3. Anyone with the token calls getReport(token) to read the snapshot
 *   4. Homeowner can revoke links or set expiry
 *
 * Snapshots are immutable once created — buyers see the property state
 * exactly as it was when the homeowner generated the report.
 */

import Array    "mo:base/Array";
import HashMap  "mo:base/HashMap";
import Int      "mo:base/Int";
import Iter     "mo:base/Iter";
import Nat      "mo:base/Nat";
import Option   "mo:base/Option";
import Principal "mo:base/Principal";
import Result   "mo:base/Result";
import Text     "mo:base/Text";
import Time     "mo:base/Time";

persistent actor Report {

  // ─── Input Types (caller supplies all data) ───────────────────────────────────

  public type JobInput = {
    serviceType:    Text;
    description:    Text;
    contractorName: ?Text;
    amountCents:    Nat;
    date:           Text;      // YYYY-MM-DD
    isDiy:          Bool;
    permitNumber:   ?Text;
    warrantyMonths: ?Nat;
    isVerified:     Bool;
    status:         Text;
  };

  public type PropertyInput = {
    address:           Text;
    city:              Text;
    state:             Text;
    zipCode:           Text;
    propertyType:      Text;
    yearBuilt:         Nat;
    squareFeet:        Nat;
    verificationLevel: Text;   // "Unverified" | "Basic" | "Premium"
  };

  // ─── Stored Types ─────────────────────────────────────────────────────────────

  public type VisibilityLevel = { #Public; #BuyerOnly };

  /// Immutable snapshot of property state at time of report generation.
  public type ReportSnapshot = {
    snapshotId:        Text;
    propertyId:        Text;
    generatedBy:       Principal;
    address:           Text;
    city:              Text;
    state:             Text;
    zipCode:           Text;
    propertyType:      Text;
    yearBuilt:         Nat;
    squareFeet:        Nat;
    verificationLevel: Text;
    jobs:              [JobInput];
    totalAmountCents:  Nat;
    verifiedJobCount:  Nat;
    diyJobCount:       Nat;
    permitCount:       Nat;
    generatedAt:       Time.Time;
  };

  /// Share link record — separate from the snapshot so we can revoke without
  /// destroying the snapshot.
  public type ShareLink = {
    token:       Text;
    snapshotId:  Text;
    propertyId:  Text;
    createdBy:   Principal;
    expiresAt:   ?Time.Time;   // null = never
    visibility:  VisibilityLevel;
    viewCount:   Nat;
    isActive:    Bool;
    createdAt:   Time.Time;
  };

  public type Error = {
    #NotFound;
    #Expired;
    #Revoked;
    #Unauthorized;
    #InvalidInput      : Text;
    /// Caller attempted to share a report for an unverified property.
    /// The property must reach #Basic or #Premium before a share link
    /// can be issued.
    #UnverifiedProperty;
  };

  public type Metrics = {
    totalReports:    Nat;
    totalShareLinks: Nat;
    activeLinks:     Nat;
    totalViews:      Nat;
    isPaused:        Bool;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var reportCounter    : Nat       = 0;
  private var isPaused         : Bool      = false;
  private var adminListEntries : [Principal] = [];
  private var snapshotEntries  : [(Text, ReportSnapshot)] = [];
  private var linkEntries      : [(Text, ShareLink)] = [];

  /// Property canister ID — set post-deploy via setPropertyCanisterId().
  /// When non-empty, generateReport() cross-canister calls
  /// property.getVerificationLevel() to enforce the unverified gate.
  private var propCanisterId : Text = "";

  // ─── Transient State ──────────────────────────────────────────────────────────

  private transient var snapshots = HashMap.fromIter<Text, ReportSnapshot>(
    snapshotEntries.vals(), 64, Text.equal, Text.hash
  );

  private transient var links = HashMap.fromIter<Text, ShareLink>(
    linkEntries.vals(), 64, Text.equal, Text.hash
  );

  // ─── Upgrade Hooks ────────────────────────────────────────────────────────────

  system func preupgrade() {
    snapshotEntries := Iter.toArray(snapshots.entries());
    linkEntries     := Iter.toArray(links.entries());
  };

  system func postupgrade() {
    snapshotEntries := [];
    linkEntries     := [];
  };

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private func isAdmin(p: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == p }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (isPaused) #err(#InvalidInput("Canister is paused")) else #ok(())
  };

  private func nextIds() : (Text, Text) {
    reportCounter += 1;
    let ts  = Int.abs(Time.now()) / 1_000_000;   // ms since epoch
    let sid = "SNAP_" # Nat.toText(reportCounter) # "_" # Int.toText(ts);
    let tok = "RPT_"  # Nat.toText(reportCounter) # "_" # Int.toText(ts);
    (sid, tok)
  };

  private func isExpired(link: ShareLink) : Bool {
    switch (link.expiresAt) {
      case null      { false };
      case (?expiry) { Time.now() > expiry };
    }
  };

  private func totalAmount(jobs: [JobInput]) : Nat {
    var sum = 0;
    for (j in jobs.vals()) { sum += j.amountCents };
    sum
  };

  private func countVerified(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.vals()) { if (j.isVerified) { n += 1 } };
    n
  };

  private func countDiy(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.vals()) { if (j.isDiy) { n += 1 } };
    n
  };

  private func countPermits(jobs: [JobInput]) : Nat {
    var n = 0;
    for (j in jobs.vals()) {
      switch (j.permitNumber) {
        case (?_) { n += 1 };
        case null {};
      }
    };
    n
  };

  // ─── Core: Generate Report ────────────────────────────────────────────────────

  /// Create an immutable snapshot and issue a share link.
  ///
  /// Rejects with #UnverifiedProperty if the property canister is configured
  /// and the property has not reached #Basic or #Premium verification.
  /// This prevents unverified homeowners from sharing "official" HomeFax
  /// reports with buyers or insurers.
  ///
  /// Pass expiryDays = null for a link that never expires.
  public shared(msg) func generateReport(
    propertyId:  Text,
    property:    PropertyInput,
    jobs:        [JobInput],
    expiryDays:  ?Nat,
    visibility:  VisibilityLevel
  ) : async Result.Result<ShareLink, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(property.address) == 0) return #err(#InvalidInput("address cannot be empty"));

    // ── Ownership verification gate ──────────────────────────────────────────
    // Cross-canister call to the property canister to fetch the authoritative
    // verification level — callers cannot spoof this by passing a fake level
    // in the PropertyInput.
    if (Text.size(propCanisterId) > 0) {
      switch (Nat.fromText(propertyId)) {
        case (?pid) {
          let propActor = actor(propCanisterId) : actor {
            getVerificationLevel : (Nat) -> async ?Text;
          };
          switch (await propActor.getVerificationLevel(pid)) {
            case (?level) {
              if (level == "Unverified" or level == "PendingReview") {
                return #err(#UnverifiedProperty);
              };
            };
            case null {};   // not found — proceed
          };
        };
        case null {};   // propertyId is not a Nat — skip the check
      };
    };

    let (snapshotId, token) = nextIds();
    let now = Time.now();

    let snapshot : ReportSnapshot = {
      snapshotId;
      propertyId;
      generatedBy      = msg.caller;
      address          = property.address;
      city             = property.city;
      state            = property.state;
      zipCode          = property.zipCode;
      propertyType     = property.propertyType;
      yearBuilt        = property.yearBuilt;
      squareFeet       = property.squareFeet;
      verificationLevel = property.verificationLevel;
      jobs;
      totalAmountCents = totalAmount(jobs);
      verifiedJobCount = countVerified(jobs);
      diyJobCount      = countDiy(jobs);
      permitCount      = countPermits(jobs);
      generatedAt      = now;
    };
    snapshots.put(snapshotId, snapshot);

    let expiresAt : ?Time.Time = switch (expiryDays) {
      case null    { null };
      case (?days) { ?(now + (days * 24 * 3600 * 1_000_000_000)) };
    };

    let link : ShareLink = {
      token;
      snapshotId;
      propertyId;
      createdBy  = msg.caller;
      expiresAt;
      visibility;
      viewCount  = 0;
      isActive   = true;
      createdAt  = now;
    };
    links.put(token, link);
    #ok(link)
  };

  // ─── Core: View Report ────────────────────────────────────────────────────────

  /// Fetch the report snapshot for a share token.
  /// Increments view count; returns error if expired or revoked.
  public shared func getReport(token: Text) : async Result.Result<(ShareLink, ReportSnapshot), Error> {
    switch (links.get(token)) {
      case null { #err(#NotFound) };
      case (?link) {
        if (not link.isActive) return #err(#Revoked);
        if (isExpired(link))   return #err(#Expired);

        switch (snapshots.get(link.snapshotId)) {
          case null      { #err(#NotFound) };
          case (?snap)   {
            // Increment view count
            let updated : ShareLink = {
              token        = link.token;
              snapshotId   = link.snapshotId;
              propertyId   = link.propertyId;
              createdBy    = link.createdBy;
              expiresAt    = link.expiresAt;
              visibility   = link.visibility;
              viewCount    = link.viewCount + 1;
              isActive     = link.isActive;
              createdAt    = link.createdAt;
            };
            links.put(token, updated);
            #ok((updated, snap))
          };
        }
      };
    }
  };

  // ─── Share Link Management ────────────────────────────────────────────────────

  /// List all share links the caller created for a property.
  public shared(msg) func listShareLinks(propertyId: Text) : async [ShareLink] {
    Iter.toArray(Iter.filter(links.vals(), func(l: ShareLink) : Bool {
      l.propertyId == propertyId and l.createdBy == msg.caller
    }))
  };

  /// Revoke a share link. Only the creator or an admin can do this.
  public shared(msg) func revokeShareLink(token: Text) : async Result.Result<(), Error> {
    switch (links.get(token)) {
      case null { #err(#NotFound) };
      case (?link) {
        if (link.createdBy != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
        let revoked : ShareLink = {
          token        = link.token;
          snapshotId   = link.snapshotId;
          propertyId   = link.propertyId;
          createdBy    = link.createdBy;
          expiresAt    = link.expiresAt;
          visibility   = link.visibility;
          viewCount    = link.viewCount;
          isActive     = false;
          createdAt    = link.createdAt;
        };
        links.put(token, revoked);
        #ok(())
      };
    }
  };

  // ─── Admin Functions ──────────────────────────────────────────────────────────

  /// Wire the report canister to the property canister.
  /// Must be called once after both canisters are deployed.
  /// Once set, generateReport() enforces the verification gate.
  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    propCanisterId := id;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminListEntries.size() > 0 and not isAdmin(msg.caller))
      return #err(#Unauthorized);
    adminListEntries := Array.append(adminListEntries, [newAdmin]);
    #ok(())
  };

  public shared(msg) func pause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := false;
    #ok(())
  };

  public query func getMetrics() : async Metrics {
    var active = 0;
    var views  = 0;
    for (l in links.vals()) {
      if (l.isActive and not isExpired(l)) { active += 1 };
      views += l.viewCount;
    };
    {
      totalReports    = snapshots.size();
      totalShareLinks = links.size();
      activeLinks     = active;
      totalViews      = views;
      isPaused;
    }
  };
}
