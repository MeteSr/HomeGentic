/// The sensor canister's OQL catalogue (see shared/Oql.mo): a household's
/// smart-home devices and the alerts they raised. No principals, no vendor
/// device ids (what a hijacker needs) and no raw gateway payloads are exposed.
import Oql "../shared/Oql";

module {
  public let DEVICES : Oql.Entity = {
    name = "devices";
    primaryKey = "id";
    description = "Smart-home devices linked to the caller's homes (thermostats, leak sensors, energy monitors and so on). Without a propertyId condition, covers the homes the caller registered devices on; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Device id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home the device is on" },
      { name = "name"; typeName = #text; nullable = false; description = "The device's name, as entered" },
      { name = "source"; typeName = #text; nullable = false; description = "The platform: Nest, Ecobee, MoenFlo, RingAlarm, HoneywellHome, RheemEcoNet, Sense, EmporiaVue, Rachio, SmartThings, HomeAssistant, EnphaseEnvoy, TeslaPowerwall, LGThinQ, GESmartHQ, SolarEdge or Manual" },
      { name = "registeredDate"; typeName = #text; nullable = false; description = "When it was linked, YYYY-MM-DD (UTC)" },
      { name = "active"; typeName = #bool; nullable = false; description = "False once the device was unlinked" },
    ];
  };

  public let EVENTS : Oql.Entity = {
    name = "events";
    primaryKey = "id";
    description = "Alerts and readings the home's devices reported, at most the newest 1,000 per home. Readings are what the device reported, not a diagnosis; a home with no events may simply have no devices linked. Without a propertyId condition, covers the homes the caller registered devices on; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Event id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "deviceId"; typeName = #text; nullable = false; description = "The device (devices.id)" },
      { name = "deviceName"; typeName = #text; nullable = true; description = "The device's name; null if the device record is gone" },
      { name = "eventType"; typeName = #text; nullable = false; description = "WaterLeak, LeakDetected, FloodRisk, LowTemperature, HvacAlert, HvacFilterDue, HighHumidity, HighTemperature, SolarFault, LowProduction, BatteryLow, GridOutage, ApplianceFault or ApplianceMaintenance" },
      { name = "severity"; typeName = #text; nullable = false; description = "Info, Warning or Critical" },
      { name = "value"; typeName = #float; nullable = false; description = "The reading, in unit" },
      { name = "unit"; typeName = #text; nullable = false; description = "Unit of the reading (\u{00B0}C, %RH, L/min, ...); may be empty" },
      { name = "date"; typeName = #text; nullable = false; description = "Day it was reported, YYYY-MM-DD (UTC); compares correctly as text" },
      { name = "time"; typeName = #text; nullable = false; description = "When it was reported, YYYY-MM-DDTHH:MM:SSZ (UTC); sorts correctly as text" },
      { name = "jobId"; typeName = #text; nullable = true; description = "The pending job opened for a Critical event, if one was" },
    ];
  };

  public let ENTITIES : [Oql.Entity] = [DEVICES, EVENTS];

  /// Most homes one query reads. Pro allows 20 homes.
  public let MAX_HOMES : Nat = 20;
};
