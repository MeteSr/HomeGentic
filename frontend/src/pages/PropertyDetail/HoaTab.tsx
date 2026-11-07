import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, Pill, SectionHeader, hudButtonStyle, hudInputStyle, type PillTone } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { photoService } from "@/services/photo";
import { errorMessage } from "@/services/candid";
import { propertyService, type AccessRole } from "@/services/property";
import { canEditDocuments, parseDoc } from "@/services/documentVault";
import { useAuthStore } from "@/store/authStore";
import { formatDollars, formatIsoDate } from "@/utils/format";
import {
  hoaService,
  validateReview,
  validateAssessment,
  validateCondo,
  assessmentTotals,
  dueStatus,
  EMPTY_REVIEW,
  EMPTY_CONDO,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewRequest,
  type ReviewStatus,
  type Assessment,
  type CondoRecord,
} from "@/services/hoaRecords";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const muted: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };
const ink: React.CSSProperties = { fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" };
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "1rem",
};
const list: React.CSSProperties = {
  listStyle: "none",
  margin: "0.75rem 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};
const row: React.CSSProperties = {
  borderTop: "1px solid var(--hg-line)",
  paddingTop: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
};

export interface JobRef {
  id: string;
  label: string;
}
export interface DocRef {
  id: string;
  label: string;
}

const STATUS_TONE: Record<ReviewStatus, PillTone> = {
  Planned: "neutral",
  Submitted: "info",
  Approved: "good",
  ApprovedWithConditions: "good",
  Denied: "bad",
  Withdrawn: "neutral",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "2,250.50" → 2250.5; "" → NaN (validation reports it). */
function parseAmount(t: string): number {
  const s = t.replace(/[$,\s]/g, "");
  return s === "" ? NaN : Number(s);
}

export function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-bad)", margin: 0 }}>
      {text}
    </p>
  );
}

export function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={field}>
      <span style={labelText}>{label}</span>
      <input
        aria-label={label}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={hudInputStyle}
      />
    </label>
  );
}

