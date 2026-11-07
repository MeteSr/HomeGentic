/// #718: the FEMA flood zone at a home's address, as the voice Worker read it
/// from FEMA's National Flood Hazard Layer. Types and validation only. It is
/// what FEMA's map showed on `checkedAt`, not a flood forecast.
import Insurance "Insurance";

module {
  /// #NotMapped: FEMA's digital flood map has no zone at that point.
  public type Status = { #Mapped; #NotMapped };

  /// Dates "YYYY-MM-DD" or "". `baseFloodElevation` is feet as FEMA gives it,
  /// or "" when FEMA lists none.
  public type Input = {
    status                 : Status;
    zone                   : Text;
    zoneSubtype            : Text;
    specialFloodHazardArea : Bool;
    baseFloodElevation     : Text;
    firmPanel              : Text;
    firmEffectiveDate      : Text;
    matchedAddress         : Text;
    latitude               : Text;
    longitude              : Text;
  };

  public type FloodZone = {
    status                 : Status;
    zone                   : Text;
    zoneSubtype            : Text;
    specialFloodHazardArea : Bool;
    baseFloodElevation     : Text;
    firmPanel              : Text;
    firmEffectiveDate      : Text;
    matchedAddress         : Text;
    latitude               : Text;
    longitude              : Text;
    checkedAt              : Int;
  };

  /// What the Worker needs for a lookup: the address and any saved result.
  public type Target = {
    address   : Text;
    city      : Text;
    state     : Text;
    zipCode   : Text;
    floodZone : ?FloodZone;
  };

  /// The problem with a result, or null.
  public func validate(f : Input) : ?Text {
    if (f.zone.size() > 10)            return ?"Zone is over 10 characters";
    if (f.zoneSubtype.size() > 120)    return ?"Zone subtype is over 120 characters";
    if (f.baseFloodElevation.size() > 20) return ?"Base flood elevation is over 20 characters";
    if (f.firmPanel.size() > 20)       return ?"Map panel is over 20 characters";
    if (f.firmEffectiveDate != "" and not Insurance.isDateFrom(f.firmEffectiveDate, 1970))
      return ?"Map effective date must be a real date written YYYY-MM-DD";
    if (f.matchedAddress.size() > 300) return ?"Matched address is over 300 characters";
    if (f.latitude.size() > 20 or f.longitude.size() > 20) return ?"Coordinates are over 20 characters";
    null
  };

  public func toRecord(f : Input, now : Int) : FloodZone {
    {
      status = f.status; zone = f.zone; zoneSubtype = f.zoneSubtype;
      specialFloodHazardArea = f.specialFloodHazardArea; baseFloodElevation = f.baseFloodElevation;
      firmPanel = f.firmPanel; firmEffectiveDate = f.firmEffectiveDate; matchedAddress = f.matchedAddress;
      latitude = f.latitude; longitude = f.longitude; checkedAt = now;
    }
  };
};
