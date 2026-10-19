/// Admin, bootstrap and pause logic shared by every canister.
///
/// Each canister keeps its own stable vars (admin list, bootstrap nonce, pause
/// flag) and its own Candid methods; these helpers hold only the rules, so
/// moving them here changes no stable type and no public interface.

import Array     "mo:core/Array";
import Principal "mo:core/Principal";

module {
  /// Whether `p` is in a principal allow-list (admins, trusted canisters, …).
  public func contains(list : [Principal], p : Principal) : Bool {
    list.contains(p)
  };

  /// `list` with `p` appended, unless it is already there.
  public func add(list : [Principal], p : Principal) : [Principal] {
    if (list.contains(p)) list else list.concat([p])
  };

  /// `list` without `p`.
  public func remove(list : [Principal], p : Principal) : [Principal] {
    list.filter(func a = a != p)
  };

  // ── Pause ──────────────────────────────────────────────────────────────────

  /// Whether a canister is paused at `now`. A timed pause (`expiry` set) lapses
  /// on its own once `now` reaches the expiry.
  public func pausedNow(isPaused : Bool, expiry : ?Int, now : Int) : Bool {
    if (not isPaused) return false;
    switch (expiry) {
      case (?e) { now < e };
      case null { true };
    }
  };

  /// Expiry for `pause(durationSeconds)`: null pauses until `unpause()`.
  public func pauseExpiry(durationSeconds : ?Nat, now : Int) : ?Int {
    switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(now + secs * 1_000_000_000) };
    }
  };

  // ── Bootstrap (H-20) ───────────────────────────────────────────────────────

  /// Whether `caller` may set the one-time bootstrap nonce: only a controller,
  /// only before the first admin exists, and only once.
  public func canSetNonce(caller : Principal, initialized : Bool, current : ?Text) : Bool {
    caller.isController() and not initialized and current == null
  };

  /// Whether `given` matches the stored nonce. An unset nonce matches nothing.
  public func nonceMatches(stored : ?Text, given : Text) : Bool {
    switch (stored) {
      case (?n) { n == given };
      case null { false };
    }
  };

  /// How a call to add an admin is authorised.
  public type Grant = {
    #admin;      // an existing admin added another
    #bootstrap;  // the first admin, by nonce; the caller must clear the nonce
    #denied;
  };

  /// Once bootstrapped, only an existing admin may add admins; before that, only
  /// a caller presenting the bootstrap nonce.
  public func authorizeAdd(initialized : Bool, callerIsAdmin : Bool, stored : ?Text, given : Text) : Grant {
    if (initialized) { if (callerIsAdmin) #admin else #denied }
    else if (nonceMatches(stored, given)) #bootstrap
    else #denied
  };
};
