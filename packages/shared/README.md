# @homegentic/shared

Dependency-free TypeScript used by every client of the canisters, so each
contract is written once.

| File | What | Used by |
|---|---|---|
| `src/declarations/<canister>.ts` | Candid `idlFactory` for each canister | frontend, mobile, dashboard, voice Worker, notifications and IoT relays |
| `src/serviceTypes.ts` | The service-type list (mirrors `backend/shared/ServiceType.mo`) | frontend, mobile, declarations |
| `src/agentSession.ts` | `x-agent-session` header, token check, client token cache, relay resolver | frontend, mobile, voice Worker, relays |
| `src/logger.ts` | JSON-lines logger | voice Worker, IoT gateway |

It is not an npm workspace: each app keeps its own lockfile and imports the
source directly. The frontend, mobile app and dashboard import it as
`@homegentic/shared/<file>` (an alias in their Vite / Metro / Jest / tsconfig
settings); the agents import it by relative path.

Nothing here may import a package. Declarations take `IDL` as an argument, and
the session helpers take the platform pieces (how to issue, hash or resolve a
token) as options.

When a canister's public interface changes, update its declaration and run
`bash scripts/ci/check-declarations.sh` (CI runs it too), then refresh the
frontend contract snapshots with `cd frontend && npm run test:unit -- --update`.
