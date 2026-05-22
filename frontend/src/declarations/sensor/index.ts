// Candid interface for the sensor canister — keep in sync with backend/sensor/main.mo
export const idlFactory = ({ IDL }: any) => {
  const DeviceSource = IDL.Variant({
    Nest:           IDL.Null, Ecobee:        IDL.Null,
    MoenFlo:        IDL.Null, Manual:        IDL.Null,
    RingAlarm:      IDL.Null, HoneywellHome: IDL.Null,
    RheemEcoNet:    IDL.Null, Sense:         IDL.Null,
    EmporiaVue:     IDL.Null, Rachio:        IDL.Null,
    SmartThings:    IDL.Null, HomeAssistant: IDL.Null,
    EnphaseEnvoy:   IDL.Null, TeslaPowerwall: IDL.Null,
    LGThinQ:        IDL.Null, GESmartHQ:     IDL.Null,
    SolarEdge:      IDL.Null,
  });
  const SensorEventType = IDL.Variant({
    WaterLeak:            IDL.Null,
    LeakDetected:         IDL.Null,
    FloodRisk:            IDL.Null,
    LowTemperature:       IDL.Null,
    HvacAlert:            IDL.Null,
    HvacFilterDue:        IDL.Null,
    HighHumidity:         IDL.Null,
    HighTemperature:      IDL.Null,
    SolarFault:           IDL.Null,
    LowProduction:        IDL.Null,
    BatteryLow:           IDL.Null,
    GridOutage:           IDL.Null,
    ApplianceFault:       IDL.Null,
    ApplianceMaintenance: IDL.Null,
  });
  const Severity = IDL.Variant({ Info: IDL.Null, Warning: IDL.Null, Critical: IDL.Null });
  const SensorDevice = IDL.Record({
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    externalDeviceId: IDL.Text,
    source:           DeviceSource,
    name:             IDL.Text,
    registeredAt:     IDL.Int,
    isActive:         IDL.Bool,
  });
  const SensorEvent = IDL.Record({
    id:         IDL.Text,
    deviceId:   IDL.Text,
    propertyId: IDL.Text,
    homeowner:  IDL.Principal,
    eventType:  SensorEventType,
    value:      IDL.Float64,
    unit:       IDL.Text,
    rawPayload: IDL.Text,
    timestamp:  IDL.Int,
    severity:   Severity,
    jobId:      IDL.Opt(IDL.Text),
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput: IDL.Text,
    AlreadyExists: IDL.Null,
  });
  return IDL.Service({
    registerDevice: IDL.Func(
      [IDL.Text, IDL.Text, DeviceSource, IDL.Text],
      [IDL.Variant({ ok: SensorDevice, err: Error })],
      []
    ),
    deactivateDevice: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    recordEvent: IDL.Func(
      [IDL.Text, SensorEventType, IDL.Float64, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: SensorEvent, err: Error })],
      []
    ),
    getDevicesForProperty: IDL.Func([IDL.Text], [IDL.Vec(SensorDevice)], ["query"]),
    getEventsForProperty:  IDL.Func([IDL.Text, IDL.Nat], [IDL.Vec(SensorEvent)], ["query"]),
    getPendingAlerts:      IDL.Func([IDL.Text], [IDL.Vec(SensorEvent)], ["query"]),
  });
};
