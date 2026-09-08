# Storage Capacity — ICP Canister Estimates

All photos and data are stored fully on-chain. No off-chain storage is used.

## ICP Storage Limits (per canister)

| Memory type | Limit | Notes |
|---|---|---|
| Stable memory | 500 GiB (~537 GB) | Persists across upgrades; where all data lives |
| Heap memory | 4 GiB | Working memory only; cleared on upgrade |
| Cost | ~$5.35/GiB/year | At current XDR/cycles rates |

## Per-Canister Record Sizes & Capacity

Capacity shown at 80% of 500 GiB (~400 GiB) to leave headroom.

| Canister | Est. bytes/record | Records at 80% capacity | Notes |
|---|---|---|---|
| **auth** | ~320 | 1.3B | User profiles + roles |
| **property** | ~850 | 500M | Includes rooms + fixtures |
| **job** | ~680 | 628M | Invite tokens add small overhead |
| **contractor** | ~700 | 612M | Profile + reviews combined |
| **quote** | ~900 | 473M | Request + sealed/revealed bids |
| **payment** | ~280 | 1.6B | Very lean; subscriptions + gift records |
| **photo** | **50 KB–1 MB/photo** | **429K–8.6M photos** | **System bottleneck — see below** |
| **report** | ~2,400 | 178M | Job arrays make snapshots fat |
| **market** | ~180 | 2.5B | Score entries + zip index |
| **maintenance** | ~450 | 940M | Schedule entries per property |
| **sensor** | ~1,000 | 429M | Device + event records; events accumulate |
| **monitoring** | ~900 | 473M | Metrics + alerts |
| **listing** | ~1,520 | 281M | FSBO listings + bids |
| **agent** | ~800 | 532M | Realtor profile + reviews |
| **recurring** | ~870 | 489M | Service contracts + visit logs |
| **bills** | ~550 | 773M | 3-month rolling window limits growth |
| **ai_proxy** | Stateless | — | Counters only; no records |

## The Real Bottleneck: Photo Canister

Every other canister comfortably handles tens of millions of records. Photos are the constraint because blobs are stored in stable memory directly.

| Photo size assumption | 50 GiB (10%) | 400 GiB (80%) |
|---|---|---|
| 50 KB (heavy compression) | ~1.1M photos | ~8.6M photos |
| 200 KB (typical mobile compressed) | ~268K photos | ~2.1M photos |
| 1 MB (light compression) | ~53K photos | ~429K photos |

**Scaling the photo canister:** ICP does not currently offer a dedicated blob storage subnet or S3-equivalent. Chunked uploads (required for files >2 MB due to the per-message size limit) must be implemented manually — there is no standard library. The asset canister is not suitable for user-uploaded media (1 GB default, designed for static files).

Practical mitigation strategies within the on-chain constraint:
- Enforce client-side compression before upload (target ≤200 KB per photo)
- Apply tier quotas strictly (Pro: 30/job; grandfathered Basic: 5/job, Premium: 30/job)
- Add a per-property photo cap in addition to per-job cap
- Shard the photo canister horizontally (one canister per property range or zip code) once a single instance approaches ~300 GiB

## Practical User Capacity

Assuming a typical active user has 1.5 properties, 8 jobs/year, 3 photos/job at 200 KB each:

| Constraint | Comfortable ceiling |
|---|---|
| Photo canister (200 KB/photo, 80% cap) | ~1.5M lifetime users |
| Sensor events (10 events/day/IoT device) | ~200K IoT-enabled properties |
| All other canisters | 10M–100M+ users — not the constraint |

**Conclusion:** The platform can scale to ~1–2M users before the photo canister requires horizontal sharding. All other canisters are effectively unlimited at current record sizes.
