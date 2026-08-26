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
    #NotAuthorized;
    #InvalidInput: Text;
    #AlreadyCancelled;
    #DeadlinePassed;
  };

  public type PanoramaEntry = {
    roomLabel : Text;
    photoId   : Text;
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

  /// Denormalised record written by the homeowner when they activate FSBO mode.
  /// Returned verbatim by listActiveFsboListings() for the public buyer search.
  public type PublicFsboListing = {
    propertyId:        Text;
    homeowner:         Principal;
    listPriceCents:    Nat;
    activatedAt:       Time.Time;
    address:           Text;
    city:              Text;
    state:             Text;
    zipCode:           Text;
    propertyType:      Text;
    yearBuilt:         Nat;
    squareFeet:        Nat;
    bedrooms:          Nat;
    bathrooms:         Nat;
    verificationLevel: Text;
    score:             ?Nat;
    verifiedJobCount:  Nat;
    description:       ?Text;
    photoUrl:          ?Text;
    hasPublicReport:   Bool;
    systemHighlights:  [Text];
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var bidCounter:      Nat = 0;
  private var proposalCounter: Nat = 0;
  private var isPaused:        Bool = false;
  private var pauseExpiryNs:   ?Int = null;
  private var adminListEntries: [Principal] = [];
  private var adminInitialized: Bool = false;
  /// Canister IDs for FSBO trust-signal resolution — set post-deploy via setXxxCanisterId().
  /// When wired, activateFsboListing() fetches authoritative values instead of trusting the caller.
  private var propCanisterId   : Text = "";
  private var jobCanisterId    : Text = "";
  private var reportCanisterId : Text = "";
  private var marketCanisterId : Text = "";

  // ─── Stable State ────────────────────────────────────────────────────────────

  private let requests       = Map.empty<Text, ListingBidRequest>();
  private let proposals      = Map.empty<Text, ListingProposal>();
  /// propertyId → active public FSBO listing (absent when not FSBO-active)
  private let fsboListings   = Map.empty<Text, PublicFsboListing>();
  /// propertyId → ordered list of photo IDs (first = cover image)
  private let listingPhotos      = Map.empty<Text, [Text]>();
  /// propertyId → the principal who first added a photo (owner lock)
  private let listingPhotoOwners = Map.empty<Text, Principal>();
  /// propertyId → ordered list of 360° panorama entries (room label + photo ID)
  private let listingPanoramas      = Map.empty<Text, [PanoramaEntry]>();
  /// propertyId → the principal who first added a panorama (owner lock)
  private let listingPanoramaOwners = Map.empty<Text, Principal>();

  private let MAX_LISTING_PHOTOS    : Nat = 15;
  private let MAX_LISTING_PANORAMAS : Nat = 10;

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
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
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
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
        if (req.homeowner != msg.caller) return #err(#NotAuthorized);
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
  /// H-16: bid deadline is now enforced on-chain. Before the deadline, each caller
  /// can only see their own proposal. After the deadline or for admins, all proposals
  /// are returned so the homeowner can compare and select a winner.
  public shared(msg) func getProposalsForRequest(requestId: Text) : async Result.Result<[ListingProposal], Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        let allProposals = Iter.toArray(
          Iter.filter(Map.values(proposals), func(p: ListingProposal) : Bool {
            p.requestId == requestId
          })
        );
        // Before deadline: only return the caller's own proposal (unless admin or homeowner)
        if (Time.now() < req.bidDeadline and not isAdmin(msg.caller) and req.homeowner != msg.caller) {
          let myProposal = Array.find<ListingProposal>(allProposals, func(p: ListingProposal) : Bool {
            p.agentId == msg.caller
          });
          switch (myProposal) {
            case null    { return #ok([]) };
            case (?mine) { return #ok([mine]) };
          };
        };
        // After deadline, or caller is admin or homeowner: return all proposals
        #ok(allProposals)
      };
    }
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
            if (req.homeowner != msg.caller) return #err(#NotAuthorized);
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
          return #err(#NotAuthorized);
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
          return #err(#NotAuthorized);
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
          return #err(#NotAuthorized);
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

  // ─── 360° Panoramas ──────────────────────────────────────────────────────────

  /// Add a 360° equirectangular photo to this listing.
  /// The first caller becomes the panorama owner; subsequent calls must match.
  /// Enforces a cap of 10 panoramas per listing; room labels must be unique.
  public shared(msg) func addPanorama(propertyId: Text, roomLabel: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(roomLabel)  == 0) return #err(#InvalidInput("roomLabel cannot be empty"));
    if (Text.size(photoId)    == 0) return #err(#InvalidInput("photoId cannot be empty"));

    switch (Map.get(listingPanoramaOwners, Text.compare, propertyId)) {
      case null    { Map.add(listingPanoramaOwners, Text.compare, propertyId, msg.caller) };
      case (?owner) {
        if (owner != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
      };
    };

    let existing : [PanoramaEntry] = switch (Map.get(listingPanoramas, Text.compare, propertyId)) {
      case null    { [] };
      case (?entries) { entries };
    };

    if (existing.size() >= MAX_LISTING_PANORAMAS)
      return #err(#InvalidInput("Panorama limit (" # Nat.toText(MAX_LISTING_PANORAMAS) # ") reached"));

    if (Option.isSome(Array.find<PanoramaEntry>(existing, func(e) { e.roomLabel == roomLabel })))
      return #err(#InvalidInput("Room label \"" # roomLabel # "\" already exists"));

    Map.add(listingPanoramas, Text.compare, propertyId,
      Array.concat(existing, [{ roomLabel; photoId }]));
    #ok(())
  };

  /// Returns the ordered panorama entries for a listing. Publicly readable.
  public query func getPanoramas(propertyId: Text) : async [PanoramaEntry] {
    switch (Map.get(listingPanoramas, Text.compare, propertyId)) {
      case null       { [] };
      case (?entries) { entries };
    }
  };

  /// Remove a panorama entry by room label. Owner or admin only.
  public shared(msg) func removePanorama(propertyId: Text, roomLabel: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(listingPanoramaOwners, Text.compare, propertyId)) {
      case null     { return #err(#NotFound) };
      case (?owner) {
        if (owner != msg.caller and not isAdmin(msg.caller))
          return #err(#NotAuthorized);
      };
    };
    let existing : [PanoramaEntry] = switch (Map.get(listingPanoramas, Text.compare, propertyId)) {
      case null       { return #err(#NotFound) };
      case (?entries) { entries };
    };
    if (not Option.isSome(Array.find<PanoramaEntry>(existing, func(e) { e.roomLabel == roomLabel })))
      return #err(#NotFound);
    Map.add(listingPanoramas, Text.compare, propertyId,
      Array.filter<PanoramaEntry>(existing, func(e) { e.roomLabel != roomLabel }));
    #ok(())
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  // ─── Public FSBO search index ─────────────────────────────────────────────────

  /// Register or update a property in the public FSBO buyer search index.
  /// Only the property owner may call this; caller is recorded as homeowner.
  /// Trust signals (verificationLevel, verifiedJobCount, hasPublicReport) are
  /// resolved from their authoritative canisters when wired; caller-supplied
  /// values for those fields are always ignored.
  public shared(msg) func activateFsboListing(listing: PublicFsboListing) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(listing.propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (listing.listPriceCents == 0)        return #err(#InvalidInput("listPriceCents must be positive"));
    switch (listing.description) {
      case (?d) { if (Text.size(d) > 5000) return #err(#InvalidInput("description exceeds 5000 characters")) };
      case null {};
    };

    // ── Authoritative trust-signal resolution ─────────────────────────────────
    // These values are fetched cross-canister and cannot be forged by the caller.
    // M-11: fail closed when propCanisterId is not wired — ownership cannot be
    // verified without the property canister, so we must reject the call.
    var resolvedVerificationLevel : Text = "Unverified";
    var resolvedVerifiedJobCount  : Nat  = 0;
    var resolvedHasPublicReport   : Bool = false;

    if (Text.size(propCanisterId) == 0) {
      return #err(#InvalidInput("Property canister not configured — cannot verify ownership"));
    };
    let propActor = actor(propCanisterId) : actor {
      getPropertyOwner     : query (Text) -> async ?Principal;
      getVerificationLevel : query (Text) -> async ?Text;
    };
    // Verify the caller actually owns this property.
    switch (await propActor.getPropertyOwner(listing.propertyId)) {
      case null    { return #err(#NotFound) };
      case (?owner) {
        if (owner != msg.caller) return #err(#NotAuthorized);
      };
    };
    switch (await propActor.getVerificationLevel(listing.propertyId)) {
      case null        {};
      case (?level)    { resolvedVerificationLevel := level };
    };

    if (jobCanisterId != "") {
      let jobActor = actor(jobCanisterId) : actor {
        getCertificationData : query (Text) -> async {
          verifiedJobCount   : Nat;
          verifiedKeySystems : [Text];
          meetsStructural    : Bool;
        };
      };
      let certData = await jobActor.getCertificationData(listing.propertyId);
      resolvedVerifiedJobCount := certData.verifiedJobCount;
    };

    if (reportCanisterId != "") {
      let reportActor = actor(reportCanisterId) : actor {
        hasActivePublicShareLink : query (Text) -> async Bool;
      };
      resolvedHasPublicReport := await reportActor.hasActivePublicShareLink(listing.propertyId);
    };

    var resolvedScore : ?Nat = null;
    if (marketCanisterId != "") {
      let marketActor = actor(marketCanisterId) : actor {
        computePropertyScore : (Text) -> async ?Nat;
      };
      resolvedScore := await marketActor.computePropertyScore(listing.propertyId);
    };

    // Stamp the caller as the owner; replace all trust signals with authoritative values.
    let stamped : PublicFsboListing = {
      propertyId        = listing.propertyId;
      homeowner         = msg.caller;
      listPriceCents    = listing.listPriceCents;
      activatedAt       = Time.now();
      address           = listing.address;
      city              = listing.city;
      state             = listing.state;
      zipCode           = listing.zipCode;
      propertyType      = listing.propertyType;
      yearBuilt         = listing.yearBuilt;
      squareFeet        = listing.squareFeet;
      bedrooms          = listing.bedrooms;
      bathrooms         = listing.bathrooms;
      verificationLevel = resolvedVerificationLevel;
      score             = resolvedScore;
      verifiedJobCount  = resolvedVerifiedJobCount;
      description       = listing.description;
      photoUrl          = listing.photoUrl;
      hasPublicReport   = resolvedHasPublicReport;
      systemHighlights  = listing.systemHighlights;
    };
    Map.add(fsboListings, Text.compare, listing.propertyId, stamped);
    #ok(())
  };

  /// Remove a property from the public FSBO search index.
  /// Only the original homeowner or an admin may deactivate.
  public shared(msg) func deactivateFsboListing(propertyId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(fsboListings, Text.compare, propertyId)) {
      case null { return #err(#NotFound) };
      case (?existing) {
        if (existing.homeowner != msg.caller and not isAdmin(msg.caller)) {
          return #err(#NotAuthorized);
        };
        ignore Map.remove(fsboListings, Text.compare, propertyId);
        #ok(())
      };
    }
  };

  /// Return all active public FSBO listings. No authentication required.
  public query func listActiveFsboListings() : async [PublicFsboListing] {
    Iter.toArray(Map.values(fsboListings))
  };

  /// Wire the property canister for ownership verification and verificationLevel lookup.
  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    propCanisterId := id;
    #ok(())
  };

  /// Wire the job canister for verifiedJobCount lookup.
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    jobCanisterId := id;
    #ok(())
  };

  /// Wire the report canister for hasPublicReport lookup.
  public shared(msg) func setReportCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    reportCanisterId := id;
    #ok(())
  };

  /// Wire the market canister for on-chain score computation.
  public shared(msg) func setMarketCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    marketCanisterId := id;
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
    if (not isAdmin(newAdmin)) {
      adminListEntries := Array.concat(adminListEntries, [newAdmin]);
    };
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Array.filter<Principal>(adminListEntries, func(a) { a != target });
    #ok(())
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
