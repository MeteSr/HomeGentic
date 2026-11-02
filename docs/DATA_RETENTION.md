# Data retention

Where personal data lives, how long it stays, and what removes it. The
Privacy Policy (`frontend/src/pages/PrivacyPolicyPage.tsx`, "Data Retention and
Deletion") is the promise to users; this page is how the system keeps it.
Change both together.

## Stores

| Store | What it holds | Kept for | Removed by |
|---|---|---|---|
| Data canisters (auth, property, job, contractor, quote, photo, report, maintenance, sensor, listing, agent, recurring, bills, market) | Profiles, homes, records, photos (on-chain bytes), reports, listings | Until the user deletes their account | `deleteMyData()` on each canister, called by Settings → Privacy → Delete My Account (`frontend/src/services/accountDeletion.ts`) |
| payment, fee | Subscriptions, gifts, credits, platform and referral fees | Kept after account deletion for tax, accounting and fraud prevention (Privacy Policy, "What we keep") | Not removed. **Owner decision open:** set a period (US practice is 7 years for tax records) |
| audit | Admin actions (who, what, when) | The newest 50,000 entries | Oldest dropped beyond the cap (`backend/audit/main.mo`) |
| monitoring | Frontend and service error summaries (message, type, counts per tier, release) | 90 days after an error was last seen; at most 500 of each kind | Pruned on every write (`pruneOldErrors`) |
| monitoring | Cycle and canister alerts (no personal data) | At most 2,000 | Cap |
| R2 `homegentic-photos` | Off-chain photo bytes | Until the photo or the account is deleted | Worker `DELETE /photos/<id>`, after the canister record is gone. **Known gap:** if that call fails the bytes stay with no record pointing at them, until the planned orphan sweep (off-chain photos part 4) exists |
| Worker KV `RATE_LIMIT`, Durable Object `RateLimiterDO` | Counters keyed by principal or IP, email dedupe keys | Minutes to a day (each key has a TTL) | Expiry |
| Notification relay `/data/notifications.json` (Fly volume) | Device tokens, push subscriptions, notification preferences, phone numbers for SMS, report-alert requests (address + email) | Until the user unregisters or changes settings; report-alert requests 180 days or until sent | Relay endpoints; `reportAlerts.ts` `MAX_AGE_MS` |
| IoT gateway `/data/*-tokens.json` (Fly volume) | Smart-home vendor OAuth tokens | Until the user disconnects the device | Gateway disconnect |
| Off-chain backups (R2 backup bucket) | Encrypted snapshots of every data canister and the relay files | 35 days (`BACKUP_RETENTION_DAYS`) | `scripts/ops/backup-canisters.sh` deletes older folders each run |
| Pre-upgrade snapshot (one per canister, on-chain) | The canister as it was before the last deploy | Until the next deploy replaces it | `scripts/deploy.sh` |
| Fly volume snapshots | The relays' volumes | 5 days (Fly default) | Fly |
| Logs: Cloudflare Workers Logs, Fly logs, GitHub Actions logs | Requests (path, status, IP, principal for some routes), errors | Cloudflare and Fly: days, per plan. GitHub Actions: 90 days | The provider |
| Third parties (Stripe, Anthropic, Resend, Twilio, Google Places, Cloudflare, Fly) | As listed in the Privacy Policy's third-party table | Their own policies | Them |

Data a user deletes stays in backups and the pre-upgrade snapshot until those
expire. The Privacy Policy says so.

**Restores bring deleted data back.** Restoring a canister from a backup (see
`docs/INCIDENT_RUNBOOK.md`) also restores any account deleted after that backup
was taken. Nothing records who deleted their account, so it can't be redone
automatically. **Owner decision open:** keep a list of principals that deleted
their account (principal and date only) so deletions can be re-applied after a
restore.

## Requests to privacy@homegentic.app

1. Reply within 3 business days to say the request arrived. The Privacy Policy
   promises an answer within 30 days.
2. Check it's the account holder: the request must come from the email saved
   on the account (Settings → Profile). Never act on a request you can't tie
   to the account.
3. Access or export: Settings → Privacy → Export Your Data covers what the app
   holds. For anything it doesn't include, an admin reads it from the canister.
4. Deletion: ask them to use Delete My Account. If they can't sign in, an admin
   removes the data (there is no admin-side delete yet, so this needs a
   one-off upgrade; say so in the reply and in the incident log).
5. Keep the email thread. It is the record that the request was handled.

## Inactive accounts

Free accounts are kept until the user deletes them. **Owner decision open:**
whether to delete accounts with no sign-in for, say, three years, after an
email warning.
