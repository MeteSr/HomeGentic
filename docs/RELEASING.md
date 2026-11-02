# Releasing

How a change gets from a pull request to users, and how each release is
identified. Rolling back is in `docs/UPGRADE_RUNBOOK.md`; incidents in
`docs/INCIDENT_RUNBOOK.md`.

## Versions

| What | Version | Where it shows |
|---|---|---|
| Web app and canisters | The mainnet deploy tag, `mainnet-YYYYMMDD-HHMMSS`, on the commit it ran | GitHub release of that tag (merged PRs + `release-manifest.tsv` with every canister's module hash); the frontend sends the commit as `release` with every error report (`VITE_APP_VERSION`) |
| Mobile app | `expo.version` in `mobile/app.json` (semver, bumped by hand), build numbers set by EAS (`autoIncrement`) | App Store / Play; Sentry release |
| Voice Worker, email Worker | The commit Cloudflare shows for each deployment (`wrangler deployments list`) | Cloudflare dashboard |
| Fly relays | The image Fly built from the commit (`fly releases`) | Fly dashboard |

`package.json` versions (`0.1.0`) are not used and don't change.

To find which commit a running canister came from: `icp canister status <name> -e ic`
gives its module hash; search the `release-manifest.tsv` files of recent
releases for it.

## Web app and canisters

1. Merge a PR to `main`. CI must be green (the ruleset should require it; see
   the owner checklist).
2. CI on `main` triggers **Deploy Testnet**. Check the change on testnet; the
   deploy runs `scripts/smoke-deployed.sh` itself.
3. Run **Deploy Mainnet** by hand (Actions → Deploy Mainnet → Run workflow, on
   `main`). It reruns the full CI as a gate, snapshots and upgrades every
   canister (`scripts/deploy.sh`), runs the smoke test, then tags the commit
   and publishes the GitHub release with its notes and manifest.
4. Deploy order constraints between canisters are noted in each PR (for
   example "deploy property before job"); `deploy.sh` already installs in a
   safe order, so they matter only for a by-hand single-canister deploy.
5. If the release changed anything user-visible, refresh the changelog:
   `python3 scripts/ops/changelog.py`, and commit it in a PR.

## Mobile

1. Bump `expo.version` in `mobile/app.json` in a PR (semver: patch for fixes,
   minor for features).
2. After it merges, tag that commit `mobile-v<version>` and push the tag.
   The **Mobile Release** workflow refuses a tag that doesn't match
   `app.json`, then builds and submits to TestFlight and the Play internal
   track.
3. Promote the build to production in App Store Connect and the Play Console.

The app has no over-the-air updates, so every mobile change ships through
store review. Keep backend changes compatible with the app versions still in
use.

## Workers and relays

The voice and email Workers deploy with Deploy Testnet and Deploy Mainnet,
after the canisters. The Fly relays (notification relay, IoT gateway) deploy
from **Deploy Relays**: a push to `main` that touches them deploys to testnet,
and production is a manual run of that workflow from `main`. Each can roll
back on its own (`wrangler rollback`, `fly deploy --image <previous>`).
