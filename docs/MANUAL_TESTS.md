# HomeGentic — Manual Test Runbook

These tests cover critical user journeys that automated tests cannot adequately
validate: real authentication, two-device workflows, subjective quality, and
on-chain state persistence.

Run these before any production deployment and after significant changes to
auth, job signing, payment, reports, or the voice agent.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| PASS   | Step behaved exactly as described |
| FAIL   | Step produced unexpected behavior — log details |
| SKIP   | Prerequisite not available — note why |

---

## MT-01 — Internet Identity Login (Fresh Browser Profile)

**Why manual:** Every automated E2E test bypasses II with a principal injection.
The real production auth path has never been exercised by a test runner.

**Prerequisites**
- A running ICP local replica (`dfx start --background`) or mainnet target
- Chrome or Firefox with no existing II session
- A configured Internet Identity anchor (or create one during the test)

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open a fresh browser profile (no cookies, no extensions pre-loaded) | Clean slate |
| 2 | Navigate to `http://localhost:5173` (or prod URL) | Landing page renders; no console errors |
| 3 | Click **Sign In** or **Get Started** | Login page shown |
| 4 | Click **Sign in with Internet Identity** | II popup or redirect opens |
| 5 | Authenticate with an existing anchor, or create a new one | II flow completes; popup closes |
| 6 | Confirm you land on `/dashboard` | Dashboard renders with your principal shown in Settings |
| 7 | Hard-refresh the page (`Ctrl+Shift+R`) | Session persists; no re-authentication prompt |
| 8 | Open a second tab, navigate to `/dashboard` | Authenticated; same session |
| 9 | Click **Log out** in Settings | Redirected to `/`; principal cleared |
| 10 | Navigate to `/dashboard` directly | Redirected to `/login` |

**Watch for**
- Any `auth-client` console errors during the II handshake
- Session not persisting after hard refresh (auth-client delegation TTL issue)
- Blank screen or infinite spinner after returning from II

---

## MT-02 — Dual-Signature Job Verification (Two Sessions)

**Why manual:** The dual-sig trust mechanism requires two distinct authenticated
principals acting in sequence. This is the core trust differentiation of HomeGentic
and has never been tested across two real sessions.

**Prerequisites**
- Two Internet Identity anchors (or one anchor with two devices)
- Both sessions logged in simultaneously — use two browsers or two browser profiles
- A property registered and owned by **Session A**

**Steps**

| # | Action | Who | Expected Result |
|---|--------|-----|-----------------|
| 1 | In Session A, navigate to `/jobs/new` | Homeowner | Job creation form renders |
| 2 | Fill in: Service Type = HVAC, Contractor = "Test Contractor Co", Amount = $4,800, Date = today | Homeowner | Form accepts inputs |
| 3 | Toggle DIY **off** (contractor job) | Homeowner | Contractor name field visible |
| 4 | Submit the job | Homeowner | Job created; status = `pending` |
| 5 | Open the job detail page | Homeowner | Shows "Awaiting homeowner signature" |
| 6 | Click **Sign as Homeowner** | Homeowner | `homeownerSigned = true`; status = `awaiting contractor` |
| 7 | In Session B, navigate to the same job URL | Contractor | Job detail visible |
| 8 | Confirm contractor name matches | Contractor | Name shown correctly |
| 9 | Click **Sign as Contractor** | Contractor | `contractorSigned = true`; status = `verified` |
| 10 | In Session A, refresh the job | Homeowner | Status badge shows **Verified**; both signatures shown |
| 11 | Navigate to `/dashboard` in Session A | Homeowner | "Verified Jobs" count incremented by 1 |
| 12 | Navigate to `/properties/:id` in Session A | Homeowner | HomeGentic Score updated; timeline shows the verified job |

**Watch for**
- Job status not updating without a full page reload (stale Zustand cache)
- Contractor signature button visible to the homeowner (should be role-gated)
- Score not recalculating after the second signature

---

## MT-03 — Subscription Upgrade and Tier Persistence

**Why manual:** The E2E upgrade test mocks the canister call. This test
verifies the real `payment` canister writes the new tier, that the UI reflects
it on next load, and that tier-gated features unlock immediately.

