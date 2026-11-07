/**
 * Improvements record (#713): every job on a home, marked as an improvement
 * or a repair, with the running total of improvements and an export for the
 * owner's tax preparer (CSV, or print / save as PDF).
 *
 * Copy rule: this is a record to share with a tax professional. It never
 * says what is deductible, what basis is, or which credits apply.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { Panel, Pill, hudInputStyle } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { jobService, type CostCategory, type Job } from "@/services/job";
import { propertyService, type AccessRole, type Property } from "@/services/property";
import { photoService, type Photo } from "@/services/photo";
import { canEditDocuments, parseDoc } from "@/services/documentVault";
import { errorMessage } from "@/services/candid";
import { useAuthStore } from "@/store/authStore";
import {
  CATEGORY_LABELS,
  buildImprovementRecord,
  doneBy,
  improvementRecordCsv,
  recordStatus,
} from "@/services/improvementRecord";

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
  verticalAlign: "middle",
};

const RECEIPT_TYPES = new Set(["Receipt", "Invoice"]);

/** Printing (or saving as PDF) shows the record alone, without the app's header and rail. */
const PRINT_CSS = `@media print {
  .hf-shell-header, .hf-sidebar, .hf-mobile-header, .hf-bottom-nav, .hf-mobile-fab { display: none !important; }
  .hf-main { margin-left: 0 !important; padding-top: 0 !important; }
  .hg-print-only { display: block !important; }
}`;

