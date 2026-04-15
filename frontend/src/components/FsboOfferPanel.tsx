/**
 * FsboOfferPanel — Epic 10.5
 *
 * Seller-facing offer management panel for FSBO listings.
 *
 *   10.5.1 — Offer intake form
 *   10.5.2 — Offer comparison view
 *   10.5.3 — Net proceeds per offer
 *   10.5.4 — Counter-offer thread per offer
 *   10.5.5 — Accept → Under Contract
 */

import React, { useState, useEffect } from "react";
import {
  fsboOfferService,
  computeFsboNetProceeds,
  computeContingencyRisk,
  type FsboOffer,
  type LogFsboOfferInput,
} from "@/services/fsboOffer";
import { fsboService } from "@/services/fsbo";
import { COLORS, FONTS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

function fmt(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const STATUS_COLOR: Record<string, string> = {
  Active:    UI.inkLight,
  Countered: "#e37400",
  Accepted:  "#188038",
  Rejected:  "#c0392b",
};

const CONTINGENCY_OPTIONS = [
  { value: "inspection",  label: "Inspection" },
  { value: "financing",   label: "Financing" },
  { value: "appraisal",   label: "Appraisal" },
  { value: "saleOfHome",  label: "Sale of Home" },
];

// ─── Counter thread row ───────────────────────────────────────────────────────

interface OfferRowProps {
  offer:            FsboOffer;
  underContract:    boolean;
  onUpdate:         (updated: FsboOffer) => void;
  onContractUpdate: () => void;
}

function OfferRow({ offer, underContract, onUpdate, onContractUpdate }: OfferRowProps) {
  const [countering,     setCountering]     = useState(false);
  const [counterAmount,  setCounterAmount]  = useState("");
  const [counterNotes,   setCounterNotes]   = useState("");

  const net  = computeFsboNetProceeds(offer.offerAmountCents);
  const risk = computeContingencyRisk(offer.contingencies);

  async function handleAccept() {
    const updated = await fsboOfferService.accept(offer.id);
    onUpdate(updated);
    fsboService.setUnderContract(offer.propertyId);
    onContractUpdate();
  }

  async function handleReject() {
    onUpdate(await fsboOfferService.reject(offer.id));
  }

  async function handleCounterSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(counterAmount) * 100);
    if (!cents || cents <= 0) return;
    const updated = await fsboOfferService.addCounter(offer.id, {
      amountCents: cents,
      notes:       counterNotes,
      fromSeller:  true,
    });
    onUpdate(updated);
    setCountering(false);
    setCounterAmount("");
    setCounterNotes("");
  }

  return (
    <div style={{ border: `1px solid ${UI.rule}`, padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div>
          <span style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.95rem", color: UI.ink }}>
            {offer.buyerName}
          </span>
          {offer.hasEscalationClause && (
            <span style={{ marginLeft: "0.5rem", fontFamily: UI.mono, fontSize: "0.6rem", color: "#e37400", textTransform: "uppercase" }}>
              Escalation
            </span>
          )}
        </div>
        <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color: STATUS_COLOR[offer.status], textTransform: "uppercase" }}>
          {offer.status}
        </span>
      </div>

      {/* Key figures */}
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <div>
          <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase" }}>Offer</div>
          <div style={{ fontFamily: UI.sans, fontWeight: 700, fontSize: "1rem", color: UI.ink }}>{fmt(offer.offerAmountCents)}</div>
        </div>
        <div>
          <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase" }}>Est. Net</div>
          <div style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.95rem", color: "#188038" }}>{fmt(net)}</div>
        </div>
        <div>
          <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase" }}>Earnest</div>
          <div style={{ fontFamily: UI.sans, fontSize: "0.9rem", color: UI.ink }}>{fmt(offer.earnestMoneyCents)}</div>
        </div>
        <div>
          <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, textTransform: "uppercase" }}>Contingencies</div>
          <div style={{ fontFamily: UI.sans, fontSize: "0.9rem", color: risk > 1 ? "#c0392b" : UI.ink }}>
            {risk} contingenc{risk === 1 ? "y" : "ies"}
          </div>
        </div>
      </div>

      {/* Counter thread */}
      {offer.counters.length > 0 && (
        <div style={{ borderTop: `1px solid ${UI.rule}`, paddingTop: "0.5rem", marginBottom: "0.5rem" }}>
          {offer.counters.map((c) => (
            <div key={c.id} style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.ink, marginBottom: "0.25rem" }}>
              <strong>{fmt(c.amountCents)}</strong>
              {c.notes && <span style={{ color: UI.inkLight }}> — {c.notes}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Actions (hidden once Under Contract) */}
      {!underContract && offer.status === "Active" && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={handleAccept}
            aria-label="Accept Offer"
            style={{ padding: "0.3rem 0.75rem", background: "#188038", color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Accept Offer
          </button>
          <button
            onClick={handleReject}
            aria-label="Reject Offer"
            style={{ padding: "0.3rem 0.75rem", background: "#c0392b", color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Reject
          </button>
          {!countering && (
            <button
              onClick={() => setCountering(true)}
              style={{ padding: "0.3rem 0.75rem", background: "transparent", color: UI.ink, border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
            >
              Counter
            </button>
          )}
        </div>
      )}

      {countering && (
        <form aria-label="Counter Offer Form" onSubmit={handleCounterSubmit} style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <div>
              <label
                htmlFor={`ca-${offer.id}`}
                style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}
              >
                Counter Amount ($)
              </label>
              <input
                id={`ca-${offer.id}`}
                type="number"
                min="1"
                step="1000"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                style={{ padding: "0.35rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.8rem", width: "10rem" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: "12rem" }}>
              <label
                htmlFor={`cn-${offer.id}`}
                style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}
              >
                Counter Notes
              </label>
              <input
                id={`cn-${offer.id}`}
                type="text"
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                style={{ padding: "0.35rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.sans, fontSize: "0.8rem", width: "100%", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <button
            type="submit"
            style={{ alignSelf: "flex-start", padding: "0.35rem 0.75rem", background: UI.ink, color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Send Counter
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────

export interface FsboOfferPanelProps {
  propertyId:     string;
  listPriceCents: number;
}

export default function FsboOfferPanel({ propertyId, listPriceCents }: FsboOfferPanelProps) {
  const [offers,        setOffers]        = useState<FsboOffer[]>(() => fsboOfferService.getByProperty(propertyId));
  const [underContract, setUnderContract] = useState(false);

  // Form state
  const [buyerName,     setBuyerName]     = useState("");
  const [offerAmount,   setOfferAmount]   = useState("");
  const [earnestMoney,  setEarnestMoney]  = useState("");
  const [closeDate,     setCloseDate]     = useState("");
  const [contingencies, setContingencies] = useState<string[]>([]);
  const [escalation,    setEscalation]    = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  useEffect(() => {
    setOffers(fsboOfferService.getByProperty(propertyId));
  }, [propertyId]);

  function toggleContingency(val: string) {
    setContingencies((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const offerCents  = Math.round(parseFloat(offerAmount)  * 100);
    const earnestCents = Math.round(parseFloat(earnestMoney) * 100);
    if (!offerCents || !buyerName.trim()) return;

    const input: LogFsboOfferInput = {
      buyerName:           buyerName.trim(),
      offerAmountCents:    offerCents,
      earnestMoneyCents:   earnestCents || 0,
      contingencies:       [...contingencies],
      closeDateMs:         closeDate ? new Date(closeDate).getTime() : Date.now(),
      hasEscalationClause: escalation,
    };

    setSubmitting(true);
    try {
      const offer = await fsboOfferService.logOffer(propertyId, input);
      setOffers((prev) => [...prev, offer]);
      setBuyerName(""); setOfferAmount(""); setEarnestMoney("");
      setCloseDate(""); setContingencies([]); setEscalation(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleUpdate(updated: FsboOffer) {
    setOffers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  return (
    <div>
      <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.25rem", color: UI.ink, margin: "0 0 0.75rem" }}>
        Offers
      </h2>

      {/* Under Contract banner */}
      {underContract && (
        <div style={{ background: "#f0faf4", border: "1px solid #c3e6cb", padding: "0.75rem 1rem", marginBottom: "1rem", fontFamily: UI.sans, fontWeight: 600, color: "#188038" }}>
          Under Contract — offer accepted. Your listing is no longer active.
        </div>
      )}

      {/* Offer list */}
      {offers.length === 0 ? (
        <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight, marginBottom: "1rem" }}>
          No offers logged yet.
        </p>
      ) : (
        <div style={{ marginBottom: "1rem" }}>
          {offers.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              underContract={underContract}
              onUpdate={handleUpdate}
              onContractUpdate={() => setUnderContract(true)}
            />
          ))}
        </div>
      )}

      {/* Intake form */}
      {!underContract && (
        <form
          aria-label="Log Offer"
          onSubmit={handleSubmit}
          style={{ border: `1px solid ${UI.rule}`, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <h3 style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.ink, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Log an Offer
          </h3>

          {/* Buyer name */}
          <div>
            <label htmlFor="fo-buyer" style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>
              Buyer Name
            </label>
            <input id="fo-buyer" type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required
              style={{ padding: "0.4rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.sans, fontSize: "0.875rem", width: "100%", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {/* Offer amount */}
            <div>
              <label htmlFor="fo-amount" style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>
                Offer Amount ($)
              </label>
              <input id="fo-amount" type="number" min="1" step="1000" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)}
                style={{ padding: "0.4rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.875rem", width: "10rem" }} />
            </div>

            {/* Earnest money */}
            <div>
              <label htmlFor="fo-earnest" style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>
                Earnest Money ($)
              </label>
              <input id="fo-earnest" type="number" min="0" step="500" value={earnestMoney} onChange={(e) => setEarnestMoney(e.target.value)}
                style={{ padding: "0.4rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.875rem", width: "10rem" }} />
            </div>

            {/* Close date */}
            <div>
              <label htmlFor="fo-close" style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>
                Close Date
              </label>
              <input id="fo-close" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)}
                style={{ padding: "0.4rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.875rem" }} />
            </div>
          </div>

          {/* Contingencies */}
          <div>
            <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.35rem" }}>
              Contingencies
            </div>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {CONTINGENCY_OPTIONS.map(({ value, label }) => (
                <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: UI.sans, fontSize: "0.8rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={contingencies.includes(value)}
                    onChange={() => toggleContingency(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Escalation clause */}
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: UI.sans, fontSize: "0.8rem", cursor: "pointer" }}>
            <input type="checkbox" checked={escalation} onChange={(e) => setEscalation(e.target.checked)} />
            Escalation Clause
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{ alignSelf: "flex-start", padding: "0.4rem 1rem", background: UI.ink, color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.75rem", cursor: "pointer" }}
          >
            Log Offer
          </button>
        </form>
      )}
    </div>
  );
}
