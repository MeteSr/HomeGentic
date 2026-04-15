import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Star } from "lucide-react";
import { Badge } from "@/components/Badge";
import { photoService, type Photo } from "@/services/photo";
import { type Property } from "@/services/property";
import { type Job } from "@/services/job";
import { COLORS, FONTS } from "@/theme";
import toast from "react-hot-toast";

// ─── SigPill ─────────────────────────────────────────────────────────────────

export function SigPill({ signed, label }: { signed: boolean; label: string }) {
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

// ─── PhotoStrip ───────────────────────────────────────────────────────────────

export function PhotoStrip({ photos, jobId, onUpload }: { photos: Photo[]; jobId: string; onUpload: (jobId: string, file: File) => void }) {
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
          <img key={p.id} src={p.url} alt={p.description} title={p.description}
            onClick={() => openLightbox(i)}
            style={{ width: 48, height: 48, objectFit: "cover", border: `1px solid ${COLORS.rule}`, cursor: "pointer" }}
          />
        ))}
        {photos.length > 5 && (
          <button onClick={() => openLightbox(5)} style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", color: COLORS.plumMid, background: "none", border: `1px solid ${COLORS.rule}`, padding: "0.2rem 0.5rem", cursor: "pointer" }}>
            +{photos.length - 5} more
          </button>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          style={{ padding: "0.2rem 0.6rem", fontFamily: FONTS.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, background: "none", border: `1px solid ${COLORS.rule}`, cursor: "pointer" }}
        >
          + Add Photo
        </button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
      </div>

      {activePh && (
        <div onClick={closeLightbox} style={{ position: "fixed", inset: 0, background: "rgba(14,14,12,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "2rem" }}>
          <button onClick={prev} disabled={lightboxIdx === 0} style={{ position: "absolute", left: "1.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: `1px solid rgba(255,255,255,0.3)`, color: COLORS.white, padding: "0.75rem", cursor: lightboxIdx === 0 ? "default" : "pointer", opacity: lightboxIdx === 0 ? 0.3 : 1, fontSize: "1.25rem", lineHeight: 1 }}>‹</button>
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "80vw", maxHeight: "80vh" }}>
            <img src={activePh.url} alt={activePh.description} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", border: "1px solid rgba(255,255,255,0.2)" }} />
            <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>{activePh.description || "No description"}</span>
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.55rem", color: "rgba(255,255,255,0.4)" }}>{(lightboxIdx ?? 0) + 1} / {photos.length}</span>
            </div>
          </div>
          <button onClick={next} disabled={lightboxIdx === photos.length - 1} style={{ position: "absolute", right: "1.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: `1px solid rgba(255,255,255,0.3)`, color: COLORS.white, padding: "0.75rem", cursor: lightboxIdx === photos.length - 1 ? "default" : "pointer", opacity: lightboxIdx === photos.length - 1 ? 0.3 : 1, fontSize: "1.25rem", lineHeight: 1 }}>›</button>
          <button onClick={closeLightbox} style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: `1px solid rgba(255,255,255,0.3)`, color: COLORS.white, padding: "0.375rem 0.75rem", fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>Close</button>
        </div>
      )}
    </>
  );
}

// ─── warrantyStatus ───────────────────────────────────────────────────────────

export function warrantyStatus(job: Job): { label: string; color: string; bg: string } | null {
  if (!job.warrantyMonths || job.warrantyMonths <= 0) return null;
  const jobDate  = new Date(job.date).getTime();
  const expiryMs = jobDate + job.warrantyMonths * 30.44 * 24 * 60 * 60 * 1000;
  const now      = Date.now();
  const daysLeft = Math.round((expiryMs - now) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0)   return { label: "Warranty expired",          color: COLORS.plumMid, bg: COLORS.white };
  if (daysLeft <= 90) return { label: `Warranty: ${daysLeft}d left`, color: COLORS.sage, bg: COLORS.blush };
  const monthsLeft = Math.round(daysLeft / 30);
  return { label: `Warranty: ${monthsLeft}mo left`, color: COLORS.sage, bg: COLORS.sageLight };
}

// ─── TimelineTab ─────────────────────────────────────────────────────────────

interface TimelineTabProps {
  property:            Property;
  jobs:                Job[];
  onVerify:            (id: string) => void;
  currentPrincipal:    string | null;
  photosByJob:         Record<string, Photo[]>;
  onPhotoUpload:       (jobId: string, file: File) => void;
  onInviteContractor:  (job: Job) => void;
}

export function TimelineTab({ property, jobs, onVerify, currentPrincipal, photosByJob, onPhotoUpload, onInviteContractor }: TimelineTabProps) {
  const TC = { ink: COLORS.plum, rule: COLORS.rule, rust: COLORS.sage, inkLight: COLORS.plumMid, sage: COLORS.sage, mono: FONTS.mono, serif: FONTS.serif };
  const navigate = useNavigate();
  const [justVerified,        setJustVerified]        = React.useState<string | null>(null);
  const [reviewNudgeJob,      setReviewNudgeJob]      = React.useState<Job | null>(null);
  const [newestFirst,         setNewestFirst]         = React.useState(true);
  const [expandedJobId,       setExpandedJobId]       = React.useState<string | null>(null);
  const [warrantyUploading,   setWarrantyUploading]   = React.useState<string | null>(null);
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

  const sortedJobs = React.useMemo(
    () => [...jobs].sort((a, b) => newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)),
    [jobs, newestFirst]
  );

  const handleVerify = (jobId: string) => {
    onVerify(jobId);
    setJustVerified(jobId);
    const job = jobs.find((j) => j.id === jobId);
    if (job && !job.isDiy) setReviewNudgeJob(job);
    setTimeout(() => setJustVerified(null), 2500);
  };

  if (jobs.length === 0) {
    return (
      <div style={{ border: `1px dashed ${TC.rule}`, padding: "3rem", textAlign: "center" }}>
        <Calendar size={36} color={TC.rule} style={{ margin: "0 auto 1rem" }} />
        <p style={{ fontFamily: TC.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No jobs recorded yet</p>
        <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: TC.inkLight }}>Log your first maintenance job to start the timeline.</p>
      </div>
    );
  }

  return (
    <>
      {verifiedCount >= 3 && (
        <div style={{ border: `1px solid ${TC.sage}`, background: COLORS.sageLight, padding: "0.875rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.25rem" }}>🏅</span>
          <div>
            <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: TC.sage, marginBottom: "0.1rem" }}>Home History Taking Shape</p>
            <p style={{ fontSize: "0.8rem", color: TC.inkLight, fontWeight: 300 }}>{verifiedCount} verified jobs on-chain. Your HomeGentic report is ready to impress buyers.</p>
          </div>
        </div>
      )}

      {reviewNudgeJob && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", border: `1px solid ${COLORS.sageMid}`, padding: "0.875rem 1.25rem", marginBottom: "1rem", background: COLORS.butter, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Star size={14} color={COLORS.plum} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plum, marginBottom: "0.15rem" }}>Job verified — leave a review</p>
              <p style={{ fontSize: "0.8rem", fontWeight: 300, color: COLORS.plumMid }}>Help other homeowners by reviewing {reviewNudgeJob.contractorName || "this contractor"}.</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {reviewNudgeJob.contractor && (
              <button onClick={() => navigate(`/contractor/${reviewNudgeJob.contractor}`)} style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${COLORS.sageMid}`, color: COLORS.plum, background: "none", cursor: "pointer" }}>Leave a Review</button>
            )}
            <button onClick={() => setReviewNudgeJob(null)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}>×</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button onClick={() => setNewestFirst((v) => !v)} style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.25rem 0.75rem", border: `1px solid ${TC.rule}`, background: "none", color: TC.inkLight, cursor: "pointer" }}>
          {newestFirst ? "Newest First ↓" : "Oldest First ↑"}
        </button>
      </div>

      <div style={{ paddingLeft: "1.5rem", position: "relative" }}>
        <div style={{ position: "absolute", left: "0.5rem", top: 0, bottom: 0, width: "1px", background: TC.rule }} />
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
              {showYearMark && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", marginTop: idx > 0 ? "1.25rem" : 0 }}>
                  <div style={{ position: "absolute", left: "0.125rem", width: "0.75rem", height: "0.75rem", background: TC.ink, display: "flex", alignItems: "center", justifyContent: "center" }} />
                  <span style={{ fontFamily: TC.serif, fontWeight: 900, fontSize: "1rem", color: TC.ink, marginLeft: "0.25rem" }}>{year}</span>
                </div>
              )}
              <div style={{ position: "relative", marginBottom: "1px" }}>
                <div style={{ position: "absolute", left: "-1.25rem", top: "1.375rem", width: "0.5rem", height: "0.5rem", background: job.verified ? TC.sage : TC.rule, border: `1px solid ${job.verified ? TC.sage : TC.inkLight}` }} />
                <div data-testid={`job-${job.serviceType.toLowerCase().replace(/\s+/g, "-")}`} style={{ background: isFlashing ? COLORS.sageLight : COLORS.white, padding: "1.25rem", border: `1px solid ${TC.rule}`, transition: "background 0.6s ease" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontWeight: 500, fontSize: "0.875rem", marginBottom: "0.125rem" }}>{job.serviceType}</p>
                      <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: TC.inkLight }}>{job.isDiy ? "DIY" : job.contractorName} · {job.date}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontFamily: TC.mono, fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>${(job.amount / 100).toLocaleString()}</p>
                      <Badge variant={job.status === "verified" ? "success" : job.status === "completed" ? "info" : "warning"} size="sm">
                        {isFlashing ? "⛓ locked on-chain" : job.status}
                      </Badge>
                    </div>
                  </div>
                  {job.description && <p style={{ fontSize: "0.8rem", color: TC.inkLight, fontWeight: 300, marginTop: "0.5rem" }}>{job.description}</p>}
                  {warranty && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.15rem 0.5rem", color: warranty.color, background: warranty.bg, border: `1px solid ${warranty.color}40` }}>
                        🛡 {warranty.label}
                      </span>
                    </div>
                  )}
                  {!job.verified && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                      <SigPill signed={job.homeownerSigned} label="Homeowner" />
                      {needsBothSig && <SigPill signed={job.contractorSigned} label={job.contractor ? "Contractor" : "Contractor (not linked)"} />}
                      {canSign && (
                        <button onClick={() => handleVerify(job.id)} style={{ padding: "0.25rem 0.75rem", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: TC.rust, background: "none", border: `1px solid ${TC.rust}`, cursor: "pointer" }}>Sign →</button>
                      )}
                      {job.homeownerSigned && !job.contractorSigned && !job.isDiy && !job.verified && (
                        <>
                          <span style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight }}>Awaiting contractor signature</span>
                          <button onClick={() => onInviteContractor(job)} style={{ padding: "0.25rem 0.75rem", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: TC.sage, background: "none", border: `1px solid ${TC.sage}`, cursor: "pointer" }}>Invite →</button>
                        </>
                      )}
                    </div>
                  )}
                  {(job.permitNumber || job.description) && (
                    <button onClick={() => setExpandedJobId((prev) => prev === job.id ? null : job.id)} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.625rem", fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {expandedJobId === job.id ? "▲ less" : "▼ details"}
                    </button>
                  )}
                  {expandedJobId === job.id && (
                    <div style={{ marginTop: "0.625rem", padding: "0.75rem", background: COLORS.white, border: `1px solid ${TC.rule}`, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {job.permitNumber && (
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, width: "6rem", flexShrink: 0 }}>Permit #</span>
                          <span style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.ink }}>{job.permitNumber}</span>
                        </div>
                      )}
                      {job.description && (
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, width: "6rem", flexShrink: 0 }}>Description</span>
                          <span style={{ fontSize: "0.8rem", color: TC.ink, fontWeight: 300, lineHeight: 1.5 }}>{job.description}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, width: "6rem", flexShrink: 0 }}>Job ID</span>
                        <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", color: TC.inkLight }}>{job.id}</span>
                      </div>
                      {job.verified && (
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                          <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, width: "6rem", flexShrink: 0 }}>ICP Record</span>
                          <a href={`https://dashboard.internetcomputer.org/account/${property.owner}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: TC.mono, fontSize: "0.6rem", color: TC.sage, textDecoration: "none", borderBottom: `1px solid ${TC.sage}` }}>Verified on ICP ↗</a>
                        </div>
                      )}
                      {!job.verified && job.homeowner === currentPrincipal && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <button onClick={() => navigate("/jobs/new", { state: { editJob: job } })} style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${TC.rule}`, background: "#fff", color: TC.inkLight, cursor: "pointer" }}>Edit record</button>
                        </div>
                      )}
                      {job.warrantyMonths && job.warrantyMonths > 0 && (
                        <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button onClick={() => warrantyInputRefs.current[job.id]?.click()} disabled={warrantyUploading === job.id} style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${COLORS.sage}`, background: COLORS.white, color: COLORS.sage, cursor: warrantyUploading === job.id ? "not-allowed" : "pointer", opacity: warrantyUploading === job.id ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                            🛡 {warrantyUploading === job.id ? "Uploading…" : "Upload warranty doc"}
                          </button>
                          <input ref={(el) => { warrantyInputRefs.current[job.id] = el; }} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWarrantyUpload(job, f); e.target.value = ""; }} />
                        </div>
                      )}
                    </div>
                  )}
                  <PhotoStrip photos={photosByJob[job.id] ?? []} jobId={job.id} onUpload={onPhotoUpload} />
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
