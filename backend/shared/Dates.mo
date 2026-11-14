/// Calendar arithmetic on `YYYY-MM-DD` text dates, for estimates such as a
/// recurring service's next visit. Pure; no time zone (dates are as entered).
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Iter "mo:core/Iter";

module {
  func isLeap(y : Nat) : Bool = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0;

  func daysIn(y : Nat, m : Nat) : Nat {
    switch m {
      case 2 { if (isLeap(y)) 29 else 28 };
      case (4 or 6 or 9 or 11) 30;
      case _ 31;
    }
  };

  func pad(n : Nat, width : Nat) : Text {
    var t = n.toText();
    while (t.size() < width) t := "0" # t;
    t
  };

  /// (year, month, day) of a valid `YYYY-MM-DD` date, else null.
  public func parse(date : Text) : ?(Nat, Nat, Nat) {
    if (date.size() != 10) return null;
    let parts = date.split(#char '-').toArray();
    if (parts.size() != 3) return null;
    let (?y, ?m, ?d) = (Nat.fromText(parts[0]), Nat.fromText(parts[1]), Nat.fromText(parts[2])) else return null;
    if (m < 1 or m > 12 or d < 1 or d > daysIn(y, m)) return null;
    ?(y, m, d)
  };

  public func format(y : Nat, m : Nat, d : Nat) : Text = pad(y, 4) # "-" # pad(m, 2) # "-" # pad(d, 2);

  /// `date` plus `n` calendar months; a day the target month doesn't have
  /// becomes its last day (Jan 31 + 1 month = Feb 28 or 29). Null for a
  /// malformed date.
  public func addMonths(date : Text, n : Nat) : ?Text {
    let ?(y, m, d) = parse(date) else return null;
    let months = y * 12 + (m - 1 : Nat) + n;
    let (ny, nm) = (months / 12, months % 12 + 1);
    ?format(ny, nm, Nat.min(d, daysIn(ny, nm)))
  };

  /// `date` plus `n` days. Null for a malformed date.
  public func addDays(date : Text, n : Nat) : ?Text {
    let ?(y0, m0, d0) = parse(date) else return null;
    var y = y0;
    var m = m0;
    var d = d0 + n;
    while (d > daysIn(y, m)) {
      d -= daysIn(y, m);
      m += 1;
      if (m > 12) { m := 1; y += 1 };
    };
    ?format(y, m, d)
  };
};
