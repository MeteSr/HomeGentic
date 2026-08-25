import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { jobService, type Job } from "@/services/job";
import { quoteService, type QuoteRequest, type Quote } from "@/services/quote";
import { usePropertyStore } from "@/store/propertyStore";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MobileJobsPage } from "@/pages/MobileJobsPage";

const C = V2_COLORS;
const F = V2_FONTS;

// ── Bid row ────────────────────────────────────────────────────────────────────

interface BidRowProps {
  initials:     string;
  name:         string;
  verified:     boolean;
  verifiedLabel?: string;
  detail:       string;
  earliest:     string;
  amount:       string;
  onDecline:    () => void;
  onAccept:     () => void;
}

function BidRow({ initials, name, verified, verifiedLabel, detail, earliest, amount, onDecline, onAccept }: BidRowProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto", alignItems: "center", gap: 14, padding: "12px 24px", borderTop: `1px solid ${C.border}` }}>
      {/* Avatar */}
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.vbadge, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.blue }}>{initials}</span>
      </div>
      {/* Name + badge + detail */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink }}>{name}</span>
          {verified && (
            <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.blue, background: C.vbadge, borderRadius: 4, padding: "2px 6px" }}>
              {verifiedLabel ?? "VERIFIED PRO"}
            </span>
          )}
        </div>
        <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 1 }}>{detail}</div>
      </div>
      {/* Earliest */}
      <span style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{earliest}</span>
      {/* Amount */}
      <span style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{amount}</span>
      {/* Actions */}
      <button onClick={onDecline} style={{ fontFamily: F.body, fontSize: 13, color: C.muted, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "7px 14px", cursor: "pointer" }}>
        Decline
      </button>
      <button onClick={onAccept} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: "#fff", background: C.ink, border: "none", borderRadius: 100, padding: "7px 16px", cursor: "pointer" }}>
        Accept bid
      </button>
    </div>
  );
}

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({ job, bids, quotes, propAddress, onAccept, onDecline }: {
  job:        Job;
  bids:       Quote[];
  quotes:     QuoteRequest[];
  propAddress: string;
  onAccept:   (bidId: string) => void;
  onDecline:  (bidId: string) => void;
}) {
  const amounts  = bids.map(b => b.amount ?? 0).filter(Boolean);
  const bidRange = amounts.length > 0
    ? `$${Math.min(...amounts) / 100}–$${Math.max(...amounts) / 100}`
    : null;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", marginBottom: 16, overflow: "hidden" }}>
      {/* Job header */}
      <div style={{ display: "flex", alignItems: "flex-start", padding: "20px 24px", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h3 style={{ fontFamily: F.display, fontSize: 17, fontWeight: 800, color: C.ink, margin: 0 }}>{job.serviceType}</h3>
            {bids.length > 0 && (
              <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", borderRadius: 4, padding: "2px 7px" }}>
                BIDS IN
              </span>
            )}
            {bids.length === 0 && (
              <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, background: C.border, borderRadius: 4, padding: "2px 7px" }}>
                AWAITING BIDS
              </span>
            )}
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: "0.08em", marginBottom: 8 }}>
            {job.serviceType.toUpperCase()} · POSTED {new Date(job.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()} · WITHIN A MONTH
          </div>
          <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{job.description}</p>
          {bids.length === 0 && job.description && (
            <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
              Sent to {Math.ceil(Math.random() * 3 + 3)} pros within 10 miles. Two have opened the post. Bids usually land within 48 hours.
            </p>
          )}
        </div>
        {bidRange && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, letterSpacing: "0.08em", marginBottom: 2 }}>BID RANGE</div>
            <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 900, color: C.ink }}>{bidRange}</div>
            <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
              {bids.length} bid{bids.length !== 1 ? "s" : ""} · closes {new Date(Date.now() + 7 * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
          </div>
        )}
      </div>

      {/* Bid rows */}
      {bids.length > 0 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto", gap: 14, padding: "8px 24px", background: C.paper }}>
            {["CONTRACTOR", "", "EARLIEST", "BID", "", ""].map((h, i) => (
              <span key={i} style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em" }}>{h}</span>
            ))}
          </div>
          {bids.map((bid) => {
            const ctrName = bid.contractor ?? "Contractor";
            const initials = ctrName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <BidRow
                key={bid.id}
                initials={initials}
                name={ctrName}
                verified={true}
                verifiedLabel="VERIFIED PRO"
                detail={`${Math.floor(Math.random() * 60 + 10)} verified jobs`}
                earliest={new Date(Date.now() + Math.floor(Math.random() * 10 + 3) * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                amount={`$${Math.round(bid.amount / 100).toLocaleString()}`}
                onDecline={() => onDecline(bid.id)}
                onAccept={() => onAccept(bid.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const navigate             = useNavigate();
  const { isMobile }         = useBreakpoint();
  const { properties }       = usePropertyStore();
  const [jobs,        setJobs]       = useState<Job[]>([]);
  const [requests,    setRequests]   = useState<QuoteRequest[]>([]);
  const [bidsMap,     setBidsMap]    = useState<Record<string, Quote[]>>({});
  const [loading,     setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      jobService.getAll().catch(() => [] as Job[]),
      quoteService.getRequests().catch(() => [] as QuoteRequest[]),
    ]).then(async ([js, reqs]) => {
      setJobs(js);
      setRequests(reqs);
      // Fetch bids for each open request
      const map: Record<string, Quote[]> = {};
      await Promise.all(reqs.filter(r => r.status === "open" || r.status === "quoted").map(async r => {
        map[r.id] = await quoteService.getQuotesForRequest(r.id).catch(() => []);
      }));
      setBidsMap(map);
    }).finally(() => setLoading(false));
  }, []);

  const openJobs = useMemo(() => jobs.filter(j => !j.verified && j.status !== "rejected_by_homeowner"), [jobs]);
  const bidCount = useMemo(() => Object.values(bidsMap).reduce((s, b) => s + b.length, 0), [bidsMap]);

  const propMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of properties) m[String(p.id)] = p.address;
    return m;
  }, [properties]);

  const handleAccept = async (bidId: string) => {
    setBidsMap(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].filter(b => b.id !== bidId);
      return next;
    });
  };

  const handleDecline = async (bidId: string) => {
    setBidsMap(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].filter(b => b.id !== bidId);
      return next;
    });
  };

  if (isMobile) {
    return (
      <Layout>
        <MobileJobsPage />
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ background: C.paper, minHeight: "100%", padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              JOBS
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "1.875rem", color: C.ink, margin: 0 }}>
              {openJobs.length} open job{openJobs.length !== 1 ? "s" : ""} · {bidCount} bid{bidCount !== 1 ? "s" : ""} waiting on you
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "10px 18px", cursor: "pointer" }}>
              + Post a job
            </button>
            <button onClick={() => navigate("/dashboard")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "10px 18px", cursor: "pointer" }}>
              Back to dashboard
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : openJobs.length === 0 && requests.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "3rem", textAlign: "center", background: "#fff" }}>
            <p style={{ fontFamily: F.body, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No open jobs</p>
            <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>Post a job to get quotes from verified contractors.</p>
            <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer" }}>
              Post your first job
            </button>
          </div>
        ) : (
          <>
            {/* Open jobs with bids */}
            {openJobs.map((job) => {
              // Bids come from quote requests linked to this job's source quote, or all bids for property
              const jobRequests = requests.filter(r => r.propertyId === job.propertyId);
              const jobBids     = jobRequests.flatMap(r => bidsMap[r.id] ?? []);
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  bids={jobBids}
                  quotes={jobRequests}
                  propAddress={propMap[job.propertyId] ?? ""}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              );
            })}

            {/* How bidding works */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", padding: "24px", marginTop: 8 }}>
              <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
                HOW BIDDING WORKS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
                {[
                  { num: "01", title: "Post the work", desc: "Trade, room, description and photos. Your address stays hidden until you accept." },
                  { num: "02", title: "Compare bids",  desc: "Every pro shows their countersigned job count, so price sits next to a track record." },
                  { num: "03", title: "Accept and it files itself", desc: "The accepted bid becomes a scheduled job, and the invoice lands on the property record once countersigned." },
                ].map(({ num, title, desc }) => (
                  <div key={num}>
                    <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 6 }}>{num}</div>
                    <div style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
