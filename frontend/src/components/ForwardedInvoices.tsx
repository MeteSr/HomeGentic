/**
 * Forwarded invoices: the homeowner's private forwarding address and the
 * drafts read from mail sent to it (services/jobInbox.ts).
 *
 * A draft is only a suggestion. "Review and log" opens the job form with the
 * draft's fields filled in; the job is saved only when the homeowner submits
 * it there (which also clears the draft). "Dismiss" deletes the draft.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Panel } from "@/components/hud";
import { jobInboxService, type EmailDraft } from "@/services/jobInbox";
import { formatCents, formatIsoDate } from "@/utils/format";

const BODY = "'Hanken Grotesk',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const btn = (primary: boolean): React.CSSProperties => ({
  fontFamily: BODY, fontSize: 13, fontWeight: primary ? 700 : 600,
  color: primary ? "#FCFCFD" : "var(--hg-ink)",
  background: primary ? "var(--hg-blue)" : "var(--hg-fill)",
  border: primary ? "none" : "1px solid var(--hg-line-2)",
  borderRadius: 100, padding: "7px 14px", cursor: "pointer",
});

/** The job form's prefill for a draft (JobCreatePage reads location.state.prefill). */
export function draftPrefill(d: EmailDraft): Record<string, string> {
  return {
    serviceType:    d.serviceType,
    contractorName: d.contractorName,
    amount:         d.amountCents > 0 ? (d.amountCents / 100).toFixed(2) : "",
    date:           d.completedDate,
    description:    d.description || d.title,
    warrantyMonths: d.warrantyMonths > 0 ? String(d.warrantyMonths) : "",
    emailDraftId:   d.id,
  };
}

export function ForwardedInvoices() {
  const navigate = useNavigate();
  const enabled  = !!jobInboxService.domain();
  const [address, setAddress] = useState<string | null>(null);
  const [drafts,  setDrafts]  = useState<EmailDraft[]>([]);
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    jobInboxService.getDrafts().then(setDrafts).catch(() => setDrafts([]));
  }, []);

  if (!enabled && drafts.length === 0) return null;

  const show = async () => {
    setBusy(true);
    try { setAddress(await jobInboxService.getAddress()); }
    catch { toast.error("Couldn't load your forwarding address"); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    if (!window.confirm("Get a new address? Mail sent to the old one will be ignored from now on.")) return;
    setBusy(true);
    try { setAddress(await jobInboxService.resetAddress()); toast.success("New forwarding address ready"); }
    catch { toast.error("Couldn't change the address"); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); toast.success("Address copied"); }
    catch { toast.error("Couldn't copy. Select the address and copy it yourself."); }
  };

  const dismiss = async (id: string) => {
    try {
      await jobInboxService.dismiss(id);
      setDrafts((ds) => ds.filter((d) => d.id !== id));
    } catch {
      toast.error("Couldn't dismiss that draft");
    }
  };

  return (
    <Panel style={{ padding: 24, marginBottom: 16 }}>
      <div data-testid="forwarded-invoices">
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: "var(--hg-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
          FORWARDED INVOICES
        </div>

        {enabled && (
          <div style={{ marginBottom: drafts.length ? 18 : 0 }}>
            <p style={{ fontFamily: BODY, fontSize: 13, color: "var(--hg-muted)", lineHeight: 1.5, margin: "0 0 12px" }}>
              Forward a contractor's invoice or receipt (PDF, photo, or the email itself) to your private address.
              We read it and leave a draft here for you to check. Nothing is added to your home's record until you log it.
            </p>
            {address ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code data-testid="inbox-address" style={{ fontFamily: MONO, fontSize: 13, color: "var(--hg-ink)", background: "var(--hg-fill)", border: "1px solid var(--hg-line)", borderRadius: 8, padding: "6px 10px", wordBreak: "break-all" }}>
                  {address}
                </code>
                <button onClick={copy} style={btn(true)}>Copy</button>
                <button onClick={reset} disabled={busy} style={btn(false)}>New address</button>
              </div>
            ) : (
              <button onClick={show} disabled={busy} style={btn(true)}>Show my forwarding address</button>
            )}
          </div>
        )}

        {drafts.length > 0 && (
          <div>
            <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: "var(--hg-ink)", marginBottom: 8 }}>
              {drafts.length} draft{drafts.length !== 1 ? "s" : ""} to review
            </div>
            {drafts.map((d) => (
              <div key={d.id} data-testid="email-draft" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--hg-line)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: "var(--hg-ink)" }}>{d.title}</div>
                  <div style={{ fontFamily: BODY, fontSize: 12, color: "var(--hg-muted)", marginTop: 2 }}>
                    {[d.contractorName, d.amountCents > 0 ? formatCents(d.amountCents) : "", formatIsoDate(d.completedDate)].filter(Boolean).join(" · ")}
                    {d.fromAddress ? ` · from ${d.fromAddress}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => dismiss(d.id)} style={btn(false)}>Dismiss</button>
                  <button onClick={() => navigate("/jobs/new", { state: { prefill: draftPrefill(d) } })} style={btn(true)}>Review and log</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
