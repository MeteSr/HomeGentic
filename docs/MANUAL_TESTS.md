# HomeGentic — Manual Test Runbook

These tests cover critical user journeys that automated tests cannot adequately
validate: real authentication, two-device workflows, subjective quality, and
on-chain state persistence.

Run these before any production deployment and after significant changes to
auth, job signing, payment, reports, or the voice agent.

---

## Targeting Testnet vs. Local

All tests below can run against either environment. Set the target once before
starting:

**Local replica**
```bash
make dev           # starts dfx + deploys all canisters + runs frontend at :5173
```

**Testnet** (recommended for pre-production sign-off)
```bash
bash scripts/deploy.sh testnet
# then start the frontend pointed at testnet canister IDs:
cd frontend && VITE_DFX_NETWORK=testnet npm run dev
```

Testnet canisters persist state across sessions, making it the right environment
for multi-day, multi-device, and upgrade-safety tests. Local is fine for
single-session flows.

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
- A running ICP local replica (`dfx start --background`) or testnet target
- Chrome or Firefox with no existing II session
- A configured Internet Identity anchor (or create one during the test)

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open a fresh browser profile (no cookies, no extensions pre-loaded) | Clean slate |
| 2 | Navigate to `http://localhost:5173` (or testnet URL) | Landing page renders; no console errors |
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

**Note:** Basic ($10/mo) is the entry tier — there is no Free tier. A newly
registered user must complete checkout before accessing the dashboard.

**Prerequisites**
- A user account currently on the **Basic** tier (newly registered or downgraded)
- Local replica or testnet running with `payment` canister deployed
- Stripe test card `4242 4242 4242 4242` available for checkout steps

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Log in and navigate to `/settings` | Subscription tab shows **Basic** plan |
| 2 | Confirm the property limit: navigate to `/properties/new` and register a second property | Should be blocked — Basic allows 1 property |
| 3 | Return to `/settings`, click **Subscription** tab | Basic plan card + upgrade options visible |
| 4 | Click **Upgrade** on the **Pro** plan | Redirects to checkout or loading spinner on button |
| 5 | Complete Stripe checkout with test card | Redirected to `/payment-success`; toast "Upgraded to Pro!" |
| 6 | Confirm the Subscription tab now shows **Pro** | Plan card updated in current session |
| 7 | Hard-refresh the page | Still shows **Pro** — tier persisted to canister |
| 8 | Open a new tab, navigate to `/settings` → Subscription | Still Pro |
| 9 | Navigate to `/properties/new` and register a second property | Succeeds — Pro allows up to 5 properties |
| 10 | Return to `/settings` → Subscription → click **Upgrade** to Premium | Confirm switch succeeds and persists after hard refresh |

**Watch for**
- UI showing Pro but canister still returning Basic on next session (optimistic update bug)
- Tier-gated property limit not relaxing without a full reload
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
| 8 | Verify the **Basic** tier photo cap: attempt to upload 6 photos to one job | 6th upload blocked with tier message (Basic = 5 photos/job) |

**Watch for**
- Duplicate upload silently succeeding (dedup not firing)
- Dedup error shown to user without a friendly message
- Photo count in job detail not matching actual stored photos
- Tier cap not enforced (6th photo accepted on Basic tier)

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

## MT-08 — FSBO Listing + 360° Panorama Tour

**Why manual:** The FSBO listing lifecycle involves real canister state
transitions (draft → active → offer → accepted). The PlayCanvas WebGL renderer
cannot be exercised in jsdom — only a real browser confirms the 360° tour loads,
the sphere renders correctly, and room navigation works.

**Prerequisites**
- A Pro or Premium homeowner account (FSBO requires at least one verified job for
  the trust score to be non-zero)
- A 360° equirectangular photo (JPG/PNG, ~4000×2000px) — a test file works
- Two browsers: homeowner (authenticated) + buyer (incognito)

