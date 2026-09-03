/**
 * ConfirmSelectionModal — Bid to List H5
 * The only screen where money moves. Irreversible. Disclosure copy and the
 * checkbox are compliance surface, not decoration — kept verbatim.
 */

import React, { useState } from "react";
import { Button } from "@/components/Button";
import { listingService, type MaskedProposal } from "@/services/listing";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import toast from "react-hot-toast";

const UI = V2_COLORS;

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

export interface ConfirmSelectionModalProps {
  proposal: MaskedProposal;
  requestId: string;
  feeCents: number;
  onClose: () => void;
}

const CONSEQUENCE_ROWS: { label: string; note: string; ok: boolean }[] = [
  { label: "Their card is charged", note: "Authorized when they bid. The charge is what performs the introduction.", ok: true },
  { label: "Your name, address and record release to them", note: "Maintenance history, permits and invoiced work, all at once.", ok: true },
  { label: "Their name, license and contact release to you", note: "Verified against the Florida DBPR before they were allowed to bid.", ok: true },
  { label: "The other four bids close permanently", note: "They cannot be reopened while this selection stands.", ok: false },
];

export function ConfirmSelectionModal({ proposal, requestId, feeCents, onClose }: ConfirmSelectionModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!acknowledged || submitting) return;
    setSubmitting(true);
    try {
      const feeId = await listingService.acceptProposal(proposal.id);
      const res = await fetch("/api/listing-fee/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeId, proposalId: proposal.id, requestId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // Stripe not configured (local/dev mock) — nothing was charged; surface that plainly.
      toast("Payment not configured in this environment — selection recorded but unpaid.");
      setSubmitting(false);
    } catch (err: any) {
      // Invariant 04: a failed charge/selection leaves the auction fully masked and live.
      toast.error(err?.message ?? "Selection failed — the auction is still live and masked.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(11,13,26,0.62)" }} onClick={submitting ? undefined : onClose} />
      <div style={{
        position: "relative", width: "min(560px, 100%)", background: UI.paper, borderRadius: V2_RADIUS.card + 6,
        boxShadow: "0 24px 60px rgba(11,13,26,0.4)", padding: 28, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: V2_RADIUS.input + 4, background: UI.vbadge, color: UI.blue,
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.mono, fontWeight: 700,
          }}>{proposal.letter}</div>
          <div>
            <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.1em", color: UI.blue, textTransform: "uppercase" }}>You are choosing</div>
            <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.1rem", color: UI.ink }}>
              Bid {proposal.letter} · {(proposal.commissionBps / 100).toFixed(2).replace(/0$/, "")}% · {money(proposal.suggestedListCents)}
            </div>
          </div>
        </div>

        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.9rem", color: UI.muted2, marginBottom: 18 }}>
          Choosing ends the auction. The other four bids close and none of those agents will ever learn your address.
        </p>

        <div style={{ border: `1px solid ${UI.border}`, borderRadius: V2_RADIUS.card, overflow: "hidden", marginBottom: 18 }}>
          {CONSEQUENCE_ROWS.map((row, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, padding: "12px 16px",
              background: row.ok ? "transparent" : "#FFFBF9",
              borderTop: i > 0 ? `1px solid ${UI.border}` : "none",
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                background: row.ok ? UI.greenBg : UI.orangeBg, color: row.ok ? UI.green : UI.orange,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700,
              }}>{row.ok ? "✓" : "✕"}</span>
              <div>
                <div style={{ fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.875rem", color: UI.ink }}>{row.label}</div>
                <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: UI.muted, marginTop: 2 }}>{row.note}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.card, padding: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.06em", color: UI.muted, textTransform: "uppercase" }}>
            <span>Charged to the agent</span>
            <span>Charged to you</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.1rem", color: UI.ink }}>{money(feeCents)}</span>
            <span style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.1rem", color: UI.green }}>$0</span>
          </div>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.muted, marginTop: 8, marginBottom: 0 }}>
            Your commission is whatever you and the agent sign. HomeGentic takes nothing from it.
          </p>
        </div>

        <div style={{ background: UI.amberBg, border: `1px solid ${UI.amberBorder}`, borderRadius: V2_RADIUS.card - 4, padding: "12px 14px", marginBottom: 18 }}>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.amberText, margin: 0 }}>
            This is an introduction, not a listing agreement. You are under no obligation to sign with this agent,
            and you can walk away after meeting them. If you never sign a listing agreement with anyone, the agent's
            {" "}{money(feeCents)} is refunded.
          </p>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
          />
          <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>
            I understand my name, address, contact details and maintenance record are released to this agent
            as soon as their payment clears.
          </span>
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" onClick={onClose} disabled={submitting} style={{ flex: 1 }}>Back</Button>
          <Button
            variant="primary"
            disabled={!acknowledged}
            loading={submitting}
            onClick={handleConfirm}
            style={{ flex: 2, minHeight: 52 }}
          >
            Choose Bid {proposal.letter} and unmask
          </Button>
        </div>
      </div>
    </div>
  );
}
