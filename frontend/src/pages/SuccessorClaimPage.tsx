/**
 * SuccessorClaimPage — /successor/:token (#724)
 *
 * Someone the owner gave a successor link to asks for the home's record if
 * the owner has died or the home has passed to a trust or heir. They send a
 * proof document; a HomeGentic admin reviews it, the owner and co-owners are
 * emailed and can cancel, and the record can't move before the 30-day wait
 * is over. Status and the final step live on /successor-claims.
 *
 * Public: the link is the credential for reading what it shows; sending a
 * claim needs a signed-in account.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { errorMessage } from "@/services/candid";
import {
  checkProofFile,
  successionService,
  PROOF_KIND_LABELS,
  type ProofKind,
  type SuccessionInvite,
} from "@/services/succession";

const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const label: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--hg-muted, #6B6B6B)",
};
const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.6rem 0.75rem",
  border: "1px solid var(--hg-line-2, #D8D8D8)",
  borderRadius: 10,
  fontFamily: BODY,
  fontSize: "0.9rem",
  background: "#fff",
  color: "#0B0D1A",
};
const para: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.9rem",
  lineHeight: 1.55,
  color: "#0B0D1A",
  margin: "0 0 0.75rem",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAF7",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "3rem 1rem",
      }}
    >
      <Link
        to="/"
        style={{
          textDecoration: "none",
          marginBottom: "2rem",
          fontFamily: SERIF,
          fontWeight: 800,
          fontSize: "1.35rem",
          color: "#0B0D1A",
        }}
      >
        HomeGentic
      </Link>
      <div
        style={{
          width: "100%",
          maxWidth: "32rem",
          background: "#fff",
          border: "1px solid #E4E4E0",
          borderRadius: 16,
          padding: "1.5rem",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function SuccessorClaimPage() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();

  const [invite, setInvite] = useState<SuccessionInvite | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProofKind>("DeathCertificate");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    successionService
      .getInvite(token)
      .then((i) => live && setInvite(i))
      .catch(() => live && setInvite(null));
    return () => {
      live = false;
    };
  }, [token]);

  const pick = (f: File | null) => {
    setFile(f);
    setFileError(f ? checkProofFile(f) : null);
  };

  const send = async () => {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      await successionService.openClaim(token, { claimantName: name.trim(), proofKind: kind, note: note.trim() }, file);
      navigate("/successor-claims");
    } catch (e) {
      setError(errorMessage(e, "We couldn't send your claim. Please try again."));
    } finally {
      setSending(false);
    }
  };

  if (invite === undefined || isLoading) {
    return (
      <Shell>
        <p style={para}>Loading…</p>
      </Shell>
    );
  }
  if (invite === null) {
    return (
      <Shell>
        <h1 style={{ fontFamily: SERIF, fontSize: "1.5rem", margin: "0 0 0.75rem" }}>
          This successor link isn't valid
        </h1>
        <p style={para}>
          The owner may have made a new link or removed their successor. Ask whoever gave it to you for the current one.
        </p>
      </Shell>
    );
  }

  const ready = !!file && !fileError && name.trim().length > 0 && !sending;

  return (
    <Shell>
      <p style={{ ...label, margin: "0 0 0.25rem" }}>Successor claim</p>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.5rem", margin: "0 0 0.75rem" }}>
        {invite.address}, {invite.city}, {invite.state} {invite.zipCode}
      </h1>
      <p style={para}>
        The owner of this home named <strong>{invite.successorName}</strong> as the person who can ask for its
        HomeGentic record if the owner dies or the home passes to a trust or heir.
      </p>
      <p style={para}>
        To ask, send one of the documents below. A HomeGentic admin reviews it, and the owner and any co-owners are
        emailed and can cancel the claim. If it's approved, you can take over the record once {invite.waitDays} days
        have passed since you sent it.
      </p>
      <p style={{ ...para, fontSize: "0.82rem", color: "#6B6B6B" }}>
        HomeGentic passes on the home's record only. It doesn't transfer the property or act in any estate or probate
        matter.
      </p>

      {!isAuthenticated ? (
        <>
          <p style={para}>Sign in or create a free account to send a claim. The link still works after you sign in.</p>
          <Link
            to={`/login?redirect=${encodeURIComponent(`/successor/${token}`)}`}
            style={{
              display: "inline-block",
              fontFamily: BODY,
              fontWeight: 600,
              padding: "0.6rem 1.1rem",
              borderRadius: 100,
              background: "#2B34FF",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Sign in to continue
          </Link>
        </>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.5rem" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Your full name</span>
            <input style={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Document type</span>
            <select style={field} value={kind} onChange={(e) => setKind(e.target.value as ProofKind)}>
              {(Object.keys(PROOF_KIND_LABELS) as ProofKind[]).map((k) => (
                <option key={k} value={k}>
                  {PROOF_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Document</span>
            <input
              type="file"
              aria-label="Document"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <span style={{ fontFamily: BODY, fontSize: "0.78rem", color: "#6B6B6B" }}>
              PDF, JPEG or PNG, up to 1.8 MB. It's deleted once the claim is decided.
            </span>
          </label>
          {fileError && (
            <p role="alert" style={{ ...para, color: "#C2410C", margin: 0 }}>
              {fileError}
            </p>
          )}
          <label style={{ display: "grid", gap: 4 }}>
            <span style={label}>Note for the reviewer (optional)</span>
            <textarea
              style={{ ...field, minHeight: 80 }}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" style={{ ...para, color: "#C2410C", margin: 0 }}>
              {error}
            </p>
          )}
          <button
            onClick={send}
            disabled={!ready}
            style={{
              fontFamily: BODY,
              fontWeight: 600,
              padding: "0.65rem 1.1rem",
              borderRadius: 100,
              border: "none",
              background: "#2B34FF",
              color: "#fff",
              cursor: ready ? "pointer" : "not-allowed",
              opacity: ready ? 1 : 0.5,
            }}
          >
            {sending ? "Sending…" : "Send claim"}
          </button>
        </div>
      )}
    </Shell>
  );
}
