/**
 * ContractorPro earnings view on the contractor dashboard: accepted bids by
 * month for the last 12 months, the average accepted bid, and a CSV of every
 * accepted bid. Amounts are bid values the homeowner accepted through
 * HomeGentic, not payments HomeGentic has seen. Contractor Free keeps the
 * "Earnings via HG" total in the stats row.
 */
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import type { Quote } from "@/services/quote";
import { V2_COLORS, V2_FONTS } from "@/theme";

const MONO = V2_FONTS.body;

export interface MonthEarnings { month: string; count: number; totalCents: number }

const monthKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Accepted bids per month (by the month the bid was sent), newest first, the last 12 months including empty ones. */
export function earningsByMonth(bids: Quote[], now = new Date()): MonthEarnings[] {
  const months: MonthEarnings[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d.getTime()), count: 0, totalCents: 0 });
  }
  for (const b of bids) {
    if (b.status !== "accepted") continue;
    const m = months.find((x) => x.month === monthKey(b.createdAt));
    if (m) { m.count += 1; m.totalCents += b.amount; }
  }
  return months;
}

export function earningsCsv(bids: Quote[]): string {
  const rows = bids
    .filter((b) => b.status === "accepted")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((b) => [new Date(b.createdAt).toISOString().slice(0, 10), b.requestId, b.id, (b.amount / 100).toFixed(2), String(b.timeline)].join(","));
  return ["date_sent,request_id,quote_id,amount_usd,timeline_days", ...rows].join("\n") + "\n";
}

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

export function EarningsView({ bids, isPro }: { bids: Quote[]; isPro: boolean }) {
  if (!isPro) {
    return (
      <p data-testid="earnings-upsell" style={{ fontFamily: MONO, fontSize: "0.7rem", color: V2_COLORS.muted, margin: "0 0 2rem" }}>
        ContractorPro adds a month-by-month earnings view and a CSV of your accepted bids.{" "}
        <Link to="/for-pros" style={{ color: V2_COLORS.blue }}>See ContractorPro</Link>
      </p>
    );
  }
  const months = earningsByMonth(bids);
  const won = bids.filter((b) => b.status === "accepted");
  const yearTotal = months.reduce((s, m) => s + m.totalCents, 0);
  const yearCount = months.reduce((s, m) => s + m.count, 0);
  const max = Math.max(1, ...months.map((m) => m.totalCents));

  const download = () => {
    const url = URL.createObjectURL(new Blob([earningsCsv(bids)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "homegentic-accepted-bids.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="earnings-view" style={{ border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper, padding: "1.25rem", marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: V2_COLORS.muted, margin: 0 }}>Earnings · last 12 months</p>
          <p style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.4rem", margin: "0.25rem 0 0" }}>
            {usd(yearTotal)} <span style={{ fontWeight: 400, fontSize: "0.85rem", color: V2_COLORS.muted }}>from {yearCount} accepted bid{yearCount === 1 ? "" : "s"}</span>
          </p>
          <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: V2_COLORS.muted, margin: "0.2rem 0 0" }}>
            {yearCount > 0 ? `Average accepted bid ${usd(yearTotal / yearCount)}. ` : ""}Bid values homeowners accepted, by the month you sent the bid.
          </p>
        </div>
        <button
          onClick={download}
          disabled={won.length === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: "0.65rem", padding: "0.45rem 0.9rem", border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper, cursor: won.length ? "pointer" : "not-allowed", borderRadius: 100 }}
        >
          <Download size={12} aria-hidden /> Download CSV
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "0.7rem" }}>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} style={{ borderTop: `1px solid ${V2_COLORS.border}` }}>
              <td style={{ padding: "0.35rem 0", width: "6.5rem", color: V2_COLORS.muted }}>{monthLabel(m.month)}</td>
              <td style={{ padding: "0.35rem 0.5rem" }} aria-hidden>
                <div style={{ height: 8, width: `${(m.totalCents / max) * 100}%`, background: V2_COLORS.blue, minWidth: m.totalCents ? 2 : 0 }} />
              </td>
              <td style={{ padding: "0.35rem 0", textAlign: "right", width: "8rem" }}>
                {m.count ? `${usd(m.totalCents)} · ${m.count}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