**Prerequisites**
- A user account currently on the **Free** tier
- Local replica running with `payment` canister deployed

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Log in and navigate to `/settings` | Subscription tab shows **Free** plan |
| 2 | Confirm Warranty Wallet is gated: navigate to `/warranties` | Upgrade prompt shown, not the wallet UI |
| 3 | Return to `/settings`, click **Subscription** tab | Free plan card + upgrade options visible |
| 4 | Click **Upgrade** on the **Pro** plan | Loading spinner on button |
| 5 | Wait for confirmation toast ("Upgraded to Pro!") | Toast appears; no error |
| 6 | Confirm the Subscription tab now shows **Pro** | Plan card updated in current session |
| 7 | Hard-refresh the page | Still shows **Pro** — tier persisted to canister |
| 8 | Open a new tab, navigate to `/settings` → Subscription | Still Pro |
| 9 | Navigate to `/warranties` | Warranty Wallet renders (no upgrade gate) |
| 10 | Navigate to `/recurring` | Recurring Services renders (no upgrade gate) |
| 11 | Return to `/settings` → Subscription → click **Switch** to Premium | Confirm switch succeeds and persists |

**Watch for**
- UI showing Pro but canister still returning Free on next session (optimistic update bug)
- Tier-gated pages not unlocking without a full reload
- "Switch" button still showing upgrade options for the current tier

---

## MT-04 — Report Share Link → Revocation

**Why manual:** The generate and public-view paths are E2E-tested.
The visibility levels and revocation workflow — the part a buyer actually
depends on — are not.

**Prerequisites**
- A property with at least 2 verified jobs
- Two browsers open: one authenticated as the homeowner, one as incognito (buyer view)

**Steps**

| # | Action | Who | Expected Result |
|---|--------|-----|-----------------|
| 1 | In the authenticated session, navigate to a property detail page | Homeowner | Property page loads |
| 2 | Click **Generate Report** | Homeowner | Report modal opens |
| 3 | Set expiry = **30 days**, visibility = **Full** | Homeowner | Options selected |
| 4 | Click **Generate** | Homeowner | Report created; share link shown |
| 5 | Copy the share link | Homeowner | Link copied |
| 6 | In the incognito browser, open the share link | Buyer | Full report renders — address, score, job timeline visible |
| 7 | Confirm no login prompt shown | Buyer | Public view, no auth required |
| 8 | In the authenticated session, find the report in property detail and click **Revoke** | Homeowner | Revocation confirmed |
| 9 | In the incognito browser, refresh the share link | Buyer | Error state: "This report is no longer available" or equivalent |
| 10 | Confirm the revoked link also fails in a new incognito window | Buyer | Same error — not a cache artifact |
| 11 | Repeat steps 2–6 with visibility = **Score Only** | Both | Incognito sees score/grade but not job details |
| 12 | Repeat with expiry = **Never** and confirm report persists after 30+ seconds | Both | No premature expiry |

**Watch for**
- Revoked link still loading from browser cache (missing cache-control headers)
- Score-only visibility leaking job descriptions or contractor names
- Report content different between homeowner view and public share link

---

## MT-05 — Photo Deduplication Across Jobs

**Why manual:** The SHA-256 dedup logic is canister-side. No test uploads a
real file; no test verifies that a hash stored under job A is rejected
(or acknowledged as duplicate) under job B.

**Prerequisites**
- A property with at least one verified job
- A test image file saved locally (any JPEG or PNG, e.g. a screenshot)
- `photo` canister deployed

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to a job detail page for Job A | Job detail loads |
| 2 | Upload the test image | Photo count = 1; success toast |
| 3 | Navigate to Job A and upload the **same file** again | Dedup: either rejected ("already uploaded") or silently deduped — photo count stays at 1 |
| 4 | Navigate to a second job, Job B (same property) | Different job detail |
| 5 | Upload the same test image to Job B | Note the behavior: duplicate flagged? Accepted? Photo count? |
| 6 | Check photo counts across both jobs | Each job shows its own photo reference; canister stores 1 hash |
| 7 | Upload a **different** image to Job B | Photo count increments normally |
| 8 | Verify the Free tier photo cap: attempt to upload 6 photos to one job | 6th upload blocked with tier message |

**Watch for**
- Duplicate upload silently succeeding (dedup not firing)
- Dedup error shown to user without a friendly message
- Photo count in job detail not matching actual stored photos
- Tier cap not enforced (6th photo accepted on Free tier)

---

## MT-06 — Voice Agent (Real Microphone)

