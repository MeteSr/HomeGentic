import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";

const STATUS_ITEMS = [
  { icon: "✓", color: "#16A34A", label: "Your identity check stands",   detail: "Stripe Identity result is retained for 90 days." },
  { icon: "✗", color: V2_COLORS.coral, label: "The address is claimable",    detail: "Another user may register this address now." },
  { icon: "✗", color: V2_COLORS.coral, label: "Uploads were discarded",       detail: "Document hashes are removed when the window closes." },
  { icon: "✓", color: "#16A34A", label: "Nothing you logged is lost",  detail: "Jobs, photos, and notes remain on your account." },
];

export default function VerifyExpiredPage() {
  const navigate  = useNavigate();
  const { id }    = useParams<{ id: string }>();
  const { claim } = useVerifyContext();

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>
          {/* Main column */}
          <div>
            <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 32, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.15 }}>
              The address went back on the market.
            </h1>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: 14, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
              The 72-hour verification window closed before both proofs were submitted. Your claim on {claim.address} has been released.
            </p>

            {/* Warning card */}
            <div style={{ background: "#FFF0EE", border: `1px solid #FFCCC7`, borderRadius: 12, padding: "16px 20px", marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 28 }}>⏱</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 15, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink }}>The 72 hours are up</span>
                  <span style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: "#C62828", background: "#FFEBEE", padding: "3px 8px", borderRadius: 6, letterSpacing: "0.06em" }}>CLAIM RELEASED</span>
                </div>
                <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>
                  Expired {new Date(claim.claimWindowEndsAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Status items */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
                Where Things Stand
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {STATUS_ITEMS.map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", border: `1px solid ${V2_COLORS.border}`, borderRadius: 10 }}>
                    <span style={{ fontSize: 16, color: item.color, flexShrink: 0, fontWeight: 700 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Restart CTA */}
            <button
              onClick={() => navigate(`/properties/${id}/verify`)}
              style={{ background: V2_COLORS.blue, color: "#fff", border: "none", borderRadius: 100, padding: "14px 28px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%", marginBottom: 12 }}
            >
              Start a new claim on {claim.address}
            </button>
            <p style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted, textAlign: "center" }}>
              A fresh 72-hour window opens immediately. Your identity check may still be valid.
            </p>
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: V2_COLORS.ink, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 10, fontFamily: V2_FONTS.mono, color: "#6B7280", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                Why We Release
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: "#9CA3AF", lineHeight: 1.6, margin: 0 }}>
                Unclaimed property records block other verified owners from adding their home to HomeGentic. The 72-hour window is long enough for any genuine owner to complete both steps.
              </p>
            </div>

            <div style={{ background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                Need Longer?
              </div>
              <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, marginBottom: 16 }}>
                If you need an extension due to exceptional circumstances — travel, medical, etc. — contact our support team.
              </p>
              <button
                onClick={() => navigate("/support")}
                style={{ background: "none", border: `1px solid ${V2_COLORS.border}`, color: V2_COLORS.muted2, borderRadius: 100, padding: "10px 16px", fontFamily: V2_FONTS.body, fontSize: 13, fontWeight: 500, cursor: "pointer", width: "100%" }}
              >
                Contact support
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
