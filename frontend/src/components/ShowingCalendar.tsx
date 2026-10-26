/**
 * ShowingCalendar — Epic 10.4.2
 *
 * Seller-facing list of confirmed (Accepted) showings with the time the buyer
 * asked for. Times are the buyer's own words ("Saturday morning"), so there's
 * no calendar export.
 */

import { contactHref, type ShowingRequest } from "@/services/showingRequest";
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
  requests: ShowingRequest[];
}

export default function ShowingCalendar({ requests }: ShowingCalendarProps) {
  const confirmed = requests.filter((r) => r.status === "Accepted");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
        <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.15rem", color: UI.ink, margin: 0 }}>
          Confirmed Showings
        </h2>
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
                {r.preferredTime} · {contactHref(r.contact)
                  ? <a href={contactHref(r.contact)!} style={{ color: "inherit" }}>{r.contact}</a>
                  : r.contact}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
