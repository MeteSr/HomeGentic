/**
 * #717: calendar export. packages/shared/src/ics.ts writes the .ics text for
 * both the "Add to calendar" downloads (web) and the private subscribe feed
 * the voice Worker serves, so the two can't drift.
 *
 *  ICS.1 a calendar with one all-day event per input, CRLF line endings
 *  ICS.2 text is escaped (backslash, comma, semicolon, newlines)
 *  ICS.3 long lines are folded at 75 octets without splitting a character
 *  ICS.4 events with a bad date are dropped; a bad RRULE is dropped, not copied
 *  ICS.5 RRULEs come from the recurring-service frequencies
 *  ICS.6 nothing a caller passes can start a new property line
 */
import { describe, it, expect } from "vitest";
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  isValidRrule,
  rruleForFrequency,
  isIcsDate,
  type IcsEvent,
} from "@homegentic/shared/ics";

const NOW = new Date(Date.UTC(2026, 10, 8, 20, 5, 9));

const ev = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "warranty-J1",
  date: "2027-03-14",
  title: "Warranty ends: HVAC",
  ...over,
});

const lines = (ics: string) => ics.split("\r\n");

describe("buildIcs", () => {
  it("ICS.1 writes a calendar with one all-day event per input and CRLF endings", () => {
    const ics = buildIcs([ev(), ev({ uid: "maint-p1-gutters", date: "2026-12-01", title: "Clean gutters" })], {
      name: "HomeGentic: 9 Basis Lane",
      now: NOW,
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("VERSION:2.0");
    expect(l).toContain("PRODID:-//HomeGentic//Home calendar//EN");
    expect(l).toContain("X-WR-CALNAME:HomeGentic: 9 Basis Lane");
    expect(l.filter((x) => x === "BEGIN:VEVENT")).toHaveLength(2);
    expect(l).toContain("UID:warranty-J1@homegentic.app");
    expect(l).toContain("DTSTAMP:20261108T200509Z");
    expect(l).toContain("DTSTART;VALUE=DATE:20270314");
    expect(l).toContain("DTEND;VALUE=DATE:20270315");
    expect(l).toContain("SUMMARY:Warranty ends: HVAC");
    expect(l[l.length - 2]).toBe("END:VCALENDAR");
  });

  it("ICS.1 ends an event on the next day across month and year ends", () => {
    const l = lines(
      buildIcs([ev({ date: "2026-12-31" }), ev({ uid: "b", date: "2028-02-28" })], { name: "x", now: NOW }),
    );
    expect(l).toContain("DTEND;VALUE=DATE:20270101");
    expect(l).toContain("DTEND;VALUE=DATE:20280229");
  });

  it("ICS.2 escapes text values", () => {
    expect(escapeIcsText("a\\b, c; d\ne\r\nf")).toBe("a\\\\b\\, c\\; d\\ne\\nf");
    const l = lines(
      buildIcs([ev({ title: "Pest, quarterly; Bob", description: "Line 1\nLine 2" })], { name: "x", now: NOW }),
    );
    expect(l).toContain("SUMMARY:Pest\\, quarterly\\; Bob");
    expect(l).toContain("DESCRIPTION:Line 1\\nLine 2");
  });

  it("ICS.3 folds lines longer than 75 octets and keeps multi-byte characters whole", () => {
    const long = "SUMMARY:" + "é".repeat(80);
    const folded = foldIcsLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(long);
    expect(foldIcsLine("SHORT:line")).toBe("SHORT:line");
  });

  it("ICS.4 drops events with a bad date and ignores a bad RRULE", () => {
    const ics = buildIcs(
      [
        ev({ date: "2027-02-30" }),
        ev({ uid: "ok", rrule: "FREQ=WEEKLY\r\nATTENDEE:x" }),
        ev({ uid: "b", date: "soon" }),
      ],
      { name: "x", now: NOW },
    );
    const l = lines(ics);
    expect(l.filter((x) => x === "BEGIN:VEVENT")).toHaveLength(1);
    expect(ics).not.toContain("RRULE");
    expect(ics).not.toContain("ATTENDEE");
    expect(isIcsDate("2027-02-28")).toBe(true);
    expect(isIcsDate("2027-02-30")).toBe(false);
    expect(isIcsDate("20270228")).toBe(false);
  });

  it("ICS.5 maps recurring-service frequencies to RRULEs, with an optional end date", () => {
    expect(rruleForFrequency("Weekly")).toBe("FREQ=WEEKLY");
    expect(rruleForFrequency("BiWeekly")).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(rruleForFrequency("Monthly")).toBe("FREQ=MONTHLY");
    expect(rruleForFrequency("Quarterly")).toBe("FREQ=MONTHLY;INTERVAL=3");
    expect(rruleForFrequency("SemiAnnually")).toBe("FREQ=MONTHLY;INTERVAL=6");
    expect(rruleForFrequency("Annually")).toBe("FREQ=YEARLY");
    expect(rruleForFrequency("Annually", "2027-06-30")).toBe("FREQ=YEARLY;UNTIL=20270630");
    expect(rruleForFrequency("Fortnightly")).toBeNull();
    expect(isValidRrule("FREQ=MONTHLY;INTERVAL=3;UNTIL=20270630")).toBe(true);
    expect(isValidRrule("FREQ=MONTHLY\nX")).toBe(false);
    expect(isValidRrule("INTERVAL=3")).toBe(false);
    const l = lines(buildIcs([ev({ rrule: "FREQ=MONTHLY;INTERVAL=3" })], { name: "x", now: NOW }));
    expect(l).toContain("RRULE:FREQ=MONTHLY;INTERVAL=3");
  });

  it("ICS.6 never lets a uid, title or calendar name start a new property line", () => {
    const ics = buildIcs([ev({ uid: "x\r\nATTENDEE:evil", title: "t\nORGANIZER:evil" })], {
      name: "n\r\nX-EVIL:1",
      now: NOW,
    });
    for (const l of lines(ics)) {
      expect(l.startsWith("ATTENDEE")).toBe(false);
      expect(l.startsWith("ORGANIZER")).toBe(false);
      expect(l.startsWith("X-EVIL")).toBe(false);
    }
  });
});
