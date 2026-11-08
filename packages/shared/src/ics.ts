/**
 * iCalendar (.ics, RFC 5545) writer for HomeGentic's calendar export (#717).
 *
 * One writer for both the web app's "Add to calendar" downloads and the
 * private subscribe feed the voice Worker serves, so the two can't drift.
 * Every event is all-day: the dates come from estimates and schedules, not
 * appointments. Text is escaped and lines are folded, so nothing a caller
 * passes can start a property line of its own.
 */

export interface IcsEvent {
  /** Stable id within HomeGentic, e.g. "warranty-<jobId>"; "@homegentic.app" is added. */
  uid: string;
  /** YYYY-MM-DD, the all-day event's date. */
  date: string;
  title: string;
  description?: string;
  /** e.g. "FREQ=MONTHLY;INTERVAL=3"; dropped unless it passes isValidRrule. */
  rrule?: string;
}

export interface IcsOptions {
  /** Calendar name shown by calendar apps (X-WR-CALNAME). */
  name: string;
  /** DTSTAMP for every event. */
  now: Date;
}

const UID_DOMAIN = "homegentic.app";
const MAX_OCTETS = 75;

/** A real calendar date written as YYYY-MM-DD. */
export function isIcsDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Only the RRULE shapes HomeGentic writes: FREQ first, then KEY=VALUE parts. */
export function isValidRrule(r: string): boolean {
  return r.length <= 100 && /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,]+)*$/.test(r);
}

const FREQ_RRULE: Record<string, string> = {
  Weekly: "FREQ=WEEKLY",
  BiWeekly: "FREQ=WEEKLY;INTERVAL=2",
  Monthly: "FREQ=MONTHLY",
  Quarterly: "FREQ=MONTHLY;INTERVAL=3",
  SemiAnnually: "FREQ=MONTHLY;INTERVAL=6",
  Annually: "FREQ=YEARLY",
};

/** RRULE for a recurring-service frequency, ending on `until` (YYYY-MM-DD) when given. */
export function rruleForFrequency(frequency: string, until?: string): string | null {
  const base = FREQ_RRULE[frequency];
  if (!base) return null;
  return until && isIcsDate(until) ? `${base};UNTIL=${until.replace(/-/g, "")}` : base;
}

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold a content line at 75 octets (§3.1), never inside a UTF-8 character. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let octets = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // Continuation lines start with a space, which counts toward the limit.
    const limit = out.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (octets + n > limit) {
      out.push(cur);
      cur = "";
      octets = 0;
    }
    cur += ch;
    octets += n;
  }
  out.push(cur);
  return out.map((p, i) => (i === 0 ? p : " " + p)).join("\r\n");
}

const compactDate = (iso: string) => iso.replace(/-/g, "");

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, "");
}

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** The full .ics text, CRLF line endings. Events with a bad date are left out. */
export function buildIcs(events: IcsEvent[], opts: IcsOptions): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HomeGentic//Home calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(opts.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];
  const dtstamp = stamp(opts.now);
  for (const e of events) {
    if (!isIcsDate(e.date)) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(e.uid)}@${UID_DOMAIN}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeIcsText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.rrule && isValidRrule(e.rrule)) lines.push(`RRULE:${e.rrule}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
