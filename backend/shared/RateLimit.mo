/// Per-caller fixed-window rate limit (cycle-drain protection).
///
/// Every canister that limits update calls keeps a `Limits` map from the
/// caller's principal text to (calls in this window, window start). The map
/// stays in the actor, so this module holds no state and moving the logic
/// here changes no stable type.
///
/// Entries whose window has closed are swept whenever the map grows by
/// SWEEP_EVERY new callers, so it no longer grows with every principal that
/// ever called.

import Iter "mo:core/Iter";
import Map  "mo:core/Map";
import Text "mo:core/Text";

module {
  public type Limits = Map.Map<Text, (Nat, Int)>;

  public let WINDOW_NS : Int = 60_000_000_000;  // one minute

  /// Map size at which closed windows are swept (checked on new keys only).
  public let SWEEP_EVERY : Nat = 256;

  /// Returns true and counts the call when `key` has made fewer than
  /// `maxPerWindow` calls in the current window. `maxPerWindow = 0` disables
  /// the limit. Callers that are exempt (admins, trusted canisters) should
  /// skip this call so they are not counted.
  public func tryConsume(limits : Limits, key : Text, now : Int, maxPerWindow : Nat) : Bool {
    switch (limits.get(key)) {
      case null {
        if (limits.size() > 0 and limits.size() % SWEEP_EVERY == 0) { sweep(limits, now) };
        limits.add(key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= WINDOW_NS) { limits.add(key, (1, now)); true }
        else if (maxPerWindow > 0 and count >= maxPerWindow) { false }
        else { limits.add(key, (count + 1, windowStart)); true }
      };
    }
  };

  /// Removes every entry whose window has closed.
  public func sweep(limits : Limits, now : Int) {
    let stale = limits.entries()
      .filterMap(func((k, (_, ws))) = if (now - ws >= WINDOW_NS) ?k else null)
      .toArray();
    for (k in stale.values()) { limits.remove(k) };
  };
};
