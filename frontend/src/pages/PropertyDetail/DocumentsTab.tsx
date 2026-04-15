import React, { useState, useEffect } from "react";
import { photoService, type Photo } from "@/services/photo";
import { COLORS, FONTS, RADIUS } from "@/theme";
import toast from "react-hot-toast";

// ─── Document vault types & helpers ──────────────────────────────────────────

const DOC_TYPES = ["Receipt", "Permit", "Inspection", "Warranty", "Invoice"] as const;
type DocType = typeof DOC_TYPES[number];

const DOC_TYPE_COLORS: Record<DocType, { color: string; bg: string }> = {
  Receipt:    { color: COLORS.plumMid, bg: COLORS.white },
  Permit:     { color: COLORS.plum,    bg: COLORS.sageLight },
  Inspection: { color: COLORS.sage,    bg: COLORS.sageLight },
  Warranty:   { color: COLORS.plum,    bg: COLORS.butter },
  Invoice:    { color: COLORS.sage,    bg: COLORS.blush },
};

function encodeDoc(type: DocType, filename: string): string {
  return `[${type}] ${filename}`;
}

function encodePermit(permitNumber: string, authority: string, status: string, filename: string): string {
  return `[Permit] ${permitNumber}|${authority}|${status}|${filename}`;
}

function encodeInspection(inspector: string, status: string, filename: string): string {
  return `[Inspection] ${inspector}|${status}|${filename}`;
}

interface ParsedDoc {
  type:         DocType;
  filename:     string;
  permitNumber?: string;
  authority?:   string;
  inspector?:   string;
  status?:      string;
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
    if (parts.length >= 4) return { type, permitNumber: parts[0], authority: parts[1], status: parts[2], filename: parts.slice(3).join("|") };
  }
  if (type === "Inspection") {
    const parts = rest.split("|");
    if (parts.length >= 3) return { type, inspector: parts[0], status: parts[1], filename: parts.slice(2).join("|") };
  }
  return { type, filename: rest };
}

type BatchFileStatus = "pending" | "uploading" | "done" | "duplicate" | "error";
interface BatchFile { name: string; status: BatchFileStatus; error?: string }

// ─── DocumentsTab ─────────────────────────────────────────────────────────────

