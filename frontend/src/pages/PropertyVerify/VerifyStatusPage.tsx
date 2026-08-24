import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";
import { VerificationTimeline } from "./components/VerificationTimeline";
import { OnChainReceipt } from "./components/OnChainReceipt";

export default function VerifyStatusPage() {
  const navigate     = useNavigate();
  const { id }       = useParams<{ id: string }>();
  const { claim }    = useVerifyContext();

  const conflictEnds = claim.conflictWindowEndsAt
    ? new Date(claim.conflictWindowEndsAt)
    : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((conflictEnds.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  const steps = [
    { label: "Property added",         detail: "Claim opened and timestamped on-chain",                       status: "done"     as const, date: new Date(claim.claimStartedAt).toLocaleDateString() },
    { label: "Identity verified",      detail: claim.identityVerified ? `Cleared via Stripe Identity` : "Awaiting Stripe confirmation", status: claim.identityVerified ? "done" as const : "pending" as const },
    { label: "Document hashed",        detail: claim.verificationDocHash ? "SHA-256 recorded on-chain" : "Upload pending",             status: claim.verificationDocHash ? "done" as const : "pending" as const },
    { label: "Reviewer approval",      detail: "Typically 1–2 business days",                                status: "expected" as const },
  ];

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>
          {/* Main column */}
          <div>
            <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 32, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.15 }}>
              Filed, hashed and waiting on a reviewer.
            </h1>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: 14, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
              Both proofs are in. A HomeGentic reviewer will check the document and approve or request a correction within 1–2 business days.
            </p>

            {/* Status card */}
            <div style={{ background: V2_COLORS.vbadge, border: `1px solid #C7CAF5`, borderRadius: 12, padding: "16px 20px", marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 28 }}>🕐</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 15, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink }}>Both proofs are in</span>
                  <span style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: "#3949AB", background: "#E8EAF6", padding: "3px 8px", borderRadius: 6, letterSpacing: "0.06em" }}>PENDING REVIEW</span>
                </div>
                <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>Identity + {claim.verificationMethod ?? "document"} submitted</div>
              </div>
            </div>

            {claim.identityVerified && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, padding: "12px 16px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10 }}>
                <span style={{ color: "#16A34A", fontSize: 16 }}>✓</span>
                <div>
                  <span style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink }}>Identity verified</span>
                  {claim.identityVerifiedAt && (
                    <span style={{ fontSize: 12, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, marginLeft: 8 }}>
                      {new Date(claim.identityVerifiedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
                Progress
              </div>
              <VerificationTimeline steps={steps} />
            </div>

            {claim.verificationDocHash && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                  On-Chain Record
                </div>
                <OnChainReceipt
                  identity={claim.nameOnId ?? "Verified via Stripe"}
                  docHash={claim.verificationDocHash}
                  block={"ICP-" + claim.verificationDocHash.slice(0, 8).toUpperCase()}
                  claimant={claim.nameOnId ?? "—"}
                />
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: V2_COLORS.ink, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 10, fontFamily: V2_FONTS.mono, color: "#6B7280", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                Conflict Window
              </div>
              <div style={{ fontSize: 24, fontFamily: V2_FONTS.display, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
                {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
              </div>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: "#9CA3AF", marginBottom: 10 }}>
                Ends {conflictEnds.toLocaleDateString()}
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: "#9CA3AF", lineHeight: 1.6, margin: 0 }}>
                During this window, a competing claimant can submit a counter-claim. After it closes, your record is final unless challenged.
              </p>
            </div>

            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                While You Wait
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, marginBottom: 16 }}>
                Your property is live and you can continue logging jobs, uploading photos, and managing your home record. Your reports will show "Pending Review" status until approval.
              </p>
              <button
                onClick={() => navigate(`/properties/${id}`)}
                style={{ background: V2_COLORS.blue, color: "#fff", border: "none", borderRadius: 100, padding: "10px 20px", fontFamily: V2_FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}
              >
                Back to the property
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
