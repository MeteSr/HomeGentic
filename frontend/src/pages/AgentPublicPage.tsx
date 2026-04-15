/**
 * Agent Public Profile — /agent/:id
 *
 * Public-facing view of a Realtor's on-chain profile, reviews, and stats (Epic 9.1.3, 9.1.4).
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/Layout";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { Button } from "@/components/Button";
import { agentService, AgentOnChainProfile, AgentReview, computeAverageRating } from "@/services/agent";
import { listingService, AgentPerformanceRecord } from "@/services/listing";
import { usePropertyStore } from "@/store/propertyStore";
import { COLORS, FONTS } from "@/theme";
import toast from "react-hot-toast";

const UI = {
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
  const { isMobile } = useBreakpoint();
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

  const helmetName = profile && profile !== undefined ? (profile as any).name ?? "Agent" : "Agent";
  const helmetTitle = profile && profile !== undefined
    ? `${(profile as any).name ?? "Agent"} — Real Estate Agent | HomeGentic`
    : "Agent Profile | HomeGentic";
  const helmetDesc = profile && profile !== undefined
    ? `${(profile as any).name ?? "Agent"} is a verified real estate agent on HomeGentic. View their listings, reviews, and track record.`
    : "Verified real estate agent profile on HomeGentic.";

  if (profile === undefined) {
    return (
      <Layout>
        <Helmet>
          <title>Agent Profile | HomeGentic</title>
          <meta name="description" content="Verified real estate agent profile on HomeGentic." />
          <meta property="og:title" content="Agent Profile | HomeGentic" />
          <meta property="og:description" content="Verified real estate agent profile on HomeGentic." />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://homegentic.app/og-default.png" />
          <link rel="canonical" href="https://homegentic.app/agent" />
          <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "Person", "name": "Agent", "description": "Verified real estate agent on HomeGentic." })}</script>
        </Helmet>
        <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>Loading…</p>
      </Layout>
    );
  }

  if (profile === null) {
    return (
      <Layout>
        <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>Agent not found.</p>
      </Layout>
    );
  }

  const avgRating = computeAverageRating(reviews);

  return (
    <Layout>
      <Helmet>
        <title>{helmetTitle}</title>
        <meta name="description" content={helmetDesc} />
        <meta property="og:title" content={helmetTitle} />
        <meta property="og:description" content={helmetDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href={`https://homegentic.app/agent/${id}`} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          "name": helmetName,
          "description": helmetDesc,
          "url": `https://homegentic.app/agent/${id}`,
          "image": "https://homegentic.app/og-default.png",
        })}</script>
      </Helmet>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "1rem" : "2rem 1rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: UI.serif, color: UI.ink, margin: 0 }}>
            {profile.name}
          </h1>
          <p style={{ fontFamily: UI.mono, color: UI.inkLight, margin: "4px 0 0" }}>
            {profile.brokerage} · {profile.licenseNumber}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {profile.isVerified && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                background: "#e6f4ea", border: "1px solid #34a853", borderRadius: 2,
                padding: "4px 10px" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: "#188038" }}>
                  HomeGentic Verified
                </span>
              </div>
            )}
            {/* 9.6.3 — HomeGentic Verified Transaction badge */}
            {perfRecords.length > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                background: "#e8f4ff", border: "1px solid #1a73e8", borderRadius: 2,
                padding: "4px 10px" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: "#1a5c99" }}>
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
              style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${UI.rule}`, padding: "1rem" }}
            >
              <label htmlFor="invite-property" style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Select Property
              </label>
              <select
                id="invite-property"
                aria-label="Select Property"
                value={selectedPropId}
                onChange={(e) => setSelectedPropId(e.target.value)}
                style={{ padding: "0.4rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.75rem" }}
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
        <div style={{ display: "flex", gap: isMobile ? "1.25rem" : "2rem", flexWrap: "wrap", marginBottom: "1.5rem",
          borderTop: `1px solid ${UI.rule}`, borderBottom: `1px solid ${UI.rule}`,
          padding: "1rem 0" }}>
          <div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg. Days on Market</div>
            <div style={{ fontFamily: UI.serif, fontSize: "1.5rem", color: UI.ink }}>
              {profile.avgDaysOnMarket}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em" }}>Listings (12 mo)</div>
            <div style={{ fontFamily: UI.serif, fontSize: "1.5rem", color: UI.ink }}>
              {profile.listingsLast12Months}
            </div>
          </div>
          {avgRating > 0 && (
            <div>
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
                textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg. Rating</div>
              <div style={{ fontFamily: UI.serif, fontSize: "1.5rem", color: UI.ink }}>
                {avgRating.toFixed(1)} / 5
              </div>
            </div>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Bio</div>
            <p style={{ fontFamily: UI.mono, color: UI.ink, lineHeight: 1.6, margin: 0 }}>
              {profile.bio}
            </p>
          </div>
        )}

        {/* States Licensed */}
        {profile.statesLicensed.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Licensed In
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profile.statesLicensed.map((state) => (
                <span key={state} style={{ fontFamily: UI.mono, fontSize: "0.75rem",
                  border: `1px solid ${UI.rule}`, padding: "2px 8px" }}>
                  {state}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Reviews ({reviews.length})
          </div>
          {reviews.length === 0 ? (
            <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>No reviews yet.</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${UI.rule}`,
                padding: "1rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  marginBottom: 6 }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink }}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </span>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ fontFamily: UI.mono, color: UI.ink, margin: 0, lineHeight: 1.5 }}>
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
              style={{ border: `1px solid ${UI.rule}`, padding: "1.25rem 1.5rem" }}
            >
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                Agent Performance ({perfRecords.length} transaction{perfRecords.length !== 1 ? "s" : ""})
              </div>
              <ResponsiveGrid cols={{ mobile: 2, tablet: 2, desktop: 4 }} gap="1.5rem">
                <div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Overall Score</div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.5rem", color: UI.ink }}>{overallScore}</div>
                </div>
                <div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>DOM Accuracy</div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.5rem", color: UI.ink }}>{domScore}</div>
                </div>
                <div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Price Accuracy</div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.5rem", color: UI.ink }}>{priceScore}</div>
                </div>
                <div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>Commission Honesty</div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.5rem", color: UI.ink }}>{commissionScore}</div>
                </div>
              </ResponsiveGrid>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
