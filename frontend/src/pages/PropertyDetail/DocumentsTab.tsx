import React, { useState, useEffect } from "react";
import { photoService, type Photo } from "@/services/photo";
import toast from "react-hot-toast";
import { Panel, hudInputStyle } from "@/components/hud";
import { errorMessage, hasErrorCode } from "../../services/candid";
import { propertyService, type AccessRole } from "@/services/property";
import { useAuthStore } from "@/store/authStore";
import {
  DOC_GROUPS, DOC_TYPE_LABELS, canEditDocuments, docGroupOf, encodeDoc, encodeInspection, encodePermit, parseDoc,
  type DocType,
} from "@/services/documentVault";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";

const DOC_TYPE_COLORS: Partial<Record<DocType, { color: string; bg: string }>> = {
  Permit:     { color: "var(--hg-ink-2)",    bg: "var(--hg-blue-wash)" },
  Inspection: { color: "var(--hg-blue-ink)", bg: "var(--hg-blue-wash)" },
  Warranty:   { color: "var(--hg-ink-2)",    bg: "var(--hg-yel-wash)" },
  Invoice:    { color: "var(--hg-blue-ink)", bg: "var(--hg-yel-wash)" },
  Deed:       { color: "var(--hg-blue-ink)", bg: "var(--hg-blue-wash)" },
  Closing:    { color: "var(--hg-blue-ink)", bg: "var(--hg-blue-wash)" },
  Title:      { color: "var(--hg-blue-ink)", bg: "var(--hg-blue-wash)" },
  Survey:     { color: "var(--hg-blue-ink)", bg: "var(--hg-blue-wash)" },
  Insurance:  { color: "var(--hg-ink-2)",    bg: "var(--hg-yel-wash)" },
  Elevation:  { color: "var(--hg-ink-2)",    bg: "var(--hg-yel-wash)" },
};
const DEFAULT_COLORS = { color: "var(--hg-muted)", bg: "transparent" };

type BatchFileStatus = "pending" | "uploading" | "done" | "duplicate" | "error";
interface BatchFile { name: string; status: BatchFileStatus; error?: string }

// ─── DocumentsTab ─────────────────────────────────────────────────────────────