**Steps — Listing activation**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to `/dashboard` | Property card has a **Start Listing** CTA |
| 2 | Click **Start Listing** | `InitListingModal` opens; choose **FSBO** |
| 3 | Set list price (e.g. $450,000) and activate | Listing created; redirected to `/my-listing/:propertyId` |
| 4 | Verify listing status badge = **Active** | Status shown correctly |
| 5 | Navigate to `/for-sale/:propertyId` in incognito | Public listing renders: price, score badge, property details |
| 6 | Confirm no login prompt on the public page | Public page, no auth required |

**Steps — 360° panorama management**

| # | Action | Expected Result |
|---|--------|-----------------|
| 7 | In the homeowner session, on `/my-listing/:propertyId`, scroll to the **360° Tour** section | Section renders with empty state and an add form |
| 8 | Enter Room Label = "Living Room" and select the 360° test photo | Form accepts both inputs |
| 9 | Click **Add Room** | Entry appears in the panorama list; "Living Room" shown |
| 10 | Add a second entry: Room Label = "Kitchen", different photo file | Second entry appears; order preserved |
| 11 | In incognito, refresh the public listing at `/for-sale/:propertyId` | A **360° Tour** button or panel appears |
| 12 | Click the 360° Tour button | PlayCanvas viewer loads; no blank canvas or error |
| 13 | Click and drag inside the viewer | Camera pans smoothly — equirectangular texture covers the full sphere |
| 14 | If multiple rooms exist, click a room label in the navigation panel | Viewer transitions to that room's photo |
| 15 | Return to the homeowner session; click **Remove** on "Kitchen" | Entry removed; kitchen no longer in public view |

**Steps — offer flow**

| # | Action | Who | Expected Result |
|---|--------|-----|-----------------|
| 16 | In incognito, click **Request Showing** on the public listing | Buyer | Form submits; confirmation shown |
| 17 | In homeowner session, showing request appears in listing manager | Homeowner | Inbox updated |
| 18 | In incognito, submit an offer (use the offer form on the public page) | Buyer | Offer confirmed |
| 19 | In homeowner session, offer appears in offer inbox | Homeowner | Offer amount and buyer contact shown |
| 20 | Click **Accept** on the offer | Homeowner | Listing status changes to "Under Contract" |
| 21 | Refresh the public listing in incognito | Buyer | "Under Contract" or equivalent status shown; offer form hidden |

**Watch for**
- PlayCanvas canvas remaining blank (WebGL context not acquired — check browser WebGL support)
- Panorama photos not persisting after page reload (canister write not flushing)
- Room labels not rendering over the 3D scene
- Offer accept not updating the listing status on the public page without reload

---

## MT-09 — Sensor / IoT Device → Auto-Job

**Why manual:** The sensor canister's auto-job creation path runs on-chain.
No E2E test fires a real IoT event against a deployed canister; the auto-job
write and the alert resolution flow require a human to confirm the full cycle.

**Prerequisites**
- `sensor` canister deployed
- A registered property with at least one verified job

**Steps**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to `/sensors` | Page loads; device list empty if first visit |
| 2 | Click **Add Device** | `RegisterDeviceModal` opens |
| 3 | Select device type = **Moen Flo** (water leak), enter device name and property | Device registered; appears in device list with **Active** badge |
| 4 | Trigger a test Critical event (use the admin panel or the canister CLI: `dfx canister call sensor addEvent '(...)' `) | Event logged; alert appears in the **Pending Alerts** panel |
| 5 | Confirm the alert severity badge = **Critical** | Badge shows correctly |
| 6 | Navigate to `/dashboard` → Activity feed | Auto-created pending job appears in the feed |
| 7 | Navigate to the pending job | Status = pending; description references the sensor device |
| 8 | Return to `/sensors`; click **Acknowledge** on the alert | Alert moves out of pending; active alert count decrements |
| 9 | Deactivate the device | Badge changes to **Inactive**; device no longer triggers future alerts |

**Watch for**
- Alert not appearing without a manual page refresh (real-time polling or push needed)
- Auto-job not linked to the correct property
- Acknowledging an alert not clearing it from the pending panel

