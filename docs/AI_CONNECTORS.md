# Getting users onto the ChatGPT and Claude connectors

Written 2026-11-10. How HomeGentic could get more homeowners to ask about their home through ICP MCP (the
ChatGPT and Claude connector, see [ARCHITECTURE.md → AI Assistants](ARCHITECTURE.md#ai-assistants-icp-mcp))
instead of the in-app assistant, and what to watch while doing it.

## Status (2026-11-10, PR #767)

Built, all hidden until `VITE_AI_CONNECTORS=1` (set it as a repo variable for the mainnet deploy once the
ICP MCP manifest is live there):

- Recommendation 2: `maintenance.getScheduleForProperties` (composite query) and `report.getMyReports`
  (query), named in each `getApiDoc`.
- Recommendation 3: Settings → AI assistants (`frontend/src/components/AiAssistantsSettings.tsx`): setup steps
  for ChatGPT and Claude, consent modes, how to revoke, sample prompts with "Ask in ChatGPT / Claude" links,
  and an "I've connected it" mark.
- Recommendations 4 and 5: the dashboard ask bar shows "or ask in ChatGPT / Claude" before any chat is used:
  prefilled links once the user has marked it connected, otherwise a link to the setup tab.
- Guardrail: the access-checked update reads now have a per-caller limit of 120 a minute (`setReadRateLimit`),
  separate from the 30-a-minute write limit, which `bills` now has too.
- The chat-cap message no longer promises Pro "unlimited answers" (Pro chat is capped at 200 a day).

Owner: the registry request (recommendation 1) is drafted for mcp@dfinity.org; send it after the first mainnet
deploy. Not built yet: the onboarding card and email (6), in-context prompts on other pages (7), mobile (9).

## Why it's worth doing

A question asked through a connector costs us about $0.0001 in canister update calls. The same question costs
about $0.007 as in-app chat and $0.013 as an agent call, because in the app we pay Claude's tokens. Through a
connector the user's own ChatGPT or Claude plan pays for the model. See the "ChatGPT and Claude connectors"
section of [UNIT_ECONOMICS.md](UNIT_ECONOMICS.md) (PR #766) for the per-user numbers.

Tier limits don't move. Properties, photos, documents, open quotes and bill tracking are enforced in the
canisters, so a Free user gets the same limits through a connector as in the app. What a connector does give
a Free user is unlimited questions, which the in-app assistant caps at 3 chats a day.

## Where users get stuck today

1. **It isn't live.** The connector only reaches mainnet canisters and an `homegentic.app` served from the
   IC. Nothing is on mainnet yet, so none of this can ship before the first mainnet deploy.
2. **Nobody knows it exists.** The only mention in the product is the Privacy Policy.
3. **The name doesn't work.** ICP MCP refuses a bare "HomeGentic" unless DFINITY adds us to its built-in
   app registry, so users must type `homegentic.app`.
4. **"Questions only" sees little.** On Internet Identity's consent screen, "Questions only" allows queries
   only. Most per-property reads (`job.getJobsForProperty`, `bills.getBillsForProperty`,
   `recurring.getByProperty`, `maintenance.getScheduleByProperty`, `report.getReport`) are update calls
   because they check access with `property`, so a "Questions only" user sees much less than they expect.
5. **Setup is several steps** (add the connector, sign in with Internet Identity, pick a mode and session
   length) and each one loses people.

## Recommendations, in order

### Do first (needed before anything else helps)

1. **Ask DFINITY to add HomeGentic to the known-app registry** (mcp@dfinity.org, or an issue on
   dfinity/imcp2) so "ask HomeGentic about my roof" works without a URL. Free, and the biggest single drop in
   friction. Owner task.
2. **Add composite-query versions of the reads people will ask about**, so "Questions only" users get real
   answers. `job.getJobsForProperties`, `bills.getBillsForProperties` and `recurring.getScheduleForProperties`
   exist already. Add the same for maintenance schedules and for a report summary, then list the query names
   first in each `ApiDoc.mo`. Queries also cost us nothing, which makes the connector cheaper still.
3. **A "Use HomeGentic in ChatGPT or Claude" page** under Settings (and linked from the FAQ): three setup
   steps with screenshots, which consent mode to pick and why, how to revoke, and 5 to 8 copyable sample
   prompts ("What maintenance is due at my house this spring?", "How much did I spend on utilities last
   quarter, and was anything unusual?", "Draft a quote request for my water heater"). This is the page every
   other prompt links to. Ship it behind a flag that turns on with the first mainnet deploy, so the copy never
   describes something that doesn't work yet.

### Then (cheap prompts that send people to that page)

4. **"Ask in ChatGPT" and "Ask in Claude" buttons next to the in-app ask bar.** Both apps accept a prefilled
   prompt in the URL (`https://chatgpt.com/?q=…`, `https://claude.ai/new?q=…`). Prefill a prompt that names
   `homegentic.app`. Show them to users who have set the connector up (a "I've connected it" tick on the
   setup page is enough) and a "Set it up" link to everyone else.
5. **Don't lead with it at the daily chat cap.** Once a Free user has used their 3 chats, we've already paid
   for them, so pointing at the connector there saves nothing; it only competes with the Pro offer. The
   saving comes from questions that never reach the in-app assistant, so promote the connector before the
   first chat: on the empty ask bar ("Ask here, or in your own ChatGPT or Claude"), and for Pro users, who
   can ask 200 a day and cost the most. A small "or ask in ChatGPT or Claude" link under the Pro offer at the
   cap is fine as a fallback.
6. **One onboarding card and one email.** A dismissible dashboard card after the first property is added, and
   a section in the welcome email (or in the first weekly Home Pulse), both pointing at the setup page.
7. **Sample prompts in context.** Short "Ask your assistant" lines on the pages where a question is natural:
   Bills ("Why was March's electric bill high?"), Maintenance ("What should I do before hurricane season?"),
   the Report page ("Summarise my home's records for a buyer").

### Later

8. **Show what it saved them**, not us: on the setup page, "Unlimited questions with your own ChatGPT or
   Claude plan". Don't show our cost numbers.
9. **Mobile:** the same buttons as deep links into the ChatGPT and Claude apps, once the web version shows
   people use them.

### Not recommended now

- **Our own MCP server or a branded directory listing.** It means OAuth around Internet Identity, review in two
  directories and new attack surface, and ICP MCP already does the job. Revisit only if the registry entry
  (1) is refused or the generic connector proves too clumsy.
- **Moving paid features onto the connector or giving Pro "connector extras".** The connector can't tell
  tiers apart beyond what the canisters already enforce, and Pro's value (20 homes, bill tracking, 30 photos
  a job, 250 documents, unlimited quotes) already holds whatever channel the user asks through.

## Keeping Pro worth buying

The in-app assistant is part of Pro's pitch (10 agent calls a day, 200 chats). If free users get unlimited
questions elsewhere, that part of the pitch weakens. Keep the upgrade prompt where it is, lead Pro's copy
with what only Pro unlocks (more homes, bill tracking, storage, unlimited quotes, the voice ask bar), and
watch Free-to-Pro conversion for the first month after the setup page ships. If it drops noticeably, drop the
fallback link at the chat cap (5) before doing anything else.

## Abuse and cost guardrails

- Every write on the 8 exposed canisters is now limited to 30 calls a minute per user, `bills` included
  (it had no limit before 2026-11-10). PR #766 puts the worst case at about $8 a day per principal, and free
  accounts cost nothing to create, so an attacker can multiply it.
- The access-checked reads above are update calls with **no** per-minute limit on any canister, and each one
  makes a call to `property`. Moving them to composite queries (2) fixes the cost; counting them against the
  same per-minute limit is the fallback if traffic shows abuse.
- Threshold-key calls reachable through the connector stay under their own caps (report signing 500/day,
  quote reveals 500/day).
- The connector blocks transfers, and `payment` is not exposed, so a connector can't charge a user.
- `getApiDoc` text must stay accurate and must never instruct the assistant (App Operator Terms).

## Measuring it

Connector calls come from the user's own principal, so the canisters can't tell them from app calls, and the
Worker never sees them. Measure indirectly: clicks on the Ask buttons and setup-page visits (frontend
analytics), the "I've connected it" tick, a one-question survey on the setup page, and in-app chats per active
user (a drop while canister calls per user hold steady is connector use).
