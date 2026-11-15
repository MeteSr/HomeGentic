/// getApiDoc() text for the sensor canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic sensor canister\n\n" #
    "Smart-home devices linked to a property (leak sensors, thermostats, energy monitors, solar and battery systems, appliances) and the readings and alerts they have reported. HomeGentic stores what the device vendors send it; nothing here controls a device or reads one live.\n\n" #
    "## Who can read\n" #
    "A home's devices and readings are returned only to people with a role on that home in the property canister (its owner, and the co-owners, managers and view-only members the owner invited), checked each time against the property canister. Anyone else, and anonymous callers, get an empty list. A former owner or a removed manager loses access at once.\n\n" #
    "## Reading\n" #
    "- `getDevicesForProperty(propertyId)` (composite query): the active devices on one home, with the vendor (`source`), the name the user gave it and the vendor's own device id. Works in read-only sessions.\n" #
    "- `getEventsForProperty(propertyId, limit)`: the newest `limit` readings for a home, oldest first; `limit = 0` returns all that are kept. This is an update call.\n" #
    "- `getPendingAlerts(propertyId)`: the home's readings with severity Warning or Critical. This is an update call. \"Pending\" is only the name: HomeGentic has no acknowledge or dismiss step, so an old alert stays in this list.\n" #
    "- Each reading has an `eventType` (WaterLeak, LeakDetected, FloodRisk, LowTemperature, HvacAlert, HvacFilterDue, HighHumidity, HighTemperature, SolarFault, LowProduction, BatteryLow, GridOutage, ApplianceFault, ApplianceMaintenance), a `severity` (Info, Warning or Critical, assigned by HomeGentic from the event type), a numeric `value` with its `unit` (for example `°C`, `%RH`, `L/min`), a nanosecond `timestamp`, and `rawPayload`, the text the vendor sent.\n" #
    "- Only the newest 1,000 readings per home are kept; older ones are deleted. A reading is what the vendor reported at that time, not the device's current state, and a home with no readings may simply have no linked device.\n\n" #
    "## Questions over the whole record (OQL)\n" #
    "- `schema()` (query): a JSON catalogue of the `devices` and `events` entities: every field, its type and what it means.\n" #
    "- `execute(oql)` (composite query): runs one JSON query over the devices or readings of the caller's homes and returns rows of named cells, filtered, grouped and counted here, e.g. `{\"start\":\"events\",\"where\":{\"eq\":{\"field\":\"severity\",\"value\":\"Critical\"}},\"select\":[\"deviceName\",\"eventType\",\"value\",\"unit\",\"time\"]}`. The keys are the same as on the job canister's `execute`. Without a `propertyId` condition it covers the homes the caller registered devices on; to read a home the caller co-owns, manages or views, add a `propertyId` `eq` or `in` condition (at most 20 homes). Vendor device ids and raw payloads are not returned. Read-only and free; works in read-only sessions. A malformed query is rejected with a message starting \"OQL:\".\n\n" #
    "## Changing\n" #
    "- `registerDevice(propertyId, externalDeviceId, source, name)`: links a device to a home the caller owns, co-owns or manages. Only `#Manual` devices and vendors HomeGentic can't verify are accepted this way; for vendors it can verify (the error says \"Connect your ... account\") the user links the device by signing in to the vendor from the Sensors page of the web app. A device id already linked by someone who still has access to its home returns `#AlreadyExists`. A `#Manual` device never receives readings.\n" #
    "- `deactivateDevice(deviceId)`: removes a device from the home. Its past readings stay, new readings from it are no longer recorded, and no alert job is opened for it. It can be linked again later. This doesn't disconnect anything in the vendor's own app.\n" #
    "- `recordEvent(...)`, `recordEventFor(...)` and `registerVerifiedDevice(...)` are for HomeGentic's device gateway and return `#NotAuthorized` for users: readings can't be added or edited by hand. When the gateway records a Critical reading (a water leak or flood risk, an HVAC fault, a solar fault or a critically low battery), the canister opens a pending job for the home in the job canister and the owner is notified.\n" #
    "- `getDevicesForReader(propertyId)` is for other HomeGentic canisters and returns an empty list to users. `getVerifiedOnlySources()` (query) lists the vendors that must be linked by signing in.\n\n" #
    Shared.common()
  };
};
