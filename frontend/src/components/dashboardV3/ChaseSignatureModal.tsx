/**
 * ChaseSignatureModal — nudge a contractor toward countersigning a job.
 *
 * There's no in-app messaging channel to a contractor in this repo yet, so
 * "chase the signature" here means real contact info (from the
 * contractor's own profile) opened via tel:/sms:/mailto: links, plus the
 * one real backend action that exists: jobService.verifyJob. If the
 * canister rejects that call (e.g. because verification is
 * contractor-only), the real error surfaces via toast rather than being
 * silently swallowed or faked as success.
 */
import { useEffect, useState } from "react";
import { X, Phone, MessageSquare, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { jobService, type Job } from "@/services/job";
import { contractorService, type ContractorProfile } from "@/services/contractor";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

interface ChaseSignatureModalProps {
  open:    boolean;
  jobId:   string | null;
  jobs:    Job[];
  onClose: () => void;
  onSent:  () => void;
}

export function ChaseSignatureModal({ open, jobId, jobs, onClose, onSent }: ChaseSignatureModalProps) {
  const job = jobId ? jobs.find((j) => j.id === jobId) ?? null : null;
  const [contact, setContact] = useState<ContractorProfile | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open || !job?.contractor) { setContact(null); return; }
    contractorService.getContractor(job.contractor).then(setContact).catch(() => setContact(null));
  }, [open, job?.contractor]);

  if (!open || !job) return null;

  const message = `Hi — could you sign off the ${job.serviceType} job from ${job.date}? One tap, no account needed.`;

  async function selfVerify() {
    setVerifying(true);
    try {
      await jobService.verifyJob(job!.id);
      toast.success("Job marked verified.");
      onSent();
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't verify this job from here — it may need the contractor's signature.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,26,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: V2_COLORS.paper, borderRadius: V2_RADIUS.card, boxShadow: V2_SHADOWS.modal, width: "100%", maxWidth: "30rem", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 1.5rem", borderBottom: `1px solid ${V2_COLORS.border}` }}>
          <div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.blue, margin: "0 0 0.2rem" }}>Outstanding signature</p>
            <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.15rem", color: V2_COLORS.ink, margin: 0 }}>{job.contractorName ?? "Contractor"}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted }}><X size={18} /></button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: V2_COLORS.muted, margin: 0, lineHeight: 1.5 }}>
            The {job.serviceType} job from {job.date} is on the record but unverified until they countersign.
          </p>

          {contact ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {contact.phone && (
                <a href={`sms:${contact.phone}?body=${encodeURIComponent(message)}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.75rem 1rem", borderRadius: "0.9rem", border: `1.5px solid ${V2_COLORS.border}`, color: V2_COLORS.ink, fontFamily: V2_FONTS.body, fontSize: "0.85rem", fontWeight: 600 }}>
                  <MessageSquare size={16} color={V2_COLORS.blue} /> Text {contact.phone}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.75rem 1rem", borderRadius: "0.9rem", border: `1.5px solid ${V2_COLORS.border}`, color: V2_COLORS.ink, fontFamily: V2_FONTS.body, fontSize: "0.85rem", fontWeight: 600 }}>
                  <Phone size={16} color={V2_COLORS.blue} /> Call {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}?subject=${encodeURIComponent("Please countersign a HomeGentic job")}&body=${encodeURIComponent(message)}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.75rem 1rem", borderRadius: "0.9rem", border: `1.5px solid ${V2_COLORS.border}`, color: V2_COLORS.ink, fontFamily: V2_FONTS.body, fontSize: "0.85rem", fontWeight: 600 }}>
                  <Mail size={16} color={V2_COLORS.blue} /> Email {contact.email}
                </a>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: V2_COLORS.muted, margin: 0 }}>
              No contact profile on file for this contractor — reach them the way you normally would.
            </p>
          )}

          <div style={{ borderTop: `1px solid ${V2_COLORS.border}`, paddingTop: "0.75rem" }}>
            <button
              onClick={selfVerify}
              disabled={verifying}
              style={{ width: "100%", padding: "0.65rem 1rem", borderRadius: 100, border: `1.5px solid ${V2_COLORS.blue}`, background: "transparent", color: V2_COLORS.blue, fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.85rem", cursor: verifying ? "wait" : "pointer" }}
            >
              {verifying ? "Verifying…" : "Mark verified myself"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
