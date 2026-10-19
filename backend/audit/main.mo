import Blob      "mo:core/Blob";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";
import Admin "../shared/Admin";

/// Append-only privileged-action audit log.
///
/// Source canisters call `log()` as a best-effort fire-and-forget after each
/// admin operation.  Reads are restricted to admins.  No entry can be deleted
/// or modified once written.
persistent actor Audit {

  // ── Types ──────────────────────────────────────────────────────────────────

  public type AuditEntry = {
    id        : Nat;
    timestamp : Int;      // Time.now() — nanoseconds since epoch
    caller    : Principal; // msg.caller of the source canister call
    canister  : Text;      // source canister name ("auth", "payment", …)
    action    : Text;      // e.g. "AdminAdded", "CanisterPaused"
    subject   : ?Principal; // affected user / principal when applicable
    detail    : Text;      // free-form context string
  };

  type Error = {
    #NotAuthorized;
    #InvalidInput : Text;
  };

  // ── State (all vars implicitly stable via persistent actor) ───────────────

  /// Legacy array store: every write copied the whole array. Kept only for
  /// upgrade compatibility; postupgrade drains it into `auditLog`.
  private var entries          : [AuditEntry] = [];
  /// Entries keyed by id. Ids are consecutive, so the retained entries are
  /// always ids [first, nextId).
  private let auditLog         = Map.empty<Nat, AuditEntry>();
  private var nextId           : Nat          = 0;
  private var admins           : [Principal]  = [];
  private var adminInitialized : Bool         = false;
  /// H-20: Bootstrap nonce — must be set via setBootstrapNonce() before the
  /// first addAdmin() call. Consumed on first successful use.
  private var bootstrapNonce   : ?Text        = null;
  private var trustedCanisters : [Principal]  = [];
  /// L7: registry of source-canister names. log() records the name registered
  /// for msg.caller (never the caller-supplied one).
  private let trustedNames     = Map.empty<Principal, Text>();

  // ── Internal helpers ───────────────────────────────────────────────────────

  /// Keep the newest MAX_ENTRIES; drop the oldest beyond that.
  private transient let MAX_ENTRIES : Nat = 50_000;

  private func append(e : AuditEntry) {
    auditLog.add(e.id, e);
    while (auditLog.size() > MAX_ENTRIES) {
      switch (auditLog.minEntry()) {
        case (?(oldest, _)) { auditLog.remove(oldest) };
        case null {};
      };
    };
  };

  system func postupgrade() {
    for (e in entries.values()) { append(e) };
    entries := [];
  };

  private func isAdmin(p : Principal) : Bool {
    Admin.contains(admins, p)
  };

  private func isTrusted(p : Principal) : Bool {
    Admin.contains(trustedCanisters, p)
  };

  // L7: field caps and a per-writer hourly volume cap, so one writer can't
  // push the whole retained window out in a burst.
  private transient let MAX_NAME_LEN   : Nat = 64;
  private transient let MAX_ACTION_LEN : Nat = 100;
  private transient let MAX_DETAIL_LEN : Nat = 2_000;
  private transient let MAX_PER_WRITER_PER_HOUR : Nat = 1_000;
  private transient let ONE_HOUR_NS : Int = 3_600_000_000_000;
  private transient let writerCounts = Map.empty<Principal, (Nat, Int)>();

  private func tryConsumeWrite(p : Principal) : Bool {
    let now = Time.now();
    switch (writerCounts.get(p)) {
      case null { writerCounts.add(p, (1, now)); true };
      case (?(count, start)) {
        if (now - start >= ONE_HOUR_NS) { writerCounts.add(p, (1, now)); true }
        else if (count >= MAX_PER_WRITER_PER_HOUR) { false }
        else { writerCounts.add(p, (count + 1, start)); true }
      };
    }
  };

  private func truncate(t : Text, n : Nat) : Text {
    if (Text.size(t) <= n) return t;
    Text.fromIter(t.chars().take(n))
  };

  // ── Ingress inspection ─────────────────────────────────────────────────────
  /// Reject anonymous callers and zero-byte payloads before execution.
  /// Empty payload cannot be valid Candid for any method that takes a struct
  /// argument — these are probe / garbage calls that waste cycles.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    not caller.isAnonymous() and arg.size() > 0
  };

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /// H-20: Set the one-time bootstrap nonce before calling addAdmin() the first time.
  /// Ignored once adminInitialized = true, and can only be set once.
  public shared(msg) func setBootstrapNonce(nonce: Text) : async () {
    if (Admin.canSetNonce(msg.caller, adminInitialized, bootstrapNonce)) bootstrapNonce := ?nonce;
  };

  /// Add an admin. First call requires the bootstrap nonce; subsequent calls
  /// require an existing admin caller.
  public shared(msg) func addAdmin(newAdmin : Principal, nonce : Text) : async Result.Result<(), Error> {
    switch (Admin.authorizeAdd(adminInitialized, isAdmin(msg.caller), bootstrapNonce, nonce)) {
      case (#denied)    { return #err(#NotAuthorized) };
      case (#bootstrap) { bootstrapNonce := null };  // the nonce is single use
      case (#admin)     {};
    };
    admins := Admin.add(admins, newAdmin);
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Admin.remove(admins, target);
    #ok(())
  };

  /// Register a canister principal allowed to call `log()`.
  public shared(msg) func addTrustedCanister(canisterId : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisters := Admin.add(trustedCanisters, canisterId);
    #ok(())
  };

  /// L7: revoke a trusted writer (admin only).
  public shared(msg) func removeTrustedCanister(canisterId : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    trustedCanisters := Admin.remove(trustedCanisters, canisterId);
    trustedNames.remove(canisterId);
    #ok(())
  };

  /// L7: register the name recorded for a trusted canister's entries (admin only).
  public shared(msg) func setTrustedCanisterName(canisterId : Principal, name : Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isTrusted(canisterId)) return #err(#InvalidInput("not a trusted canister"));
    if (Text.size(name) == 0 or Text.size(name) > MAX_NAME_LEN) return #err(#InvalidInput("name must be 1-64 characters"));
    trustedNames.add(canisterId, name);
    #ok(())
  };

  // ── Write (append-only) ────────────────────────────────────────────────────

  /// Append a new audit entry.  Only registered trusted canisters and admins
  /// may write.  Returns the assigned entry id.
  public shared(msg) func log(
    canister : Text,
    action   : Text,
    subject  : ?Principal,
    detail   : Text,
  ) : async Result.Result<Nat, Error> {
    if (not isTrusted(msg.caller) and not isAdmin(msg.caller)) {
      return #err(#NotAuthorized);
    };
    if (Text.size(action) == 0) return #err(#InvalidInput("action required"));
    if (not tryConsumeWrite(msg.caller)) return #err(#InvalidInput("audit write rate exceeded"));
    // L7: the source name comes from the caller's registration, not the argument.
    // A trusted canister without a registered name is recorded by principal;
    // an admin writing directly is recorded as "admin:<claimed name>".
    let source : Text = if (isTrusted(msg.caller)) {
      switch (trustedNames.get(msg.caller)) {
        case (?n) n;
        case null msg.caller.toText();
      }
    } else {
      "admin:" # truncate(canister, MAX_NAME_LEN)
    };
    let entry : AuditEntry = {
      id        = nextId;
      timestamp = Time.now();
      caller    = msg.caller;
      canister  = source;
      action    = truncate(action, MAX_ACTION_LEN);
      subject;
      detail    = truncate(detail, MAX_DETAIL_LEN);
    };
    append(entry);
    nextId  := nextId + 1;
    #ok(entry.id)
  };

  // ── Queries (admin-only) ───────────────────────────────────────────────────

  /// Paginated read.  Returns up to `limit` entries starting at index `from`.
  public shared(msg) func getEntries(
    from  : Nat,
    limit : Nat,
  ) : async Result.Result<[AuditEntry], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    // `from` is a position among retained entries (0 = oldest), as before.
    let first = switch (auditLog.minEntry()) { case (?(id, _)) id; case null { return #ok([]) } };
    #ok(Iter.toArray(auditLog.entriesFrom(first + from).take(limit).map(
      func((_, e)) { e }
    )))
  };

  /// Filtered read by the source caller principal and action string.
  public shared(msg) func getEntriesByCallerAndAction(
    target : Principal,
    action : Text,
  ) : async Result.Result<[AuditEntry], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Iter.toArray(auditLog.values().filter(func(e) {
      e.caller == target and e.action == action
    })))
  };

  public query func metrics() : async { entryCount : Nat } {
    { entryCount = auditLog.size() }
  };
}
