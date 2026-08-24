import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useVerifyContext } from "./VerifyLayout";
import { EvidenceStrengthBar } from "./components/EvidenceStrengthBar";

// Mock other claimant data
const OTHER_CLAIMANT = {
  initials    : "MC",
  name        : "Marcus Cole",
  filedDate   : "2 hours ago",
  docType     : "UTILITY BILL",
  docBadgeColor: "#2E7D32",
  docBadgeBg  : "#E8F5E9",
  checks      : [
    { label: "Identity verified", ok: true },
    { label: "Utility bill",      ok: true },
    { label: "Name match",        ok: false },
    { label: "Prior history",     ok: false },
  ],
  strength    : "WEAK" as const,
};

export default function VerifyContestedPage() {
  const navigate  = useNavigate();
  const { id }    = useParams<{ id: string }>();
  const { claim } = useVerifyContext();

  const myChecks = [
    { label: "Identity verified",  ok: claim.identityVerified },
    { label: "Warranty deed",      ok: claim.verificationMethod === "DeedRecord" },
    { label: "Name match",         ok: !claim.nameOnDocument || !claim.nameOnId || claim.nameOnDocument === claim.nameOnId },
    { label: "Prior history",      ok: true },
  ];

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ fontFamily: V2_FONTS.display, fontSize: 32, fontWeight: 900, color: V2_COLORS.ink, marginBottom: 12, lineHeight: 1.15 }}>
          Two claims, one address.
        </h1>
        <p style={{ fontFamily: V2_FONTS.body, fontSize: 14, color: V2_COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
          Another user has filed a claim on {claim.address}. A HomeGentic reviewer will compare both submissions and award ownership to the stronger claim.
        </p>

        {/* Contested badge card */}
        <div style={{ background: "#FFFDE7", border: "1px solid #FFE57F", borderRadius: 12, padding: "16px 20px", marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>⚖️</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 15, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink }}>Under dispute</span>
              <span style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: "#F57F17", background: "#FFF8E1", padding: "3px 8px", borderRadius: 6, letterSpacing: "0.06em" }}>CONTESTED</span>
            </div>
            <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>Both claims are held for manual review</div>
          </div>
        </div>

        {/* Claimant comparison */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {/* Yours */}
          <div style={{ border: `2px solid ${V2_COLORS.blue}`, borderRadius: 12, padding: 20, background: V2_COLORS.lblue }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: V2_COLORS.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, fontFamily: V2_FONTS.mono }}>
                {claim.nameOnId ? claim.nameOnId.split(" ").map((n) => n[0]).join("").slice(0, 2) : "ME"}
              </div>
              <div>
                <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink }}>{claim.nameOnId ?? "You"}</div>
                <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>Filed {new Date(claim.claimStartedAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: "#1565C0", background: "#E3F2FD", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.05em", display: "inline-block", marginBottom: 14 }}>
              {claim.verificationMethod === "DeedRecord" ? "DEED" : claim.verificationMethod?.toUpperCase() ?? "DOCUMENT"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {myChecks.map((c) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: c.ok ? "#16A34A" : V2_COLORS.coral, fontWeight: 700, fontSize: 13 }}>{c.ok ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2 }}>{c.label}</span>
                </div>
              ))}
            </div>
            <EvidenceStrengthBar strength="STRONG" />
          </div>

          {/* Other claimant */}
          <div style={{ border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, padding: 20, background: V2_COLORS.paper }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#E5E7EB", color: V2_COLORS.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, fontFamily: V2_FONTS.mono }}>
                {OTHER_CLAIMANT.initials}
              </div>
              <div>
                <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 700, color: V2_COLORS.ink }}>{OTHER_CLAIMANT.name}</div>
                <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>Filed {OTHER_CLAIMANT.filedDate}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, fontFamily: V2_FONTS.mono, fontWeight: 700, color: OTHER_CLAIMANT.docBadgeColor, background: OTHER_CLAIMANT.docBadgeBg, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.05em", display: "inline-block", marginBottom: 14 }}>
              {OTHER_CLAIMANT.docType}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {OTHER_CLAIMANT.checks.map((c) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: c.ok ? "#16A34A" : V2_COLORS.coral, fontWeight: 700, fontSize: 13 }}>{c.ok ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2 }}>{c.label}</span>
                </div>
              ))}
            </div>
            <EvidenceStrengthBar strength={OTHER_CLAIMANT.strength} />
          </div>
        </div>

        {/* Explainer */}
        <div style={{ background: V2_COLORS.lblue, border: `1px solid #D0D3FF`, borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.blue, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            What You Can Do
          </div>
          <p style={{ fontSize: 13, fontFamily: V2_FONTS.body, color: V2_COLORS.muted2, lineHeight: 1.6, margin: 0 }}>
            Uploading a stronger document — such as a warranty deed — significantly increases your evidence score. Our reviewer weighs document type, name match, and prior home history when making a decision.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => navigate(`/properties/${id}/verify/status`)}
            style={{ background: "none", border: `1px solid ${V2_COLORS.border}`, color: V2_COLORS.muted2, borderRadius: 100, padding: "12px 24px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            See the reviewer's view
          </button>
          <button
            onClick={() => navigate(`/properties/${id}/verify/document`)}
            style={{ background: V2_COLORS.blue, color: "#fff", border: "none", borderRadius: 100, padding: "12px 24px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Add a stronger document
          </button>
        </div>
      </div>
    </Layout>
  );
}
