import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Plus, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { recurringService, RecurringService, VisitLog, ServiceStatus, SERVICE_TYPE_LABELS, FREQUENCY_LABELS } from "@/services/recurringService";
import { photoService } from "@/services/photo";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  Active:    { color: S.sage,         bg: COLORS.sageLight },
  Paused:    { color: COLORS.plumMid, bg: COLORS.butter    },
  Cancelled: { color: S.inkLight,     bg: S.paper          },
};

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${d}, ${y}`;
}

export default function RecurringServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [svc,     setSvc]     = useState<RecurringService | null>(null);
  const [visits,  setVisits]  = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Visit log form
  const [showVisitForm,   setShowVisitForm]   = useState(false);
  const [visitDate,       setVisitDate]       = useState(new Date().toISOString().split("T")[0]);
  const [visitNote,       setVisitNote]       = useState("");
  const [visitSubmitting, setVisitSubmitting] = useState(false);

  // Doc upload / status
  const [docUploading,  setDocUploading]  = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      recurringService.getById(id).then((s) => setSvc(s)),
      recurringService.getVisitLogs(id).then((v) => setVisits(v)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const handleAddVisit = async () => {
    if (!id || !visitDate) { toast.error("Please select a visit date"); return; }
    setVisitSubmitting(true);
    try {
      const entry = await recurringService.addVisitLog(id, visitDate, visitNote.trim() || undefined);
      setVisits((v) => [entry, ...v]);
      setShowVisitForm(false);
      setVisitNote("");
      toast.success("Visit logged");
    } catch (err: any) {
      toast.error(err.message || "Failed to log visit");
    } finally {
      setVisitSubmitting(false);
    }
  };

  const handleStatusChange = async (status: ServiceStatus) => {
    if (!id) return;
    setStatusLoading(true);
    try {
      const updated = await recurringService.updateStatus(id, status);
      setSvc(updated);
      toast.success(`Service ${status.toLowerCase()}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !svc || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setDocUploading(true);
    try {
      const photo = await photoService.upload(
        file,
        id,           // jobId = service ID
        svc.propertyId,
        "PostConstruction",
        "Service contract"
      );
      const updated = await recurringService.attachContractDoc(id, photo.id);
      setSvc(updated);
      toast.success("Contract document attached");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setDocUploading(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  const statusStyle = svc ? (STATUS_STYLE[svc.status] ?? STATUS_STYLE.Active) : STATUS_STYLE.Active;
  const isCancelled = svc?.status === "Cancelled";

  return (
    <Layout>
      <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        {!svc ? (
          <div style={{ padding: "3rem", textAlign: "center", border: `1px solid ${S.rule}` }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>Service not found.</p>
          </div>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
              Recurring Service
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1 }}>
                {SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType}
              </h1>
              <span style={{
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
                textTransform: "uppercase", padding: "0.25rem 0.6rem",
                color: statusStyle.color, background: statusStyle.bg,
                border: `1px solid ${statusStyle.color}44`,
                alignSelf: "center",
              }}>
                {svc.status}
              </span>
            </div>

            {/* ── Service details ────────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.5rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2rem" }}>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Provider</p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>{svc.providerName}</p>
                </div>
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Frequency</p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>{FREQUENCY_LABELS[svc.frequency] ?? svc.frequency}</p>
                </div>
                {svc.providerLicense && (
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>License #</p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>{svc.providerLicense}</p>
                  </div>
                )}
                {svc.providerPhone && (
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Phone</p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>{svc.providerPhone}</p>
                  </div>
                )}
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Started</p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>{fmtDate(svc.startDate)}</p>
                </div>
                {svc.contractEndDate && (
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Contract ends</p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>{fmtDate(svc.contractEndDate)}</p>
                  </div>
                )}
              </div>
              {svc.notes && (
                <p style={{ marginTop: "1rem", fontSize: "0.85rem", fontWeight: 300, color: S.inkLight, borderTop: `1px solid ${S.rule}`, paddingTop: "1rem" }}>
                  {svc.notes}
                </p>
              )}
            </div>

            {/* ── Contract document ──────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.25rem", marginBottom: "1.25rem" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
                Contract Document
              </p>
              {svc.contractDocPhotoId ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <FileText size={16} color={S.sage} />
                  <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.sage }}>Document on file</span>
                  {!isCancelled && (
                    <label style={{ marginLeft: "auto", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${S.rule}`, cursor: "pointer", color: S.inkLight }}>
                      Replace
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleDocUpload} />
                    </label>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", flexWrap: "wrap" }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 300, color: S.inkLight }}>
                    No contract document attached.
                  </p>
                  {!isCancelled && (
                    <label style={{
                      fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
                      textTransform: "uppercase", padding: "0.35rem 0.875rem",
                      border: `1px solid ${S.rust}`, color: S.rust,
                      cursor: docUploading ? "not-allowed" : "pointer",
                      opacity: docUploading ? 0.6 : 1,
                    }}>
                      {docUploading ? "Uploading…" : "Attach Contract"}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleDocUpload} disabled={docUploading} />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* ── Status controls ────────────────────────────────────────────── */}
            {!isCancelled && (
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
                {svc.status === "Active" && (
                  <button
                    onClick={() => handleStatusChange("Paused")}
                    disabled={statusLoading}
                    style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
                  >
                    Pause Service
                  </button>
                )}
                {svc.status === "Paused" && (
                  <button
                    onClick={() => handleStatusChange("Active")}
                    disabled={statusLoading}
                    style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${S.sage}`, background: COLORS.sageLight, cursor: "pointer", color: S.sage }}
                  >
                    Resume Service
                  </button>
                )}
                <button
                  onClick={() => { if (window.confirm("Cancel this service? This cannot be undone.")) handleStatusChange("Cancelled"); }}
                  disabled={statusLoading}
                  style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
                >
                  Cancel Service
                </button>
              </div>
            )}

            {/* ── Visit log ──────────────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.inkLight }}>
                  Visit Log · {visits.length} {visits.length === 1 ? "entry" : "entries"}
                </p>
                {!isCancelled && !showVisitForm && (
                  <button
                    onClick={() => setShowVisitForm(true)}
                    style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.3rem 0.75rem", border: `1px solid ${S.rust}`, color: S.rust, background: "none", cursor: "pointer" }}
                  >
                    <Plus size={11} /> Log Visit
                  </button>
                )}
              </div>

              {/* Add visit inline form */}
              {showVisitForm && (
                <div style={{ border: `1px solid ${S.rule}`, padding: "1rem", marginBottom: "1rem", background: S.paper }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div>
                      <label className="form-label">Date *</label>
                      <input className="form-input" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Note <span style={{ color: S.inkLight, fontWeight: 300 }}>(optional)</span></label>
                      <input className="form-input" placeholder="e.g. Full interior + exterior treatment" value={visitNote} onChange={(e) => setVisitNote(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={handleAddVisit}
                      disabled={visitSubmitting}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 1rem", border: `1px solid ${S.ink}`, background: S.ink, color: S.paper, cursor: "pointer" }}
                    >
                      {visitSubmitting ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setShowVisitForm(false); setVisitNote(""); }}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 0.875rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Visit list */}
              {visits.length === 0 ? (
                <p style={{ fontSize: "0.8rem", fontWeight: 300, color: S.inkLight, padding: "0.75rem 0" }}>
                  No visits logged yet. Each visit takes 10 seconds — just pick the date.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {visits.map((v, i) => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.625rem 0", borderBottom: i < visits.length - 1 ? `1px solid ${S.rule}` : "none" }}>
                      <CheckCircle size={12} color={S.sage} style={{ flexShrink: 0 }} />
                      <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink, flexShrink: 0 }}>
                        {fmtDate(v.visitDate)}
                      </span>
                      {v.note && (
                        <span style={{ fontSize: "0.8rem", fontWeight: 300, color: S.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {v.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
