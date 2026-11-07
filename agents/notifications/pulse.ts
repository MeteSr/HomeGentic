/**
 * The weekly Home Pulse email.
 *
 * Every Monday from PULSE_HOUR_UTC (default 13:00 UTC, morning in the US) the
 * relay emails each homeowner who hasn't turned it off (the weekly_pulse email
 * preference, on by default) one digest built from their own record:
 *
 *   1. jobs waiting on their signature
 *   2. a home insurance renewal in the next 60 days (the policy they saved),
 *      a home warranty renewal in the next 60 days, and a PMI note when the
 *      loan's original schedule is within 60 days of 80% of the original value
 *   3. systems past their rated life (age counted the way the score counts it)
 *   4. warranties that end in the next 60 days
 *   5. systems within two years of their rated life
 *   6. this season's priorities for the property's climate zone, with the
 *      last matching job on record
 *
 * plus each property's HomeGentic Score, computed from the job canister's
 * snapshots with the shared formula, the number a certificate would show.
 *
 * Progress is saved after every homeowner ({ week, after }), so a restart
 * resumes where it stopped instead of emailing anyone twice; each send also
 * carries an idempotency key per homeowner per week. A run that can't finish
 * on Monday keeps going on Tuesday, then the week is skipped.
 *
 * Off unless email is configured (RESEND_API_KEY) and NOTIFICATIONS_PUBLIC_URL
 * is set: every email carries a one-click unsubscribe link to this relay
 * (List-Unsubscribe + List-Unsubscribe-Post, RFC 8058).
 */
import * as icp from "./icp";
import { appUrl, emailConfigured, escapeHtml, sendRawEmail, type EmailMessage } from "./email";
import { getPrefs } from "./prefs";
import { loadSection, saveSection } from "./persist";
import { emailUnsubscribeId, unsubscribeTokenFor } from "./unsubscribe";
import { SYSTEM_LIFESPANS, REPLACEMENT_MIN_CENTS, scoreBreakdown, type ScoreJob } from "../../packages/shared/src/score";
import { climateService, type Season } from "../../packages/shared/src/climate";
import type { PulseHomeFinance, PulseInsurance, PulseJob, PulseProperty, PulseRecipient } from "./types";
import { pmiReminder } from "../../packages/shared/src/mortgage";
import { reportFailure, errorCode } from "./opsReport";

export const PULSE_PREF = "weekly_pulse";

const PAGE_SIZE           = 100;
const MAX_PROPERTIES      = 5;   // per email; the rest are a link
const MAX_ITEMS           = 6;   // per property
const MAX_ATTENTION       = 4;   // of those, items that need the homeowner; the rest are seasonal
const WARRANTY_WINDOW_MS  = 60 * 86_400_000;
const RENEWAL_WINDOW_DAYS = 60;
const NEAR_LIFE_YEARS     = 2;
const CHECK_INTERVAL_MS   = 60 * 60_000;

const pulseHour = () => {
  const h = Number(process.env.PULSE_HOUR_UTC);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 13;
};

