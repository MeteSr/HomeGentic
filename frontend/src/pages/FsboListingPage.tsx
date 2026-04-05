/**
 * FsboListingPage — Epic 10.3.1
 *
 * Public, unauthenticated page at /for-sale/:propertyId.
 * Shows list price, property details, HomeGentic score badge,
 * verified job summary, photo gallery, and a showing-request form.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ShieldCheck } from "lucide-react";
import { propertyService, type Property } from "@/services/property";
import { jobService, type Job } from "@/services/job";
import { photoService, type Photo } from "@/services/photo";
import { fsboService, type FsboRecord } from "@/services/fsbo";
import { reportService, type ShareLink } from "@/services/report";
import { computeScore } from "@/services/scoreService";
import { showingRequestService } from "@/services/showingRequest";
import { notificationService } from "@/services/notifications";
import { COLORS, FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatSqFt(sqFt: bigint): string {
  return Number(sqFt).toLocaleString("en-US");
}

function humanType(type: string): string {
  return type.replace(/([A-Z])/g, " $1").trim();
}

// ─── Showing-request form ─────────────────────────────────────────────────────

export function ShowingRequestForm({ propertyId }: { propertyId: string }) {
  const [name,    setName]    = useState("");
  const [contact, setContact] = useState("");
  const [time,    setTime]    = useState("");
  const [sent,    setSent]    = useState(false);
  const { isMobile } = useBreakpoint();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    showingRequestService.create({ propertyId, name, contact, preferredTime: time });
    notificationService.create({
      type: "ShowingRequest",
      message: `New showing request from ${name} (${contact})`,
      propertyId,
    });
    setSent(true);
  }

  if (sent) {
    return (
      <div style={{ padding: "1.25rem", background: "#f0faf4", border: "1px solid #c3e6cb", textAlign: "center" }}>
        <p style={{ fontFamily: S.sans, fontWeight: 600, color: "#188038", margin: 0 }}>
          Request sent — we'll be in touch shortly!
        </p>
      </div>
    );
  }

  return (
    <form
      aria-label="Showing Request"
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <div>
        <label
          htmlFor="sr-name"
          style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.25rem" }}
        >
          Your Name
        </label>
        <input
          id="sr-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", boxSizing: "border-box" }}
        />
      </div>

      <div>
        <label
          htmlFor="sr-contact"
          style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.25rem" }}
        >
          Email or Phone
        </label>
        <input
          id="sr-contact"
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", boxSizing: "border-box" }}
        />
      </div>

      <div>
        <label
          htmlFor="sr-time"
          style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.25rem" }}
        >
          Preferred Showing Time
        </label>
        <input
          id="sr-time"
          type="text"
          placeholder="e.g. Weekday evenings, Saturday mornings"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", boxSizing: "border-box" }}
        />
      </div>

      <button
        type="submit"
        style={{
          background:  S.sage,
          color:       COLORS.white,
          border:      "none",
          padding:     "0.65rem 1.25rem",
          fontFamily:  S.sans,
          fontWeight:  600,
          fontSize:    "0.875rem",
          cursor:      "pointer",
          alignSelf:   isMobile ? "stretch" : "flex-start",
        }}
      >
        Request a Showing
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FsboListingPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { isMobile } = useBreakpoint();

  const [loading,    setLoading]    = useState(true);
  const [property,   setProperty]   = useState<Property | null>(null);
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [photos,     setPhotos]     = useState<Photo[]>([]);
  const [fsbo,       setFsbo]       = useState<FsboRecord | null | undefined>(undefined);
  const [reportLink, setReportLink] = useState<ShareLink | null>(null);

  const helmetTitle = property && fsbo
    ? `${property.address} — For Sale by Owner | HomeGentic`
    : "For Sale by Owner | HomeGentic";
  const helmetDesc = property && fsbo
    ? `${property.address} — $${(fsbo.listPriceCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} · ${property.city}, ${property.state}. Verified maintenance history on HomeGentic.`
    : "Browse verified FSBO listings with blockchain-backed maintenance history on HomeGentic.";

  useEffect(() => {
    if (!propertyId) { setLoading(false); return; }

    const record = fsboService.getRecord(propertyId);
    setFsbo(record);

    const fetches: Promise<any>[] = [
      propertyService.getProperty(BigInt(propertyId)),
      jobService.getByProperty(propertyId),
      photoService.getByProperty(propertyId),
    ];

    if (record?.hasReport) {
      fetches.push(reportService.listShareLinks(propertyId));
    }

    Promise.all(fetches).then(([prop, propJobs, propPhotos, shareLinks]) => {
      setProperty(prop);
      setJobs(propJobs);
      setPhotos(propPhotos);
      if (shareLinks) {
        const active = (shareLinks as ShareLink[]).find((l) => l.isActive) ?? null;
        setReportLink(active);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [propertyId]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Helmet>
          <title>For Sale by Owner | HomeGentic</title>
          <meta name="description" content="Browse verified FSBO listings with blockchain-backed maintenance history on HomeGentic." />
          <meta property="og:title" content="For Sale by Owner | HomeGentic" />
          <meta property="og:description" content="Verified FSBO listings on HomeGentic." />
          <meta property="og:type" content="website" />
        </Helmet>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: S.mono, color: S.inkLight }}>
          Loading…
        </div>
      </>
    );
  }

  // ── Not for sale ───────────────────────────────────────────────────────────
  if (!fsbo || !fsbo.isFsbo || !property) {
    return (
      <>
        <Helmet>
          <title>Not Listed For Sale | HomeGentic</title>
          <meta name="description" content="This property is not currently listed for sale via FSBO on HomeGentic." />
          <meta property="og:title" content="Not Listed For Sale | HomeGentic" />
          <meta property="og:description" content="This property is not currently available via FSBO." />
          <meta property="og:type" content="website" />
        </Helmet>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink }}>Not Listed For Sale</p>
          <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight }}>This property is not currently available via FSBO.</p>
        </div>
      </>
    );
  }

  const verifiedJobs = jobs.filter((j) => j.verified);
  const score        = computeScore(jobs, [property]);
  const firstPhoto   = photos[0] ?? null;

  return (
    <>
      <Helmet>
        <title>{helmetTitle}</title>
        <meta name="description" content={helmetDesc} />
        <meta property="og:title" content={helmetTitle} />
        <meta property="og:description" content={helmetDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://homegentic.app/for-sale/${propertyId}`} />
      </Helmet>
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: isMobile ? "1rem" : "2rem 1rem", fontFamily: S.sans }}>

      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem", background: COLORS.rule, minHeight: "260px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {firstPhoto ? (
          <img
            src={firstPhoto.url}
            alt="Property photo"
            style={{ width: "100%", maxHeight: "380px", objectFit: "cover", display: "block" }}
          />
        ) : (
          <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight }}>No photos available</p>
        )}
      </div>

      {/* ── Price + address ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", color: S.ink, marginBottom: "0.25rem" }}>
          {formatPrice(fsbo.listPriceCents)}
        </div>
        <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "1.15rem", color: S.ink }}>
          {property.address}
        </div>
        <div style={{ fontFamily: S.sans, fontSize: "0.95rem", color: S.inkLight }}>
          {property.city}, {property.state} {property.zipCode}
        </div>
      </div>

      {/* ── Details grid ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.5rem", borderTop: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`, padding: "1rem 0" }}>
        {[
          { label: "Type",       value: humanType(property.propertyType) },
          { label: "Year Built", value: String(property.yearBuilt) },
          { label: "Sq Ft",      value: formatSqFt(property.squareFeet) },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.15rem" }}>{label}</div>
            <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.95rem", color: S.ink }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── HomeGentic score badge ─────────────────────────────────────────────── */}
      <section
        aria-label="HomeGentic Score"
        style={{ border: `1.5px solid ${S.sage}`, padding: "1rem 1.25rem", marginBottom: "1.5rem", background: COLORS.sageLight }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
          <div style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2.5rem", color: S.ink, lineHeight: 1 }}>
            {score}
          </div>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.15rem" }}>
              HomeGentic Score
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: S.mono, fontSize: "0.65rem", color: S.sage }}>
              <ShieldCheck size={13} />
              Verified on ICP Blockchain
            </div>
          </div>
        </div>
        <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.inkLight, margin: 0 }}>
          Maintenance data is stored on-chain and immutable — records cannot be altered or deleted after submission.
        </p>
      </section>

      {/* ── Verified jobs summary ────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, marginBottom: "0.5rem" }}>
          Maintenance Record
        </div>
        <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink, marginBottom: "0.5rem" }}>
          <strong>{verifiedJobs.length} verified</strong> maintenance job{verifiedJobs.length !== 1 ? "s" : ""} on record
        </div>
        {verifiedJobs.length > 0 && (
          <ul style={{ margin: 0, padding: "0 0 0 1.1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {verifiedJobs.map((j) => (
              <li key={j.id} style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight }}>
                {j.serviceType} — {j.date ? new Date(j.date).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Full report link (10.3.3) ───────────────────────────────────────── */}
      {reportLink && (
        <div style={{ marginBottom: "1.5rem" }}>
          <a
            href={`/report/${reportLink.token}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.875rem", color: S.sage, textDecoration: "underline" }}
          >
            View Full Maintenance History
          </a>
        </div>
      )}

      {/* ── Showing request ─────────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem" }}>
        <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: "0 0 1rem" }}>
          Schedule a Showing
        </h2>
        <ShowingRequestForm propertyId={propertyId!} />
      </div>
    </div>
    </>
  );
}
