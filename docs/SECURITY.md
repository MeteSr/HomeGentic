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

**Known limitation — window resets on upgrade (H-2):** Because
`updateCallLimits` is `transient`, every canister upgrade clears all
per-principal sliding windows. A principal that was mid-window at upgrade
time gets a fresh quota immediately after the upgrade completes. This is an
accepted tradeoff: the window provides cycle-drain protection in steady
state; the reset is bounded to the brief upgrade window and is preferable
to unbounded stable-memory growth from accumulating stale principal entries.

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

## Admin Bootstrap — Nonce Pattern (H-20)

`job`, `property`, and `photo` canisters use a one-time bootstrap nonce to prevent
the race condition where any principal calls `addAdmin()` before the deployer does.

**How it works:**

```motoko
private var adminInitialized : Bool   = false;
private var bootstrapNonce   : ?Text  = null;

// Call this once, before addAdmin, on a fresh canister.
// No-op once adminInitialized = true.
public shared func setBootstrapNonce(nonce: Text) : async () { ... }

public shared(msg) func addAdmin(newAdmin: Principal, nonce: Text)
  : async Result.Result<(), Error> {
  if (adminInitialized) {
    // Normal path: caller must already be admin
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
  } else {
    // Bootstrap path: verify one-time nonce, then consume it
    switch (bootstrapNonce) {
      case null    { return #err(#NotAuthorized) };
      case (?n)    { if (nonce != n) return #err(#NotAuthorized) };
    };
    bootstrapNonce := null;
  };
  ...
  adminInitialized := true;
  #ok(())
};
```

**Deploy sequence (handled automatically by `scripts/deploy.sh`):**
```bash
NONCE=$(openssl rand -hex 16)
dfx canister call property setBootstrapNonce "($NONCE)"
dfx canister call property addAdmin "(principal \"$DEPLOYER\", \"$NONCE\")"
```

**Upgrade behaviour:** On canister upgrade `adminInitialized` is preserved (stable
variable). The nonce path is never taken again. Subsequent `addAdmin` calls only
require the caller to be an existing admin — the `nonce: Text` argument is required
by the Candid type but ignored.

**Other canisters** (`contractor`, `quote`, `report`, etc.) take `addAdmin(Principal)`
— the single-arg form. Only `job`, `property`, and `photo` have the nonce variant.

---

## Fail-Secure Auth Guards

Two patterns were introduced to ensure authentication is enforced even when optional
environment variables are absent.

### `&&` → `||` in conditional key checks

The prior pattern `if (key && header !== key)` skips auth when `key` is `undefined`
— the condition is false so `next()` is called. The correct pattern:

```typescript
// Wrong — bypasses auth when key is unset
if (internalKey && req.headers["x-internal-key"] !== internalKey) { ... }

// Correct — rejects all requests when key is unset
if (!internalKey || req.headers["x-internal-key"] !== internalKey) { ... }
```

This pattern is used in `agents/notifications/server.ts` (`/api/push/send` and
`/api/push/register`) and `agents/iot-gateway/server.ts` (`/accounts/:platform`).
Any new auth-gated endpoint must use the `||` form.

### Startup key assertions

Services that require a secret key to be functional in production throw at startup
when the key is absent (rather than degrading silently):

```typescript
if (!process.env.INTERNAL_API_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("INTERNAL_API_KEY must be set in production");
  }
  console.warn("[notifications] INTERNAL_API_KEY not set — running unprotected (dev only)");
}
```

The voice agent uses the same pattern for `VOICE_AGENT_API_KEY` and
`STRIPE_SECRET_KEY`: if Stripe is configured, the API key must be set or the
process refuses to start.

---

## Subscription Tier Resolution

Agent and chat rate limits are enforced using the subscription tier fetched
**server-side** from the ICP payment canister — the client-supplied
`x-subscription-tier` header is never the source of truth:

```typescript
// voice server — /api/agent and /api/chat
let tier: SubscriptionTier;
try {
  tier = await getSubscriptionTier(principal); // cross-canister query
} catch {
  // Canister unreachable — fall back to header with logged warning
  tier = req.headers["x-subscription-tier"] ?? "Free";
  logger.warn("getSubscriptionTier failed — using header fallback");
}
```

`getSubscriptionTier()` lives in `agents/voice/paymentCanister.ts` and fails safe
to `"Free"` on any canister error.

---

## OAuth CSRF State Store (IoT Gateway)

All OAuth flows in `agents/iot-gateway/server.ts` use a server-side state store
to prevent CSRF token-injection attacks:

```typescript
const oauthStateStore = new Map<string, { platform: string; expiresAt: number }>();

function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}
// State expires after 10 minutes; stale entries are purged on each write.
// consumeOAuthState() deletes the entry — each state is single-use.
```

**Flows covered:**
- `GET /oauth/start/honeywell` → `/oauth/callback/honeywell`
- `GET /oauth/start/ge` → `/oauth/callback/ge`
- `GET /oauth/device/start/:platform` → `/oauth/device/callback/:platform`

The `start` endpoints require `x-admin-token` (IoT gateway admin) and redirect to
the upstream authorization URL with `?state=<token>` appended. Callbacks that
arrive without a valid, unexpired, platform-matching state token are rejected with
HTTP 400.

---

## Server-Side Secret Proxying

API keys that need to reach a third-party service from browser-initiated requests
must be proxied through the voice agent — never stored in `VITE_*` environment
variables, which are baked into the browser bundle at build time.

**Pattern:**
1. Add a proxy route to `agents/voice/server.ts` that reads the key from `process.env`
2. Call that route from the frontend instead of the third-party API directly
3. Authenticate the proxy route with `x-api-key: VITE_VOICE_AGENT_API_KEY`

**Current proxied secrets:**
| Secret | Proxy route | Was previously |
|---|---|---|
| `RENTCAST_API_KEY` | `GET /api/rentcast/properties` | `VITE_RENTCAST_API_KEY` in bundle |

Any new third-party API integration that requires a secret key must follow this
pattern. Do not add new `VITE_*` keys for service credentials.

---

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