export function pulsePublicUrl(): string | null {
  const u = process.env.NOTIFICATIONS_PUBLIC_URL;
  return u ? u.replace(/\/$/, "") : null;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** ISO-8601 week of `ms` (UTC), e.g. "2026-W43". */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDay() || 7;
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday from the send hour, or any time Tuesday (catch-up). */
export function pulseDue(ms: number, hour = pulseHour()): boolean {
  const d = new Date(ms);
  return (d.getUTCDay() === 1 && d.getUTCHours() >= hour) || d.getUTCDay() === 2;
}

const monthYear = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayMonth = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

// ── Digest ────────────────────────────────────────────────────────────────────

export type PulseTag = "SIGN OFF" | "INSURANCE" | "HOME WARRANTY" | "PMI" | "PAST RATED LIFE" | "WARRANTY" | "NEARING RATED LIFE" | "SEASONAL";

export interface PulseItem {
  tag:   PulseTag;
  title: string;
  body:  string;
}

export interface PulseSection {
  property: PulseProperty;
  score:    number | null;   // null with no jobs on record (as the canister returns)
  zone:     { zone: number; label: string };
  season:   Season;
  items:    PulseItem[];
}

/** Waiting on the homeowner's signature: submitted by a contractor, not yet signed or declined. */
export function awaitingSignature(j: PulseJob): boolean {
  return !j.verified && !j.homeownerSigned && j.status !== "RejectedByHomeowner"
    && (j.status === "PendingHomeownerApproval" || j.contractorSigned);
}

/** Which service type a seasonal priority is about, for "last on record". */
const SEASONAL_SYSTEMS: Array<[RegExp, string]> = [
  [/\b(hvac|ac|a\/c|furnace|heat(ing)?|heat pump|boiler|filter|refrigerant)\b/i, "HVAC"],
  [/\b(roof|gutters?|ice dams?|shingles?)\b/i,                                   "Roofing"],
  [/\b(pipes?|plumbing|water heater|sump pump)\b/i,                              "Plumbing"],
  [/\b(generator|electrical)\b/i,                                                "Electrical"],
  [/\b(windows?|weatherstripping|weatherize|door seals|caulking)\b/i,            "Windows"],
];

export function seasonalSystem(task: string): string | null {
  for (const [re, system] of SEASONAL_SYSTEMS) if (re.test(task)) return system;
  return null;
}

/** "Your <noun> <is/are>…" */
const SYSTEM_NOUN: Record<string, [string, "is" | "are"]> = {
  HVAC: ["HVAC system", "is"], Roofing: ["roof", "is"], Plumbing: ["plumbing", "is"],
  Electrical: ["electrical system", "is"], Windows: ["windows", "are"], Flooring: ["flooring", "is"],
};

/** UTC midnight of a "YYYY-MM-DD" date, or null if it isn't one. */
export function isoDateMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().startsWith(date) ? ms : null;
}

/** #711: a reminder when the saved policy renews in the next 60 days (today included). */
export function insuranceItem(policy: PulseInsurance | null, nowMs: number): PulseItem | null {
  const renews = policy ? isoDateMs(policy.renewalDate) : null;
  if (!policy || renews === null) return null;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((renews - today) / 86_400_000);
  if (days < 0 || days > RENEWAL_WINDOW_DAYS) return null;
  return {
    tag:   "INSURANCE",
    title: `Home insurance renews ${dayMonth(renews)}`,
    body:  `Your ${policy.carrier} policy, by the renewal date you saved. When the renewal notice comes, check its coverage and deductibles against last year's, and tell your agent about work done since then, like a new roof or shutters.`,
  };
}

