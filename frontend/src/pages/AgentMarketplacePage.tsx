/**
 * AgentMarketplacePage — Epic 9.3 / 9.6
 * Agents browse open listing bid requests and submit sealed proposals.
 * 9.3.4: CMA structured comps
 * 9.3.5: Proposal draft save/load via localStorage
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Calendar, FileText, Plus, Trash2, Save } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import {
  listingService,
  formatCommission,
  type ListingBidRequest,
  type CMAComp,
  type CounterProposal,
} from "@/services/listing";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const UI = {
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

const emptyComp = (): CMAComp => ({
  address: "", salePriceCents: 0, bedrooms: 3, bathrooms: 2, sqft: 0, soldDate: "",
});

function draftKey(reqId: string) { return `proposal_draft_${reqId}`; }

function loadDraft(reqId: string): { form: ProposalForm; comps: CMAComp[] } | null {
  try {
    const raw = localStorage.getItem(draftKey(reqId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(reqId: string, form: ProposalForm, comps: CMAComp[]) {
  localStorage.setItem(draftKey(reqId), JSON.stringify({ form, comps }));
}

function clearDraft(reqId: string) {
  localStorage.removeItem(draftKey(reqId));
}

export default function AgentMarketplacePage() {
  const navigate = useNavigate();

  const [requests,     setRequests]     = useState<ListingBidRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeReqId,  setActiveReqId]  = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [form,         setForm]         = useState<ProposalForm>(emptyForm);
  const [cmaComps,     setCmaComps]     = useState<CMAComp[]>([]);
  const [myCounters,   setMyCounters]   = useState<CounterProposal[]>([]);
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    listingService.getOpenBidRequests()
      .then(setRequests)
      .catch(() => toast.error("Failed to load open listings"))
      .finally(() => setLoading(false));
    listingService.getMyCounters()
      .then(setMyCounters)
      .catch(() => {});
  }, []);

  function set(field: keyof ProposalForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openForm(reqId: string) {
    setActiveReqId(reqId);
    // 9.3.5 — restore draft if available
    const draft = loadDraft(reqId);
    if (draft) {
      setForm(draft.form);
      setCmaComps(draft.comps ?? []);
    } else {
      setForm(emptyForm);
      setCmaComps([]);
    }
  }

  function closeForm() {
    setActiveReqId(null);
  }

  function handleSaveDraft() {
    if (!activeReqId) return;
    saveDraft(activeReqId, form, cmaComps);
    toast.success("Draft saved.");
  }

  // CMA comps helpers — 9.3.4
  function addComp() {
    setCmaComps((cs) => [...cs, emptyComp()]);
  }

  function removeComp(idx: number) {
    setCmaComps((cs) => cs.filter((_, i) => i !== idx));
  }

  function updateComp(idx: number, field: keyof CMAComp, value: string | number) {
    setCmaComps((cs) => cs.map((c, i) => i === idx ? { ...c, [field]: value } : c));
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
        cmaComps,
      });
      clearDraft(activeReqId); // 9.3.5
      toast.success("Proposal submitted — it will remain sealed until the bid deadline.");
      closeForm();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit proposal");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespondToCounter(counterId: string, response: "accept" | "reject") {
    try {
      await listingService.respondToCounter(counterId, response);
      setMyCounters((cs) => cs.filter((c) => c.id !== counterId));
      toast.success(response === "accept" ? "Counter accepted." : "Counter declined.");
    } catch {
      toast.error("Failed to respond to counter.");
    }
  }

  // Compute live commission dollar amount from form fields
  const activeReq   = requests.find((r) => r.id === activeReqId);
  const refPrice    = activeReq?.desiredSalePrice ?? null;
  const commBps     = parseInt(form.commissionBps, 10) || 0;
  const commDollars = refPrice ? Math.round(refPrice * commBps / 10_000) : null;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
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
          Agent Marketplace
        </h1>
        <p style={{ fontFamily: UI.sans, fontSize: "0.9rem", color: UI.inkLight, margin: "0 0 2rem" }}>
          Browse open listing bid requests and submit sealed proposals. Your commission and terms remain hidden until the deadline.
        </p>

        {/* 9.4.6 — Pending counter offers from homeowners */}
        {myCounters.filter((c) => c.status === "Pending").length > 0 && (
          <div style={{ border: `1px solid ${UI.rule}`, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.1rem", color: UI.ink, margin: "0 0 1rem" }}>
              Pending Counter Offers
            </h2>
            {myCounters.filter((c) => c.status === "Pending").map((counter) => (
              <div key={counter.id} style={{ borderTop: `1px solid ${UI.rule}`, paddingTop: "0.75rem", marginTop: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    Request {counter.requestId}
                  </div>
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", color: UI.ink }}>
                    {`${formatCommission(counter.commissionBps)}${counter.notes ? ` · "${counter.notes}"` : ""}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button onClick={() => handleRespondToCounter(counter.id, "accept")}>
                    Accept
                  </Button>
                  <button
                    onClick={() => handleRespondToCounter(counter.id, "reject")}
                    style={{
                      background: "none", border: `1px solid ${UI.rule}`, cursor: "pointer",
                      fontFamily: UI.mono, fontSize: "0.72rem", color: UI.inkLight,
                      letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.5rem 1rem",
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>Loading open listings…</p>
        )}

        {!loading && requests.length === 0 && (
          <div style={{ border: `1px solid ${UI.rule}`, padding: "2rem", textAlign: "center" }}>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.1rem", color: UI.ink, margin: "0 0 0.5rem" }}>
              No open listings at the moment
            </p>
            <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, margin: 0 }}>
              Check back soon — new bid requests are posted as homeowners prepare to list.
            </p>
          </div>
        )}

        {/* Open request cards */}
        {requests.map((req) => (
          <div key={req.id} style={{ border: `1px solid ${UI.rule}`, padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  Property ID: {req.propertyId}
                </div>
                {req.desiredSalePrice && (
                  <div style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.25rem", color: UI.ink }}>
                    {formatPrice(req.desiredSalePrice)}
                    <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", fontWeight: 400, color: UI.inkLight, marginLeft: "0.5rem" }}>desired price</span>
                  </div>
                )}
              </div>
              {/* Deadline badge */}
              <div style={{
                border: `1px solid ${UI.rule}`, padding: "0.35rem 0.75rem",
                fontFamily: UI.mono, fontSize: "0.68rem", color: UI.inkLight,
                letterSpacing: "0.05em", textTransform: "uppercase",
                display: "flex", alignItems: "center", gap: "0.35rem",
              }}>
                <Calendar size={11} />
                Deadline: {formatDate(req.bidDeadline)}
                {/* 9.2.5 — deadline info visible inline */}
                {req.bidDeadline > Date.now() && (
                  <span style={{ color: UI.sage }}> · closes {formatDate(req.bidDeadline)}</span>
                )}
              </div>
            </div>

            {/* Notes */}
            {req.notes && (
              <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.ink, margin: "0 0 1rem" }}>
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
              <form onSubmit={handleSubmit} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem", borderTop: `1px solid ${UI.rule}`, paddingTop: "1.25rem" }}>
                <h3 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1rem", color: UI.ink, margin: 0 }}>
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
                    <p style={{ fontFamily: UI.mono, fontSize: "0.62rem", color: UI.sage, margin: "0.25rem 0 0", letterSpacing: "0.04em" }}>
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

                {/* 9.3.4 — Structured CMA comps */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={labelStyle}>Comparable Sales (CMA)</span>
                    <button
                      type="button"
                      onClick={addComp}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.3rem",
                        background: "none", border: `1px solid ${UI.rule}`, cursor: "pointer",
                        fontFamily: UI.mono, fontSize: "0.65rem", color: UI.ink,
                        padding: "0.25rem 0.6rem", letterSpacing: "0.04em",
                      }}
                      aria-label="Add Comp"
                    >
                      <Plus size={11} /> Add Comp
                    </button>
                  </div>
                  {cmaComps.map((comp, idx) => (
                    <div key={idx} style={{ border: `1px solid ${UI.rule}`, padding: "0.75rem", marginBottom: "0.5rem" }}>
                      <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto", gap: "0.5rem", alignItems: "end", minWidth: isMobile ? "560px" : undefined }}>
                        <input
                          type="text"
                          placeholder="Comp address"
                          value={comp.address}
                          onChange={(e) => updateComp(idx, "address", e.target.value)}
                          style={{ ...fieldStyle, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
                        />
                        <input
                          type="number"
                          placeholder="Sale $"
                          value={comp.salePriceCents ? comp.salePriceCents / 100 : ""}
                          onChange={(e) => updateComp(idx, "salePriceCents", Math.round(parseFloat(e.target.value) * 100) || 0)}
                          style={{ ...fieldStyle, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
                        />
                        <input
                          type="number"
                          placeholder="Bed"
                          value={comp.bedrooms}
                          onChange={(e) => updateComp(idx, "bedrooms", parseInt(e.target.value) || 0)}
                          style={{ ...fieldStyle, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
                        />
                        <input
                          type="number"
                          placeholder="Bath"
                          value={comp.bathrooms}
                          onChange={(e) => updateComp(idx, "bathrooms", parseFloat(e.target.value) || 0)}
                          style={{ ...fieldStyle, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
                        />
                        <input
                          type="number"
                          placeholder="Sqft"
                          value={comp.sqft || ""}
                          onChange={(e) => updateComp(idx, "sqft", parseInt(e.target.value) || 0)}
                          style={{ ...fieldStyle, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
                        />
                        <input
                          type="date"
                          value={comp.soldDate}
                          onChange={(e) => updateComp(idx, "soldDate", e.target.value)}
                          style={{ ...fieldStyle, padding: "0.4rem 0.5rem", fontSize: "0.8rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => removeComp(idx)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, padding: "0.4rem" }}
                          aria-label="Remove comp"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      </div> {/* /scroll wrapper */}
                    </div>
                  ))}
                  {cmaComps.length === 0 && (
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, margin: 0 }}>
                      No comps added — click "Add Comp" to include comparable sales.
                    </p>
                  )}
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

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Button type="submit" disabled={submitting} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Send size={13} />
                    {submitting ? "Submitting…" : "Submit Proposal"}
                  </Button>
                  {/* 9.3.5 — Save Draft */}
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.35rem",
                      background: "none", border: `1px solid ${UI.rule}`, cursor: "pointer",
                      fontFamily: UI.mono, fontSize: "0.72rem", color: UI.ink,
                      letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.5rem 1rem",
                    }}
                    aria-label="Save Draft"
                  >
                    <Save size={12} /> Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={closeForm}
                    style={{
                      background: "none", border: `1px solid ${UI.rule}`, cursor: "pointer",
                      fontFamily: UI.mono, fontSize: "0.72rem", color: UI.inkLight,
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
