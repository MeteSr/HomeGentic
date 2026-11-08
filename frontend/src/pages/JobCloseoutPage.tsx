/**
 * Permits and lien waivers (#716): for each job on a home, where its permit
 * stands and the close-out papers on file (a final lien waiver from the
 * contractor, a Florida Notice of Commencement). Papers are documents in the
 * home's vault, filed on the job.
 *
 * Copy rule: this is the household's own record. It never says a home is
 * lien-free or a permit is closed unless the record shows it, and it says a
 * title search is what shows recorded liens. Not legal advice.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { Panel, Pill, hudInputStyle } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { jobService, type Job } from "@/services/job";
import { propertyService, type AccessRole, type Property } from "@/services/property";
import { photoService, type Photo } from "@/services/photo";
import { canEditDocuments, encodeJobPaper, parseDoc } from "@/services/documentVault";
import { errorMessage } from "@/services/candid";
import { useAuthStore } from "@/store/authStore";
import {
  PERMIT_STATUS_LABELS,
  closeoutReview,
  needsLienWaiver,
  nocExpected,
  type JobCloseout,
  type JobPaper,
  type PaperKind,
  type PermitStatus,
} from "@/services/jobCloseout";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "0.75rem 1rem",
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--hg-muted)",
  fontWeight: 500,
};
const TD: React.CSSProperties = {
  padding: "0.75rem 1rem",
  fontSize: "0.85rem",
  color: "var(--hg-ink-2)",
  verticalAlign: "top",
};

const PAPER_LABELS: Record<PaperKind, string> = {
  lienWaiver: "Final lien waiver",
  noticeOfCommencement: "Notice of Commencement",
};
const ADD_LABELS: Record<PaperKind, string> = {
  lienWaiver: "Add final lien waiver",
  noticeOfCommencement: "Add Notice of Commencement",
};
const PAPER_DOC_TYPE: Record<PaperKind, "LienWaiver" | "NOC"> = {
  lienWaiver: "LienWaiver",
  noticeOfCommencement: "NOC",
};

const isProposal = (j: Job) => j.status === "pending_homeowner_approval" || j.status === "rejected_by_homeowner";

export default function JobCloseoutPage() {
  const { id = "" } = useParams<{ id: string }>();
  const principal = useAuthStore((s) => s.principal);

  const [property, setProperty] = useState<Property | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [closeouts, setCloseouts] = useState<JobCloseout[]>([]);
  const [docs, setDocs] = useState<Photo[]>([]);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      jobService.getByProperty(id).catch(() => [] as Job[]),
      jobService.getCloseouts([id]).catch(() => [] as JobCloseout[]),
      propertyService.getProperty(id).catch(() => null),
    ]).then(([j, c, p]) => {
      if (!live) return;
      setJobs(j);
      setCloseouts(c);
      setProperty(p);
      setLoaded(true);
    });
    photoService
      .getByJob(`docs_${id}`)
      .then((d) => live && setDocs(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!principal) return;
    propertyService
      .getAccessRole(id, principal)
      .then(setRole)
      .catch(() => setRole(null));
  }, [id, principal]);

  const canEdit = canEditDocuments(role);
  const rows = useMemo(() => jobs.filter((j) => !isProposal(j)), [jobs]);
  const review = useMemo(() => closeoutReview(jobs, closeouts), [jobs, closeouts]);
  const byId = useMemo(() => new Map(closeouts.map((c) => [c.jobId, c])), [closeouts]);
  const fileName = (photoId: string) => {
    const doc = docs.find((d) => d.id === photoId);
    return doc ? parseDoc(doc.description).filename : "Document in your vault";
  };

  const update = (jobId: string, change: (c: JobCloseout) => JobCloseout) =>
    setCloseouts((list) => {
      const current = list.find((c) => c.jobId === jobId) ?? { jobId, papers: [] };
      return [...list.filter((c) => c.jobId !== jobId), change(current)];
    });

  const changeStatus = async (jobId: string, value: string) => {
    const before = closeouts;
    const status = (value || null) as PermitStatus | null;
    update(jobId, (c) => ({ ...c, permitStatus: status ?? undefined }));
    try {
      await jobService.setPermitStatus(jobId, status);
    } catch (err) {
      setCloseouts(before);
      toast.error(errorMessage(err, "Couldn't save that change. Please try again."));
    }
  };

  const addPaper = async (job: Job, kind: PaperKind, file: File | undefined) => {
    if (!file) return;
    setBusy(`${job.id}:${kind}`);
    try {
      const doc = await photoService.upload(
        file,
        `docs_${id}`,
        id,
        "PostConstruction",
        encodeJobPaper(PAPER_DOC_TYPE[kind], job.id, file.name.replace(/\|/g, "-")),
      );
      await jobService.addPaper(job.id, kind, doc.id);
      setDocs((d) => [...d, doc]);
      const paper: JobPaper = { kind, photoId: doc.id, addedBy: principal ?? "", addedAt: Date.now() };
      update(job.id, (c) => ({ ...c, papers: [...c.papers.filter((p) => p.photoId !== doc.id), paper] }));
    } catch (err) {
      toast.error(errorMessage(err, "The document didn't upload. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const removePaper = async (jobId: string, photoId: string) => {
    try {
      await jobService.removePaper(jobId, photoId);
      update(jobId, (c) => ({ ...c, papers: c.papers.filter((p) => p.photoId !== photoId) }));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't take that document off the job. Please try again."));
    }
  };

  const address = property ? `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` : "";

  return (
    <Layout>
      <div
        className="hg-v3"
        data-theme="light"
        style={{ background: "var(--hg-bg)", minHeight: SHELL_PAGE_MIN_HEIGHT, padding: "28px 32px" }}
      >
        <div style={{ maxWidth: "68rem", margin: "0 auto" }}>
          <Link
            to={`/properties/${id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: MONO,
              fontSize: "0.65rem",
              letterSpacing: "0.06em",
              color: "var(--hg-muted)",
              textDecoration: "none",
              marginBottom: "1rem",
            }}
          >
            <ArrowLeft size={12} aria-hidden /> Back to property
          </Link>

          <h1
            style={{
              fontFamily: SERIF,
              fontWeight: 800,
              fontSize: "1.75rem",
              color: "var(--hg-ink)",
              margin: "0 0 0.25rem",
            }}
          >
            Permits and lien waivers
          </h1>
          {address && (
            <p style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-muted)", margin: "0 0 1rem" }}>
              {address}
            </p>
          )}

          <p
            style={{
              fontFamily: BODY,
              fontSize: "0.875rem",
              color: "var(--hg-ink-2)",
              maxWidth: "46rem",
              lineHeight: 1.55,
              margin: "0 0 0.75rem",
            }}
          >
            Open permits and unpaid contractors are common surprises when a home sells. Many jobs don't need a permit;
            for the ones that had one, record where it stands, and keep a final lien waiver from the contractor on
            larger jobs. In Florida, a Notice of Commencement is generally required before work on a contract over
            $2,500 starts ($15,000 for heating or air-conditioning repair or replacement); your permit office can
            confirm.
          </p>
          <p
            style={{
              fontFamily: BODY,
              fontSize: "0.8rem",
              color: "var(--hg-muted)",
              maxWidth: "46rem",
              lineHeight: 1.55,
              margin: "0 0 1.25rem",
            }}
          >
            This is your own record. HomeGentic doesn't check permits with your permit office or liens with the county:
            a title search is what shows whether a lien was recorded. Not legal advice.
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
            <Stat label="Open permits" testId="open-permits" value={review.openPermits.length} />
            <Stat label="Expired permits" testId="expired-permits" value={review.expiredPermits.length} />
            <Stat
              label="Larger jobs with no waiver on file"
              testId="missing-waivers"
              value={review.missingWaiver.length}
            />
          </div>

          {!loaded ? (
            <p style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--hg-muted)" }}>Loading…</p>
          ) : rows.length === 0 ? (
            <Panel
              style={{
                border: "1px dashed var(--hg-line-2)",
                background: "transparent",
                padding: "2.5rem",
                textAlign: "center",
              }}
            >
              <p style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-muted)", margin: 0 }}>
                No jobs on record yet. Log work on this home and it will show up here.
              </p>
            </Panel>
          ) : (
            <Panel style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--hg-line)" }}>
                    {["Work", "Done by", "Amount", "Permit", "Papers on file"].map((h) => (
                      <th key={h} scope="col" style={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job, i) => {
                    const c = byId.get(job.id);
                    const papers = c?.papers ?? [];
                    const hasWaiver = papers.some((p) => p.kind === "lienWaiver");
                    const hasNoc = papers.some((p) => p.kind === "noticeOfCommencement");
                    const kinds: PaperKind[] = job.isDiy
                      ? ["noticeOfCommencement"]
                      : ["lienWaiver", "noticeOfCommencement"];
                    return (
                      <tr
                        key={job.id}
                        style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--hg-line)" : "none" }}
                      >
                        <td style={TD}>
                          <span style={{ fontWeight: 500 }}>{job.description}</span>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--hg-muted)" }}>
                            {job.serviceType} · {job.date}
                          </span>
                        </td>
                        <td style={{ ...TD, color: "var(--hg-muted)" }}>{job.isDiy ? "DIY" : job.contractorName}</td>
                        <td style={{ ...TD, fontFamily: MONO, whiteSpace: "nowrap" }}>{usd(job.amount)}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>
                          {job.permitNumber && (
                            <span
                              style={{
                                display: "block",
                                fontFamily: MONO,
                                fontSize: "0.7rem",
                                color: "var(--hg-muted)",
                                marginBottom: 4,
                              }}
                            >
                              {job.permitNumber}
                            </span>
                          )}
                          <select
                            aria-label={`Permit status for ${job.description}`}
                            value={c?.permitStatus ?? ""}
                            disabled={!canEdit}
                            onChange={(e) => void changeStatus(job.id, e.target.value)}
                            style={{ ...hudInputStyle, width: "auto", padding: "0.35rem 0.5rem" }}
                          >
                            <option value="">{job.permitNumber ? "Status not recorded" : "No permit"}</option>
                            {(Object.keys(PERMIT_STATUS_LABELS) as PermitStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {PERMIT_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={TD}>
                          {papers.map((p) => (
                            <span
                              key={p.photoId}
                              style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
                            >
                              <Pill tone="good">{PAPER_LABELS[p.kind]}</Pill>
                              <span>{fileName(p.photoId)}</span>
                              {canEdit && (
                                <button
                                  aria-label={`Remove ${fileName(p.photoId)} from this job`}
                                  onClick={() => void removePaper(job.id, p.photoId)}
                                  style={{
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    color: "var(--hg-muted)",
                                    padding: 2,
                                  }}
                                >
                                  <X size={12} aria-hidden />
                                </button>
                              )}
                            </span>
                          ))}
                          {needsLienWaiver(job) && !hasWaiver && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.75rem",
                                color: "var(--hg-warn, #A15C00)",
                                marginBottom: 4,
                              }}
                            >
                              No final lien waiver on file
                            </span>
                          )}
                          {nocExpected(job, property?.state) && !hasNoc && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.75rem",
                                color: "var(--hg-muted)",
                                marginBottom: 4,
                              }}
                            >
                              Notice of Commencement generally expected in Florida for this amount
                            </span>
                          )}
                          {canEdit && (
                            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                              {kinds.map((kind) => (
                                <label key={kind} style={uploadStyle(busy === `${job.id}:${kind}`)}>
                                  <Paperclip size={11} aria-hidden />
                                  {busy === `${job.id}:${kind}` ? "Uploading…" : ADD_LABELS[kind]}
                                  <input
                                    type="file"
                                    accept="application/pdf,image/*"
                                    aria-label={`Add ${PAPER_LABELS[kind]} for ${job.description}`}
                                    disabled={busy !== null}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      e.target.value = "";
                                      void addPaper(job, kind, f);
                                    }}
                                    style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                                  />
                                </label>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <Panel style={{ padding: "1rem 1.25rem", flex: "1 1 12rem" }}>
      <p
        style={{
          fontFamily: MONO,
          fontSize: "0.6rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--hg-muted)",
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        data-testid={testId}
        style={{
          fontFamily: SERIF,
          fontWeight: 800,
          fontSize: "1.5rem",
          color: "var(--hg-ink)",
          margin: "0.25rem 0 0",
        }}
      >
        {value}
      </p>
    </Panel>
  );
}

function uploadStyle(busy: boolean): React.CSSProperties {
  return {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: MONO,
    fontSize: "0.62rem",
    padding: "0.35rem 0.7rem",
    border: "1px solid var(--hg-line-2)",
    borderRadius: 100,
    cursor: busy ? "wait" : "pointer",
    color: "var(--hg-ink)",
    background: "var(--hg-surface)",
  };
}