export function DocSelect({
  label,
  docs,
  value,
  onChange,
}: {
  label: string;
  docs: DocRef[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label style={field}>
      <span style={labelText}>{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={hudInputStyle}
      >
        <option value="">{docs.length ? "None" : "None (add it in Documents first)"}</option>
        {docs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <>
      <span style={ink}>Delete this? It can't be undone.</span>
      <Button onClick={onConfirm} style={hudButtonStyle("danger")}>
        Yes, delete
      </Button>
      <Button onClick={() => setAsking(false)} style={hudButtonStyle("ghost")}>
        Cancel
      </Button>
    </>
  ) : (
    <Button onClick={() => setAsking(true)} style={hudButtonStyle("ghost")}>
      Delete
    </Button>
  );
}

/**
 * #726: condo and HOA paperwork: architectural review requests, special
 * assessments and, for condos, the association's milestone inspection and
 * reserve study dates. Owners, co-owners and managers edit; viewers read.
 */
export function HoaTab({
  propertyId,
  propertyType,
  jobs = [],
}: {
  propertyId: string;
  propertyType: string;
  jobs?: JobRef[];
}) {
  const principal = useAuthStore((s) => s.principal);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [condo, setCondo] = useState<CondoRecord | null>(null);
  const [docs, setDocs] = useState<DocRef[]>([]);
  const canEdit = canEditDocuments(role);
  const isCondo = propertyType === "Condo";

  useEffect(() => {
    if (!principal) return;
    propertyService
      .getAccessRole(propertyId, principal)
      .then(setRole)
      .catch(() => setRole(null));
  }, [propertyId, principal]);

  useEffect(() => {
    Promise.all([
      photoService.getByJob(`docs_${propertyId}`).catch(() => []),
      photoService.getByJob(`receipts_${propertyId}`).catch(() => []),
    ]).then(([a, b]) => setDocs([...a, ...b].map((p) => ({ id: p.id, label: parseDoc(p.description).filename }))));
  }, [propertyId]);

  const load = useCallback(() => {
    setState("loading");
    Promise.all([
      hoaService.listReviews(propertyId),
      hoaService.listAssessments(propertyId),
      isCondo ? hoaService.getCondo(propertyId) : null,
    ])
      .then(([r, a, c]) => {
        setReviews(r);
        setAssessments(a);
        setCondo(c);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId, isCondo]);
  useEffect(load, [load]);

  if (state === "loading") return <p style={{ fontFamily: BODY, color: "var(--hg-muted)" }}>Loading HOA records…</p>;
  if (state === "error") return <LoadError what="the HOA records" onRetry={load} />;

  const docLabel = (id: string | null) =>
    id ? (docs.find((d) => d.id === id)?.label ?? "A document in Documents") : null;
  const jobLabel = (id: string | null) => (id ? (jobs.find((j) => j.id === id)?.label ?? "A job on this home") : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <p style={muted}>
        Your own record of what you've asked the HOA or condo association and what it decided. HomeGentic doesn't
        contact the association or check anything with it. Keep the letters and reports themselves in Documents.
      </p>
      <Reviews
        propertyId={propertyId}
        canEdit={canEdit}
        items={reviews}
        setItems={setReviews}
        docs={docs}
        jobs={jobs}
        docLabel={docLabel}
        jobLabel={jobLabel}
      />
      <Assessments
        propertyId={propertyId}
        canEdit={canEdit}
        items={assessments}
        setItems={setAssessments}
        docs={docs}
        docLabel={docLabel}
      />
      {isCondo && (
        <Condo
          propertyId={propertyId}
          canEdit={canEdit}
          record={condo}
          setRecord={setCondo}
          docs={docs}
          docLabel={docLabel}
        />
      )}
    </div>
  );
}

// ─── Architectural review requests ──────────────────────────────────────────

function Reviews({
  propertyId,
  canEdit,
  items,
  setItems,
  docs,
  jobs,
  docLabel,
  jobLabel,
}: {
  propertyId: string;
  canEdit: boolean;
  items: ReviewRequest[];
  setItems: (f: (x: ReviewRequest[]) => ReviewRequest[]) => void;
  docs: DocRef[];
  jobs: JobRef[];
  docLabel: (id: string | null) => string | null;
  jobLabel: (id: string | null) => string | null;
}) {
  const [form, setForm] = useState<ReviewRequest | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const { id, createdAt: _c, ...rest } = form;
    const next: ReviewRequest = {
      ...rest,
      project: rest.project.trim(),
      details: rest.details.trim(),
      conditions: rest.conditions.trim(),
    };
    const why = validateReview(next);
    setProblem(why);
    if (why) return;
    setSaving(true);
    try {
      if (id) {
        const saved = await hoaService.updateReview(id, next);
        setItems((xs) => xs.map((x) => (x.id === id ? saved : x)));
      } else {
        const saved = await hoaService.addReview(propertyId, next);
        setItems((xs) => [saved, ...xs]);
      }
      setForm(null);
      toast.success("Request saved");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the request"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await hoaService.deleteReview(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the request"));
    }
  };

  const f = form;
  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Architectural review requests"
        sub="Changes you've asked the association to approve, and its decisions."
      />
      {items.length === 0 && !f && <p style={muted}>No requests recorded.</p>}
      {items.length > 0 && (
        <ul style={list}>
          {items.map((r) => (
            <li key={r.id} style={row}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...ink, fontWeight: 600 }}>{r.project}</span>
                <Pill tone={STATUS_TONE[r.status]}>{REVIEW_STATUS_LABELS[r.status]}</Pill>
              </div>
              <span style={muted}>
                {[
                  r.submittedDate && `Submitted ${formatIsoDate(r.submittedDate)}`,
                  r.decisionDate && `Decided ${formatIsoDate(r.decisionDate)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {r.details && <span style={ink}>{r.details}</span>}
              {r.conditions && <span style={ink}>Conditions: {r.conditions}</span>}
              {r.approvalDocId && <span style={muted}>Approval letter: {docLabel(r.approvalDocId)}</span>}
              {r.jobId && <span style={muted}>Job: {jobLabel(r.jobId)}</span>}
              {canEdit && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <Button
                    onClick={() => {
                      setForm(r);
                      setProblem(null);
                    }}
                    style={hudButtonStyle("outline")}
                  >
                    Edit
                  </Button>
                  <ConfirmDelete onConfirm={() => void remove(r.id!)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !f && (
        <div style={{ marginTop: "1rem" }}>
          <Button
            onClick={() => {
              setForm(EMPTY_REVIEW);
              setProblem(null);
            }}
            style={hudButtonStyle("primary")}
          >
            Add a request
          </Button>
        </div>
      )}

      {f && (
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
        >
          <label style={field}>
            <span style={labelText}>What's the request for?</span>
            <input
              aria-label="What's the request for?"
              value={f.project}
              maxLength={120}
              onChange={(e) => setForm({ ...f, project: e.target.value })}
              style={hudInputStyle}
            />
          </label>
          <label style={field}>
            <span style={labelText}>Details</span>
            <textarea
              aria-label="Details"
              rows={2}
              value={f.details}
              maxLength={2000}
              onChange={(e) => setForm({ ...f, details: e.target.value })}
              style={{ ...hudInputStyle, resize: "vertical" }}
            />
          </label>
          <div style={grid}>
            <label style={field}>
              <span style={labelText}>Status</span>
              <select
                aria-label="Status"
                value={f.status}
                onChange={(e) => setForm({ ...f, status: e.target.value as ReviewStatus })}
                style={hudInputStyle}
              >
                {REVIEW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {REVIEW_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <DateInput
              label="Submitted"
              value={f.submittedDate}
              onChange={(v) => setForm({ ...f, submittedDate: v })}
            />
            <DateInput
              label="Decision date"
              value={f.decisionDate}
              onChange={(v) => setForm({ ...f, decisionDate: v })}
            />
          </div>
          <label style={field}>
            <span style={labelText}>Conditions</span>
            <input
              aria-label="Conditions"
              value={f.conditions}
              maxLength={1000}
              onChange={(e) => setForm({ ...f, conditions: e.target.value })}
              style={hudInputStyle}
            />
          </label>
          <div style={grid}>
            <DocSelect
              label="Approval letter"
              docs={docs}
              value={f.approvalDocId}
              onChange={(v) => setForm({ ...f, approvalDocId: v })}
            />
            <label style={field}>
              <span style={labelText}>Job for the work</span>
              <select
                aria-label="Job for the work"
                value={f.jobId ?? ""}
                onChange={(e) => setForm({ ...f, jobId: e.target.value || null })}
                style={hudInputStyle}
              >
                <option value="">None</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save request"}
            </Button>
            <Button type="button" onClick={() => setForm(null)} style={hudButtonStyle("ghost")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

// ─── Special assessments ────────────────────────────────────────────────────

interface AssessmentForm {
  id?: string;
  title: string;
  amount: string;
  dueDate: string;
  paidDate: string;
  notes: string;
  documentId: string | null;
}
const EMPTY_ASSESSMENT_FORM: AssessmentForm = {
  title: "",
  amount: "",
  dueDate: "",
  paidDate: "",
  notes: "",
  documentId: null,
};

function Assessments({
  propertyId,
  canEdit,
  items,
  setItems,
  docs,
  docLabel,
}: {
  propertyId: string;
  canEdit: boolean;
  items: Assessment[];
  setItems: (f: (x: Assessment[]) => Assessment[]) => void;
  docs: DocRef[];
  docLabel: (id: string | null) => string | null;
}) {
  const [form, setForm] = useState<AssessmentForm | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const totals = assessmentTotals(items);

  const persist = async (id: string | undefined, next: Assessment): Promise<boolean> => {
    try {
      if (id) {
        const saved = await hoaService.updateAssessment(id, next);
        setItems((xs) => xs.map((x) => (x.id === id ? saved : x)));
      } else {
        const saved = await hoaService.addAssessment(propertyId, next);
        setItems((xs) => [saved, ...xs]);
      }
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the assessment"));
      return false;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const next: Assessment = {
      title: form.title.trim(),
      amount: parseAmount(form.amount),
      dueDate: form.dueDate,
      paidDate: form.paidDate,
      notes: form.notes.trim(),
      documentId: form.documentId,
    };
    const why = validateAssessment(next);
    setProblem(why);
    if (why) return;
    setSaving(true);
    if (await persist(form.id, next)) {
      setForm(null);
      toast.success("Assessment saved");
    }
    setSaving(false);
  };

  const markPaid = (a: Assessment) => {
    const { id, ...rest } = a;
    void persist(id, { ...rest, paidDate: todayIso() });
  };

  const remove = async (id: string) => {
    try {
      await hoaService.deleteAssessment(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the assessment"));
    }
  };

  const now = Date.now();
  const f = form;
  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Special assessments"
        sub="One-off charges the association levied, with when they're due and when you paid."
      />
      {items.length === 0 && !f && <p style={muted}>No special assessments recorded.</p>}
      {items.length > 0 && (
        <>
          <p style={ink}>
            Still owed: {formatDollars(totals.unpaid)} · Paid: {formatDollars(totals.paid)}
          </p>
          <ul style={list}>
            {items.map((a) => {
              const due = dueStatus(a.dueDate, now);
              return (
                <li key={a.id} style={row}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...ink, fontWeight: 600 }}>{a.title}</span>
                    <span style={ink}>{formatDollars(a.amount)}</span>
                    {a.paidDate ? (
                      <Pill tone="good">Paid {formatIsoDate(a.paidDate)}</Pill>
                    ) : due === "overdue" ? (
                      <Pill tone="bad">Past due</Pill>
                    ) : (
                      <Pill tone="warn">Unpaid</Pill>
                    )}
                  </div>
                  <span style={muted}>Due {formatIsoDate(a.dueDate)}</span>
                  {a.notes && <span style={ink}>{a.notes}</span>}
                  {a.documentId && <span style={muted}>Notice: {docLabel(a.documentId)}</span>}
                  {canEdit && (
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                      {!a.paidDate && (
                        <Button onClick={() => markPaid(a)} style={hudButtonStyle("outline")}>
                          Mark paid
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          setForm({
                            id: a.id,
                            title: a.title,
                            amount: String(a.amount),
                            dueDate: a.dueDate,
                            paidDate: a.paidDate,
                            notes: a.notes,
                            documentId: a.documentId,
                          });
                          setProblem(null);
                        }}
                        style={hudButtonStyle("ghost")}
                      >
                        Edit
                      </Button>
                      <ConfirmDelete onConfirm={() => void remove(a.id!)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canEdit && !f && (
        <div style={{ marginTop: "1rem" }}>
          <Button
            onClick={() => {
              setForm(EMPTY_ASSESSMENT_FORM);
              setProblem(null);
            }}
            style={hudButtonStyle("primary")}
          >
            Add an assessment
          </Button>
        </div>
      )}

      {f && (
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
        >
          <div style={grid}>
            <label style={field}>
              <span style={labelText}>What's it for?</span>
              <input
                aria-label="What's it for?"
                value={f.title}
                maxLength={120}
                onChange={(e) => setForm({ ...f, title: e.target.value })}
                style={hudInputStyle}
              />
            </label>
            <label style={field}>
              <span style={labelText}>Amount, $</span>
              <input
                aria-label="Amount, $"
                inputMode="decimal"
                value={f.amount}
                onChange={(e) => setForm({ ...f, amount: e.target.value })}
                style={hudInputStyle}
              />
            </label>
            <DateInput label="Due date" value={f.dueDate} onChange={(v) => setForm({ ...f, dueDate: v })} />
            <DateInput label="Paid on" value={f.paidDate} onChange={(v) => setForm({ ...f, paidDate: v })} />
          </div>
          <label style={field}>
            <span style={labelText}>Notes</span>
            <input
              aria-label="Assessment notes"
              value={f.notes}
              maxLength={1000}
              onChange={(e) => setForm({ ...f, notes: e.target.value })}
              style={hudInputStyle}
            />
          </label>
          <DocSelect
            label="Assessment notice"
            docs={docs}
            value={f.documentId}
            onChange={(v) => setForm({ ...f, documentId: v })}
          />
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save assessment"}
            </Button>
            <Button type="button" onClick={() => setForm(null)} style={hudButtonStyle("ghost")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

// ─── Condo association (milestone inspection, reserve study) ────────────────

function DuePill({ date }: { date: string }) {
  const s = dueStatus(date, Date.now());
  if (s === "overdue") return <Pill tone="bad">Past due</Pill>;
  if (s === "soon") return <Pill tone="warn">Due within a year</Pill>;
  return null;
}

function Condo({
  propertyId,
  canEdit,
  record,
  setRecord,
  docs,
  docLabel,
}: {
  propertyId: string;
  canEdit: boolean;
  record: CondoRecord | null;
  setRecord: (r: CondoRecord | null) => void;
  docs: DocRef[];
  docLabel: (id: string | null) => string | null;
}) {
  const [form, setForm] = useState<CondoRecord | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = form ?? (!record && canEdit ? EMPTY_CONDO : null);

  const submit = async (e: React.FormEvent, current: CondoRecord) => {
    e.preventDefault();
    const { updatedAt: _u, ...rest } = current;
    const next: CondoRecord = { ...rest, associationName: rest.associationName.trim(), notes: rest.notes.trim() };
    const why = validateCondo(next);
    setProblem(why);
    if (why) return;
    setSaving(true);
    try {
      await hoaService.saveCondo(propertyId, next);
      setRecord(next);
      setForm(null);
      toast.success("Condo record saved");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the condo record"));
    } finally {
      setSaving(false);
    }
  };

  const dateItem = (label: string, date: string, showDue = false) => (
    <div>
      <div style={labelText}>{label}</div>
      <div style={{ ...ink, marginTop: 2 }}>{date ? formatIsoDate(date) : "Not entered"}</div>
      {showDue && date && (
        <div style={{ marginTop: 4 }}>
          <DuePill date={date} />
        </div>
      )}
    </div>
  );

  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Condo association: milestone inspection and reserve study"
        sub="The dates and reports your association has given you for its milestone inspection and structural reserve study."
      />
      <p style={{ ...muted, marginBottom: "1rem" }}>
        This is what you've entered from the association's notices. HomeGentic doesn't check it with the association,
        and it doesn't say whether the building is safe.
      </p>

      {record && !form && (
        <>
          {record.associationName && (
            <p style={{ ...ink, fontWeight: 600, margin: "0 0 0.75rem" }}>{record.associationName}</p>
          )}
          <div style={grid}>
            {dateItem("Last milestone inspection", record.milestoneLastDate)}
            {dateItem("Next milestone inspection due", record.milestoneNextDue, true)}
            {dateItem("Last reserve study", record.reserveStudyLastDate)}
            {dateItem("Next reserve study due", record.reserveStudyNextDue, true)}
          </div>
          {record.milestoneDocId && (
            <p style={{ ...muted, marginTop: "0.75rem" }}>Milestone report: {docLabel(record.milestoneDocId)}</p>
          )}
          {record.reserveStudyDocId && (
            <p style={{ ...muted, marginTop: "0.25rem" }}>Reserve study: {docLabel(record.reserveStudyDocId)}</p>
          )}
          {record.notes && <p style={{ ...ink, marginTop: "0.75rem" }}>{record.notes}</p>}
          {canEdit && (
            <div style={{ marginTop: "1rem" }}>
              <Button
                onClick={() => {
                  setForm(record);
                  setProblem(null);
                }}
                style={hudButtonStyle("outline")}
              >
                Edit
              </Button>
            </div>
          )}
        </>
      )}

      {editing && (
        <form
          onSubmit={(e) => void submit(e, editing)}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <label style={field}>
            <span style={labelText}>Association name</span>
            <input
              aria-label="Association name"
              value={editing.associationName}
              maxLength={120}
              onChange={(e) => setForm({ ...editing, associationName: e.target.value })}
              style={hudInputStyle}
            />
          </label>
          <div style={grid}>
            <DateInput
              label="Last milestone inspection"
              value={editing.milestoneLastDate}
              onChange={(v) => setForm({ ...editing, milestoneLastDate: v })}
            />
            <DateInput
              label="Next milestone inspection due"
              value={editing.milestoneNextDue}
              onChange={(v) => setForm({ ...editing, milestoneNextDue: v })}
            />
            <DocSelect
              label="Milestone inspection report"
              docs={docs}
              value={editing.milestoneDocId}
              onChange={(v) => setForm({ ...editing, milestoneDocId: v })}
            />
          </div>
          <div style={grid}>
            <DateInput
              label="Last reserve study"
              value={editing.reserveStudyLastDate}
              onChange={(v) => setForm({ ...editing, reserveStudyLastDate: v })}
            />
            <DateInput
              label="Next reserve study due"
              value={editing.reserveStudyNextDue}
              onChange={(v) => setForm({ ...editing, reserveStudyNextDue: v })}
            />
            <DocSelect
              label="Reserve study report"
              docs={docs}
              value={editing.reserveStudyDocId}
              onChange={(v) => setForm({ ...editing, reserveStudyDocId: v })}
            />
          </div>
          <label style={field}>
            <span style={labelText}>Notes</span>
            <textarea
              aria-label="Condo notes"
              rows={2}
              value={editing.notes}
              maxLength={2000}
              onChange={(e) => setForm({ ...editing, notes: e.target.value })}
              style={{ ...hudInputStyle, resize: "vertical" }}
            />
          </label>
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save condo record"}
            </Button>
            {form && (
              <Button type="button" onClick={() => setForm(null)} style={hudButtonStyle("ghost")}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}
