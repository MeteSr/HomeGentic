# k6 Load Tests

[k6](https://k6.io) load tests for HomeGentic backend services.

| Script | Target service | Default port | Duration |
|---|---|---|---|
| `voice-agent-load.js` | Voice agent (`agents/voice`) | 8787 | ~17.5 min |
| `voice-chat.js` | Voice agent — chat only | 8787 | ~2 min |
| `iot-gateway-load.js` | IoT gateway (`agents/iot-gateway`) | 3002 | ~7 min (CI) / ~14 min |

`voice-chat.js` is the CI-friendly subset of `voice-agent-load.js`: same endpoint, lighter load.
Use `voice-agent-load.js` for pre-release soak testing.

## Prerequisites

### Install k6

**macOS**
```bash
brew install k6
```

**Ubuntu/Debian**
```bash
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list

sudo apt-get update && sudo apt-get install k6
```

**Windows**
```bash
winget install k6 --source winget
```

## Running the voice agent tests

### Start the server
```bash
cd agents/voice
MOCK_ANTHROPIC=1 npm run dev
# wrangler dev serves the Worker on :8787
```

`MOCK_ANTHROPIC=1` stubs the Anthropic API — no tokens are consumed during load testing.

### Run voice-chat.js (quick CI gate, ~2 min)
```bash
k6 run tests/k6/voice-chat.js
```

### Run voice-agent-load.js (full soak, ~17.5 min)
```bash
k6 run tests/k6/voice-agent-load.js
```

**Env vars**

| Variable | Default | Description |
|---|---|---|
| `VOICE_AGENT_URL` | `http://localhost:8787` | Base URL of the voice agent |
| `MOCK_ANTHROPIC` | unset | Set to `1` to skip real Anthropic API calls |

## Running the IoT gateway test

### Start the gateway
```bash
cd agents/iot-gateway
SENSOR_CANISTER_ID=dummy npm run dev
# Express starts on :3002
```

`SENSOR_CANISTER_ID=dummy` lets the gateway exercise the full request path (parsing, HMAC skip, handler dispatch) without reaching the ICP network.  The gateway will log canister errors — that is expected.

No `*_WEBHOOK_SECRET` env vars are needed.  Signature verification is skipped when secrets are absent.

### Run the test
```bash
k6 run tests/k6/iot-gateway-load.js
```

**Env vars**

| Variable | Default | Description |
|---|---|---|
| `IOT_GATEWAY_URL` | `http://localhost:3002` | Base URL of the IoT gateway |
| `CI` | unset | Set to `true` to shorten `polling_steady` (2 min) and cap spike at 100 VU |

**Scenarios**

| Scenario | Shape | Purpose |
|---|---|---|
| `webhook_burst` | 0→100 VU over 30 s, hold 1 min | Many devices firing alerts simultaneously |
| `polling_steady` | 10 VU constant for 10 min | Ecobee-style background polling from many properties |
| `spike` | 0→500 VU in 10 s, hold 30 s | Worst-case water-leak broadcast from all Moen Flo devices |

## CI mode

Both `iot-gateway-load.js` and `voice-chat.js` support a CI mode that shortens long scenarios and caps extreme VU counts.  GitHub Actions sets `CI=true` automatically, so CI mode activates without configuration.

| Setting | Normal | CI |
|---|---|---|
| `polling_steady` duration | 10 min | 2 min |
| `spike` max VUs | 500 | 100 |

The GitHub Actions workflow (`.github/workflows/load-test.yml`) runs `voice-chat.js` and `iot-gateway-load.js`.  Use `workflow_dispatch` to trigger it manually, or it fires automatically on version tags.

## Interpreting results

k6 prints a summary on exit.  Key metrics:

| Metric | Threshold | Notes |
|---|---|---|
| `http_req_duration` p95 | < 500 ms (gateway) / < 2 s (voice) | Core latency budget |
| `http_req_failed` | < 1 % | Network + HTTP 5xx errors |
| `nest_duration_ms` p95 | < 300 ms | Per-endpoint webhook latency |
| `ecobee_duration_ms` p95 | < 300 ms | Per-endpoint webhook latency |
| `moen_flo_duration_ms` p95 | < 300 ms | Per-endpoint webhook latency |
| `health_duration_ms` p99 | < 50 ms | Liveness overhead |
| `rate_limit_429` | (no threshold) | High count during `spike` is correct |

k6 exits with code `99` when any threshold is breached.  A non-zero exit fails the CI step.

### Saving results for analysis
```bash
k6 run --out json=results.json tests/k6/iot-gateway-load.js

# Inspect p95 latency from saved results:
jq '[.[] | select(.type=="Point" and .metric=="http_req_duration") | .data.value] | sort | .[floor(length * 0.95)]' results.json
```
