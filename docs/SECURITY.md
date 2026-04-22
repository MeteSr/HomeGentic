# HomeGentic Security

## Authentication

- All user authentication uses Internet Identity (decentralized, no passwords or sessions)
- Each canister call is authenticated by the caller's cryptographic Principal
- Internet Identity delegation expiry is set to **8 hours** (`maxTimeToLive`)
  — limiting the exposure window of a stolen delegation chain

## Anonymous Principal Rejection (SEC.1)

Every update-capable canister rejects the anonymous principal (`2vxsx-fae`)
before performing any work. The check lives inside `requireActive(caller)`,
which is the first call in every public `shared` update function:

```motoko
private func requireActive(caller: Principal) : Result.Result<(), Error> {
  if (Principal.isAnonymous(caller)) return #err(#Unauthorized);
  // ... pause check, rate limit check
};
```

The `payment` canister (which has no `requireActive`) guards inline at the
top of `subscribe()`. CI enforces this with the SEC.1 test suite
(`frontend/src/__tests__/security/icpProd567.test.ts`).

## Rate Limiting (SEC.2)

Every canister maintains a per-caller sliding-window rate limit (default: 30
update calls / minute). The rate-limit map is declared `transient var` so it
resets to empty on each canister upgrade — preventing unbounded memory growth
from accumulating principal entries across deployments:

```motoko
private transient var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
```

SEC.2 tests assert that no canister uses bare `var updateCallLimits` (which
would persist across upgrades in a `persistent actor`).

## TOCTOU / CallerGuard (payment.subscribe)

`payment.subscribe()` makes two sequential inter-canister `await` calls
(XRC rate fetch → ICP ledger transfer). A `CallerGuard` map prevents
concurrent calls from the same principal from racing through both awaits:

```motoko
private transient var activeSubscribers : Map.Map<Text, Bool> = Map.empty();

// In subscribe():
if (Option.isSome(Map.get(activeSubscribers, Text.compare, callerKey))) {
  return #err(#RateLimited); // second concurrent call blocked
};
Map.add(activeSubscribers, Text.compare, callerKey, true);
// ... awaits ...
Map.delete(activeSubscribers, Text.compare, callerKey);
```

## Authorization

- Role-based access: Homeowner, Contractor, Realtor, Builder
- Admin operations (`pause`, `verify`, `addAdmin`) check the caller's Principal
  against a stable admin list set at deploy time via `addAdmin()`
- Canisters can be paused with an optional expiry to gate writes during
  incidents without requiring an upgrade
- Trusted-canister lists (`trustedCanisterEntries`) allow whitelisted
  inter-canister calls to bypass the per-user rate limiter

## HTTPS Outcall Security

`ai_proxy` makes HTTP outcalls to Resend (email) and ArcGIS/OpenPermit
(permit data). Each call follows the IC security requirements:

- **Transform function** — `transformResponse` strips all non-deterministic
  headers, returning only `status` and `body`. Required for subnet consensus.
- **`max_response_bytes`** — set on every call (4 KB for email, 64 KB for
  permits) to cap cycle consumption.
- **Idempotency-Key** — Resend POST requests include a deterministic
  `Idempotency-Key` header (`Time.now() + caller + recipient`) so Resend
  deduplicates emails if the IC retries the outcall across nodes.

## Data Integrity

- Photos are stored as SHA-256 hashes — raw bytes stay off-chain; the
  on-chain hash makes tampering detectable
- Job records are immutable once both parties have signed (dual-signature)
- Report snapshots are frozen at generation time; subsequent job additions
  cannot alter existing reports

## Canister Upgrade Safety

All canisters use `persistent actor` — the Motoko compiler makes every
module-level variable implicitly stable. No `preupgrade`/`postupgrade` hooks
are needed (and none exist). The SEC.6/PROD.6 test suite verifies this.

## Controller Hardening

The deploying identity is the sole controller after `scripts/deploy.sh`.
Set `BACKUP_CONTROLLER_PRINCIPAL` before deploying to add a second controller
(e.g. a hardware wallet) to every canister automatically.

See [DEPLOYMENT.md](DEPLOYMENT.md) for controller rotation procedures.

## Best Practices

- Never commit `.env` files — they contain canister IDs and identity PEMs
- Use GitHub Secrets (`MAINNET_IDENTITY_PEM`, `BACKUP_CONTROLLER_PRINCIPAL`)
  in the `production` environment for CI/CD
- Rotate identity PEMs on a regular schedule for mainnet deployments
- `fetchRootKey` is only called when `IS_LOCAL = true` — never in production
  builds (enforced by the canister-security test suite)

## Secret Management

### Preventing secret commits

Two layers of defense are in place:

1. **Pre-commit hook** — `scripts/check-secrets.sh` scans staged files for
   common secret patterns (Anthropic keys, AWS access keys, private key
   blocks, generic password assignments) and blocks the commit if any match.
   Install it once after cloning:
   ```bash
   bash scripts/install-hooks.sh
   ```

2. **CI secrets scan** — `.github/workflows/secrets-scan.yml` runs
   [gitleaks](https://github.com/gitleaks/gitleaks) on every push and PR
   against `main`. Any commit containing a secret pattern fails the check
   before the branch can be merged.

### Confirming `.env` is not in history

Run these two commands against a local clone to verify the working tree
has never contained secrets:

```bash
# Check if .env itself was ever tracked
git log --all --full-history -- .env

# Scan all commits for actual key values
git grep -I "sk-ant-api" $(git rev-list --all)
git grep -I "sk_live_[A-Za-z0-9]" $(git rev-list --all)
```

Both commands should produce no output. If either does, follow the key
rotation procedure below immediately.

### Key rotation procedure

Follow these steps any time a key is suspected to be compromised or is
confirmed in git history:

#### Anthropic API key (`ANTHROPIC_API_KEY`)

1. Log in to [console.anthropic.com](https://console.anthropic.com) →
   **API Keys** → revoke the exposed key.
2. Generate a new key and copy it immediately.
3. Update the GitHub Secret: **Settings → Secrets and variables → Actions**
   → update `ANTHROPIC_API_KEY`.
4. Update your local `.env` with the new value.
5. Restart the voice agent (`agents/voice`).

#### Stripe secret key (`STRIPE_SECRET_KEY`)

1. Log in to the [Stripe Dashboard](https://dashboard.stripe.com) →
   **Developers → API keys** → roll the secret key.
2. Copy the new `sk_live_...` value before closing the dialog (it is shown
   only once).
3. Update the GitHub Secret: update `STRIPE_SECRET_KEY` in **Settings →
   Secrets and variables → Actions**.
4. Update your local `.env` with the new value.
5. Redeploy the voice agent or restart the process that reads the key.

#### If a key was committed to git history

Rotating the key is necessary but not sufficient — the old key may have
been cloned or cached. Additional steps:

1. Rotate the key immediately (see above).
2. Force-push a rewritten history using `git filter-repo` to remove the
   commit containing the key. Coordinate with all contributors to re-clone.
3. Contact GitHub Support to purge cached views of the exposed commit.
4. Review access logs in the Anthropic / Stripe dashboards for unexpected
   usage between the exposure date and the rotation date.
