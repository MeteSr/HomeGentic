# AI Rate Limits

HomeGentic uses Claude (claude-sonnet-4-6) for two categories of AI calls. These categories are tracked and limited separately because their cost profiles differ significantly.

## Call categories

| Category | Endpoint | Avg cost/call | Counted toward limit |
|---|---|---|---|
| **Agent calls** | `POST /api/agent` | ~$0.030 (avg 3 tool-use turns) | **Yes** |
| **Chat calls** | `POST /api/chat`, `/api/maintenance-chat` | ~$0.007 | No |
| Document extraction | `POST /api/extract-document` | ~$0.005 | No |
| Other AI features | billing analysis, internet check, etc. | ~$0.005–$0.015 | No |

Agent calls are limited because they drive the majority of AI cost. A single agentic interaction involves multiple internal Claude API round-trips (up to 5 tool-use turns), each carrying the full conversation context. Chat calls are cheap enough that counting them would degrade the voice experience without meaningfully protecting margin.

## Per-tier daily limits

Limits reset at midnight UTC.

| Tier | Agent calls/day | Chat calls/day | Notes |
|---|---|---|---|
| **Free** | 0 | 3 | Chat only — no agentic access |
| **Basic** ($10/mo) | 5 | Unlimited | |
| **Pro** ($20/mo) | 10 | Unlimited | |
| **Premium** ($40/mo) | 20 | Unlimited | |
| **ContractorFree** | 0 | 3 | Same as Free |
| **ContractorPro** ($30/mo) | 10 | Unlimited | Same as Pro |

## Financial basis

Model: `claude-sonnet-4-6` at $3.00/1M input tokens, $15.00/1M output tokens.

### Worst case (every user maxes their limit every day, 30-day month)

| Tier | Agent AI cost | Chat AI cost (est.) | Stripe fee | ICP cycles | **Variable cost** | **Gross margin** |
|---|---|---|---|---|---|---|
| Basic $10 | $4.50 | $1.05 | $0.59 | $0.10 | $6.24 | **37.6%** |
| Pro $20 | $9.00 | $1.05 | $0.88 | $0.20 | $11.13 | **44.4%** |
| Premium $40 | $18.00 | $1.05 | $1.47 | $0.30 | $20.82 | **47.9%** |

Chat cost estimated at 5 calls/day average across all tiers.

### Realistic (~45–55% active days, 65% of agent limit used, 3 chat/day avg)

| Tier | Agent AI cost | Chat AI cost | Stripe fee | ICP cycles | **Variable cost** | **Gross margin** |
|---|---|---|---|---|---|---|
| Basic $10 | $1.32 | $0.63 | $0.59 | $0.10 | $2.64 | **73.6%** |
| Pro $20 | $2.97 | $0.63 | $0.88 | $0.20 | $4.68 | **76.6%** |
| Premium $40 | $5.94 | $0.63 | $1.47 | $0.30 | $8.34 | **79.2%** |

### Risk flag

Basic worst case margin (37.6%) is the tightest. If a cohort of Basic users consistently maxes their 5 agent calls every day, margin compresses quickly. Monitor agent call utilization per tier once live data is available and consider reducing Basic agent limit or raising price before scaling.

## UX behaviour when limit is reached

- The agent call counter is checked **before** the request is processed.
- When the daily limit is reached the API returns HTTP 429 with a JSON body:
  ```json
  { "error": "daily_agent_limit_reached", "limit": 5, "resetsAt": "<ISO timestamp>" }
  ```
- The frontend shows: **"You've used your 5 AI assistant calls for today. Resets at midnight UTC — or upgrade for more."**
- Chat calls are never blocked by this limit.

## Implementation notes

- Limits are enforced in the Express voice agent server (`agents/voice/server.ts`), not the frontend. Frontend enforcement is display-only.
- The counter key is `agent_calls:{principal}:{YYYY-MM-DD}` stored in Redis (or in-memory map for single-instance deployments).
- The user's subscription tier is read from the payment canister on each request and cached for 5 minutes per principal to avoid canister round-trips on every call.
- The `principal` comes from the `x-principal` header, which the frontend sets after Internet Identity authentication. Unauthenticated requests are treated as Free tier.

## Agentic turn limit

Independent of the daily call limit, each individual agent call is capped at **5 internal tool-use turns** for all tiers. This caps the per-call cost ceiling at ~$0.050 (5 turns × worst-case token counts). The turn limit is already enforced in `agents/voice/server.ts`.