export function DocumentsTab({ propertyId }: { propertyId: string }) {
  const DOCS_JOB = `docs_${propertyId}`;
  const inputRef      = React.useRef<HTMLInputElement>(null);
  const permitRef     = React.useRef<HTMLInputElement>(null);
  const inspectionRef = React.useRef<HTMLInputElement>(null);

  const [docs,     setDocs]     = useState<Photo[]>([]);
  const [loaded,   setLoaded]   = useState(false);
  const [role,     setRole]     = useState<AccessRole | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const principal = useAuthStore((st) => st.principal);
  const canEdit   = canEditDocuments(role);
  const [docType,  setDocType]  = useState<DocType>("Receipt");
  const [queue,    setQueue]    = useState<BatchFile[]>([]);
  const batchActive = queue.some((f) => f.status === "pending" || f.status === "uploading");

  const [permitNumber,       setPermitNumber]       = useState("");
  const [permitAuthority,    setPermitAuthority]    = useState("");
  const [permitStatus,       setPermitStatus]       = useState<"Open" | "Closed" | "Expired">("Open");
  const [permitUploading,    setPermitUploading]    = useState(false);

  const [inspectorName,         setInspectorName]         = useState("");
  const [inspectionStatus,      setInspectionStatus]      = useState<"Pass" | "Fail" | "Conditional">("Pass");
  const [inspectionUploading,   setInspectionUploading]   = useState(false);

  useEffect(() => {
    if (!principal) return;
    propertyService.getAccessRole(propertyId, principal).then(setRole).catch(() => setRole(null));
  }, [propertyId, principal]);

  useEffect(() => {
    Promise.all([
      photoService.getByJob(`receipts_${propertyId}`).catch(() => [] as Photo[]),
      photoService.getByJob(DOCS_JOB).catch(() => [] as Photo[]),
    ]).then(([legacy, current]) => {
      setDocs([...legacy, ...current].sort((a, b) => b.createdAt - a.createdAt));
      setLoaded(true);
    });
  }, [propertyId]);

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
      toast.error(hasErrorCode(err, "Duplicate") ? "Already uploaded" : errorMessage(err, "Upload failed"));
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
      toast.error(hasErrorCode(err, "Duplicate") ? "Already uploaded" : errorMessage(err, "Upload failed"));
    } finally {
      setInspectionUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (inputRef.current) inputRef.current.value = "";
    const initialQueue: BatchFile[] = files.map((f) => ({ name: f.name, status: "pending" }));
    setQueue(initialQueue);
    for (let i = 0; i < files.length; i++) {
      setQueue((prev) => prev.map((q, idx) => idx === i ? { ...q, status: "uploading" } : q));
      try {
        const doc = await photoService.upload(files[i], DOCS_JOB, propertyId, "PostConstruction", encodeDoc(docType, files[i].name));
        setDocs((prev) => [doc, ...prev]);
        setQueue((prev) => prev.map((q, idx) => idx === i ? { ...q, status: "done" } : q));
      } catch (err: any) {
        const msg = errorMessage(err, "Upload failed");
        const isDuplicate = hasErrorCode(err, "Duplicate");
        setQueue((prev) => prev.map((q, idx) => idx === i ? { ...q, status: isDuplicate ? "duplicate" : "error", error: isDuplicate ? "Already uploaded" : msg } : q));
      }
    }
  };

  const handleRemove = async (doc: Photo, filename: string) => {
    if (!window.confirm(`Remove ${filename}? This deletes the file for everyone who can see this home.`)) return;
    setRemoving(doc.id);
    try {
      await photoService.deletePhoto(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Document removed");
    } catch (err: any) {
      toast.error(errorMessage(err, "Couldn't remove the document"));
    } finally {
      setRemoving(null);
    }
  };

  const grouped = DOC_GROUPS
    .map((g) => ({ group: g, items: docs.filter((d) => docGroupOf(parseDoc(d.description).type).key === g.key) }))
    .filter((g) => g.items.length > 0);

  const statusIcon = (s: BatchFileStatus) => {
    if (s === "done")      return <span style={{ color: "var(--hg-good)" }}>✓</span>;
    if (s === "duplicate") return <span style={{ color: "var(--hg-muted)" }}>⊘</span>;
    if (s === "error")     return <span style={{ color: "var(--hg-bad)" }}>✗</span>;
    if (s === "uploading") return <span style={{ color: "var(--hg-ink-2)" }}>↑</span>;
    return <span style={{ color: "var(--hg-line-2)" }}>…</span>;
  };

  return (
    <div>
      <Panel style={{ marginBottom: "1.25rem", padding: "0.875rem 1.25rem", background: "var(--hg-fill)" }}>
        <p style={{ fontSize: "0.8rem", color: "var(--hg-ink-2)", lineHeight: 1.6, margin: 0 }}>
          <strong>Who can see these files:</strong> you, everyone you've added to this home on People (co-owners, managers and viewers), and your buyer if you hand the record over at closing. Closing papers and policies can hold account and loan numbers, so remove anything you don't want to pass on before you send a buyer the claim link.
        </p>
        {!canEdit && (
          <p style={{ fontSize: "0.8rem", color: "var(--hg-muted)", lineHeight: 1.6, margin: "0.5rem 0 0" }}>
            You have view-only access to this home, so you can open documents but not add or remove them.
          </p>
        )}
      </Panel>

      {canEdit && (<>
      {/* Permits & Inspections */}
      <Panel style={{ marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--hg-line)", background: "var(--hg-fill)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-ink-2)" }}>Permits &amp; Inspections</p>
          <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: "var(--hg-muted)" }}>Upload with the permit or inspection details</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ padding: "1rem 1.25rem", borderRight: "1px solid var(--hg-line)" }}>
            <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-ink-2)", marginBottom: "0.75rem" }}>Permit</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input placeholder="Permit #" value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} style={{ ...hudInputStyle, fontSize: "0.8rem" }} />
              <input placeholder="Issuing authority (e.g. City of Austin)" value={permitAuthority} onChange={(e) => setPermitAuthority(e.target.value)} style={{ ...hudInputStyle, fontSize: "0.8rem" }} />
              <select value={permitStatus} onChange={(e) => setPermitStatus(e.target.value as any)} style={{ ...hudInputStyle, fontSize: "0.8rem" }}>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
            <button disabled={permitUploading} onClick={() => permitRef.current?.click()} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", borderRadius: 6, border: "1px solid var(--hg-line-2)", color: "var(--hg-ink-2)", background: "none", cursor: permitUploading ? "not-allowed" : "pointer", opacity: permitUploading ? 0.5 : 1 }}>
              {permitUploading ? "Uploading…" : "+ Upload Permit"}
            </button>
            <input ref={permitRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handlePermitUpload} />
          </div>
          <div style={{ padding: "1rem 1.25rem" }}>
            <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-blue-ink)", marginBottom: "0.75rem" }}>Inspection Report</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input placeholder="Inspector name or company" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} style={{ ...hudInputStyle, fontSize: "0.8rem" }} />
              <select value={inspectionStatus} onChange={(e) => setInspectionStatus(e.target.value as any)} style={{ ...hudInputStyle, fontSize: "0.8rem" }}>
                <option value="Pass">Pass</option>
                <option value="Conditional">Conditional</option>
                <option value="Fail">Fail</option>
              </select>
            </div>
            <button disabled={inspectionUploading} onClick={() => inspectionRef.current?.click()} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", borderRadius: 6, border: "1px solid var(--hg-blue-edge)", color: "var(--hg-blue-ink)", background: "none", cursor: inspectionUploading ? "not-allowed" : "pointer", opacity: inspectionUploading ? 0.5 : 1 }}>
              {inspectionUploading ? "Uploading…" : "+ Upload Report"}
            </button>
            <input ref={inspectionRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleInspectionUpload} />
          </div>
        </div>
      </Panel>

      {/* Upload controls */}
      <Panel style={{ marginBottom: "1.5rem", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--hg-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-muted)" }}>Upload Documents</p>
          <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: "var(--hg-muted)" }}>Select multiple files — duplicates are auto-detected</p>
        </div>
        <div style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)" }}>
            Document type
            <select aria-label="Document type" value={docType} onChange={(e) => setDocType(e.target.value as DocType)} style={{ ...hudInputStyle, fontSize: "0.8rem", textTransform: "none", letterSpacing: 0 }}>
              {DOC_GROUPS.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.types.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <button onClick={() => inputRef.current?.click()} disabled={batchActive} style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", borderRadius: 6, border: "1px solid var(--hg-blue-edge)", color: "var(--hg-blue-ink)", background: "none", cursor: batchActive ? "not-allowed" : "pointer", opacity: batchActive ? 0.5 : 1 }}>
            {batchActive ? "Uploading…" : "+ Upload files"}
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} />
        </div>
        {queue.length > 0 && (
          <div style={{ borderTop: "1px solid var(--hg-line)" }}>
            {queue.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 1.25rem", borderBottom: i < queue.length - 1 ? "1px solid var(--hg-line)" : "none", background: f.status === "error" ? "rgba(255,92,57,0.1)" : f.status === "duplicate" ? "var(--hg-fill)" : "transparent" }}>
                <span style={{ fontFamily: MONO, fontSize: "0.8rem", width: "1rem", textAlign: "center" }}>{statusIcon(f.status)}</span>
                <span style={{ flex: 1, fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", color: f.status === "error" ? "var(--hg-bad)" : f.status === "duplicate" ? "var(--hg-muted)" : f.status === "done" ? "var(--hg-good)" : "var(--hg-muted)" }}>
                  {f.status === "error" ? (f.error ?? "Error") : f.status === "duplicate" ? "Duplicate — skipped" : f.status === "done" ? "Uploaded" : f.status === "uploading" ? "Uploading…" : "Queued"}
                </span>
              </div>
            ))}
            {!batchActive && (
              <div style={{ padding: "0.5rem 1.25rem", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setQueue([])} style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", background: "none", color: "var(--hg-muted)", cursor: "pointer" }}>Clear</button>
              </div>
            )}
          </div>
        )}
      </Panel>

      </>)}

      {/* Document list */}
      {!loaded ? null : docs.length === 0 ? (
        <Panel style={{ border: "1px dashed var(--hg-line-2)", background: "transparent", padding: "3rem", textAlign: "center" }}>
          <p style={{ fontFamily: SERIF, fontWeight: 700, color: "var(--hg-ink)", marginBottom: "0.375rem" }}>No documents yet</p>
          <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>Keep the deed, closing papers, insurance policy, HOA documents, manuals, receipts and permits for this home in one place. Each file gets a SHA-256 fingerprint, so the same file isn't saved twice.</p>
        </Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {grouped.map(({ group, items }) => (
        <section key={group.key} aria-labelledby={`docs-${group.key}`}>
        <h3 id={`docs-${group.key}`} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-ink-2)", fontWeight: 600, margin: "0 0 0.5rem" }}>{group.label}</h3>
        <Panel style={{ overflow: "hidden" }}>
          {items.map((doc, i) => {
            const parsed = parseDoc(doc.description);
            const tc = DOC_TYPE_COLORS[parsed.type] ?? DEFAULT_COLORS;
            return (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1.25rem", borderBottom: i < items.length - 1 ? "1px solid var(--hg-line)" : "none" }}>
                <span style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.2rem 0.5rem", borderRadius: 100, flexShrink: 0, color: tc.color, background: tc.bg, border: `1px solid ${tc.color}` }}>{DOC_TYPE_LABELS[parsed.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--hg-ink-2)", marginBottom: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parsed.filename}</p>
                  {parsed.type === "Permit" && parsed.permitNumber && (
                    <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: "var(--hg-ink-3)", letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
                      {parsed.permitNumber} · {parsed.authority} · <span style={{ textTransform: "uppercase", fontWeight: 700, color: parsed.status === "Closed" ? "var(--hg-blue-ink)" : parsed.status === "Expired" ? "var(--hg-muted)" : "var(--hg-ink-2)" }}>{parsed.status}</span>
                    </p>
                  )}
                  {parsed.type === "Inspection" && parsed.inspector && (
                    <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: "var(--hg-blue-ink)", letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
                      {parsed.inspector} · <span style={{ textTransform: "uppercase", fontWeight: 700, color: parsed.status === "Pass" ? "var(--hg-good)" : parsed.status === "Fail" ? "var(--hg-bad)" : "var(--hg-muted)" }}>{parsed.status}</span>
                    </p>
                  )}
                  <p style={{ fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-muted)", letterSpacing: "0.06em" }}>
                    {(doc.size / 1024).toFixed(1)} KB · {doc.hash.slice(0, 16)}… · {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-blue-ink)", textDecoration: "none", flexShrink: 0 }}>View</a>
                )}
                {canEdit && (
                  <button aria-label={`Remove ${parsed.filename}`} disabled={removing === doc.id} onClick={() => handleRemove(doc, parsed.filename)} style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", background: "none", border: "none", cursor: removing === doc.id ? "not-allowed" : "pointer", flexShrink: 0, padding: 0 }}>
                    {removing === doc.id ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
        </Panel>
        </section>
        ))}
        </div>
      )}
    </div>
  );
}
