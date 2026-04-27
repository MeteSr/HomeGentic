/**
 * ListingNewPage — Epic 9.2
 * Homeowner creates a sealed-bid listing request.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { listingService, BidVisibility } from "@/services/listing";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
import { computeScore } from "@/services/scoreService";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
  sans:     FONTS.sans,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  fontFamily: UI.sans,
  fontSize: "0.9375rem",
  color: UI.ink,
  border: `1px solid ${UI.rule}`,
  background: UI.paper,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: UI.mono,
  fontSize: "0.65rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: UI.inkLight,
  marginBottom: "0.35rem",
};

export default function ListingNewPage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const { jobs } = useJobStore();
  const [userTier,   setUserTier]   = useState<PlanTier>("Basic");
  const [loading,    setLoading]    = useState(false);
  const [visibility, setVisibility] = useState<BidVisibility>("open");
  const [form, setForm] = useState({
    propertyId:       "",
    targetListDate:   "",
    desiredSalePrice: "",
    notes:            "",
    bidDeadline:      "",
  });

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch((e) => console.error("[ListingNewPage] subscription load failed:", e));
  }, []);

  useEffect(() => {
    if (properties[0]) setForm((f) => ({ ...f, propertyId: String(properties[0].id) }));
  }, [properties]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.propertyId) { toast.error("Select a property"); return; }
    if (!form.bidDeadline) { toast.error("Set a bid deadline"); return; }
    const deadlineMs = new Date(form.bidDeadline).getTime();
    if (deadlineMs <= Date.now()) { toast.error("Bid deadline must be in the future"); return; }

    // 9.2.3 — snapshot current score + verified job count
    const score            = computeScore(jobs, properties);
    const verifiedJobCount = jobs.filter((j) => j.verified).length;
    const propertySnapshot = { score, verifiedJobCount, systemNotes: "" };

    setLoading(true);
    try {
      const req = await listingService.createBidRequest({
        propertyId:       form.propertyId,
        targetListDate:   form.targetListDate ? new Date(form.targetListDate).getTime() : Date.now() + 60 * 86_400_000,
        desiredSalePrice: form.desiredSalePrice ? Math.round(parseFloat(form.desiredSalePrice) * 100) : null,
        notes:            form.notes,
        bidDeadline:      deadlineMs,
        propertySnapshot,
        visibility,
      });
      toast.success("Listing request created — agents can now submit proposals.");
      navigate(`/listing/${req.id}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create listing request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: UI.mono, fontSize: "0.72rem", color: UI.inkLight,
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "2rem",
          }}
        >
          <ArrowLeft size={13} /> Back
        </button>

        {/* Heading */}
        <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", color: UI.ink, margin: "0 0 0.4rem" }}>
          List Your Home
        </h1>
        <p style={{ fontFamily: UI.sans, fontSize: "0.9rem", color: UI.inkLight, margin: "0 0 2rem" }}>
          Invite licensed agents to compete for your listing with sealed proposals. You choose after the deadline.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Property selector */}
          <div>
            <label htmlFor="listing-property" style={labelStyle}>Property</label>
            <select
              id="listing-property"
              aria-label="Property"
              value={form.propertyId}
              onChange={(e) => set("propertyId", e.target.value)}
              style={{ ...fieldStyle, appearance: "none" }}
              required
            >
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {(p as any).address ?? String(p.id)}
                </option>
              ))}
            </select>
          </div>

          {/* Target list date */}
          <div>
            <label htmlFor="listing-target-date" style={labelStyle}>Target List Date</label>
            <input
              id="listing-target-date"
              type="date"
              value={form.targetListDate}
              onChange={(e) => set("targetListDate", e.target.value)}
              style={fieldStyle}
            />
          </div>

          {/* Desired sale price */}
          <div>
            <label htmlFor="listing-price" style={labelStyle}>Desired Sale Price (optional)</label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)",
                fontFamily: UI.mono, fontSize: "0.875rem", color: UI.inkLight,
              }}>$</span>
              <input
                id="listing-price"
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 550000"
                value={form.desiredSalePrice}
                onChange={(e) => set("desiredSalePrice", e.target.value)}
                style={{ ...fieldStyle, paddingLeft: "1.75rem" }}
              />
            </div>
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, margin: "0.3rem 0 0", letterSpacing: "0.04em" }}>
              Visible to agents — helps them benchmark their CMA
            </p>
          </div>

          {/* Bid deadline */}
          <div>
            <label htmlFor="listing-deadline" style={labelStyle}>Bid Deadline</label>
            <input
              id="listing-deadline"
              type="datetime-local"
              value={form.bidDeadline}
              onChange={(e) => set("bidDeadline", e.target.value)}
              style={fieldStyle}
              required
            />
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, margin: "0.3rem 0 0", letterSpacing: "0.04em" }}>
              Proposals are sealed until this date — agents cannot see each other's bids
            </p>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="listing-notes" style={labelStyle}>Notes</label>
            <textarea
              id="listing-notes"
              rows={4}
              placeholder="Any preferences, timeline constraints, or notes for agents..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={5000}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>

          {/* Visibility — 9.2.4 */}
          <div>
            <span style={labelStyle}>Proposal Visibility</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.35rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                fontFamily: UI.sans, fontSize: "0.9rem", color: UI.ink, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="visibility"
                  value="open"
                  checked={visibility === "open"}
                  onChange={() => setVisibility("open")}
                  aria-label="Open to all agents"
                />
                Open to all agents
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem",
                fontFamily: UI.sans, fontSize: "0.9rem", color: UI.ink, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="visibility"
                  value="inviteOnly"
                  checked={visibility === "inviteOnly"}
                  onChange={() => setVisibility("inviteOnly")}
                  aria-label="Invite-only"
                />
                Invite-only (share link with specific agents)
              </label>
            </div>
          </div>

          {/* Submit */}
          <div style={{ paddingTop: "0.5rem" }}>
            <Button type="submit" disabled={loading} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Send size={14} />
              {loading ? "Creating…" : "Create Listing Request"}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
