/// Verified local costs: the rules that turn the finished jobs of homes whose
/// owners share them into an anonymous price range (job.getVerifiedLocalCosts).
/// Pure functions; the job canister supplies the jobs and the sharing records.

import Array "mo:core/Array";
import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

module {
  /// Fewest sharing homes an area needs before a range is shown.
  public let MIN_HOMES : Nat = 5;
  /// Fewest different contractors behind those homes' jobs, so one
  /// contractor's prices can't be read off the range.
  public let MIN_CONTRACTORS : Nat = 3;
  /// Jobs finished longer ago than this don't count (about 24 months).
  public let WINDOW_NS : Int = 63_072_000_000_000_000; // 730 days

  public type Stats = {
    low    : Nat;   // 25th percentile, cents, two significant figures
    median : Nat;   // cents, two significant figures
    high   : Nat;   // 75th percentile, cents, two significant figures
    homes  : Nat;   // sharing homes counted, rounded down to a multiple of 5
    area   : Text;  // the ZIP, or its first three digits ("328xx")
  };

  /// The five-digit ZIP at the start of `raw` (a ZIP or ZIP+4), or null.
  public func zip5(raw : Text) : ?Text {
    let t = raw.trim(#char ' ');
    let chars = t.chars().toArray();
    if (chars.size() < 5) return null;
    for (i in Nat.range(0, 5)) { if (not chars[i].isDigit()) return null };
    if (chars.size() > 5 and chars[5] != '-') return null;
    ?Text.fromIter(t.chars().take(5))
  };

  /// The ZIP at the end of a full address as property.getPropertyAddress
  /// writes it ("12 Elm St, Orlando, FL 32801" or "... FL 32801-1234").
  public func zipOfAddress(address : Text) : ?Text {
    var last = "";
    for (word in address.tokens(#char ' ')) { last := word };
    zip5(last)
  };

  /// "Trade|<first `digits` of the ZIP>", the key both area indexes use.
  public func areaKey(trade : Text, zip : Text, digits : Nat) : Text {
    trade # "|" # Text.fromIter(zip.chars().take(digits))
  };

  /// `cents` rounded to two significant figures of whole dollars
  /// ($12,345 → $12,000; $87.40 → $87).
  public func roundCents(cents : Nat) : Nat {
    let dollars = (cents + 50) / 100;
    var unit = 1;
    while (dollars >= unit * 100) { unit *= 10 };
    ((dollars + unit / 2) / unit) * unit * 100
  };

  /// The range for one area: `amounts` holds one price per sharing home and
  /// `contractors` how many different contractors did that work. Null when
  /// either is below its minimum.
  public func stats(amounts : [Nat], contractors : Nat, area : Text) : ?Stats {
    let n = amounts.size();
    if (n < MIN_HOMES or contractors < MIN_CONTRACTORS) return null;
    let sorted = amounts.sort();
    ?{
      low    = roundCents(sorted[n / 4]);
      median = roundCents(sorted[n / 2]);
      high   = roundCents(sorted[(n * 3) / 4]);
      homes  = n - n % 5;
      area;
    }
  };
};
