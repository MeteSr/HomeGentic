# HomeFax Security

## Authentication
- All user authentication is handled via Internet Identity (decentralized, no passwords)
- Each canister call is authenticated by the caller's Principal

## Authorization
- Role-based access: Homeowner, Contractor, Realtor
- Admin-only operations (pause, verify) check the caller's Principal against an admin list
- Canisters can be paused by admins to prevent writes during emergencies

## Data Integrity
- Photos are stored as SHA-256 hashes, making tampering detectable
- All records are immutable on-chain once written (updates create new records)
- Canister upgrade safety: all state is preserved via preupgrade/postupgrade hooks

## Subscription Enforcement
- Tier limits are enforced server-side (on-chain) in the property canister
- Free tier: 1 property max; Pro: 5; Premium: 25; ContractorPro: unlimited

## Best Practices
- Never commit `.env` files containing canister IDs or identity PEMs
- Use GitHub Secrets for CI/CD credentials
- Rotate DFX identity PEMs regularly for mainnet deployments
