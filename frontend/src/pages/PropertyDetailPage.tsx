import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Share2, Shield, Wrench, MessageSquare, Calendar, DollarSign, AlertCircle, Star } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { GenerateReportModal } from "@/components/GenerateReportModal";
import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { photoService, Photo } from "@/services/photo";
import { computeScore, getScoreGrade, recordSnapshot } from "@/services/scoreService";
import { usePropertyStore } from "@/store/propertyStore";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

type Tab = "timeline" | "jobs" | "documents" | "settings";

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties: storeProperties } = usePropertyStore();
  const { principal } = useAuthStore();
  const [property, setProperty] = useState<Property | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "timeline";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [showReportModal,  setShowReportModal]  = useState(false);
  const [showLogJobModal,  setShowLogJobModal]  = useState(false);
  const [showQuoteModal,   setShowQuoteModal]   = useState(false);
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

  // Record score snapshot whenever property + jobs are resolved
  useEffect(() => {
    if (!loading && property) {
      const score = computeScore(jobs, [property]);
      recordSnapshot(score, String(property.id));
    }
  }, [loading, property, jobs]);

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
  const homefaxScore = property ? computeScore(jobs, [property]) : 0;
  const scoreGrade   = getScoreGrade(homefaxScore);

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

        {/* Back — hidden for single-property users whose home base is this page */}
        {storeProperties.length !== 1 && (
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
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: COLORS.butter, color: COLORS.plum, padding: "4px 14px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.625rem", border: `1px solid rgba(46,37,64,0.1)` }}>
              Property Record
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
              {property.address}
            </h1>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
              {property.city}, {property.state} {property.zipCode} · {property.propertyType} · Built {String(property.yearBuilt)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <Badge variant={verificationColor as any}>{property.verificationLevel}</Badge>
            <Button variant="outline" icon={<Wrench size={14} />} onClick={() => setShowLogJobModal(true)}>Log Job</Button>
            <Button variant="outline" icon={<MessageSquare size={14} />} onClick={() => setShowQuoteModal(true)}>Request Quote</Button>
            <Button icon={<Share2 size={14} />} onClick={() => setShowReportModal(true)}>
              Share HomeFax Report
            </Button>
          </div>
        </div>

        {/* Verification banners */}
        {property.verificationLevel === "Unverified" && (
          <div style={{
            border: `1px solid ${S.rust}`, padding: "1rem 1.25rem",
            marginBottom: "1.5rem", background: COLORS.sageLight,
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
            marginBottom: "1.5rem", background: COLORS.butter,
            display: "flex", alignItems: "center", gap: "1rem",
          }}>
            <Shield size={16} color={COLORS.plum} style={{ flexShrink: 0 }} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "2rem" }}>
          {[
            { label: "Total Jobs",   value: String(jobs.length) },
            { label: "Verified",     value: String(verifiedCount) },
            { label: "Value Added",  value: `$${(totalValue / 100).toLocaleString()}` },
          ].map((s) => (
            <div key={s.label} style={{ padding: "1.25rem", borderRadius: RADIUS.card, border: `1px solid ${COLORS.rule}`, background: COLORS.white, boxShadow: SHADOWS.card }}>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
                {s.label}
              </div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>
                {s.value}
              </div>
            </div>
          ))}
          {/* HomeFax Score — accent cell */}
          <div style={{ padding: "1.25rem", borderRadius: RADIUS.card, border: `1px solid ${COLORS.plum}`, background: COLORS.plum, boxShadow: SHADOWS.card }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.5rem" }}>
              HomeFax Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.75rem", lineHeight: 1, color: COLORS.white }}>
                {homefaxScore}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: "rgba(255,255,255,0.7)" }}>
                {scoreGrade}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.rule}`, marginBottom: "1.5rem" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "0.625rem 1.25rem",
                fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? COLORS.sage : COLORS.plumMid,
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? `2px solid ${COLORS.sage}` : "2px solid transparent",
                marginBottom: "-1px",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "timeline"  && <TimelineTab property={property} jobs={jobs} onVerify={handleVerify} currentPrincipal={principal} photosByJob={photosByJob} onPhotoUpload={handlePhotoUpload} />}
        {tab === "jobs"      && <JobsTab jobs={jobs} />}
        {tab === "documents" && <DocumentsTab propertyId={id!} />}
        {tab === "settings"  && <SettingsTab property={property} currentPrincipal={principal ?? ""} />}
      </div>

      {showReportModal && (
        <GenerateReportModal property={property} onClose={() => setShowReportModal(false)} />
      )}

      <LogJobModal
        isOpen={showLogJobModal}
        onClose={() => setShowLogJobModal(false)}
        onSuccess={() => {
          jobService.getByProperty(id!).then(setJobs).catch(() => {});
        }}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
      />

      <RequestQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSuccess={(quoteId) => { setShowQuoteModal(false); navigate(`/quotes/${quoteId}`); }}
        properties={storeProperties.length > 0 ? storeProperties : (property ? [property] : [])}
      />
    </Layout>
  );
}

function SigPill({ signed, label }: { signed: boolean; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.25rem",
      fontFamily: FONTS.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "0.15rem 0.625rem", borderRadius: 100,
      border: `1px solid ${signed ? COLORS.sageMid : COLORS.rule}`,
      color: signed ? COLORS.sage : COLORS.plumMid,
      background: signed ? COLORS.sageLight : COLORS.white,
    }}>
      {signed ? "✓" : "○"} {label}
    </span>
  );
}

function PhotoStrip({ photos, jobId, onUpload }: { photos: Photo[]; jobId: string; onUpload: (jobId: string, file: File) => void }) {
  const LS = { rule: COLORS.rule, inkLight: COLORS.plumMid, rust: COLORS.sage, mono: FONTS.mono };
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onUpload(jobId, file); e.target.value = ""; }
  };

  const openLightbox = (idx: number) => setLightboxIdx(idx);
  const closeLightbox = () => setLightboxIdx(null);
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx((i) => i !== null ? Math.max(0, i - 1) : null); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx((i) => i !== null ? Math.min(photos.length - 1, i + 1) : null); };

  // Keyboard navigation
  React.useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  setLightboxIdx((i) => i !== null ? Math.max(0, i - 1) : null);
      if (e.key === "ArrowRight") setLightboxIdx((i) => i !== null ? Math.min(photos.length - 1, i + 1) : null);
      if (e.key === "Escape")     setLightboxIdx(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIdx, photos.length]);

  const activePh = lightboxIdx !== null ? photos[lightboxIdx] : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
        {photos.slice(0, 5).map((p, i) => (
          <img
            key={p.id}
            src={p.url}
            alt={p.description}
            title={p.description}
            onClick={() => openLightbox(i)}
            style={{ width: 48, height: 48, objectFit: "cover", border: `1px solid ${LS.rule}`, cursor: "pointer" }}
          />
        ))}
        {photos.length > 5 && (
          <button
            onClick={() => openLightbox(5)}
            style={{ fontFamily: LS.mono, fontSize: "0.6rem", color: LS.inkLight, background: "none", border: `1px solid ${LS.rule}`, padding: "0.2rem 0.5rem", cursor: "pointer" }}
          >
            +{photos.length - 5} more
          </button>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "0.2rem 0.6rem",
            fontFamily: LS.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
            color: LS.inkLight, background: "none", border: `1px solid ${LS.rule}`, cursor: "pointer",
          }}
        >
          + Add Photo
        </button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
      </div>

      {/* Lightbox overlay */}
      {activePh && (
        <div
          onClick={closeLightbox}
          style={{
            position: "fixed", inset: 0, background: "rgba(14,14,12,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: "2rem",
          }}
        >
          {/* Prev */}
          <button
            onClick={prev}
            disabled={lightboxIdx === 0}
            style={{ position: "absolute", left: "1.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: `1px solid rgba(255,255,255,0.3)`, color: COLORS.white, padding: "0.75rem", cursor: lightboxIdx === 0 ? "default" : "pointer", opacity: lightboxIdx === 0 ? 0.3 : 1, fontSize: "1.25rem", lineHeight: 1 }}
          >
            ‹
          </button>

          {/* Image */}
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "80vw", maxHeight: "80vh" }}>
            <img
              src={activePh.url}
              alt={activePh.description}
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", border: "1px solid rgba(255,255,255,0.2)" }}
            />
            <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>
                {activePh.description || "No description"}
              </span>
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.55rem", color: "rgba(255,255,255,0.4)" }}>
                {(lightboxIdx ?? 0) + 1} / {photos.length}
              </span>
            </div>
          </div>

          {/* Next */}
          <button
            onClick={next}
            disabled={lightboxIdx === photos.length - 1}
            style={{ position: "absolute", right: "1.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: `1px solid rgba(255,255,255,0.3)`, color: COLORS.white, padding: "0.75rem", cursor: lightboxIdx === photos.length - 1 ? "default" : "pointer", opacity: lightboxIdx === photos.length - 1 ? 0.3 : 1, fontSize: "1.25rem", lineHeight: 1 }}
          >
            ›
          </button>

          {/* Close */}
          <button
            onClick={closeLightbox}
            style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: `1px solid rgba(255,255,255,0.3)`, color: COLORS.white, padding: "0.375rem 0.75rem", fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

function warrantyStatus(job: Job): { label: string; color: string; bg: string } | null {
  if (!job.warrantyMonths || job.warrantyMonths <= 0) return null;
  const jobDate = new Date(job.date).getTime();
  const expiryMs = jobDate + job.warrantyMonths * 30.44 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const daysLeft = Math.round((expiryMs - now) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return { label: "Warranty expired", color: COLORS.plumMid, bg: COLORS.white };
  if (daysLeft <= 90) return { label: `Warranty: ${daysLeft}d left`, color: COLORS.sage, bg: COLORS.blush };
  const monthsLeft = Math.round(daysLeft / 30);
  return { label: `Warranty: ${monthsLeft}mo left`, color: COLORS.sage, bg: COLORS.sageLight };
}

function TimelineTab({ property, jobs, onVerify, currentPrincipal, photosByJob, onPhotoUpload }: {
  property: Property;
  jobs: Job[];
  onVerify: (id: string) => void;
  currentPrincipal: string | null;
  photosByJob: Record<string, Photo[]>;
  onPhotoUpload: (jobId: string, file: File) => void;
}) {
  const S = { ink: COLORS.plum, rule: COLORS.rule, rust: COLORS.sage, inkLight: COLORS.plumMid, sage: COLORS.sage, mono: FONTS.mono, serif: FONTS.serif };
  const navigate = useNavigate();
  const [justVerified,        setJustVerified]        = React.useState<string | null>(null);
  const [reviewNudgeJob,      setReviewNudgeJob]      = React.useState<Job | null>(null);
  const [newestFirst,         setNewestFirst]         = React.useState(true);
  const [expandedJobId,       setExpandedJobId]       = React.useState<string | null>(null);
  const [warrantyUploading,   setWarrantyUploading]   = React.useState<string | null>(null); // jobId being uploaded
  const warrantyInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const handleWarrantyUpload = async (job: Job, file: File) => {
    setWarrantyUploading(job.id);
    try {
      await photoService.upload(file, job.id, String(property.id), "Warranty", `Warranty|${job.serviceType}|${file.name}`);
      toast.success("Warranty document uploaded");
    } catch (err: any) {
      const msg: string = err.message ?? "Upload failed";
      toast.error(msg === "Duplicate" ? "Already uploaded" : msg);
    } finally {
      setWarrantyUploading(null);
    }
  };

  const verifiedCount = jobs.filter((j) => j.verified).length;

  // Sort jobs and group by year for the timeline
  const sortedJobs = React.useMemo(() => {
    return [...jobs].sort((a, b) =>
      newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
    );
  }, [jobs, newestFirst]);

  const handleVerify = (jobId: string) => {
    onVerify(jobId);
    setJustVerified(jobId);
    const job = jobs.find((j) => j.id === jobId);
    if (job && !job.isDiy) setReviewNudgeJob(job);
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
        <div style={{ border: `1px solid ${S.sage}`, background: COLORS.sageLight, padding: "0.875rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
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

      {/* Review nudge — shown after a contractor job is verified */}
      {reviewNudgeJob && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
          border: `1px solid ${COLORS.sageMid}`, padding: "0.875rem 1.25rem", marginBottom: "1rem",
          background: COLORS.butter, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Star size={14} color={COLORS.plum} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plum, marginBottom: "0.15rem" }}>
                Job verified — leave a review
              </p>
              <p style={{ fontSize: "0.8rem", fontWeight: 300, color: COLORS.plumMid }}>
                Help other homeowners by reviewing {reviewNudgeJob.contractorName || "this contractor"}.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {reviewNudgeJob.contractor && (
              <button
                onClick={() => navigate(`/contractor/${reviewNudgeJob.contractor}`)}
                style={{
                  fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  padding: "0.375rem 0.875rem", border: `1px solid ${COLORS.sageMid}`, color: COLORS.plum,
                  background: "none", cursor: "pointer",
                }}
              >
                Leave a Review
              </button>
            )}
            <button
              onClick={() => setReviewNudgeJob(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Timeline sort control */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button
          onClick={() => setNewestFirst((v) => !v)}
          style={{
            fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "0.25rem 0.75rem", border: `1px solid ${S.rule}`, background: "none",
            color: S.inkLight, cursor: "pointer",
          }}
        >
          {newestFirst ? "Newest First ↓" : "Oldest First ↑"}
        </button>
      </div>

      {/* Visual timeline */}
      <div style={{ paddingLeft: "1.5rem", position: "relative" }}>
        {/* Vertical spine */}
        <div style={{ position: "absolute", left: "0.5rem", top: 0, bottom: 0, width: "1px", background: S.rule }} />

        {sortedJobs.map((job, idx) => {
          const isHomeowner  = currentPrincipal && job.homeowner === currentPrincipal;
          const canSign      = !job.verified && isHomeowner && !job.homeownerSigned;
          const needsBothSig = !job.isDiy;
          const isFlashing   = justVerified === job.id || (job.verified && justVerified === job.id);
          const warranty     = warrantyStatus(job);
          const year         = job.date.slice(0, 4);
          const prevYear     = idx > 0 ? sortedJobs[idx - 1].date.slice(0, 4) : null;
          const showYearMark = year !== prevYear;

          return (
            <React.Fragment key={job.id}>
              {/* Year separator */}
              {showYearMark && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", marginTop: idx > 0 ? "1.25rem" : 0 }}>
                  <div style={{
                    position: "absolute", left: "0.125rem",
                    width: "0.75rem", height: "0.75rem", background: S.ink,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }} />
                  <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", color: S.ink, marginLeft: "0.25rem" }}>
                    {year}
                  </span>
                </div>
              )}

              {/* Timeline entry */}
              <div style={{ position: "relative", marginBottom: "1px" }}>
                {/* Dot on spine */}
                <div style={{
                  position: "absolute", left: "-1.25rem", top: "1.375rem",
                  width: "0.5rem", height: "0.5rem",
                  background: job.verified ? S.sage : S.rule,
                  border: `1px solid ${job.verified ? S.sage : S.inkLight}`,
                }} />

                <div
                  data-testid={`job-${job.serviceType.toLowerCase().replace(/\s+/g, "-")}`}
                  style={{
                    background: isFlashing ? COLORS.sageLight : COLORS.white,
                    padding: "1.25rem",
                    border: `1px solid ${S.rule}`,
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
                        <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
                          Awaiting contractor signature
                        </span>
                      )}
                    </div>
                  )}

                  {/* Detail expand toggle */}
                  {(job.permitNumber || job.description) && (
                    <button
                      onClick={() => setExpandedJobId((prev) => prev === job.id ? null : job.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.625rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      {expandedJobId === job.id ? "▲ less" : "▼ details"}
                    </button>
                  )}

                  {expandedJobId === job.id && (
                    <div style={{ marginTop: "0.625rem", padding: "0.75rem", background: S.paper, border: `1px solid ${S.rule}`, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {job.permitNumber && (
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, width: "6rem", flexShrink: 0 }}>Permit #</span>
                          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.ink }}>{job.permitNumber}</span>
                        </div>
                      )}
                      {job.description && (
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, width: "6rem", flexShrink: 0 }}>Description</span>
                          <span style={{ fontSize: "0.8rem", color: S.ink, fontWeight: 300, lineHeight: 1.5 }}>{job.description}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, width: "6rem", flexShrink: 0 }}>Job ID</span>
                        <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{job.id}</span>
                      </div>
                      {job.verified && (
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, width: "6rem", flexShrink: 0 }}>ICP Record</span>
                          <a
                            href={`https://dashboard.internetcomputer.org/account/${property.owner}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.sage, textDecoration: "none", borderBottom: `1px solid ${S.sage}` }}
                          >
                            Verified on ICP ↗
                          </a>
                        </div>
                      )}
                      {/* Edit button — only for homeowner-owned unverified jobs */}
                      {!job.verified && job.homeowner === currentPrincipal && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <button
                            onClick={() => navigate("/jobs/new", { state: { editJob: job } })}
                            style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${S.rule}`, background: "#fff", color: S.inkLight, cursor: "pointer" }}
                          >
                            Edit record
                          </button>
                        </div>
                      )}
                      {/* Warranty doc upload — shown for any job with a warranty */}
                      {job.warrantyMonths && job.warrantyMonths > 0 && (
                        <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            onClick={() => warrantyInputRefs.current[job.id]?.click()}
                            disabled={warrantyUploading === job.id}
                            style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${COLORS.sage}`, background: COLORS.white, color: COLORS.sage, cursor: warrantyUploading === job.id ? "not-allowed" : "pointer", opacity: warrantyUploading === job.id ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            🛡 {warrantyUploading === job.id ? "Uploading…" : "Upload warranty doc"}
                          </button>
                          <input
                            ref={(el) => { warrantyInputRefs.current[job.id] = el; }}
                            type="file"
                            accept="image/*,application/pdf"
                            style={{ display: "none" }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWarrantyUpload(job, f); e.target.value = ""; }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <PhotoStrip
                    photos={photosByJob[job.id] ?? []}
                    jobId={job.id}
                    onUpload={onPhotoUpload}
                  />
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}