---

## MT-10 — Out-of-Network Contractor Sign-off

**Why manual:** This flow requires two people with two different devices — a
homeowner who generates the invite link, and a contractor who has no HomeGentic
account. It cannot be simulated with the standard principal injection.

**Prerequisites**
- A homeowner session with a job in "awaiting contractor" status
- A second device (phone or another browser profile) to act as the contractor
- No HomeGentic login on the contractor device

**Steps**

| # | Action | Who | Expected Result |
|---|--------|-----|-----------------|
| 1 | Open the job detail page for the target job | Homeowner | Job detail loads |
| 2 | Click **Invite Contractor** | Homeowner | `InviteContractorModal` opens; shows unique link + QR code |
| 3 | Copy or QR-scan the invite link on the contractor device | Contractor | `/verify/:token` page loads without a login prompt |
| 4 | Confirm the page shows the read-only job preview (description, address, date) | Contractor | Correct job details displayed |
| 5 | Click **Confirm & Sign** | Contractor | Success confirmation shown; token consumed |
| 6 | In the homeowner session, refresh the job | Homeowner | Job status = **Verified**; contractor signature shown |
| 7 | Attempt to use the same invite link again on the contractor device | Contractor | Error: "This link has already been used" or token-expired message |

**Watch for**
- Job preview leaking sensitive data beyond description/address/date
- Token not being consumed after first use (reuse attack surface)
- Homeowner signature overwritten or cleared after contractor signs

---

## MT-11 — Push Notifications

**Why manual:** Browser push permission dialogs and actual push delivery
require a real browser with a service worker registered. Automated tests
mock the push subscription endpoint and cannot confirm delivery.

**Prerequisites**
- A modern browser with push notification support (Chrome or Firefox)
- Voice agent (`cd agents/voice && npm run dev`) and notification relay running
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set in the notification relay `.env`
- A contractor account to receive job-match notifications

**Steps — subscribe**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Log in as a contractor and navigate to `/settings` → Notifications tab | Notification preferences shown |
| 2 | Enable **Job Match Alerts** | Browser permission prompt appears |
| 3 | Click **Allow** in the browser prompt | Permission granted; subscription confirmed |
| 4 | Hard-refresh the page | Notification toggle still enabled — subscription persisted |

**Steps — receive a push**

| # | Action | Expected Result |
|---|--------|-----------------|
| 5 | In a separate homeowner session, post a new quote request matching the contractor's specialty | Quote request created |
| 6 | Wait up to 30 seconds on the contractor session | Browser push notification appears (even if tab is in background) |
| 7 | Click the notification | Browser focuses the app and navigates to the relevant quote |
| 8 | Minimize the browser entirely and repeat step 5 | Push notification still delivered to OS notification tray |

**Steps — unsubscribe**

| # | Action | Expected Result |
|---|--------|-----------------|
| 9 | Return to `/settings` → Notifications; disable **Job Match Alerts** | Toggle off; no confirmation |
| 10 | Post another matching quote request | No push notification received |

**Watch for**
- Service worker not registering (check DevTools → Application → Service Workers)
- Push delivered but notification click not navigating to the correct page
- Re-enabling notifications after a deny requiring manual browser permission reset

---

## Sign-Off

| Test | Date | Tester | Environment | Result | Notes |
|------|------|--------|-------------|--------|-------|
| MT-01 Internet Identity | | | | | |
| MT-02 Dual-Signature Jobs | | | | | |
| MT-03 Subscription Upgrade | | | | | |
| MT-04 Report Share + Revoke | | | | | |
| MT-05 Photo Deduplication | | | | | |
| MT-06 Voice Agent | | | | | |
| MT-07 Instant Forecast | | | | | |
| MT-08 FSBO Listing + 360° Panorama | | | | | |
| MT-09 Sensor / Auto-Job | | | | | |
| MT-10 Out-of-Network Contractor Sign-off | | | | | |
| MT-11 Push Notifications | | | | | |
