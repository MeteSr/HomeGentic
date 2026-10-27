/**
 * /verify-record — check a HomeGentic signed copy (public, no login).
 *
 * A signed copy is the file "Download signed copy" saves from a report or
 * score certificate: the exact JSON the report canister signed, the Ed25519
 * signature and the public key. This page checks the signature in the
 * browser, compares the key with the one the report canister publishes, and
 * shows what the signed statement says, read from the statement itself.
 */

import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Upload } from "lucide-react";
import { PageHead } from "@/components/PageHead";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import {
  attestationService, checkSignedCopy, parseSignedCopy, toHex,
  type AttestationKey, type CopyCheck,
} from "@/services/attestation";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { Main } from "@/components/MainLandmark";
import { formatCents } from "@/utils/format";

const C = V2_COLORS;
const F = V2_FONTS;

type Result = CopyCheck | { status: "error"; message: string };

const NODE_SNIPPET = `node -e '
const c = require("./signed-copy.json");
const { createPublicKey, verify } = require("crypto");
const key = createPublicKey({ format: "der", type: "spki",
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(c.publicKey, "hex")]) });
console.log(verify(null, Buffer.from(c.message), key, Buffer.from(c.signature, "hex")) ? "valid" : "INVALID");
'`;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ textAlign: "right", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