export function DocumentsTab({ propertyId }: { propertyId: string }) {
  const TC = { ink: COLORS.plum, rule: COLORS.rule, inkLight: COLORS.plumMid, rust: COLORS.sage, serif: FONTS.serif, mono: FONTS.mono };
  const DOCS_JOB = `docs_${propertyId}`;
  const inputRef      = React.useRef<HTMLInputElement>(null);
  const permitRef     = React.useRef<HTMLInputElement>(null);
  const inspectionRef = React.useRef<HTMLInputElement>(null);

  const [docs,     setDocs]     = useState<Photo[]>([]);
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
    Promise.all([
      photoService.getByJob(`receipts_${propertyId}`).catch(() => [] as Photo[]),
      photoService.getByJob(DOCS_JOB).catch(() => [] as Photo[]),
    ]).then(([legacy, current]) => {
      setDocs([...legacy, ...current].sort((a, b) => b.createdAt - a.createdAt));
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
      toast.error(err.message === "Duplicate" ? "Already uploaded" : (err.message ?? "Upload failed"));
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
      toast.error(err.message === "Duplicate" ? "Already uploaded" : (err.message ?? "Upload failed"));
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
      {/* Permits & Inspections */}
      <div style={{ border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.sm, marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${COLORS.rule}`, background: COLORS.sageLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.plum }}>Permits &amp; Inspections</p>
          <p style={{ fontFamily: TC.mono, fontSize: "0.55rem", color: COLORS.plumMid }}>Upload with metadata — status tracked on-chain</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: COLORS.white }}>
          <div style={{ padding: "1rem 1.25rem", borderRight: `1px solid ${TC.rule}` }}>
            <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plum, marginBottom: "0.75rem" }}>Permit</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input className="form-input" placeholder="Permit #" value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} style={{ fontSize: "0.8rem" }} />
              <input className="form-input" placeholder="Issuing authority (e.g. City of Austin)" value={permitAuthority} onChange={(e) => setPermitAuthority(e.target.value)} style={{ fontSize: "0.8rem" }} />
              <select className="form-input" value={permitStatus} onChange={(e) => setPermitStatus(e.target.value as any)} style={{ fontSize: "0.8rem" }}>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
            <button disabled={permitUploading} onClick={() => permitRef.current?.click()} style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${COLORS.plum}`, color: COLORS.plum, background: "none", cursor: permitUploading ? "not-allowed" : "pointer", opacity: permitUploading ? 0.5 : 1 }}>
              {permitUploading ? "Uploading…" : "+ Upload Permit"}
            </button>
            <input ref={permitRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handlePermitUpload} />
          </div>
          <div style={{ padding: "1rem 1.25rem" }}>
            <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.sage, marginBottom: "0.75rem" }}>Inspection Report</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input className="form-input" placeholder="Inspector name or company" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} style={{ fontSize: "0.8rem" }} />
              <select className="form-input" value={inspectionStatus} onChange={(e) => setInspectionStatus(e.target.value as any)} style={{ fontSize: "0.8rem" }}>
                <option value="Pass">Pass</option>
                <option value="Conditional">Conditional</option>
                <option value="Fail">Fail</option>
              </select>
            </div>
            <button disabled={inspectionUploading} onClick={() => inspectionRef.current?.click()} style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${COLORS.sage}`, color: COLORS.sage, background: "none", cursor: inspectionUploading ? "not-allowed" : "pointer", opacity: inspectionUploading ? 0.5 : 1 }}>
              {inspectionUploading ? "Uploading…" : "+ Upload Report"}
            </button>
            <input ref={inspectionRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleInspectionUpload} />
          </div>
        </div>
      </div>

      {/* Upload controls */}
      <div style={{ border: `1px solid ${TC.rule}`, marginBottom: "1.5rem" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${TC.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: TC.inkLight }}>Upload Documents</p>
          <p style={{ fontFamily: TC.mono, fontSize: "0.55rem", color: TC.inkLight }}>Select multiple files — duplicates are auto-detected</p>
        </div>
        <div style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "1px", background: TC.rule }}>
            {DOC_TYPES.map((t) => (
              <button key={t} onClick={() => setDocType(t)} style={{ padding: "0.35rem 0.75rem", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", cursor: "pointer", background: docType === t ? COLORS.plum : COLORS.white, color: docType === t ? COLORS.white : TC.inkLight }}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={() => inputRef.current?.click()} disabled={batchActive} style={{ fontFamily: TC.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.375rem 0.875rem", border: `1px solid ${TC.rust}`, color: TC.rust, background: "none", cursor: batchActive ? "not-allowed" : "pointer", opacity: batchActive ? 0.5 : 1 }}>
            {batchActive ? "Uploading…" : `+ Upload ${docType}s`}
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleUpload} />
        </div>
        {queue.length > 0 && (
          <div style={{ borderTop: `1px solid ${TC.rule}` }}>
            {queue.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 1.25rem", borderBottom: i < queue.length - 1 ? `1px solid ${TC.rule}` : "none", background: f.status === "error" ? COLORS.blush : f.status === "duplicate" ? COLORS.sageLight : COLORS.white }}>
                <span style={{ fontFamily: TC.mono, fontSize: "0.8rem", width: "1rem", textAlign: "center" }}>{statusIcon(f.status)}</span>
                <span style={{ flex: 1, fontFamily: TC.mono, fontSize: "0.65rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", color: f.status === "error" ? TC.rust : f.status === "duplicate" ? TC.inkLight : f.status === "done" ? COLORS.sage : TC.inkLight }}>
                  {f.status === "error" ? (f.error ?? "Error") : f.status === "duplicate" ? "Duplicate — skipped" : f.status === "done" ? "Uploaded" : f.status === "uploading" ? "Uploading…" : "Queued"}
                </span>
              </div>
            ))}
            {!batchActive && (
              <div style={{ padding: "0.5rem 1.25rem", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setQueue([])} style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", border: "none", background: "none", color: TC.inkLight, cursor: "pointer" }}>Clear</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div style={{ border: `1px dashed ${TC.rule}`, padding: "3rem", textAlign: "center" }}>
          <p style={{ fontFamily: TC.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No documents yet</p>
          <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: TC.inkLight }}>Upload receipts, permits, inspection reports, warranties, or invoices. Each file is SHA-256 hashed and stored on-chain.</p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${TC.rule}` }}>
          {docs.map((doc, i) => {
            const parsed = parseDoc(doc.description);
            const tc = DOC_TYPE_COLORS[parsed.type];
            return (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem 1.25rem", background: "#fff", borderBottom: i < docs.length - 1 ? `1px solid ${TC.rule}` : "none" }}>
                <span style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.2rem 0.5rem", flexShrink: 0, color: tc.color, background: tc.bg, border: `1px solid ${tc.color}30` }}>{parsed.type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parsed.filename}</p>
                  {parsed.type === "Permit" && parsed.permitNumber && (
                    <p style={{ fontFamily: TC.mono, fontSize: "0.55rem", color: COLORS.plum, letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
                      {parsed.permitNumber} · {parsed.authority} · <span style={{ textTransform: "uppercase", fontWeight: 700, color: parsed.status === "Closed" ? COLORS.sage : parsed.status === "Expired" ? COLORS.plumMid : COLORS.plum }}>{parsed.status}</span>
                    </p>
                  )}
                  {parsed.type === "Inspection" && parsed.inspector && (
                    <p style={{ fontFamily: TC.mono, fontSize: "0.55rem", color: COLORS.sage, letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
                      {parsed.inspector} · <span style={{ textTransform: "uppercase", fontWeight: 700, color: parsed.status === "Pass" ? COLORS.sage : parsed.status === "Fail" ? COLORS.plum : COLORS.plumMid }}>{parsed.status}</span>
                    </p>
                  )}
                  <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", color: TC.inkLight, letterSpacing: "0.06em" }}>
                    {(doc.size / 1024).toFixed(1)} KB · {doc.hash.slice(0, 16)}… · {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.rust, textDecoration: "none", flexShrink: 0 }}>View</a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
