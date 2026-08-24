import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";
import { CountdownTimer } from "./components/CountdownTimer";
import { PropertyStatusCard } from "./components/PropertyStatusCard";

const TWO_COL: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 320px",
  gap: 32,
  alignItems: "start",
};

interface ProofCardProps {
  icon         : string;
  title        : string;
  badge        : string;
  badgeColor   : string;
  badgeBg      : string;
  desc         : string;
  status       : string;
  statusColor  : string;
  ctaLabel     : string;
  onCta        : () => void;
  cleared      : boolean;
}

function ProofCard({ icon, title, badge, badgeColor, badgeBg, desc, status, statusColor, ctaLabel, onCta, cleared }: ProofCardProps) {
  return (
    <div style={{ border: `1px solid ${cleared ? "#BBF7D0" : V2_COLORS.border}`, borderRadius: 12, padding: 20, background: cleared ? "#F0FDF4" : V2_COLORS.paper }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 15, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink }}>
              {title}
            </div>
            <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: statusColor, marginTop: 2 }}>
              {cleared ? "CLEARED" : status}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: badgeColor, background: badgeBg, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.06em" }}>
          {badge}
        </span>
      </div>
      <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted, marginBottom: 16, lineHeight: 1.5 }}>
        {desc}
      </p>
      {!cleared && (
        <button
          onClick={onCta}
          style={{ background: V2_COLORS.blue, color: "#fff", border: "none", borderRadius: 100, padding: "8px 20px", fontFamily: V2_FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {ctaLabel}
        </button>
      )}
      {cleared && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#16A34A" }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <span style={{ fontSize: 13, fontFamily: V2_FONTS.body, fontWeight: 600 }}>Identity confirmed</span>
        </div>
      )}
    </div>
  );
}

export default function VerifyClaimPage() {
  const navigate           = useNavigate();
  const { id }             = useParams<{ id: string }>();
  const { claim }          = useVerifyContext();
  const msLeft             = Math.max(0, claim.claimWindowEndsAt - Date.now());
  const hrsLeft            = Math.floor(msLeft / 3_600_000);
  const proofsSubmitted    = (claim.identityVerified ? 1 : 0) + (claim.verificationDocHash ? 1 : 0);
  const subLine            = `${proofsSubmitted} of 2 proofs · ${hrsLeft} hrs left`;

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <CountdownTimer
          claimStartedAt={claim.claimStartedAt}
          claimWindowEndsAt={claim.claimWindowEndsAt}
          subtitle="Complete both proofs to secure your ownership record."
        />

        <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Claim Opened · {claim.address}
        </div>

        <div style={TWO_COL}>
          {/* Main column */}
          <div>
            <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 36, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.1 }}>
              Two proofs, three days.
            </h1>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: 15, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 32, maxWidth: 540 }}>
              Verify who you are and that the address is yours. Both are due within 72 hours of adding the property, and until they clear the record is marked unverified.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
              <ProofCard
                icon="🪪"
                title="Photo identity"
                badge="REQUIRED"
                badgeColor="#C94C2E"
                badgeBg="#FFE8E5"
                desc="A government ID scan and a selfie liveness check. Handled by Stripe Identity in about 2 minutes."
                status="NOT STARTED · ABOUT 2 MINUTES"
                statusColor={V2_COLORS.muted}
                ctaLabel="Start check"
                onCta={() => navigate(`/properties/${id}/verify/identity`)}
                cleared={claim.identityVerified}
              />
              <ProofCard
                icon="📄"
                title="Ownership document"
                badge="REQUIRED"
                badgeColor="#C94C2E"
                badgeBg="#FFE8E5"
                desc="A deed, utility bill, or tax record with your name and this address. We only store the hash."
                status={claim.verificationDocHash ? "SUBMITTED" : "NOT STARTED · NAME MUST MATCH YOUR ID"}
                statusColor={claim.verificationDocHash ? "#16A34A" : V2_COLORS.muted}
                ctaLabel="Upload"
                onCta={() => navigate(`/properties/${id}/verify/document`)}
                cleared={!!claim.verificationDocHash}
              />
            </div>

            {/* Why both explainer */}
            <div style={{ background: V2_COLORS.lblue, border: `1px solid #D0D3FF`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.blue, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Why both?
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, margin: 0 }}>
                Identity alone proves who you are — not what you own. The document links your legal name to this address. Together they form a claim that can withstand a dispute from a competing registrant.
              </p>
            </div>

            <div style={{ marginTop: 24 }}>
              <PropertyStatusCard
                address={claim.address}
                statusLine="Unverified"
                subLine={subLine}
                variant="warning"
              />
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Dark warning panel */}
            <div style={{ background: V2_COLORS.ink, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 10, fontFamily: V2_FONTS.mono, color: "#6B7280", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                If the clock runs out
              </div>
              <div style={{ fontSize: 18, fontFamily: V2_FONTS.display, fontWeight: 700, color: "#fff", marginBottom: 10, lineHeight: 1.25 }}>
                {claim.address} becomes claimable.
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: "#9CA3AF", lineHeight: 1.6, margin: 0 }}>
                Any other HomeGentic user can register this address after the window closes. Your jobs and notes are safe, but the ownership record resets.
              </p>
            </div>

            {/* Not the owner panel */}
            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Not the owner of record?
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, marginBottom: 16 }}>
                Properties held by an LLC, trust, or estate require a representative filing. The process is the same but adds a relationship document.
              </p>
              <button
                onClick={() => navigate(`/properties/${id}/verify/representative`)}
                style={{ background: "none", border: `1px solid ${V2_COLORS.blue}`, color: V2_COLORS.blue, borderRadius: 100, padding: "8px 16px", fontFamily: V2_FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}
              >
                Verify as a representative
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .verify-two-col { grid-template-columns: 1fr !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </Layout>
  );
}
