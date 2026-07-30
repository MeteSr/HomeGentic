import Array     "mo:core/Array";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Time      "mo:core/Time";

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

  private var entries          : [AuditEntry] = [];
  private var nextId           : Nat          = 0;
  private var admins           : [Principal]  = [];
  private var adminInitialized : Bool         = false;
  private var trustedCanisters : [Principal]  = [];

  // ── Internal helpers ───────────────────────────────────────────────────────

  private func isAdmin(p : Principal) : Bool {
    Array.find<Principal>(admins, func(a) { a == p }) != null
  };

  private func isTrusted(p : Principal) : Bool {
    Array.find<Principal>(trustedCanisters, func(a) { a == p }) != null
  };

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /// Add an admin.  First call is open (bootstrap); subsequent calls require
  /// an existing admin caller.
  public shared(msg) func addAdmin(newAdmin : Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) {
      admins := Array.concat(admins, [newAdmin]);
    };
    adminInitialized := true;
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.filter<Principal>(admins, func(a) { a != target });
    #ok(())
  };

  /// Register a canister principal allowed to call `log()`.
  public shared(msg) func addTrustedCanister(canisterId : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isTrusted(canisterId)) {
      trustedCanisters := Array.concat(trustedCanisters, [canisterId]);
    };
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
    let entry : AuditEntry = {
      id        = nextId;
      timestamp = Time.now();
      caller    = msg.caller;
      canister;
      action;
      subject;
      detail;
    };
    // Cap at 50 000 entries — drop oldest when full to bound heap growth.
    let maxEntries = 50_000;
    entries := if (entries.size() >= maxEntries) {
      let start = entries.size() - maxEntries + 1;
      let tail = Array.tabulate<AuditEntry>(maxEntries - 1, func(i) { entries[start + i] });
      Array.concat(tail, [entry])
    } else {
      Array.concat(entries, [entry])
    };
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
    let total = entries.size();
    if (from >= total) return #ok([]);
    let bound = Nat.min(from + limit, total);
    #ok(Array.tabulate<AuditEntry>(bound - from, func(i) { entries[from + i] }))
  };

  /// Filtered read by the source caller principal and action string.
  public shared(msg) func getEntriesByCallerAndAction(
    target : Principal,
    action : Text,
  ) : async Result.Result<[AuditEntry], Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    #ok(Array.filter<AuditEntry>(entries, func(e) {
      e.caller == target and e.action == action
    }))
  };

  public query func metrics() : async { entryCount : Nat } {
    { entryCount = entries.size() }
  };
}
