/// The year each of a home's main systems was installed, as the household
/// says. Types and validation only, no state.
///
/// Without an entry, forecasts count a system from the year the house was
/// built. The names match the frontend's tracked systems
/// (frontend/src/services/systemAges.ts), and the first six match the
/// score's system lifespans (packages/shared/src/score.ts).
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Set "mo:core/Set";
import Text "mo:core/Text";

module {
  public type SystemYear = {
    name        : Text;  // `system` is a Motoko reserved word
    installYear : Nat;
  };

  /// What the Home Pulse relay reads about a home's setup.
  public type PulseSetup = {
    propertyId  : Text;
    /// When the home was added (ns).
    addedAt     : Int;
    systemYears : [SystemYear];
    /// Whether the house guide says where the water shutoff is.
    hasShutoffs : Bool;
  };

  public let SYSTEMS : [Text] = [
    "HVAC", "Roofing", "Water Heater", "Windows", "Electrical",
    "Plumbing", "Flooring", "Insulation", "Solar Panels",
  ];

  /// Why `years` can't be saved for a home built in `yearBuilt`, or null.
  public func validate(years : [SystemYear], yearBuilt : Nat, currentYear : Nat) : ?Text {
    let seen = Set.empty<Text>();
    for (y in years.values()) {
      if (SYSTEMS.find(func s = s == y.name) == null) return ?(y.name # " isn't a system we track");
      if (seen.contains(y.name)) return ?(y.name # " is listed twice");
      seen.add(y.name);
      if (y.installYear < yearBuilt) return ?("The " # y.name # " year is before the house was built (" # yearBuilt.toText() # ")");
      if (y.installYear > currentYear) return ?("The " # y.name # " year is in the future");
    };
    null
  };
};
