# Performance Baseline

Measured against the pre-rendered landing page (`npm run build:ssg`).

## Targets (SEO.8)

| Metric | Target | Status |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | ⬜ Pending measurement |
| CLS (Cumulative Layout Shift)  | < 0.1   | ⬜ Pending measurement |
| INP (Interaction to Next Paint)| < 200 ms| ⬜ Pending measurement |

## Optimisations in place

- **Google Fonts `preconnect`** — `<link rel="preconnect">` to `fonts.googleapis.com` and `fonts.gstatic.com` in `index.html` reduces DNS+TCP round-trip for web fonts.
- **`font-display: swap`** — appended to all Google Fonts URLs so text renders immediately in fallback font while web fonts load.
- **Code splitting** — Vite `manualChunks` separates `vendor-dfinity`, `vendor-react`, and `vendor-ui` bundles so the critical path (LandingPage) downloads minimal JS.
- **No sourcemaps in production** — `sourcemap: false` in `vite.config.ts` keeps bundle sizes small.
- **SSG pre-rendered shells** — static routes ship pre-built HTML so Googlebot sees content without executing JS.

## Lighthouse

Run locally after `npm run build:ssg && npm run preview`:

```bash
npx lighthouse http://localhost:4173 --output=json --output-path=./lighthouse-report.json
```

## Core Web Vitals — field data

Once deployed, monitor real-user metrics via Google Search Console → Core Web Vitals report.

---

## Backend / API Performance

Baselines established via k6 load tests in `tests/k6/`.  Thresholds are enforced in
`.github/workflows/load-test.yml` — a breached threshold fails the CI step.

### Voice Agent (`POST /api/chat`, `POST /api/agent`)

| Endpoint | p50 | p95 | Max error rate |
|---|---|---|---|
| `POST /api/chat` | < 800 ms | < 2 s | < 1 % |
| `POST /api/agent` (no tool calls) | < 1 s | < 3 s | < 1 % |
| `GET /health` | < 10 ms | < 50 ms | < 0.1 % |

Measured with `tests/k6/voice-chat.js` (20 VU, 1 min hold) against a local `wrangler dev` pointed at the mock Anthropic API (`tests/k6/mock-anthropic.mjs`, 300 ms simulated model latency), so the numbers are the Worker's own overhead plus that latency.

### IoT Gateway (`POST /webhooks/*`)

| Endpoint | p50 | p95 | Max error rate |
|---|---|---|---|
| `POST /webhooks/nest` | < 50 ms | < 300 ms | < 0.1 % |
| `POST /webhooks/ecobee` | < 50 ms | < 300 ms | < 0.1 % |
| `POST /webhooks/moen-flo` | < 50 ms | < 300 ms | < 0.1 % |
| `GET /health` | < 5 ms | < 50 ms | < 0.01 % |

Measured with `tests/k6/iot-gateway-load.js` (`webhook_burst` scenario, 100 VU, `SENSOR_CANISTER_ID=dummy`).
429 responses from the rate limiter are excluded from error-rate calculations.

### Running the load tests locally

```bash
# Start services
node tests/k6/mock-anthropic.mjs &
(cd agents/voice && npx wrangler dev src/index.ts --var NODE_ENV:development \
  --var ANTHROPIC_API_KEY:mock --var ANTHROPIC_BASE_URL:http://localhost:8788) &
cd agents/iot-gateway && SENSOR_CANISTER_ID=dummy npm run dev &

# Run tests
k6 run tests/k6/voice-chat.js
k6 run tests/k6/iot-gateway-load.js
```

See `tests/k6/README.md` for full setup instructions and result interpretation.
