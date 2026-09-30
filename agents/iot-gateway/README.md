# HomeGentic IoT Gateway

Node.js/Express bridge that receives webhooks from smart-home platforms and forwards
normalized sensor readings to the HomeGentic Sensor canister on ICP.

## Supported platforms

| Platform | Protocol | Env var required |
|---|---|---|
| Nest (Google SDM) | Push webhook (Pub/Sub) | `NEST_WEBHOOK_SECRET` |
| Ecobee | REST polling (3 min) | `ECOBEE_CLIENT_ID` + tokens |
| Moen Flo | Push webhook | `MOEN_FLO_WEBHOOK_SECRET` |
| Honeywell Home / Resideo | REST polling (3 min) | `HONEYWELL_CLIENT_ID` + tokens |
| SmartThings | Push webhook | `SMARTTHINGS_WEBHOOK_SECRET` |
| Enphase IQ Gateway | Local LAN polling (60 s) | `ENPHASE_ENVOY_IP` + `ENPHASE_ENVOY_TOKEN` |
| Tesla Powerwall | Local LAN polling (60 s) | `TESLA_EMAIL` + `TESLA_PASSWORD` |
| LG ThinQ | Push webhook (PCC API) | `LG_THINQ_PAT` |
| GE Appliances / SmartHQ | REST polling (5 min) | `GE_CLIENT_ID` + tokens |

## Running

```bash
cd agents/iot-gateway
npm install
npm run dev        # ts-node server.ts, port 3002
```

Copy `.env.example` to `.env` and fill in the relevant vars before starting.

---

## Ecobee — PIN authorization walkthrough

Ecobee uses an OAuth 2.0 PIN flow for consumer apps. Run these two steps once to
obtain your initial `access_token` and `refresh_token`. The gateway refreshes tokens
automatically on every restart and whenever the token is close to expiring.

### Prerequisites

1. Create a free account at [developer.ecobee.com](https://developer.ecobee.com)
2. Create an application → note the **API Key** — this is your `ECOBEE_CLIENT_ID`

### Step 1 — request a PIN

```bash
curl "https://api.ecobee.com/authorize?response_type=ecobeePin&client_id=YOUR_CLIENT_ID&scope=smartRead"
```

Response:

```json
{
  "ecobeePin": "ABCD-1234",
  "code": "AUTHORIZATION_CODE",
  "scope": "smartRead",
  "expires_in": 900
}
```

Go to your Ecobee app → **Menu → My Apps → Add Application** and enter the PIN
(`ABCD-1234`). You have 15 minutes.

### Step 2 — exchange code for tokens

```bash
curl -X POST "https://api.ecobee.com/token?grant_type=ecobeePin&code=AUTHORIZATION_CODE&client_id=YOUR_CLIENT_ID"
```

Response:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "smartRead"
}
```

Add to your `.env`:

```
ECOBEE_CLIENT_ID=YOUR_CLIENT_ID
ECOBEE_ACCESS_TOKEN=<access_token from above>
ECOBEE_REFRESH_TOKEN=<refresh_token from above>
```

### Finding your thermostat ID

After completing the PIN flow, run:

```bash
curl "https://api.ecobee.com/1/thermostat?json=%7B%22selection%22%3A%7B%22selectionType%22%3A%22registered%22%2C%22selectionMatch%22%3A%22%22%7D%7D" \
  -H "Authorization: Bearer $ECOBEE_ACCESS_TOKEN"
```

Look at `thermostatList[0].identifier` — a 12-digit number like `411848373746`.
Set `ECOBEE_THERMOSTAT_ID` to restrict polling to a single unit, or leave it unset
to poll all registered thermostats.

### Register the device in HomeGentic

Once you have the thermostat identifier, register it once so the gateway can match
incoming readings to the correct sensor record:

```ts
sensorService.registerDevice(propertyId, "411848373746", "Ecobee", "Living Room Ecobee")
```

The `externalDeviceId` passed here must match the identifier returned by the Ecobee API.

---

---

## Enphase IQ Gateway / Envoy — local LAN setup

Enphase is the most-installed residential solar inverter in the US. The IQ Gateway sits
on the homeowner's LAN and exposes a local HTTPS REST API — no cloud dependency, 
sub-minute data.

> **TLS note:** The Envoy uses a self-signed certificate. Uncomment
> `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env` **only** for local-LAN use. Do not set this
> in a production environment that also makes internet-facing HTTPS requests.

### Step 1 — find your Envoy IP and serial

- Check your router's DHCP list for a device named `IQ Gateway` or `envoy`
- The serial number is on the white label on the bottom of the hardware
- Format: 6–12 digit number, e.g. `123456789012`

### Step 2 — obtain a local access token

```bash
curl -X POST "https://entrez.enphaseenergy.com/tokens" \
  -H "Content-Type: application/json" \
  -d '{"user":{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"},"enphaseUser":"owner","serialNum":"YOUR_SERIAL"}'
