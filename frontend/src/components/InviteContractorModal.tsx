/**
 * InviteContractorModal
 *
 * Shown after a homeowner creates a contractor job and wants the provider
 * to co-sign without needing a HomeGentic account first.
 *
 * Generates a single-use invite token via the job canister, then shows:
 *   - QR code pointing to /verify/:token
 *   - Copy-link button
 *   - Send-via-email field
 *
 * The contractor scans or clicks → ContractorVerifyPage → one-tap sign.
 */

import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, Mail, Loader2 } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { jobService } from "@/services/job";
import type { Job } from "@/services/job";

interface Props {
  job:             Job;
  propertyAddress: string;
  onClose:         () => void;
}

const S = {
  ink:   COLORS.plum,
  muted: COLORS.plumMid,
  rule:  COLORS.rule,
  sage:  COLORS.sage,
  serif: FONTS.serif,
  mono:  FONTS.mono,
  sans:  FONTS.sans,
};

export function InviteContractorModal({ job, propertyAddress, onClose }: Props) {
  const [token,    setToken]    = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [copied,   setCopied]   = useState(false);
  const [email,    setEmail]    = useState("");
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);

  const verifyUrl = token
    ? `${window.location.origin}/verify/${token}`
    : null;

  // Generate token on mount
  useEffect(() => {
    jobService.createInviteToken(job.id, propertyAddress)
      .then(setToken)
      .catch((e: Error) => setError(e.message));
  }, [job.id, propertyAddress]);

  async function handleCopy() {
    if (!verifyUrl) return;
    await navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleEmail() {
    if (!verifyUrl || !email.includes("@")) return;
    setSending(true);
    try {
      const VOICE_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";
      await fetch(`${VOICE_URL}/api/invite/send-email`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to:              email,
          contractorName:  job.contractorName,
          propertyAddress,
          serviceType:     job.serviceType,
          amount:          job.amount,
          verifyUrl,
        }),
      });
      setSent(true);
    } catch {
      // Non-fatal — link still works
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Invite contractor to verify job"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(46,37,64,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div style={{
        background: COLORS.white,
        borderRadius: RADIUS.card,
        boxShadow: SHADOWS.modal,
        width: "100%", maxWidth: 460,
        padding: "2rem",
        position: "relative",
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: "1rem", right: "1rem",
            background: "none", border: "none", cursor: "pointer",
            color: S.muted, padding: "0.25rem",
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink, marginBottom: "0.25rem" }}>
          Invite{job.contractorName ? ` ${job.contractorName}` : " Contractor"}
        </h2>
        <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.muted, marginBottom: "1.5rem" }}>
          Share this link so they can confirm and sign the job record — no account needed.
        </p>

        {/* Job summary */}
        <div style={{
          background: COLORS.sageLight, borderRadius: RADIUS.sm,
          padding: "0.75rem 1rem", marginBottom: "1.5rem",
          fontSize: "0.8rem", fontFamily: S.sans, color: S.ink,
        }}>
          <strong>{job.serviceType}</strong> · ${(job.amount / 100).toLocaleString()} · {propertyAddress}
        </div>

        {/* Loading / Error */}
        {!token && !error && (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <Loader2 size={24} color={S.sage} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {error && (
          <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: "#C94C2E", textAlign: "center" }}>{error}</p>
        )}

        {token && verifyUrl && (
          <>
            {/* QR code */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
              <div style={{ padding: "1rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.sm, background: "#fff" }}>
                <QRCodeSVG
                  value={verifyUrl}
                  size={180}
                  fgColor={COLORS.plum}
                  bgColor="#ffffff"
                  level="M"
                />
              </div>
            </div>

            {/* Copy link */}
            <div style={{
              display: "flex", gap: "0.5rem", marginBottom: "1rem",
            }}>
              <input
                readOnly
                value={verifyUrl}
                style={{
                  flex: 1, padding: "0.5rem 0.75rem",
                  fontFamily: S.mono, fontSize: "0.7rem", color: S.muted,
                  border: `1px solid ${S.rule}`, borderRadius: RADIUS.input,
                  background: COLORS.sageLight, outline: "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              />
              <button
                onClick={handleCopy}
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.5rem 1rem",
                  background: copied ? COLORS.sage : COLORS.plum,
                  color: "#fff", border: "none",
                  borderRadius: RADIUS.input, cursor: "pointer",
                  fontFamily: S.mono, fontSize: "0.7rem",
                  transition: "background 0.2s",
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            {/* Send via email */}
            <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "1rem" }}>
              <p style={{ fontFamily: S.sans, fontSize: "0.75rem", color: S.muted, marginBottom: "0.5rem" }}>
                Or send by email:
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="email"
                  placeholder="contractor@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleEmail(); }}
                  style={{
                    flex: 1, padding: "0.5rem 0.75rem",
                    fontFamily: S.sans, fontSize: "0.8rem",
                    border: `1px solid ${S.rule}`, borderRadius: RADIUS.input,
                    background: COLORS.white, outline: "none",
                  }}
                />
                <button
                  onClick={() => void handleEmail()}
                  disabled={sending || sent || !email.includes("@")}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.375rem",
                    padding: "0.5rem 1rem",
                    background: sent ? COLORS.sage : COLORS.plum,
                    color: "#fff", border: "none",
                    borderRadius: RADIUS.input,
                    cursor: sending || sent || !email.includes("@") ? "not-allowed" : "pointer",
                    fontFamily: S.mono, fontSize: "0.7rem",
                    opacity: !email.includes("@") ? 0.5 : 1,
                    transition: "background 0.2s",
                  }}
                >
                  {sending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Mail size={13} />}
                  {sent ? "Sent" : "Send"}
                </button>
              </div>
            </div>

            {/* Expiry note */}
            <p style={{ fontFamily: S.sans, fontSize: "0.7rem", color: S.muted, textAlign: "center", marginTop: "1rem" }}>
              Link expires in 48 hours · single use
            </p>
          </>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
