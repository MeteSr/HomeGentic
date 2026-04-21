/**
 * HomeGentic Listing Canister
 * Sealed-bid marketplace where homeowners invite agents to compete for
 * their listing. Proposals are hidden until the bid deadline passes.
 */

import Array    "mo:core/Array";
import Map      "mo:core/Map";
import Int      "mo:core/Int";
import Iter     "mo:core/Iter";
import Nat      "mo:core/Nat";
import Option   "mo:core/Option";
import Principal "mo:core/Principal";
import Result   "mo:core/Result";
import Text     "mo:core/Text";
import Time     "mo:core/Time";

persistent actor Listing {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type BidRequestStatus = { #Open; #Awarded; #Cancelled };
  public type ProposalStatus   = { #Pending; #Accepted; #Rejected; #Withdrawn };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput: Text;
    #AlreadyCancelled;
    #DeadlinePassed;
  };

  public type ListingBidRequest = {
    id:               Text;
    propertyId:       Text;
    homeowner:        Principal;
    targetListDate:   Time.Time;
    desiredSalePrice: ?Nat;
    notes:            Text;
    bidDeadline:      Time.Time;
    status:           BidRequestStatus;
    createdAt:        Time.Time;
  };

  public type ListingProposal = {
    id:                    Text;
    requestId:             Text;
    agentId:               Principal;
    agentName:             Text;
    agentBrokerage:        Text;
    commissionBps:         Nat;
    cmaSummary:            Text;
    marketingPlan:         Text;
    estimatedDaysOnMarket: Nat;
    estimatedSalePrice:    Nat;
    includedServices:      [Text];
    validUntil:            Time.Time;
    coverLetter:           Text;
    status:                ProposalStatus;
    createdAt:             Time.Time;
  };

  public type Metrics = {
    totalRequests:  Nat;
    openRequests:   Nat;
    awardedRequests: Nat;
    totalProposals: Nat;
    isPaused:       Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var bidCounter:      Nat = 0;
  private var proposalCounter: Nat = 0;
  private var isPaused:        Bool = false;
  private var pauseExpiryNs:   ?Int = null;
  private var adminListEntries: [Principal] = [];
  private var adminInitialized: Bool = false;

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let requests  = Map.empty<Text, ListingBidRequest>();
  private let proposals = Map.empty<Text, ListingProposal>();
  /// propertyId → ordered list of photo IDs (first = cover image)
  private let listingPhotos      = Map.empty<Text, [Text]>();
  /// propertyId → the principal who first added a photo (owner lock)
  private let listingPhotoOwners = Map.empty<Text, Principal>();

  private let MAX_LISTING_PHOTOS : Nat = 15;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private transient let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  /// Admin-adjustable rate limit — default 30/min.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;
  // ── Ingress inspection ────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not Principal.isAnonymous(caller) and arg.size() > 0
  };


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

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(adminListEntries, func(a) { a == caller }))
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

  private func nextBidId() : Text {
    bidCounter += 1;
    "BID_" # Nat.toText(bidCounter)
  };

  private func nextProposalId() : Text {
    proposalCounter += 1;
    "PROP_" # Nat.toText(proposalCounter)
  };

  // ─── Homeowner: Bid Request Lifecycle ────────────────────────────────────────

  /// Create a listing bid request. Invites agents to compete for the listing.
  public shared(msg) func createBidRequest(
    propertyId:       Text,
    targetListDate:   Int,
    desiredSalePrice: ?Nat,
    notes:            Text,
    bidDeadline:      Int
  ) : async Result.Result<ListingBidRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(notes) > 5000)    return #err(#InvalidInput("notes exceeds 5000 characters"));
    if (bidDeadline <= Time.now())  return #err(#InvalidInput("bidDeadline must be in the future"));

    let id = nextBidId();
    let req: ListingBidRequest = {
      id;
      propertyId;
      homeowner        = msg.caller;
      targetListDate;
      desiredSalePrice;
      notes;
      bidDeadline;
      status           = #Open;
      createdAt        = Time.now();
    };
    Map.add(requests, Text.compare, id, req);
    #ok(req)
  };

  /// Fetch all bid requests created by the caller.
  public query(msg) func getMyBidRequests() : async [ListingBidRequest] {
    Iter.toArray(
      Iter.filter(Map.values(requests), func(r: ListingBidRequest) : Bool {
        r.homeowner == msg.caller
      })
    )
  };

  /// Fetch a single bid request by ID.
  public query func getBidRequest(id: Text) : async Result.Result<ListingBidRequest, Error> {
    switch (Map.get(requests, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?r) { #ok(r) };
    }
  };

  /// Cancel an open bid request (homeowner only).
  public shared(msg) func cancelBidRequest(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(requests, Text.compare, id)) {
      case null    { #err(#NotFound) };
      case (?req) {
        if (req.homeowner != msg.caller) return #err(#Unauthorized);
        if (req.status == #Cancelled)    return #err(#AlreadyCancelled);
        if (req.status != #Open)         return #err(#InvalidInput("Request is not open"));
        let updated: ListingBidRequest = {
          id             = req.id;
          propertyId     = req.propertyId;
          homeowner      = req.homeowner;
          targetListDate = req.targetListDate;
          desiredSalePrice = req.desiredSalePrice;
          notes          = req.notes;
          bidDeadline    = req.bidDeadline;
          status         = #Cancelled;
          createdAt      = req.createdAt;
        };
        Map.add(requests, Text.compare, id, updated);
        #ok(())
      };
    }
  };

  /// All open bid requests — visible to licensed agents browsing the marketplace.
  public query func getOpenBidRequests() : async [ListingBidRequest] {
    Iter.toArray(
      Iter.filter(Map.values(requests), func(r: ListingBidRequest) : Bool {
        r.status == #Open
      })
    )
  };

  // ─── Agent: Proposal Lifecycle ────────────────────────────────────────────────

  /// Submit a proposal for an open bid request.
  /// Proposals are sealed (hidden from homeowner) until the bidDeadline passes.
  public shared(msg) func submitProposal(
    requestId:             Text,
    agentName:             Text,
    agentBrokerage:        Text,
    commissionBps:         Nat,
    cmaSummary:            Text,
    marketingPlan:         Text,
    estimatedDaysOnMarket: Nat,
    estimatedSalePrice:    Nat,
    includedServices:      [Text],
    validUntil:            Int,
    coverLetter:           Text
  ) : async Result.Result<ListingProposal, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(requests, Text.compare, requestId)) {
      case null    { #err(#NotFound) };
      case (?req) {
        if (req.status != #Open)         return #err(#InvalidInput("Request is not accepting proposals"));
        if (req.bidDeadline <= Time.now()) return #err(#DeadlinePassed);
        if (commissionBps == 0)          return #err(#InvalidInput("commissionBps must be greater than 0"));
        if (estimatedSalePrice == 0)     return #err(#InvalidInput("estimatedSalePrice must be greater than 0"));
        if (Text.size(agentName) == 0)   return #err(#InvalidInput("agentName cannot be empty"));

        let id = nextProposalId();
        let proposal: ListingProposal = {
          id;
          requestId;
          agentId               = msg.caller;
          agentName;
          agentBrokerage;
          commissionBps;
          cmaSummary;
          marketingPlan;
          estimatedDaysOnMarket;
          estimatedSalePrice;
          includedServices;
          validUntil;
          coverLetter;
          status                = #Pending;
          createdAt             = Time.now();
        };
        Map.add(proposals, Text.compare, id, proposal);
        #ok(proposal)
      };
    }
  };

  /// All proposals for a given request.
  /// The sealed-bid reveal gate (bidDeadline check) is enforced by the frontend service.
  /// The canister returns all proposals so the homeowner can always access their own data.
  public query func getProposalsForRequest(requestId: Text) : async [ListingProposal] {
    Iter.toArray(
      Iter.filter(Map.values(proposals), func(p: ListingProposal) : Bool {
        p.requestId == requestId
      })
    )
  };

  /// All proposals submitted by the calling agent.
  public query(msg) func getMyProposals() : async [ListingProposal] {
    Iter.toArray(
      Iter.filter(Map.values(proposals), func(p: ListingProposal) : Bool {
        p.agentId == msg.caller
      })
    )
  };

  // ─── Homeowner: Accept a Proposal ────────────────────────────────────────────

  /// Accept a proposal: marks it Accepted, rejects all others on the same request,
  /// and marks the parent request as Awarded. Caller must be the homeowner.
  public shared(msg) func acceptProposal(proposalId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(proposals, Text.compare, proposalId)) {
      case null { #err(#NotFound) };
      case (?winner) {
        switch (Map.get(requests, Text.compare, winner.requestId)) {
          case null { #err(#NotFound) };
          case (?req) {
            if (req.homeowner != msg.caller) return #err(#Unauthorized);
            if (req.status != #Open)         return #err(#InvalidInput("Request is no longer open"));

            // Accept the winner
            Map.add(proposals, Text.compare, winner.id, {
              id                    = winner.id;
              requestId             = winner.requestId;
              agentId               = winner.agentId;
              agentName             = winner.agentName;
              agentBrokerage        = winner.agentBrokerage;
              commissionBps         = winner.commissionBps;
              cmaSummary            = winner.cmaSummary;
              marketingPlan         = winner.marketingPlan;
              estimatedDaysOnMarket = winner.estimatedDaysOnMarket;
              estimatedSalePrice    = winner.estimatedSalePrice;
              includedServices      = winner.includedServices;
              validUntil            = winner.validUntil;
              coverLetter           = winner.coverLetter;
              status                = #Accepted;
              createdAt             = winner.createdAt;
            });

            // Reject all other pending proposals on the same request
            for ((pid, p) in Map.entries(proposals)) {
              if (p.requestId == winner.requestId and p.id != winner.id and p.status == #Pending) {
                Map.add(proposals, Text.compare, pid, {
                  id                    = p.id;
                  requestId             = p.requestId;
                  agentId               = p.agentId;
                  agentName             = p.agentName;
                  agentBrokerage        = p.agentBrokerage;
                  commissionBps         = p.commissionBps;
                  cmaSummary            = p.cmaSummary;
                  marketingPlan         = p.marketingPlan;
                  estimatedDaysOnMarket = p.estimatedDaysOnMarket;
                  estimatedSalePrice    = p.estimatedSalePrice;
                  includedServices      = p.includedServices;
                  validUntil            = p.validUntil;
                  coverLetter           = p.coverLetter;
                  status                = #Rejected;
                  createdAt             = p.createdAt;
                });
              };
            };

            // Award the request
            Map.add(requests, Text.compare, req.id, {
              id               = req.id;
              propertyId       = req.propertyId;
              homeowner        = req.homeowner;
              targetListDate   = req.targetListDate;
              desiredSalePrice = req.desiredSalePrice;
              notes            = req.notes;
              bidDeadline      = req.bidDeadline;
              status           = #Awarded;
              createdAt        = req.createdAt;
            });

            #ok(())
          };
        }
      };
    }
  };

  // ─── Listing Photos ──────────────────────────────────────────────────────────

  /// Associate a photo (already uploaded to the photo canister) with this
  /// FSBO listing. The first caller becomes the listing photo owner; all
  /// subsequent calls must come from the same principal.
  /// Enforces a cap of 15 photos per listing.
  public shared(msg) func addListingPhoto(propertyId: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(photoId) == 0)    return #err(#InvalidInput("photoId cannot be empty"));

    // First caller claims ownership; subsequent callers must match.
    switch (Map.get(listingPhotoOwners, Text.compare, propertyId)) {
      case null    { Map.add(listingPhotoOwners, Text.compare, propertyId, msg.caller) };
      case (?owner) {
        if (owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
      };
    };

    let existing : [Text] = switch (Map.get(listingPhotos, Text.compare, propertyId)) {
      case null   { [] };
      case (?ids) { ids };
    };

    if (existing.size() >= MAX_LISTING_PHOTOS)
      return #err(#InvalidInput(
        "Listing photo limit (" # Nat.toText(MAX_LISTING_PHOTOS) # ") reached"
      ));

    if (Option.isSome(Array.find<Text>(existing, func(id) { id == photoId })))
      return #err(#InvalidInput("Photo already added to this listing"));

    Map.add(listingPhotos, Text.compare, propertyId, Array.concat(existing, [photoId]));
    #ok(())
  };

  /// Returns the ordered photo IDs for a listing (first = cover image).
  /// Publicly readable — no authentication required.
  public query func getListingPhotos(propertyId: Text) : async [Text] {
    switch (Map.get(listingPhotos, Text.compare, propertyId)) {
      case null   { [] };
      case (?ids) { ids };
    }
  };

  /// Remove a photo from this listing's ordered list. Owner or admin only.
  public shared(msg) func removeListingPhoto(propertyId: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(listingPhotoOwners, Text.compare, propertyId)) {
      case null     { return #err(#NotFound) };
      case (?owner) {
        if (owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
      };
    };
    let existing : [Text] = switch (Map.get(listingPhotos, Text.compare, propertyId)) {
      case null   { return #err(#NotFound) };
      case (?ids) { ids };
    };
    Map.add(listingPhotos, Text.compare, propertyId,
      Array.filter<Text>(existing, func(id) { id != photoId }));
    #ok(())
  };

  /// Replace the photo ordering for a listing. The supplied list must contain
  /// exactly the same IDs that are already stored — only the order may change.
  public shared(msg) func reorderListingPhotos(propertyId: Text, photoIds: [Text]) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(listingPhotoOwners, Text.compare, propertyId)) {
      case null     { return #err(#NotFound) };
      case (?owner) {
        if (owner != msg.caller and not isAdmin(msg.caller))
          return #err(#Unauthorized);
      };
    };
    let existing : [Text] = switch (Map.get(listingPhotos, Text.compare, propertyId)) {
      case null   { return #err(#NotFound) };
      case (?ids) { ids };
    };
    if (photoIds.size() != existing.size())
      return #err(#InvalidInput("Reorder list must contain the same number of photos"));
    for (id in photoIds.vals()) {
      if (not Option.isSome(Array.find<Text>(existing, func(e) { e == id })))
        return #err(#InvalidInput("Unknown photo ID in reorder list: " # id));
    };
    Map.add(listingPhotos, Text.compare, propertyId, photoIds);
    #ok(())
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    adminListEntries := Array.concat(adminListEntries, [newAdmin]);
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

  public query func metrics() : async Metrics {
    var open = 0;
    var awarded = 0;
    for (r in Map.values(requests)) {
      if (r.status == #Open)    { open    += 1 };
      if (r.status == #Awarded) { awarded += 1 };
    };
    {
      totalRequests   = Map.size(requests);
      openRequests    = open;
      awardedRequests = awarded;
      totalProposals  = Map.size(proposals);
      isPaused;
    }
  };
}
