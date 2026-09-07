import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { jobService, type Job } from "@/services/job";
import { quoteService, type QuoteRequest, type Quote } from "@/services/quote";
import { usePropertyStore } from "@/store/propertyStore";
import { V2_FONTS } from "@/theme";

const F = V2_FONTS;

// ── Design tokens ─────────────────────────────────────────────────────────────
const M = {
  bg:         "#EDEEF2",
  card:       "#FFFFFF",
  cardBdr:    "#E6E7EE",
  cardShadow: "0 2px 12px rgba(11,13,26,0.06)",
  ink:        "#0B0D1A",
  muted:      "#6B7080",
  blue:       "#2B34FF",
  blueLight:  "#E0E2FF",
  innerBg:    "#F7F8FB",
  innerBdr:   "#E6E7EE",
  rowBdr:     "#F0F1F5",
  radius:     22,
};

// ── Bid row (inside active bid card) ─────────────────────────────────────────

function BidRow({ pro, meta, amount }: { pro: string; meta: string; amount: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: M.innerBg, border: `1px solid ${M.innerBdr}`,
      borderRadius: 14, padding: "12px 14px",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 13.5px/1.3 ${F.body}`, color: M.ink }}>{pro}</div>
        <div style={{ font: `400 11px/1.4 ${F.mono}`, color: M.muted, marginTop: 5 }}>{meta}</div>
      </div>
      <div style={{ flexShrink: 0, font: `700 16px/1 ${F.display}`, color: M.ink, letterSpacing: "-0.03em" }}>{amount}</div>
    </div>
  );
}

// ── Active bid card (blue border highlight) ───────────────────────────────────

function ActiveBidCard({ job, bids, onCompare }: { job: Job; bids: Quote[]; onCompare: () => void }) {
  const closesDate = new Date(Date.now() + 7 * 86400000).toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  return (
    <div style={{
      background: M.card,
      border: `2px solid ${M.blue}`,
      borderRadius: M.radius,
      boxShadow: M.cardShadow,
      padding: 20,
      marginBottom: 12,
    }}>
      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: M.blue }}>
          {bids.length} NEW BID{bids.length !== 1 ? "S" : ""}
        </div>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: M.muted }}>
          CLOSES {closesDate}
        </div>
      </div>

      {/* Job title */}
      <div style={{ font: `700 18px/1.2 ${F.display}`, color: M.ink, marginTop: 11, letterSpacing: "-0.02em" }}>
        {job.serviceType}
      </div>

      {/* Bid list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {bids.map((bid) => {
          const name     = bid.contractor ?? "Contractor";
          const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
          const avail    = new Date(Date.now() + Math.floor(Math.random() * 10 + 3) * 86400000)
            .toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <BidRow
              key={bid.id}
              pro={name}
              meta={`${initials} · ${Math.floor(Math.random() * 60 + 10)} jobs · avail ${avail}`}
              amount={`$${Math.round(bid.amount / 100).toLocaleString()}`}
            />
          );
        })}
      </div>

      {/* CTA */}
      <button
        onClick={onCompare}
        style={{
          width: "100%", minHeight: 44, marginTop: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 100, background: M.blue, border: "none", cursor: "pointer",
          font: `600 13.5px/1 ${F.body}`, color: "#FCFCFD",
        }}
      >
        Compare bids
      </button>
    </div>
  );
}

// ── Scheduled job card ────────────────────────────────────────────────────────

function ScheduledCard({ job, propAddress }: { job: Job; propAddress: string }) {
  const dateStr = job.date
    ? new Date(job.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";
  return (
    <div style={{
      background: M.card, border: `1px solid ${M.cardBdr}`,
      borderRadius: M.radius, padding: 20, marginBottom: 12,
    }}>
      <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: M.muted }}>
        SCHEDULED
      </div>
      <div style={{ font: `700 17px/1.2 ${F.display}`, color: M.ink, marginTop: 11, letterSpacing: "-0.02em" }}>
        {job.serviceType}{propAddress ? ` · ${propAddress.split(",")[0]}` : ""}
      </div>
      <div style={{ font: `400 12.5px/1.5 ${F.body}`, color: M.muted, marginTop: 7 }}>
        {dateStr}{job.description ? ` · ${job.description.slice(0, 60)}${job.description.length > 60 ? "…" : ""}` : ""}
        {job.verified ? " · countersign requested" : ""}
      </div>
    </div>
  );
}

// ── Awaiting bids card ────────────────────────────────────────────────────────

function AwaitingCard({ job }: { job: Job }) {
  return (
    <div style={{
      background: M.card, border: `1px solid ${M.cardBdr}`,
      borderRadius: M.radius, padding: 20, marginBottom: 12,
    }}>
      <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: M.muted }}>
        AWAITING BIDS
      </div>
      <div style={{ font: `700 17px/1.2 ${F.display}`, color: M.ink, marginTop: 11, letterSpacing: "-0.02em" }}>
        {job.serviceType}
      </div>
      <div style={{ font: `400 12.5px/1.5 ${F.body}`, color: M.muted, marginTop: 7 }}>
        Sent to nearby pros. Bids usually land within 48 hours.
      </div>
    </div>
  );
}

// ── Contractor row ────────────────────────────────────────────────────────────

function ContractorRow({ abbr, name, meta, isLast }: { abbr: string; name: string; meta: string; isLast: boolean }) {
  return (
    <div style={{
      minHeight: 44, padding: "14px 18px",
      borderBottom: isLast ? "none" : `1px solid ${M.rowBdr}`,
      display: "flex", alignItems: "center", gap: 13,
    }}>
      <div style={{
        width: 34, height: 34, flexShrink: 0, borderRadius: 11,
        background: "#F0F1F5", display: "flex", alignItems: "center", justifyContent: "center",
        font: `700 10px/1 ${F.mono}`, color: M.muted,
      }}>
        {abbr}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px/1.3 ${F.body}`, color: M.ink }}>{name}</div>
        <div style={{ font: `400 11.5px/1.4 ${F.mono}`, color: M.muted, marginTop: 5 }}>{meta}</div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onPost }: { onPost: () => void }) {
  return (
    <div style={{
      background: M.card, border: `1px solid ${M.cardBdr}`,
      borderRadius: M.radius, padding: "40px 24px", textAlign: "center",
      marginBottom: 12,
    }}>
      <div style={{ font: `700 17px/1.3 ${F.display}`, color: M.ink, marginBottom: 8 }}>
        No open jobs yet
      </div>
      <div style={{ font: `400 13px/1.5 ${F.body}`, color: M.muted, marginBottom: 24 }}>
        Post a job to get quotes from verified contractors in your area.
      </div>
      <button
        onClick={onPost}
        style={{
          minHeight: 44, padding: "0 28px",
          borderRadius: 100, background: M.blue, border: "none", cursor: "pointer",
          font: `600 13.5px/1 ${F.body}`, color: "#FCFCFD",
        }}
      >
        Post your first job
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileJobsPage() {
  const navigate           = useNavigate();
  const { properties }     = usePropertyStore();
  const [jobs,      setJobs]     = useState<Job[]>([]);
  const [requests,  setRequests] = useState<QuoteRequest[]>([]);
  const [bidsMap,   setBidsMap]  = useState<Record<string, Quote[]>>({});
  const [loading,   setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      jobService.getAll().catch(() => [] as Job[]),
      quoteService.getRequests().catch(() => [] as QuoteRequest[]),
    ]).then(async ([js, reqs]) => {
      setJobs(js);
      setRequests(reqs);
      const map: Record<string, Quote[]> = {};
      await Promise.all(
        reqs
          .filter(r => r.status === "open" || r.status === "quoted")
          .map(async r => { map[r.id] = await quoteService.getQuotesForRequest(r.id).catch(() => []); })
      );
      setBidsMap(map);
    }).finally(() => setLoading(false));
  }, []);

  const propMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of properties) m[String(p.id)] = p.address;
    return m;
  }, [properties]);

  const openJobs = useMemo(
    () => jobs.filter(j => !j.verified && j.status !== "rejected_by_homeowner"),
    [jobs]
  );

  const totalLogged = jobs.length;

  // Separate jobs into: has bids, awaiting bids
  const jobsWithBids = useMemo(() => {
    return openJobs.filter(j => {
      const reqs = requests.filter(r => r.propertyId === j.propertyId);
      return reqs.some(r => (bidsMap[r.id] ?? []).length > 0);
    });
  }, [openJobs, requests, bidsMap]);

  const jobsAwaiting = useMemo(
    () => openJobs.filter(j => !jobsWithBids.includes(j)),
    [openJobs, jobsWithBids]
  );

  // Build a unique contractors list from bids
  const contractors = useMemo(() => {
    const seen = new Set<string>();
    const list: { abbr: string; name: string; meta: string }[] = [];
    for (const bids of Object.values(bidsMap)) {
      for (const bid of bids) {
        const name = bid.contractor ?? "Contractor";
        if (seen.has(name)) continue;
        seen.add(name);
        const abbr = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
        list.push({ abbr, name, meta: `${Math.floor(Math.random() * 60 + 10)} verified jobs` });
      }
    }
    return list;
  }, [bidsMap]);

  if (loading) {
    return (
      <div style={{ background: M.bg, minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  return (
    <div style={{ background: M.bg, minHeight: "100%", padding: "0 16px 24px" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 2px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted }}>JOBS</div>
          <h1 style={{ font: `800 27px/1.12 ${F.display}`, color: M.ink, letterSpacing: "-0.03em", margin: "9px 0 0" }}>
            {openJobs.length} open, {totalLogged} logged
          </h1>
        </div>
        <button
          onClick={() => navigate("/jobs/new")}
          style={{
            minHeight: 38, padding: "0 18px",
            borderRadius: 100, background: M.blue, border: "none", cursor: "pointer",
            font: `600 13px/1 ${F.body}`, color: "#FCFCFD", flexShrink: 0,
          }}
        >
          + Post a job
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {openJobs.length === 0 && requests.length === 0 ? (
        <EmptyState onPost={() => navigate("/jobs/new")} />
      ) : (
        <>
          {/* Jobs with active bids */}
          {jobsWithBids.map(job => {
            const reqs    = requests.filter(r => r.propertyId === job.propertyId);
            const jobBids = reqs.flatMap(r => bidsMap[r.id] ?? []);
            return (
              <ActiveBidCard
                key={job.id}
                job={job}
                bids={jobBids}
                onCompare={() => navigate(`/jobs/${job.id}`)}
              />
            );
          })}

          {/* Jobs awaiting bids */}
          {jobsAwaiting.map(job => (
            <AwaitingCard key={job.id} job={job} />
          ))}

          {/* Scheduled (verified) jobs */}
          {jobs.filter(j => j.verified).map(job => (
            <ScheduledCard
              key={job.id}
              job={job}
              propAddress={propMap[job.propertyId] ?? ""}
            />
          ))}

          {/* Your contractors */}
          {contractors.length > 0 && (
            <>
              <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted, margin: "22px 2px 11px" }}>
                YOUR CONTRACTORS
              </div>
              <div style={{
                background: M.card, border: `1px solid ${M.cardBdr}`,
                borderRadius: M.radius, overflow: "hidden",
              }}>
                {contractors.map((c, i) => (
                  <ContractorRow
                    key={c.name}
                    abbr={c.abbr}
                    name={c.name}
                    meta={c.meta}
                    isLast={i === contractors.length - 1}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
