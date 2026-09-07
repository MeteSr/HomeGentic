# Image Storage Cost — On-Chain (ICP) vs. Off-Chain (AWS S3)

Now that the app has no subscription revenue, every photo a user uploads is a
cost HomeGentic absorbs with nothing offsetting it. This doc estimates that
cost per photo and per average user under the current architecture (100% of
photo bytes stored on-chain in the `photo` canister), compares it to storing
the same photos on AWS S3, and proposes a hybrid that keeps the on-chain
trust guarantee at a fraction of the cost.

**Bottom line:** on-chain storage costs roughly **19x more per byte** than S3,
and — unlike a typical cloud bill — the cost per user is not flat. It grows
every year a user stays active, because ICP charges ongoing rent on
everything ever stored, not just new uploads. A hybrid architecture (hash
on-chain, image bytes on S3) is available almost for free using data the
`photo` canister already computes, and would flatten that growth curve.

## Assumptions

| Input | Value | Source |
|---|---|---|
| Photo size (standard) | 200 KB | `MAX_BYTES` in `frontend/src/services/photo.ts` — hard ceiling enforced by client-side compression |
| Photo size (construction phases) | 300 KB | `MAX_BYTES_CONSTRUCTION`, same file |
| ICP storage cost | $5.35 / GiB / year | `docs/STORAGE_CAPACITY.md` |
| Cycles ↔ USD | 1T cycles ≈ 1 XDR ≈ $1.33 | XDR/USD floats with the SDR basket — re-check current rate before using these numbers for budgeting |
| Average user | 1.5 properties, 8 jobs/year, 3 photos/job = **24 photos/year** | `docs/STORAGE_CAPACITY.md`'s "practical user capacity" model |
| AWS S3 Standard storage | $0.023 / GB / month → $0.276 / GB / year | AWS S3 pricing, us-east-1, first 50 TB tier |
| S3 PUT/COPY/POST | $0.005 / 1,000 requests | AWS S3 pricing |
| S3 GET | $0.0004 / 1,000 requests | AWS S3 pricing |
| S3 → internet egress | $0.09 / GB (beyond the minimal free tier) | AWS S3 pricing |
| CloudFront → internet egress | $0.085 / GB (first 10 TB/mo) | AWS CloudFront pricing |
| Views per photo per year | 20 (dashboard loads, report shares, buyer due-diligence) | Estimate — not measured. Adjust and re-run if usage data exists. |

GiB/GB are treated as equivalent below (~7% difference — immaterial at this
precision). ICP's exact per-byte ingress/execution fee last verified against
DFINITY's published cycle cost formulas; treat the write-cost figures as
order-of-magnitude, not exact.

## Cost per photo (200 KB)

| Cost component | On-chain (ICP) | Off-chain (S3 direct) | Off-chain (S3 + CloudFront) |
|---|---|---|---|
| Storage, per year | **$0.00100** | **$0.0000514** (~19x cheaper) | $0.0000514 |
| Write (one-time, per upload) | ~$0.0005–0.001 | $0.000005 | $0.000005 |
| Read (per view) | ~$0 (query call) | $0.0000004 + $0.0000168 egress | $0.0000004 + $0.0000158 egress |

The two architectures spend their money in different places. ICP's bill is
almost entirely **storage rent that runs forever**. S3's bill is dominated by
**egress**, which only accrues when someone actually looks at the photo —
cheap for an archival record nobody revisits, more expensive for a photo
that gets shared or viewed repeatedly.

## Cost per average user (24 photos/year)

Because ICP charges rent on the *cumulative* total ever stored, cost per user
climbs every year they stay active — it is not a flat per-user number.

| | Year 1 (24 photos) | Year 3 (72 photos accumulated) |
|---|---|---|
| **On-chain (ICP)** | ~$0.04/year (~$0.024 storage + ~$0.017 writes) | **~$0.09/year** — storage alone on 72 photos is ~$0.072/year, before that year's new writes |
| **Off-chain (S3 direct)** | ~$0.01/year (egress-dominated) | ~$0.02–0.03/year — grows slowly since older photos are viewed less, not stored more expensively |

By year 3, on-chain storage is running **3–4x** the cost of S3 for the same
user, and the gap widens every year after that with no ceiling — a
property's photo history is meant to be permanent, so this liability never
resets.

## Cost at scale (steady-state, ~year-3 profile per user)

| Free users | On-chain (ICP) | Off-chain (S3 direct) | Hybrid (see below) |
|---|---|---|---|
| 10,000 | ~$890/year | ~$250/year | ~$250/year |
| 100,000 | ~$8,900/year | ~$2,500/year | ~$2,500/year |
| 1,000,000 | ~$89,000/year | ~$25,000/year | ~$25,000/year |

And this keeps compounding: a cohort of 100K users active for 5 years costs
noticeably more per year in year 5 than in year 1 under the on-chain model,
while the S3 numbers stay roughly flat.

## A hybrid is already half-built

`backend/photo/main.mo` already computes a SHA-256 hash of every photo for
duplicate detection (`hash: Text`, `hashIndex` map). That hash is exactly
what's needed to keep the on-chain **trust guarantee** — a tamper-evident,
immutable record that a specific photo existed at a specific time — without
storing the 200 KB of pixel data on-chain at all:

- **On-chain:** photo metadata + SHA-256 hash (~100–300 bytes, in line with
  the `auth` canister's per-record size in `STORAGE_CAPACITY.md`)
- **Off-chain (S3):** the actual image bytes, served via CloudFront

This cuts the on-chain footprint of a photo by roughly **1,000x** (200 KB →
~200 bytes), which pushes the on-chain cost per photo down to a rounding
error and leaves S3 storage + egress as the only real ongoing cost — the
"Hybrid" column above. The homeowner-facing trust story doesn't change: the
hash on-chain still proves the photo hasn't been altered since upload: an
`sha256(downloaded file) == hash` check works whether the bytes live in a
canister or in S3.

**Trade-off:** this adds a second system to operate (an S3 bucket + IAM +
CloudFront distribution) and a dependency outside the replicated,
censorship-resistant IC network for the actual pixels — a real product
trade-off against "fully on-chain," not just an infra swap. Worth an explicit
decision, not a silent migration.

## Caveats

- Usage assumptions (photos/job, views/photo) are estimates from
  `STORAGE_CAPACITY.md`, not measured production data. If real upload/view
  counts exist (e.g. from the `monitoring` canister), re-run this with them.
- AWS pricing is us-east-1, publicly listed rates — no committed-use
  discounts, Free Tier, or Reserved Capacity applied.
- ICP's cycle cost constants are periodically adjusted by NNS proposal;
  re-verify before using these figures for a board deck or a burn-rate model.
- This covers **photo storage only** — it does not include compute for the
  other 19 canisters, which `STORAGE_CAPACITY.md` shows are far cheaper per
  record and not the cost driver here.
