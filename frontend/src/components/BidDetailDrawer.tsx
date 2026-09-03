/**
 * BidDetailDrawer — Bid to List H4
 * 620px slide-in drawer: one bid's detail + the anonymous message thread.
 * Neither side unmasks here — see ConfirmSelectionModal (H5) for that.
 */

import React, { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { Button } from "@/components/Button";
import { listingService, type MaskedProposal, type ThreadMessage } from "@/services/listing";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import toast from "react-hot-toast";

const UI = V2_COLORS;

function money(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

export interface BidDetailDrawerProps {
  proposal: MaskedProposal;
  onClose: () => void;
  onChoose: (proposal: MaskedProposal) => void;
}

export function BidDetailDrawer({ proposal, onClose, onChoose }: BidDetailDrawerProps) {
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listingService.getThread(proposal.id).then((msgs) => { if (!cancelled) setThread(msgs); }).catch(() => {});
    return () => { cancelled = true; };
  }, [proposal.id]);

  async function sendMessage() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const msg = await listingService.postMessage(proposal.id, draft, "seller");
      setThread((t) => [...t, msg]);
      setDraft("");
    } catch (err: any) {
      toast.error(err?.message ?? "Message failed to send");
    } finally {
      setSending(false);
    }
  }

  const statLabel = (label: string, value: string, tone: "good" | "warn" | "plain" = "plain") => {
    const bg = tone === "good" ? UI.greenBg : tone === "warn" ? UI.orangeBg : UI.neutralSurface;
    const color = tone === "good" ? UI.green : tone === "warn" ? UI.orange : UI.ink;
    return (
      <div style={{ background: bg, borderRadius: V2_RADIUS.input + 4, padding: 14 }}>
        <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.05rem", color, marginTop: 4 }}>{value}</div>
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(11,13,26,0.5)" }} />
      <div style={{
        position: "relative", width: "min(620px, 100vw)", height: "100%", background: UI.paper,
        display: "flex", flexDirection: "column", overflowY: "auto",
        boxShadow: "-8px 0 32px rgba(11,13,26,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${UI.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 46, height: 46, borderRadius: V2_RADIUS.input + 4, background: UI.vbadge, color: UI.blue,
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V2_FONTS.mono, fontWeight: 700, fontSize: "1.1rem",
            }}>{proposal.letter}</div>
            <div>
              <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.05rem", color: UI.ink }}>Bid {proposal.letter}</div>
              <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.06em", color: UI.blue }}>
                {proposal.status === "Accepted" ? "SELECTED" : "SHORTLISTED · IDENTITY SEALED"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: V2_RADIUS.sm + 4, background: UI.neutralSurface, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} color={UI.muted} />
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {statLabel("Commission", `${(proposal.commissionBps / 100).toFixed(2).replace(/0$/, "")}%`)}
            {statLabel("Suggested list", money(proposal.suggestedListCents), proposal.derived.overCompFlag ? "warn" : "plain")}
            {statLabel("Est. net to you", money(proposal.derived.estNetToSellerCents), "good")}
            {statLabel("Avg DOM", `${proposal.agentRecord.avgDom} d`)}
          </div>

          <div>
            <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>
              Their record in this zip
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {statLabel("Closed sales", String(proposal.agentRecord.closedInZip))}
              {statLabel("Sale to list", `${(proposal.agentRecord.saleToListRatioBps / 100).toFixed(1)}%`, proposal.agentRecord.saleToListRatioBps >= 10000 ? "good" : "plain")}
            </div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.muted, marginTop: 8 }}>
              Under 100% means the price came down before the sale closed.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="primary" style={{ flex: 1, minHeight: 48 }} onClick={() => onChoose(proposal)}>
              Choose Bid {proposal.letter}
            </Button>
          </div>

          <div>
            <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase", marginBottom: 10 }}>
              Anonymous thread
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {thread.map((m) => {
                const mine = m.authorRole === "seller";
                return (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "82%", padding: "10px 14px",
                      background: mine ? UI.blue : UI.neutralSurface2,
                      color: mine ? UI.paper : UI.ink,
                      border: mine ? "none" : `1px solid ${UI.border}`,
                      borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      fontFamily: V2_FONTS.body, fontSize: "0.875rem",
                    }}>
                      {m.scrubbedBody}
                    </div>
                    {m.redactions.length > 0 && (
                      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", color: UI.orange, marginTop: 4, maxWidth: "82%" }}>
                        A {m.redactions[0]} was removed from this message. Contact details release automatically when you choose an agent.
                      </div>
                    )}
                  </div>
                );
              })}
              {thread.length === 0 && (
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.muted }}>No messages yet.</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                placeholder="Ask a question…"
                style={{ flex: 1, border: `1.5px solid ${UI.border}`, borderRadius: V2_RADIUS.input, padding: "10px 14px", fontFamily: V2_FONTS.body, fontSize: "0.875rem" }}
              />
              <Button variant="outline" size="sm" loading={sending} onClick={sendMessage} icon={<Send size={14} />} />
            </div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.72rem", color: UI.muted, marginTop: 6 }}>
              Phone numbers, emails and addresses are removed before sending.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
