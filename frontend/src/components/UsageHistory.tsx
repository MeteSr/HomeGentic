import { Gauge } from "lucide-react";
import { USAGE_LABELS, type UsageSummary } from "@/services/quoteUsage";
import { V2_COLORS, V2_FONTS } from "@/theme";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function usageText(n: number, unit: string | null): string {
  return `${Math.round(n).toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

interface UsageHistoryProps {
  summary:        UsageSummary;
  title?:         string;
  /** Shown to the homeowner: removes the shared usage from the request. */
  onStopSharing?: () => void;
  stopping?:      boolean;
}

/** Monthly utility cost and usage shared on a quote request. */
export function UsageHistory({ summary, title = "Utility usage", onStopSharing, stopping }: UsageHistoryProps) {
  return (
    <div style={{ border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", borderBottom: `1px solid ${V2_COLORS.border}` }}>
        <Gauge size={14} color={V2_COLORS.blue} />
        <span style={{ flex: 1, fontFamily: V2_FONTS.body, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: V2_COLORS.muted }}>
          {title}
        </span>
        {onStopSharing && (
          <button
            onClick={onStopSharing}
            disabled={stopping}
            style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#C94C2E", background: "none", border: "1px solid #C94C2E40", padding: "0.2rem 0.625rem", cursor: stopping ? "default" : "pointer", opacity: stopping ? 0.6 : 1 }}
          >
            {stopping ? "Stopping…" : "Stop sharing"}
          </button>
        )}
      </div>

      {summary.series.map((s) => {
        const max = Math.max(...s.months.map((m) => m.amountCents), 1);
        const avg = s.months.reduce((t, m) => t + m.amountCents, 0) / s.months.length;
        const metered = s.months.filter((m) => m.usage !== null);
        const avgUsage = metered.length > 0 ? metered.reduce((t, m) => t + (m.usage ?? 0), 0) / metered.length : null;
        return (
          <div key={s.category} style={{ padding: "0.875rem 1rem", borderBottom: `1px solid ${V2_COLORS.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontWeight: 700, fontSize: "0.8rem", color: V2_COLORS.ink }}>
                {USAGE_LABELS[s.category]}
              </span>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", color: V2_COLORS.muted }}>
                avg {dollars(avg)}/mo{avgUsage !== null ? ` · ${usageText(avgUsage, s.unit)}/mo` : ""}
              </span>
            </div>
            <table style={{ width: "100%", maxWidth: "34rem", borderCollapse: "collapse", fontFamily: V2_FONTS.body, fontSize: "0.7rem" }}>
              <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                {USAGE_LABELS[s.category]} by month
              </caption>
              <tbody>
                {s.months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row" style={{ textAlign: "left", fontWeight: 400, color: V2_COLORS.muted, padding: "0.15rem 0", width: "3.75rem", whiteSpace: "nowrap" }}>
                      {monthLabel(m.month)}
                    </th>
                    <td style={{ padding: "0.15rem 0.5rem" }} aria-hidden="true">
                      <div style={{ height: 6, width: `${Math.max(2, (m.amountCents / max) * 100)}%`, background: V2_COLORS.blue, opacity: 0.75 }} />
                    </td>
                    <td style={{ textAlign: "right", color: V2_COLORS.ink, padding: "0.15rem 0", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {dollars(m.amountCents)}
                    </td>
                    <td style={{ textAlign: "right", color: V2_COLORS.muted, padding: "0.15rem 0 0.15rem 0.75rem", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", width: "6rem" }}>
                      {m.usage !== null ? usageText(m.usage, s.unit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", lineHeight: 1.5, color: V2_COLORS.muted, padding: "0.625rem 1rem" }}>
        From {onStopSharing ? "your" : "the homeowner's"} bills, as of {summary.asOf}. Only the utilities relevant to this job are shared.
      </p>
    </div>
  );
}
