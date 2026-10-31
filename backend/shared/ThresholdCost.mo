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
};
