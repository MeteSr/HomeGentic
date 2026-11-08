/**
 * Admin: successor claims waiting for review (#724). The reviewer opens the
 * claimant's document (death certificate, letters of administration or
 * testamentary, or trust papers), checks it against the home and the
 * successor the owner named, and approves it or rejects it with a reason the
 * claimant reads. Approval doesn't move the record: the claimant finishes it
 * after the 30-day wait, and the household can still cancel until then.
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { errorMessage } from "@/services/candid";
import { successionService, PROOF_KIND_LABELS, type SuccessionReview } from "@/services/succession";
import { V2_COLORS, V2_FONTS } from "@/theme";

const mono = V2_FONTS.mono;
const small: React.CSSProperties = {
  fontFamily: mono,
  fontSize: "0.65rem",
  letterSpacing: "0.04em",
  color: V2_COLORS.muted,
  margin: "0 0 0.35rem",
};
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding: "0.4rem 0.9rem",
  border: `1px solid ${primary ? V2_COLORS.blue : V2_COLORS.border}`,
  background: primary ? V2_COLORS.blue : V2_COLORS.paper,
  color: primary ? "#fff" : V2_COLORS.ink,
  fontFamily: mono,
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ReviewCard({ row, onDone }: { row: SuccessionReview; onDone: (id: string) => void }) {
  const { claim, address, successor } = row;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const open = async () => {
    try {
      const { blob } = await successionService.getProof(claim.id);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't open the document"));
    }
  };

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await successionService.review(claim.id, approve, approve ? "" : reason.trim());
      toast.success(approve ? "Claim approved" : "Claim rejected");
      onDone(claim.id);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't record the decision"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper, padding: "1rem 1.25rem" }}>
      <p style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1rem", margin: "0 0 0.5rem" }}>{address}</p>
      <p style={small}>
        Claimant: {claim.claimantName} · sent {day(claim.openedAt)} · wait ends {day(claim.waitEndsAt)}
      </p>
      <p style={small}>
        Document: {PROOF_KIND_LABELS[claim.proofKind]} ({claim.fileName}, {Math.ceil(claim.proofSize / 1024)} KB)
      </p>
      <p style={small}>
        Owner named:{" "}
        {successor
          ? `${successor.name} · ${successor.email}${successor.relationship ? ` · ${successor.relationship}` : ""}`
          : "nobody (removed)"}
      </p>
      {claim.note && <p style={{ ...small, color: V2_COLORS.ink }}>Note: {claim.note}</p>}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <button style={btn(false)} onClick={open}>
          Open document
        </button>
        <button style={btn(true, busy)} disabled={busy} onClick={() => decide(true)}>
          Approve
        </button>
        <input
          aria-label="Reason (sent to the claimant)"
          placeholder="Reason, if rejecting (the claimant reads it)"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            padding: "0.4rem 0.6rem",
            border: `1px solid ${V2_COLORS.border}`,
            fontFamily: V2_FONTS.body,
            fontSize: "0.8rem",
          }}
        />
        <button
          style={btn(false, busy || !reason.trim())}
          disabled={busy || !reason.trim()}
          onClick={() => decide(false)}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function SuccessionReviewTab() {
  const [rows, setRows] = useState<SuccessionReview[] | null>(null);

  useEffect(() => {
    successionService
      .listForReview()
      .then(setRows)
      .catch((e) => {
        toast.error(errorMessage(e, "Couldn't load successor claims"));
        setRows([]);
      });
  }, []);

  return (
    <div>
      <p style={{ ...small, marginBottom: "1rem" }}>
        Successor claims on home records. Approve only when the document is genuine and shows this person may take over
        the owner's affairs or the home (death certificate with matching name, letters, or trust papers naming them).
        Approving doesn't move the record: it moves only when the claimant finishes after the 30-day wait, and the
        household can still cancel until then.
      </p>
      {rows === null ? (
        <div className="spinner-lg" />
      ) : rows.length === 0 ? (
        <p style={small}>No successor claims waiting for review.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {rows.map((r) => (
            <ReviewCard
              key={r.claim.id}
              row={r}
              onDone={(id) => setRows((all) => (all ?? []).filter((x) => x.claim.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
