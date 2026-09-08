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
| **Pro** ($59/yr) | 10 | Unlimited | The only purchasable homeowner plan |
| **ContractorFree** | 0 | 3 | Same as Free |
| **ContractorPro** ($40/mo) | 10 | Unlimited | |
| **RealtorFree** | 0 | 3 | Same as Free |
| **RealtorPro** ($30/mo) | 10 | Unlimited | Same as ContractorPro |

Homeowner pricing collapsed from three tiers (Basic/Pro/Premium) to a single
$59/year Pro plan carrying the old Premium tier's property (20), photo
(30/job), and quote-request (unlimited) limits. Its agent-call limit is the
exception: it keeps the old Pro tier's 10/day cap rather than Premium's
20/day — at $59/year, 20/day would run the tier at a steep loss (see
"Financial basis" below). Basic ($10/mo, 5/day) and old Premium ($40/mo,
20/day) are retired as purchase options; they remain valid tier values
purely so subscribers grandfathered in before the change keep their
original limits enforced until they renew, at which point they move to
the new Pro tier and price.

## Financial basis

Model: `claude-sonnet-4-6` at $3.00/1M input tokens, $15.00/1M output tokens.

**Note:** the tables below mix a legacy monthly-billed tier structure
(Basic/Pro/Premium, kept only for grandfathered subscribers — see above)
with the current $59/**year** Pro plan. Pro's costs are computed over a
full year, then divided by 12 for a monthly-equivalent figure so it's
comparable to the legacy rows. Its Stripe fee is a single annual charge
(2.9% + $0.30 on $59 ≈ $2.01/yr), not a recurring monthly one.

### Worst case (every user maxes their limit every day)

| Tier | Agent AI cost | Chat AI cost (est.) | Stripe fee | ICP cycles | **Variable cost** | **Revenue** | **Gross margin** |
|---|---|---|---|---|---|---|---|
| Basic $10/mo (legacy) | $4.50 | $1.05 | $0.59 | $0.10 | $6.24 | $10.00 | **37.6%** |
| Premium $40/mo (legacy) | $18.00 | $1.05 | $1.47 | $0.30 | $20.82 | $40.00 | **47.9%** |
| **Pro $59/yr (current)** | $9.00/mo | $1.05/mo | $0.17/mo | $0.30/mo | $10.52/mo | $4.92/mo | **‑114%** |

Chat cost estimated at 5 calls/day average across all tiers. Pro's ICP
cycles figure uses Premium's $0.30/mo (it carries Premium's storage
limits — 20 properties, 30 photos/job).

### Realistic (~45–55% active days, ~33% of the worst-case agent cost, 3 chat/day avg)

| Tier | Agent AI cost | Chat AI cost | Stripe fee | ICP cycles | **Variable cost** | **Revenue** | **Gross margin** |
|---|---|---|---|---|---|---|---|
| Basic $10/mo (legacy) | $1.32 | $0.63 | $0.59 | $0.10 | $2.64 | $10.00 | **73.6%** |
| Premium $40/mo (legacy) | $5.94 | $0.63 | $1.47 | $0.30 | $8.34 | $40.00 | **79.2%** |
| **Pro $59/yr (current)** | $2.97/mo | $0.63/mo | $0.17/mo | $0.30/mo | $4.07/mo | $4.92/mo | **17.3%** |

### Risk flag

**Pro runs at a loss in the worst case (‑114%) and a thin 17.3% margin
even under the realistic-usage assumption.** This is a direct consequence
of the $59/year price point (~$4.92/mo-equivalent) sitting well below
what the old monthly tiers charged, while agent/chat/infra costs per
active user are largely unchanged. Lowering Pro's agent-call limit from
Premium's 20/day to 10/day (done as part of this pricing consolidation)
avoids the worse ‑302%/‑45% outcome that 20/day would produce, but does
not fully solve the underlying gap — at this price, margin is
usage-sensitive in a way none of the legacy tiers were. Monitor real
Pro agent-call utilization closely post-launch; if realized usage tracks
closer to the worst case than the realistic estimate, this tier will
need either a lower agent-call limit, a higher price, or both before
scaling meaningfully.

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
