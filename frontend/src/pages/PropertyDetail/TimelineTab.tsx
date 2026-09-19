import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Star } from "lucide-react";
import { photoService, type Photo } from "@/services/photo";
import { type Property } from "@/services/property";
import { type Job } from "@/services/job";
import toast from "react-hot-toast";
import { Panel, Pill } from "./hud";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";

// ─── SigPill ─────────────────────────────────────────────────────────────────

export function SigPill({ signed, label }: { signed: boolean; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.25rem",
      fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "0.15rem 0.625rem", borderRadius: 100,
      border: `1px solid ${signed ? "var(--hg-blue-edge)" : "var(--hg-line-2)"}`,
      color: signed ? "var(--hg-blue-ink)" : "var(--hg-muted)",
      background: signed ? "var(--hg-blue-wash)" : "transparent",
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
            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--hg-line-2)", cursor: "pointer" }}
          />
        ))}
        {photos.length > 5 && (
          <button onClick={() => openLightbox(5)} style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: "0.6rem", color: "var(--hg-muted)", background: "none", border: "1px solid var(--hg-line-2)", borderRadius: 6, padding: "0.2rem 0.5rem", cursor: "pointer" }}>
            +{photos.length - 5} more
          </button>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          style={{ padding: "0.2rem 0.6rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", background: "none", border: "1px solid var(--hg-line-2)", borderRadius: 6, cursor: "pointer" }}
        >
          + Add Photo
        </button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
      </div>

      {activePh && (
        <div onClick={closeLightbox} style={{ position: "fixed", inset: 0, background: "rgba(11,13,26,0.94)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "2rem" }}>
          <button onClick={prev} disabled={lightboxIdx === 0} style={{ position: "absolute", left: "1.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, color: "#FCFCFD", padding: "0.75rem", cursor: lightboxIdx === 0 ? "default" : "pointer", opacity: lightboxIdx === 0 ? 0.3 : 1, fontSize: "1.25rem", lineHeight: 1 }}>‹</button>
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "80vw", maxHeight: "80vh" }}>
            <img src={activePh.url} alt={activePh.description} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8 }} />
            <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: "0.6rem", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>{activePh.description || "No description"}</span>
              <span style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: "0.55rem", color: "rgba(255,255,255,0.4)" }}>{(lightboxIdx ?? 0) + 1} / {photos.length}</span>
            </div>
          </div>
          <button onClick={next} disabled={lightboxIdx === photos.length - 1} style={{ position: "absolute", right: "1.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, color: "#FCFCFD", padding: "0.75rem", cursor: lightboxIdx === photos.length - 1 ? "default" : "pointer", opacity: lightboxIdx === photos.length - 1 ? 0.3 : 1, fontSize: "1.25rem", lineHeight: 1 }}>›</button>
          <button onClick={closeLightbox} style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, color: "#FCFCFD", padding: "0.375rem 0.75rem", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>Close</button>
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
  if (daysLeft < 0)   return { label: "Warranty expired",            color: "var(--hg-muted)",    bg: "transparent" };
  if (daysLeft <= 90) return { label: `Warranty: ${daysLeft}d left`, color: "var(--hg-yel-ink)",   bg: "var(--hg-yel-wash)" };
  const monthsLeft = Math.round(daysLeft / 30);
  return { label: `Warranty: ${monthsLeft}mo left`, color: "var(--hg-blue-ink)", bg: "var(--hg-blue-wash)" };
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
      <Panel style={{ border: "1px dashed var(--hg-line-2)", background: "transparent", padding: "3rem", textAlign: "center" }}>
        <Calendar size={36} color="var(--hg-line-2)" style={{ margin: "0 auto 1rem" }} />
        <p style={{ fontFamily: SERIF, fontWeight: 700, color: "var(--hg-ink)", marginBottom: "0.375rem" }}>No jobs recorded yet</p>
        <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>Log your first maintenance job to start the timeline.</p>
      </Panel>
    );
  }

  return (
    <>
      {verifiedCount >= 3 && (
        <Panel style={{ border: "1px solid var(--hg-blue-edge)", background: "var(--hg-blue-wash)", padding: "0.875rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.25rem" }}>🏅</span>
          <div>
            <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-blue-ink)", marginBottom: "0.1rem" }}>Home History Taking Shape</p>
            <p style={{ fontSize: "0.8rem", color: "var(--hg-muted)", fontWeight: 300 }}>{verifiedCount} verified jobs on-chain. Your HomeGentic report is ready to impress buyers.</p>
          </div>
        </Panel>
      )}

      {reviewNudgeJob && (
        <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", border: "1px solid var(--hg-yel-edge)", padding: "0.875rem 1.25rem", marginBottom: "1rem", background: "var(--hg-yel-wash)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Star size={14} color="var(--hg-yel-ink)" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-yel-ink)", marginBottom: "0.15rem" }}>Job verified — leave a review</p>
              <p style={{ fontSize: "0.8rem", fontWeight: 300, color: "var(--hg-muted)" }}>Help other homeowners by reviewing {reviewNudgeJob.contractorName || "this contractor"}.</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {reviewNudgeJob.contractor && (
              <button onClick={() => navigate(`/contractor/${reviewNudgeJob.contractor}`)} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.375rem 0.875rem", borderRadius: 6, border: "1px solid var(--hg-yel-edge)", color: "var(--hg-yel-ink)", background: "none", cursor: "pointer" }}>Leave a Review</button>
            )}
            <button onClick={() => setReviewNudgeJob(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--hg-muted)", padding: "0.25rem" }}>×</button>
          </div>
        </Panel>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button onClick={() => setNewestFirst((v) => !v)} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.25rem 0.75rem", borderRadius: 6, border: "1px solid var(--hg-line-2)", background: "none", color: "var(--hg-muted)", cursor: "pointer" }}>
          {newestFirst ? "Newest First ↓" : "Oldest First ↑"}
        </button>
      </div>

      <div style={{ paddingLeft: "1.5rem", position: "relative" }}>
        <div style={{ position: "absolute", left: "0.5rem", top: 0, bottom: 0, width: "1px", background: "var(--hg-line)" }} />
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
                  <div style={{ position: "absolute", left: "0.125rem", width: "0.75rem", height: "0.75rem", borderRadius: 3, background: "var(--hg-ink)", display: "flex", alignItems: "center", justifyContent: "center" }} />
                  <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: "1rem", color: "var(--hg-ink)", marginLeft: "0.25rem" }}>{year}</span>
                </div>
              )}
              <div style={{ position: "relative", marginBottom: "1px" }}>
                <div style={{ position: "absolute", left: "-1.25rem", top: "1.375rem", width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: job.verified ? "var(--hg-blue)" : "var(--hg-line-2)", border: `1px solid ${job.verified ? "var(--hg-blue)" : "var(--hg-muted)"}` }} />
                <div data-testid={`job-${job.serviceType.toLowerCase().replace(/\s+/g, "-")}`} style={{ background: isFlashing ? "var(--hg-blue-wash)" : "var(--hg-surface)", padding: "1.25rem", borderRadius: 12, border: "1px solid var(--hg-line)", transition: "background 0.6s ease" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--hg-ink-2)", marginBottom: "0.125rem" }}>{job.serviceType}</p>
                      <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>{job.isDiy ? "DIY" : job.contractorName} · {job.date}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontFamily: MONO, fontSize: "0.875rem", fontWeight: 500, color: "var(--hg-ink-2)", marginBottom: "0.25rem" }}>${(job.amount / 100).toLocaleString()}</p>
                      <Pill tone={job.status === "verified" ? "good" : job.status === "completed" ? "info" : "warn"}>
                        {isFlashing ? "⛓ locked on-chain" : job.status}
                      </Pill>
                    </div>
                  </div>
                  {job.description && <p style={{ fontSize: "0.8rem", color: "var(--hg-muted)", fontWeight: 300, marginTop: "0.5rem" }}>{job.description}</p>}
                  {warranty && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.15rem 0.5rem", borderRadius: 100, color: warranty.color, background: warranty.bg, border: `1px solid ${warranty.color}` }}>
                        🛡 {warranty.label}
                      </span>
                    </div>
                  )}
                  {!job.verified && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                      <SigPill signed={job.homeownerSigned} label="Homeowner" />
                      {needsBothSig && <SigPill signed={job.contractorSigned} label={job.contractor ? "Contractor" : "Contractor (not linked)"} />}
                      {canSign && (
                        <button onClick={() => handleVerify(job.id)} style={{ padding: "0.25rem 0.75rem", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-blue-ink)", background: "none", borderRadius: 6, border: "1px solid var(--hg-blue-edge)", cursor: "pointer" }}>Sign →</button>
                      )}
                      {job.homeownerSigned && !job.contractorSigned && !job.isDiy && !job.verified && (
                        <>
                          <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)" }}>Awaiting contractor signature</span>
                          <button onClick={() => onInviteContractor(job)} style={{ padding: "0.25rem 0.75rem", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-good)", background: "none", borderRadius: 6, border: "1px solid var(--hg-good-edge)", cursor: "pointer" }}>Invite →</button>
                        </>
                      )}
                    </div>
                  )}
                  {(job.permitNumber || job.description) && (
                    <button onClick={() => setExpandedJobId((prev) => prev === job.id ? null : job.id)} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.625rem", fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {expandedJobId === job.id ? "▲ less" : "▼ details"}
                    </button>
                  )}
                  {expandedJobId === job.id && (
                    <div style={{ marginTop: "0.625rem", padding: "0.75rem", background: "var(--hg-fill)", borderRadius: 8, border: "1px solid var(--hg-line)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {job.permitNumber && (
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", width: "6rem", flexShrink: 0 }}>Permit #</span>
                          <span style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-ink-2)" }}>{job.permitNumber}</span>
                        </div>
                      )}
                      {job.description && (
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", width: "6rem", flexShrink: 0 }}>Description</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--hg-ink-2)", fontWeight: 300, lineHeight: 1.5 }}>{job.description}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", width: "6rem", flexShrink: 0 }}>Job ID</span>
                        <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-muted)" }}>{job.id}</span>
                      </div>
                      {job.verified && (
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", width: "6rem", flexShrink: 0 }}>ICP Record</span>
                          <a href={`https://dashboard.internetcomputer.org/account/${property.owner}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-good)", textDecoration: "none", borderBottom: "1px solid var(--hg-good)" }}>Verified on ICP ↗</a>
                        </div>
                      )}
                      {!job.verified && job.homeowner === currentPrincipal && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <button onClick={() => navigate("/jobs/new", { state: { editJob: job } })} style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", borderRadius: 6, border: "1px solid var(--hg-line-2)", background: "transparent", color: "var(--hg-muted)", cursor: "pointer" }}>Edit record</button>
                        </div>
                      )}
                      {job.warrantyMonths && job.warrantyMonths > 0 && (
                        <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button onClick={() => warrantyInputRefs.current[job.id]?.click()} disabled={warrantyUploading === job.id} style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", borderRadius: 6, border: "1px solid var(--hg-blue-edge)", background: "transparent", color: "var(--hg-blue-ink)", cursor: warrantyUploading === job.id ? "not-allowed" : "pointer", opacity: warrantyUploading === job.id ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
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
