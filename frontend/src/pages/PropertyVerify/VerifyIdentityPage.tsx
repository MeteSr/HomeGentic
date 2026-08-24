import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";
import { CountdownTimer } from "./components/CountdownTimer";
import { propertyService } from "@/services/property";

const TWO_COL: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 320px",
  gap: 32,
  alignItems: "start",
};

export default function VerifyIdentityPage() {
  const navigate               = useNavigate();
  const { id }                 = useParams<{ id: string }>();
  const { claim, refresh }     = useVerifyContext();
  const [localPending, setPending] = useState(false);

  const handleStart = () => {
    // In production, this would open a Stripe Identity session.
    // For now, we simulate a pending state.
    setPending(true);
  };

  const handleDevClear = async () => {
    if (!id) return;
    try {
      await propertyService.markIdentityCleared(id, "dev_session_001", "Dana R. Whitfield");
      await refresh();
      navigate(`/properties/${id}/verify`);
    } catch {
      // ignore in dev
    }
  };

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <CountdownTimer
          claimStartedAt={claim.claimStartedAt}
          claimWindowEndsAt={claim.claimWindowEndsAt}
        />

        <div style={TWO_COL}>
          {/* Main column */}
          <div>
            <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.blue, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Step 1 · Who You Are
            </div>
            <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 32, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.15 }}>
              Scan your ID, then take a selfie.
            </h1>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: 14, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
              We use Stripe Identity to verify government-issued photo ID. The check takes about 2 minutes and the result is recorded on-chain without storing your photo.
            </p>

            {/* Identity check card */}
            <div style={{ border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: 24, background: V2_COLORS.paper, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Identity Check
                </span>
                <span style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>
                  🔒 Handled by Stripe Identity
                </span>
              </div>

              {/* Two placeholders */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                {/* Government ID placeholder */}
                <div>
                  <div style={{ background: V2_COLORS.lblue, border: `1px solid #D0D3FF`, borderRadius: 10, aspectRatio: "1.6 / 1", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 28 }}>🪪</span>
                  </div>
                  <div style={{ fontSize: 13, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink, marginBottom: 2 }}>Government ID</div>
                  <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>Passport, driver's license, or national ID card</div>
                </div>
                {/* Selfie placeholder */}
                <div>
                  <div style={{ background: V2_COLORS.lblue, border: `1px solid #D0D3FF`, borderRadius: "50%", width: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 28 }}>🤳</span>
                  </div>
                  <div style={{ fontSize: 13, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink, marginBottom: 2 }}>Selfie liveness</div>
                  <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>A quick face scan to confirm you are present</div>
                </div>
              </div>

              {localPending ? (
                <div style={{ background: V2_COLORS.lblue, border: `1px solid #D0D3FF`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.blue, marginBottom: 4 }}>
                    Check in progress…
                  </div>
                  <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>
                    Stripe will redirect you back when complete.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    onClick={handleStart}
                    style={{ background: V2_COLORS.ink, color: "#fff", border: "none", borderRadius: 100, padding: "12px 24px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}
                  >
                    Start the identity check
                  </button>
                  <button
                    onClick={() => navigate(`/properties/${id}/verify`)}
                    style={{ background: "none", border: `1px solid ${V2_COLORS.border}`, color: V2_COLORS.muted2, borderRadius: 100, padding: "10px 24px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}
                  >
                    Back
                  </button>
                </div>
              )}
            </div>

            {/* Dev helper */}
            {import.meta.env.DEV && (
              <div style={{ borderTop: `1px dashed ${V2_COLORS.border}`, paddingTop: 12 }}>
                <button
                  onClick={handleDevClear}
                  style={{ fontSize: 12, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  Dev: mark as cleared
                </button>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                What Stripe Checks
              </div>
              {[
                "Photo matches the ID selfie",
                "Document is not expired",
                "ID passes liveness detection",
                "No known fraud signals",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: V2_COLORS.blue, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2 }}>{item}</span>
                </div>
              ))}
            </div>

            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                Accepted Documents
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, margin: 0 }}>
                US passport, state driver's license, state ID card, permanent resident card, or foreign passport with visa.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
