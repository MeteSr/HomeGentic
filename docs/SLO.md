# Service levels

Targets that say when an outage or slowdown is a problem worth stopping other
work for. They are measured by the hourly Cycle Watchdog (frontend, voice
Worker and relay `/health`) and the monitoring canister; a miss shows up as a
watchdog alert. Revisit them after three months of real traffic.

| Area | Target (per calendar month) | Measured by |
|---|---|---|
| Web app and canisters answer | 99.5% of hourly checks pass (about 3.5 hours of downtime a month) | Cycle Watchdog "Check the app answers" |
| Voice Worker `/health` | 99.5% | Cycle Watchdog |
| Notification relay `/health` | 99% | Cycle Watchdog ops check |
| A Stripe payment grants the plan | Within 5 minutes, for 99.9% of payments; no service error from `stripe-webhook` left unresolved for more than a day | Service errors, Stripe's webhook dashboard |
| Transactional email sent | 99% accepted by Resend on the first try | Service errors (`email`) |
| Backups | Every daily backup succeeds; a restore drill once a quarter | Off-chain Backup runs; the drill log |
| Recovery | A canister restored from backup within 4 hours of deciding to (recovery time); at most a day of data lost (recovery point: daily backups) | Restore drill timings |

When a month misses a target, note why in the incident review and decide
whether to fix the cause or change the target. The watchdog's run history
(Actions → Cycle Watchdog) is the uptime record.
