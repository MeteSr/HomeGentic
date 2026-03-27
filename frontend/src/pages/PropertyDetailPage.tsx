import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Shield, Wrench, Calendar, DollarSign, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { GenerateReportModal } from "@/components/GenerateReportModal";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { photoService, Photo } from "@/services/photo";
import { usePropertyStore } from "@/store/propertyStore";
import { useAuthStore } from "@/store/authStore";
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
  const { principal } = useAuthStore();
  const [property, setProperty] = useState<Property | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<Tab>("timeline");
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [photosByJob, setPhotosByJob] = useState<Record<string, Photo[]>>({});

  useEffect(() => {
    if (!id) return;
    Promise.all([
      propertyService.getProperty(BigInt(id)).then(setProperty).catch(() => {
        const cached = storeProperties.find((p) => String(p.id) === id);
        if (cached) setProperty(cached);
      }),
      jobService.getByProperty(id).then(setJobs).catch(() => {}),
      photoService.getByProperty(id).then((photos) => {
        const map: Record<string, Photo[]> = {};
        for (const p of photos) {
          (map[p.jobId] ??= []).push(p);
        }
        setPhotosByJob(map);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const handlePhotoUpload = async (jobId: string, file: File) => {
    try {
      const photo = await photoService.upload(file, jobId, id!, "PostConstruction", "Job photo");
      setPhotosByJob((prev) => ({
        ...prev,
        [jobId]: [...(prev[jobId] ?? []), photo],
      }));
    } catch (err: any) {
      toast.error(err.message ?? "Photo upload failed");
    }
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
              Share HomeFax Report
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

        {tab === "timeline"  && <TimelineTab jobs={jobs} onVerify={handleVerify} currentPrincipal={principal} photosByJob={photosByJob} onPhotoUpload={handlePhotoUpload} />}
        {tab === "jobs"      && <JobsTab jobs={jobs} />}
        {tab === "documents" && <DocumentsTab propertyId={id!} />}
        {tab === "settings"  && <SettingsTab property={property} />}
      </div>

      {showReportModal && (
        <GenerateReportModal property={property} onClose={() => setShowReportModal(false)} />
      )}
    </Layout>
  );
}

function SigPill({ signed, label }: { signed: boolean; label: string }) {
  const S = { sage: "#3D6B57", inkLight: "#7A7268", rule: "#C8C3B8", mono: "'IBM Plex Mono', monospace" as const };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.25rem",
      fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "0.15rem 0.5rem",
      border: `1px solid ${signed ? S.sage : S.rule}`,
      color: signed ? S.sage : S.inkLight,
      background: signed ? "#F0F6F3" : "#fafafa",
    }}>
      {signed ? "✓" : "○"} {label}
    </span>
  );
}

function PhotoStrip({ photos, jobId, onUpload }: { photos: Photo[]; jobId: string; onUpload: (jobId: string, file: File) => void }) {
  const S = { rule: "#C8C3B8", inkLight: "#7A7268", rust: "#C94C2E", mono: "'IBM Plex Mono', monospace" as const };
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onUpload(jobId, file); e.target.value = ""; }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
      {photos.slice(0, 5).map((p) => (
        <img
          key={p.id}
          src={p.url}
          alt={p.description}
          title={p.description}
          style={{ width: 48, height: 48, objectFit: "cover", border: `1px solid ${S.rule}` }}
        />
      ))}
      {photos.length > 5 && (
        <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
          +{photos.length - 5} more
        </span>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "0.2rem 0.6rem",
          fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
          color: S.inkLight, background: "none", border: `1px solid ${S.rule}`, cursor: "pointer",
        }}
      >
        + Add Photo
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
    </div>
  );
}

