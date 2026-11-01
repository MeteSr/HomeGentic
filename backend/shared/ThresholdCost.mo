/// Cycles to attach to threshold-key calls (vetKD and Schnorr).
///
/// The fee depends on the key's subnet (its node count): test_key_1 costs 10B
/// on mainnet, key_1 ~26.2B, and PocketIC's key subnet about the same as
/// key_1. An underpaid call is rejected, while the management canister
/// refunds whatever is attached above the fee, so every call attaches one
/// ceiling above all of them.
///
/// The exact price is available from the ic0.cost_vetkd_derive_key and
/// ic0.cost_sign_with_schnorr system calls, but a Wasm that imports them
/// can't even be installed on older replicas (dfx 0.24's, used by the bash
/// canister tests and the perf benchmark), so they aren't used here.
module {
  /// Above the most any of these calls costs today (mainnet key_1: 26_153_846_153).
  public let CEILING_CYCLES : Nat = 30_000_000_000;

  /// vetkd_derive_key on a BLS12-381 G2 key.
  public func vetkdDerive(_keyName : Text) : Nat { CEILING_CYCLES };

  /// sign_with_schnorr on an Ed25519 key.
  public func schnorrEd25519(_keyName : Text) : Nat { CEILING_CYCLES };

  // ── Budgets (cycle-drain audit CD-2/CD-3, 2026-10-31) ──────────────────────
  //
  // Per-caller caps don't bound spend, because principals are free. Every
  // canister that pays for threshold calls also keeps a canister-wide daily
  // budget and a cycles floor. Keep the budget in a `transient let`: a count
  // that resets on upgrade is fine (reviewing-motoko S2), and it changes no
  // stable type.

  /// Threshold calls made today (UTC day number, calls).
  public type DailyBudget = { var day : Int; var used : Nat };

  public func newBudget() : DailyBudget = { var day = 0; var used = 0 };

  let DAY_NS : Int = 86_400_000_000_000;

  /// Counts one call and returns true while today's count is under `max`.
  public func take(b : DailyBudget, now : Int, max : Nat) : Bool {
    let day = now / DAY_NS;
    if (day != b.day) { b.day := day; b.used := 0 };
    if (b.used >= max) return false;
    b.used += 1;
    true
  };

  /// True when the canister would still hold at least one more fee after
  /// attaching `fee` (as report.attest checks). Attaching more than the
  /// balance traps, and a canister drained to its freezing threshold stops
  /// answering everyone.
  public func affordable(balance : Nat, fee : Nat) : Bool { balance >= 2 * fee };
};
