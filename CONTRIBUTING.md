# Contributing to HomeGentic

Thank you for your interest in contributing to HomeGentic!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/homegentic.git`
3. Install Node.js 20+
4. Install the canister tooling: `npm install -g @icp-sdk/icp-cli` and [mops](https://mops.one) (plus [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install/) if you'll run the bash canister tests or regenerate declarations)
5. Start the local network: `make start`
6. Deploy canisters: `make deploy`

## Development Workflow

1. Create a branch off `main`
2. Make your change, keeping `tests/e2e/` in step with any UI-visible change (see `CLAUDE.md`)
3. Run the checks for what you touched:
   - Frontend: `cd frontend && npx tsc --noEmit -p . && npm run test:unit`
   - Canisters: `make check-motoko`, then `make test` against a local replica
4. Open a pull request using the template. CI runs unit, e2e, visual, backend, integration and stable-compatibility checks, plus a secrets scan
5. If your change intentionally alters the UI, `test-visual` fails and `test-visual-heal` commits regenerated baselines to your branch — review them

## Code Conventions

- Motoko canisters: use `persistent actor` — all vars are implicitly stable, no preupgrade/postupgrade hooks needed; use `transient` only for state that should reset on upgrade (e.g. rate-limit maps)
- Stable types must stay upgrade-compatible: add new record fields as `?T`. The `stable-compat-check` CI job fails a PR that would break an in-place upgrade (see `docs/UPGRADE_RUNBOOK.md`)
- Frontend: React functional components with TypeScript strict mode
- Shell scripts: `set -euo pipefail` at the top, descriptive echo statements
- Commit messages: use conventional commits format (`feat:`, `fix:`, `docs:`, etc.)

## Canister Guidelines

- All new canisters go under `backend/<name>/main.mo`
- Add a corresponding `test.sh` under `backend/<name>/test.sh`
- Register the canister in `icp.yaml` (and `dfx.json`, which the declarations generator and bash tests still use)
- Add a deploy step (and admin bootstrap via `setBootstrapNonce` + `addAdmin`) to `scripts/deploy.sh`
- Add its IDL under `frontend/src/declarations/<name>/` and document its methods in `docs/API.md`

## Reporting Issues

Use the GitHub issue templates:
- Bug reports: describe the bug, reproduction steps, and environment
- Feature requests: describe the problem and proposed solution