/** What the statement says, rendered from the signed JSON only. */
function Statement({ s }: { s: any }) {
  if (s?.type === "homegentic.report") {
    const jobs: any[] = Array.isArray(s.jobs) ? s.jobs : [];
    return (
      <div>
        <Row k="Record" v="Property report" />
        <Row k="Property" v={`${s.property?.address ?? ""}, ${s.property?.city ?? ""} ${s.property?.state ?? ""}`} />
        <Row k="Issued" v={new Date(Number(s.generatedAtMs)).toLocaleString()} />
        <Row k="HomeGentic Score" v={s.score ?? "Not computed"} />
        <Row k="Ownership verification" v={s.property?.verificationLevel ?? "—"} />
        <Row k="Jobs" v={`${s.totals?.jobs ?? jobs.length} (${s.totals?.verifiedJobs ?? 0} verified)`} />
        {s.totals?.amountCents !== undefined && <Row k="Documented spend" v={formatCents(Number(s.totals.amountCents))} />}
        <Row k="Hidden by the owner" v={Object.entries(s.hidden ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "Nothing"} />
        {jobs.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem", fontSize: "0.8125rem" }}>
            <caption style={{ textAlign: "left", color: C.muted, marginBottom: "0.5rem" }}>Jobs in the signed statement</caption>
            <thead>
              <tr>{["Date", "Service", "Verified", "Amount"].map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "0.375rem 0.25rem", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {jobs.map((j, i) => (
                <tr key={i}>
                  <td style={{ padding: "0.375rem 0.25rem" }}>{j.date}</td>
                  <td style={{ padding: "0.375rem 0.25rem" }}>{j.serviceType}{j.isDiy ? " (DIY)" : ""}</td>
                  <td style={{ padding: "0.375rem 0.25rem" }}>{j.verified ? "Yes" : "No"}</td>
                  <td style={{ padding: "0.375rem 0.25rem" }}>{j.amountCents !== undefined ? formatCents(Number(j.amountCents)) : "Hidden"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
  if (s?.type === "homegentic.scoreCertificate") {
    const c = s.certificate ?? {};
    return (
      <div>
        <Row k="Record" v="Score certificate" />
        <Row k="Property" v={`${c.address ?? ""}, ${c.city ?? ""} ${c.state ?? ""}`} />
        <Row k="Issued" v={c.issuedAt ? new Date(Number(c.issuedAt)).toLocaleString() : "—"} />
        <Row k="HomeGentic Score" v={c.score ?? "Not computed"} />
        <Row k="HomeGentic Certified" v={c.certified ? "Yes" : "No"} />
        <Row k="Verified jobs" v={c.verifiedJobCount ?? 0} />
        <Row k="Ownership verification" v={c.verificationLevel ?? "—"} />
      </div>
    );
  }
  return <p style={{ color: C.muted }}>The signature is valid, but this page doesn't know how to display this kind of record.</p>;
}

export default function VerifyRecordPage() {
  const [text, setText]       = useState("");
  const [result, setResult]   = useState<Result | null>(null);
  const [key, setKey]         = useState<AttestationKey | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    attestationService.getPublishedKey().then(setKey).catch(() => setKey(null));
  }, []);

  const check = async (raw: string) => {
    setChecking(true);
    try {
      const copy = parseSignedCopy(raw);
      setResult(await checkSignedCopy(copy, key));
    } catch (e) {
      setResult({ status: "error", message: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const raw = await f.text();
    setText(raw);
    await check(raw);
  };

  const card: React.CSSProperties = { background: C.paper, border: `1.5px solid ${C.border}`, borderRadius: 24, padding: "1.75rem", marginBottom: "1.5rem" };
  const mono: React.CSSProperties = { fontFamily: F.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", flexDirection: "column", fontFamily: F.body, color: C.ink }}>
      <PageHead>
        <title>Check a signed record | HomeGentic™</title>
        <meta name="description" content="Check that a HomeGentic report or score certificate is exactly what HomeGentic issued." />
      </PageHead>
      <PublicNav />
      <Main style={{ flex: 1, padding: "3rem 1rem", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "40rem" }}>
          <h1 style={{ fontFamily: F.display, fontWeight: 800, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, margin: "0 0 0.75rem" }}>
            Check a signed record
          </h1>
          <p style={{ color: C.muted, lineHeight: 1.7, margin: "0 0 2rem" }}>
            HomeGentic signs every report and score certificate when it's issued. Open a signed copy (the file
            from "Download signed copy" on a report or certificate) to check it hasn't been changed. The check
            runs in your browser.
          </p>

          <div style={card}>
            <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", border: `1px solid ${C.ink}`, borderRadius: 100, padding: "0.5rem 1rem", fontWeight: 600 }}>
              <Upload size={15} aria-hidden="true" /> Open a signed copy
              <input type="file" accept=".json,application/json" onChange={onFile} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} aria-label="Signed copy file" />
            </label>
            <p style={{ ...mono, margin: "1.25rem 0 0.5rem" }}>Or paste it</p>
            <textarea
              aria-label="Signed copy contents"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: F.mono, fontSize: "0.75rem", border: `1px solid ${C.border}`, borderRadius: 10, padding: "0.75rem" }}
            />
            <button
              type="button"
              disabled={!text.trim() || checking}
              onClick={() => check(text)}
              style={{ marginTop: "0.75rem", background: C.blue, color: "#fff", border: "none", borderRadius: 100, padding: "0.625rem 1.25rem", fontWeight: 600, cursor: "pointer", opacity: !text.trim() || checking ? 0.5 : 1 }}
            >
              {checking ? "Checking…" : "Check signature"}
            </button>
          </div>

          {result && (
            <div style={{ ...card, borderColor: result.status === "valid" ? C.blue : "#C94C2E" }} role="status" data-testid="verify-result">
              {result.status === "valid" ? (
                <>
                  <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "1.0625rem", margin: "0 0 0.5rem" }}>
                    <ShieldCheck size={20} color={C.blue} aria-hidden="true" /> Signature valid
                  </p>
                  <p style={{ color: C.muted, lineHeight: 1.6, margin: "0 0 1rem" }}>
                    {result.publishedKey
                      ? "Signed with HomeGentic's published key, and unchanged since it was signed."
                      : "The file hasn't been changed since it was signed, but its key doesn't match HomeGentic's current published key. It may have been signed with an older or test key; ask HomeGentic before relying on it."}
                    {" "}The signature shows what HomeGentic's record said; it isn't an inspection of the work.
                  </p>
                  <Statement s={result.statement} />
                </>
              ) : result.status === "invalid" ? (
                <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, margin: 0 }}>
                  <ShieldAlert size={20} color="#C94C2E" aria-hidden="true" /> The signature doesn't match. This copy was changed after it was signed, or wasn't signed by HomeGentic.
                </p>
              ) : (
                <p style={{ margin: 0 }}>{result.message}</p>
              )}
            </div>
          )}

          <div style={card}>
            <h2 style={{ fontFamily: F.display, fontSize: "1.125rem", margin: "0 0 0.5rem" }}>Check it without us</h2>
            <p style={{ color: C.muted, lineHeight: 1.6, margin: "0 0 0.75rem" }}>
              A signed copy is plain JSON: <code>message</code> is the exact text that was signed, <code>signature</code> is
              an Ed25519 signature over its UTF-8 bytes, and <code>publicKey</code> is the key. Any Ed25519 library can
              check it, for example with Node.js:
            </p>
            <pre style={{ fontFamily: F.mono, fontSize: "0.6875rem", background: "rgba(11,13,26,0.04)", borderRadius: 10, padding: "0.75rem", overflowX: "auto", margin: "0 0 1rem" }}>{NODE_SNIPPET}</pre>
            <p style={{ ...mono, margin: "0 0 0.375rem" }}>HomeGentic's current signing key (Ed25519, hex)</p>
            <p style={{ fontFamily: F.mono, fontSize: "0.75rem", wordBreak: "break-all", margin: 0 }} data-testid="published-key">
              {key ? `${toHex(key.publicKey)} (${key.keyName})` : "Not available right now."}
            </p>
            <p style={{ color: C.muted, lineHeight: 1.6, fontSize: "0.8125rem", margin: "0.75rem 0 0" }}>
              The key belongs to HomeGentic's report canister and is held by the Internet Computer's threshold
              signing service, so no single machine or person has the private key. HomeGentic controls the canister
              itself, so a signature shows a record came from HomeGentic unchanged, not that HomeGentic couldn't have
              issued it differently.
            </p>
          </div>
        </div>
      </Main>
      <PublicFooter />
    </div>
  );
}