function JobsTab({ jobs }: { jobs: Job[] }) {
  const S = { rule: COLORS.rule, inkLight: COLORS.plumMid, ink: COLORS.plum, mono: FONTS.mono };

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

// ─── Document vault helpers ───────────────────────────────────────────────────

const DOC_TYPES = ["Receipt", "Permit", "Inspection", "Warranty", "Invoice"] as const;
type DocType = typeof DOC_TYPES[number];

const DOC_TYPE_COLORS: Record<DocType, { color: string; bg: string }> = {
  Receipt:    { color: COLORS.plumMid,  bg: COLORS.white },
  Permit:     { color: COLORS.plum,     bg: COLORS.sageLight },
  Inspection: { color: COLORS.sage,     bg: COLORS.sageLight },
  Warranty:   { color: COLORS.plum,     bg: COLORS.butter },
  Invoice:    { color: COLORS.sage,     bg: COLORS.blush },
};

function encodeDoc(type: DocType, filename: string): string {
  return `[${type}] ${filename}`;
}

// Extended encoders for rich metadata types
function encodePermit(permitNumber: string, authority: string, status: string, filename: string): string {
  return `[Permit] ${permitNumber}|${authority}|${status}|${filename}`;
}

function encodeInspection(inspector: string, status: string, filename: string): string {
  return `[Inspection] ${inspector}|${status}|${filename}`;
}

interface ParsedDoc {
  type: DocType;
  filename: string;
  permitNumber?: string;
  authority?: string;
  inspector?: string;
  status?: string;
}

function parseDoc(description: string): ParsedDoc {
  const m = description.match(/^\[(\w+)\] (.+)$/);
  if (!m || !DOC_TYPES.includes(m[1] as DocType)) {
    return { type: "Receipt", filename: description };
  }
  const type = m[1] as DocType;
  const rest = m[2];

  if (type === "Permit") {
    const parts = rest.split("|");
    if (parts.length >= 4) {
      return { type, permitNumber: parts[0], authority: parts[1], status: parts[2], filename: parts.slice(3).join("|") };
    }
  }
  if (type === "Inspection") {
    const parts = rest.split("|");
    if (parts.length >= 3) {
      return { type, inspector: parts[0], status: parts[1], filename: parts.slice(2).join("|") };
    }
  }
  return { type, filename: rest };
}

// ─────────────────────────────────────────────────────────────────────────────

type BatchFileStatus = "pending" | "uploading" | "done" | "duplicate" | "error";
interface BatchFile { name: string; status: BatchFileStatus; error?: string }

function DocumentsTab({ propertyId }: { propertyId: string }) {
  const S = { ink: COLORS.plum, rule: COLORS.rule, inkLight: COLORS.plumMid, rust: COLORS.sage, serif: FONTS.serif, mono: FONTS.mono };
  const DOCS_JOB = `docs_${propertyId}`;
  const inputRef  = React.useRef<HTMLInputElement>(null);
  const permitRef = React.useRef<HTMLInputElement>(null);
  const inspectionRef = React.useRef<HTMLInputElement>(null);

  const [docs,     setDocs]     = useState<Photo[]>([]);
  const [docType,  setDocType]  = useState<DocType>("Receipt");
  const [queue,    setQueue]    = useState<BatchFile[]>([]);
  const batchActive = queue.some((f) => f.status === "pending" || f.status === "uploading");

  // Permit metadata
  const [permitNumber,    setPermitNumber]    = useState("");
  const [permitAuthority, setPermitAuthority] = useState("");
  const [permitStatus,    setPermitStatus]    = useState<"Open" | "Closed" | "Expired">("Open");
  const [permitUploading, setPermitUploading] = useState(false);

  // Inspection metadata
  const [inspectorName,     setInspectorName]     = useState("");
  const [inspectionStatus,  setInspectionStatus]  = useState<"Pass" | "Fail" | "Conditional">("Pass");
  const [inspectionUploading, setInspectionUploading] = useState(false);

  const handlePermitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (permitRef.current) permitRef.current.value = "";
    setPermitUploading(true);
    try {
      const description = encodePermit(permitNumber || "No #", permitAuthority || "Unknown", permitStatus, file.name);
      const doc = await photoService.upload(file, DOCS_JOB, propertyId, "PostConstruction", description);
      setDocs((prev) => [doc, ...prev]);
      toast.success("Permit uploaded");
      setPermitNumber(""); setPermitAuthority("");
    } catch (err: any) {
      const msg: string = err.message ?? "Upload failed";
      toast.error(msg === "Duplicate" ? "Already uploaded" : msg);
    } finally {
      setPermitUploading(false);
    }
  };

  const handleInspectionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inspectionRef.current) inspectionRef.current.value = "";
    setInspectionUploading(true);
    try {
      const description = encodeInspection(inspectorName || "Unknown", inspectionStatus, file.name);
      const doc = await photoService.upload(file, DOCS_JOB, propertyId, "PostConstruction", description);
      setDocs((prev) => [doc, ...prev]);
      toast.success("Inspection report uploaded");
      setInspectorName("");
    } catch (err: any) {
      const msg: string = err.message ?? "Upload failed";
      toast.error(msg === "Duplicate" ? "Already uploaded" : msg);
    } finally {
      setInspectionUploading(false);
    }
  };

  useEffect(() => {
    // Load both legacy "receipts_" key and new "docs_" key
    Promise.all([
      photoService.getByJob(`receipts_${propertyId}`).catch(() => []),
      photoService.getByJob(DOCS_JOB).catch(() => []),
    ]).then(([legacy, current]) => {
      const all = [...legacy, ...current].sort((a, b) => b.createdAt - a.createdAt);
      setDocs(all);
    });
  }, [propertyId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (inputRef.current) inputRef.current.value = "";

    const initialQueue: BatchFile[] = files.map((f) => ({ name: f.name, status: "pending" }));
    setQueue(initialQueue);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setQueue((prev) => prev.map((q, idx) => idx === i ? { ...q, status: "uploading" } : q));
      try {
        const description = encodeDoc(docType, file.name);
        const doc = await photoService.upload(file, DOCS_JOB, propertyId, "PostConstruction", description);
        setDocs((prev) => [doc, ...prev]);
        setQueue((prev) => prev.map((q, idx) => idx === i ? { ...q, status: "done" } : q));
      } catch (err: any) {
        const msg: string = err.message ?? "Upload failed";
        const isDuplicate = msg === "Duplicate" || msg.startsWith("Duplicate");
        setQueue((prev) => prev.map((q, idx) => idx === i ? { ...q, status: isDuplicate ? "duplicate" : "error", error: isDuplicate ? "Already uploaded" : msg } : q));
      }
    }
  };

  const statusIcon = (s: BatchFileStatus) => {
    if (s === "done")      return <span style={{ color: COLORS.sage }}>✓</span>;
    if (s === "duplicate") return <span style={{ color: COLORS.plumMid }}>⊘</span>;
    if (s === "error")     return <span style={{ color: COLORS.plum }}>✗</span>;
    if (s === "uploading") return <span style={{ color: COLORS.plum }}>↑</span>;
    return <span style={{ color: COLORS.rule }}>…</span>;
  };

  return (
    <div>
      {/* Permits & Inspections — dedicated section */}
      <div style={{ border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.sm, marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${COLORS.rule}`, background: COLORS.sageLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.plum }}>
            Permits &amp; Inspections
          </p>
          <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: COLORS.plumMid }}>Upload with metadata — status tracked on-chain</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: COLORS.white }}>
          {/* Permit */}
          <div style={{ padding: "1rem 1.25rem", borderRight: `1px solid ${S.rule}` }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plum, marginBottom: "0.75rem" }}>Permit</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input
                className="form-input"
                placeholder="Permit #"
                value={permitNumber}
                onChange={(e) => setPermitNumber(e.target.value)}
                style={{ fontSize: "0.8rem" }}
              />
              <input
                className="form-input"
                placeholder="Issuing authority (e.g. City of Austin)"
                value={permitAuthority}
                onChange={(e) => setPermitAuthority(e.target.value)}
                style={{ fontSize: "0.8rem" }}
              />
              <select
                className="form-input"
                value={permitStatus}
                onChange={(e) => setPermitStatus(e.target.value as any)}
                style={{ fontSize: "0.8rem" }}
              >
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
            <button
              disabled={permitUploading}
              onClick={() => permitRef.current?.click()}
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${COLORS.plum}`, color: COLORS.plum, background: "none", cursor: permitUploading ? "not-allowed" : "pointer", opacity: permitUploading ? 0.5 : 1 }}
            >
              {permitUploading ? "Uploading…" : "+ Upload Permit"}
            </button>
            <input ref={permitRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handlePermitUpload} />
          </div>
          {/* Inspection */}
          <div style={{ padding: "1rem 1.25rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.sage, marginBottom: "0.75rem" }}>Inspection Report</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input
                className="form-input"
                placeholder="Inspector name or company"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                style={{ fontSize: "0.8rem" }}
              />
              <select
                className="form-input"
                value={inspectionStatus}
                onChange={(e) => setInspectionStatus(e.target.value as any)}
                style={{ fontSize: "0.8rem" }}
              >
                <option value="Pass">Pass</option>
                <option value="Conditional">Conditional</option>
                <option value="Fail">Fail</option>
              </select>
            </div>
            <button
              disabled={inspectionUploading}
              onClick={() => inspectionRef.current?.click()}
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${COLORS.sage}`, color: COLORS.sage, background: "none", cursor: inspectionUploading ? "not-allowed" : "pointer", opacity: inspectionUploading ? 0.5 : 1 }}
            >
              {inspectionUploading ? "Uploading…" : "+ Upload Report"}
            </button>
            <input ref={inspectionRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleInspectionUpload} />
          </div>
        </div>
      </div>

      {/* Upload controls */}
      <div style={{ border: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            Upload Documents
          </p>
          <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
            Select multiple files — duplicates are auto-detected
          </p>
        </div>
        <div style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Type picker */}
          <div style={{ display: "flex", gap: "1px", background: S.rule }}>
            {DOC_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setDocType(t)}
                style={{
                  padding: "0.35rem 0.75rem",
                  fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  border: "none", cursor: "pointer",
                  background: docType === t ? COLORS.plum : COLORS.white,
                  color:      docType === t ? COLORS.white : S.inkLight,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {/* Upload button */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={batchActive}
            style={{
              fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
              padding: "0.375rem 0.875rem", border: `1px solid ${S.rust}`, color: S.rust,
              background: "none", cursor: batchActive ? "not-allowed" : "pointer", opacity: batchActive ? 0.5 : 1,
            }}
          >
            {batchActive ? "Uploading…" : `+ Upload ${docType}s`}
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} />
        </div>

        {/* Batch progress queue */}
        {queue.length > 0 && (
          <div style={{ borderTop: `1px solid ${S.rule}` }}>
            {queue.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 1.25rem", borderBottom: i < queue.length - 1 ? `1px solid ${S.rule}` : "none", background: f.status === "error" ? COLORS.blush : f.status === "duplicate" ? COLORS.sageLight : COLORS.white }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.8rem", width: "1rem", textAlign: "center" }}>{statusIcon(f.status)}</span>
                <span style={{ flex: 1, fontFamily: S.mono, fontSize: "0.65rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", color: f.status === "error" ? S.rust : f.status === "duplicate" ? S.inkLight : f.status === "done" ? COLORS.sage : S.inkLight }}>
                  {f.status === "error" ? (f.error ?? "Error") : f.status === "duplicate" ? "Duplicate — skipped" : f.status === "done" ? "Uploaded" : f.status === "uploading" ? "Uploading…" : "Queued"}
                </span>
              </div>
            ))}
            {!batchActive && (
              <div style={{ padding: "0.5rem 1.25rem", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setQueue([])} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", background: "none", color: S.inkLight, cursor: "pointer" }}>
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
          <p style={{ fontFamily: S.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No documents yet</p>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            Upload receipts, permits, inspection reports, warranties, or invoices.
            Each file is SHA-256 hashed and stored on-chain.
          </p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${S.rule}` }}>
          {docs.map((doc, i) => {
            const parsed = parseDoc(doc.description);
            const { type, filename } = parsed;
            const tc = DOC_TYPE_COLORS[type];
            return (
              <div key={doc.id} style={{
                display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1.25rem",
                background: "#fff", borderBottom: i < docs.length - 1 ? `1px solid ${S.rule}` : "none",
              }}>
                {/* Type badge */}
                <span style={{
                  fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  padding: "0.2rem 0.5rem", flexShrink: 0,
                  color: tc.color, background: tc.bg, border: `1px solid ${tc.color}30`,
                }}>
                  {type}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {filename}
                  </p>
                  {/* Permit metadata */}
                  {type === "Permit" && parsed.permitNumber && (
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: COLORS.plum, letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
                      {parsed.permitNumber} · {parsed.authority} · <span style={{ textTransform: "uppercase", fontWeight: 700, color: parsed.status === "Closed" ? COLORS.sage : parsed.status === "Expired" ? COLORS.plumMid : COLORS.plum }}>{parsed.status}</span>
                    </p>
                  )}
                  {/* Inspection metadata */}
                  {type === "Inspection" && parsed.inspector && (
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", color: COLORS.sage, letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
                      {parsed.inspector} · <span style={{ textTransform: "uppercase", fontWeight: 700, color: parsed.status === "Pass" ? COLORS.sage : parsed.status === "Fail" ? COLORS.plum : COLORS.plumMid }}>{parsed.status}</span>
                    </p>
                  )}
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.06em" }}>
                    {(doc.size / 1024).toFixed(1)} KB · {doc.hash.slice(0, 16)}… · {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer" style={{
                    fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    color: S.rust, textDecoration: "none", flexShrink: 0,
                  }}>
                    View
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ property, currentPrincipal }: { property: Property; currentPrincipal: string }) {
  const S = { rule: COLORS.rule, inkLight: COLORS.plumMid, ink: COLORS.plum, rust: COLORS.sage, sage: COLORS.sage, paper: COLORS.white, serif: FONTS.serif, mono: FONTS.mono };
  const navigate = useNavigate();

  const [transferPrincipal, setTransferPrincipal] = React.useState("");
  const [transferStep, setTransferStep] = React.useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [transferError, setTransferError] = React.useState<string | null>(null);

  // Incoming pending transfer (this user is the recipient)
  const [incomingTransfer, setIncomingTransfer] = React.useState<import("../services/property").PendingTransfer | null>(null);
  const [incomingLoading, setIncomingLoading] = React.useState(false);
  const [historyRecords, setHistoryRecords] = React.useState<import("../services/property").TransferRecord[]>([]);

  React.useEffect(() => {
    propertyService.getPendingTransfer(BigInt(property.id)).then((pt) => {
      if (pt && pt.to === currentPrincipal) setIncomingTransfer(pt);
    }).catch(() => {});
    propertyService.getOwnershipHistory(BigInt(property.id)).then(setHistoryRecords).catch(() => {});
  }, [property.id, currentPrincipal]);

  const verificationNext =
    property.verificationLevel === "Unverified"
      ? { label: "Verify Ownership", href: `/properties/${property.id}/verify`, color: S.rust }
      : property.verificationLevel === "Basic"
      ? { label: "Upgrade to Premium", href: "/pricing", color: S.ink }
      : null;

  const section = (title: string) => (
    <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: S.paper }}>
      <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>{title}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Property Details */}
      <div style={{ border: `1px solid ${S.rule}` }}>
        {section("Property Details")}
        {[
          { label: "Address",     value: property.address },
          { label: "City",        value: property.city },
          { label: "State",       value: property.state },
          { label: "ZIP Code",    value: property.zipCode },
          { label: "Type",        value: property.propertyType },
          { label: "Year Built",  value: String(property.yearBuilt) },
          { label: "Square Feet", value: `${Number(property.squareFeet).toLocaleString()} sq ft` },
        ].map((row, i, arr) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1.25rem", borderBottom: i < arr.length - 1 ? `1px solid ${S.rule}` : "none", background: "#fff" }}>
            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>{row.label}</span>
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: S.ink }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Verification & Trust */}
      <div style={{ border: `1px solid ${S.rule}` }}>
        {section("Verification & Trust")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem",
              color: property.verificationLevel === "Premium" ? S.sage : property.verificationLevel === "Basic" ? COLORS.plum : property.verificationLevel === "PendingReview" ? COLORS.plumMid : S.inkLight }}>
              {property.verificationLevel}
            </p>
            <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300, lineHeight: 1.5 }}>
              {property.verificationLevel === "Premium"
                ? "Fully verified — buyers and lenders trust this record."
                : property.verificationLevel === "Basic"
                ? "Basic verification complete. Upgrade for full buyer trust."
                : property.verificationLevel === "PendingReview"
                ? "Your documents are under review. We'll notify you when done."
                : "Not yet verified. Upload ownership documents to unlock report sharing."}
            </p>
          </div>
          {verificationNext && (
            <button
              onClick={() => navigate(verificationNext.href)}
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: verificationNext.color, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              {verificationNext.label} →
            </button>
          )}
        </div>
      </div>

      {/* Plan & Limits */}
      <div style={{ border: `1px solid ${S.rule}` }}>
        {section("Plan & Limits")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.1rem", color: S.ink, marginBottom: "0.25rem" }}>
              {property.tier ?? "Free"}
            </p>
            <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300, lineHeight: 1.5 }}>
              {property.tier === "Pro"
                ? "5 properties · 20 photos per job · 10 open quotes"
                : property.tier === "Premium"
                ? "25 properties · unlimited photos · full history exports"
                : "1 property · 5 photos per job · 3 open quotes"}
            </p>
          </div>
          {(!property.tier || property.tier === "Free") && (
            <button
              onClick={() => navigate("/pricing")}
              style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: S.ink, color: S.paper, border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              Upgrade Plan →
            </button>
          )}
        </div>
      </div>

      {/* On-Chain Identity */}
      <div style={{ border: `1px solid ${S.rule}` }}>
        {section("On-Chain Identity")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: "Owner Principal", value: property.owner },
            { label: "Property ID",     value: String(property.id) },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, width: "8rem", flexShrink: 0, paddingTop: "0.1rem" }}>{row.label}</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.ink, wordBreak: "break-all" }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, width: "8rem", flexShrink: 0 }}>ICP Dashboard</span>
            <a
              href={`https://dashboard.internetcomputer.org/account/${property.owner}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.sage, textDecoration: "none", borderBottom: `1px solid ${S.sage}` }}
            >
              View on ICP Explorer ↗
            </a>
          </div>
        </div>
      </div>

      {/* Incoming Transfer — shown when this user is the designated recipient */}
      {incomingTransfer && (
        <div style={{ border: `1px solid ${COLORS.sage}`, background: COLORS.sageLight }}>
          {section("Incoming Transfer")}
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: COLORS.plum, lineHeight: 1.6 }}>
              <strong>{incomingTransfer.from}</strong> has proposed to transfer this property to you. Accept to become the owner on-chain.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                disabled={incomingLoading}
                onClick={async () => {
                  setIncomingLoading(true);
                  try {
                    await propertyService.acceptTransfer(BigInt(property.id));
                    toast.success("Transfer accepted — you are now the owner.");
                    setIncomingTransfer(null);
                    navigate("/dashboard");
                  } catch (e: any) {
                    toast.error(e.message ?? "Accept failed");
                  } finally {
                    setIncomingLoading(false);
                  }
                }}
                style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: COLORS.sage, color: COLORS.white, border: "none", cursor: "pointer" }}
              >
                {incomingLoading ? "Accepting…" : "Accept Transfer"}
              </button>
              <button
                disabled={incomingLoading}
                onClick={async () => {
                  setIncomingLoading(true);
                  try {
                    await propertyService.cancelTransfer(BigInt(property.id));
                    setIncomingTransfer(null);
                    toast.success("Transfer declined.");
                  } catch (e: any) {
                    toast.error(e.message ?? "Decline failed");
                  } finally {
                    setIncomingLoading(false);
                  }
                }}
                style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: "none", border: `1px solid ${S.rule}`, color: S.inkLight, cursor: "pointer" }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership */}
      <div style={{ border: `1px solid ${S.rust}` }}>
        {section("Transfer Ownership")}
        <div style={{ padding: "1.25rem", background: "#fff" }}>
          {transferStep === "done" ? (
            <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.sage }}>Transfer proposed. The recipient must accept on-chain to complete the transfer.</p>
          ) : (
            <>
              <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300, lineHeight: 1.6, marginBottom: "1rem" }}>
                Transferring ownership is <strong style={{ color: S.rust, fontWeight: 600 }}>irreversible</strong>. The new owner will gain full control of this property record, including its maintenance history and verification status.
              </p>
              {transferStep === "idle" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div>
                    <label className="form-label">New Owner Principal ID</label>
                    <input
                      className="form-input"
                      value={transferPrincipal}
                      onChange={(e) => { setTransferPrincipal(e.target.value); setTransferError(null); }}
                      placeholder="aaaaa-aa..."
                      spellCheck={false}
                    />
                  </div>
                  {transferError && (
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.rust }}>{transferError}</p>
                  )}
                  <button
                    onClick={() => {
                      if (!transferPrincipal.trim()) { setTransferError("Enter the new owner's principal ID."); return; }
                      setTransferStep("confirm");
                    }}
                    style={{ alignSelf: "flex-start", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: S.rust, color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    Transfer →
                  </button>
                </div>
              )}
              {transferStep === "confirm" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ padding: "0.875rem", background: COLORS.blush, border: `1px solid ${S.rust}`, borderRadius: RADIUS.sm }}>
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.rust, marginBottom: "0.25rem" }}>Confirm transfer to:</p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink, wordBreak: "break-all" }}>{transferPrincipal}</p>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      onClick={async () => {
                        setTransferStep("loading");
                        try {
                          await propertyService.initiateTransfer(BigInt(property.id), transferPrincipal.trim());
                          setTransferStep("done");
                        } catch (e: any) {
                          setTransferError(e.message ?? "Transfer failed.");
                          setTransferStep("idle");
                        }
                      }}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: S.rust, color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      Confirm Transfer
                    </button>
                    <button
                      onClick={() => { setTransferStep("idle"); setTransferError(null); }}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: "none", border: `1px solid ${S.rule}`, color: S.inkLight, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {transferStep === "loading" && (
                <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>Submitting transfer…</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ownership History */}
      {historyRecords.length > 0 && (
        <div style={{ border: `1px solid ${S.rule}` }}>
          {section("Ownership History")}
          <div style={{ background: "#fff" }}>
            {historyRecords.map((r, i) => (
              <div
                key={i}
                style={{ padding: "0.875rem 1.25rem", borderBottom: i < historyRecords.length - 1 ? `1px solid ${S.rule}` : "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
                    {new Date(r.timestamp).toLocaleDateString()}
                  </span>
                  {r.txHash && (
                    <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, opacity: 0.7 }}>{r.txHash.slice(0, 16)}…</span>
                  )}
                </div>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.ink }}>
                  <span style={{ color: S.inkLight }}>From </span>{r.from.slice(0, 20)}…
                  <span style={{ color: S.inkLight }}> → </span>{r.to.slice(0, 20)}…
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
