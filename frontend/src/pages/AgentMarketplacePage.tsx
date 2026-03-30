/**
 * AgentMarketplacePage — Epic 9.3 / 9.6
 * Agents browse open listing bid requests and submit sealed proposals.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Calendar, DollarSign, FileText } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import {
  listingService,
  formatCommission,
  type ListingBidRequest,
} from "@/services/listing";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  fontFamily: S.sans,
  fontSize: "0.9375rem",
  color: S.ink,
  border: `1px solid ${S.rule}`,
  background: S.paper,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: S.mono,
  fontSize: "0.65rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: S.inkLight,
  marginBottom: "0.35rem",
};

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ProposalForm {
  agentName:             string;
  agentBrokerage:        string;
  commissionBps:         string;
  cmaSummary:            string;
  marketingPlan:         string;
  estimatedDaysOnMarket: string;
  estimatedSalePrice:    string;
  includedServices:      string;
  coverLetter:           string;
}

const emptyForm: ProposalForm = {
  agentName:             "",
  agentBrokerage:        "",
  commissionBps:         "250",
  cmaSummary:            "",
  marketingPlan:         "",
  estimatedDaysOnMarket: "30",
  estimatedSalePrice:    "",
  includedServices:      "",
  coverLetter:           "",
};

export default function AgentMarketplacePage() {
  const navigate = useNavigate();

  const [requests,     setRequests]     = useState<ListingBidRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeReqId,  setActiveReqId]  = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [form,         setForm]         = useState<ProposalForm>(emptyForm);

  useEffect(() => {
    listingService.getOpenBidRequests()
      .then(setRequests)
      .catch(() => toast.error("Failed to load open listings"))
      .finally(() => setLoading(false));
  }, []);

  function set(field: keyof ProposalForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openForm(reqId: string) {
    setActiveReqId(reqId);
    setForm(emptyForm);
  }

  function closeForm() {
    setActiveReqId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeReqId) return;
    const bps = parseInt(form.commissionBps, 10);
    if (!bps || bps <= 0) { toast.error("Enter a valid commission rate"); return; }
    const estPrice = parseFloat(form.estimatedSalePrice);
    if (!estPrice || estPrice <= 0) { toast.error("Enter an estimated sale price"); return; }

    setSubmitting(true);
    try {
      await listingService.submitProposal(activeReqId, {
        agentName:             form.agentName,
        agentBrokerage:        form.agentBrokerage,
        commissionBps:         bps,
        cmaSummary:            form.cmaSummary,
        marketingPlan:         form.marketingPlan,
        estimatedDaysOnMarket: parseInt(form.estimatedDaysOnMarket, 10) || 30,
        estimatedSalePrice:    Math.round(estPrice * 100),
        includedServices:      form.includedServices.split(",").map((s) => s.trim()).filter(Boolean),
        validUntil:            Date.now() + 30 * 86_400_000,
        coverLetter:           form.coverLetter,
      });
      toast.success("Proposal submitted — it will remain sealed until the bid deadline.");
      closeForm();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit proposal");
    } finally {
      setSubmitting(false);
    }
  }

  // Compute live commission dollar amount from form fields
  const activeReq    = requests.find((r) => r.id === activeReqId);
  const refPrice     = activeReq?.desiredSalePrice ?? null;
  const commBps      = parseInt(form.commissionBps, 10) || 0;
  const commDollars  = refPrice ? Math.round(refPrice * commBps / 10_000) : null;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight,
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "2rem",
          }}
        >
          <ArrowLeft size={13} /> Back
        </button>

        {/* Heading */}
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", color: S.ink, margin: "0 0 0.4rem" }}>
          Agent Marketplace
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight, margin: "0 0 2rem" }}>
          Browse open listing bid requests and submit sealed proposals. Your commission and terms remain hidden until the deadline.
        </p>

        {loading && (
          <p style={{ fontFamily: S.mono, color: S.inkLight }}>Loading open listings…</p>
        )}

        {!loading && requests.length === 0 && (
          <div style={{ border: `1px solid ${S.rule}`, padding: "2rem", textAlign: "center" }}>
            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: "0 0 0.5rem" }}>
              No open listings at the moment
            </p>
            <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, margin: 0 }}>
              Check back soon — new bid requests are posted as homeowners prepare to list.
            </p>
          </div>
        )}

        {/* Open request cards */}
        {requests.map((req) => (
          <div key={req.id} style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  Property ID: {req.propertyId}
                </div>
                {req.desiredSalePrice && (
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: S.ink }}>
                    {formatPrice(req.desiredSalePrice)}
                    <span style={{ fontFamily: S.mono, fontSize: "0.7rem", fontWeight: 400, color: S.inkLight, marginLeft: "0.5rem" }}>desired price</span>
                  </div>
                )}
              </div>
              {/* Deadline badge */}
              <div style={{
                border: `1px solid ${S.rule}`, padding: "0.35rem 0.75rem",
                fontFamily: S.mono, fontSize: "0.68rem", color: S.inkLight,
                letterSpacing: "0.05em", textTransform: "uppercase",
                display: "flex", alignItems: "center", gap: "0.35rem",
              }}>
                <Calendar size={11} />
                Deadline: {formatDate(req.bidDeadline)}
              </div>
            </div>

            {/* Notes */}
            {req.notes && (
              <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.ink, margin: "0 0 1rem" }}>
                {req.notes}
              </p>
            )}

            {/* Submit proposal button */}
            {activeReqId !== req.id && (
              <Button onClick={() => openForm(req.id)} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <FileText size={13} />
                Submit Proposal
              </Button>
            )}

            {/* Inline proposal form */}
            {activeReqId === req.id && (
              <form onSubmit={handleSubmit} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem", borderTop: `1px solid ${S.rule}`, paddingTop: "1.25rem" }}>
                <h3 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.ink, margin: 0 }}>
                  Your Proposal
                </h3>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label htmlFor="agent-name" style={labelStyle}>Your Name</label>
                    <input
                      id="agent-name"
                      value={form.agentName}
                      onChange={(e) => set("agentName", e.target.value)}
                      style={fieldStyle}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="agent-brokerage" style={labelStyle}>Brokerage</label>
                    <input
                      id="agent-brokerage"
                      value={form.agentBrokerage}
                      onChange={(e) => set("agentBrokerage", e.target.value)}
                      style={fieldStyle}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label htmlFor="commission-bps" style={labelStyle}>Commission (basis points)</label>
                    <input
                      id="commission-bps"
                      aria-label="Commission"
                      type="number"
                      min="1"
                      max="1000"
                      value={form.commissionBps}
                      onChange={(e) => set("commissionBps", e.target.value)}
                      style={fieldStyle}
                      required
                    />
                    <p style={{ fontFamily: S.mono, fontSize: "0.62rem", color: S.sage, margin: "0.25rem 0 0", letterSpacing: "0.04em" }}>
                      {formatCommission(commBps)}
                      {commDollars !== null && ` = ${formatPrice(commDollars)}`}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="est-sale-price" style={labelStyle}>Est. Sale Price ($)</label>
                    <input
                      id="est-sale-price"
                      type="number"
                      min="1"
                      step="1000"
                      placeholder="e.g. 550000"
                      value={form.estimatedSalePrice}
                      onChange={(e) => set("estimatedSalePrice", e.target.value)}
                      style={fieldStyle}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="est-dom" style={labelStyle}>Est. Days on Market</label>
                    <input
                      id="est-dom"
                      type="number"
                      min="1"
                      value={form.estimatedDaysOnMarket}
                      onChange={(e) => set("estimatedDaysOnMarket", e.target.value)}
                      style={fieldStyle}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cma-summary" style={labelStyle}>CMA Summary</label>
                  <textarea
                    id="cma-summary"
                    rows={3}
                    placeholder="Summary of comparable sales and pricing rationale..."
                    value={form.cmaSummary}
                    onChange={(e) => set("cmaSummary", e.target.value)}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </div>

                <div>
                  <label htmlFor="marketing-plan" style={labelStyle}>Marketing Plan</label>
                  <textarea
                    id="marketing-plan"
                    rows={3}
                    placeholder="How will you market this home? MLS, open houses, social, print..."
                    value={form.marketingPlan}
                    onChange={(e) => set("marketingPlan", e.target.value)}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </div>

                <div>
                  <label htmlFor="included-services" style={labelStyle}>Included Services (comma-separated)</label>
                  <input
                    id="included-services"
                    placeholder="e.g. staging, professional photos, drone footage"
                    value={form.includedServices}
                    onChange={(e) => set("includedServices", e.target.value)}
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label htmlFor="cover-letter" style={labelStyle}>Cover Letter</label>
                  <textarea
                    id="cover-letter"
                    rows={4}
                    placeholder="Why are you the best agent for this listing?"
                    value={form.coverLetter}
                    onChange={(e) => set("coverLetter", e.target.value)}
                    style={{ ...fieldStyle, resize: "vertical" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button type="submit" disabled={submitting} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Send size={13} />
                    {submitting ? "Submitting…" : "Submit Proposal"}
                  </Button>
                  <button
                    type="button"
                    onClick={closeForm}
                    style={{
                      background: "none", border: `1px solid ${S.rule}`, cursor: "pointer",
                      fontFamily: S.mono, fontSize: "0.72rem", color: S.inkLight,
                      letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.5rem 1rem",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
