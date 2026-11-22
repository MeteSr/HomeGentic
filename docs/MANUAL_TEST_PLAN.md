# HomeGentic — Manual Test Plan

This plan covers the main user journeys on the web app and the mobile app, area by area, so a person can
check a build end to end before a release. Each case lists its preconditions, steps and expected results.

It sits next to two other kinds of testing:

- **Automated tests** (unit, Playwright E2E with injected mock data, PocketIC upgrade tests) cover logic and
  page rendering. They skip real Internet Identity, real canisters for most pages, real email, real Stripe and
  real phones. This plan is for those gaps.
- **[MANUAL_TESTS.md](MANUAL_TESTS.md)** holds eleven deep-dive runbooks (MT-01 to MT-11) for the riskiest
  flows. Where a case here overlaps one, it points to it instead of repeating the steps.

Expected results describe what the app does today (main, November 2026). If the app does something different,
log it as a failure even if the new behaviour looks better: either the app or this plan needs fixing, and the
copy rule is that what the app says must match what happens.

---

## 1. How to run this plan

### 1.1 Which cases to run

| Run | When | Cases | Time |
|---|---|---|---|
| **Smoke** | Every frontend, canister or mobile release | The cases tagged **Smoke** (listed in section 2) | about 1 hour |
| **Area** | A release that touches one area | Every case in that area, plus Smoke | varies |
| **Full** | Before a mainnet launch or a large release | Every case here, plus MT-01 to MT-11 | 1–2 days |

Priorities: **Smoke** = must pass to ship. **P1** = core journey, run on a full pass or when its area changes.
**P2** = secondary or edge behaviour.

### 1.2 Environments

| Environment | Use it for | How |
|---|---|---|
| Local | Single-session web flows | `make dev` (network + all canisters + frontend at :3000). Add `make dev-full` for the voice Worker and admin dashboard |
| Testnet | Sign-off, multi-day and multi-device flows, email, payments | `bash scripts/deploy.sh testnet`, frontend pointed at testnet IDs (see MANUAL_TESTS.md) |
| Mobile | Phone flows | An EAS preview or development build on a real iPhone and a real Android phone, pointed at testnet |

Some areas need extra services. Skip a case (mark it SKIP with the reason) when its service isn't set up:

| Service | Needed for | Setup |
|---|---|---|
| Voice Worker (`agents/voice`) | AI assistant, document/label scans, Stripe, flood lookup, licence check, recalls, inspection findings | `cd agents/voice && npm run dev` with `ANTHROPIC_API_KEY`; Stripe test keys for payment cases |
| Notifications relay (`agents/notifications`) | Every email and push case | `npm run dev` with `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFICATIONS_PUBLIC_URL`, and `property.addNotifier` done |
| Stripe test mode | Subscriptions, in-app contractor payments, referral-fee cards, agent platform fee | Connect (Express) and ACH enabled; webhooks for Checkout events and `account.updated` |
| `VITE_INBOX_DOMAIN` + Cloudflare Email Routing | Forwarded-invoice inbox | Hidden in the app when unset |
| `VITE_AI_CONNECTORS=1` | Settings → AI assistants and the "or ask in ChatGPT / Claude" links | Hidden when unset |

### 1.3 Test accounts

Create these once per environment, each with its own Internet Identity, and reuse them:

| Account | Role / plan | Used for |
|---|---|---|
| **H-Free** | Homeowner, Free, 1 home | Most homeowner cases, Free limits |
| **H-Pro** | Homeowner, Pro ($59/yr) | Pro-only pages, higher limits |
| **H-New** | Homeowner, created during the run | Sign-up and first-week cases |
| **C-Free** | Contractor, Contractor Free | Bids, referral fee, delayed lead alerts |
| **C-Pro** | Contractor, ContractorPro | Instant alerts, portfolio, earnings |
| **R-Agent** | Realtor | Bid to List agent side |
| **Admin** | Admin principal | Verification and successor reviews |
| **Buyer** | No account, or a second homeowner | Public pages, transfers, successor claims |

Use real inboxes you can read for each account's email, and a Florida address for H-Pro's home (several
features only appear for Florida homes).

### 1.4 Recording results

Mark each step PASS, FAIL or SKIP. For a FAIL, record: case ID, environment and build (commit or app version),
browser or device, the step, what you saw (screenshot or screen recording), and console or network errors.
File it as a GitHub issue titled `[manual] <case ID> <one-line summary>`.

---

## 2. Smoke subset

Run in this order; later cases reuse data from earlier ones.

| # | Case | What it proves |
|---|---|---|
| 1 | AUTH-01 | Real Internet Identity sign-in on the web |
| 2 | AUTH-04 | Mobile sign-in through `/mobile-auth` |
| 3 | AUTH-02 | New account sign-up |
| 4 | ONB-01 | Add Property wizard saves a home |
| 5 | PROP-01 | Property page and its tabs load |
| 6 | JOB-01 | Logging a DIY job |
| 7 | JOB-02 | Dual-signature contractor job (MT-02 short form) |
| 8 | PHOTO-01 | Photo upload on a job |
| 9 | QUOTE-01 | Quote request → contractor bid → accept |
| 10 | QUOTE-03 | Visit time offered and booked |
| 11 | PAY-02 | Homeowner pays a contractor in the app (bank) |
| 12 | SUB-01 | Upgrade to Pro (MT-03 short form) |
| 13 | REPORT-01 | Share a report and open it signed out |
| 14 | FIN-01 | Save an insurance policy |
| 15 | EMER-01 | Emergency card opens and prints |
| 16 | PRIV-01 | Public report switch takes effect at once |
| 17 | AI-01 | Ask bar answers a question about the home |
| 18 | CON-01 | Contractor dashboard shows a matching lead |
| 19 | MOB-01 | Mobile home, property and jobs tabs load |
| 20 | X-01 | No console errors and no horizontal scroll at phone width |

