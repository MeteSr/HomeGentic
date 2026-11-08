/**
 * SuccessorClaimsPage — /successor-claims (#724)
 *
 * The successor claims the signed-in user sent: where each one stands, why a
 * rejected one wasn't approved, and the final step that moves the home
 * record to them once it's approved and the 30-day wait is over.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { Panel, Pill, type PillTone } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { errorMessage } from "@/services/candid";
import { isOpen, successionService, PROOF_KIND_LABELS, type SuccessionClaim } from "@/services/succession";
import { ClaimStatusLine, longDate } from "@/pages/SuccessorPage";

const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";
const para: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.9rem",
  lineHeight: 1.55,
  color: "var(--hg-ink)",
  margin: "0 0 0.6rem",
};
const button = (primary: boolean): React.CSSProperties => ({
  fontFamily: BODY,
  fontSize: "0.875rem",
  fontWeight: 600,
  padding: "0.5rem 1rem",
  borderRadius: 100,
  cursor: "pointer",
  border: primary ? "none" : "1px solid var(--hg-line-2)",
  background: primary ? "var(--hg-blue)" : "var(--hg-fill)",
  color: primary ? "#fff" : "var(--hg-ink)",
});

const TONE: Record<SuccessionClaim["status"]["tag"], PillTone> = {
  AwaitingReview: "info",
  Approved: "good",
  Rejected: "bad",
  Cancelled: "neutral",
  Completed: "good",
};
const TAG_LABEL: Record<SuccessionClaim["status"]["tag"], string> = {
  AwaitingReview: "In review",
  Approved: "Approved",
  Rejected: "Not approved",
  Cancelled: "Cancelled",
  Completed: "Complete",
};

export default function SuccessorClaimsPage() {
  const navigate = useNavigate();
  const [claims, setClaims] = useState<SuccessionClaim[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    successionService
      .getMyClaims()
      .then((c) => live && setClaims(c))
      .catch(() => live && setClaims([]));
    return () => {
      live = false;
    };
  }, []);

  const replace = (c: SuccessionClaim) => setClaims((all) => (all ?? []).map((x) => (x.id === c.id ? c : x)));

  const withdraw = async (c: SuccessionClaim) => {
    setBusy(c.id);
    try {
      replace(await successionService.cancelClaim(c.id));
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't withdraw the claim. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const complete = async (c: SuccessionClaim) => {
    setBusy(c.id);
    try {
      await successionService.completeClaim(c.id);
      toast.success("The home record is now yours");
      navigate(`/properties/${c.propertyId}`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't take over the record. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem 3rem", minHeight: SHELL_PAGE_MIN_HEIGHT }}>
        <h1
          style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--hg-ink)" }}
        >
          Successor claims
        </h1>
        <p style={{ ...para, color: "var(--hg-muted)", fontSize: "0.82rem", marginBottom: "1.25rem" }}>
          HomeGentic passes on a home's record only. It doesn't transfer the property or act in any estate or probate
          matter.
        </p>
        {claims === null && <p style={para}>Loading…</p>}
        {claims?.length === 0 && (
          <Panel>
            <p style={{ ...para, margin: 0 }}>You haven't sent any successor claims.</p>
          </Panel>
        )}
        {claims?.map((c) => {
          const due = Date.now() >= c.waitEndsAt;
          return (
            <Panel key={c.id} style={{ marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Pill tone={TONE[c.status.tag]}>{TAG_LABEL[c.status.tag]}</Pill>
                <span style={{ fontFamily: BODY, fontSize: "0.8rem", color: "var(--hg-muted)" }}>
                  Sent {longDate(c.openedAt)} · {PROOF_KIND_LABELS[c.proofKind]}
                </span>
              </div>
              <p style={para}>
                <ClaimStatusLine claim={c} />
              </p>
              {c.status.tag === "AwaitingReview" && (
                <p style={para}>
                  If it's approved, you can take over the record on or after {longDate(c.waitEndsAt)}. The owner and any
                  co-owners can cancel it until then.
                </p>
              )}
              {c.status.tag === "Approved" && !due && (
                <p style={para}>
                  You can take over the record on or after {longDate(c.waitEndsAt)}, unless the owner or a co-owner
                  cancels the claim first.
                </p>
              )}
              {c.status.tag === "Rejected" && (
                <p style={para}>You can send another claim from the same successor link.</p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.status.tag === "Approved" && due && (
                  <button style={button(true)} disabled={busy === c.id} onClick={() => complete(c)}>
                    Take over the record
                  </button>
                )}
                {isOpen(c) && (
                  <button style={button(false)} disabled={busy === c.id} onClick={() => withdraw(c)}>
                    Withdraw claim
                  </button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </Layout>
  );
}
