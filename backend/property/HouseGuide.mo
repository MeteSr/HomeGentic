/// #725: the house guide a household writes for sitters, guests and cleaners,
/// and the expiring links that share it. Types and validation only, no state.
import Array "mo:core/Array";
import Char "mo:core/Char";
import Text "mo:core/Text";
import Insurance "Insurance";

module {
  public type GuideContact = {
    name  : Text;
    role  : Text;   // "Neighbour with the spare key", "Plumber"
    phone : Text;
  };

  /// What the household writes. Every field is optional text, stored exactly
  /// as typed (Wi-Fi passwords and alarm codes included); `photoIds` are
  /// photos of this home (shutoffs, panel) shown with the guide.
  public type GuideInput = {
    wifiName      : Text;
    wifiPassword  : Text;
    alarm         : Text;
    trashDay      : Text;
    recyclingDay  : Text;
    waterShutoff  : Text;
    gasShutoff    : Text;
    electricPanel : Text;
    contacts      : [GuideContact];
    notes         : Text;
    photoIds      : [Text];
  };

  public type HouseGuide = {
    wifiName      : Text;
    wifiPassword  : Text;
    alarm         : Text;
    trashDay      : Text;
    recyclingDay  : Text;
    waterShutoff  : Text;
    gasShutoff    : Text;
    electricPanel : Text;
    contacts      : [GuideContact];
    notes         : Text;
    photoIds      : [Text];
    updatedAt     : Int;
  };

  /// A bearer link to one home's guide. Anyone holding `token` can read the
  /// guide until `expiresAt` unless it is revoked.
  public type GuideLink = {
    token      : Text;
    propertyId : Text;
    name       : Text;
    createdBy  : Principal;
    createdAt  : Int;
    expiresAt  : Int;
    revoked    : Bool;
  };

  /// What a link shows: the guide and the home's address, nothing else.
  public type SharedHouseGuide = {
    address   : Text;
    city      : Text;
    state     : Text;
    zipCode   : Text;
    guide     : HouseGuide;
    expiresAt : Int;
  };

  public let MAX_CONTACTS : Nat = 10;
  public let MAX_PHOTOS : Nat = 6;
  public let MAX_LIVE_LINKS : Nat = 10;
  /// Expired and revoked links kept per home (newest first) for the owner's list.
  public let MAX_DEAD_LINKS : Nat = 20;
  public let MAX_LINK_DAYS : Nat = 90;
  public let MAX_LINK_NAME : Nat = 60;

  let trim = Insurance.trim;

  /// A photo, document or job id: 1–64 letters, digits, '-' or '_'.
  public func isRefId(id : Text) : Bool {
    if (id.size() == 0 or id.size() > 64) return false;
    for (c in id.chars()) {
      if (not (c.isAlphabetic() or c.isDigit() or c == '-' or c == '_')) return false;
    };
    true
  };

  public func clean(g : GuideInput) : GuideInput {
    {
      g with
      wifiName      = trim(g.wifiName);
      // A password's spaces may matter: kept as typed.
      alarm         = trim(g.alarm);
      trashDay      = trim(g.trashDay);
      recyclingDay  = trim(g.recyclingDay);
      waterShutoff  = trim(g.waterShutoff);
      gasShutoff    = trim(g.gasShutoff);
      electricPanel = trim(g.electricPanel);
      notes         = trim(g.notes);
      contacts      = g.contacts.map(func c = { name = trim(c.name); role = trim(c.role); phone = trim(c.phone) });
    }
  };

  /// The problem with a (cleaned) guide, or null.
  public func validate(g : GuideInput) : ?Text {
    if (g.wifiName.size() > 100)      return ?"Wi-Fi name is over 100 characters";
    if (g.wifiPassword.size() > 100)  return ?"Wi-Fi password is over 100 characters";
    if (g.alarm.size() > 500)         return ?"Alarm notes are over 500 characters";
    if (g.trashDay.size() > 200)      return ?"Trash day is over 200 characters";
    if (g.recyclingDay.size() > 200)  return ?"Recycling day is over 200 characters";
    if (g.waterShutoff.size() > 500)  return ?"Water shutoff notes are over 500 characters";
    if (g.gasShutoff.size() > 500)    return ?"Gas shutoff notes are over 500 characters";
    if (g.electricPanel.size() > 500) return ?"Electrical panel notes are over 500 characters";
    if (g.notes.size() > 4000)        return ?"Notes are over 4,000 characters";
    if (g.contacts.size() > MAX_CONTACTS) return ?"A guide can list up to 10 contacts";
    for (c in g.contacts.values()) {
      if (c.name.size() == 0)   return ?"Give each contact a name";
      if (c.name.size() > 100)  return ?"Contact name is over 100 characters";
      if (c.role.size() > 100)  return ?"Contact role is over 100 characters";
      if (c.phone.size() > 40)  return ?"Contact phone is over 40 characters";
    };
    if (g.photoIds.size() > MAX_PHOTOS) return ?"A guide can show up to 6 photos";
    for (id in g.photoIds.values()) {
      if (not isRefId(id)) return ?"That photo doesn't exist";
    };
    let empty = g.wifiName == "" and g.wifiPassword == "" and g.alarm == "" and g.trashDay == ""
      and g.recyclingDay == "" and g.waterShutoff == "" and g.gasShutoff == "" and g.electricPanel == ""
      and g.contacts.size() == 0 and g.notes == "" and g.photoIds.size() == 0;
    if (empty) return ?"Fill in at least one part of the guide";
    null
  };

  /// True when `link` can be read at `now`.
  public func isLive(link : GuideLink, now : Int) : Bool {
    not link.revoked and now < link.expiresAt
  };

  public func cleanName(t : Text) : Text { trim(t) };
};
