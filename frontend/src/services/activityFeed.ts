import { type Job } from "./job";
import { type QuoteRequest } from "./quote";
import { type BillRecord } from "./billService";

export interface ActivityEvent {
  id:        string;
  type:      "pending_verification" | "warranty_expiring" | "job_pending_sig" | "recent_job" | "open_quote" | "bill_anomaly" | "insurance_trigger";
  title:     string;
  detail:    string;
  href:      string;
  timestamp: number;
}

export function deriveEvents(properties: any[], jobs: Job[], quotes: QuoteRequest[], bills: BillRecord[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = Date.now();

  for (const p of properties) {
    if (p.verificationLevel === "PendingReview") {
      events.push({ id: `pv-${p.id}`, type: "pending_verification", title: "Verification pending", detail: `${p.address} — under review`, href: `/properties/${p.id}`, timestamp: Number(p.createdAt ?? now) / 1_000_000 });
    }
  }

  for (const j of jobs) {
    if (!j.verified && !j.homeownerSigned) {
      events.push({ id: `sig-${j.id}`, type: "job_pending_sig", title: "Awaiting your signature", detail: `${j.serviceType} · ${j.date}`, href: `/properties/${j.propertyId}`, timestamp: j.createdAt ?? now });
    }
  }

  for (const j of jobs) {
    if (!j.warrantyMonths || j.warrantyMonths <= 0) continue;
    const expiry   = new Date(j.date).getTime() + j.warrantyMonths * 30.44 * 86400000;
    const daysLeft = Math.round((expiry - now) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 90) {
      events.push({ id: `wty-${j.id}`, type: "warranty_expiring", title: `Warranty expires in ${daysLeft}d`, detail: `${j.serviceType} · ${j.isDiy ? "DIY" : j.contractorName ?? ""}`, href: `/properties/${j.propertyId}`, timestamp: expiry });
    }
  }

  const recent = [...jobs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 5);
  for (const j of recent) {
    if (!events.some((e) => e.id.startsWith(`sig-${j.id}`) || e.id.startsWith(`wty-${j.id}`))) {
      events.push({ id: `job-${j.id}`, type: "recent_job", title: j.serviceType, detail: `${j.isDiy ? "DIY" : j.contractorName ?? ""} · $${(j.amount / 100).toLocaleString()} · ${j.date}`, href: `/properties/${j.propertyId}`, timestamp: j.createdAt ?? now });
    }
  }

  const openQuotes = quotes.filter((q) => q.status === "open" || q.status === "quoted");
  if (openQuotes.length > 0) {
    events.push({ id: "open-quotes", type: "open_quote", title: `${openQuotes.length} open quote request${openQuotes.length !== 1 ? "s" : ""}`, detail: "Contractors may have responded", href: "/quotes", timestamp: now });
  }

  for (const b of bills) {
    if (b.anomalyFlag) {
      events.push({
        id:        `bill-anomaly-${b.id}`,
        type:      "bill_anomaly",
        title:     `${b.billType} bill spike detected`,
        detail:    b.anomalyReason ?? `${b.provider} bill is above your 3-month average`,
        href:      `/properties/${b.propertyId}?tab=bills`,
        timestamp: b.uploadedAt,
      });
      if (b.billType === "Water") {
        events.push({
          id:        `insurance-trigger-${b.id}`,
          type:      "insurance_trigger",
          title:     "Unusual water usage — document before filing a claim",
          detail:    "Spike may indicate a slow leak. Log a plumbing job and generate your Insurance Defense report now.",
          href:      "/insurance-defense",
          timestamp: b.uploadedAt,
        });
      }
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
}