---

## 3. Sign-in and accounts (AUTH)

### AUTH-01 — Web sign-in with Internet Identity · Smoke · Web
Full version: MT-01.

**Preconditions:** a fresh browser profile; an existing Internet Identity for H-Free.

| # | Step | Expected |
|---|---|---|
| 1 | Open the site and go to `/login` | Login page with a role heading ("Welcome, homeowner" by default) and **Sign in with Internet Identity** |
| 2 | Click **Sign in with Internet Identity** and finish the Internet Identity flow | Returns to the app and lands on `/dashboard`; no console errors |
| 3 | Hard-refresh | Still signed in |
| 4 | Sign out from the avatar menu | Back on a public page; `/dashboard` now sends you to `/login` |

**Watch for:** a CSP error in the console mentioning `icp-api.io` (fixed in PR #804); a blank page after the
Internet Identity window closes.

### AUTH-02 — Sign up as each role · Smoke (homeowner) / P1 (others) · Web
**Preconditions:** a new Internet Identity with no HomeGentic profile.

| # | Step | Expected |
|---|---|---|
| 1 | Sign in, which takes you to `/register` | "Step 1 of 2": choose a role (Homeowner, Contractor or Realtor) |
| 2 | Pick **Homeowner**, continue | "Step 2 of 2": your details (email, optional phone) and the Terms and Privacy Policy links |
| 3 | Submit | Homeowner lands on `/dashboard`, and with no home yet the Add Property wizard opens by itself |
| 4 | Repeat with a new identity as **Contractor** | Lands on `/contractor-dashboard` |
| 5 | Repeat with a new identity as **Realtor** | Lands on the dashboard; `/agents/verify` is reachable |
| 6 | On step 2, press **Back** | Returns to step 1 with the role still picked |

### AUTH-03 — Route guards · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Signed out, open `/dashboard`, `/settings` and `/jobs` | Each sends you to `/login` |
| 2 | As H-Free, open `/agents/browse` | Sent to `/dashboard` (realtor-only pages) |
| 3 | As H-Free, open `/insurance-defense` and `/resale-ready` | Sent to `/pricing` (Pro only) |
| 4 | As H-Pro, open the same two pages | Both load |
| 5 | Open `/properties/new`, `/onboarding` and `/agent-dashboard` | Each redirects to `/dashboard` |
| 6 | Open a made-up path such as `/nope` | Not-found page |

### AUTH-04 — Mobile sign-in · Smoke · Mobile
**Preconditions:** the app installed fresh; the frontend on the same environment serves `/mobile-auth`.

| # | Step | Expected |
|---|---|---|
| 1 | Open the app, tap **Sign in with Internet Identity** | The phone's browser opens HomeGentic's `/mobile-auth` page, which asks Internet Identity to sign in |
| 2 | Finish signing in | The browser hands back to the app (`homegentic://auth`) and the app shows the home tabs |
| 3 | Compare with the web app for the same identity | Same homes and jobs: the principal is the same on web and mobile |
| 4 | Force-quit and reopen the app | Still signed in |
| 5 | Sign out from Account | Back on the sign-in screen |

### AUTH-05 — Mobile sign-up and add home · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Sign in with a brand-new identity | The native register screen (no bounce to the web) |
| 2 | Register as a homeowner | The add-home screen opens: address suggestions as you type, public-record details pre-filled where found |
| 3 | Answer "bought recently" with yes and fill in system years | Home saved; the move-in plan exists for it on the web (`/properties/:id/move-in`) and the system years show on the web |

---

## 4. Onboarding and first week (ONB)

### ONB-01 — Add Property wizard · Smoke · Web
**Preconditions:** H-New with no home.

| # | Step | Expected |
|---|---|---|
| 1 | Open `/dashboard` | The wizard opens: "Step 1 of 2 · Required" (address) |
| 2 | Type an address and pick a suggestion | Address filled; year built and size pre-filled when public records have them |
| 3 | Continue to "Step 2 of 2 · Required", fill the details, save | "Saved · Free tier" screen with optional next steps: verify ownership, baseline photos, documents, system ages |
| 4 | Close the wizard | The dashboard shows the new home in the property switcher |
| 5 | Register the same address again from the add-property button | No duplicate: the existing home is returned |

### ONB-02 — System years are saved to the home · P1 · Web + Mobile
| # | Step | Expected |
|---|---|---|
| 1 | In the wizard's system ages step (or `/properties/:id/systems`), set HVAC to a recent year | Saved |
| 2 | Open the same home in another browser and on the phone | The same HVAC year shows (system years live on the canister, not in one browser) |
| 3 | Open `/maintenance` | HVAC urgency reflects the year you entered, not the year built |

### ONB-03 — Honest first dashboard · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As H-New with a just-added home and no jobs, look at the Home Pulse headline and the home brief | Nothing claims a system "hasn't been serviced" when there are no jobs; the brief offers setup items (for example telling the app what's been replaced) instead |
| 2 | Answer the "bought in the last 12 months" question yes | A move-in plan starts; the brief shows "Your move-in plan: N of M steps done" |

### ONB-04 — Welcome and getting-started emails · P1 · Email
**Preconditions:** relay running with email set up; H-New's email is a real inbox; Settings → Notifications →
**Email: Getting Started** on.

| # | Step | Expected |
|---|---|---|
| 1 | Add the first home | A welcome email arrives |
| 2 | Wait one day (or shorten the relay's clock in a test build) | A day-1 tip about finding the shutoffs |
| 3 | On day 3, with no job, forwarded invoice or label scan yet | A tip about turning a receipt into a record |
| 4 | Repeat with a job logged before day 3 | The day-3 tip is skipped |
| 5 | Turn **Email: Getting Started** off and repeat with another new account | No tips |

### ONB-05 — Ownership verification · P1 · Web + Admin + Email
| # | Step | Expected |
|---|---|---|
| 1 | From the property page, start verification and upload a deed, utility bill or tax record | Status becomes pending review (`/properties/:id/verify/status`) |
| 2 | As Admin, open `/admin` → Verifications, approve it | The home moves to Basic; with **Email: Ownership Verification** on, the owner gets an email |
| 3 | Repeat on another home and reject | The owner sees the rejection and gets the matching email |

---

## 5. Properties (PROP)

### PROP-01 — Property page · Smoke · Web
| # | Step | Expected |
|---|---|---|
| 1 | Open `/properties/:id` | Header with score, address and verification level, and quick actions |
| 2 | Click each tab: Timeline, Jobs (N), Bills, Rooms (N), Documents, Insurance, Home warranty, House guide, HOA, Settings | Each loads without an error; at tablet width the tab row scrolls sideways instead of clipping |
| 3 | Add a room, then a fixture with a model number | Fixture shows **Manual** and **Parts** links, which open web searches |

### PROP-02 — Free and Pro home limits · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As H-Free with 1 home, try to add a second | Blocked with an upgrade prompt |
| 2 | As H-Pro, add homes up to 20 | Allowed; the 21st is blocked |

### PROP-03 — People (co-owners, managers, viewers) · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | From `/people`, invite a second account as a viewer | Invite link created |
| 2 | Open the link as that account and accept | They see the home read-only: they can open documents but not delete them or edit the house guide |
| 3 | Change them to manager | They can now edit (for example the house guide and documents) |
| 4 | Remove them | They lose access on their next load |

### PROP-04 — Hand the record to a buyer · P1 · Web
**Preconditions:** H-Pro's home is Basic or Premium verified; Buyer is a second homeowner account on Free.

| # | Step | Expected |
|---|---|---|
| 1 | Property → Settings → "Hand the record to your buyer", copy the claim link | Link shown, with an email option |
| 2 | As Buyer, open the link and claim | Jobs, photos, rooms, bills and verification move to Buyer; the seller loses access |
| 3 | Check Buyer's plan | A free, non-renewing Pro year |
| 4 | Check what didn't move | The seller's insurance policy, claim kit, contents inventory, house guide, home warranty plan and mortgage are gone; HOA records and the flood zone stayed; Buyer gets a fresh move-in plan |

### PROP-05 — Bills · P2 · Web + Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Upload three months of electric bills, then a fourth more than 20% higher | The fourth is flagged as a spike, and it appears in the activity bell |
| 2 | On the phone, upload a bill from the Utility Bill screen | It appears on the web Bills tab |

---

## 6. Jobs and records (JOB)

### JOB-01 — Log a DIY job · Smoke · Web
| # | Step | Expected |
|---|---|---|
| 1 | Open `/jobs/new`, pick the home, a service type, DIY, an amount, today's date and a description | Form accepts it |
| 2 | Submit | The job appears on the Jobs tab and the timeline; the score panel shows the change |

### JOB-02 — Contractor job with both signatures · Smoke · Web (two sessions)
Short form of MT-02; run MT-02 in full on a full pass.

| # | Step | Expected |
|---|---|---|
| 1 | As H-Free, log a contractor job naming C-Pro | Job waits for signatures |
| 2 | Sign as the homeowner | Waits for the contractor |
| 3 | As C-Pro, sign it (web dashboard or the phone's **Sign** tab) | Job is verified; both signatures show for both sides |
| 4 | H-Free reloads | Verified badge; score moves |

### JOB-03 — Out-of-network contractor sign-off · P1 · Web (two devices)
Run MT-10. Also check: on the `/verify/:token` page the contractor can attach a final lien waiver after signing.

### JOB-04 — Forwarded invoice inbox · P2 · Web + Email
**Preconditions:** `VITE_INBOX_DOMAIN` set and email routing live.

| # | Step | Expected |
|---|---|---|
| 1 | On `/jobs`, click **Show my forwarding address** | A private `h-…@<domain>` address |
| 2 | Forward a real contractor invoice (PDF) to it | Within a few minutes a draft appears on the Jobs page |
| 3 | Click **Review and log** | `/jobs/new` opens pre-filled; nothing is on the record until you submit |
| 4 | Click **New address**, then forward to the old address | Nothing arrives from the old address |

### JOB-05 — Improvements record · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | From the Jobs tab, open the improvements record | Each job shows a suggested improvement or repair |
| 2 | Change one mark and reload | The mark stuck |
| 3 | Download CSV; print | Both include the running total; the page says it's a record for your tax preparer, not tax advice |

### JOB-06 — Permits and lien waivers · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Open `/properties/:id/closeout` | Contractor jobs over $2,500 without a final lien waiver are flagged; Florida homes note when a Notice of Commencement is generally expected |
| 2 | Set a permit status and attach a waiver from the vault | Flag clears for that job |
| 3 | Generate a report | It shows permit and waiver counts |

### JOB-07 — Mobile job logging with the offline queue · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Turn on airplane mode, log a job on the phone | Offline banner; the job waits in the offline queue |
| 2 | Turn the network back on | The queue sends it; the job shows on the web |
| 3 | Sign out and in as another account | The first account's queued items don't show |

---

## 7. Photos and documents (PHOTO)

### PHOTO-01 — Photo on a job · Smoke · Web + Mobile
| # | Step | Expected |
|---|---|---|
| 1 | On a job, upload a JPEG | Thumbnail shows; it opens full size |
| 2 | On the phone, add a photo to a job from the camera | It shows on the web |

### PHOTO-02 — Photo limits and duplicates · P1 · Web
Run MT-05. Limits: Free 5 photos a job, Pro 30, Contractor Free 5, ContractorPro 50.

### PHOTO-03 — Document vault · P1 · Web + Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Documents tab: upload a PDF as Insurance policy and an image as Receipt | Both filed under their group |
| 2 | As a viewer on People | Can open, can't remove |
| 3 | On the phone, use **Scan a document** | The scan lands in the web vault |
| 4 | As H-Free, try to go past 25 documents for the home | Blocked with a message; Pro allows 250 |

### PHOTO-04 — Label scan · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Add a fixture with "Scan the label" using a photo of a water heater data plate | Brand, model and serial filled for you to check |
| 2 | If it offers the year made as the install year, accept | Maintenance uses that year |

---

## 8. Quotes and visit booking (QUOTE)

### QUOTE-01 — Request, bid, accept · Smoke · Web (two sessions)
**Preconditions:** C-Free has saved a card (Settings → Subscription → "Save card with Stripe"), or use C-Pro.

| # | Step | Expected |
|---|---|---|
| 1 | As H-Free, open `/quotes/new`, pick a trade, urgency and description, submit | Request created; `/quotes/:id` says it's waiting for quotes |
| 2 | As a contractor in that trade, open the dashboard | The lead shows straight away |
| 3 | Submit a bid | The homeowner sees it, in dollars (not cents) |
| 4 | Accept the bid | Quote accepted; the contractor is notified |

### QUOTE-02 — Free open-request limit and card-before-bid · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As H-Free, open 3 requests, then try a 4th | Blocked with an upgrade hint; H-Pro has no limit |
| 2 | As a Contractor Free account with no saved card, try to bid | Dashboard shows "Save a card before you bid."; the bid is refused until a card is saved |

### QUOTE-03 — Visit times · Smoke · Web (two sessions)
**Preconditions:** an accepted quote from QUOTE-01.

| # | Step | Expected |
|---|---|---|
| 1 | As the contractor, open the accepted quote's **Visit time** box, add up to 5 times and a note, **Send times** | "Waiting for the homeowner to pick one of your times" |
| 2 | A time in the past | Refused: "Each time must be in the future" |
| 3 | As the homeowner, book one of the times | "Visit booked:" with the time in your own time zone; the contractor sees "The homeowner booked:" and "You'll both get a reminder the day before." |
| 4 | Ask for other times instead (on a second quote) | The contractor sees "The homeowner asked for other times. Offer some below." |
| 5 | **Cancel visit** from either side | Both see it cancelled; the contractor can **Offer new times** |

### QUOTE-04 — Visit notifications · P1 · Email + Push
| # | Step | Expected |
|---|---|---|
| 1 | Run QUOTE-03 with **Email: Visit Times** on for both | An email at each step to the other side; none of them names the time |
| 2 | Book a visit about 25 hours out | Both get a reminder about 24 hours before |
| 3 | Cancel before the reminder is due | No reminder |

### QUOTE-05 — Mobile quotes · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | As a homeowner on the phone, request a quote | It shows under Quote requests and on the web |
| 2 | After two bids, open Compare bids | Both bids side by side |
| 3 | As a contractor on the phone, open the Leads tab and a lead | Lead detail matches the web |

---

## 9. Payments (PAY, SUB)

### PAY-01 — Contractor payout setup · P1 · Web + Stripe
| # | Step | Expected |
|---|---|---|
| 1 | As C-Free, open Settings → Subscription, find "Get paid in the app", click **Set up payouts** | Stripe-hosted onboarding opens |
| 2 | Finish it with Stripe test data | Back in the app; status may say Stripe is still checking, then shows ready |
| 3 | Read the copy | Says a bank payment reaches you once it clears, about 4 business days, and that on the free plan the 3% referral fee comes out of the payment |

### PAY-02 — Homeowner pays in the app · Smoke · Web + Stripe
**Preconditions:** an accepted quote with a contractor who finished PAY-01; the job is done.

| # | Step | Expected |
|---|---|---|
| 1 | On the quote, find the **Payment** box | "Pay <name> in the app once the job is done. You pay once, through Stripe." with bank and card options |
| 2 | Compare the two prices | Bank (ACH) is the accepted bid price; card is higher, and the box says paying by bank saves the card fee |
| 3 | Choose bank, **Continue to Stripe**, pay with a test bank account | Back in the app: the payment is on its way and reaches the contractor once it clears |
| 4 | Repeat on another quote by card | "You paid $X by card. Stripe is sending it to <name>." |
| 5 | As the contractor, check notifications | Told when the payment is on its way and when it has gone through (**Email: Payments**) |
| 6 | For a contractor with no payout setup | The box says they haven't set up payments yet, so pay them the way you agreed |
| 7 | Make a payment fail (Stripe test failure) | "Your last payment didn't go through. You can try again." |

### PAY-03 — Referral fee · P2 · Web + Stripe + Admin
| # | Step | Expected |
|---|---|---|
| 1 | As C-Free, win a bid and have the job verified by both sides | A 3% fee ($20 minimum) shows in Settings with its status |
| 2 | If the homeowner paid in the app | The fee came out of the payment, not the saved card |
| 3 | As Admin, open the referral fees list and waive one | Status becomes waived |
| 4 | As C-Pro, win a bid | No fee |

### SUB-01 — Upgrade to Pro · Smoke · Web + Stripe
Short form of MT-03; run MT-03 in full on a full pass.

| # | Step | Expected |
|---|---|---|
| 1 | As H-Free, Settings → Subscription | Free plan with an upgrade to Pro, $59/year, annual only (no monthly option) |
| 2 | Upgrade and pay with test card 4242 4242 4242 4242 | `/payment-success` says "Payment confirmed" |
| 3 | Reload and open on the phone | Pro on both |
| 4 | Open `/insurance-defense` | Loads |

### SUB-02 — Mobile plans · P2 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | As H-Free on the phone, Account → **Upgrade on the web** | Opens the web pricing or checkout page, not an in-app purchase |

---

## 10. Home Pulse email (PULSE)

The relay sends it on Mondays from `PULSE_HOUR_UTC` (default 13:00 UTC), with Tuesday as catch-up. To test it
outside that hour, run the relay on a Monday with `PULSE_HOUR_UTC` set to the current UTC hour or earlier.

### PULSE-01 — Weekly email content · P1 · Email
**Preconditions:** H-Pro's home has a job waiting on the owner's signature, an insurance renewal within 60 days,
a warranty ending within 60 days and a system near the end of its rated life; **Email: Weekly Home Pulse** on.

| # | Step | Expected |
|---|---|---|
| 1 | Let the relay run | One email, subject starting "Your Home Pulse" |
| 2 | Read it | Per home: score, the signature waiting, the insurance renewal, the ending warranty, the aging system and the season's priorities |
| 3 | Restart the relay and let it run again the same week | No second email |

### PULSE-02 — Unsubscribe · P1 · Email
| # | Step | Expected |
|---|---|---|
| 1 | Click the unsubscribe link in the email | A page asks "Stop the weekly Home Pulse email?" with an **Unsubscribe** button; nothing changes until you press it |
| 1a | Press **Unsubscribe** | "You're unsubscribed"; **Email: Weekly Home Pulse** is now off in Settings, and other notifications are unchanged |
| 2 | Next run | No Pulse for that account |
| 3 | Check the mail client's own unsubscribe button (Gmail, Apple Mail) | It works too (one-click unsubscribe) |

### PULSE-03 — Recall item · P2 · Email + Push
| # | Step | Expected |
|---|---|---|
| 1 | Save an appliance whose brand and model match a CPSC recall | The dashboard brief says a recall *may* apply and links to the CPSC notice |
| 2 | Weekly run | A recall item near the top of the Pulse and a push (**Push: Possible Product Recalls**), once only |

---

## 11. Selling: sell prompt, Bid to List, FSBO, reports (SELL, REPORT)

### SELL-01 — "Thinking of selling?" card · P1 · Web
**Preconditions:** at least 3 verified agents serve the home's city. Without them the card never shows; check
that too.

| # | Step | Expected |
|---|---|---|
| 1 | With fewer than 3 verified agents in the city | No card, ever |
| 2 | With 3+, in one of the home's prompt weeks (or after the score rose 10+ points within 90 days, or the FHFA index estimate rose 5%+ for a home with a mortgage card) | The dashboard shows "Thinking of selling?" and, for a rise, says what moved |
| 3 | Click **Not now** | Card hides; after a rise it returns only after another 10 points or 5% |
| 4 | Read the copy | No promised commission level or saving |

### SELL-02 — Seller posts a Bid to List request · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Open `/sell` signed out | "Agents compete. You choose." and a check of how many verified agents serve your city |
| 2 | Signed in as H-Pro, go to `/listing/new` | Form: property, when you want to list, bidding window, photos, anything agents should know, and a preview of what agents will see |
| 3 | Submit | `/listing/:id` shows the request with bids sealed until the window closes |

### SELL-03 — Agent side · P1 · Web (realtor) + Stripe
| # | Step | Expected |
|---|---|---|
| 1 | As R-Agent, open `/agents/verify`, fill licence details and save a card | Verified; listings become visible |
| 2 | Open `/agents/browse` | The seller's request, masked (no seller name or exact address); only the open-slot count is shown, never other bids |
| 3 | Bid from `/agents/listings/:id/bid` | Shows how the seller will see the bid; it appears on `/agents/bids` |
| 4 | Check what the agent can't see | No bid counts, other agents' terms or reasons for losing |

### SELL-04 — Award and platform fee · P1 · Web (two sessions) + Stripe
| # | Step | Expected |
|---|---|---|
| 1 | After the window closes, the seller compares bids on `/listing/:id` and picks one | The pick is recorded; identities are still masked |
| 2 | Before the fee is paid, the winning agent opens `/agents/bids/:id` | Says the platform fee ($399 by default) is due; no seller address or email yet |
| 3 | The fee is marked paid (today an admin does this; there is no in-app payment for it yet) | `/agents/bids/:id` says the fee is paid, shows "RECEIPT SENT", the seller's address and email; the seller's `/listing/:id` names the agent |
| 4 | A losing agent checks `/agents/bids` | Lost, with no detail about the winner |

### SELL-05 — FSBO listing · P2 · Web
Run MT-08 (listing, 360° tour, showing and offers). After an accepted offer, the listing points the seller to
"Hand the record to your buyer" (PROP-04).

### REPORT-01 — Share and revoke a report · Smoke · Web
Short form of MT-04.

| # | Step | Expected |
|---|---|---|
| 1 | On an unverified home, open Generate report | Generate is disabled, with a "Verify ownership" link |
| 1b | On a Basic or Premium verified home, generate a report | Share link shown |
| 2 | Open it in a private window | Report loads signed out, showing "Signed by HomeGentic" |
| 3 | Download the signed copy and check it on `/verify-record` | Signature checks out; the page explains what a signature does and doesn't prove |
| 4 | Turn off "Public HomeGentic Report" in Settings → Privacy and reload the private window | "Sign in to view this report"; turning it back on restores it |
| 5 | Revoke the link and reload the private window | "Report link revoked" |

---

## 12. Insurance, warranty, mortgage, flood (FIN)

### FIN-01 — Insurance policy · Smoke · Web
| # | Step | Expected |
|---|---|---|
| 1 | Insurance tab: enter insurer, policy number, renewal date, Coverage A and a hurricane deductible as a percent | Saves; the deductible shows in dollars; days to renewal shown |
| 2 | Set the renewal date in the past | Flagged as passed |
| 3 | **Add to calendar** | An .ics file with the renewal date and without the policy number |
| 4 | As a viewer | Read-only |

### FIN-02 — Claim kit · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Create a claim with date of loss, cause and claim number, then add a log entry | Saved |
| 2 | Add damage photos | Shown with upload time; they count toward photo limits |
| 3 | **Get repair quotes** | `/quotes/new` opens with the home, a trade from the cause and a description of the loss |
| 4 | Delete the claim | Its photos stay under "Photos from earlier claims" and are never used as the home's picture |

### FIN-03 — Contents inventory · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Add items in two rooms with values and a receipt | Grouped by room with subtotals and a total |
| 2 | Download CSV and open it in a spreadsheet | A value starting with `=` shows as text, not a formula |
| 3 | Delete an item | Its photos and receipts are deleted with it |

### FIN-04 — Home warranty plan · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Home warranty tab: add a plan and a claim linked to a job | Both saved and shown |

### FIN-05 — Mortgage and index estimate · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Bills tab → Mortgage and equity: enter the original loan, value and first payment date | Equity and loan-to-value lines show |
| 2 | Look at the index estimate | Labelled as following state prices, not an appraisal |
| 3 | **Use $X as my home value** | Equity and loan-to-value update |
| 4 | As a viewer or manager | The loan isn't shown (owners and co-owners only) |

### FIN-06 — Flood zone lookup · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Run the flood zone lookup for a real address in a known FEMA flood zone | The zone matches FEMA's map (record what you checked against) |
| 2 | Run it more than 10 times in a day | Refused with a limit message |

### FIN-07 — Florida inspection readiness · P2 · Web
**Preconditions:** H-Pro, Florida home.

| # | Step | Expected |
|---|---|---|
| 1 | Open `/insurance-defense` | 4-point and wind-mitigation items, each marked from the record ("In your record", "Partly recorded", "Not recorded yet" or "Inspector checks") |
| 2 | Read the copy | No prediction of insurability or premiums; the discount estimate is labelled as an AI estimate |
| 3 | **Get inspector quotes** | Quote form pre-filled |
| 4 | Open the same page for a non-Florida home | No Florida readiness section |

### FIN-08 — Calendar subscription · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | On `/maintenance`, create the calendar link and subscribe in Google or Apple Calendar | Maintenance tasks, warranty ends, recurring visits and insurance renewals appear; the card says anyone with the link can read them |
| 2 | Make a new link | The old one stops working |

---

## 13. Emergency card and problem help (EMER)

### EMER-01 — Emergency card on the web · Smoke · Web
**Preconditions:** the house guide has shutoff notes and a contact whose role mentions insurance; a policy is
saved.

| # | Step | Expected |
|---|---|---|
| 1 | Property page → **Emergency card** | Shutoffs, panel, alarm notes, insurer, policy number, claim line and contacts with tap-to-call; never the Wi-Fi details |
| 2 | Remove the guide's shutoff note and reload | The card lists it as missing with a link to the house guide |
| 3 | Print | Fits a printed page |
| 4 | **Get emergency help** | Quote form for the home with urgency Emergency |

### EMER-02 — Hurricane checklist · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | On a Florida home, tick some before-the-storm items and reload | Ticks kept in this browser |
| 2 | Open on a home in a non-coastal state | No hurricane section |
| 3 | Read the after-the-storm steps | They end in the claim kit; nothing tells people whether to evacuate |

### EMER-03 — Offline emergency card on the phone · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Open the Property tab online, then turn on airplane mode | |
| 2 | Tap **Emergency card** | Opens from the saved copy, without alarm notes or photos |
| 3 | Sign out, sign in as another account, go offline | The first account's card isn't there |

### EMER-04 — Show me the problem · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | From the emergency card, open `/properties/:id/problem`, describe a slow drain with a photo | AI suggestions with likely causes, what's safe to try, the trade to call and an urgency, labelled as suggestions, not a diagnosis |
| 2 | Describe a gas smell | A "get out and call 911 or the utility" banner first; urgency Emergency |
| 3 | Open the prefilled quote | Trade, urgency and your words are filled and editable |

---

## 14. Successor contact (SUCC)

### SUCC-01 — Name a successor · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Property → Settings → Successor (or `/properties/:id/successor`), enter name, email and relationship | A successor link to hand over; the page says HomeGentic won't email the successor |
| 2 | Save again | A new link; the old one stops working |

### SUCC-02 — Claim, review, wait, take over · P1 · Web (three sessions) + Email
| # | Step | Expected |
|---|---|---|
| 1 | As Buyer, open the successor link, sign in, upload a proof document (PDF, JPEG or PNG up to 1.8 MB) | Claim open; the owner and co-owners get an email |
| 2 | As the owner, try to open a claim on your own home | Refused |
| 3 | As Admin, `/admin` → Successor Claims: open the document and approve | Approved; claimant and owner emailed |
| 4 | As the claimant, open `/successor-claims` before 30 days have passed | Can't take over yet |
| 5 | After 30 days (testnet, or a build with a shortened wait), press **Take over the record** | The record moves; the previous household loses access |
| 6 | Copy check | Says HomeGentic passes on the record only, not the property or any probate role |

### SUCC-03 — Cancel and reject · P2 · Web + Email
| # | Step | Expected |
|---|---|---|
| 1 | Owner cancels an open claim from the successor page | Claim cancelled; claimant emailed |
| 2 | Admin rejects a claim with a reason | The claimant reads the reason |
| 3 | Turn every email setting off and repeat step 1 | The emails still arrive, and the footer says why |

---

## 15. Settings, privacy and notifications (PRIV)

### PRIV-01 — Public report switch · Smoke · Web
| # | Step | Expected |
|---|---|---|
| 1 | Share a report and open it signed out | Loads |
| 2 | Settings → Privacy → turn **Public HomeGentic Report** off (no Save button) | Saved at once |
| 3 | Reload the already-shared link signed out | Now asks the viewer to sign in |
| 4 | Turn it back on | The link works signed out again |

### PRIV-02 — Share verified local costs · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Settings → Privacy, turn cost sharing on for a home | Saved at once |
| 2 | Open `/prices` for that ZIP | Shows verified local costs only when enough homes and contractors share (5+ homes, 3+ contractors); otherwise the typical U.S. range, labelled national |

### PRIV-03 — Contractor privacy switches · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As C-Pro, turn **Listed in the Directory** off | Gone from `/contractors`; still gets lead alerts; existing bids still show the profile |
| 2 | Turn **Show Trust Score** and **Show Jobs Completed** off | Hidden on the public profile and directory card; bids unchanged |

### PRIV-04 — Notification switches · P1 · Web + Email + Push
| # | Step | Expected |
|---|---|---|
| 1 | Settings → Notifications as a homeowner and as a contractor | Each role sees its own rows (for example homeowners: Email: Weekly Home Pulse, Email: Visit Times, Email: Payments, Email: Getting Started; contractors: Push: New Lead in My Trades, Email: Bid Outcome) |
| 2 | Turn one email row off and trigger that event | No email for it; other emails still arrive |
| 3 | Enable web push for a contractor | Run MT-11 |

### PRIV-05 — Download my data and delete account · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Settings → Privacy → **Download My Data (ZIP)** | A ZIP of `data.json`, `README.txt` and the photo files; `data.json` holds the profile, subscription, quotes, and per home the jobs, rooms, bills, insurance policy and claims, inventory, house guide, HOA records, move-in plan and successor; anything that couldn't be read is listed under `failed` |
| 2 | Under "Delete your account", delete a throwaway account | Asks to confirm, then "Your account has been deleted"; the account's homes and records no longer load |

---

## 16. AI assistant and connectors (AI)

### AI-01 — Ask bar · Smoke · Web
**Preconditions:** voice Worker running; H-Pro has jobs.

| # | Step | Expected |
|---|---|---|
| 1 | On `/dashboard`, type "What needs attention at my house?" in "Ask about your home" | An answer card using this home's real records; read aloud |
| 2 | Ask it to log a job | It asks you to confirm before writing anything |
| 3 | Ask something off-topic | Answers within scope; doesn't invent home data |

### AI-02 — Voice · P1 · Web
Run MT-06 with a real microphone.

### AI-03 — Multi-step tasks · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Tap a task chip above the ask bar (for example storm prep) | One review card listing the planned steps |
| 2 | Untick a step and run it | Only the ticked steps run; results are in the app (tasks scheduled, quote requested) |
| 3 | As a contractor | No task chips |

### AI-04 — Limits and human check · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As a brand-new Free account, ask a first question | A one-time human check (Turnstile), then the answer |
| 2 | Use up Free's allowance (3 chat answers a day; 10 agent calls a week) | A clear limit message with when it resets; it doesn't promise Pro "unlimited" answers |
| 3 | As H-Pro | No human check; higher limits (10 agent calls and 200 chat answers a day) |

### AI-05 — Mobile assistant · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Open the assistant sheet as a homeowner, tap a suggested question (for example "What's dragging my score down?") | Answer from the real record |
| 2 | Ask it to log a job | Says that isn't available from the mobile app yet; nothing changes |
| 3 | As a contractor, try "What's waiting on my signature?" | Lists the jobs, with a button to sign |

### AI-06 — ChatGPT and Claude connectors · P2 · Web + external
**Preconditions:** `VITE_AI_CONNECTORS=1`; ICP MCP manifest live on the environment.

| # | Step | Expected |
|---|---|---|
| 1 | Settings → AI assistants | Setup steps for ChatGPT and Claude, consent modes, how to revoke, sample prompts |
| 2 | Connect HomeGentic in Claude or ChatGPT and ask about your home's maintenance history | Answers from your record only; another user's homes never appear |
| 3 | Mark "I've connected it", then look at the dashboard ask bar | Shows "or ask in ChatGPT / Claude" with prefilled links |
| 4 | Without the flag | No AI assistants tab and no links |

---

## 17. Contractors (CON)

### CON-01 — Contractor dashboard · Smoke · Web
| # | Step | Expected |
|---|---|---|
| 1 | As C-Pro with specialties set, open `/contractor-dashboard` | Matching open requests listed; "No open requests" when none |
| 2 | With an incomplete profile | A "Profile incomplete" prompt |

### CON-02 — Profile and DBPR check · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | On `/contractor/profile`, enter a real Florida licence number and click **Check with Florida DBPR** | Status, expiry and licence holder from DBPR's file, with the file date |
| 2 | Enter a number not in the file | Says it isn't in DBPR's file of current Florida construction licences, not that it's fake |
| 3 | Change the number | The old result disappears |

### CON-03 — ContractorPro features · P1 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As C-Pro, pick co-signed jobs for the portfolio and write them up | Shown as Featured work on `/contractor/:id`, without addresses or homeowner names |
| 2 | Open the earnings view | Accepted bids by month for 12 months, average bid, CSV download |
| 3 | As C-Free | Sees what the portfolio is but can't use it |

### CON-04 — Lead alert timing · P1 · Push + Email
| # | Step | Expected |
|---|---|---|
| 1 | Post a request in a trade both C-Free and C-Pro serve | C-Pro is alerted at once; C-Free about 30 minutes later; both see the lead in the dashboard at once |
| 2 | Close the request within 30 minutes | C-Free gets no alert |

### CON-05 — Public profile contact hiding · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | As a homeowner with an open request in C-Free's trade, open C-Free's public profile | Phone and email held back; points you to the bids |
| 2 | After accepting C-Free's bid | Contact details shown |

### CON-06 — Contractor mobile app · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Sign in as C-Pro on the phone | Tabs: Leads, Sign, Earnings, Account |
| 2 | Open a lead from a push notification | Lands on that lead |
| 3 | Sign a pending job from the Sign tab | The job is verified on the web |

---

## 18. Mobile app basics (MOB)

### MOB-01 — Homeowner tabs · Smoke · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Sign in as H-Pro | Tabs: Home, Property, Jobs, Upkeep, Account |
| 2 | Open each tab | Data matches the web; pull to refresh works |
| 3 | Property tab | Rows for **Emergency card** and **My listing**, and sensors |

### MOB-02 — Deep links · P1 · Mobile
| # | Step | Expected |
|---|---|---|
| 1 | Tap a push or email link for a job, a lead and a shared house guide | The app opens on that screen (not the home tab) |
| 2 | Tap the same link with the app signed out | The sign-in screen; log what happens after sign-in (expected: the linked screen) |

### MOB-03 — iOS and Android parity · P2 · Mobile
Run MOB-01, AUTH-04 and EMER-03 on both an iPhone and an Android phone. Note differences in layout, keyboard
covering inputs, and the back gesture.

---

## 19. Cross-cutting checks (X)

### X-01 — Console, layout and theme · Smoke · Web
| # | Step | Expected |
|---|---|---|
| 1 | Keep DevTools open through the smoke run | No red console errors, no failed canister calls shown as raw text |
| 2 | Narrow the window to 375 px on the dashboard, property page and settings | No horizontal scroll; mobile header, bottom nav and add button show |
| 3 | Switch to dark mode from the top bar | Text stays readable on every panel |

### X-02 — Keyboard and screen reader · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Sign in, log a job and request a quote using only the keyboard | Every control reachable; focus visible; modals trap focus and close on Escape |
| 2 | With VoiceOver or NVDA, change pages | The new page is announced |

### X-03 — Service down · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | Stop one canister (for example `icp canister stop quote` on local) and open `/quotes/new` and a quote | A plain-language message that the service isn't available, not a raw error, JSON text or "not found" |
| 2 | Start it again and retry | Works |

### X-04 — House guide share link · P2 · Web
| # | Step | Expected |
|---|---|---|
| 1 | House guide tab: fill it in and create a 1-day share link | Link listed |
| 2 | Open it in a private window | The guide and street address only, nothing else from the record |
| 3 | Turn the link off | The private window no longer loads it |

### X-05 — Public free tools · P2 · Web
Open `/check`, `/prices`, `/instant-forecast` (see MT-07), `/home-systems`, `/truth-kit` and `/sample-report`
signed out. Each loads without sign-in and without console errors.

---

## 20. Sign-off

Copy this table into the release issue and fill it in.

| Area | Cases run | Pass | Fail | Skip | Tester | Environment / build | Date |
|---|---|---|---|---|---|---|---|
| Smoke subset | | | | | | | |
| AUTH | | | | | | | |
| ONB | | | | | | | |
| PROP | | | | | | | |
| JOB | | | | | | | |
| PHOTO | | | | | | | |
| QUOTE | | | | | | | |
| PAY / SUB | | | | | | | |
| PULSE | | | | | | | |
| SELL / REPORT | | | | | | | |
| FIN | | | | | | | |
| EMER | | | | | | | |
| SUCC | | | | | | | |
| PRIV | | | | | | | |
| AI | | | | | | | |
| CON | | | | | | | |
| MOB | | | | | | | |
| X | | | | | | | |
| MT-01 to MT-11 | | | | | | | |
