/**
 * HomeGentic Listing Canister — Bid to List
 * Masked, sealed-bid marketplace where up to five verified agents compete for
 * a homeowner's listing. Bid terms stay sealed until three bids are in or the
 * window closes (invariant 02); agent identity stays masked until the winning
 * agent's fee settles (invariant 04); agents never see each other's bids or
 * bid counts, only the open-slot count (invariant 03).
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Listing {

  // ─── Types ──────────────────────────────────────────────────────────────────

  public type BidRequestStatus = { #Open; #Awarded; #Cancelled };
  public type ProposalStatus   = { #Pending; #Accepted; #Rejected; #Withdrawn };
  public type WindowDays       = { #Three; #Seven; #Fourteen };
  public type MessageRole      = { #seller; #agent };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #AlreadyCancelled;
    #DeadlinePassed;
    #SlotsFull;
  };

  public type PanoramaEntry = {
    roomLabel : Text;
    photoId   : Text;
  };

  public type ListingBidRequest = {
    id:               Text;
    propertyId:       Text;
    homeowner:        Principal;
    address:          Text;   // never exposed to agents pre-award (invariant 01)
    city:             Text;
    county:           Text;
    zipCode:          Text;
    homeownerEmail:   Text;   // never exposed to agents pre-award (invariant 01)
    beds:             ?Nat;
    baths:            ?Nat;
    sqft:             ?Nat;
    targetListDate:   Time.Time;
    desiredSalePrice: ?Nat;
    notes:            Text;
    windowDays:       WindowDays;
    bidDeadline:      Time.Time;
    status:           BidRequestStatus;
    feePaid:          Bool;
    createdAt:        Time.Time;
  };

  /// Non-identifying view for the agent browse feed (A2). No address, no email.
  public type BidRequestSummary = {
    id:               Text;
    city:             Text;
    county:           Text;
    zipCode:          Text;
    beds:             ?Nat;
    baths:            ?Nat;
    sqft:             ?Nat;
    targetListDate:   Time.Time;
    desiredSalePrice: ?Nat;
    notes:            Text;
    windowDays:       WindowDays;
    bidDeadline:      Time.Time;
    status:           BidRequestStatus;
    proposalCount:    Nat;
    openSlots:        Nat;
    createdAt:        Time.Time;
  };

  /// Server-computed at bid time, snapshotted — never re-ranked live off a
  /// changing agent record (state-management note in the design handoff).
  public type DerivedSignals = {
    estNetToSellerCents: Nat;
    pctVsCompsBps:       Int;   // signed basis points vs. local comps median
    overCompFlag:        Bool; // suggestedList > comps median * 1.04
    thinCompsFlag:        Bool; // comps sale count < 8
  };

  /// Snapshot of the agent's own record at bid time (v1 approximation — pulled
  /// from the agent canister's aggregate stats; per-zip MLS granularity is a
  /// real data-source dependency called out as an open question, not built here).
  public type AgentRecordSnapshot = {
    closedInZip:        Nat;
    avgDom:              Nat;
    saleToListRatioBps: Nat;
    withdrawnUnsold:     Nat;
    commitmentsUnmet:    Nat;
  };

  public type ListingProposal = {
    id:                    Text;
    requestId:             Text;
    agentId:               Principal;
    agentName:             Text;
    agentEmail:            Text;
    agentBrokerage:        Text;
    letter:                Text;   // stable "A".."E", assigned on submit
    commissionBps:         Nat;
    suggestedListCents:    Nat;
    cmaSummary:            Text;
    marketingPlan:         Text;
    marketingCommitments:  [Text];
    estimatedDaysOnMarket: Nat;
    includedServices:      [Text];
    validUntil:            Time.Time;
    coverLetter:           Text;
    status:                ProposalStatus;
    derived:               DerivedSignals;
    agentRecord:           AgentRecordSnapshot;
    createdAt:             Time.Time;
  };

  /// What a homeowner (pre-award) or a non-bidding agent may see: letter, no name.
  public type MaskedProposal = {
    id:                    Text;
    requestId:             Text;
    letter:                Text;
    commissionBps:         Nat;
    suggestedListCents:    Nat;
    cmaSummary:            Text;
    marketingPlan:         Text;
    marketingCommitments:  [Text];
    estimatedDaysOnMarket: Nat;
    status:                ProposalStatus;
    derived:               DerivedSignals;
    agentRecord:           AgentRecordSnapshot;
    isMine:                Bool;
    agentName:             ?Text;
    agentEmail:            ?Text;
    agentBrokerage:        ?Text;
    createdAt:             Time.Time;
  };

  public type Message = {
    id:           Text;
    proposalId:   Text;
    authorRole:   MessageRole;
    scrubbedBody: Text;
    redactions:   [Text];
    sentAt:       Time.Time;
  };

  public type CompsConfig = {
    medianCents: Nat;
    saleCount:   Nat;
  };

  public type PhotoReviewState = {
    flagged:  Bool;
    reviewed: Bool;
  };

  public type Metrics = {
    totalRequests:   Nat;
    openRequests:    Nat;
    awardedRequests: Nat;
    totalProposals:  Nat;
    isPaused:        Bool;
  };

  /// Denormalised record written by the homeowner when they activate FSBO mode.
  /// Returned verbatim by listActiveFsboListings() for the public buyer search.
  /// Unrelated to the Bid to List marketplace above — a separate feature.
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
  private var messageCounter:  Nat = 0;
  private var isPaused:        Bool = false;
  private var pauseExpiryNs:   ?Int = null;
  private var adminListEntries: [Principal] = [];
  private var adminInitialized: Bool = false;
  /// Canister IDs for cross-canister resolution — set post-deploy via setXxxCanisterId().
  private var propCanisterId   : Text = "";
  private var jobCanisterId    : Text = "";
  private var reportCanisterId : Text = "";
  private var marketCanisterId : Text = "";
  private var agentCanisterId  : Text = "";
  private var feeCanisterId    : Text = "";
  /// Bid to List platform fee, in cents. $399.00 default — a tweakable parameter,
  /// not a literal (design handoff explicitly calls this out as configuration).
  private var platformFeeCents : Nat = 39900;

  private let requests       = Map.empty<Text, ListingBidRequest>();
  private let proposals      = Map.empty<Text, ListingProposal>();
  private let threads        = Map.empty<Text, [Message]>();   // proposalId -> messages
  private let compsConfig    = Map.empty<Text, CompsConfig>(); // zipCode -> comps
  private let photoReviews   = Map.empty<Text, PhotoReviewState>(); // photoId -> review state
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
  private let MAX_PROPOSALS_PER_REQUEST : Nat = 5;   // "up to five agents" — invariant surface
  private let SEAL_REVEAL_COUNT : Nat = 3;           // invariant 02
  private let LETTERS : [Text] = ["A", "B", "C", "D", "E"];

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;
  private let ONE_DAY_NS          : Int = 86_400_000_000_000;

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

  private func nextBidId() : Text { bidCounter += 1; "BID_" # Nat.toText(bidCounter) };
  private func nextProposalId() : Text { proposalCounter += 1; "PROP_" # Nat.toText(proposalCounter) };
  private func nextMessageId() : Text { messageCounter += 1; "MSG_" # Nat.toText(messageCounter) };

  private func windowDaysToNs(w: WindowDays) : Int {
    let days : Int = switch (w) { case (#Three) { 3 }; case (#Seven) { 7 }; case (#Fourteen) { 14 } };
    days * 86_400_000_000_000
  };

  private func proposalsFor(requestId: Text) : [ListingProposal] {
    Iter.toArray(Iter.filter(Map.values(proposals), func(p: ListingProposal) : Bool { p.requestId == requestId }))
  };

  private func isWinningAgent(requestId: Text, caller: Principal) : Bool {
    Option.isSome(Array.find<ListingProposal>(proposalsFor(requestId), func(p) {
      p.agentId == caller and p.status == #Accepted
    }))
  };

  private func toMasked(p: ListingProposal, caller: Principal, unmasked: Bool) : MaskedProposal {
    let mine = p.agentId == caller;
    let reveal = unmasked or mine;
    {
      id = p.id; requestId = p.requestId; letter = p.letter;
      commissionBps = p.commissionBps; suggestedListCents = p.suggestedListCents;
      cmaSummary = p.cmaSummary; marketingPlan = p.marketingPlan;
      marketingCommitments = p.marketingCommitments;
      estimatedDaysOnMarket = p.estimatedDaysOnMarket; status = p.status;
      derived = p.derived; agentRecord = p.agentRecord; isMine = mine;
      agentName      = if (reveal) { ?p.agentName } else { null };
      agentEmail     = if (reveal) { ?p.agentEmail } else { null };
      agentBrokerage = if (reveal) { ?p.agentBrokerage } else { null };
      createdAt = p.createdAt;
    }
  };

  // ─── Homeowner: Bid Request Lifecycle ────────────────────────────────────────

  /// Create a listing bid request. bidDeadline is computed server-side from
  /// windowDays — never trust a client-supplied deadline.
  public shared(msg) func createBidRequest(
    propertyId:       Text,
    address:          Text,
    city:             Text,
    county:           Text,
    zipCode:          Text,
    homeownerEmail:   Text,
    beds:             ?Nat,
    baths:            ?Nat,
    sqft:             ?Nat,
    targetListDate:   Int,
    desiredSalePrice: ?Nat,
    notes:            Text,
    windowDays:       WindowDays
  ) : async Result.Result<ListingBidRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(address) == 0)    return #err(#InvalidInput("address cannot be empty"));
    if (Text.size(zipCode) == 0)    return #err(#InvalidInput("zipCode cannot be empty"));
    if (Text.size(notes) > 180)     return #err(#InvalidInput("notes exceeds 180 characters"));

    let id = nextBidId();
    let (scrubbedNotes, _) = scrubText(notes);
    let req: ListingBidRequest = {
      id; propertyId; homeowner = msg.caller; address; city; county; zipCode;
      homeownerEmail; beds; baths; sqft; targetListDate; desiredSalePrice;
      notes = scrubbedNotes; windowDays; bidDeadline = Time.now() + windowDaysToNs(windowDays);
      status = #Open; feePaid = false; createdAt = Time.now();
    };
    Map.add(requests, Text.compare, id, req);
    #ok(req)
  };

  public query(msg) func getMyBidRequests() : async [ListingBidRequest] {
    Iter.toArray(Iter.filter(Map.values(requests), func(r: ListingBidRequest) : Bool { r.homeowner == msg.caller }))
  };

  /// Redacts address/homeownerEmail for anyone but the homeowner, an admin, or
  /// (post-payment) the winning agent — invariant 01.
  public query(msg) func getBidRequest(id: Text) : async Result.Result<ListingBidRequest, Error> {
    switch (Map.get(requests, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?r) {
        let privileged = isAdmin(msg.caller) or r.homeowner == msg.caller
          or (r.feePaid and isWinningAgent(r.id, msg.caller));
        if (privileged) { #ok(r) } else { #ok({ r with address = ""; homeownerEmail = "" }) };
      };
    }
  };

  public shared(msg) func cancelBidRequest(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(requests, Text.compare, id)) {
      case null    { #err(#NotFound) };
      case (?req) {
        if (req.homeowner != msg.caller) return #err(#NotAuthorized);
        if (req.status == #Cancelled)    return #err(#AlreadyCancelled);
        if (req.status != #Open)         return #err(#InvalidInput("Request is not open"));
        Map.add(requests, Text.compare, id, { req with status = #Cancelled });
        #ok(())
      };
    }
  };

  /// Masked opportunity feed for the agent browse screen (A2). Open-slot count
  /// is the only cross-agent signal permitted — invariant 03.
  public query func getOpenBidRequests() : async [BidRequestSummary] {
    Iter.toArray(Iter.map<ListingBidRequest, BidRequestSummary>(
      Iter.filter(Map.values(requests), func(r: ListingBidRequest) : Bool { r.status == #Open }),
      func(r) {
        let count = proposalsFor(r.id).size();
        {
          id = r.id; city = r.city; county = r.county; zipCode = r.zipCode;
          beds = r.beds; baths = r.baths; sqft = r.sqft;
          targetListDate = r.targetListDate; desiredSalePrice = r.desiredSalePrice;
          notes = r.notes; windowDays = r.windowDays; bidDeadline = r.bidDeadline;
          status = r.status; proposalCount = count;
          openSlots = if (count >= MAX_PROPOSALS_PER_REQUEST) { 0 } else { MAX_PROPOSALS_PER_REQUEST - count };
          createdAt = r.createdAt;
        }
      }
    ))
  };

  // ─── Homeowner: Photo review (H1 flagged-tile gate) ─────────────────────────
  // v1 stub: real house-number/street-sign/mail detection is a stated ML/data
  // dependency, not built here. flagPhotoForReview stands in for that scan —
  // wire a real vision pipeline to call it later without changing this surface.

  public shared(msg) func flagPhotoForReview(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    Map.add(photoReviews, Text.compare, photoId, { flagged = true; reviewed = false });
    #ok(())
  };

  public shared(msg) func reviewPhoto(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    Map.add(photoReviews, Text.compare, photoId, { flagged = true; reviewed = true });
    #ok(())
  };

  public query func getPhotoReviewState(photoId: Text) : async ?PhotoReviewState {
    Map.get(photoReviews, Text.compare, photoId)
  };

  // ─── Agent: Proposal Lifecycle ────────────────────────────────────────────────

  /// Submit a sealed proposal for an open bid request. Agent identity is
  /// resolved server-side from the agent canister — never trusted from the
  /// caller — so a bidder cannot spoof a display name.
  public shared(msg) func submitProposal(
    requestId:             Text,
    commissionBps:         Nat,
    suggestedListCents:    Nat,
    cmaSummary:            Text,
    marketingPlan:         Text,
    marketingCommitments:  [Text],
    estimatedDaysOnMarket: Nat,
    includedServices:      [Text],
    validUntil:            Int,
    coverLetter:           Text
  ) : async Result.Result<ListingProposal, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(agentCanisterId) == 0) return #err(#InvalidInput("Agent canister not configured — cannot verify licence"));
    let agentActor = actor(agentCanisterId) : actor {
      getProfile: query (Principal) -> async ?{
        name: Text; email: Text; brokerage: Text; isVerified: Bool;
        avgDaysOnMarket: Nat; listingsLast12Months: Nat;
      };
    };
    let profile = switch (await agentActor.getProfile(msg.caller)) {
      case null { return #err(#NotAuthorized) };
      case (?p) { p };
    };
    if (not profile.isVerified) return #err(#NotAuthorized);

    switch (Map.get(requests, Text.compare, requestId)) {
      case null    { #err(#NotFound) };
      case (?req) {
        if (req.status != #Open)          return #err(#InvalidInput("Request is not accepting proposals"));
        if (req.bidDeadline <= Time.now()) return #err(#DeadlinePassed);
        if (commissionBps == 0)           return #err(#InvalidInput("commissionBps must be greater than 0"));
        if (suggestedListCents == 0)      return #err(#InvalidInput("suggestedListCents must be greater than 0"));
        if (marketingCommitments.size() == 0) return #err(#InvalidInput("at least one marketing commitment is required"));

        let existing = proposalsFor(requestId);
        if (existing.size() >= MAX_PROPOSALS_PER_REQUEST) return #err(#SlotsFull);
        if (Option.isSome(Array.find<ListingProposal>(existing, func(p) { p.agentId == msg.caller })))
          return #err(#InvalidInput("You already have a proposal on this listing"));

        let comps = switch (Map.get(compsConfig, Text.compare, req.zipCode)) {
          case null { { medianCents = 0; saleCount = 0 } };
          case (?c) { c };
        };
        let overCompFlag = comps.medianCents > 0 and suggestedListCents * 100 > comps.medianCents * 104;
        let pctVsCompsBps : Int = if (comps.medianCents == 0) { 0 } else {
          ((Int.fromNat(suggestedListCents) - Int.fromNat(comps.medianCents)) * 10000) / Int.fromNat(comps.medianCents)
        };
        let derived : DerivedSignals = {
          estNetToSellerCents = suggestedListCents * (10000 - Nat.min(commissionBps, 10000)) / 10000;
          pctVsCompsBps; overCompFlag; thinCompsFlag = comps.saleCount < 8;
        };
        let agentRecord : AgentRecordSnapshot = {
          closedInZip = profile.listingsLast12Months; avgDom = profile.avgDaysOnMarket;
          saleToListRatioBps = 10000; withdrawnUnsold = 0; commitmentsUnmet = 0;
        };

        let id = nextProposalId();
        let letter = LETTERS[existing.size()];
        let proposal: ListingProposal = {
          id; requestId; agentId = msg.caller; agentName = profile.name;
          agentEmail = profile.email; agentBrokerage = profile.brokerage; letter;
          commissionBps; suggestedListCents; cmaSummary; marketingPlan;
          marketingCommitments; estimatedDaysOnMarket; includedServices; validUntil;
          coverLetter; status = #Pending; derived; agentRecord; createdAt = Time.now();
        };
        Map.add(proposals, Text.compare, id, proposal);
        #ok(proposal)
      };
    }
  };

  public shared(msg) func withdrawProposal(proposalId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(proposals, Text.compare, proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        if (p.agentId != msg.caller) return #err(#NotAuthorized);
        if (p.status != #Pending)    return #err(#InvalidInput("Only a sealed, pending bid can be withdrawn"));
        Map.add(proposals, Text.compare, proposalId, { p with status = #Withdrawn });
        #ok(())
      };
    }
  };

  /// Sealed until three bids are in or the window closes (invariant 02) — for
  /// the homeowner. Agents only ever see their own proposal (invariant 03),
  /// regardless of reveal state. Identity stays masked (letters, not names)
  /// until feePaid — invariant 04.
  public query(msg) func getProposalsForRequest(requestId: Text) : async [MaskedProposal] {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { [] };
      case (?req) {
        let all = proposalsFor(requestId);
        let admin = isAdmin(msg.caller);
        let isHomeowner = req.homeowner == msg.caller;
        let unmasked = req.feePaid; // identity release trigger — settled payment only

        if (admin) { return Iter.toArray(Iter.map<ListingProposal, MaskedProposal>(Iter.fromArray(all), func(p) { toMasked(p, msg.caller, unmasked) })) };

        if (isHomeowner) {
          let sealed = all.size() < SEAL_REVEAL_COUNT and Time.now() < req.bidDeadline;
          if (sealed) { return [] };
          return Iter.toArray(Iter.map<ListingProposal, MaskedProposal>(Iter.fromArray(all), func(p) { toMasked(p, msg.caller, unmasked) }));
        };

        // Any other caller (a bidding agent): only their own proposal, always.
        switch (Array.find<ListingProposal>(all, func(p) { p.agentId == msg.caller })) {
          case null    { [] };
          case (?mine) { [toMasked(mine, msg.caller, unmasked)] };
        }
      };
    }
  };

  /// Bid count only, no terms — lets the homeowner render "2 of 5 in" while
  /// still sealed (H2), without leaking anything invariant 02 protects.
  public query(msg) func getBidProgress(requestId: Text) : async Result.Result<{ count: Nat; sealed: Bool }, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        if (not isAdmin(msg.caller) and req.homeowner != msg.caller) return #err(#NotAuthorized);
        let count = proposalsFor(requestId).size();
        #ok({ count; sealed = count < SEAL_REVEAL_COUNT and Time.now() < req.bidDeadline })
      };
    }
  };

  public query(msg) func getMyProposals() : async [ListingProposal] {
    Iter.toArray(Iter.filter(Map.values(proposals), func(p: ListingProposal) : Bool { p.agentId == msg.caller }))
  };

  // ─── Homeowner: Selection & Payment-Gated Award ─────────────────────────────

  /// Select a winning proposal. Does NOT reveal identity or close the other
  /// bids — that only happens in markListingFeePaid, driven by a settled
  /// payment webhook. Returns the requestId/proposalId pair the caller passes
  /// on to the fee canister to start a Stripe Checkout session. If the charge
  /// never settles, nothing here changed and the auction stays fully live —
  /// invariant 04.
  public shared(msg) func acceptProposal(proposalId: Text) : async Result.Result<Text, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(feeCanisterId) == 0) return #err(#InvalidInput("Fee canister not configured"));
    switch (Map.get(proposals, Text.compare, proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        switch (Map.get(requests, Text.compare, p.requestId)) {
          case null { #err(#NotFound) };
          case (?req) {
            if (req.homeowner != msg.caller) return #err(#NotAuthorized);
            if (req.status != #Open)         return #err(#InvalidInput("Request is no longer open"));
            if (p.status != #Pending)        return #err(#InvalidInput("This bid is no longer sealed/pending"));

            type FeeError = { #NotFound; #NotAuthorized; #AlreadyExists; #InvalidInput: Text };
            let feeActor = actor(feeCanisterId) : actor {
              recordFeeOwed : (Text, Text, Principal, Principal, Nat) -> async Result.Result<{ id: Text }, FeeError>;
            };
            let result = await feeActor.recordFeeOwed(req.id, p.id, p.agentId, req.homeowner, platformFeeCents);
            switch (result) {
              case (#err(#NotFound))       { #err(#NotFound) };
              case (#err(#NotAuthorized))  { #err(#NotAuthorized) };
              case (#err(#AlreadyExists))  { #err(#InvalidInput("This listing has already been awarded")) };
              case (#err(#InvalidInput m)) { #err(#InvalidInput(m)) };
              case (#ok(fee))              { #ok(fee.id) };
            }
          };
        }
      };
    }
  };

  /// Called only from the settled Stripe webhook (via an admin-held identity,
  /// never a client). Reveals identity to both sides, closes the other bids,
  /// marks the request Awarded. Idempotent on webhook retry.
  public shared(msg) func markListingFeePaid(requestId: Text, proposalId: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        if (req.status == #Awarded and req.feePaid) return #ok(()); // idempotent retry
        switch (Map.get(proposals, Text.compare, proposalId)) {
          case null { #err(#NotFound) };
          case (?winner) {
            if (winner.requestId != requestId) return #err(#InvalidInput("proposal does not belong to this request"));
            Map.add(proposals, Text.compare, winner.id, { winner with status = #Accepted });
            for ((pid, p) in Map.entries(proposals)) {
              if (p.requestId == requestId and p.id != winner.id and p.status == #Pending) {
                Map.add(proposals, Text.compare, pid, { p with status = #Rejected });
              };
            };
            Map.add(requests, Text.compare, requestId, { req with status = #Awarded; feePaid = true });
            #ok(())
          };
        }
      };
    }
  };

  // ─── Anonymous message thread (H4) — scrub before persistence, always ──────

  private func canAccessThread(requestId: Text, caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { false };
      case (?req) { req.homeowner == caller };
    }
  };

  public shared(msg) func postMessage(proposalId: Text, rawBody: Text, authorRole: MessageRole) : async Result.Result<Message, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(rawBody) == 0) return #err(#InvalidInput("message cannot be empty"));
    if (Text.size(rawBody) > 2000) return #err(#InvalidInput("message exceeds 2000 characters"));
    switch (Map.get(proposals, Text.compare, proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        let authorized = switch (authorRole) {
          case (#agent)  { p.agentId == msg.caller };
          case (#seller) { canAccessThread(p.requestId, msg.caller) };
        };
        if (not authorized) return #err(#NotAuthorized);

        let (scrubbed, redactions) = scrubText(rawBody);
        let m: Message = {
          id = nextMessageId(); proposalId; authorRole; scrubbedBody = scrubbed;
          redactions; sentAt = Time.now();
        };
        let existing = switch (Map.get(threads, Text.compare, proposalId)) { case null { [] }; case (?ms) { ms } };
        Map.add(threads, Text.compare, proposalId, Array.concat(existing, [m]));
        #ok(m)
      };
    }
  };

  public query(msg) func getThread(proposalId: Text) : async Result.Result<[Message], Error> {
    switch (Map.get(proposals, Text.compare, proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        let authorized = isAdmin(msg.caller) or p.agentId == msg.caller or canAccessThread(p.requestId, msg.caller);
        if (not authorized) return #err(#NotAuthorized);
        #ok(switch (Map.get(threads, Text.compare, proposalId)) { case null { [] }; case (?ms) { ms } })
      };
    }
  };

  /// Redacts phone numbers, emails, street addresses and social handles from
  /// a raw message. Token-based heuristic (Motoko has no regex in mo:core):
  /// good enough to be a real server-side gate, not a claim of perfect NLP.
  /// Only the returned scrubbedBody is ever persisted — the raw text is
  /// never stored, matching the "server-side, before persistence" requirement.
  private func scrubText(raw: Text) : (Text, [Text]) {
    let suffixes : [Text] = ["st","street","ave","avenue","rd","road","blvd","boulevard",
      "dr","drive","ln","lane","ct","court","way","pl","place"];
    let tokens = Iter.toArray(Text.split(raw, #char ' '));
    var redactions : [Text] = [];
    var out : [Text] = [];
    var i = 0;
    let n = tokens.size();
    while (i < n) {
      let t = tokens[i];
      let lower = Text.toLower(t);
      var digitCount = 0;
      for (c in t.chars()) { if (c >= '0' and c <= '9') { digitCount += 1 } };

      if (Text.contains(t, #char '@') and Text.contains(t, #char '.')) {
        redactions := Array.concat(redactions, ["email"]);
        out := Array.concat(out, ["[redacted]"]);
        i += 1;
      } else if (Text.startsWith(t, #char '@')) {
        redactions := Array.concat(redactions, ["social-handle"]);
        out := Array.concat(out, ["[redacted]"]);
        i += 1;
      } else if (Text.contains(lower, #text "instagram.com") or Text.contains(lower, #text "facebook.com")
                 or Text.contains(lower, #text "twitter.com") or Text.contains(lower, #text "tiktok.com")) {
        redactions := Array.concat(redactions, ["social-handle"]);
        out := Array.concat(out, ["[redacted]"]);
        i += 1;
      } else if (digitCount >= 7) {
        redactions := Array.concat(redactions, ["phone"]);
        out := Array.concat(out, ["[redacted]"]);
        i += 1;
      } else if (digitCount >= 1 and digitCount == Text.size(t) and Text.size(t) <= 6 and i + 1 < n) {
        // Numeric token — look ahead up to 3 tokens for a street-suffix word.
        var j = i + 1;
        var found = false;
        let lookahead = Nat.min(i + 4, n);
        while (j < lookahead and not found) {
          let cand = Text.toLower(Text.trimEnd(Text.trimEnd(tokens[j], #char ','), #char '.'));
          if (Option.isSome(Array.find<Text>(suffixes, func(s) { s == cand }))) { found := true } else { j += 1 };
        };
        if (found) {
          redactions := Array.concat(redactions, ["address"]);
          out := Array.concat(out, ["[redacted]"]);
          i := j + 1;
        } else {
          out := Array.concat(out, [t]);
          i += 1;
        };
      } else {
        out := Array.concat(out, [t]);
        i += 1;
      };
    };
    (Text.join(Iter.fromArray(out), " "), redactions)
  };

  // ─── Comps & platform-fee configuration (admin) ─────────────────────────────

  public shared(msg) func setCompsMedian(zipCode: Text, medianCents: Nat, saleCount: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    Map.add(compsConfig, Text.compare, zipCode, { medianCents; saleCount });
    #ok(())
  };

  public query func getCompsMedian(zipCode: Text) : async ?CompsConfig {
    Map.get(compsConfig, Text.compare, zipCode)
  };

  public shared(msg) func setPlatformFeeCents(cents: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (cents == 0) return #err(#InvalidInput("platform fee must be positive"));
    platformFeeCents := cents;
    #ok(())
  };

  public query func getPlatformFee() : async Nat { platformFeeCents };

  // ─── Listing Photos (FSBO feature — unrelated to Bid to List, unchanged) ────

  public shared(msg) func addListingPhoto(propertyId: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(photoId) == 0)    return #err(#InvalidInput("photoId cannot be empty"));

    switch (Map.get(listingPhotoOwners, Text.compare, propertyId)) {
      case null    { Map.add(listingPhotoOwners, Text.compare, propertyId, msg.caller) };
      case (?owner) { if (owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized) };
    };

    let existing : [Text] = switch (Map.get(listingPhotos, Text.compare, propertyId)) { case null { [] }; case (?ids) { ids } };
    if (existing.size() >= MAX_LISTING_PHOTOS)
      return #err(#InvalidInput("Listing photo limit (" # Nat.toText(MAX_LISTING_PHOTOS) # ") reached"));
    if (Option.isSome(Array.find<Text>(existing, func(id) { id == photoId })))
      return #err(#InvalidInput("Photo already added to this listing"));

    Map.add(listingPhotos, Text.compare, propertyId, Array.concat(existing, [photoId]));
    #ok(())
  };

  public query func getListingPhotos(propertyId: Text) : async [Text] {
    switch (Map.get(listingPhotos, Text.compare, propertyId)) { case null { [] }; case (?ids) { ids } }
  };

  public shared(msg) func removeListingPhoto(propertyId: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(listingPhotoOwners, Text.compare, propertyId)) {
      case null     { return #err(#NotFound) };
      case (?owner) { if (owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized) };
    };
    let existing : [Text] = switch (Map.get(listingPhotos, Text.compare, propertyId)) { case null { return #err(#NotFound) }; case (?ids) { ids } };
    Map.add(listingPhotos, Text.compare, propertyId, Array.filter<Text>(existing, func(id) { id != photoId }));
    #ok(())
  };

  public shared(msg) func reorderListingPhotos(propertyId: Text, photoIds: [Text]) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(listingPhotoOwners, Text.compare, propertyId)) {
      case null     { return #err(#NotFound) };
      case (?owner) { if (owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized) };
    };
    let existing : [Text] = switch (Map.get(listingPhotos, Text.compare, propertyId)) { case null { return #err(#NotFound) }; case (?ids) { ids } };
    if (photoIds.size() != existing.size())
      return #err(#InvalidInput("Reorder list must contain the same number of photos"));
    for (id in photoIds.vals()) {
      if (not Option.isSome(Array.find<Text>(existing, func(e) { e == id })))
        return #err(#InvalidInput("Unknown photo ID in reorder list: " # id));
    };
    Map.add(listingPhotos, Text.compare, propertyId, photoIds);
    #ok(())
  };

  // ─── 360° Panoramas (FSBO feature — unrelated to Bid to List, unchanged) ────

  public shared(msg) func addPanorama(propertyId: Text, roomLabel: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(roomLabel)  == 0) return #err(#InvalidInput("roomLabel cannot be empty"));
    if (Text.size(photoId)    == 0) return #err(#InvalidInput("photoId cannot be empty"));

    switch (Map.get(listingPanoramaOwners, Text.compare, propertyId)) {
      case null    { Map.add(listingPanoramaOwners, Text.compare, propertyId, msg.caller) };
      case (?owner) { if (owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized) };
    };

    let existing : [PanoramaEntry] = switch (Map.get(listingPanoramas, Text.compare, propertyId)) { case null { [] }; case (?entries) { entries } };
    if (existing.size() >= MAX_LISTING_PANORAMAS)
      return #err(#InvalidInput("Panorama limit (" # Nat.toText(MAX_LISTING_PANORAMAS) # ") reached"));
    if (Option.isSome(Array.find<PanoramaEntry>(existing, func(e) { e.roomLabel == roomLabel })))
      return #err(#InvalidInput("Room label \"" # roomLabel # "\" already exists"));

    Map.add(listingPanoramas, Text.compare, propertyId, Array.concat(existing, [{ roomLabel; photoId }]));
    #ok(())
  };

  public query func getPanoramas(propertyId: Text) : async [PanoramaEntry] {
    switch (Map.get(listingPanoramas, Text.compare, propertyId)) { case null { [] }; case (?entries) { entries } }
  };

  public shared(msg) func removePanorama(propertyId: Text, roomLabel: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(listingPanoramaOwners, Text.compare, propertyId)) {
      case null     { return #err(#NotFound) };
      case (?owner) { if (owner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized) };
    };
    let existing : [PanoramaEntry] = switch (Map.get(listingPanoramas, Text.compare, propertyId)) { case null { return #err(#NotFound) }; case (?entries) { entries } };
    if (not Option.isSome(Array.find<PanoramaEntry>(existing, func(e) { e.roomLabel == roomLabel }))) return #err(#NotFound);
    Map.add(listingPanoramas, Text.compare, propertyId, Array.filter<PanoramaEntry>(existing, func(e) { e.roomLabel != roomLabel }));
    #ok(())
  };

  // ─── Public FSBO search index (unrelated to Bid to List, unchanged) ────────

  public shared(msg) func activateFsboListing(listing: PublicFsboListing) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(listing.propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (listing.listPriceCents == 0)        return #err(#InvalidInput("listPriceCents must be positive"));
    switch (listing.description) {
      case (?d) { if (Text.size(d) > 5000) return #err(#InvalidInput("description exceeds 5000 characters")) };
      case null {};
    };

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
    switch (await propActor.getPropertyOwner(listing.propertyId)) {
      case null    { return #err(#NotFound) };
      case (?owner) { if (owner != msg.caller) return #err(#NotAuthorized) };
    };
    switch (await propActor.getVerificationLevel(listing.propertyId)) {
      case null     {};
      case (?level) { resolvedVerificationLevel := level };
    };

    if (jobCanisterId != "") {
      let jobActor = actor(jobCanisterId) : actor {
        getCertificationData : query (Text) -> async { verifiedJobCount : Nat; verifiedKeySystems : [Text]; meetsStructural : Bool };
      };
      let certData = await jobActor.getCertificationData(listing.propertyId);
      resolvedVerifiedJobCount := certData.verifiedJobCount;
    };

    if (reportCanisterId != "") {
      let reportActor = actor(reportCanisterId) : actor { hasActivePublicShareLink : query (Text) -> async Bool };
      resolvedHasPublicReport := await reportActor.hasActivePublicShareLink(listing.propertyId);
    };

    var resolvedScore : ?Nat = null;
    if (marketCanisterId != "") {
      let marketActor = actor(marketCanisterId) : actor { computePropertyScore : (Text) -> async ?Nat };
      resolvedScore := await marketActor.computePropertyScore(listing.propertyId);
    };

    let stamped : PublicFsboListing = {
      listing with homeowner = msg.caller; activatedAt = Time.now();
      verificationLevel = resolvedVerificationLevel; score = resolvedScore;
      verifiedJobCount = resolvedVerifiedJobCount; hasPublicReport = resolvedHasPublicReport;
    };
    Map.add(fsboListings, Text.compare, listing.propertyId, stamped);
    #ok(())
  };

  public shared(msg) func deactivateFsboListing(propertyId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (Map.get(fsboListings, Text.compare, propertyId)) {
      case null { return #err(#NotFound) };
      case (?existing) {
        if (existing.homeowner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        ignore Map.remove(fsboListings, Text.compare, propertyId);
        #ok(())
      };
    }
  };

  public query func listActiveFsboListings() : async [PublicFsboListing] {
    Iter.toArray(Map.values(fsboListings))
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  public shared(msg) func setPropertyCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); propCanisterId := id; #ok(())
  };
  public shared(msg) func setJobCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); jobCanisterId := id; #ok(())
  };
  public shared(msg) func setReportCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); reportCanisterId := id; #ok(())
  };
  public shared(msg) func setMarketCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); marketCanisterId := id; #ok(())
  };
  public shared(msg) func setAgentCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); agentCanisterId := id; #ok(())
  };
  public shared(msg) func setFeeCanisterId(id: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); feeCanisterId := id; #ok(())
  };
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized); maxUpdatesPerMin := n; #ok(())
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) { adminListEntries := Array.concat(adminListEntries, [newAdmin]) };
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Array.filter<Principal>(adminListEntries, func(a) { a != target });
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) { case null { null }; case (?secs) { ?(Time.now() + secs * 1_000_000_000) } };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false; pauseExpiryNs := null;
    #ok(())
  };

  public query func metrics() : async Metrics {
    var open = 0;
    var awarded = 0;
    for (r in Map.values(requests)) {
      if (r.status == #Open)    { open    += 1 };
      if (r.status == #Awarded) { awarded += 1 };
    };
    { totalRequests = Map.size(requests); openRequests = open; awardedRequests = awarded; totalProposals = Map.size(proposals); isPaused }
  };
}