/** Whole days from today (UTC) to a "YYYY-MM-DD" date, or null. */
function daysUntil(date: string, nowMs: number): number | null {
  const at = isoDateMs(date);
  if (at === null) return null;
  const now = new Date(nowMs);
  return Math.round((at - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
}

/** #719: a reminder when the home warranty plan renews in the next 60 days (today included). */
export function homeWarrantyItem(finance: PulseHomeFinance | null, nowMs: number): PulseItem | null {
  const w = finance?.warranty;
  const days = w ? daysUntil(w.renewalDate, nowMs) : null;
  if (!w || days === null || days < 0 || days > RENEWAL_WINDOW_DAYS) return null;
  return {
    tag:   "HOME WARRANTY",
    title: `Home warranty renews ${dayMonth(isoDateMs(w.renewalDate)!)}`,
    body:  `Your ${w.provider} plan, by the renewal date you saved. Before it renews, read the renewal terms and decide whether to keep it; your claim history is on the property's Home warranty tab.`,
  };
}

/** #722: a note when the loan's original schedule is within 60 days of 80% of the original value. */
export function pmiItem(finance: PulseHomeFinance | null, nowMs: number): PulseItem | null {
  const l = finance?.loan;
  if (!l) return null;
  const due = pmiReminder({
    lender: "", originalAmount: l.originalAmountCents / 100, annualRatePct: l.rateThousandthsPct / 1000,
    termMonths: l.termMonths, firstPaymentDate: l.firstPaymentDate,
    originalValue: l.originalValueCents === null ? null : l.originalValueCents / 100,
    currentValue: null, monthlyPmi: l.monthlyPmiCents === null ? null : l.monthlyPmiCents / 100,
    monthlyEscrow: null, statementBalance: null, statementDate: "",
  }, nowMs);
  if (!due) return null;
  return {
    tag:   "PMI",
    title: `PMI: your loan's schedule reaches 80% of the original value ${dayMonth(isoDateMs(due.requestDate)!)}`,
    body:  "Worked out from the loan numbers you saved. For many conventional loans you can ask the lender to cancel PMI at that point if your payments are current; the rule depends on your loan and your lender decides.",
  };
}

/**
 * One property's section. `jobs` are that property's jobs; `snapshots` are
 * the job canister's score inputs for it; `insurance` is its saved policy.
 */
export function buildSection(
  property: PulseProperty, jobs: PulseJob[], snapshots: ScoreJob[], nowMs: number,
  insurance: PulseInsurance | null = null,
  finance: PulseHomeFinance | null = null,
): PulseSection {
  const currentYear = new Date(nowMs).getUTCFullYear();
  const zone   = climateService.getZone(property.zipCode);
  const season = climateService.getSeason(new Date(nowMs).getUTCMonth());
  const items: PulseItem[] = [];

  // 1. Signatures
  const waiting = jobs.filter(awaitingSignature).sort((a, b) => b.completedAtMs - a.completedAtMs);
  for (const j of waiting.slice(0, 3)) {
    items.push({
      tag:   "SIGN OFF",
      title: `Sign off: ${j.title}`,
      body:  `${j.contractorName ?? "A contractor"} logged this job (${monthYear(j.completedAtMs)}). Sign it to make it a verified job.`,
    });
  }
  if (waiting.length > 3) {
    items.push({ tag: "SIGN OFF", title: `${waiting.length - 3} more jobs waiting on you`, body: "They're in Awaiting on your dashboard." });
  }

  // Insurance renewal
  const renewal = insuranceItem(insurance, nowMs);
  if (renewal) items.push(renewal);
  // Home warranty renewal and PMI milestone
  for (const item of [homeWarrantyItem(finance, nowMs), pmiItem(finance, nowMs)]) if (item) items.push(item);

  // 2 + 4. System life, counted like the score's modernization part.
  const past: PulseItem[] = [];
  const near: PulseItem[] = [];
  if (property.yearBuilt >= 1800 && property.yearBuilt <= currentYear) {
    for (const { system, lifespanYears } of SYSTEM_LIFESPANS) {
      const min = REPLACEMENT_MIN_CENTS[system] ?? 0;
      let lastYear = property.yearBuilt;
      for (const s of snapshots) {
        if (s.serviceType === system && s.amountCents >= min && s.completedYear > lastYear) lastYear = s.completedYear;
      }
      const age = Math.max(currentYear - lastYear, 0);
      const [noun, verb] = SYSTEM_NOUN[system] ?? [system, "is"];
      const since = lastYear === property.yearBuilt
        ? `No replacement is on record, so it counts from ${lastYear}, when the house was built`
        : `It was last replaced in ${lastYear}`;
      if (age >= lifespanYears) {
        past.push({
          tag:   "PAST RATED LIFE",
          title: `Your ${noun} ${verb} past ${verb === "are" ? "their" : "its"} rated life`,
          body:  `${since}; that's ${age} years against a rated ${lifespanYears}. If it's been replaced, log the job. If not, it's worth a quote before it fails.`,
        });
      } else if (lifespanYears - age <= NEAR_LIFE_YEARS) {
        near.push({
          tag:   "NEARING RATED LIFE",
          title: `Your ${noun} ${verb} near the end of ${verb === "are" ? "their" : "its"} rated life`,
          body:  `${since}; about ${lifespanYears - age} year${lifespanYears - age === 1 ? "" : "s"} left of a rated ${lifespanYears}.`,
        });
      }
    }
  }
  items.push(...past.slice(0, 2));

  // 3. Warranties ending soon
  for (const j of jobs) {
    if (!j.warrantyMonths) continue;
    const ends = addMonths(j.completedAtMs, j.warrantyMonths);
    if (ends > nowMs && ends - nowMs <= WARRANTY_WINDOW_MS) {
      items.push({
        tag:   "WARRANTY",
        title: `${j.title}: warranty ends ${dayMonth(ends)}`,
        body:  `From ${j.contractorName ?? "the installer"}, ${monthYear(j.completedAtMs)}. Check it's working while it's still covered.`,
      });
    }
  }

  items.push(...near.slice(0, 1));

  // 5. Seasonal priorities, with the last matching job on record
  items.splice(MAX_ATTENTION);
  for (const task of climateService.getSeasonalPriorities(zone.zone, season)) {
    if (items.length >= MAX_ITEMS) break;
    const system = seasonalSystem(task);
    const last = system
      ? jobs.filter((j) => j.serviceType === system).sort((a, b) => b.completedAtMs - a.completedAtMs)[0]
      : undefined;
    const lastLine = last
      ? ` Last ${system} job on record: ${monthYear(last.completedAtMs)}, ${last.isDiy ? "done yourself" : `by ${last.contractorName ?? "a contractor"}`}${last.amountCents > 0 ? ` for ${dollars(last.amountCents)}` : ""}.`
      : "";
    items.push({
      tag:   "SEASONAL",
      title: task,
      body:  `A ${season} priority for climate zone ${zone.zone} (${zone.label}).${lastLine}`,
    });
  }

  const score = snapshots.length > 0 ? scoreBreakdown(snapshots, property.yearBuilt, currentYear).total : null;
  return { property, score, zone: { zone: zone.zone, label: zone.label }, season, items: items.slice(0, MAX_ITEMS) };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export interface PulseLinks {
  dashboard:   string;
  settings:    string;
  unsubscribe: string;
}

const TAG_COLOR: Record<PulseTag, string> = {
  "SIGN OFF":           "#2B34FF",
  "INSURANCE":          "#8A6800",
  "HOME WARRANTY":      "#8A6800",
  "PMI":                "#2B34FF",
  "PAST RATED LIFE":    "#C94C2E",
  "WARRANTY":           "#8A6800",
  "NEARING RATED LIFE": "#8A6800",
  "SEASONAL":           "#4A4D5C",
};

export function renderPulse(sections: PulseSection[], moreProperties: number, links: PulseLinks): EmailMessage {
  const needs = sections.reduce((n, s) => n + s.items.filter((i) => i.tag !== "SEASONAL").length, 0);
  const subject = needs > 0
    ? `Your Home Pulse: ${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you this week`
    : "Your Home Pulse: nothing urgent this week";
  const scoreLine = (s: PulseSection) =>
    s.score === null ? "No HomeGentic Score yet: log a job to get one." : `HomeGentic Score: ${s.score}`;

  const text = [
    "HomeGentic · Weekly Home Pulse",
    "",
    ...sections.flatMap((s) => [
      `${s.property.address}, ${s.property.city} ${s.property.state}`,
      scoreLine(s),
      "",
      ...s.items.flatMap((i) => [`[${i.tag}] ${i.title}`, i.body, ""]),
    ]),
    ...(moreProperties > 0 ? [`And ${moreProperties} more propert${moreProperties === 1 ? "y" : "ies"} on your dashboard.`, ""] : []),
    `Open your dashboard: ${links.dashboard}`,
    "",
    `Stop these weekly emails: ${links.unsubscribe}`,
    `All notification settings: ${links.settings}`,
  ].join("\n");

  const item = (i: PulseItem) => `<tr><td style="padding:12px 0;border-bottom:1px solid #E4E5EA">
<div style="font:700 10px/1 monospace;letter-spacing:.1em;color:${TAG_COLOR[i.tag]};margin-bottom:6px">${escapeHtml(i.tag)}</div>
<div style="font-size:15px;font-weight:600;margin-bottom:4px">${escapeHtml(i.title)}</div>
<div style="font-size:14px;color:#4A4D5C">${escapeHtml(i.body)}</div></td></tr>`;
  const section = (s: PulseSection) => `<h2 style="font-size:17px;margin:28px 0 4px">${escapeHtml(`${s.property.address}, ${s.property.city} ${s.property.state}`)}</h2>
<p style="margin:0 0 8px;font-size:13px;color:#4A4D5C">${escapeHtml(scoreLine(s))}</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${s.items.map(item).join("")}</table>`;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#F5F5F7">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#0B0D1A;line-height:1.5">
<div style="font:700 11px/1 monospace;letter-spacing:.14em;color:#4A4D5C">HOMEGENTIC · WEEKLY HOME PULSE</div>
<h1 style="font-size:22px;margin:10px 0 0">${escapeHtml(subject.replace(/^Your Home Pulse: /, "").replace(/^./, (c) => c.toUpperCase()))}</h1>
${sections.map(section).join("\n")}
${moreProperties > 0 ? `<p style="font-size:14px">And ${moreProperties} more propert${moreProperties === 1 ? "y" : "ies"} on your dashboard.</p>` : ""}
<p style="margin:28px 0"><a href="${escapeHtml(links.dashboard)}" style="background:#2B34FF;color:#fff;text-decoration:none;padding:10px 18px;border-radius:100px;font-weight:600">Open your dashboard</a></p>
<p style="font-size:12px;color:#6B6E7B;margin:0">You get this every Monday because you have a home on HomeGentic.
<a href="${escapeHtml(links.unsubscribe)}" style="color:#6B6E7B">Stop these weekly emails</a> ·
<a href="${escapeHtml(links.settings)}" style="color:#6B6E7B">notification settings</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}

// ── Run ───────────────────────────────────────────────────────────────────────

export interface PulseDeps {
  emailEnabled:  () => boolean;
  publicUrl:     () => string | null;
  getRecipients: (after: string | null, limit: number) => Promise<PulseRecipient[]>;
  getProperties: (owner: string) => Promise<PulseProperty[]>;
  getJobs:       (owner: string) => Promise<PulseJob[]>;
  getSnapshots:  (propertyId: string) => Promise<ScoreJob[]>;
  /** #711: renewal dates of the owner's saved insurance policies. */
  getInsurance:  (owner: string) => Promise<PulseInsurance[]>;
  /** #719 / #722: home warranty renewals and loan terms for the PMI note. */
  getHomeFinance: (owner: string) => Promise<PulseHomeFinance[]>;
  wantsPulse:    (principal: string) => boolean;
  send:          (to: string, msg: EmailMessage, idempotencyKey: string, headers: Record<string, string>) => Promise<void>;
  /** Pause between sends (Resend's default limit is a few requests a second). */
  pause:         () => Promise<void>;
}

const sendGapMs = () => Number(process.env.PULSE_SEND_INTERVAL_MS) || 600;

const defaultDeps: PulseDeps = {
  emailEnabled:  emailConfigured,
  publicUrl:     pulsePublicUrl,
  getRecipients: icp.getPulseRecipients,
  getProperties: icp.getPulseProperties,
  getJobs:       icp.getJobsByOwner,
  getSnapshots:  icp.getJobSnapshots,
  getInsurance:  icp.getPulseInsurance,
  getHomeFinance: icp.getPulseHomeFinance,
  wantsPulse:    (p) => getPrefs(p).email.weekly_pulse,
  send:          sendRawEmail,
  pause:         () => new Promise((r) => setTimeout(r, sendGapMs())),
};

interface PulseState {
  week:  string;          // ISO week this run is for
  after: string | null;   // last homeowner handled
  done:  boolean;
}

let state: PulseState | null = loadSection<PulseState | null>("pulse", null);

function saveState(s: PulseState): void {
  state = s;
  saveSection("pulse", s);
}

export function getPulseState(): PulseState | null {
  return state;
}

/** Test hook: forget progress. */
export function resetPulseState(): void {
  state = null;
  saveSection("pulse", null);
}

export function unsubscribeUrl(base: string, principal: string): string {
  const t = unsubscribeTokenFor("email", emailUnsubscribeId(PULSE_PREF, principal));
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(principal)}&k=${PULSE_PREF}&t=${t}`;
}

/** Build and send one homeowner's email. Returns false when there was nothing to send (no properties). */
export async function sendPulseTo(r: PulseRecipient, week: string, nowMs: number, deps: PulseDeps): Promise<boolean> {
  const base = deps.publicUrl();
  if (!base) return false;
  const properties = await deps.getProperties(r.principal);
  if (properties.length === 0) return false;
  const jobs = await deps.getJobs(r.principal);
  // A renewal reminder is a nice-to-have: an unreadable list (e.g. a property
  // canister that predates it) never holds up the rest of the email.
  let insurance: PulseInsurance[] = [];
  try {
    insurance = await deps.getInsurance(r.principal);
  } catch (err) {
    console.warn("[pulse] insurance renewals unavailable:", err instanceof Error ? err.message : err);
  }
  let finance: PulseHomeFinance[] = [];
  try {
    finance = await deps.getHomeFinance(r.principal);
  } catch (err) {
    console.warn("[pulse] home warranty and loan reminders unavailable:", err instanceof Error ? err.message : err);
  }
  const shown = properties.slice(0, MAX_PROPERTIES);
  const sections: PulseSection[] = [];
  for (const p of shown) {
    const snapshots = await deps.getSnapshots(p.id);
    const policy = insurance.find((i) => i.propertyId === p.id) ?? null;
    const fin = finance.find((f) => f.propertyId === p.id) ?? null;
    sections.push(buildSection(p, jobs.filter((j) => j.propertyId === p.id), snapshots, nowMs, policy, fin));
  }
  const unsubscribe = unsubscribeUrl(base, r.principal);
  const msg = renderPulse(sections, properties.length - shown.length, {
    dashboard:   `${appUrl()}/dashboard`,
    settings:    `${appUrl()}/settings?tab=notifications`,
    unsubscribe,
  });
  await deps.send(r.email, msg, `pulse:${r.principal}:${week}`, {
    "List-Unsubscribe":      `<${unsubscribe}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  return true;
}

let running = false;

/**
 * Send this week's emails if they're due and not done. Returns how many were
 * sent. A homeowner whose email fails is logged and skipped; a failed page of
 * recipients stops the run until the next check.
 */
export async function runPulse(nowMs = Date.now(), deps: PulseDeps = defaultDeps): Promise<number> {
  if (running || !deps.emailEnabled() || !deps.publicUrl() || !pulseDue(nowMs)) return 0;
  const week = isoWeek(nowMs);
  if (state?.week === week && state.done) return 0;
  running = true;
  let sent = 0;
  try {
    let after = state?.week === week ? state.after : null;
    saveState({ week, after, done: false });
    for (;;) {
      const page = await deps.getRecipients(after, PAGE_SIZE);
      for (const r of page) {
        if (deps.wantsPulse(r.principal)) {
          try {
            if (await sendPulseTo(r, week, nowMs, deps)) {
              sent += 1;
              await deps.pause();
            }
          } catch (err) {
            console.error(`[pulse] ${r.principal.slice(0, 12)}…:`, err instanceof Error ? err.message : err);
            void reportFailure("pulse", `Home Pulse email failed: ${errorCode(err)}`);
          }
        }
        after = r.principal;
        saveState({ week, after, done: false });
      }
      if (page.length < PAGE_SIZE) break;
    }
    saveState({ week, after, done: true });
    console.log(`[pulse] ${week}: sent ${sent} email(s)`);
  } catch (err) {
    console.error(`[pulse] ${week} stopped:`, err instanceof Error ? err.message : err);
    void reportFailure("pulse", "Home Pulse run stopped");
  } finally {
    running = false;
  }
  return sent;
}

let handle: ReturnType<typeof setInterval> | null = null;

export function startPulse(): void {
  if (handle) return;
  if (!emailConfigured()) {
    console.warn("[pulse] RESEND_API_KEY not set — weekly Home Pulse email is off");
    return;
  }
  if (!pulsePublicUrl()) {
    console.warn("[pulse] NOTIFICATIONS_PUBLIC_URL not set — weekly Home Pulse email is off (it needs an unsubscribe link)");
    return;
  }
  for (const v of ["CANISTER_ID_AUTH", "CANISTER_ID_PROPERTY", "CANISTER_ID_JOB"]) {
    if (!process.env[v]) {
      console.warn(`[pulse] ${v} not set — weekly Home Pulse email is off`);
      return;
    }
  }
  console.log(`[pulse] weekly Home Pulse: Mondays from ${pulseHour()}:00 UTC`);
  void runPulse();
  handle = setInterval(() => void runPulse(), CHECK_INTERVAL_MS);
}

export function stopPulse(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
