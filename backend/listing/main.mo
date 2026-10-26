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
import List      "mo:core/List";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Random    "mo:core/Random";
import Index     "../shared/Index";
import Notify    "../shared/Notify";
import Uuid      "../shared/Uuid";
import RateLimit "../shared/RateLimit";
import Admin "../shared/Admin";
import Canisters "../shared/Canisters";

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

  /// The seller's own FSBO state for a property, before and after it goes
  /// live: the asking price and description they set, and which setup step
  /// they're on (1 price, 2 report, 3 go live, 4 live). Seller-only.
  public type FsboDraft = {
    owner:          Principal;
    listPriceCents: Nat;
    description:    ?Text;
    step:           Nat;
    startedAt:      Time.Time;
    updatedAt:      Time.Time;
  };

  public type FsboPricePoint = { priceCents: Nat; recordedAt: Time.Time };

  public type ShowingStatus = { #Pending; #Accepted; #Declined; #AlternateProposed };

  /// A buyer's request to see a live FSBO listing. `contact` is the email or
  /// phone the buyer typed; the seller replies to them directly.
  public type ShowingRequest = {
    id:            Text;
    propertyId:    Text;
    requester:     Principal;
    name:          Text;
    contact:       Text;
    preferredTime: Text;
    createdAt:     Time.Time;
    status:        ShowingStatus;
    alternateTime: ?Text;
  };

  public type ShowingResponse = { #Accept; #Decline; #ProposeAlternate: Text };

  public type FsboOfferStatus = { #Active; #Countered; #Accepted; #Rejected };

  public type FsboCounter = {
    id:          Text;
    amountCents: Nat;
    notes:       Text;
    fromSeller:  Bool;
    createdAt:   Time.Time;
  };

  /// An offer the seller received and logged (buyers make offers outside the
  /// app, on paper or through their agent). Seller-only.
  public type FsboOffer = {
    id:                  Text;
    propertyId:          Text;
    buyerName:           Text;
    offerAmountCents:    Nat;
    earnestMoneyCents:   Nat;
    contingencies:       [Text];
    closeDate:           Time.Time;
    hasEscalationClause: Bool;
    status:              FsboOfferStatus;
    loggedAt:            Time.Time;
    counters:            [FsboCounter];
  };

  public type FsboOfferInput = {
    buyerName:           Text;
    offerAmountCents:    Nat;
    earnestMoneyCents:   Nat;
    contingencies:       [Text];
    closeDate:           Time.Time;
    hasEscalationClause: Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var bidCounter:      Nat = 0;
  private var proposalCounter: Nat = 0;
  private var messageCounter:  Nat = 0;
  private var isPaused:        Bool = false;
  private var pauseExpiryNs:   ?Int = null;
  private var adminListEntries: [Principal] = [];
  private var adminInitialized: Bool = false;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce: ?Text = null;
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

  // Secondary indexes over `requests` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let requestsByHomeowner = Index.empty();
  private transient let openBidRequests = Index.empty();
  private transient let requestsIndexes : [Index.Keyed<ListingBidRequest>] = Index.indexed(requests, [
    (requestsByHomeowner, func(r : ListingBidRequest) : ?Text { ?r.homeowner.toText() }),
    (openBidRequests, func(r : ListingBidRequest) : ?Text { if (r.status == #Open) ?"open" else null }),
  ]);
  private let proposals      = Map.empty<Text, ListingProposal>();

  // Secondary indexes over `proposals` (transient, rebuilt on every upgrade).
  // Writes go through Index.put / Index.delete so they stay in step.
  private transient let proposalsByRequest = Index.empty();
  private transient let proposalsByAgent = Index.empty();
  private transient let proposalsIndexes : [Index.Keyed<ListingProposal>] = Index.indexed(proposals, [
    (proposalsByRequest, func(r : ListingProposal) : ?Text { ?r.requestId }),
    (proposalsByAgent, func(r : ListingProposal) : ?Text { ?r.agentId.toText() }),
  ]);
  private let threads        = Map.empty<Text, [Message]>();   // proposalId -> messages
  private let compsConfig    = Map.empty<Text, CompsConfig>(); // zipCode -> comps
  private let photoReviews   = Map.empty<Text, PhotoReviewState>(); // photoId -> review state
  /// propertyId → active public FSBO listing (absent when not FSBO-active)
  private let fsboListings   = Map.empty<Text, PublicFsboListing>();
  /// propertyId → the seller's FSBO setup and asking price (see FsboDraft).
  private let fsboDrafts       = Map.empty<Text, FsboDraft>();
  /// propertyId → asking-price history, oldest first (at most MAX_PRICE_POINTS).
  private let fsboPriceHistory = Map.empty<Text, [FsboPricePoint]>();
  /// propertyId → buyers' showing requests, oldest first.
  private let fsboShowings     = Map.empty<Text, [ShowingRequest]>();
  /// propertyId → offers the seller logged, oldest first.
  private let fsboOffers       = Map.empty<Text, [FsboOffer]>();
  /// propertyId → (showing requests in the current day, day start).
  private let showingDayWindow = Map.empty<Text, (Nat, Int)>();

  /// Push/email outbox read by the notification relay (shared/Notify.mo):
  /// "showing_request" to the seller when a buyer asks to see the home.
  private let notifyLog       = Map.empty<Nat, Notify.Event>();
  private var notifyLatestSeq : Nat         = 0;
  private var notifierEntries : [Principal] = [];
  /// propertyId → ordered list of photo IDs (first = cover image)
  private let listingPhotos      = Map.empty<Text, [Text]>();
  /// propertyId → the principal who first added a photo (owner lock)
  private let listingPhotoOwners = Map.empty<Text, Principal>();
  /// propertyId → ordered list of 360° panorama entries (room label + photo ID)
  private let listingPanoramas      = Map.empty<Text, [PanoramaEntry]>();
  /// propertyId → the principal who first added a panorama (owner lock)
  private let listingPanoramaOwners = Map.empty<Text, Principal>();

  /// photoId → the propertyId whose listing first added it. Ties a photo's
  /// review state to one property so another owner can't clear its gate (M7).
  private let listingPhotoProperty  = Map.empty<Text, Text>();

  // ─── Input caps (M6) — keep every stored Text/array bounded so public feeds
  // can never be pushed past the reply-size limit. ──────────────────────────
  private transient let MAX_SHORT_TEXT     : Nat = 200;    // city, county, zip, names, labels
  private transient let MAX_ADDRESS_TEXT   : Nat = 300;
  private transient let MAX_EMAIL_TEXT     : Nat = 254;
  private transient let MAX_URL_TEXT       : Nat = 2048;
  private transient let MAX_LONG_TEXT      : Nat = 4000;   // cmaSummary, marketingPlan, coverLetter
  private transient let MAX_LIST_ENTRIES   : Nat = 20;
  private transient let MAX_ENTRY_TEXT     : Nat = 300;
  private transient let MAX_THREAD_MESSAGES : Nat = 200;
  /// Public feeds return at most this many records per call; page through the
  /// rest with the *Page variants.
  private transient let MAX_FEED_PAGE      : Nat = 200;

  private transient let MAX_LISTING_PHOTOS    : Nat = 15;
  private transient let MAX_LISTING_PANORAMAS : Nat = 10;
  private transient let MAX_PROPOSALS_PER_REQUEST : Nat = 5;   // "up to five agents" — invariant surface
  private transient let SEAL_REVEAL_COUNT : Nat = 3;           // invariant 02
  private transient let LETTERS : [Text] = ["A", "B", "C", "D", "E"];

  private transient let MAX_PRICE_POINTS          : Nat = 50;
  private transient let MAX_SHOWINGS_PER_PROPERTY : Nat = 100;
  private transient let MAX_SHOWINGS_PER_DAY      : Nat = 25;
  private transient let MAX_SHOWINGS_PER_BUYER    : Nat = 3;   // open requests per buyer per listing
  private transient let MAX_OFFERS_PER_PROPERTY   : Nat = 50;
  private transient let MAX_COUNTERS_PER_OFFER    : Nat = 20;
  private transient let FSBO_LIVE_STEP            : Nat = 4;
  private transient let DAY_NS                    : Int = 86_400_000_000_000;

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
  private var maxUpdatesPerMin : Nat = 30;

  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };

  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    RateLimit.tryConsume(updateCallLimits, caller.toText(), Time.now(), maxUpdatesPerMin)
  };

  private func isAdmin(caller: Principal) : Bool {
    Admin.contains(adminListEntries, caller)
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (caller.isAnonymous()) return #err(#NotAuthorized);
    if (Admin.pausedNow(isPaused, pauseExpiryNs, Time.now())) return #err(#InvalidInput("Canister is paused"));
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # maxUpdatesPerMin.toText() # " update calls per minute per principal."))
    };
    #ok(())
  };

  private func nextBidId() : Text { bidCounter += 1; "BID_" # bidCounter.toText() };
  private func nextProposalId() : Text { proposalCounter += 1; "PROP_" # proposalCounter.toText() };
  private func nextMessageId() : Text { messageCounter += 1; "MSG_" # messageCounter.toText() };

  private func windowDaysToNs(w: WindowDays) : Int {
    let days : Int = switch (w) { case (#Three) { 3 }; case (#Seven) { 7 }; case (#Fourteen) { 14 } };
    days * 86_400_000_000_000
  };

  private func proposalsFor(requestId: Text) : [ListingProposal] {
    Index.records(proposalsByRequest, requestId, proposals).toArray()
  };

  private func isWinningAgent(requestId: Text, caller: Principal) : Bool {
    Option.isSome(proposalsFor(requestId).find(func(p) {
      p.agentId == caller and p.status == #Accepted
    }))
  };

  /// M5: coarse buckets for the agent-record snapshot shown while identity is
  /// masked, so a homeowner can't match exact (closedInZip, avgDom) pairs
  /// against public agent stats to re-identify the bidder.
  private func bucketCount(n: Nat) : Nat {
    if (n == 0) 0 else if (n < 5) 1 else if (n < 10) 5 else if (n < 25) 10 else if (n < 50) 25 else 50
  };
  private func bucketDays(n: Nat) : Nat { (n / 15) * 15 };

  private func scrubbed(t: Text) : Text { scrubText(t).0 };

  private func toMasked(p: ListingProposal, caller: Principal, unmasked: Bool) : MaskedProposal {
    let mine = p.agentId == caller;
    let reveal = unmasked or mine;
    // M5: free text is scrubbed of contact details until identity release
    // (also scrubbed at submit; this covers proposals stored before that).
    {
      id = p.id; requestId = p.requestId; letter = p.letter;
      commissionBps = p.commissionBps; suggestedListCents = p.suggestedListCents;
      cmaSummary    = if (reveal) { p.cmaSummary } else { scrubbed(p.cmaSummary) };
      marketingPlan = if (reveal) { p.marketingPlan } else { scrubbed(p.marketingPlan) };
      marketingCommitments = if (reveal) { p.marketingCommitments }
        else { p.marketingCommitments.map(scrubbed) };
      estimatedDaysOnMarket = p.estimatedDaysOnMarket; status = p.status;
      derived = p.derived;
      agentRecord = if (reveal) { p.agentRecord } else {
        { p.agentRecord with closedInZip = bucketCount(p.agentRecord.closedInZip);
          avgDom = bucketDays(p.agentRecord.avgDom) }
      };
      isMine = mine;
      agentName      = if (reveal) { ?p.agentName } else { null };
      agentEmail     = if (reveal) { ?p.agentEmail } else { null };
      agentBrokerage = if (reveal) { ?p.agentBrokerage } else { null };
      createdAt = p.createdAt;
    }
  };

  private func tooLong(t: Text, max: Nat) : Bool { Text.size(t) > max };

  private func listTooBig(xs: [Text]) : Bool {
    if (xs.size() > MAX_LIST_ENTRIES) return true;
    for (x in xs.values()) { if (Text.size(x) > MAX_ENTRY_TEXT) return true };
    false
  };

  private func page<T>(it: Iter.Iter<T>, from: Nat, limit: Nat) : [T] {
    it.drop(from).take(Nat.min(limit, MAX_FEED_PAGE)).toArray()
  };

  /// Property-canister ownership: the property's registered owner only.
  /// Fails closed when the property canister isn't wired.
  private func isPropertyOwner(propertyId: Text, caller: Principal) : async Bool {
    if (Text.size(propCanisterId) == 0) return false;
    let propActor = Canisters.property(propCanisterId);
    switch (await propActor.getPropertyOwner(propertyId)) {
      case null    { false };
      case (?owner) { owner == caller };
    }
  };

  /// Owner or write-capable manager (co-owner / manager) of a property.
  /// Fails closed when the property canister isn't wired.
  private func canManageProperty(propertyId: Text, caller: Principal) : async Bool {
    if (Text.size(propCanisterId) == 0) return false;
    let propActor = Canisters.property(propCanisterId);
    await propActor.isAuthorized(propertyId, caller, true)
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
    // M6: bound every stored field so the public feed stays under reply limits.
    if (tooLong(propertyId, MAX_SHORT_TEXT))   return #err(#InvalidInput("propertyId too long"));
    if (tooLong(address, MAX_ADDRESS_TEXT))    return #err(#InvalidInput("address too long"));
    if (tooLong(city, MAX_SHORT_TEXT))         return #err(#InvalidInput("city too long"));
    if (tooLong(county, MAX_SHORT_TEXT))       return #err(#InvalidInput("county too long"));
    if (tooLong(zipCode, 20))                  return #err(#InvalidInput("zipCode too long"));
    if (tooLong(homeownerEmail, MAX_EMAIL_TEXT)) return #err(#InvalidInput("homeownerEmail too long"));

    // M6: only the property's owner may put it up for Bid to List — no fake
    // listings for homes the caller doesn't own. Fails closed when unwired.
    if (not (await isPropertyOwner(propertyId, msg.caller))) return #err(#NotAuthorized);

    let id = nextBidId();
    let (scrubbedNotes, _) = scrubText(notes);
    let req: ListingBidRequest = {
      id; propertyId; homeowner = msg.caller; address; city; county; zipCode;
      homeownerEmail; beds; baths; sqft; targetListDate; desiredSalePrice;
      notes = scrubbedNotes; windowDays; bidDeadline = Time.now() + windowDaysToNs(windowDays);
      status = #Open; feePaid = false; createdAt = Time.now();
    };
    Index.put(requests, requestsIndexes, id, req);
    #ok(req)
  };

  public query(msg) func getMyBidRequests() : async [ListingBidRequest] {
    Index.records(requestsByHomeowner, msg.caller.toText(), requests).toArray()
  };

  /// Redacts address/homeownerEmail, and also propertyId and the homeowner
  /// principal (either one resolves to the address via the property canister —
  /// L-1/H1), for anyone but the homeowner, an admin, or (post-payment) the
  /// winning agent — invariant 01. The redacted homeowner is the anonymous
  /// principal.
  public query(msg) func getBidRequest(id: Text) : async Result.Result<ListingBidRequest, Error> {
    switch (requests.get(id)) {
      case null { #err(#NotFound) };
      case (?r) {
        let privileged = isAdmin(msg.caller) or r.homeowner == msg.caller
          or (r.feePaid and isWinningAgent(r.id, msg.caller));
        if (privileged) { #ok(r) } else {
          #ok({ r with address = ""; homeownerEmail = ""; propertyId = ""; homeowner = Principal.anonymous() })
        };
      };
    }
  };

  public shared(msg) func cancelBidRequest(id: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (requests.get(id)) {
      case null    { #err(#NotFound) };
      case (?req) {
        if (req.homeowner != msg.caller) return #err(#NotAuthorized);
        if (req.status == #Cancelled)    return #err(#AlreadyCancelled);
        if (req.status != #Open)         return #err(#InvalidInput("Request is not open"));
        Index.put(requests, requestsIndexes, id, { req with status = #Cancelled });
        #ok(())
      };
    }
  };

  /// Masked opportunity feed for the agent browse screen (A2). Open-slot count
  /// is the only cross-agent signal permitted — invariant 03.
  private func toSummary(r: ListingBidRequest) : BidRequestSummary {
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
  };

  /// M6: capped at MAX_FEED_PAGE entries; use getOpenBidRequestsPage for the rest.
  public query func getOpenBidRequests() : async [BidRequestSummary] {
    page(Index.records(openBidRequests, "open", requests).map(toSummary), 0, MAX_FEED_PAGE)
  };

  public query func getOpenBidRequestsPage(from: Nat, limit: Nat) : async [BidRequestSummary] {
    page(Index.records(openBidRequests, "open", requests).map(toSummary), from, limit)
  };

  // ─── Homeowner: Photo review (H1 flagged-tile gate) ─────────────────────────
  // v1 stub: real house-number/street-sign/mail detection is a stated ML/data
  // dependency, not built here. flagPhotoForReview stands in for that scan —
  // wire a real vision pipeline to call it later without changing this surface.

  /// The property whose listing holds this photo (M7). Falls back to a scan
  /// for photos added before listingPhotoProperty existed.
  private func photoPropertyOf(photoId: Text) : ?Text {
    switch (listingPhotoProperty.get(photoId)) {
      case (?pid) { return ?pid };
      case null {};
    };
    for ((pid, ids) in listingPhotos.entries()) {
      if (Option.isSome(ids.find(func(id) { id == photoId }))) return ?pid;
    };
    for ((pid, entries) in listingPanoramas.entries()) {
      if (Option.isSome(entries.find(func(e) { e.photoId == photoId }))) return ?pid;
    };
    null
  };

  /// M7: review-state changes are limited to admins and the owner/manager of
  /// the property whose listing holds the photo.
  private func canChangePhotoReview(photoId: Text, caller: Principal) : async Bool {
    if (isAdmin(caller)) return true;
    switch (photoPropertyOf(photoId)) {
      case null    { false };
      case (?pid)  { await canManageProperty(pid, caller) };
    }
  };

  public shared(msg) func flagPhotoForReview(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not (await canChangePhotoReview(photoId, msg.caller))) return #err(#NotAuthorized);
    photoReviews.add(photoId, { flagged = true; reviewed = false });
    #ok(())
  };

  public shared(msg) func reviewPhoto(photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not (await canChangePhotoReview(photoId, msg.caller))) return #err(#NotAuthorized);
    photoReviews.add(photoId, { flagged = true; reviewed = true });
    #ok(())
  };

  public query func getPhotoReviewState(photoId: Text) : async ?PhotoReviewState {
    photoReviews.get(photoId)
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

    // M6: bound proposal free text.
    if (tooLong(cmaSummary, MAX_LONG_TEXT))    return #err(#InvalidInput("cmaSummary too long"));
    if (tooLong(marketingPlan, MAX_LONG_TEXT)) return #err(#InvalidInput("marketingPlan too long"));
    if (tooLong(coverLetter, MAX_LONG_TEXT))   return #err(#InvalidInput("coverLetter too long"));
    if (listTooBig(marketingCommitments))      return #err(#InvalidInput("too many or too long marketingCommitments"));
    if (listTooBig(includedServices))          return #err(#InvalidInput("too many or too long includedServices"));

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

    switch (requests.get(requestId)) {
      case null    { #err(#NotFound) };
      case (?req) {
        if (req.status != #Open)          return #err(#InvalidInput("Request is not accepting proposals"));
        if (req.bidDeadline <= Time.now()) return #err(#DeadlinePassed);
        if (commissionBps == 0)           return #err(#InvalidInput("commissionBps must be greater than 0"));
        if (suggestedListCents == 0)      return #err(#InvalidInput("suggestedListCents must be greater than 0"));
        if (marketingCommitments.size() == 0) return #err(#InvalidInput("at least one marketing commitment is required"));

        let existing = proposalsFor(requestId);
        if (existing.size() >= MAX_PROPOSALS_PER_REQUEST) return #err(#SlotsFull);
        if (Option.isSome(existing.find(func(p) { p.agentId == msg.caller })))
          return #err(#InvalidInput("You already have a proposal on this listing"));

        let comps = switch (compsConfig.get(req.zipCode)) {
          case null { { medianCents = 0; saleCount = 0 } };
          case (?c) { c };
        };
        let overCompFlag = comps.medianCents > 0 and suggestedListCents * 100 > comps.medianCents * 104;
        let pctVsCompsBps : Int = if (comps.medianCents == 0) { 0 } else {
          ((suggestedListCents.toInt() - comps.medianCents.toInt()) * 10000) / comps.medianCents.toInt()
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
          commissionBps; suggestedListCents;
          // M5: scrub contact details (phones, emails, URLs, handles, street
          // addresses) from every free-text field before persistence.
          cmaSummary = scrubbed(cmaSummary); marketingPlan = scrubbed(marketingPlan);
          marketingCommitments = marketingCommitments.map(scrubbed);
          estimatedDaysOnMarket;
          includedServices = includedServices.map(scrubbed); validUntil;
          coverLetter = scrubbed(coverLetter); status = #Pending; derived; agentRecord; createdAt = Time.now();
        };
        Index.put(proposals, proposalsIndexes, id, proposal);
        #ok(proposal)
      };
    }
  };

  public shared(msg) func withdrawProposal(proposalId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (proposals.get(proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        if (p.agentId != msg.caller) return #err(#NotAuthorized);
        if (p.status != #Pending)    return #err(#InvalidInput("Only a sealed, pending bid can be withdrawn"));
        Index.put(proposals, proposalsIndexes, proposalId, { p with status = #Withdrawn });
        #ok(())
      };
    }
  };

  /// Sealed until three bids are in or the window closes (invariant 02) — for
  /// the homeowner. Agents only ever see their own proposal (invariant 03),
  /// regardless of reveal state. Identity stays masked (letters, not names)
  /// until feePaid — invariant 04.
  public query(msg) func getProposalsForRequest(requestId: Text) : async [MaskedProposal] {
    switch (requests.get(requestId)) {
      case null { [] };
      case (?req) {
        let all = proposalsFor(requestId);
        let admin = isAdmin(msg.caller);
        let isHomeowner = req.homeowner == msg.caller;
        let unmasked = req.feePaid; // identity release trigger — settled payment only

        if (admin) { return Array.values(all).map(func(p) { toMasked(p, msg.caller, unmasked) }).toArray() };

        if (isHomeowner) {
          let sealed = all.size() < SEAL_REVEAL_COUNT and Time.now() < req.bidDeadline;
          if (sealed) { return [] };
          return Array.values(all).map(func(p) { toMasked(p, msg.caller, unmasked) }).toArray();
        };

        // Any other caller (a bidding agent): only their own proposal, always.
        switch (all.find(func(p) { p.agentId == msg.caller })) {
          case null    { [] };
          case (?mine) { [toMasked(mine, msg.caller, unmasked)] };
        }
      };
    }
  };

  /// Bid count only, no terms — lets the homeowner render "2 of 5 in" while
  /// still sealed (H2), without leaking anything invariant 02 protects.
  public query(msg) func getBidProgress(requestId: Text) : async Result.Result<{ count: Nat; sealed: Bool }, Error> {
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        if (not isAdmin(msg.caller) and req.homeowner != msg.caller) return #err(#NotAuthorized);
        let count = proposalsFor(requestId).size();
        #ok({ count; sealed = count < SEAL_REVEAL_COUNT and Time.now() < req.bidDeadline })
      };
    }
  };

  public query(msg) func getMyProposals() : async [ListingProposal] {
    Index.records(proposalsByAgent, msg.caller.toText(), proposals).toArray()
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
    switch (proposals.get(proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        switch (requests.get(p.requestId)) {
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
  ///
  /// M13: the relay's (requestId, proposalId) is not trusted on its own. The
  /// fee canister's record for the request — written only by acceptProposal,
  /// i.e. the homeowner's latest selection — must be #Paid for exactly this
  /// proposal, and the request/proposal must still be open/pending.
  public shared(msg) func markListingFeePaid(requestId: Text, proposalId: Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (requests.get(requestId)) {
      case null { return #err(#NotFound) };
      case (?req) {
        if (req.status == #Awarded and req.feePaid) {
          // Idempotent retry — only for the proposal that actually won.
          return if (isProposalAccepted(requestId, proposalId)) #ok(()) else #err(#InvalidInput("request already awarded to another proposal"));
        };
      };
    };
    if (Text.size(feeCanisterId) == 0) return #err(#InvalidInput("Fee canister not configured"));
    type FeeRec = {
      id: Text; requestId: Text; proposalId: Text; agentId: Principal; homeownerId: Principal;
      amountCents: Nat; status: { #Owed; #Invoiced; #Paid; #Waived }; createdAt: Int; updatedAt: Int;
    };
    let feeActor = actor(feeCanisterId) : actor { getFeeForRequest : query (Text) -> async ?FeeRec };
    let fee = switch (await feeActor.getFeeForRequest(requestId)) {
      case null { return #err(#InvalidInput("no fee record for this request")) };
      case (?f) { f };
    };
    if (fee.requestId != requestId or fee.proposalId != proposalId)
      return #err(#InvalidInput("proposal is not the homeowner's selected bid"));
    if (fee.status != #Paid) return #err(#InvalidInput("platform fee has not settled"));

    // Re-read after the await (TOCTOU): the request may have been cancelled or
    // awarded, or the proposal withdrawn, while we waited on the fee canister.
    switch (requests.get(requestId)) {
      case null { #err(#NotFound) };
      case (?req) {
        if (req.status == #Awarded and req.feePaid) {
          return if (isProposalAccepted(requestId, proposalId)) #ok(()) else #err(#InvalidInput("request already awarded to another proposal"));
        };
        if (req.status != #Open) return #err(#InvalidInput("Request is no longer open"));
        switch (proposals.get(proposalId)) {
          case null { #err(#NotFound) };
          case (?winner) {
            if (winner.requestId != requestId) return #err(#InvalidInput("proposal does not belong to this request"));
            if (winner.agentId != fee.agentId) return #err(#InvalidInput("fee was paid for a different agent"));
            if (winner.status != #Pending) return #err(#InvalidInput("proposal is no longer pending"));
            Index.put(proposals, proposalsIndexes, winner.id, { winner with status = #Accepted });
            for (p in proposalsFor(requestId).values()) {
              if (p.id != winner.id and p.status == #Pending) {
                Index.put(proposals, proposalsIndexes, p.id, { p with status = #Rejected });
              };
            };
            Index.put(requests, requestsIndexes, requestId, { req with status = #Awarded; feePaid = true });
            #ok(())
          };
        }
      };
    }
  };

  private func isProposalAccepted(requestId: Text, proposalId: Text) : Bool {
    switch (proposals.get(proposalId)) {
      case (?p) { p.requestId == requestId and p.status == #Accepted };
      case null { false };
    }
  };

  /// M4: what the agent canister needs to accept a review — the awarded,
  /// fee-paid proposal behind a transactionId (= proposalId). Admins and the
  /// wired agent canister only; everyone else gets null.
  public query(msg) func getReviewEligibility(proposalId: Text) : async ?{
    agentId: Principal; homeowner: Principal; awarded: Bool;
  } {
    if (not isAdmin(msg.caller) and msg.caller.toText() != agentCanisterId) return null;
    switch (proposals.get(proposalId)) {
      case null { null };
      case (?p) {
        switch (requests.get(p.requestId)) {
          case null { null };
          case (?req) {
            ?{ agentId = p.agentId; homeowner = req.homeowner;
               awarded = p.status == #Accepted and req.feePaid and req.status == #Awarded }
          };
        }
      };
    }
  };

  // ─── Anonymous message thread (H4) — scrub before persistence, always ──────

  private func canAccessThread(requestId: Text, caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    switch (requests.get(requestId)) {
      case null { false };
      case (?req) { req.homeowner == caller };
    }
  };

  public shared(msg) func postMessage(proposalId: Text, rawBody: Text, authorRole: MessageRole) : async Result.Result<Message, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(rawBody) == 0) return #err(#InvalidInput("message cannot be empty"));
    if (Text.size(rawBody) > 2000) return #err(#InvalidInput("message exceeds 2000 characters"));
    switch (proposals.get(proposalId)) {
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
        let existing = switch (threads.get(proposalId)) { case null { [] }; case (?ms) { ms } };
        if (existing.size() >= MAX_THREAD_MESSAGES) return #err(#InvalidInput("thread message limit reached"));
        threads.add(proposalId, existing.concat([m]));
        #ok(m)
      };
    }
  };

  public query(msg) func getThread(proposalId: Text) : async Result.Result<[Message], Error> {
    switch (proposals.get(proposalId)) {
      case null { #err(#NotFound) };
      case (?p) {
        let authorized = isAdmin(msg.caller) or p.agentId == msg.caller or canAccessThread(p.requestId, msg.caller);
        if (not authorized) return #err(#NotAuthorized);
        #ok(switch (threads.get(proposalId)) { case null { [] }; case (?ms) { ms } })
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
    let tlds : [Text] = [".com",".net",".org",".io",".co",".us",".biz",".info",".me",
      ".realty",".realtor",".homes",".house",".properties",".app",".site"];
    let tokens = raw.split(#char ' ').toArray();
    let redactions = List.empty<Text>();
    let out = List.empty<Text>();
    let n = tokens.size();

    func digitsIn(t: Text) : Nat {
      var d = 0;
      for (c in t.chars()) { if (c >= '0' and c <= '9') { d += 1 } };
      d
    };
    // Token made only of digits and phone punctuation, with at least one digit.
    func phoneish(t: Text) : Bool {
      if (Text.size(t) == 0) return false;
      for (c in t.chars()) {
        if (not ((c >= '0' and c <= '9') or c == '(' or c == ')' or c == '-' or c == '.' or c == '+' or c == ',')) return false;
      };
      digitsIn(t) > 0
    };
    func redact(kind: Text) { redactions.add(kind); out.add("[redacted]") };

    var i = 0;
    while (i < n) {
      let t = tokens[i];
      let lower = t.toLower();
      let trimmed = lower.trimEnd(#char ',').trimEnd(#char '.').trimEnd(#char ')');
      let digitCount = digitsIn(t);

      // Phone numbers split across tokens ("555 123 4567", "(555) 123-4567").
      var j = i;
      var runDigits = 0;
      while (j < n and phoneish(tokens[j])) { runDigits += digitsIn(tokens[j]); j += 1 };

      if (t.contains(#char '@') and t.contains(#char '.')) {
        redact("email"); i += 1;
      } else if (t.startsWith(#char '@')) {
        redact("social-handle"); i += 1;
      } else if (lower.contains(#text "instagram.com") or lower.contains(#text "facebook.com")
                 or lower.contains(#text "twitter.com") or lower.contains(#text "tiktok.com")) {
        redact("social-handle"); i += 1;
      } else if (lower.contains(#text "http://") or lower.contains(#text "https://")
                 or lower.startsWith(#text "www.")
                 or Option.isSome(tlds.find(func(d) { trimmed.endsWith(#text d) or trimmed.contains(#text (d # "/")) }))) {
        redact("url"); i += 1;
      } else if (digitCount >= 7) {
        redact("phone"); i += 1;
      } else if (j > i + 1 and runDigits >= 7) {
        redact("phone"); i := j;
      } else if (digitCount >= 1 and digitCount == Text.size(t) and Text.size(t) <= 6 and i + 1 < n) {
        // Numeric token — look ahead up to 3 tokens for a street-suffix word.
        var k = i + 1;
        var found = false;
        let lookahead = Nat.min(i + 4, n);
        while (k < lookahead and not found) {
          let cand = tokens[k].trimEnd(#char ',').trimEnd(#char '.').toLower();
          if (Option.isSome(suffixes.find(func(s) { s == cand }))) { found := true } else { k += 1 };
        };
        if (found) {
          redact("address");
          i := k + 1;
        } else {
          out.add(t);
          i += 1;
        };
      } else {
        out.add(t);
        i += 1;
      };
    };
    (out.values().join(" "), redactions.toArray())
  };

  // ─── Comps & platform-fee configuration (admin) ─────────────────────────────

  public shared(msg) func setCompsMedian(zipCode: Text, medianCents: Nat, saleCount: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    compsConfig.add(zipCode, { medianCents; saleCount });
    #ok(())
  };

  public query func getCompsMedian(zipCode: Text) : async ?CompsConfig {
    compsConfig.get(zipCode)
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
    if (tooLong(propertyId, MAX_SHORT_TEXT) or tooLong(photoId, MAX_SHORT_TEXT)) return #err(#InvalidInput("id too long"));

    // M7: authorise against the property canister (owner or write-capable
    // manager) instead of a first-come owner lock. State is read after the await.
    if (not isAdmin(msg.caller) and not (await canManageProperty(propertyId, msg.caller))) return #err(#NotAuthorized);
    // A photo belongs to one listing, so another property can't claim it and
    // clear its review gate.
    switch (photoPropertyOf(photoId)) {
      case (?pid) { if (pid != propertyId) return #err(#InvalidInput("Photo belongs to another listing")) };
      case null {};
    };
    if (Option.isNull(listingPhotoOwners.get(propertyId))) {
      listingPhotoOwners.add(propertyId, msg.caller);
    };

    let existing : [Text] = switch (listingPhotos.get(propertyId)) { case null { [] }; case (?ids) { ids } };
    if (existing.size() >= MAX_LISTING_PHOTOS)
      return #err(#InvalidInput("Listing photo limit (" # MAX_LISTING_PHOTOS.toText() # ") reached"));
    if (Option.isSome(existing.find(func(id) { id == photoId })))
      return #err(#InvalidInput("Photo already added to this listing"));

    listingPhotos.add(propertyId, existing.concat([photoId]));
    listingPhotoProperty.add(photoId, propertyId);
    #ok(())
  };

  public query func getListingPhotos(propertyId: Text) : async [Text] {
    switch (listingPhotos.get(propertyId)) { case null { [] }; case (?ids) { ids } }
  };

  public shared(msg) func removeListingPhoto(propertyId: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isAdmin(msg.caller) and not (await canManageProperty(propertyId, msg.caller))) return #err(#NotAuthorized);
    let existing : [Text] = switch (listingPhotos.get(propertyId)) { case null { return #err(#NotFound) }; case (?ids) { ids } };
    listingPhotos.add(propertyId, existing.filter(func(id) { id != photoId }));
    #ok(())
  };

  public shared(msg) func reorderListingPhotos(propertyId: Text, photoIds: [Text]) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isAdmin(msg.caller) and not (await canManageProperty(propertyId, msg.caller))) return #err(#NotAuthorized);
    let existing : [Text] = switch (listingPhotos.get(propertyId)) { case null { return #err(#NotFound) }; case (?ids) { ids } };
    if (photoIds.size() != existing.size())
      return #err(#InvalidInput("Reorder list must contain the same number of photos"));
    for (id in photoIds.values()) {
      if (not Option.isSome(existing.find(func(e) { e == id })))
        return #err(#InvalidInput("Unknown photo ID in reorder list: " # id));
    };
    listingPhotos.add(propertyId, photoIds);
    #ok(())
  };

  // ─── 360° Panoramas (FSBO feature — unrelated to Bid to List, unchanged) ────

  public shared(msg) func addPanorama(propertyId: Text, roomLabel: Text, photoId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0) return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(roomLabel)  == 0) return #err(#InvalidInput("roomLabel cannot be empty"));
    if (Text.size(photoId)    == 0) return #err(#InvalidInput("photoId cannot be empty"));
    if (tooLong(propertyId, MAX_SHORT_TEXT) or tooLong(roomLabel, MAX_SHORT_TEXT) or tooLong(photoId, MAX_SHORT_TEXT))
      return #err(#InvalidInput("field too long"));

    // M7: property-canister ownership instead of a first-come owner lock.
    if (not isAdmin(msg.caller) and not (await canManageProperty(propertyId, msg.caller))) return #err(#NotAuthorized);
    switch (photoPropertyOf(photoId)) {
      case (?pid) { if (pid != propertyId) return #err(#InvalidInput("Photo belongs to another listing")) };
      case null {};
    };
    if (Option.isNull(listingPanoramaOwners.get(propertyId))) {
      listingPanoramaOwners.add(propertyId, msg.caller);
    };

    let existing : [PanoramaEntry] = switch (listingPanoramas.get(propertyId)) { case null { [] }; case (?entries) { entries } };
    if (existing.size() >= MAX_LISTING_PANORAMAS)
      return #err(#InvalidInput("Panorama limit (" # MAX_LISTING_PANORAMAS.toText() # ") reached"));
    if (Option.isSome(existing.find(func(e) { e.roomLabel == roomLabel })))
      return #err(#InvalidInput("Room label \"" # roomLabel # "\" already exists"));

    listingPanoramas.add(propertyId, existing.concat([{ roomLabel; photoId }]));
    listingPhotoProperty.add(photoId, propertyId);
    #ok(())
  };

  public query func getPanoramas(propertyId: Text) : async [PanoramaEntry] {
    switch (listingPanoramas.get(propertyId)) { case null { [] }; case (?entries) { entries } }
  };

  public shared(msg) func removePanorama(propertyId: Text, roomLabel: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isAdmin(msg.caller) and not (await canManageProperty(propertyId, msg.caller))) return #err(#NotAuthorized);
    let existing : [PanoramaEntry] = switch (listingPanoramas.get(propertyId)) { case null { return #err(#NotFound) }; case (?entries) { entries } };
    if (not Option.isSome(existing.find(func(e) { e.roomLabel == roomLabel }))) return #err(#NotFound);
    listingPanoramas.add(propertyId, existing.filter(func(e) { e.roomLabel != roomLabel }));
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
    // M6: bound every caller-supplied field of the public buyer-search record.
    if (tooLong(listing.propertyId, MAX_SHORT_TEXT) or tooLong(listing.address, MAX_ADDRESS_TEXT)
        or tooLong(listing.city, MAX_SHORT_TEXT) or tooLong(listing.state, MAX_SHORT_TEXT)
        or tooLong(listing.zipCode, 20) or tooLong(listing.propertyType, MAX_SHORT_TEXT)
        or tooLong(listing.verificationLevel, MAX_SHORT_TEXT))
      return #err(#InvalidInput("listing field too long"));
    switch (listing.photoUrl) {
      case (?u) { if (tooLong(u, MAX_URL_TEXT)) return #err(#InvalidInput("photoUrl too long")) };
      case null {};
    };
    if (listTooBig(listing.systemHighlights)) return #err(#InvalidInput("too many or too long systemHighlights"));

    var resolvedVerificationLevel : Text = "Unverified";
    var resolvedVerifiedJobCount  : Nat  = 0;
    var resolvedHasPublicReport   : Bool = false;

    if (Text.size(propCanisterId) == 0) {
      return #err(#InvalidInput("Property canister not configured — cannot verify ownership"));
    };
    let propActor = Canisters.property(propCanisterId);
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
    fsboListings.add(listing.propertyId, stamped);
    addPricePoint(listing.propertyId, listing.listPriceCents);
    let now = Time.now();
    fsboDrafts.add(listing.propertyId, {
      owner          = msg.caller;
      listPriceCents = listing.listPriceCents;
      description    = listing.description;
      step           = FSBO_LIVE_STEP;
      startedAt      = switch (fsboDrafts.get(listing.propertyId)) { case (?d) d.startedAt; case null now };
      updatedAt      = now;
    });
    #ok(())
  };

  public shared(msg) func deactivateFsboListing(propertyId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (fsboListings.get(propertyId)) {
      case null { return #err(#NotFound) };
      case (?existing) {
        if (existing.homeowner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        ignore fsboListings.remove(propertyId);
        clearFsboState(propertyId);
        #ok(())
      };
    }
  };

  /// M6: capped at MAX_FEED_PAGE entries; use listActiveFsboListingsPage for the rest.
  public query func listActiveFsboListings() : async [PublicFsboListing] {
    page(fsboListings.values(), 0, MAX_FEED_PAGE)
  };

  public query func listActiveFsboListingsPage(from: Nat, limit: Nat) : async [PublicFsboListing] {
    page(fsboListings.values(), from, limit)
  };

  /// One live listing, for its public page (/for-sale/:propertyId).
  public query func getFsboListing(propertyId: Text) : async ?PublicFsboListing {
    fsboListings.get(propertyId)
  };

  /// Asking-price history of a live listing, oldest first. Public, like the price.
  public query func getFsboPriceHistory(propertyId: Text) : async [FsboPricePoint] {
    if (fsboListings.get(propertyId) == null) return [];
    switch (fsboPriceHistory.get(propertyId)) { case null []; case (?h) h }
  };

  // ─── FSBO seller state ──────────────────────────────────────────────────────

  private func addPricePoint(propertyId: Text, priceCents: Nat) {
    let h = switch (fsboPriceHistory.get(propertyId)) { case null []; case (?h) h };
    let last = if (h.size() == 0) null else ?h[h.size() - 1].priceCents;
    if (last == ?priceCents) return;
    let next = h.concat([{ priceCents; recordedAt = Time.now() }]);
    fsboPriceHistory.add(propertyId, if (next.size() > MAX_PRICE_POINTS) next.sliceToArray(-MAX_PRICE_POINTS, next.size()) else next);
  };

  /// Everything FSBO keeps for a property besides the public listing: run when
  /// the listing comes down, so buyers' contact details don't outlive it.
  private func clearFsboState(propertyId: Text) {
    fsboDrafts.remove(propertyId);
    fsboPriceHistory.remove(propertyId);
    fsboShowings.remove(propertyId);
    fsboOffers.remove(propertyId);
    showingDayWindow.remove(propertyId);
  };

  /// The seller of a property's FSBO state: the draft's owner, or the live
  /// listing's homeowner. Queries use it (they can't ask the property canister).
  private func fsboSeller(propertyId: Text) : ?Principal {
    switch (fsboListings.get(propertyId)) {
      case (?l) ?l.homeowner;
      case null { switch (fsboDrafts.get(propertyId)) { case (?d) ?d.owner; case null null } };
    }
  };

  private func isFsboSeller(propertyId: Text, caller: Principal) : Bool {
    fsboSeller(propertyId) == ?caller
  };

  /// Start or continue FSBO setup: the asking price, optional description and
  /// the step the seller is on (1–3; going live is activateFsboListing).
  /// Property owner only.
  public shared(msg) func saveFsboDraft(propertyId: Text, listPriceCents: Nat, description: ?Text, step: Nat) : async Result.Result<FsboDraft, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Text.size(propertyId) == 0 or tooLong(propertyId, MAX_SHORT_TEXT)) return #err(#InvalidInput("invalid propertyId"));
    if (listPriceCents == 0) return #err(#InvalidInput("listPriceCents must be positive"));
    if (step < 1 or step > 3) return #err(#InvalidInput("step must be 1, 2 or 3"));
    switch (description) {
      case (?d) { if (Text.size(d) > 5000) return #err(#InvalidInput("description exceeds 5000 characters")) };
      case null {};
    };
    if (not isAdmin(msg.caller) and not (await isPropertyOwner(propertyId, msg.caller))) return #err(#NotAuthorized);
    if (fsboListings.get(propertyId) != null) return #err(#InvalidInput("This listing is already live; change the price with updateFsboPrice"));
    let now = Time.now();
    let draft : FsboDraft = {
      owner          = msg.caller;
      listPriceCents;
      description;
      step;
      startedAt      = switch (fsboDrafts.get(propertyId)) { case (?d) d.startedAt; case null now };
      updatedAt      = now;
    };
    fsboDrafts.add(propertyId, draft);
    #ok(draft)
  };

  /// The seller's FSBO state for a property (null when they haven't started). Seller only.
  public query(msg) func getFsboDraft(propertyId: Text) : async ?FsboDraft {
    if (not isFsboSeller(propertyId, msg.caller) and not isAdmin(msg.caller)) return null;
    fsboDrafts.get(propertyId)
  };

  /// Stop FSBO setup before going live (a live listing comes down with deactivateFsboListing).
  public shared(msg) func discardFsboDraft(propertyId: Text) : async Result.Result<(), Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isFsboSeller(propertyId, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (fsboListings.get(propertyId) != null) return #err(#InvalidInput("This listing is live; take it down instead"));
    clearFsboState(propertyId);
    #ok(())
  };

  /// Change a live listing's asking price; the change goes into its price history.
  public shared(msg) func updateFsboPrice(propertyId: Text, listPriceCents: Nat) : async Result.Result<PublicFsboListing, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (listPriceCents == 0) return #err(#InvalidInput("listPriceCents must be positive"));
    switch (fsboListings.get(propertyId)) {
      case null { #err(#NotFound) };
      case (?l) {
        if (l.homeowner != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        let updated = { l with listPriceCents };
        fsboListings.add(propertyId, updated);
        addPricePoint(propertyId, listPriceCents);
        switch (fsboDrafts.get(propertyId)) {
          case (?d) fsboDrafts.add(propertyId, { d with listPriceCents; updatedAt = Time.now() });
          case null {};
        };
        #ok(updated)
      };
    }
  };

  // ─── FSBO showings ───────────────────────────────────────────────────────────

  /// A buyer asks to see a live listing. Any signed-in caller (the public page
  /// signs with a per-browser key); the seller gets a "showing_request"
  /// notification and replies to the buyer at `contact`. Bounded per listing,
  /// per day and per buyer.
  public shared(msg) func requestShowing(propertyId: Text, name: Text, contact: Text, preferredTime: Text) : async Result.Result<ShowingRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    let listing = switch (fsboListings.get(propertyId)) { case null { return #err(#NotFound) }; case (?l) l };
    if (Text.size(name) == 0 or tooLong(name, MAX_SHORT_TEXT)) return #err(#InvalidInput("Enter your name (up to 200 characters)"));
    if (Text.size(contact) < 5 or tooLong(contact, MAX_EMAIL_TEXT)) return #err(#InvalidInput("Enter an email or phone number"));
    if (Text.size(preferredTime) == 0 or tooLong(preferredTime, MAX_SHORT_TEXT)) return #err(#InvalidInput("Enter a preferred time (up to 200 characters)"));
    if (msg.caller == listing.homeowner) return #err(#InvalidInput("You can't request a showing of your own listing"));

    let id = Uuid.fromBlob(await Random.blob());
    // State checks after the await.
    if (fsboListings.get(propertyId) == null) return #err(#NotFound);
    let existing = switch (fsboShowings.get(propertyId)) { case null []; case (?xs) xs };
    let open = existing.filter(func(r : ShowingRequest) : Bool { r.requester == msg.caller and r.status != #Declined });
    if (open.size() >= MAX_SHOWINGS_PER_BUYER) return #err(#InvalidInput("You already have requests open for this home"));
    let now = Time.now();
    let (count, dayStart) = switch (showingDayWindow.get(propertyId)) {
      case (?(n, start)) { if (now - start < DAY_NS) (n, start) else (0, now) };
      case null (0, now);
    };
    if (count >= MAX_SHOWINGS_PER_DAY) return #err(#InvalidInput("This home has had a lot of requests today; please try again tomorrow"));
    // Keep the newest MAX_SHOWINGS_PER_PROPERTY: drop the oldest answered ones first.
    var kept = existing;
    if (kept.size() >= MAX_SHOWINGS_PER_PROPERTY) {
      switch (kept.findIndex(func(r : ShowingRequest) : Bool { r.status != #Pending })) {
        case (?i) { kept := kept.sliceToArray(0, i).concat(kept.sliceToArray(i + 1, kept.size())) };
        case null { return #err(#InvalidInput("This home has too many pending requests right now")) };
      };
    };
    let req : ShowingRequest = {
      id; propertyId; requester = msg.caller; name; contact; preferredTime;
      createdAt = now; status = #Pending; alternateTime = null;
    };
    fsboShowings.add(propertyId, kept.concat([req]));
    showingDayWindow.add(propertyId, (count + 1, dayStart));
    notifyLatestSeq := Notify.record(notifyLog, notifyLatestSeq, "showing_request", ?listing.homeowner, propertyId, name);
    #ok(req)
  };

  /// Showing requests for the seller's listing, newest first. Seller only.
  public query(msg) func getShowingRequests(propertyId: Text) : async Result.Result<[ShowingRequest], Error> {
    if (not isFsboSeller(propertyId, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    let xs = switch (fsboShowings.get(propertyId)) { case null []; case (?xs) xs };
    #ok(xs.reverse())
  };

  /// The seller's answer to a request, for their own tracking: HomeGentic
  /// doesn't message the buyer, the seller replies at the buyer's contact.
  public shared(msg) func respondToShowing(propertyId: Text, requestId: Text, response: ShowingResponse) : async Result.Result<ShowingRequest, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isFsboSeller(propertyId, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (response) {
      case (#ProposeAlternate(t)) { if (Text.size(t) == 0 or tooLong(t, MAX_SHORT_TEXT)) return #err(#InvalidInput("Enter the alternate time (up to 200 characters)")) };
      case _ {};
    };
    let xs = switch (fsboShowings.get(propertyId)) { case null { return #err(#NotFound) }; case (?xs) xs };
    var found : ?ShowingRequest = null;
    let next = xs.map(func(r : ShowingRequest) : ShowingRequest {
      if (r.id != requestId) return r;
      let u : ShowingRequest = switch (response) {
        case (#Accept)              { { r with status = #Accepted; alternateTime = null } };
        case (#Decline)             { { r with status = #Declined; alternateTime = null } };
        case (#ProposeAlternate(t)) { { r with status = #AlternateProposed; alternateTime = ?t } };
      };
      found := ?u;
      u
    });
    switch (found) {
      case null { #err(#NotFound) };
      case (?u) { fsboShowings.add(propertyId, next); #ok(u) };
    }
  };

  // ─── FSBO offers (logged by the seller) ─────────────────────────────────────

  private func validOfferInput(o: FsboOfferInput) : ?Text {
    if (Text.size(o.buyerName) == 0 or tooLong(o.buyerName, MAX_SHORT_TEXT)) return ?"Enter the buyer's name";
    if (o.offerAmountCents == 0) return ?"Enter the offer amount";
    if (listTooBig(o.contingencies)) return ?"Too many contingencies";
    null
  };

  public shared(msg) func logFsboOffer(propertyId: Text, input: FsboOfferInput) : async Result.Result<FsboOffer, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (not isFsboSeller(propertyId, msg.caller)) return #err(#NotAuthorized);
    switch (validOfferInput(input)) { case (?m) return #err(#InvalidInput(m)); case null {} };
    let id = Uuid.fromBlob(await Random.blob());
    if (not isFsboSeller(propertyId, msg.caller)) return #err(#NotAuthorized);
    let xs = switch (fsboOffers.get(propertyId)) { case null []; case (?xs) xs };
    if (xs.size() >= MAX_OFFERS_PER_PROPERTY) return #err(#InvalidInput("Offer limit reached for this listing"));
    let offer : FsboOffer = {
      id; propertyId;
      buyerName           = input.buyerName;
      offerAmountCents    = input.offerAmountCents;
      earnestMoneyCents   = input.earnestMoneyCents;
      contingencies       = input.contingencies;
      closeDate           = input.closeDate;
      hasEscalationClause = input.hasEscalationClause;
      status              = #Active;
      loggedAt            = Time.now();
      counters            = [];
    };
    fsboOffers.add(propertyId, xs.concat([offer]));
    #ok(offer)
  };

  public query(msg) func getFsboOffers(propertyId: Text) : async Result.Result<[FsboOffer], Error> {
    if (not isFsboSeller(propertyId, msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(switch (fsboOffers.get(propertyId)) { case null []; case (?xs) xs })
  };

  private func updateOffer(caller: Principal, propertyId: Text, offerId: Text, f: FsboOffer -> Result.Result<FsboOffer, Error>) : Result.Result<FsboOffer, Error> {
    if (not isFsboSeller(propertyId, caller)) return #err(#NotAuthorized);
    let xs = switch (fsboOffers.get(propertyId)) { case null { return #err(#NotFound) }; case (?xs) xs };
    let current = switch (xs.find(func(o : FsboOffer) : Bool { o.id == offerId })) { case null { return #err(#NotFound) }; case (?o) o };
    if (current.status == #Accepted or current.status == #Rejected) return #err(#InvalidInput("This offer is closed"));
    switch (f(current)) {
      case (#err(e)) #err(e);
      case (#ok(u)) {
        fsboOffers.add(propertyId, xs.map(func(o : FsboOffer) : FsboOffer { if (o.id == offerId) u else o }));
        #ok(u)
      };
    }
  };

  /// Record a counter-offer in the thread (from the seller or the buyer).
  public shared(msg) func counterFsboOffer(propertyId: Text, offerId: Text, amountCents: Nat, notes: Text, fromSeller: Bool) : async Result.Result<FsboOffer, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (amountCents == 0) return #err(#InvalidInput("Enter the counter amount"));
    if (tooLong(notes, MAX_LONG_TEXT)) return #err(#InvalidInput("notes too long"));
    let id = Uuid.fromBlob(await Random.blob());
    updateOffer(msg.caller, propertyId, offerId, func(o) {
      if (o.counters.size() >= MAX_COUNTERS_PER_OFFER) return #err(#InvalidInput("Counter limit reached for this offer"));
      #ok({ o with status = #Countered; counters = o.counters.concat([{ id; amountCents; notes; fromSeller; createdAt = Time.now() }]) })
    })
  };

  /// Accept one offer: the home is under contract and every other open offer is rejected.
  public shared(msg) func acceptFsboOffer(propertyId: Text, offerId: Text) : async Result.Result<FsboOffer, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    switch (updateOffer(msg.caller, propertyId, offerId, func(o) { #ok({ o with status = #Accepted }) })) {
      case (#err(e)) #err(e);
      case (#ok(accepted)) {
        let xs = switch (fsboOffers.get(propertyId)) { case null []; case (?xs) xs };
        fsboOffers.add(propertyId, xs.map(func(o : FsboOffer) : FsboOffer {
          if (o.id != offerId and (o.status == #Active or o.status == #Countered)) { { o with status = #Rejected } } else o
        }));
        #ok(accepted)
      };
    }
  };

  public shared(msg) func rejectFsboOffer(propertyId: Text, offerId: Text) : async Result.Result<FsboOffer, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    updateOffer(msg.caller, propertyId, offerId, func(o) { #ok({ o with status = #Rejected }) })
  };

  // ─── Account Deletion ────────────────────────────────────────────────────────

  /// Removes a proposal, its index entries and its message thread.
  private func deleteProposal(proposalId: Text) {
    Index.delete(proposals, proposalsIndexes, proposalId);
    threads.remove(proposalId);
  };

  /// Account deletion: removes what this canister holds for the caller.
  /// Returns how many records were removed.
  ///
  ///   - Bid requests the caller made as homeowner, with all their proposals
  ///     and message threads — EXCEPT requests where an agent was selected:
  ///     #Awarded / feePaid, or a fee record exists in the fee canister
  ///     (acceptProposal). Those are financial records held with the fee
  ///     canister and are kept unchanged, proposals included.
  ///   - Proposals the caller made as an agent on requests still #Open whose
  ///     selected proposal (if any) isn't theirs. #Accepted or selected
  ///     proposals are kept for the same reason.
  ///   - The caller's public FSBO listings, and the listing photo / panorama
  ///     lists (plus their photo review state) whose owner lock is the caller.
  ///
  /// When the fee canister can't be reached for a request, that request (and
  /// the caller's proposals on it) is kept — fail closed. When no fee canister
  /// is wired, acceptProposal can't have recorded a fee, so only the local
  /// awarded/feePaid flags decide.
  public shared(msg) func deleteMyData() : async Result.Result<Nat, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (msg.caller.isAnonymous()) return #err(#NotAuthorized);
    let caller = msg.caller;

    func awardedLocally(r: ListingBidRequest) : Bool { r.status == #Awarded or r.feePaid };

    // 1. Candidates (read before any await).
    let myRequestIds = Index.records(requestsByHomeowner, caller.toText(), requests)
      .filter(func(r) { not awardedLocally(r) })
      .map(func(r) { r.id })
      .toArray();
    let myProposalIds = Index.records(proposalsByAgent, caller.toText(), proposals)
      .filter(func(p) {
        p.status != #Accepted and (switch (requests.get(p.requestId)) {
          case (?r) { r.status == #Open and not awardedLocally(r) };
          case null { true };   // orphan proposal: nothing to protect
        })
      })
      .map(func(p) { p.id })
      .toArray();

    // 2. Ask the fee canister which of those requests have a selection.
    //    requestId → ?proposalId selected (null = no fee record).
    let feeSelection = Map.empty<Text, ?Text>();
    let unknown = Map.empty<Text, Bool>();   // fee canister unreachable → keep
    if (Text.size(feeCanisterId) > 0) {
      let feeActor = actor(feeCanisterId) : actor {
        getFeeForRequest : query (Text) -> async ?{ proposalId: Text };
      };
      let reqIds = Map.empty<Text, Bool>();
      for (id in myRequestIds.values()) { reqIds.add(id, true) };
      for (pid in myProposalIds.values()) {
        switch (proposals.get(pid)) { case (?p) { reqIds.add(p.requestId, true) }; case null {} };
      };
      for (reqId in reqIds.keys()) {
        try {
          switch (await feeActor.getFeeForRequest(reqId)) {
            case null    { feeSelection.add(reqId, null) };
            case (?fee)  { feeSelection.add(reqId, ?fee.proposalId) };
          };
        } catch (_) { unknown.add(reqId, true) };
      };
    };
    func feeRecorded(reqId: Text) : Bool {
      Option.isSome(unknown.get(reqId)) or (switch (feeSelection.get(reqId)) { case (??_) true; case _ false })
    };
    func selectedProposal(reqId: Text) : ?Text {
      switch (feeSelection.get(reqId)) { case (??pid) ?pid; case _ null }
    };

    // 3. Delete, re-reading state after the awaits.
    var removed = 0;
    for (reqId in myRequestIds.values()) {
      switch (requests.get(reqId)) {
        case (?r) {
          if (r.homeowner == caller and not awardedLocally(r) and not feeRecorded(reqId)) {
            for (p in proposalsFor(reqId).values()) { deleteProposal(p.id); removed += 1 };
            Index.delete(requests, requestsIndexes, reqId);
            removed += 1;
          };
        };
        case null {};
      };
    };
    for (pid in myProposalIds.values()) {
      switch (proposals.get(pid)) {
        case (?p) {
          let deletable = p.agentId == caller and p.status != #Accepted and (switch (requests.get(p.requestId)) {
            case (?r) {
              r.status == #Open and not awardedLocally(r)
                and Option.isNull(unknown.get(p.requestId))
                and selectedProposal(p.requestId) != ?pid
            };
            case null { true };
          });
          if (deletable) { deleteProposal(pid); removed += 1 };
        };
        case null {};
      };
    };

    // 4. FSBO listing, listing photos and panoramas.
    let fsboIds = fsboListings.values()
      .filter(func(l) { l.homeowner == caller })
      .map(func(l) { l.propertyId })
      .toArray();
    for (pid in fsboIds.values()) { fsboListings.remove(pid); clearFsboState(pid); removed += 1 };
    // FSBO setups that never went live.
    let draftIds = fsboDrafts.entries()
      .filter(func((_, d)) { d.owner == caller })
      .map(func((pid, _)) { pid })
      .toArray();
    for (pid in draftIds.values()) { clearFsboState(pid); removed += 1 };
    // Showing requests the caller made as a buyer.
    let showingProps = fsboShowings.keys().toArray();
    for (pid in showingProps.values()) {
      switch (fsboShowings.get(pid)) {
        case (?xs) {
          let mine = xs.filter(func(r : ShowingRequest) : Bool { r.requester == caller });
          if (mine.size() > 0) {
            fsboShowings.add(pid, xs.filter(func(r : ShowingRequest) : Bool { r.requester != caller }));
            removed += mine.size();
          };
        };
        case null {};
      };
    };

    func dropPhoto(photoId: Text) {
      listingPhotoProperty.remove(photoId);
      photoReviews.remove(photoId);
    };
    let photoProps = listingPhotoOwners.entries()
      .filter(func((_, owner)) { owner == caller })
      .map(func((pid, _)) { pid })
      .toArray();
    for (pid in photoProps.values()) {
      switch (listingPhotos.get(pid)) {
        case (?ids) { for (id in ids.values()) { dropPhoto(id) }; listingPhotos.remove(pid); removed += 1 };
        case null {};
      };
      listingPhotoOwners.remove(pid);
    };
    let panoProps = listingPanoramaOwners.entries()
      .filter(func((_, owner)) { owner == caller })
      .map(func((pid, _)) { pid })
      .toArray();
    for (pid in panoProps.values()) {
      switch (listingPanoramas.get(pid)) {
        case (?entries) { for (e in entries.values()) { dropPhoto(e.photoId) }; listingPanoramas.remove(pid); removed += 1 };
        case null {};
      };
      listingPanoramaOwners.remove(pid);
    };

    #ok(removed)
  };

  // ─── Notification outbox ─────────────────────────────────────────────────────

  private func isNotifier(p: Principal) : Bool { Admin.contains(notifierEntries, p) };

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

  /// Outbox events with seq > afterSeq, oldest first (at most 200 per call).
  /// Notifiers and admins only.
  public query(msg) func getNotificationEvents(afterSeq: Nat, limit: Nat) : async Result.Result<Notify.Page, Error> {
    if (not isNotifier(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Notify.page(notifyLog, notifyLatestSeq, afterSeq, limit))
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
    adminListEntries := Admin.add(adminListEntries, newAdmin);
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    adminListEntries := Admin.remove(adminListEntries, target);
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := Admin.pauseExpiry(durationSeconds, Time.now());
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
    for (r in requests.values()) {
      if (r.status == #Open)    { open    += 1 };
      if (r.status == #Awarded) { awarded += 1 };
    };
    { totalRequests = requests.size(); openRequests = open; awardedRequests = awarded; totalProposals = proposals.size(); isPaused }
  };
}