# Copy the returned JWT to ENPHASE_ENVOY_TOKEN in .env
```

Tokens are valid for ~1 year. Rotate annually using the same command.

### Register in HomeGentic

```ts
sensorService.registerDevice(propertyId, "YOUR_SERIAL", "EnphaseEnvoy", "Roof Solar System")
```

### Events ingested

| Condition | Canister event | Severity |
|---|---|---|
| Any inverter not reporting within 15 min (daylight) | `SolarFault` | Critical |
| System producing < 10 W during daylight (7am–7pm) | `LowProduction` | Warning |

---

## Tesla Powerwall — local LAN setup

Tesla does not provide a public cloud API for Powerwall. The local LAN API
(reverse-engineered, stable since 2019) gives complete battery/grid state.

> **TLS note:** Same self-signed certificate caveat as Enphase above.

### Step 1 — find your gateway IP

- Check your router's DHCP list for `Tesla Energy Gateway` or `teg`
- Default IP when connected to the gateway's Wi-Fi: `192.168.91.1`
- Also responds at `teg.local` on most networks

### Step 2 — find your serial number

```bash
# After gateway is authenticated (token in env)
curl -k "https://$TESLA_GATEWAY_IP/api/system_status" \
  -H "Authorization: Bearer $TESLA_ACCESS_TOKEN" | jq '.gateway_id'
```

Or read it from the QR sticker on the side of the Powerwall Gateway unit.

### Register in HomeGentic

```ts
sensorService.registerDevice(propertyId, "1118431-00-L", "TeslaPowerwall", "Home Battery")
```

### Events ingested

| Condition | Canister event | Severity |
|---|---|---|
| Battery alerts present (hard fault) | `SolarFault` | Critical |
| Grid disconnected (`SystemIslandedActive`) | `GridOutage` | Warning |
| Charge < 20 % | `BatteryLow` | Critical |

---

## SmartThings — Webhook SmartApp setup

SmartThings is the highest-leverage integration: a single hub can represent
dozens of Z-Wave, Zigbee, and Wi-Fi sensors. The gateway receives push events
for every capability state change — no polling required.

### Prerequisites

1. Sign up at [developer.smartthings.com](https://developer.smartthings.com)
2. Create a Project → **Automation for the SmartThings App** → **Webhook**
3. Set the **Target URL** to `https://YOUR_GATEWAY_DOMAIN/webhooks/smartthings`
4. Copy the **Signing Key** → set as `SMARTTHINGS_WEBHOOK_SECRET` in `.env`

### Step 1 — confirm the webhook endpoint

When you save the Target URL, SmartThings immediately POSTs a `CONFIRMATION` lifecycle
event. The gateway automatically GETs the `confirmationUrl` in that payload to confirm
ownership. You should see `[smartthings] webhook confirmed` in the gateway logs.

### Step 2 — subscribe to device capabilities

Install the SmartApp in the **SmartThings mobile app** (Automations → + → Your SmartApps).
Select which devices to share. The app will subscribe to all supported capabilities
(`temperatureMeasurement`, `relativeHumidityMeasurement`, `waterSensor`, `filterStatus`,
`thermostatOperatingState`) on the selected devices.

### Step 3 — find device IDs

```bash
# Personal Access Token (PAT): https://account.smartthings.com/tokens (scope: r:devices:*)
curl https://api.smartthings.com/v1/devices \
  -H "Authorization: Bearer $SMARTTHINGS_ACCESS_TOKEN" \
  | jq '.items[] | {deviceId, label, type: .deviceTypeName}'
```

