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

## Per-tier limits

Chat limits always reset daily (midnight UTC). Agent-call limits reset on
a per-tier period — daily for every tier except Free, which resets weekly
(Monday 00:00 UTC, ISO week) — see `TIER_PERIOD` in
`agents/voice/agentLimiter.ts`.

| Tier | Agent calls | Chat calls/day | Notes |
|---|---|---|---|
| **Free** | 10/week | 3 | Homeowner's real (unpaid) tier — weekly reset, not daily |
| **Pro** ($59/yr) | 10/day | Unlimited | The only purchasable homeowner plan |
| **ContractorFree** | 0 | 3 | No agentic access |
| **ContractorPro** ($40/mo) | 10/day | Unlimited | |
| **RealtorFree** | 0 | 3 | No agentic access |
| **RealtorPro** ($30/mo) | 10/day | Unlimited | Same as ContractorPro |

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

Free is no longer fully blocked from the app: it gets 1 property, 5
photos/job, 3 open quote requests, job logging, Bid to List, and the
AI/intelligence feature set (Market Intelligence, Predictive Maintenance,
Warranty Wallet, Recurring Services, Sensors, People) — only Insurance
Defense and Resale Ready stay Pro-only. Its agent-call allowance is
deliberately both smaller and paced weekly rather than daily: at 10/day it
would cost roughly the same as Pro's own allowance while returning $0 in
revenue (see "Financial basis" below).

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
| **Free (current)** | $1.30/mo | $0.63/mo | $0.00 | $0.10/mo | $2.03/mo | $0.00 | **n/a — pure cost** |
| Basic $10/mo (legacy) | $4.50 | $1.05 | $0.59 | $0.10 | $6.24 | $10.00 | **37.6%** |
| Premium $40/mo (legacy) | $18.00 | $1.05 | $1.47 | $0.30 | $20.82 | $40.00 | **47.9%** |
| **Pro $59/yr (current)** | $9.00/mo | $1.05/mo | $0.17/mo | $0.30/mo | $10.52/mo | $4.92/mo | **‑114%** |

Chat cost estimated at 5 calls/day average for tiers with no hard chat
cap; Free's chat cost uses its actual hard cap of 3/day (worst case and
realistic are the same number for Free's chat, since there's no room
above the cap to average down from). Free's agent cost assumes its
10/week cap maxed every week (10 × 4.345 weeks/mo × $0.030). Free's ICP
cycles figure reuses Basic's $0.10/mo (same 1-property/5-photos-per-job
limits). Pro's ICP cycles figure uses Premium's $0.30/mo (it carries
Premium's storage limits — 20 properties, 30 photos/job).

### Realistic (~45–55% active days, ~33% of the worst-case agent cost, 3 chat/day avg)

| Tier | Agent AI cost | Chat AI cost | Stripe fee | ICP cycles | **Variable cost** | **Revenue** | **Gross margin** |
|---|---|---|---|---|---|---|---|
| **Free (current)** | $0.43/mo | $0.63/mo | $0.00 | $0.10/mo | $1.16/mo | $0.00 | **n/a — pure cost** |
| Basic $10/mo (legacy) | $1.32 | $0.63 | $0.59 | $0.10 | $2.64 | $10.00 | **73.6%** |
| Premium $40/mo (legacy) | $5.94 | $0.63 | $1.47 | $0.30 | $8.34 | $40.00 | **79.2%** |
| **Pro $59/yr (current)** | $2.97/mo | $0.63/mo | $0.17/mo | $0.30/mo | $4.07/mo | $4.92/mo | **17.3%** |

### Risk flag

**Free costs roughly $1.16–$2.03/mo per active user with $0 revenue to
offset it — every free-tier agent/chat call is a pure liability, unlike
Pro where at least a thin margin exists.** At scale this adds up fast:
30,000 active free users at the realistic estimate is ~$417,600/year in
unrecovered AI cost; at the worst case (everyone maxes their weekly
allowance) that's ~$730,800/year. The 10/week pacing (vs. a hypothetical
10/day) keeps this roughly 7x smaller than it would otherwise be, but it
doesn't eliminate the exposure — Free has no price to raise if usage
comes in high, only the call limit itself. Monitor real Free-tier agent
utilization closely; if a meaningful share of free users regularly hit
10/week, this is the first lever to pull before it's a material cost
line, since there's no revenue lever to pull instead.

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
- When the limit is reached the API returns HTTP 429 with a JSON body (the error key says "daily" for historical reasons but applies to weekly-reset tiers too — `resetsAt` always carries the real reset time):
  ```json
  { "error": "daily_agent_limit_reached", "limit": 5, "resetsAt": "<ISO timestamp>" }
  ```
- The frontend shows: **"You've used your 5 AI assistant calls for today. Resets at midnight UTC — or upgrade for more."** (Free's copy should say "this week" / "resets Monday" instead — the underlying `resetsAt` value is already correct for either.)
- Chat calls are never blocked by this limit.

## Implementation notes

- Limits are enforced in the Express voice agent server (`agents/voice/server.ts`) and its Cloudflare Workers equivalent (`agents/voice/src/rateLimiter.ts`), not the frontend. Frontend enforcement is display-only. Both implementations share the same `TIER_LIMITS`/`TIER_PERIOD` source in `agents/voice/agentLimiter.ts`.
- The counter key is `agent:{principal}:{periodKey}`, where `periodKey` is `YYYY-MM-DD` for daily-reset tiers or an ISO week string `YYYY-Www` for weekly-reset tiers (currently just Free) — stored in Redis/Workers KV (or in-memory map for single-instance deployments).
- The user's subscription tier is read from the payment canister on each request and cached for 5 minutes per principal to avoid canister round-trips on every call.
- The `principal` comes from the `x-principal` header, which the frontend sets after Internet Identity authentication. Unauthenticated requests are treated as Free tier.

## Agentic turn limit

Independent of the daily call limit, each individual agent call is capped at **5 internal tool-use turns** for all tiers. This caps the per-call cost ceiling at ~$0.050 (5 turns × worst-case token counts). The turn limit is already enforced in `agents/voice/server.ts`.