function warrantyStatus(job: Job): { label: string; color: string; bg: string } | null {
  if (!job.warrantyMonths || job.warrantyMonths <= 0) return null;
  const jobDate = new Date(job.date).getTime();
  const expiryMs = jobDate + job.warrantyMonths * 30.44 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const daysLeft = Math.round((expiryMs - now) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return { label: "Warranty expired", color: "#7A7268", bg: "#F4F1EB" };
  if (daysLeft <= 90) return { label: `Warranty: ${daysLeft}d left`, color: "#C94C2E", bg: "#FAF0ED" };
  const monthsLeft = Math.round(daysLeft / 30);
  return { label: `Warranty: ${monthsLeft}mo left`, color: "#3D6B57", bg: "#F0F6F3" };
}

function TimelineTab({ jobs, onVerify, currentPrincipal, photosByJob, onPhotoUpload }: {
  jobs: Job[];
  onVerify: (id: string) => void;
  currentPrincipal: string | null;
  photosByJob: Record<string, Photo[]>;
  onPhotoUpload: (jobId: string, file: File) => void;
}) {
  const S = { ink: "#0E0E0C", rule: "#C8C3B8", rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57", mono: "'IBM Plex Mono', monospace" as const, serif: "'Playfair Display', Georgia, serif" as const };
  const [justVerified, setJustVerified] = React.useState<string | null>(null);

  const verifiedCount = jobs.filter((j) => j.verified).length;

  const handleVerify = (jobId: string) => {
    onVerify(jobId);
    setJustVerified(jobId);
    setTimeout(() => setJustVerified(null), 2500);
  };

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
    <>
      {/* 3-service engagement milestone */}
      {verifiedCount >= 3 && (
        <div style={{ border: `1px solid ${S.sage}`, background: "#F0F6F3", padding: "0.875rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.25rem" }}>🏅</span>
          <div>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, marginBottom: "0.1rem" }}>
              Home History Taking Shape
            </p>
            <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>
              {verifiedCount} verified jobs on-chain. Your HomeFax report is ready to impress buyers.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
        {jobs.map((job) => {
          const isHomeowner  = currentPrincipal && job.homeowner === currentPrincipal;
          const canSign      = !job.verified && isHomeowner && !job.homeownerSigned;
          const needsBothSig = !job.isDiy;
          const isFlashing   = justVerified === job.id || (job.verified && justVerified === job.id);
          const warranty     = warrantyStatus(job);

          return (
            <div
              key={job.id}
              data-testid={`job-${job.serviceType.toLowerCase().replace(/\s+/g, "-")}`}
              style={{
                background: isFlashing ? "#F0F6F3" : "#fff",
                padding: "1.25rem",
                transition: "background 0.6s ease",
              }}
            >
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
                    {isFlashing ? "⛓ locked on-chain" : job.status}
                  </Badge>
                </div>
              </div>

              {job.description && (
                <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300, marginTop: "0.5rem" }}>{job.description}</p>
              )}

              {/* Warranty pill */}
              {warranty && (
                <div style={{ marginTop: "0.5rem" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "0.25rem",
                    fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "0.15rem 0.5rem",
                    color: warranty.color, background: warranty.bg,
                    border: `1px solid ${warranty.color}40`,
                  }}>
                    🛡 {warranty.label}
                  </span>
                </div>
              )}

              {/* Signature status */}
              {!job.verified && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                  <SigPill signed={job.homeownerSigned} label="Homeowner" />
                  {needsBothSig && (
                    <SigPill signed={job.contractorSigned} label={job.contractor ? "Contractor" : "Contractor (not linked)"} />
                  )}
                  {canSign && (
                    <button
                      onClick={() => handleVerify(job.id)}
                      style={{
                        padding: "0.25rem 0.75rem",
                        fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        color: S.rust, background: "none", border: `1px solid ${S.rust}`, cursor: "pointer",
                      }}
                    >
                      Sign →
                    </button>
                  )}
                  {job.homeownerSigned && !job.contractorSigned && !job.isDiy && !job.verified && (
                    <span style={{
                      fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em",
                      textTransform: "uppercase", color: S.inkLight,
                    }}>
                      Awaiting contractor signature
                    </span>
                  )}
                </div>
              )}

              <PhotoStrip
                photos={photosByJob[job.id] ?? []}
                jobId={job.id}
                onUpload={onPhotoUpload}
              />
            </div>
          );
        })}
      </div>
    </>
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

function DocumentsTab({ propertyId }: { propertyId: string }) {
  const S = {
    ink: "#0E0E0C", rule: "#C8C3B8", inkLight: "#7A7268", rust: "#C94C2E",
    serif: "'Playfair Display', Georgia, serif" as const,
    mono:  "'IBM Plex Mono', monospace" as const,
  };
  const RECEIPT_JOB = `receipts_${propertyId}`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    photoService.getByJob(RECEIPT_JOB).then(setDocs).catch(() => {});
  }, [propertyId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const doc = await photoService.upload(file, RECEIPT_JOB, propertyId, "PostConstruction", file.name);
      setDocs((prev) => [doc, ...prev]);
      toast.success("Receipt uploaded");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
          Maintenance Receipts
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "0.375rem 0.875rem", border: `1px solid ${S.rust}`, color: S.rust,
            background: "none", cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.5 : 1,
          }}
        >
          {uploading ? "Uploading…" : "+ Upload Receipt"}
        </button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} />
      </div>

      {docs.length === 0 ? (
        <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
          <p style={{ fontFamily: S.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No receipts uploaded yet</p>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            Upload maintenance receipts — each file is SHA-256 hashed and stored on-chain.
          </p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${S.rule}` }}>
          {docs.map((doc, i) => (
            <div key={doc.id} style={{
              display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1.25rem",
              background: "#fff", borderBottom: i < docs.length - 1 ? `1px solid ${S.rule}` : "none",
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.125rem" }}>{doc.description}</p>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.06em" }}>
                  {(doc.size / 1024).toFixed(1)} KB · SHA-256: {doc.hash.slice(0, 16)}… · {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              {doc.url && (
                <a href={doc.url} target="_blank" rel="noreferrer" style={{
                  fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: S.rust, textDecoration: "none",
                }}>
                  View
                </a>
              )}
            </div>
          ))}
        </div>
      )}
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
