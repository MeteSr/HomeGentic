# HomeFax Architecture

## Overview
HomeFax is built on the Internet Computer Protocol (ICP) using a multi-canister architecture.

## Canisters
| Canister | Purpose |
|---|---|
| auth | User registration, profiles, role management |
| property | Property registration, verification, tier limits |
| job | Maintenance job records and verification |
| contractor | Contractor profiles, ratings, trust scores |
| quote | Quote requests and contractor offers |
| price | Subscription tier pricing |
| payment | ICP token payment processing |
| photo | Construction photo storage and SHA-256 hashing |
| monitoring | Platform health metrics |

## Frontend
React + TypeScript SPA served from an ICP assets canister.
Authentication via Internet Identity.

## Data Flow
1. Users authenticate via Internet Identity
2. Frontend calls backend canisters via @dfinity/agent
3. All data is stored persistently on-chain using stable variables
4. Photos are stored as SHA-256 hashes for tamper-evidence

## Upgrade Safety
All canisters use `persistent actor` with `preupgrade`/`postupgrade` hooks to preserve data across canister upgrades.
