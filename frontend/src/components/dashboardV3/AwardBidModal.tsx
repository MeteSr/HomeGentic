/**
 * AwardBidModal — compare real bids on an open quote request and accept one.
 *
 * The app already has a bid-accept flow on JobsPage (quoteService.accept),
 * but nothing that frames it as a focused "review three bids, pick a
 * winner" step the way the v3 dashboard design calls for. This wraps the
 * same real service call in that framing, fetching the actual quotes for
 * the request rather than inventing contractor names.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { quoteService, type Quote, type QuoteRequest } from "@/services/quote";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

interface AwardBidModalProps {
  open:       boolean;
  requestId:  string | null;
  onClose:    () => void;
  onAwarded:  () => void;
}

export function AwardBidModal({ open, requestId, onClose, onAwarded }: AwardBidModalProps) {
  const [request,  setRequest]  = useState<QuoteRequest | null>(null);
  const [quotes,   setQuotes]   = useState<Quote[]>([]);
  const [picked,   setPicked]   = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [awarding, setAwarding] = useState(false);

  useEffect(() => {
    if (!open || !requestId) return;
    setPicked(null);
    setLoading(true);
    Promise.all([quoteService.getRequest(requestId), quoteService.getQuotesForRequest(requestId)])
      .then(([req, qs]) => { setRequest(req ?? null); setQuotes(qs); })
      .catch((e) => toast.error(e.message ?? "Failed to load bids"))
      .finally(() => setLoading(false));
  }, [open, requestId]);

  if (!open || !requestId) return null;

  async function handleAward() {
    if (!picked) return;
    setAwarding(true);
    try {
      await quoteService.accept(picked);
      toast.success("Bid awarded. The other bids on this job are closed.");
      onAwarded();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to award the bid");
    } finally {
      setAwarding(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,26,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: V2_COLORS.paper, borderRadius: V2_RADIUS.card, boxShadow: V2_SHADOWS.modal, width: "100%", maxWidth: "34rem", maxHeight: "88vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 1.5rem", borderBottom: `1px solid ${V2_COLORS.border}` }}>
          <div>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.blue, margin: "0 0 0.2rem" }}>Review the bids</p>
            <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.25rem", color: V2_COLORS.ink, margin: 0 }}>{request?.serviceType ?? "Open job"}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted }}><X size={18} /></button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {loading && <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: V2_COLORS.muted }}>Loading bids…</p>}
          {!loading && quotes.length === 0 && <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: V2_COLORS.muted }}>No bids on this job yet.</p>}
          {quotes.filter((q) => q.status === "pending").map((q) => {
            const on = picked === q.id;
            return (
              <div key={q.id} onClick={() => setPicked(q.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0.9rem 1rem", borderRadius: "0.9rem", border: `1.5px solid ${on ? V2_COLORS.blue : V2_COLORS.border}`, background: on ? V2_COLORS.lblue : "transparent", cursor: "pointer" }}>
                <div>
                  <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.9rem", fontWeight: 700, color: V2_COLORS.ink }}>Bid #{q.id.slice(0, 8)}</div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.7rem", color: V2_COLORS.muted, marginTop: 2 }}>
                    {q.timeline} day{q.timeline === 1 ? "" : "s"} · valid until {new Date(q.validUntil).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ fontFamily: V2_FONTS.body, fontSize: "1rem", fontWeight: 700, color: V2_COLORS.ink }}>
                  ${(q.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", padding: "1rem 1.5rem", borderTop: `1px solid ${V2_COLORS.border}` }}>
          <button onClick={onClose} style={{ padding: "0.55rem 1.1rem", borderRadius: 100, border: `1.5px solid ${V2_COLORS.border}`, background: "transparent", color: V2_COLORS.muted, fontFamily: V2_FONTS.body, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleAward} disabled={!picked || awarding} style={{ padding: "0.55rem 1.4rem", borderRadius: 100, border: "none", background: V2_COLORS.blue, color: "#fff", fontFamily: V2_FONTS.body, fontWeight: 600, cursor: picked ? "pointer" : "not-allowed", opacity: picked ? 1 : 0.5 }}>
            {awarding ? "Awarding…" : "Award the job"}
          </button>
        </div>
      </div>
    </div>
  );
}