**Why manual:** The SpeechRecognition mock fires a clean transcript instantly.
Real speech degrades with accents, partial sentences, and ambient noise.
The TTS output quality also requires a human ear.

**Prerequisites**
- `ANTHROPIC_API_KEY` set in `.env`
- Voice proxy running (`cd agents/voice && npm run dev`)
- A property with jobs seeded (use `scripts/init-test-data.sh`)
- A real microphone available
- Speakers or headphones

**Test queries — work through each one, note quality**

| # | Say this (approximately) | Expected agent behavior |
|---|--------------------------|-------------------------|
| 1 | "What systems in my home need replacing soon?" | Lists Critical/Soon systems with urgency context |
| 2 | "How much should I budget for maintenance this year?" | Cites cost estimates from predictive maintenance |
| 3 | "Log a job — I replaced my water heater last week for twelve hundred dollars" | Calls `create_job` tool; confirms job created |
| 4 | "What's my HomeGentic score?" | Returns score value and grade |
| 5 | "Find me a plumber" | Calls `get_contractors` tool; returns contractor names |
| 6 | "Request a quote for roofing" | Calls `create_quote_request` tool; confirms request |
| 7 | "Show me ROI projects I should do before selling" | Calls market intelligence tool; returns ranked list |
| 8 | Speak a very short fragment: "HVAC" | Handles gracefully — doesn't crash or produce nonsense |
| 9 | Stay silent after clicking mic, then let it time out | Times out cleanly; returns to idle state |
| 10 | Ask something completely off-topic: "What's the weather?" | Responds helpfully within scope; doesn't invent home data |

**For each query, evaluate**
- Transcript accuracy: did it hear the right words?
- Response quality: correct, concise, natural for speech (2–3 sentences max)?
- TTS: does it sound natural at the end of the response?
- State machine: does the UI return to idle cleanly after each interaction?

**Watch for**
- Agent looping on tool calls (hitting MAX_TURNS = 5)
- Response too long for speech (more than ~30 seconds to read aloud)
- Tool called with wrong parameters (e.g. wrong property ID)
- Mic state stuck in "listening" after recognition fires

---

## MT-07 — Instant Forecast (Real Address)

**Why manual:** `computeTenYearBudget` is unit-tested against fixtures.
Whether the system ages, urgency ratings, and cost ranges feel accurate for
a real property is a product judgment no fixture can make.

**Prerequisites**
- A property address you know well (your own home, or one you can verify)
- The year it was built
- Knowledge of when major systems were last replaced (HVAC, roof, etc.)

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to `/instant-forecast` | Entry form renders |
| 2 | Enter the real address | Address field accepts it |
| 3 | Enter the correct year built | Year field accepts it |
| 4 | Click **Get Forecast** | URL updates; forecast table renders |
| 5 | Review each system's urgency rating | Does Critical/Soon/Good match your knowledge of the property? |
| 6 | Review the 10-year budget figure | Does the dollar amount seem reasonable for this age of home? |
| 7 | Find a system you know was recently replaced (e.g. HVAC in 2018) | It currently shows the year built as install year — likely wrong urgency |
| 8 | Edit the **Last Replaced** input for that system to the actual year | URL updates with `?hvac=2018` (or equivalent param) |
| 9 | Confirm urgency improves (less critical) | Urgency badge updates; budget figure decreases |
| 10 | Copy the URL and open it in a new tab | Overrides preserved; same forecast shown |
| 11 | Click **Save your forecast** | Navigates to `/properties/new?address=...&yearBuilt=...` |
| 12 | Confirm the address and year are pre-filled on the registration form | Fields populated from URL params |

**Watch for**
- System urgency wildly off from reality (lifespan constants may need tuning)
- Override input not accepting a valid year (validation too strict)
- Budget figure implausibly high or low (cost constants may need regional adjustment)
- "Save your forecast" link losing override params on navigation

---

## Sign-Off

| Test | Date | Tester | Result | Notes |
|------|------|--------|--------|-------|
| MT-01 Internet Identity | | | | |
| MT-02 Dual-Signature Jobs | | | | |
| MT-03 Subscription Upgrade | | | | |
| MT-04 Report Share + Revoke | | | | |
| MT-05 Photo Deduplication | | | | |
| MT-06 Voice Agent | | | | |
| MT-07 Instant Forecast | | | | |
