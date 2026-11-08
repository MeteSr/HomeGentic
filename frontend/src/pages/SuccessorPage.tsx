/**
 * Successor (#724): the person who can claim this home's record if the owner
 * dies or the home passes to a trust or heir.
 *
 * The owner names them and gets a successor link to hand over or keep with
 * their estate papers. A claim from the link needs a document a HomeGentic
 * admin reviews and a 30-day wait; the owner and co-owners are emailed and
 * can cancel it here until the record moves.
 *
 * Copy rule: HomeGentic passes on the record only. Nothing here says it
 * transfers the property or has any role in an estate.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { Panel, Pill } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { propertyService, type Property } from "@/services/property";
import { errorMessage } from "@/services/candid";
import {
  successionService,
  successorLink,
  PROOF_KIND_LABELS,
  WAIT_DAYS,
  type SuccessionClaim,
  type Successor,
  type SuccessorInput,
} from "@/services/succession";
import { useAuthStore } from "@/store/authStore";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";

const label: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--hg-muted)",
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.6rem 0.75rem",
  border: "1px solid var(--hg-line-2)",
  borderRadius: 10,
  fontFamily: BODY,
  fontSize: "0.9rem",
  background: "var(--hg-surface)",
  color: "var(--hg-ink)",
};
const button = (primary: boolean): React.CSSProperties => ({
  fontFamily: BODY,
  fontSize: "0.875rem",
  fontWeight: 600,
  padding: "0.55rem 1rem",
  borderRadius: 100,
  cursor: "pointer",
  border: primary ? "none" : "1px solid var(--hg-line-2)",
  background: primary ? "var(--hg-blue)" : "var(--hg-fill)",
  color: primary ? "#fff" : "var(--hg-ink)",
});
const para: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.9rem",
  color: "var(--hg-ink-2, var(--hg-ink))",
  lineHeight: 1.55,
  margin: "0 0 0.75rem",
};

export const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const EMPTY: SuccessorInput = { name: "", email: "", relationship: "" };

export function ClaimStatusLine({ claim }: { claim: SuccessionClaim }) {
  switch (claim.status.tag) {
    case "AwaitingReview":
      return <>Waiting for HomeGentic to review the document.</>;
    case "Approved":
      return <>HomeGentic approved the document.</>;
    case "Rejected":
      return <>Not approved: {claim.status.reason}</>;
    case "Cancelled":
      return <>Cancelled.</>;
    case "Completed":
      return <>Complete: the record moved.</>;
  }
}

export default function SuccessorPage() {
  const { id = "" } = useParams<{ id: string }>();
  const principal = useAuthStore((s) => s.principal);

  const [property, setProperty] = useState<Property | null>(null);
  const [successor, setSuccessor] = useState<Successor | null>(null);
  const [claim, setClaim] = useState<SuccessionClaim | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<SuccessorInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      propertyService.getProperty(id).catch(() => null),
      successionService.getSuccessor(id).catch(() => null),
      successionService.getOpenClaim(id).catch(() => null),
    ]).then(([p, s, c]) => {
      if (!live) return;
      setProperty(p);
      setSuccessor(s);
      if (s) setForm({ name: s.name, email: s.email, relationship: s.relationship });
      setClaim(c);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const isOwner = !!property && !!principal && String(property.owner) === principal;

  const save = async (values: SuccessorInput) => {
    setSaving(true);
    try {
      const s = await successionService.setSuccessor(id, values);
      setSuccessor(s);
      setForm({ name: s.name, email: s.email, relationship: s.relationship });
      toast.success(successor ? "New successor link made; the old one no longer works" : "Successor saved");
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save your successor. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    try {
      await successionService.removeSuccessor(id);
      setSuccessor(null);
      setForm(EMPTY);
      toast.success("Successor removed; the link no longer works");
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't remove your successor. Please try again."));
    }
  };

  const cancel = async () => {
    if (!claim) return;
    setConfirmCancel(false);
    try {
      await successionService.cancelClaim(claim.id);
      setClaim(null);
      toast.success("Claim cancelled");
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't cancel the claim. Please try again."));
    }
  };

  const copy = async () => {
    if (!successor) return;
    try {
      await navigator.clipboard.writeText(successorLink(successor.token));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy; select the link and copy it");
    }
  };

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem 3rem", minHeight: SHELL_PAGE_MIN_HEIGHT }}>
        <Link
          to={`/properties/${id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: BODY,
            fontSize: "0.85rem",
            color: "var(--hg-muted)",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> Back to the home
        </Link>
        <p style={{ ...label, margin: "1.25rem 0 0.25rem" }}>{property ? property.address : "Home record"}</p>
        <h1
          style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 700, margin: "0 0 1rem", color: "var(--hg-ink)" }}
        >
          Successor
        </h1>

        <Panel style={{ marginBottom: "1rem" }}>
          <p style={para}>
            Name the person who can ask for this home's record if you die or the home passes to a trust or heir. They
            get a successor link from you. To use it they send HomeGentic a death certificate, letters of administration
            or testamentary, or trust papers. A HomeGentic admin reviews the document, and the record can't move until a{" "}
            {WAIT_DAYS}-day wait from the claim is over. You and any co-owners are emailed when a claim is opened and
            can cancel it here at any point before it moves.
          </p>
          <p style={{ ...para, margin: 0, color: "var(--hg-muted)", fontSize: "0.82rem" }}>
            HomeGentic passes on the home's record only. It doesn't transfer the property or act in any estate or
            probate matter.
          </p>
        </Panel>

        {claim && (
          <Panel style={{ marginBottom: "1rem", borderColor: "var(--hg-yel-edge)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Pill tone="warn">Claim open</Pill>
              <h2 style={{ fontFamily: SERIF, fontSize: "1.15rem", margin: 0, color: "var(--hg-ink)" }}>
                A successor claim is open
              </h2>
            </div>
            <p style={para}>
              {claim.claimantName} sent a {PROOF_KIND_LABELS[claim.proofKind].toLowerCase()} on{" "}
              {longDate(claim.openedAt)}. <ClaimStatusLine claim={claim} />
            </p>
            <p style={para}>
              The record can move to them on or after <strong>{longDate(claim.waitEndsAt)}</strong>
              {claim.status.tag === "Approved" ? "" : ", if HomeGentic approves the document"}. If you didn't expect
              this, cancel it.
            </p>
            {confirmCancel ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: BODY, fontSize: "0.85rem" }}>
                  Cancel this claim? Its document is deleted.
                </span>
                <button style={button(true)} onClick={cancel}>
                  Yes, cancel it
                </button>
                <button style={button(false)} onClick={() => setConfirmCancel(false)}>
                  Keep it
                </button>
              </div>
            ) : (
              <button style={button(true)} onClick={() => setConfirmCancel(true)}>
                Cancel claim
              </button>
            )}
          </Panel>
        )}

        {loaded && !isOwner && (
          <Panel>
            <p style={{ ...para, margin: 0 }}>Only the owner can name a successor for this home.</p>
          </Panel>
        )}

        {loaded && isOwner && (
          <Panel>
            <h2 style={{ fontFamily: SERIF, fontSize: "1.15rem", margin: "0 0 0.75rem", color: "var(--hg-ink)" }}>
              {successor ? "Your successor" : "Name your successor"}
            </h2>
            <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={label}>Name</span>
                <input
                  style={input}
                  value={form.name}
                  disabled={!!claim}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={label}>Email</span>
                <input
                  style={input}
                  type="email"
                  value={form.email}
                  disabled={!!claim}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={label}>Relationship (optional)</span>
                <input
                  style={input}
                  placeholder="Daughter, trustee"
                  value={form.relationship}
                  disabled={!!claim}
                  onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                />
              </label>
            </div>
            <p style={{ ...para, fontSize: "0.82rem", color: "var(--hg-muted)" }}>
              HomeGentic doesn't email your successor. The email address is for HomeGentic's reviewer to check against
              the claim.
            </p>
            {!claim && (
              <button style={button(true)} disabled={saving} onClick={() => save(form)}>
                {saving ? "Saving…" : "Save successor"}
              </button>
            )}

            {successor && (
              <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--hg-line)", paddingTop: "1rem" }}>
                <span style={label}>Successor link</span>
                <div style={{ display: "flex", gap: 8, margin: "0.4rem 0 0.6rem" }}>
                  <input
                    style={{ ...input, fontFamily: MONO, fontSize: "0.75rem" }}
                    readOnly
                    value={successorLink(successor.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Successor link"
                  />
                  <button style={button(false)} onClick={copy} aria-label="Copy link">
                    <Copy size={14} />
                  </button>
                </div>
                <p style={{ ...para, fontSize: "0.82rem" }}>
                  Give this link to {successor.name}, or keep it with your will or estate papers. Anyone who has it can
                  open a claim, so keep it somewhere safe. A claim still needs the document review and the {WAIT_DAYS}
                  -day wait.
                </p>
                {!claim && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={button(false)} disabled={saving} onClick={() => save(form)}>
                      Make a new link
                    </button>
                    {confirmRemove ? (
                      <>
                        <button style={button(true)} onClick={remove}>
                          Yes, remove
                        </button>
                        <button style={button(false)} onClick={() => setConfirmRemove(false)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button style={button(false)} onClick={() => setConfirmRemove(true)}>
                        Remove successor
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}
      </div>
    </Layout>
  );
}
