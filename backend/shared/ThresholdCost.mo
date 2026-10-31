/// Cycles to attach to threshold-key calls, priced by the IC itself.
///
/// The fee depends on the key's subnet (its node count) and can change, so a
/// constant is only right on the subnet it was measured on: test_key_1 costs
/// 10B on mainnet but ~26B on a larger subnet, and an underpaid call is
/// rejected. The ic0.cost_* system calls give the exact price; the fallback is
/// used only when the IC doesn't know the key. Unused cycles are refunded.
import Prim "mo:⛔";

module {
  /// Mainnet key_1 price, the most any of these calls costs today.
  public let KEY_1_CYCLES : Nat = 26_153_846_153;

  func fallback(keyName : Text) : Nat {
    if (keyName == "key_1") KEY_1_CYCLES else 10_000_000_000
  };

  /// vetkd_derive_key on a BLS12-381 G2 key.
  public func vetkdDerive(keyName : Text) : Nat {
    let (code, cost) = Prim.costVetkdDeriveKey(keyName, 0);
    if (code == 0) cost else fallback(keyName)
  };

  /// sign_with_schnorr on an Ed25519 key.
  public func schnorrEd25519(keyName : Text) : Nat {
    let (code, cost) = Prim.costSignWithSchnorr(keyName, 1);
    if (code == 0) cost else fallback(keyName)
  };
};
