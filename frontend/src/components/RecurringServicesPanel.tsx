import React from "react";
import { COLORS, FONTS, RADIUS } from "@/theme";
import type { RecurringService, VisitLog } from "@/services/recurringService";
import type { PlanTier } from "@/services/payment";
import { RecurringServiceCard } from "@/components/RecurringServiceCard";

const S = {
  ink:      COLORS.plum,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.mono,
};

export interface RecurringServicesPanelProps {
  services:     RecurringService[];
  visitLogMap:  Record<string, VisitLog[]>;
  userTier:     PlanTier;
  onAddService: () => void;
  onViewService: (id: string) => void;
}

export function RecurringServicesPanel({
  services,
  visitLogMap,
  onAddService,
}: RecurringServicesPanelProps) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            fontFamily: S.mono,
            fontSize: "0.65rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: S.inkLight,
          }}
        >
          Recurring Services
        </div>
        <button
          onClick={onAddService}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            fontFamily: S.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0.3rem 0.75rem",
            border: `1px solid ${S.sage}`,
            color: S.sage,
            background: "none",
            cursor: "pointer",
            borderRadius: RADIUS.sm,
          }}
        >
          + Add
        </button>
      </div>

      {services.length === 0 ? (
        <div
          style={{
            border: `1px solid ${S.rule}`,
            background: COLORS.white,
            padding: "1.5rem",
            textAlign: "center",
            borderRadius: RADIUS.card,
          }}
        >
          <p
            style={{
              fontSize: "0.85rem",
              fontWeight: 300,
              color: S.inkLight,
              marginBottom: "0.75rem",
            }}
          >
            Lawn care, pest control, pool service — log ongoing contracts once and let the visit
            log do the rest.
          </p>
          <button
            onClick={onAddService}
            style={{
              fontFamily: S.mono,
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.4rem 1rem",
              border: `1px solid ${S.ink}`,
              background: "none",
              cursor: "pointer",
              color: S.ink,
              borderRadius: RADIUS.sm,
            }}
          >
            Add first service →
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {services.map((svc) => (
            <RecurringServiceCard
              key={svc.id}
              service={svc}
              visitLogs={visitLogMap[svc.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default RecurringServicesPanel;