Use the `deviceId` UUID as `externalDeviceId` when registering in HomeGentic:

```ts
sensorService.registerDevice(propertyId, "abc12345-6789-abcd-ef01-234567890abc", "SmartThings", "Kitchen Leak Sensor")
```

### Events ingested

| Capability | Condition | Canister event | Severity |
|---|---|---|---|
| `temperatureMeasurement` | ≤ 4 °C (converts from °F if `unit === "F"`) | `LowTemperature` | Critical |
| `temperatureMeasurement` | > 35 °C | `HighTemperature` | Warning |
| `relativeHumidityMeasurement` | > 70 % | `HighHumidity` | Warning |
| `waterSensor` | `value === "wet"` | `WaterLeak` | Critical |
| `filterStatus` | `value === "replace"` | `HvacFilterDue` | Info |
| `thermostatOperatingState` | `value === "fan only"` | `HvacAlert` | Warning |

---

## Honeywell Home / Resideo — OAuth 2.0 authorization walkthrough

Honeywell uses the standard OAuth 2.0 Authorization Code flow. Run through
steps 1–3 once to obtain your initial tokens. The gateway refreshes tokens
automatically (access tokens expire in 10 minutes).

### Prerequisites

1. Sign up at [developer.honeywellhome.com](https://developer.honeywellhome.com)
2. Create an app → note the **Consumer Key** (`HONEYWELL_CLIENT_ID`) and
   **Consumer Secret** (`HONEYWELL_CLIENT_SECRET`)
3. Set the callback URL to `http://localhost:3002/oauth/callback/honeywell`

### Step 1 — start the gateway with credentials

```
HONEYWELL_CLIENT_ID=YOUR_KEY
HONEYWELL_CLIENT_SECRET=YOUR_SECRET
```

Restart the gateway (`npm run dev`). The `/oauth/callback/honeywell` route is now active.

### Step 2 — authorize in a browser

Open this URL (replace `YOUR_KEY`):

```
https://api.honeywell.com/oauth2/authorize?response_type=code&client_id=YOUR_KEY&redirect_uri=http://localhost:3002/oauth/callback/honeywell
```

Log in with your Honeywell Home account and approve access. The browser redirects to the gateway callback, which exchanges the code for tokens and saves them to `.honeywell-tokens.json`.

You should see: **"Honeywell Home connected!"**

### Step 3 — restart to begin polling

```bash
npm run dev
```

The gateway loads the persisted tokens and starts polling every 3 minutes.

### Finding your location and device IDs

After completing the OAuth flow, inspect your locations and devices:

```bash
# List location IDs
curl "https://api.honeywell.com/v2/locations?apikey=$HONEYWELL_CLIENT_ID" \
  -H "Authorization: Bearer $HONEYWELL_ACCESS_TOKEN" | jq '.[].locationID'

# List thermostats for a location (replace LOC_ID)
curl "https://api.honeywell.com/v2/devices/thermostats?apikey=$HONEYWELL_CLIENT_ID&locationId=LOC_ID" \
  -H "Authorization: Bearer $HONEYWELL_ACCESS_TOKEN" | jq '.[] | {deviceID, userDefinedDeviceName}'
```

Set `HONEYWELL_LOCATION_ID` to restrict polling to a single location, or leave it
unset to poll all locations. The `deviceID` (e.g. `"LCC-00D02D123456"`) is used
as `externalDeviceId` when registering in HomeGentic:

```ts
sensorService.registerDevice(propertyId, "LCC-00D02D123456", "HoneywellHome", "Living Room Thermostat")
```

### Events ingested

| Condition | Canister event | Severity |
|---|---|---|
| `indoorTemperature` converts to ≤ 4 °C | `LowTemperature` | Critical |
| `indoorTemperature` converts to > 35 °C | `HighTemperature` | Warning |
| HVAC `equipmentStatus === "Fault"` or `"Off"` | `HvacAlert` | Warning |
| `indoorHumidity > 70 %` | `HighHumidity` | Warning |
| Water Leak Detector `isWaterPresent` | `WaterLeak` | Critical |

---

## Gateway identity setup

## LG ThinQ — PCC webhook setup

LG ThinQ Connect PCC (Proactive Customer Care) sends AI-driven fault and maintenance alerts to a registered callback URL.

### Prerequisites

1. Sign up at [thinq.developer.lge.com](https://thinq.developer.lge.com)
2. Create an app → generate a **Personal Access Token (PAT)** — a UUID4 string
3. Copy the PAT → set as `LG_THINQ_PAT` in `.env`

### Step 1 — register your callback URL

In the LG Developer Portal: **My Apps → PCC → Register Callback URL**

Set the URL to `https://YOUR_GATEWAY_DOMAIN/webhooks/lgthinq`

LG will POST fault/maintenance alerts with `Authorization: Bearer <your-PAT>`.

### Step 2 — find your LG device ID

```bash
curl "https://us.api.lgthinq.com:46030/v1/devices" \
  -H "x-client-id: YOUR_PAT" \
  -H "x-message-id: " \
  -H "x-country-code: US" \
  -H "x-language-code: en-US" \
  | jq '.result.item[] | {deviceId, alias, deviceType}'
```

Use `deviceId` as `externalDeviceId`:

```ts
sensorService.registerDevice(propertyId, "kr.KR.HRA-ADDDCCD0", "LGThinQ", "LG Refrigerator")
```

### Events ingested

| Condition | Canister event | Severity |
|---|---|---|
| PCC `FAIL_CODE` or `FAULT` with severity HIGH or MEDIUM | `ApplianceFault` | Warning |
| PCC `MAINTENANCE` (filter, descaling, cleaning) | `ApplianceMaintenance` | Info |

---

## GE Appliances / SmartHQ — OAuth 2.0 setup

GE Appliances (GE, Café, Profile, Monogram, Hotpoint) exposes the SmartHQ Platform API. The integration uses OAuth 2.0 and polls every 5 minutes.

### Prerequisites

1. Apply at [smarthqsolutions.com](https://smarthqsolutions.com/smarthq-platform-api) for API access
2. Once approved, create an app → note the **Client ID** (`GE_CLIENT_ID`) and **Client Secret** (`GE_CLIENT_SECRET`)
3. Set the callback URL to `http://localhost:3002/oauth/callback/ge`

### Step 1 — authorize in a browser

Open this URL (replace `YOUR_CLIENT_ID`):

```
https://api.whrcloud.com/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3002/oauth/callback/ge
```

Log in with your GE account and approve access. The browser redirects to the gateway callback, which saves tokens to `.ge-tokens.json`.

You should see: **"GE SmartHQ connected!"**

### Step 2 — restart to begin polling

```bash
npm run dev
```

### Finding your GE appliance ID

```bash
curl "https://api.whrcloud.com/api/v1/appliance" \
  -H "Authorization: Bearer $GE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.[] | {applianceId, applianceType, nickName}'
```

Use `applianceId` as `externalDeviceId`:

```ts
sensorService.registerDevice(propertyId, "YOUR_APPLIANCE_ID", "GESmartHQ", "GE Dishwasher")
```

### Events ingested

| Condition | Canister event | Severity |
|---|---|---|
| Appliance attribute with `ERROR_CODE` or `_FAULT` key is non-zero | `ApplianceFault` | Warning |
| Appliance attribute with `FILTER_CHANGE` or `MAINTENANCE_DUE` key is `"1"` | `ApplianceMaintenance` | Info |

---

## Gateway identity setup

The sensor canister only accepts `recordEvent` calls from authorized gateway principals.
Generate a stable identity seed and whitelist it once:

```bash
# Generate a 32-byte hex seed
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → add as GATEWAY_IDENTITY_SEED in .env

# Print the derived principal
cd agents/iot-gateway && node -e "
const { Ed25519KeyIdentity } = require('@icp-sdk/core/identity');
const seed = Buffer.from(process.env.GATEWAY_IDENTITY_SEED, 'hex');
const id = Ed25519KeyIdentity.generate(new Uint8Array(seed));
console.log(id.getPrincipal().toText());
"

# Whitelist it on the sensor canister
icp canister call sensor addGateway '(principal "YOUR_GATEWAY_PRINCIPAL")' -e ic
```

The gateway also prints its principal on startup via `GET /health`.
