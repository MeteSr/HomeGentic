/// #714: a home's property-tax years as the owner reads them off the TRIM
/// notice or tax bill: the market, assessed and taxable values, the
/// exemption status, and the petition deadline printed on the notice. Types
/// and validation only. Nothing is checked with the county.
import Insurance "Insurance";
import Nat "mo:core/Nat";
import Order "mo:core/Order";
import Text "mo:core/Text";

module {
  /// The homestead (or other primary-residence) exemption for that year, as
  /// the owner marks it. #Unknown keeps the Florida filing reminder on.
  public type Exemption = { #Unknown; #NotApplying; #Applied; #Granted; #Denied };

  /// Values in cents, null when the owner didn't enter them. `petitionDeadline`
  /// is "YYYY-MM-DD" in the tax year, or "".
  public type YearInput = {
    year               : Nat;
    marketValueCents   : ?Nat;
    assessedValueCents : ?Nat;
    taxableValueCents  : ?Nat;
    exemption          : Exemption;
    petitionDeadline   : Text;
    notes              : Text;
  };

  public type Year = {
    year               : Nat;
    marketValueCents   : ?Nat;
    assessedValueCents : ?Nat;
    taxableValueCents  : ?Nat;
    exemption          : Exemption;
    petitionDeadline   : Text;
    notes              : Text;
    updatedAt          : Int;
  };

  /// What the weekly Home Pulse email reads: no values or notes.
  public type PulseYear = {
    year             : Nat;
    exemption        : Exemption;
    petitionDeadline : Text;
  };

  public type PulsePropertyTax = {
    propertyId : Text;
    years      : [PulseYear];
  };

  public let MIN_YEAR : Nat = 1950;
  public let MAX_YEAR : Nat = 2100;
  /// $1,000,000,000.
  public let MAX_VALUE_CENTS : Nat = 100_000_000_000;
  public let MAX_NOTES : Nat = 1000;
  public let MAX_YEARS : Nat = 60;
  /// How many years the Pulse email gets per home (this year and last).
  public let PULSE_YEARS : Nat = 2;

  func tooBig(v : ?Nat) : Bool {
    switch v { case (?c) c > MAX_VALUE_CENTS; case null false }
  };

  public func clean(y : YearInput) : YearInput {
    { y with petitionDeadline = Insurance.trim(y.petitionDeadline); notes = Insurance.trim(y.notes) }
  };

  /// The problem with a (cleaned) year, or null.
  public func validate(y : YearInput) : ?Text {
    if (y.year < MIN_YEAR or y.year > MAX_YEAR) return ?"Tax year must be 1950 to 2100";
    if (tooBig(y.marketValueCents))   return ?"Market value is over $1,000,000,000";
    if (tooBig(y.assessedValueCents)) return ?"Assessed value is over $1,000,000,000";
    if (tooBig(y.taxableValueCents))  return ?"Taxable value is over $1,000,000,000";
    if (y.petitionDeadline != "") {
      if (not Insurance.isDateFrom(y.petitionDeadline, MIN_YEAR))
        return ?"Petition deadline must be a real date written YYYY-MM-DD";
      if (not y.petitionDeadline.startsWith(#text(y.year.toText() # "-")))
        return ?"The petition deadline must be in the tax year it's for";
    };
    if (y.notes.size() > MAX_NOTES) return ?"Notes are over 1,000 characters";
    null
  };

  public func toYear(y : YearInput, now : Int) : Year {
    { y with updatedAt = now }
  };

  /// Newest tax year first.
  public func newestFirst(a : Year, b : Year) : Order.Order { Nat.compare(b.year, a.year) };

  public func pulseYear(y : Year) : PulseYear {
    { year = y.year; exemption = y.exemption; petitionDeadline = y.petitionDeadline }
  };
};
