import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, Pill, SectionHeader, hudButtonStyle, hudInputStyle } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { errorMessage } from "@/services/candid";
import { photoService, type Photo } from "@/services/photo";
import { formatIsoDate } from "@/utils/format";
import {
  insuranceClaimService,
  claimPhotoJobId,
  repairQuotePrefill,
  validateClaim,
  validateLogEntry,
  CLAIM_CAUSES,
  EMPTY_CLAIM,
  type ClaimInput,
  type InsuranceClaim,
} from "@/services/insuranceClaims";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const small: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "1rem",
};

/** Today in the viewer's time zone, "YYYY-MM-DD". */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const uploadedAt = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function toInput(c: InsuranceClaim): ClaimInput {
  const { title, dateOfLoss, cause, description, claimNumber, adjusterName, adjusterContact, status } = c;
  return { title, dateOfLoss, cause, description, claimNumber, adjusterName, adjusterContact, status };
}

const trimmed = (c: ClaimInput): ClaimInput => ({
  ...c,
  title: c.title.trim(),
  cause: c.cause.trim(),
  description: c.description.trim(),
  claimNumber: c.claimNumber.trim(),
  adjusterName: c.adjusterName.trim(),
  adjusterContact: c.adjusterContact.trim(),
});

// ─── Claim form ───────────────────────────────────────────────────────────────

function ClaimForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ClaimInput;
  onSave: (c: ClaimInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ClaimInput>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set =
    (k: keyof ClaimInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const why = validateClaim(form);
    setProblem(why);
    if (why) return;
    setSaving(true);
    try {
      await onSave(trimmed(form));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div style={grid}>
        <label style={field}>
          <span style={labelText}>Title</span>
          <input
            aria-label="Title"
            type="text"
            value={form.title}
            maxLength={100}
            onChange={set("title")}
            style={hudInputStyle}
          />
        </label>
        <label style={field}>
          <span style={labelText}>Date of loss</span>
          <input
            aria-label="Date of loss"
            type="date"
            value={form.dateOfLoss}
            onChange={set("dateOfLoss")}
            style={hudInputStyle}
          />
        </label>
        <label style={field}>
          <span style={labelText}>Cause</span>
          <select aria-label="Cause" value={form.cause} onChange={set("cause")} style={hudInputStyle}>
            <option value="">Not entered</option>
            {CLAIM_CAUSES.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          <span style={labelText}>Claim number</span>
          <input
            aria-label="Claim number"
            type="text"
            value={form.claimNumber}
            maxLength={60}
            onChange={set("claimNumber")}
            style={hudInputStyle}
          />
        </label>
        <label style={field}>
          <span style={labelText}>Adjuster</span>
          <input
            aria-label="Adjuster"
            type="text"
            value={form.adjusterName}
            maxLength={100}
            onChange={set("adjusterName")}
            style={hudInputStyle}
          />
        </label>
        <label style={field}>
          <span style={labelText}>Adjuster phone or email</span>
          <input
            aria-label="Adjuster phone or email"
            type="text"
            value={form.adjusterContact}
            maxLength={200}
            onChange={set("adjusterContact")}
            style={hudInputStyle}
          />
        </label>
      </div>
      <label style={{ ...field, marginTop: "1rem" }}>
        <span style={labelText}>What happened</span>
        <textarea
          aria-label="What happened"
          value={form.description}
          maxLength={2000}
          rows={3}
          onChange={set("description")}
          style={{ ...hudInputStyle, resize: "vertical" }}
        />
      </label>
      {problem && (
        <p role="alert" style={{ ...small, color: "var(--hg-bad)", marginTop: "0.75rem" }}>
          {problem}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
          {saving ? "Saving…" : "Save claim"}
        </Button>
        <Button onClick={onCancel} style={hudButtonStyle("ghost")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── One claim ────────────────────────────────────────────────────────────────

function ClaimCard({
  claim,
  canEdit,
  onChange,
  onDeleted,
}: {
  claim: InsuranceClaim;
  canEdit: boolean;
  onChange: (c: InsuranceClaim) => void;
  onDeleted: (id: string) => void;
}) {
  const navigate = useNavigate();
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logDate, setLogDate] = useState(todayIso);
  const [logNote, setLogNote] = useState("");
  const [logProblem, setLogProblem] = useState<string | null>(null);

  useEffect(() => {
    photoService
      .getByJob(claimPhotoJobId(claim.id))
      .then((list) => setPhotos([...list].sort((a, b) => a.createdAt - b.createdAt)))
      .catch(() => setPhotos([]));
  }, [claim.id]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err, `Couldn't ${what}`));
    } finally {
      setBusy(false);
    }
  };

  const save = (input: ClaimInput) =>
    run("save the claim", async () => {
      onChange(await insuranceClaimService.update(claim.id, input));
      setEditing(false);
    });

  const addLog = (e: React.FormEvent) => {
    e.preventDefault();
    const why = validateLogEntry(logDate, logNote);
    setLogProblem(why);
    if (why) return;
    void run("add to the log", async () => {
      onChange(await insuranceClaimService.addLog(claim.id, logDate, logNote.trim()));
      setLogNote("");
    });
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const p = await photoService.upload(
          file,
          claimPhotoJobId(claim.id),
          claim.propertyId,
          "PreConstruction",
          `Damage photo: ${file.name}`,
        );
        setPhotos((prev) => [...prev, p]);
      } catch (err) {
        toast.error(errorMessage(err, `Couldn't upload ${file.name}`));
      }
    }
    setUploading(false);
  };

  return (
    <article
      aria-labelledby={headingId}
      style={{ border: "1px solid var(--hg-line)", borderRadius: 12, padding: "1.25rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <h3
          id={headingId}
          style={{ fontFamily: BODY, fontSize: "1rem", fontWeight: 700, color: "var(--hg-ink)", margin: 0 }}
        >
          {claim.title}
        </h3>
        <Pill tone={claim.status === "open" ? "warn" : "neutral"}>{claim.status === "open" ? "Open" : "Closed"}</Pill>
      </div>

      {editing ? (
        <div style={{ marginTop: "1rem" }}>
          <ClaimForm initial={toInput(claim)} onSave={save} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <p style={{ ...small, marginTop: 4 }}>
            Loss on {formatIsoDate(claim.dateOfLoss)}
            {claim.cause ? ` · ${claim.cause}` : ""}
          </p>
          {claim.description && (
            <p
              style={{
                fontFamily: BODY,
                fontSize: "0.875rem",
                color: "var(--hg-ink)",
                margin: "0.75rem 0 0",
                whiteSpace: "pre-wrap",
              }}
            >
              {claim.description}
            </p>
          )}
          <div style={{ ...grid, marginTop: "0.75rem" }}>
            <div>
              <div style={labelText}>Claim number</div>
              <div style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
                {claim.claimNumber || "Not entered"}
              </div>
            </div>
            <div>
              <div style={labelText}>Adjuster</div>
              <div style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
                {[claim.adjusterName, claim.adjusterContact].filter(Boolean).join(" · ") || "Not entered"}
              </div>
            </div>
          </div>
        </>
      )}

      <h4 style={{ ...labelText, margin: "1.25rem 0 0.5rem" }}>Claim log</h4>
      {claim.log.length === 0 ? (
        <p style={small}>Nothing logged yet.</p>
      ) : (
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
          }}
        >
          {claim.log.map((e, i) => (
            <li key={`${e.addedAt}-${i}`} style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
              <span style={{ color: "var(--hg-muted)", marginRight: "0.5rem" }}>{formatIsoDate(e.date)}</span>
              <span>{e.note}</span>
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <form
          onSubmit={addLog}
          noValidate
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem", alignItems: "flex-end" }}
        >
          <label style={field}>
            <span style={labelText}>Log date</span>
            <input
              aria-label="Log date"
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              style={hudInputStyle}
            />
          </label>
          <label style={{ ...field, flex: "1 1 220px" }}>
            <span style={labelText}>What happened on this date</span>
            <input
              aria-label="What happened on this date"
              type="text"
              value={logNote}
              maxLength={1000}
              placeholder="Called the insurer, adjuster visited, payment received…"
              onChange={(e) => setLogNote(e.target.value)}
              style={hudInputStyle}
            />
          </label>
          <Button type="submit" disabled={busy} style={hudButtonStyle("outline")}>
            Add to log
          </Button>
        </form>
      )}
      {logProblem && (
        <p role="alert" style={{ ...small, color: "var(--hg-bad)", marginTop: "0.5rem" }}>
          {logProblem}
        </p>
      )}

      <h4 style={{ ...labelText, margin: "1.25rem 0 0.5rem" }}>Damage photos</h4>
      {photos.length === 0 ? (
        <p style={small}>No damage photos yet.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {photos.map((p) => (
            <li key={p.id}>
              {p.url && (
                <img
                  src={p.url}
                  alt={p.description}
                  style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8, display: "block" }}
                />
              )}
              <div style={{ ...small, fontSize: "0.75rem", marginTop: 4 }}>Uploaded {uploadedAt(p.createdAt)}</div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div style={{ marginTop: "0.75rem" }}>
          <label style={{ ...field, display: "inline-flex" }}>
            <span style={labelText}>{uploading ? "Uploading…" : "Add damage photos"}</span>
            <input
              ref={fileRef}
              aria-label="Add damage photos"
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={upload}
              style={{ fontFamily: BODY, fontSize: "0.8125rem" }}
            />
          </label>
          <p style={{ ...small, fontSize: "0.75rem", marginTop: 4 }}>
            Each photo is stamped with the date and time it was uploaded. They count toward your plan's photo limits.
          </p>
        </div>
      )}

      {!editing && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.25rem", alignItems: "center" }}>
          <Button
            onClick={() => navigate("/quotes/new", { state: { prefill: repairQuotePrefill(claim) } })}
            style={hudButtonStyle("primary")}
          >
            Get repair quotes
          </Button>
          {canEdit && !confirmDelete && (
            <>
              <Button onClick={() => setEditing(true)} style={hudButtonStyle("outline")}>
                Edit
              </Button>
              <Button
                onClick={() => void save({ ...toInput(claim), status: claim.status === "open" ? "closed" : "open" })}
                disabled={busy}
                style={hudButtonStyle("ghost")}
              >
                {claim.status === "open" ? "Mark closed" : "Reopen"}
              </Button>
              <Button onClick={() => setConfirmDelete(true)} style={hudButtonStyle("ghost")}>
                Delete
              </Button>
            </>
          )}
          {canEdit && confirmDelete && (
            <>
              <span style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
                Delete this claim record and its log? This can't be undone. The photos stay with the home's photos.
              </span>
              <Button
                onClick={() =>
                  void run("delete the claim", async () => {
                    await insuranceClaimService.remove(claim.id);
                    onDeleted(claim.id);
                  })
                }
                disabled={busy}
                style={hudButtonStyle("danger")}
              >
                Yes, delete
              </Button>
              <Button onClick={() => setConfirmDelete(false)} style={hudButtonStyle("ghost")}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Claim kit ────────────────────────────────────────────────────────────────

/**
 * #711 claim kit: the household's records of insurance claims on the home,
 * each with a dated log, dated damage photos and a pre-filled repair quote.
 */
export function ClaimKit({ propertyId, canEdit }: { propertyId: string; canEdit: boolean }) {
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setState("loading");
    insuranceClaimService
      .list(propertyId)
      .then((list) => {
        setClaims(list);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId]);

  useEffect(load, [load]);

  const create = async (input: ClaimInput) => {
    try {
      const c = await insuranceClaimService.create(propertyId, input);
      setClaims((prev) => [c, ...prev]);
      setAdding(false);
      toast.success("Claim record saved");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the claim"));
    }
  };

  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Insurance claims"
        sub="Keep a dated record while a claim is open: what happened, who you spoke to, and photos of the damage. This is your own record. HomeGentic doesn't file or follow up on claims with your insurer."
      />
      {state === "loading" && <p style={small}>Loading claims…</p>}
      {state === "error" && <LoadError what="your claim records" onRetry={load} compact />}
      {state === "ready" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {canEdit && !adding && (
            <div>
              <Button onClick={() => setAdding(true)} style={hudButtonStyle("outline")}>
                Start a claim record
              </Button>
            </div>
          )}
          {adding && (
            <div style={{ border: "1px solid var(--hg-line)", borderRadius: 12, padding: "1.25rem" }}>
              <ClaimForm
                initial={{ ...EMPTY_CLAIM, dateOfLoss: todayIso() }}
                onSave={create}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
          {claims.length === 0 && !adding && <p style={small}>No claim records yet.</p>}
          {claims.map((c) => (
            <ClaimCard
              key={c.id}
              claim={c}
              canEdit={canEdit}
              onChange={(next) => setClaims((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
              onDeleted={(id) => setClaims((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
