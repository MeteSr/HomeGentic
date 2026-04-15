/**
 * ContractorVerifyPage — /verify/:token
 *
 * Public page (no auth required). A contractor arrives here by scanning the
 * homeowner's QR code or clicking the invite link.
 *
 * Flow:
 *   1. Fetch job preview from the invite token (public canister query).
 *   2. Show job details so the contractor recognises the work.
 *   3. "Confirm & Sign" redeems the token and sets contractorSigned = true.
 *   4. Success state nudges toward free account creation.
 */

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { jobService, type InvitePreview } from "@/services/job";

const UI = {
  ink:   COLORS.plum,
  muted: COLORS.plumMid,
  rule:  COLORS.rule,
  sage:  COLORS.sage,
  serif: FONTS.serif,
  sans:  FONTS.sans,
  mono:  FONTS.mono,
};

type Stage = "loading" | "preview" | "signing" | "success" | "error";

function formatAmount(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function timeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "Expired";
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hrs > 0) return `Expires in ${hrs}h ${mins}m`;
  return `Expires in ${mins}m`;
}

export default function ContractorVerifyPage() {
  const { token } = useParams<{ token: string }>();

  const [stage,   setStage]   = useState<Stage>("loading");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Invalid link."); setStage("error"); return; }
    jobService.getJobByInviteToken(token)
      .then((p) => { setPreview(p); setStage("preview"); })
      .catch((e: Error) => { setError(e.message); setStage("error"); });
  }, [token]);

  async function handleSign() {
    if (!token) return;
    setStage("signing");
    try {
      await jobService.redeemInviteToken(token);
      setStage("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage("error");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.white,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      fontFamily: UI.sans,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.5rem", color: UI.ink }}>
            Home<span style={{ color: UI.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </span>
        </Link>
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.muted, marginTop: "0.25rem" }}>
          Verified Home History · Internet Computer
        </p>
      </div>

      <div style={{
        width: "100%", maxWidth: 440,
        background: COLORS.white,
        borderRadius: RADIUS.card,
        boxShadow: SHADOWS.card,
        border: `1px solid ${UI.rule}`,
        padding: "2rem",
      }}>

        {/* ── Loading ─────────────────────────────────────────────────────────── */}
        {stage === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "2rem 0" }}>
            <Loader2 size={28} color={UI.sage} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ color: UI.muted, fontSize: "0.875rem" }}>Loading job details…</p>
          </div>
        )}

        {/* ── Preview ─────────────────────────────────────────────────────────── */}
        {(stage === "preview" || stage === "signing") && preview && (
          <>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.375rem", color: UI.ink, marginBottom: "0.25rem" }}>
              Confirm your work
            </h1>
            <p style={{ fontSize: "0.85rem", color: UI.muted, marginBottom: "1.5rem" }}>
              Review the job details below and tap <strong>Confirm & Sign</strong> to add your signature to the verified record.
            </p>

            {/* Job details */}
            <div style={{
              border: `1px solid ${UI.rule}`,
              borderRadius: RADIUS.sm,
              overflow: "hidden",
              marginBottom: "1.5rem",
            }}>
              {[
                { label: "Property",    value: preview.propertyAddress },
                { label: "Service",     value: preview.serviceType },
                { label: "Description", value: preview.description },
                { label: "Amount",      value: formatAmount(preview.amount) },
                { label: "Date",        value: formatDate(preview.completedDate) },
                ...(preview.contractorName ? [{ label: "Contractor", value: preview.contractorName }] : []),
              ].map(({ label, value }, i) => (
                <div key={label} style={{
                  display: "flex", gap: "1rem",
                  padding: "0.625rem 1rem",
                  background: i % 2 === 0 ? COLORS.sageLight : COLORS.white,
                  borderBottom: i < 5 ? `1px solid ${UI.rule}` : "none",
                }}>
                  <span style={{
                    fontFamily: UI.mono, fontSize: "0.62rem", letterSpacing: "0.08em",
                    textTransform: "uppercase", color: UI.muted,
                    width: "5.5rem", flexShrink: 0, paddingTop: "0.15rem",
                  }}>
                    {label}
                  </span>
                  <span style={{ fontSize: "0.85rem", color: UI.ink }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Already signed */}
            {preview.alreadySigned ? (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "1rem", background: COLORS.sageLight,
                borderRadius: RADIUS.sm, border: `1px solid ${COLORS.sageMid}`,
              }}>
                <CheckCircle size={20} color={UI.sage} />
                <p style={{ fontSize: "0.875rem", color: UI.ink }}>
                  You've already signed this job.
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={() => void handleSign()}
                  disabled={stage === "signing"}
                  style={{
                    width: "100%",
                    padding: "0.875rem",
                    background: UI.ink,
                    color: "#fff",
                    border: "none",
                    borderRadius: RADIUS.pill,
                    fontFamily: UI.mono,
                    fontSize: "0.8rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: stage === "signing" ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    opacity: stage === "signing" ? 0.7 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {stage === "signing"
                    ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Signing…</>
                    : "Confirm & Sign →"}
                </button>
                <p style={{ textAlign: "center", fontSize: "0.7rem", color: UI.muted, marginTop: "0.75rem" }}>
                  {timeLeft(preview.expiresAt)} · single use
                </p>
              </>
            )}
          </>
        )}

        {/* ── Success ──────────────────────────────────────────────────────────── */}
        {stage === "success" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 64, height: 64,
              background: COLORS.sageLight,
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}>
              <CheckCircle size={32} color={UI.sage} />
            </div>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.375rem", color: UI.ink, marginBottom: "0.5rem" }}>
              Signature recorded
            </h1>
            <p style={{ fontSize: "0.875rem", color: UI.muted, marginBottom: "1.75rem", lineHeight: 1.6 }}>
              Your signature has been added to the immutable job record on the
              Internet Computer blockchain. The homeowner can share a verified
              report with buyers, insurers, and inspectors.
            </p>

            {/* Upsell — soft, no pressure */}
            <div style={{
              border: `1px solid ${UI.rule}`,
              borderRadius: RADIUS.sm,
              padding: "1.25rem",
              marginBottom: "1.25rem",
              textAlign: "left",
            }}>
              <p style={{ fontFamily: UI.mono, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.sage, marginBottom: "0.5rem" }}>
                Build your verified portfolio
              </p>
              <p style={{ fontSize: "0.8rem", color: UI.ink, marginBottom: "0.875rem", lineHeight: 1.6 }}>
                Create a free HomeGentic account to collect all your verified jobs in one place — a portfolio you can show future clients.
              </p>
              <Link
                to="/register?role=Contractor"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.625rem 1.25rem",
                  background: UI.ink, color: "#fff",
                  borderRadius: RADIUS.pill,
                  textDecoration: "none",
                  fontFamily: UI.mono, fontSize: "0.72rem",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}
              >
                Create free account <ExternalLink size={12} />
              </Link>
            </div>
            <p style={{ fontSize: "0.75rem", color: UI.muted }}>
              No credit card required · free forever for service providers
            </p>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────────── */}
        {stage === "error" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 64, height: 64,
              background: "#FEF2F2",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}>
              <AlertTriangle size={32} color="#C94C2E" />
            </div>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.25rem", color: UI.ink, marginBottom: "0.5rem" }}>
              Link unavailable
            </h1>
            <p style={{ fontSize: "0.875rem", color: UI.muted, marginBottom: "0.5rem" }}>
              {error ?? "This invite link is invalid, expired, or has already been used."}
            </p>
            <p style={{ fontSize: "0.8rem", color: UI.muted }}>
              Ask the homeowner to generate a new invite link.
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
