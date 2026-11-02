# Incident runbook

What to do when something is wrong in production. Canister upgrade and
rollback mechanics are in `docs/UPGRADE_RUNBOOK.md`; this page is the order of
work and the pieces that page doesn't cover. Keep the contact table current.

## Where alerts come from

| Source | What it means |
|---|---|
| "watchdog alert" email (Cycle Watchdog, hourly) | Frontend or Worker down, a relay's `/health` failing, a new critical monitoring alert, an unresolved service error (Stripe webhook, email, 5xx, relay sends), a new frontend error, or cycles low. The email has the details and a link to the run |
| "backup failed" email (Off-chain Backup, daily) | A canister wasn't backed up. **Check first that every canister is running**: the backup stops each one briefly |
| Stripe "webhook endpoint failing" email | The Worker is rejecting Stripe events. Paid users may be stuck on Free |
| A user writing to support@ or privacy@ | Anything |
| GitHub notification of a failed scheduled run | The fallback when the alert email isn't configured |

## Severity

| Level | Examples | Start within | Tell users |
|---|---|---|---|
| **SEV1** | Personal data exposed or possibly exposed; a controller key or service key leaked; the app down for everyone; payments taken but plans not granted for many users; data lost | 1 hour, any time | Yes, as soon as you know the scope (and see "Data breach" below) |
| **SEV2** | One feature broken for everyone (quotes, reports, sign-in on one platform); notifications or email not sending; a canister paused | Same day | If it lasts more than a few hours |
| **SEV3** | A bug with a workaround; an alert that turned out to be noise | Next working day | No |

When unsure, pick the higher level. Downgrade later.

## Contacts

Fill these in and keep them here (no secrets).

| Who | For | How |
|---|---|---|
| Incident lead | Decides, communicates | Mete (owner) |
| Backup person | Can pause canisters and roll back if the lead is unreachable | _not set_ (holds the backup controller key; see "Key compromise") |
| Lawyer | Breach notices, regulator contact | _not set_ |
| Stripe | Disputed or wrong charges, key compromise | Stripe Dashboard → Support |
| DFINITY | Subnet or Internet Identity problems | forum.dfinity.org, status.internetcomputer.org |
| Cloudflare | Worker, R2, email routing | Dashboard → Support; cloudflarestatus.com |
| Fly.io | Relay and gateway hosting | community.fly.io; status.flyio.net |
| Resend / Twilio | Email / SMS delivery | Their dashboards |
| Apple / Google | Expedited app review | App Store Connect → Contact Us; Play Console help |

## The steps

### 1. Triage (first 15 minutes)

- Open a note (a GitHub issue marked private, or a local file) and write the time and what you see. Keep adding to it; it becomes the review.
- Decide the severity.
- Check the providers' status pages before debugging your own code.

### 2. Contain

Stop the damage first, fix second.

| Component | Contain |
|---|---|
| A canister | `icp canister call <canister> pause '(opt 3600)' -e ic` stops writes for an hour (`'(null)'` for no expiry); `unpause '()'` when fixed. Reads keep working |
| Voice Worker | `cd agents/voice && npx wrangler rollback` (previous version), or `npx wrangler deployments list` then `npx wrangler rollback <id>` |
| A leaked secret | Rotate it at the provider first, then `wrangler secret put` / `fly secrets set` / the GitHub environment secret. See "Key compromise" |
| Abuse draining cycles or paid APIs | Pause the canister or route; the Worker's budgets are in `src/aiGuard.ts` |
| A Fly relay sending wrong messages | `fly scale count 0 --app homegentic-notifications` stops it. Each canister's outbox keeps its newest 1,000 events, so events aren't lost while it's off for a short time; start it again with `fly scale count 1` |
| The mobile app | Roll back the backend change that broke it, if there was one; a fix build takes a store review (see "Mobile" below) |

### 3. Tell people

- SEV1/SEV2 lasting more than an hour: post on the status page (owner to set one up; until then, email affected users). Say what is affected, what users should do, and when you'll update next. Don't guess at causes.
- Payments: if users were charged and didn't get their plan, say you'll fix it and that nobody is charged twice.
- A breach: follow "Data breach" below; the wording and timing there are legal requirements.

### 4. Recover

