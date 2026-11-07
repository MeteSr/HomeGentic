/// Subtypes of ServiceType #Other (issue #721): kinds of work with no
/// ServiceType tag of their own. A new tag would change the Candid type that
/// installed apps and the Workers decode, so these ride on #Other instead:
/// a job carries the subtype as its title, a quote request in the quote
/// canister's side map (setQuoteRequestSubtype).
///
/// Keep packages/shared/src/serviceTypes.ts (SERVICE_SUBTYPES) in step: same
/// keys, same labels, same order (serviceTypes.test.ts checks).
import Text "mo:core/Text";

module {
  /// (key, display label)
  public let all : [(Text, Text)] = [
    ("Inspection", "Inspection"),
    ("ApplianceRepair", "Appliance Repair"),
    ("GarageDoor", "Garage Door"),
    ("Septic", "Septic"),
    ("WellWater", "Well & Water Treatment"),
    ("Chimney", "Chimney"),
    ("Generator", "Generator"),
    ("TreeService", "Tree Service"),
    ("SecurityAlarm", "Security & Alarm"),
    ("MoldRadon", "Mold & Radon"),
  ];

  /// True when `key` is a subtype key, exactly as listed.
  public func isKey(key : Text) : Bool {
    for ((k, _) in all.values()) { if (k == key) return true };
    false
  };

  /// The display label for a subtype key or label (any case), else null.
  public func labelOf(keyOrLabel : Text) : ?Text {
    let t = keyOrLabel.trim(#char ' ').toLower();
    for ((k, l) in all.values()) {
      if (k.toLower() == t or l.toLower() == t) return ?l;
    };
    null
  };
}
