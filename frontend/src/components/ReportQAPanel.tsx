/**
 * ReportQAPanel — Epic 10.4.4
 *
 * Buyer-facing: submit questions about a property's HomeGentic report.
 * Seller-facing: review submitted questions.
 */

import React, { useState, useEffect } from "react";
import { reportQAService, type ReportQA } from "@/services/reportQA";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

export interface ReportQAPanelProps {
  propertyId: string;
  sellerView: boolean;
}

export default function ReportQAPanel({ propertyId, sellerView }: ReportQAPanelProps) {
  const [items,    setItems]    = useState<ReportQA[]>(() => reportQAService.getByProperty(propertyId));
  const [question, setQuestion] = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setItems(reportQAService.getByProperty(propertyId));
  }, [propertyId]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    try {
      const qa = await reportQAService.ask(propertyId, question);
      setItems((prev) => [...prev, qa]);
      setQuestion("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.15rem", color: S.ink, margin: "0 0 0.75rem" }}>
        Questions &amp; Answers
      </h2>

      {items.length > 0 && (
        <div style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {items.map((qa) => (
            <div key={qa.id} style={{ border: `1px solid ${S.rule}`, padding: "0.75rem 1rem" }}>
              <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.875rem", color: S.ink, marginBottom: "0.25rem" }}>
                {qa.question}
              </div>
              <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: qa.answer ? S.ink : S.inkLight }}>
                {qa.answer ?? "No answer yet"}
              </div>
            </div>
          ))}
        </div>
      )}

      {!sellerView && (
        <form onSubmit={handleAsk} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div>
            <label
              htmlFor="qa-question"
              style={{ display: "block", fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "0.25rem" }}
            >
              Your Question
            </label>
            <input
              id="qa-question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about maintenance, systems, or history…"
              style={{ width: "100%", padding: "0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", boxSizing: "border-box" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            aria-label="Ask question"
            style={{ alignSelf: "flex-start", padding: "0.4rem 1rem", background: S.ink, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.75rem", cursor: "pointer" }}
          >
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
