# AI Rate Limits

HomeGentic uses Claude (claude-sonnet-5-5, `AI_MODEL` in `agents/voice/wrangler.toml`) for two categories of AI calls. These categories are tracked and limited separately because their cost profiles differ significantly.

## Call categories

| Category | Endpoint | Avg cost/call | Limit |
|---|---|---|---|
| **Agent calls** | `POST /api/agent` | ~$0.013 per request (each tool-use turn is one request) | Agent-call limit (below) |
| **Chat calls** | `POST /api/chat` | ~$0.007 | Chat limit (below) |
| Document and other AI calls | `/api/extract-document`, `/api/extract-bill`, `/api/maintenance/chat`, `/api/classify`, `/api/pulse`, … (`AUX_AI_ROUTES`) | ~$0.020 average ($0.002 to classify, $0.05+ for a buyer's truth kit) | 25/day Free and ContractorFree (3 in the first week), 200/day paid |

Costs are at Sonnet 5.5 list prices ($2/$10 per million tokens) with the agent's tool list prompt-cached; see [UNIT_ECONOMICS.md](UNIT_ECONOMICS.md).

Agent calls are limited most tightly because they drive the majority of AI cost. A single agentic interaction involves multiple Claude API round-trips (up to 5 tool-use turns), each resending the tool definitions and the full conversation.

## Per-tier limits

Chat limits always reset daily (midnight UTC). Agent-call limits reset on
a per-tier period — daily for every tier except Free, which resets weekly
(Monday 00:00 UTC, ISO week) — see `TIER_PERIOD` in
`agents/voice/agentLimiter.ts`.

| Tier | Agent calls | Chat calls/day | Notes |
|---|---|---|---|
| **Free** | 10/week | 3 | Homeowner's real (unpaid) tier — weekly reset, not daily |
| **Pro** ($59/yr) | 10/day | 200 | The only purchasable homeowner plan |
| **ContractorFree** | 0 | 3 | No agentic access |
| **ContractorPro** ($40/mo) | 10/day | 200 | |

Realtors have no subscription tier (they pay a per-award Bid to List fee), so they fall under whichever tier their principal resolves to — Free unless they've subscribed.

Homeowner pricing collapsed from three tiers (Basic/Pro/Premium) to a single
$59/year Pro plan carrying the old Premium tier's property (20), photo
(30/job), and quote-request (unlimited) limits. Its agent-call limit is the
exception: it keeps the old Pro tier's 10/day cap rather than Premium's
20/day — at $59/year, 20/day would run the tier at a steep loss (see
"Financial basis" below). Basic ($10/mo, 5/day) and old Premium ($40/mo,
20/day) have since been removed entirely — there were no subscribers on
them, so the tiers no longer exist in the code.

Free is no longer fully blocked from the app: it gets 1 property, 5
photos/job, 3 open quote requests, job logging, Bid to List, and the
AI/intelligence feature set (Market Intelligence, Predictive Maintenance,
Warranty Wallet, Recurring Services, Sensors, People) — only Insurance
Defense and Resale Ready stay Pro-only. Its agent-call allowance is
deliberately both smaller and paced weekly rather than daily: at 10/day it
would cost roughly the same as Pro's own allowance while returning $0 in
revenue (see "Financial basis" below).

## Abuse protection (cycle-drain audit CD-1, 2026-10-31)

Every limit above is per account, and accounts are free to create, so the
Worker adds checks in front of every Claude call (`agents/voice/src/aiGuard.ts`):

| Check | Applies to | Behaviour |
|---|---|---|
| **Human check** | Free, ContractorFree | Cloudflare Turnstile, once per account (remembered a year). Until it's passed, AI routes answer 403 `human_verification_required` with the site key; the web app shows the widget in a dialog, the mobile app opens the Worker's `/human-check` page |
| **Free daily budget** | Free, ContractorFree | All free accounts share `FREE_AI_DAILY_TOKEN_BUDGET` weighted tokens per UTC day (input + 5 × output; default 10M ≈ $30). Once spent, free calls get 429 `free_ai_budget_reached` until midnight UTC. Paid accounts are never counted or cut off |
| **New accounts** | Free, first 7 days after the human check | `NEW_ACCOUNT_AUX_DAILY_LIMIT` (default 3) document/AI calls a day instead of 25 |
| **Exponential backoff** | Everyone, every `/api` route except Stripe webhooks and Bid to List | Each 429 or failed human check is a strike on the IP and the principal. After 3 strikes in 24 h, each further strike blocks for 30 s, 1, 2, 4 … minutes, up to 1 hour; requests made while blocked are strikes too. Blocked calls get 429 `slow_down` with `Retry-After` |
| **Input caps** | Everyone | PDFs sent to Claude ≤ 1.5 MB; an agent request ≤ 64,000 characters of text and 4 images in total |

The other paid-API routes (address suggestions, ATTOM property lookups, permit
imports, contractor-invite and broker emails) get the human check and backoff
but not the Claude budget (CD-9, CD-11). Their global daily budgets
(`ATTOM_DAILY_BUDGET` 300, `PERMIT_DAILY_BUDGET` 1,000,
`INVITE_EMAIL_DAILY_BUDGET` 500) let free accounts together use at most 70%,
so paying users always have the rest. Florida licence checks download DBPR's
whole licensee file on a cache miss, so misses across all users are capped at
`DBPR_DAILY_DOWNLOADS` (default 200) a day (CD-12).

Clients use `@homegentic/shared/aiChecks`: they retry a short `slow_down`
(≤ 10 s) at most twice, doubling the wait with jitter, and show the other
refusals as messages.

Also set a monthly spend limit in the Anthropic console as the last backstop.

## Financial basis

The cost model behind these limits (what each call costs, what each user type
costs to serve, margins and scale) is in [UNIT_ECONOMICS.md](UNIT_ECONOMICS.md),
generated from `scripts/cost-model/assumptions.mjs`. In short, at Sonnet 5.5
list prices with the tool list cached: a chat answer costs about $0.007, one
`/api/agent` request about $0.013, and a document or bill extraction about
$0.020. A typical Pro user costs about $1.60 a month against $4.92 of
revenue; a heavy one runs at a loss, which is why Pro keeps 10 agent calls a day and chat is
capped at 200 a day. Free's weekly agent allowance and the shared
`FREE_AI_DAILY_TOKEN_BUDGET` keep the Free tier's AI spend bounded.

## UX behaviour when limit is reached

- The agent call counter is checked **before** the request is processed.
- When the limit is reached the API returns HTTP 429 with a JSON body (the error key says "daily" for historical reasons but applies to weekly-reset tiers too — `resetsAt` always carries the real reset time):
  ```json
  { "error": "daily_agent_limit_reached", "limit": 5, "resetsAt": "<ISO timestamp>" }
  ```
- The frontend shows: **"You've used your 5 AI assistant calls for today. Resets at midnight UTC — or upgrade for more."** (Free's copy should say "this week" / "resets Monday" instead — the underlying `resetsAt` value is already correct for either.)
- Chat calls are never blocked by this limit.

## Implementation notes

- Limits are enforced in the voice Worker (`agents/voice/src/rateLimiter.ts`), not the frontend. Frontend enforcement is display-only. `TIER_LIMITS`/`TIER_PERIOD` live in `agents/voice/agentLimiter.ts`.
- The counter key is `agent:{principal}:{periodKey}`, where `periodKey` is `YYYY-MM-DD` for daily-reset tiers or an ISO week string `YYYY-Www` for weekly-reset tiers (currently just Free) — stored in Redis/Workers KV (or in-memory map for single-instance deployments).
- The user's subscription tier is read from the payment canister on each request and cached for 5 minutes per principal to avoid canister round-trips on every call.
- The `principal` comes from the `x-principal` header, which the frontend sets after Internet Identity authentication. Unauthenticated requests are treated as Free tier.

## Agentic turn limit

Independent of the daily call limit, each individual agent call is capped at **5 internal tool-use turns** for all tiers. This caps the per-call cost ceiling at ~$0.050 (5 turns × worst-case token counts). The turn limit is enforced by the client loop (`MAX_TURNS` in `frontend/src/hooks/useVoiceAgent.ts`); each turn is still one counted `/api/agent` call on the Worker.

The generic read tool `query_home_records` (OQL over job, bills and property) gets no allowance of its own: each of its round trips is one of these counted calls, and its result is capped at 6,000 characters (`frontend/src/services/homeRecords.ts`).

Multi-step tasks (storm prep, insurance claim packet, closing handoff check) get no allowance of their own either. A task usually takes three counted calls: `prepare_home_task` (a read-only gather in the browser), one `propose_plan` with every write, and the answer after the user's review card. It fits inside the 5-turn limit, so a Free account's 10 weekly calls cover about three tasks. Only the four curated writes in `PLAN_STEP_TOOLS` (`frontend/src/services/assistantPlan.ts`) can be plan steps, and none runs until the user approves it on the card.
