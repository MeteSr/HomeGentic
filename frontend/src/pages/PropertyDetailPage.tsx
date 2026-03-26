import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Shield, Wrench, Calendar, DollarSign, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { GenerateReportModal } from "@/components/GenerateReportModal";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

type Tab = "timeline" | "jobs" | "documents" | "settings";

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { properties: storeProperties } = usePropertyStore();
  const [property, setProperty] = useState<Property | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<Tab>("timeline");
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      propertyService.getProperty(BigInt(id)).then(setProperty).catch(() => {
        const cached = storeProperties.find((p) => String(p.id) === id);
        if (cached) setProperty(cached);
      }),
      jobService.getByProperty(id).then(setJobs).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Report link copied!");
  };

  const handleVerify = async (jobId: string) => {
    try {
      const updated = await jobService.verifyJob(jobId);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } catch {
      toast.error("Could not sign job. Please try again.");
    }
  };

  const totalValue = jobService.getTotalValue(jobs);
  const verifiedCount = jobService.getVerifiedCount(jobs);

  const tabs: { key: Tab; label: string }[] = [
    { key: "timeline", label: "Timeline" },
    { key: "jobs",     label: `Jobs (${jobs.length})` },
    { key: "documents",label: "Documents" },
    { key: "settings", label: "Settings" },
  ];

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div style={{ maxWidth: "48rem", margin: "2rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <AlertCircle size={48} color={S.rule} style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontFamily: S.serif, fontWeight: 900, color: S.ink }}>Property not found</h2>
          <Button onClick={() => navigate("/dashboard")} style={{ marginTop: "1rem" }}>
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  const verificationColor =
    property.verificationLevel === "Premium" ? "success"
    : property.verificationLevel === "Basic" ? "info"
    : property.verificationLevel === "PendingReview" ? "warning"
    : "default";

  return (
    <Layout>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          style={{
            display: "flex", alignItems: "center", gap: "0.375rem",
            fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
            textTransform: "uppercase", color: S.inkLight,
            background: "none", border: "none", cursor: "pointer",
            padding: 0, marginBottom: "1.5rem",
          }}
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
              Property Record
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
              {property.address}
            </h1>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
              {property.city}, {property.state} {property.zipCode} · {property.propertyType} · Built {String(property.yearBuilt)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Badge variant={verificationColor as any}>{property.verificationLevel}</Badge>
            <Button icon={<Share2 size={14} />} onClick={() => setShowReportModal(true)}>
              Share Report
            </Button>
          </div>
        </div>

        {/* Verification banners */}
        {property.verificationLevel === "Unverified" && (
          <div style={{
            border: `1px solid ${S.rust}`, padding: "1rem 1.25rem",
            marginBottom: "1.5rem", background: "#FAF0ED",
            display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
          }}>
            <Shield size={16} color={S.rust} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                Ownership not verified
              </p>
              <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>
                Upload a utility bill, deed, or tax record to confirm ownership. Unverified properties cannot generate shareable HomeFax reports.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(`/properties/${property.id}/verify`)}>
              Verify Now
            </Button>
          </div>
        )}

        {property.verificationLevel === "PendingReview" && (
          <div style={{
            border: `1px solid ${S.rule}`, padding: "1rem 1.25rem",
            marginBottom: "1.5rem", background: "#FFF8EC",
            display: "flex", alignItems: "center", gap: "1rem",
          }}>
            <Shield size={16} color="#B89040" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                Under review
              </p>
              <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>
                Your documents are awaiting review. Reports will be unlocked once approved (typically 1–2 business days).
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: `1px solid ${S.rule}`, borderLeft: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
          {[
            { label: "Total Jobs",   value: jobs.length },
            { label: "Verified",     value: verifiedCount },
            { label: "Value Added",  value: `$${(totalValue / 100).toLocaleString()}` },
          ].map((s) => (
            <div key={s.label} style={{ padding: "1.25rem", borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`, background: "#fff" }}>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
                {s.label}
              </div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "0.625rem 1.25rem",
                fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: tab === t.key ? S.rust : S.inkLight,
                background: tab === t.key ? "#FAF0ED" : "none",
                border: "none",
                borderBottom: tab === t.key ? `2px solid ${S.rust}` : "2px solid transparent",
                marginBottom: "-1px",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "timeline"  && <TimelineTab jobs={jobs} onVerify={handleVerify} />}
        {tab === "jobs"      && <JobsTab jobs={jobs} />}
        {tab === "documents" && <DocumentsTab />}
        {tab === "settings"  && <SettingsTab property={property} />}
      </div>

      {showReportModal && (
        <GenerateReportModal property={property} onClose={() => setShowReportModal(false)} />
      )}
    </Layout>
  );
}

function TimelineTab({ jobs, onVerify }: { jobs: Job[]; onVerify: (id: string) => void }) {
  const S = { ink: "#0E0E0C", rule: "#C8C3B8", rust: "#C94C2E", inkLight: "#7A7268", mono: "'IBM Plex Mono', monospace" as const, serif: "'Playfair Display', Georgia, serif" as const };

  if (jobs.length === 0) {
    return (
      <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
        <Calendar size={36} color={S.rule} style={{ margin: "0 auto 1rem" }} />
        <p style={{ fontFamily: S.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No jobs recorded yet</p>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
          Log your first maintenance job to start the timeline.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
      {jobs.map((job) => (
        <div key={job.id} style={{ background: "#fff", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: "0.875rem", marginBottom: "0.125rem" }}>{job.serviceType}</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
                {job.isDiy ? "DIY" : job.contractorName} · {job.date}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                ${(job.amount / 100).toLocaleString()}
              </p>
              <Badge variant={job.status === "verified" ? "success" : job.status === "completed" ? "info" : "warning"} size="sm">
                {job.status}
              </Badge>
            </div>
          </div>
          {job.description && (
            <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300, marginTop: "0.5rem" }}>{job.description}</p>
          )}
          {(job.status === "pending" || job.status === "completed") && (
            <button
              onClick={() => onVerify(job.id)}
              style={{
                marginTop: "0.75rem", padding: "0.375rem 0.875rem",
                fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
                color: S.rust, background: "none", border: `1px solid ${S.rust}`, cursor: "pointer",
              }}
            >
              Sign &amp; Verify →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function JobsTab({ jobs }: { jobs: Job[] }) {
  const S = { rule: "#C8C3B8", inkLight: "#7A7268", ink: "#0E0E0C", mono: "'IBM Plex Mono', monospace" as const };

  if (jobs.length === 0) {
    return (
      <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>No jobs found.</p>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${S.rule}` }}>
            {["Service", "Contractor", "Date", "Amount", "Status"].map((h) => (
              <th key={h} style={{
                textAlign: "left", padding: "0.75rem 1rem",
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                color: S.inkLight, fontWeight: 500,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr key={job.id} style={{ borderBottom: i < jobs.length - 1 ? `1px solid ${S.rule}` : "none", background: "#fff" }}>
              <td style={{ padding: "0.875rem 1rem", fontWeight: 500, fontSize: "0.875rem" }}>{job.serviceType}</td>
              <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: S.inkLight }}>{job.isDiy ? "DIY" : job.contractorName}</td>
              <td style={{ padding: "0.875rem 1rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>{job.date}</td>
              <td style={{ padding: "0.875rem 1rem", fontFamily: S.mono, fontSize: "0.875rem", fontWeight: 500 }}>${(job.amount / 100).toLocaleString()}</td>
              <td style={{ padding: "0.875rem 1rem" }}>
                <Badge variant={job.status === "verified" ? "success" : job.status === "completed" ? "info" : "warning"} size="sm">{job.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsTab() {
  const S = { rule: "#C8C3B8", inkLight: "#7A7268", serif: "'Playfair Display', Georgia, serif" as const, mono: "'IBM Plex Mono', monospace" as const };
  return (
    <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
      <p style={{ fontFamily: S.serif, fontWeight: 700, marginBottom: "0.375rem" }}>Document receipts coming soon</p>
      <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
        Upload and hash your maintenance receipts to prove authenticity on-chain.
      </p>
    </div>
  );
}

function SettingsTab({ property }: { property: Property }) {
  const S = { rule: "#C8C3B8", inkLight: "#7A7268", ink: "#0E0E0C", serif: "'Playfair Display', Georgia, serif" as const, mono: "'IBM Plex Mono', monospace" as const };
  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
          Property Details
        </p>
      </div>
      {[
        { label: "Address",      value: property.address },
        { label: "City",         value: property.city },
        { label: "State",        value: property.state },
        { label: "ZIP Code",     value: property.zipCode },
        { label: "Type",         value: property.propertyType },
        { label: "Year Built",   value: String(property.yearBuilt) },
        { label: "Square Feet",  value: `${Number(property.squareFeet).toLocaleString()} sq ft` },
        { label: "Plan",         value: property.tier },
      ].map((row, i, arr) => (
        <div key={row.label} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "0.75rem 1.25rem",
          borderBottom: i < arr.length - 1 ? `1px solid ${S.rule}` : "none",
          background: "#fff",
        }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
            {row.label}
          </span>
          <span style={{ fontSize: "0.875rem", fontWeight: 500, color: S.ink }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