export default function ImprovementsRecordPage() {
  const { id = "" } = useParams<{ id: string }>();
  const principal = useAuthStore((s) => s.principal);

  const [property, setProperty] = useState<Property | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [marks, setMarks] = useState<Record<string, CostCategory>>({});
  const [receipts, setReceipts] = useState<Photo[]>([]);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [since, setSince] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([
      jobService.getByProperty(id).catch(() => [] as Job[]),
      jobService.getCostCategories([id]).catch(() => ({}) as Record<string, CostCategory>),
      propertyService.getProperty(id).catch(() => null),
    ]).then(([j, m, p]) => {
      if (!live) return;
      setJobs(j);
      setMarks(m);
      setProperty(p);
      setLoaded(true);
    });
    Promise.all([
      photoService.getByJob(`docs_${id}`).catch(() => [] as Photo[]),
      photoService.getByJob(`receipts_${id}`).catch(() => [] as Photo[]),
    ]).then(([docs, legacy]) => {
      if (live) setReceipts([...docs, ...legacy].filter((d) => RECEIPT_TYPES.has(parseDoc(d.description).type)));
    });
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
  const record = useMemo(() => buildImprovementRecord(jobs, marks, since || undefined), [jobs, marks, since]);

  const changeCategory = async (jobId: string, category: CostCategory) => {
    const before = marks;
    setMarks({ ...marks, [jobId]: category });
    try {
      await jobService.setCostCategory(jobId, category);
    } catch (err) {
      setMarks(before);
      toast.error(errorMessage(err, "Couldn't save that change. Please try again."));
    }
  };

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([improvementRecordCsv(record.rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `homegentic-improvements-${(property?.address ?? id).replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const address = property ? `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` : "";
  const empty = loaded && record.rows.length === 0;

  return (
    <Layout>
      <style>{PRINT_CSS}</style>
      <div
        className="hg-v3"
        data-theme="light"
        style={{ background: "var(--hg-bg)", minHeight: SHELL_PAGE_MIN_HEIGHT, padding: "28px 32px" }}
      >
        <div style={{ maxWidth: "64rem", margin: "0 auto" }}>
          <Link
            to={`/properties/${id}`}
            className="no-print"
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
            Improvements record
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
              maxWidth: "44rem",
              lineHeight: 1.55,
              margin: "0 0 1.25rem",
            }}
          >
            Mark each job as an improvement or a repair. Improvements can matter when you sell, so keep this list and
            your receipts together and share them with your tax preparer. This is a record of your work, not tax advice:
            your tax preparer decides how each item is treated. Where you haven't chosen, we suggest a mark from the
            type of work and its cost.
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
            <Panel style={{ padding: "1rem 1.25rem", flex: "1 1 14rem" }}>
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
                Improvements on record
              </p>
              <p
                data-testid="improvement-total"
                style={{
                  fontFamily: SERIF,
                  fontWeight: 800,
                  fontSize: "1.5rem",
                  color: "var(--hg-ink)",
                  margin: "0.25rem 0 0",
                }}
              >
                {usd(record.improvementTotalCents)}{" "}
                <span style={{ fontFamily: BODY, fontWeight: 400, fontSize: "0.85rem", color: "var(--hg-muted)" }}>
                  across {record.improvementCount} {record.improvementCount === 1 ? "job" : "jobs"}
                </span>
              </p>
            </Panel>
            <Panel style={{ padding: "1rem 1.25rem", flex: "1 1 14rem" }}>
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
                Repairs and upkeep
              </p>
              <p
                style={{
                  fontFamily: SERIF,
                  fontWeight: 800,
                  fontSize: "1.5rem",
                  color: "var(--hg-ink)",
                  margin: "0.25rem 0 0",
                }}
              >
                {usd(record.repairTotalCents)}
              </p>
            </Panel>
          </div>

          <div
            className="no-print"
            style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontFamily: MONO,
                fontSize: "0.6rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--hg-muted)",
              }}
            >
              Include work from
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                style={{ ...hudInputStyle, width: "11rem" }}
              />
            </label>
            <span style={{ flex: 1 }} />
            <button onClick={downloadCsv} disabled={empty || !loaded} style={actionStyle(empty || !loaded)}>
              <Download size={12} aria-hidden /> Download CSV
            </button>
            <button onClick={() => window.print()} disabled={empty || !loaded} style={actionStyle(empty || !loaded)}>
              <Printer size={12} aria-hidden /> Print or save as PDF
            </button>
          </div>
          {since && (
            <p style={{ fontFamily: BODY, fontSize: "0.8rem", color: "var(--hg-muted)", margin: "0 0 0.75rem" }}>
              Showing work from {since} onward.
            </p>
          )}

          {!loaded ? (
            <p style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--hg-muted)" }}>Loading…</p>
          ) : empty ? (
            <Panel
              style={{
                border: "1px dashed var(--hg-line-2)",
                background: "transparent",
                padding: "2.5rem",
                textAlign: "center",
              }}
            >
              <p style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-muted)", margin: 0 }}>
                No jobs on record yet{since ? " for these dates" : ""}. Log work on this home and it will show up here.
              </p>
            </Panel>
          ) : (
            <Panel style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--hg-line)" }}>
                    {["Date", "Work", "Done by", "Amount", "Record", "Category"].map((h) => (
                      <th key={h} scope="col" style={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {record.rows.map(({ job, category, source }, i) => (
                    <tr
                      key={job.id}
                      style={{ borderBottom: i < record.rows.length - 1 ? "1px solid var(--hg-line)" : "none" }}
                    >
                      <td
                        style={{
                          ...TD,
                          fontFamily: MONO,
                          fontSize: "0.7rem",
                          color: "var(--hg-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {job.date}
                      </td>
                      <td style={TD}>
                        <span style={{ fontWeight: 500 }}>{job.description}</span>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--hg-muted)" }}>
                          {job.serviceType}
                          {job.permitNumber ? ` · Permit ${job.permitNumber}` : ""}
                        </span>
                      </td>
                      <td style={{ ...TD, color: "var(--hg-muted)" }}>{doneBy(job)}</td>
                      <td style={{ ...TD, fontFamily: MONO, whiteSpace: "nowrap" }}>{usd(job.amount)}</td>
                      <td style={TD}>
                        <Pill tone={job.verified ? "good" : "warn"}>{job.verified ? "Verified" : "Not signed"}</Pill>
                        <span className="sr-only">{recordStatus(job)}</span>
                      </td>
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>
                        <select
                          aria-label={`Category for ${job.description}`}
                          value={category}
                          disabled={!canEdit}
                          onChange={(e) => changeCategory(job.id, e.target.value as CostCategory)}
                          style={{ ...hudInputStyle, width: "auto", padding: "0.35rem 0.5rem" }}
                        >
                          {(Object.keys(CATEGORY_LABELS) as CostCategory[]).map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        {source === "suggested" && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontFamily: MONO,
                              fontSize: "0.6rem",
                              letterSpacing: "0.06em",
                              color: "var(--hg-muted)",
                            }}
                          >
                            Suggested
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel style={{ padding: "1rem 1.25rem", marginTop: "1.25rem" }}>
            <h2
              style={{
                fontFamily: SERIF,
                fontWeight: 700,
                fontSize: "1rem",
                color: "var(--hg-ink)",
                margin: "0 0 0.5rem",
              }}
            >
              Receipts and invoices
            </h2>
            {receipts.length === 0 ? (
              <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: "var(--hg-muted)", margin: 0 }}>
                None saved yet. Add them in the property's Documents tab so they're ready to share with this record.
              </p>
            ) : (
              <>
                <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: "var(--hg-muted)", margin: "0 0 0.5rem" }}>
                  Saved in this home's documents. Share them with your tax preparer along with this list.
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "1.1rem",
                    fontFamily: BODY,
                    fontSize: "0.85rem",
                    color: "var(--hg-ink-2)",
                  }}
                >
                  {receipts.map((d) => (
                    <li key={d.id}>{parseDoc(d.description).filename}</li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <p
            className="hg-print-only"
            style={{
              display: "none",
              fontFamily: BODY,
              fontSize: "0.75rem",
              color: "var(--hg-muted)",
              marginTop: "1rem",
            }}
          >
            Printed from HomeGentic on{" "}
            {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
            {since ? ` Work from ${since} onward.` : ""} "Suggested" marks were not chosen by the owner. A record of
            work to share with a tax professional, not tax advice.
          </p>
        </div>
      </div>
    </Layout>
  );
}

function actionStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: MONO,
    fontSize: "0.65rem",
    padding: "0.5rem 0.95rem",
    border: "1px solid var(--hg-line-2)",
    background: "var(--hg-surface)",
    color: "var(--hg-ink)",
    borderRadius: 100,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
