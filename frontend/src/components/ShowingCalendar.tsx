/**
 * ShowingCalendar — Epic 10.4.2
 *
 * Seller-facing list of confirmed (Accepted) showings.
 * Includes iCal export.
 */

import React, { useState, useEffect } from "react";
import { showingRequestService, generateIcal, type ShowingRequest } from "@/services/showingRequest";
import { V2_COLORS, V2_FONTS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  inkLight: V2_COLORS.muted,
  rule:     V2_COLORS.border,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.mono,
  sans:     V2_FONTS.body,
};

export interface ShowingCalendarProps {
  propertyId: string;
}

export default function ShowingCalendar({ propertyId }: ShowingCalendarProps) {
  const [all, setAll] = useState<ShowingRequest[]>(() =>
    showingRequestService.getByProperty(propertyId)
  );

  useEffect(() => {
    setAll(showingRequestService.getByProperty(propertyId));
  }, [propertyId]);

  const confirmed = all.filter((r) => r.status === "Accepted");

  function handleExportIcal() {
    const ics = generateIcal(confirmed);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "showings.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
        <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.15rem", color: UI.ink, margin: 0 }}>
          Confirmed Showings
        </h2>
        {confirmed.length > 0 && (
          <button
            onClick={handleExportIcal}
            aria-label="Export iCal"
            style={{ padding: "0.3rem 0.75rem", background: "transparent", color: UI.ink, border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Export iCal
          </button>
        )}
      </div>

      {confirmed.length === 0 ? (
        <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight }}>
          No confirmed showings yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {confirmed.map((r) => (
            <div key={r.id} style={{ border: `1px solid ${UI.rule}`, padding: "0.75rem 1rem" }}>
              <div style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.9rem", color: UI.ink }}>
                {r.name}
              </div>
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
                {r.preferredTime} · {r.contact}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