| Component | Recover |
|---|---|
| A canister whose upgrade broke it | `docs/UPGRADE_RUNBOOK.md` → Option A (restore the pre-upgrade snapshot) or Option B (redeploy the last `mainnet-*` tag) |
| A canister whose data is damaged or lost and the pre-upgrade snapshot is too old or gone | Restore from the off-chain backup (below) |
| A deploy that stopped part-way | `docs/UPGRADE_RUNBOOK.md` → "A deploy that failed part-way" |
| Code on main is bad | `git revert` the merge on a branch, open a PR, merge: the Deploy Mainnet workflow deploys main. (It refuses any ref but main, by design) |
| Stripe events the Worker failed | After the Worker is fixed: Stripe Dashboard → Developers → Webhooks → the endpoint → failed events → Resend. The Worker ignores events it already applied |
| Notification relay | `fly releases --app homegentic-notifications`, then `fly deploy --image <previous image>`. Its data file: `fly volumes snapshots list <volume>` and restore, or the off-chain backup |
| R2 photos | R2 has no versioning; a deleted object is gone. Photo records stay in the photo canister, so the app shows the photo as missing rather than breaking |
| Frontend | Redeploy the last good code (revert on main) |
| Mobile | The app has no over-the-air updates (expo-updates isn't set up), so submit a fix build and ask for expedited review; if a backend change broke old app versions, roll the backend back instead |

After recovering, run the Cycle Watchdog by hand (Actions → Cycle Watchdog → Run workflow) and check it's green. Resolve the service errors you've dealt with (`icp canister call monitoring resolveServiceError '("<fingerprint>")' -e ic`) so the next alert is a new one.

#### Restore from an off-chain backup

Backups are in the R2 backup bucket, one folder per day, encrypted with age.
The private key is offline (wherever you stored it when you created it, never
in GitHub).

```bash
export BACKUP_DEST=s3://homegentic-backups BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… AWS_DEFAULT_REGION=auto
export BACKUP_AGE_IDENTITY_FILE=~/path/to/homegentic-backup.key
icp canister call <canister> pause '(null)' -e ic      # no writes while you restore
scripts/ops/restore-drill.sh <canister> <its mainnet id> [YYYY-MM-DD] --production
icp canister call <canister> unpause '()' -e ic
```

This replaces the canister's code **and** data with the backup's. Everything
written since the backup is lost, and accounts deleted since then come back
(see `docs/DATA_RETENTION.md`). If the backup's code is older than what's
deployed, redeploy the current code afterwards (Option B in the upgrade
runbook) so the canister isn't left on old code.

Practise this (a drill into a scratch canister, as the script's header shows)
once a quarter and after any change to the backup setup, and write down how
long it took.

### 5. Review

Within a week of a SEV1 or SEV2, write up in the PR that fixes it (or a
private issue): what happened, when it was noticed and how, what users saw,
what was done, and what changes so it can't happen the same way again. No
blame. Add any missing alert or check as a follow-up.

## Key compromise

| Key | Rotate |
|---|---|
| Mainnet controller identity (`MAINNET_IDENTITY_PEM`) | Generate a new identity, add it as a controller of every canister with the backup controller, remove the old one, replace the GitHub secret, re-add admin rights (`addAdmin`) where the old principal was an admin |
| Worker identity (`DFX_IDENTITY_PEM`) | New identity; re-run the relay grants (`addStripeRelay`, `addReporter`, … in `scripts/deploy.sh`) for it and remove the old principal; `wrangler secret put DFX_IDENTITY_PEM` |
| Relay identity (`RELAY_IDENTITY_SEED`) | New seed; `addNotifier` / `addReporter` for the new principal, remove the old; `fly secrets set` |
| Stripe, Resend, Twilio, Anthropic, Google, ATTOM, OpenPermit keys | Roll at the provider, then the Worker/relay secret. Stripe: also roll the webhook signing secret |
| Backup age key | Make a new key pair, set `BACKUP_AGE_RECIPIENT` to the new public key; old backups stay readable only with the old key until they expire |

## Data breach

A breach is personal data seen or taken by someone who shouldn't have it
(including our own bug showing one user's data to another). Laws set deadlines
from the moment you **determine** a breach happened.

1. **Contain** (above) and **preserve evidence**: don't delete logs; download
   the relevant Worker logs and the audit canister's entries.
2. **Work out the scope**: which data, whose, from when to when. The audit log
   and the canisters' indexes tell you which principals' records were touched.
3. **Get legal advice** if more than a handful of people are affected.
4. **Notify within the deadlines.** HomeGentic serves Florida first:
   - **Florida (§501.171):** notify affected Florida residents within **30 days**
     of determining the breach. If **500 or more** Florida residents are affected,
     notify the Florida Attorney General within the same 30 days. If more than
     **1,000**, also notify the consumer reporting agencies. "Personal
     information" there includes a name with an account login and password or
     security question, financial account numbers, and health or insurance
     information; check what was exposed against the statute.
   - **Other US states:** each has its own law, mostly 30 to 60 days; notify
     residents of every state affected under its law.
   - **Payment cards:** card data is held by Stripe, not us. If Stripe keys
     leaked, tell Stripe at once.
5. **The notice** (email to each affected user) says, in plain words: what
   happened and when; what data of theirs was involved; what we've done; what
   they can do; and how to contact us. Template:

   > Subject: Important: a security incident affected your HomeGentic account
   >
   > On [date] we found that [what happened] between [start] and [end]. This
   > exposed your [data types]. It did not expose [what it didn't].
   > We [fixed it / revoked access / rotated keys] on [date].
   > You can [what they should do]. If you have questions, reply to this email
   > or write to privacy@homegentic.app.

6. **Record** who was notified and when, with the notices sent.
