/// Notification outbox shared by the canisters that raise push-worthy events
/// (job, quote).
///
/// A canister records an event when something happens that a user should hear
/// about. The notification relay (agents/notifications) reads the outbox with
/// its own principal, which an admin allowlists with addNotifier(), and keeps
/// a cursor (the last seq it handled) so each event is sent once. Nothing
/// leaves the canister on its own: no HTTPS outcalls, no secrets on-chain.
///
/// The outbox keeps the newest MAX_EVENTS entries; older ones are pruned, so a
/// relay that is offline for long enough misses them rather than sending a
/// burst of stale pushes when it comes back.
import Iter "mo:core/Iter";
import Map  "mo:core/Map";
import Nat  "mo:core/Nat";
import Text "mo:core/Text";
import Time "mo:core/Time";

module {
  /// kind is Text rather than a variant so a new kind can be added without
  /// changing the Candid interface or the stable type.
  ///   "job_awaiting_signature" — recipient: the homeowner; refId: jobId
  ///   "job_awaiting_contractor_signature"
  ///                            — recipient: the linked contractor; refId: jobId
  ///   "bid_accepted"           — recipient: the contractor; refId: quoteId
  ///   "bid_declined"           — recipient: the contractor; refId: quoteId
  ///   "job_verified"           — recipient: the homeowner; refId: jobId
  ///   "sensor_alert"           — recipient: the homeowner; refId: the job a
  ///                              critical sensor reading opened
  ///   "quote_received"         — recipient: the homeowner; refId: quote requestId
  ///   "new_lead"               — recipient: null (the relay picks matching
  ///                              contractors); refId: quote requestId
  public type Event = {
    seq:       Nat;
    kind:      Text;
    recipient: ?Principal;
    refId:     Text;
    summary:   Text;   // short label shown in the push, e.g. the job title
    createdAt: Int;
  };

  public type Page = {
    events:    [Event];
    latestSeq: Nat;    // highest seq ever issued; lower than a relay's cursor ⇒ the canister was reinstalled
  };

  public let MAX_EVENTS : Nat = 1_000;
  public let MAX_PAGE   : Nat = 200;
  public let MAX_SUMMARY_CHARS : Nat = 120;

  /// Append an event and prune the oldest beyond MAX_EVENTS.
  /// Returns the seq to store as the canister's new latest seq.
  public func record(
    log:       Map.Map<Nat, Event>,
    latestSeq: Nat,
    kind:      Text,
    recipient: ?Principal,
    refId:     Text,
    summary:   Text,
  ) : Nat {
    let seq = latestSeq + 1;
    Map.add(log, Nat.compare, seq, {
      seq;
      kind;
      recipient;
      refId;
      summary   = truncate(summary);
      createdAt = Time.now();
    });
    while (Map.size(log) > MAX_EVENTS) {
      switch (Map.minEntry(log)) {
        case (?(oldest, _)) { Map.remove(log, Nat.compare, oldest) };
        case null {};
      };
    };
    seq
  };

  /// Events with seq > afterSeq, oldest first, at most min(limit, MAX_PAGE).
  public func page(log: Map.Map<Nat, Event>, latestSeq: Nat, afterSeq: Nat, limit: Nat) : Page {
    let cap = Nat.min(limit, MAX_PAGE);
    let events = Iter.toArray(
      Iter.map<(Nat, Event), Event>(
        Iter.take(Map.entriesFrom(log, Nat.compare, afterSeq + 1), cap),
        func((_, e)) { e },
      )
    );
    { events; latestSeq }
  };

  func truncate(t: Text) : Text {
    if (t.size() <= MAX_SUMMARY_CHARS) return t;
    var out = "";
    var n = 0;
    label chars for (c in t.chars()) {
      if (n + 1 >= MAX_SUMMARY_CHARS) break chars;
      out #= Text.fromChar(c);
      n += 1;
    };
    out # "…"
  };
}
