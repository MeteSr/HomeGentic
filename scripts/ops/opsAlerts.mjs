// Decides what the hourly ops check alerts about, from what the monitoring
// canister holds. Pure, so tests/upgrade/ops-alerts.canister.test.ts can
// check the rules without a canister.
//
// Rules (each run looks back WINDOW minutes, a little over the hourly cron):
//   - Critical monitoring alerts created in the window.
//   - Service errors (Stripe webhook, email, 5xx, relay sends) that are
//     unresolved and were seen in the window. These repeat every hour while
//     they keep happening; resolve one (monitoring.resolveServiceError) to
//     acknowledge it. It reopens by itself if it happens again.
//   - Frontend errors first seen in the last day that are unresolved and were
//     seen in the window: a new error is reported for its first day, then
//     left to the dashboard. Resolving it silences it until it recurs.

const NS_PER_MIN = 60_000_000_000n;
const DAY_NS = 24n * 60n * NS_PER_MIN;

const variantName = (v) => (v && typeof v === "object" ? Object.keys(v)[0] : String(v));
const n = (x) => (typeof x === "bigint" ? x : BigInt(x));

export function evaluate({ alerts = [], serviceErrors = [], frontendErrors = [], nowNs, windowMinutes = 65 }) {
  const since = n(nowNs) - BigInt(windowMinutes) * NS_PER_MIN;
  const problems = [];
  for (const a of alerts) {
    if (a.resolved || variantName(a.severity) !== "Critical" || n(a.createdAt) < since) continue;
    problems.push({ kind: "alert", text: `Critical ${variantName(a.category)} alert: ${a.message}` });
  }
  for (const e of serviceErrors) {
    if (e.resolved || n(e.lastSeen) < since) continue;
    problems.push({
      kind: "service",
      text: `${e.errorType}: ${e.message} (${n(e.count)} total; resolve with monitoring.resolveServiceError("${e.fingerprint}"))`,
    });
  }
  for (const e of frontendErrors) {
    if (e.resolved || n(e.lastSeen) < since || n(e.firstSeen) < n(nowNs) - DAY_NS) continue;
    problems.push({ kind: "frontend", text: `New frontend error ${e.errorType}: ${e.message} (${n(e.count)} so far)` });
  }
  return problems;
}
