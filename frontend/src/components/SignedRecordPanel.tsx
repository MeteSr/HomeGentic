/**
 * "Signed by HomeGentic" panel for a report or score certificate.
 *
 * Fetches the canister's signed statement, checks the Ed25519 signature in
 * this browser, and offers the signed copy as a download that anyone can
 * check on /verify-record. Says plainly when there is no signature.
 */
import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Download } from "lucide-react";
import {
  attestationService, toSignedCopy, toHex, verifySignature,
  type Attestation, type AttestationKey,
} from "@/services/attestation";
import { V2_COLORS, V2_FONTS } from "@/theme";

type State =
  | { kind: "loading" }
  | { kind: "unsigned" }
  | { kind: "valid"; att: Attestation; publishedKey: boolean }
  | { kind: "invalid" };

interface Props {
  load:     () => Promise<Attestation | null>;
  /** "report" or "certificate", used in the copy. */
  noun:     string;
  filename: string;
}

export function SignedRecordPanel({ load, noun, filename }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const att = await load();
        if (!att) { if (live) setState({ kind: "unsigned" }); return; }
        const ok = await verifySignature(att.message, att.signature, att.publicKey);
        let key: AttestationKey | null = null;
        try { key = await attestationService.getPublishedKey(); } catch { /* shown as unconfirmed */ }
        if (!live) return;
        setState(ok
          ? { kind: "valid", att, publishedKey: !!key && toHex(key.publicKey) === toHex(att.publicKey) }
          : { kind: "invalid" });
      } catch {
        if (live) setState({ kind: "unsigned" });
      }
    })();
    return () => { live = false; };
  }, [load]);

  const download = (att: Attestation) => {
    const blob = new Blob([JSON.stringify(toSignedCopy(att), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const box: React.CSSProperties = {
    border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "1rem 1.25rem",
    display: "flex", gap: "0.875rem", alignItems: "flex-start", margin: "0 0 2rem",
    fontFamily: V2_FONTS.body, color: V2_COLORS.ink, background: V2_COLORS.paper,
  };
  const small: React.CSSProperties = { fontSize: "0.8rem", lineHeight: 1.55, color: V2_COLORS.muted, margin: "0.25rem 0 0" };

  if (state.kind === "loading") return null;

  if (state.kind === "unsigned") {
    return (
      <section aria-label="Signature" style={box} data-testid="signed-record-panel">
        <ShieldAlert size={20} color={V2_COLORS.muted} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <div>
          <p style={{ fontWeight: 700, margin: 0 }}>This {noun} isn't signed</p>
          <p style={small}>
            HomeGentic signs each {noun} when it's created. This one has no signature (it may predate signing, or
            signing was unavailable), so there's nothing to check it against.
          </p>
        </div>
      </section>
    );
  }

  if (state.kind === "invalid") {
    return (
      <section aria-label="Signature" style={{ ...box, borderColor: "#C94C2E" }} data-testid="signed-record-panel" role="alert">
        <ShieldAlert size={20} color="#C94C2E" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <div>
          <p style={{ fontWeight: 700, margin: 0 }}>The signature on this {noun} doesn't check out</p>
          <p style={small}>Don't rely on this {noun}. Ask the homeowner for a fresh link.</p>
        </div>
      </section>
    );
  }

  const { att, publishedKey } = state;
  return (
    <section aria-label="Signature" style={box} data-testid="signed-record-panel">
      <ShieldCheck size={20} color={V2_COLORS.blue} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 700, margin: 0 }}>Signed by HomeGentic on {new Date(att.signedAt).toLocaleDateString()}</p>
        <p style={small}>
          This browser checked the signature: the {noun} below is exactly what HomeGentic's report canister issued,
          unchanged since.{" "}
          {publishedKey
            ? "It was signed with HomeGentic's published key."
            : "We couldn't confirm the signing key against HomeGentic's published key right now."}{" "}
          The signature covers what the record says, not an inspection of the work.
        </p>
        <p className="no-print" style={{ ...small, display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.625rem" }}>
          <button
            type="button"
            onClick={() => download(att)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${V2_COLORS.ink}`, borderRadius: 100, padding: "0.375rem 0.875rem", font: "inherit", fontSize: "0.75rem", color: V2_COLORS.ink, cursor: "pointer" }}
          >
            <Download size={13} aria-hidden="true" /> Download signed copy
          </button>
          <a href="/verify-record" style={{ color: V2_COLORS.blue, fontSize: "0.75rem", alignSelf: "center" }}>
            Check a signed copy yourself
          </a>
        </p>
      </div>
    </section>
  );
}
