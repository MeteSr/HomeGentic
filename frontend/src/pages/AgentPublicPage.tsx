/**
 * Agent Public Profile — /agent/:id
 *
 * Public-facing view of a Realtor's on-chain profile, reviews, and stats (Epic 9.1.3, 9.1.4).
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { agentService, AgentOnChainProfile, AgentReview, computeAverageRating } from "@/services/agent";
import { listingService, AgentPerformanceRecord } from "@/services/listing";
import { usePropertyStore } from "@/store/propertyStore";
import { COLORS, FONTS } from "@/theme";
import toast from "react-hot-toast";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

export default function AgentPublicPage() {
  const { id } = useParams<{ id: string }>();
  const { properties } = usePropertyStore();
  const [profile, setProfile] = useState<AgentOnChainProfile | null | undefined>(undefined);
  const [reviews, setReviews] = useState<AgentReview[]>([]);
  const [perfRecords, setPerfRecords] = useState<AgentPerformanceRecord[]>([]);
  // 9.6.2 — direct invite
  const [inviteOpen,    setInviteOpen]    = useState(false);
  const [selectedPropId, setSelectedPropId] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      agentService.getPublicProfile(id),
      agentService.getReviews(id),
      listingService.getAgentPerformanceRecords(id),
    ]).then(([p, r, perf]) => {
      setProfile(p);
      setReviews(r);
      setPerfRecords(perf);
    }).catch(() => setProfile(null));
  }, [id]);

  if (profile === undefined) {
    return (
      <Layout>
        <p style={{ fontFamily: S.mono, color: S.inkLight }}>Loading…</p>
      </Layout>
    );
  }

  if (profile === null) {
    return (
      <Layout>
        <p style={{ fontFamily: S.mono, color: S.inkLight }}>Agent not found.</p>
      </Layout>
    );
  }

  const avgRating = computeAverageRating(reviews);

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: S.serif, color: S.ink, margin: 0 }}>
            {profile.name}
          </h1>
          <p style={{ fontFamily: S.mono, color: S.inkLight, margin: "4px 0 0" }}>
            {profile.brokerage} · {profile.licenseNumber}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {profile.isVerified && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                background: "#e6f4ea", border: "1px solid #34a853", borderRadius: 2,
                padding: "4px 10px" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: "#188038" }}>
                  HomeGentic Verified
                </span>
              </div>
            )}
            {/* 9.6.3 — HomeGentic Verified Transaction badge */}
            {perfRecords.length > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                background: "#e8f4ff", border: "1px solid #1a73e8", borderRadius: 2,
                padding: "4px 10px" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: "#1a5c99" }}>
                  HomeGentic Verified Transaction
                </span>
              </div>
            )}
          </div>

          {/* 9.6.2 — Request Proposal button */}
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => setInviteOpen((o) => !o)}>
              Request Proposal
            </Button>
          </div>

          {/* 9.6.2 — Invite form */}
          {inviteOpen && (
            <form
              aria-label="Request Proposal"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selectedPropId) { toast.error("Select a property"); return; }
                try {
                  await listingService.createDirectInvite(id!, selectedPropId);
                  toast.success("Proposal request sent to the agent.");
                  setInviteOpen(false);
                } catch (err: any) {
                  toast.error(err?.message ?? "Failed to send invite");
                }
              }}
              style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${S.rule}`, padding: "1rem" }}
            >
              <label htmlFor="invite-property" style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Select Property
              </label>
              <select
                id="invite-property"
                aria-label="Select Property"
                value={selectedPropId}
                onChange={(e) => setSelectedPropId(e.target.value)}
                style={{ padding: "0.4rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.75rem" }}
              >
                <option value="">— choose a property —</option>
                {properties.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
              <Button type="submit" style={{ alignSelf: "flex-start" }}>Send Request</Button>
            </form>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "2rem", marginBottom: "1.5rem",
          borderTop: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`,
          padding: "1rem 0" }}>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg. Days on Market</div>
            <div style={{ fontFamily: S.serif, fontSize: "1.5rem", color: S.ink }}>
              {profile.avgDaysOnMarket}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em" }}>Listings (12 mo)</div>
            <div style={{ fontFamily: S.serif, fontSize: "1.5rem", color: S.ink }}>
              {profile.listingsLast12Months}
            </div>
          </div>
          {avgRating !== null && (
            <div>
              <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
                textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg. Rating</div>
              <div style={{ fontFamily: S.serif, fontSize: "1.5rem", color: S.ink }}>
                {avgRating.toFixed(1)} / 5
              </div>
            </div>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Bio</div>
            <p style={{ fontFamily: S.mono, color: S.ink, lineHeight: 1.6, margin: 0 }}>
              {profile.bio}
            </p>
          </div>
        )}

        {/* States Licensed */}
        {profile.statesLicensed.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Licensed In
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profile.statesLicensed.map((state) => (
                <span key={state} style={{ fontFamily: S.mono, fontSize: "0.75rem",
                  border: `1px solid ${S.rule}`, padding: "2px 8px" }}>
                  {state}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Reviews ({reviews.length})
          </div>
          {reviews.length === 0 ? (
            <p style={{ fontFamily: S.mono, color: S.inkLight }}>No reviews yet.</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${S.rule}`,
                padding: "1rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  marginBottom: 6 }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.ink }}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ fontFamily: S.mono, color: S.ink, margin: 0, lineHeight: 1.5 }}>
                  {r.comment}
                </p>
              </div>
            ))
          )}
        </div>

        {/* 9.5.4 — Agent Performance scores (from verified transactions) */}
        {perfRecords.length > 0 && (() => {
          const avg = (key: keyof AgentPerformanceRecord) =>
            Math.round(perfRecords.reduce((sum, r) => sum + (r[key] as number), 0) / perfRecords.length);
          const overallScore     = avg("overallScore");
          const domScore         = avg("domAccuracyScore");
          const priceScore       = avg("priceAccuracyScore");
          const commissionScore  = avg("commissionHonestyScore");
          return (
            <div
              role="region"
              aria-label="Agent Performance"
              style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem" }}
            >
              <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                Agent Performance ({perfRecords.length} transaction{perfRecords.length !== 1 ? "s" : ""})
              </div>
              <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Overall Score</div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink }}>{overallScore}</div>
                </div>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>DOM Accuracy</div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink }}>{domScore}</div>
                </div>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Price Accuracy</div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink }}>{priceScore}</div>
                </div>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Commission Honesty</div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.ink }}>{commissionScore}</div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
