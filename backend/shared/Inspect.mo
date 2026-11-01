/// Shared `system func inspect` rule (cycle-drain audit CD-5, 2026-10-31).
///
/// The ingress fee (about 1.2M cycles plus 2K cycles per byte) is charged to
/// us as soon as a message is accepted, before the method's own checks run.
/// `inspect` itself costs us nothing, so it is where oversized junk is cheapest
/// to refuse: with no cap, a 2 MB argument sent to any method costs ~4.2B
/// cycles even when the method rejects it.
///
/// Every canister refuses anonymous callers, empty payloads and arguments over
/// MAX_ARG_BYTES. Methods that really take more (photo.uploadPhoto,
/// report.generateReport) are named in their canister's inspect with
/// MAX_UPLOAD_ARG_BYTES.
///
/// Not a security boundary: inspect runs on one replica and never for
/// inter-canister calls (canister-security skill), so every method keeps its
/// own checks. This only saves cycles.

import Blob "mo:core/Blob";
import Principal "mo:core/Principal";

module {
  /// Largest argument for ordinary methods (64 KiB). The biggest legitimate ones (a
  /// listing with every field full, a 5,000-character job description) are a
  /// few KB.
  public let MAX_ARG_BYTES : Nat = 65_536;

  /// Largest argument for the few methods that carry bytes or whole reports.
  /// 2 MiB, the IC's own ingress limit.
  public let MAX_UPLOAD_ARG_BYTES : Nat = 2_097_152;

  /// True when an ingress message should be accepted.
  public func accept(caller : Principal, arg : Blob, maxBytes : Nat) : Bool {
    not caller.isAnonymous() and arg.size() > 0 and arg.size() <= maxBytes
  };
};
