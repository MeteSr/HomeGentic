/**
 * #714: Florida property-tax dates (packages/shared/src/propertyTax.ts), used
 * by the web app's Property tax card and the weekly Home Pulse email. The
 * table only holds years whose dates were checked against Florida law, and
 * every reminder links the official source.
 */
import { describe, it, expect } from "vitest";
import {
  FLORIDA_TAX_CALENDAR,
  FLORIDA_TAX_SOURCES,
  PETITION_REMINDER_DAYS,
  HOMESTEAD_REMINDER_DAYS,
  floridaTaxReminders,
  isFloridaState,
  type TaxYearStatus,
} from "@homegentic/shared/propertyTax";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 14);

describe("FLORIDA_TAX_CALENDAR", () => {
  it("has 2026 and 2027, each checked against s. 196.011 (March 1) with the TRIM notice in August", () => {
    expect(Object.keys(FLORIDA_TAX_CALENDAR).map(Number).sort()).toEqual([2026, 2027]);
    expect(FLORIDA_TAX_CALENDAR[2026]).toEqual({ year: 2026, homesteadDeadline: "2026-03-01", trimMonth: 8 });
    expect(FLORIDA_TAX_CALENDAR[2027]).toEqual({ year: 2027, homesteadDeadline: "2027-03-01", trimMonth: 8 });
  });

  it("every entry is March 1 of its own year", () => {
    for (const [year, entry] of Object.entries(FLORIDA_TAX_CALENDAR)) {
      expect(entry.year).toBe(Number(year));
      expect(entry.homesteadDeadline).toBe(`${year}-03-01`);
    }
  });

  it("links only official Florida sources", () => {
    for (const s of Object.values(FLORIDA_TAX_SOURCES)) {
      expect(s.url).toMatch(/^https:\/\/(www\.)?(flsenate\.gov|floridarevenue\.com)\//);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});

describe("isFloridaState", () => {
  it("knows FL however it was typed", () => {
    for (const s of ["FL", "fl", " Florida ", "FLORIDA"]) expect(isFloridaState(s)).toBe(true);
    for (const s of ["GA", "", "Flo", "NC"]) expect(isFloridaState(s)).toBe(false);
  });
});

describe("floridaTaxReminders", () => {
  it("says nothing for homes outside Florida", () => {
    expect(floridaTaxReminders("GA", [], at(2027, 2, 1))).toEqual([]);
  });

  it("reminds about the March 1 homestead deadline in the 60 days before it, deadline day included", () => {
    expect(HOMESTEAD_REMINDER_DAYS).toBe(60);
    const r = floridaTaxReminders("FL", [], at(2027, 2, 1));
    expect(r).toEqual([{ kind: "Homestead", year: 2027, date: "2027-03-01", source: FLORIDA_TAX_SOURCES.homestead }]);
    expect(floridaTaxReminders("FL", [], at(2027, 3, 1))).toHaveLength(1);
    expect(floridaTaxReminders("FL", [], at(2027, 3, 2))).toEqual([]);
    expect(floridaTaxReminders("FL", [], at(2026, 12, 30))).toEqual([]); // 61 days out
  });

  it("stops the homestead reminder once the owner has marked this year, or it was granted last year", () => {
    const year = (status: TaxYearStatus["exemption"], y = 2027): TaxYearStatus => ({
      year: y,
      exemption: status,
      petitionDeadline: "",
    });
    for (const s of ["NotApplying", "Applied", "Granted", "Denied"] as const) {
      expect(floridaTaxReminders("FL", [year(s)], at(2027, 2, 1))).toEqual([]);
    }
    expect(floridaTaxReminders("FL", [year("Unknown")], at(2027, 2, 1))).toHaveLength(1);
    expect(floridaTaxReminders("FL", [year("Granted", 2026)], at(2027, 2, 1))).toEqual([]);
    expect(floridaTaxReminders("FL", [year("Applied", 2026)], at(2027, 2, 1))).toHaveLength(1);
  });

  it("gives no dates for a year that isn't in the checked table", () => {
    expect(floridaTaxReminders("FL", [], at(2028, 2, 1))).toEqual([]);
    expect(floridaTaxReminders("FL", [], at(2028, 8, 10))).toEqual([]);
  });

  it("flags the TRIM notice from August 1 to September 15 until the owner saves the petition deadline", () => {
    const trim = { kind: "TrimNotice", year: 2027, date: "2027-08-01", source: FLORIDA_TAX_SOURCES.petition };
    expect(floridaTaxReminders("FL", [], at(2027, 7, 31))).toEqual([]);
    expect(floridaTaxReminders("FL", [], at(2027, 8, 1))).toEqual([trim]);
    expect(floridaTaxReminders("FL", [], at(2027, 9, 15))).toEqual([trim]);
    expect(floridaTaxReminders("FL", [], at(2027, 9, 16))).toEqual([]);
    const saved: TaxYearStatus = { year: 2027, exemption: "Granted", petitionDeadline: "2027-10-30" };
    expect(floridaTaxReminders("FL", [saved], at(2027, 8, 20))).toEqual([]);
  });

  it("reminds about the petition deadline the owner saved, in the 25 days before it", () => {
    expect(PETITION_REMINDER_DAYS).toBe(25);
    const saved: TaxYearStatus = { year: 2026, exemption: "Granted", petitionDeadline: "2026-09-15" };
    expect(floridaTaxReminders("FL", [saved], at(2026, 9, 1))).toEqual([
      { kind: "PetitionDeadline", year: 2026, date: "2026-09-15", source: FLORIDA_TAX_SOURCES.petition },
    ]);
    expect(floridaTaxReminders("FL", [saved], at(2026, 9, 15))).toHaveLength(1);
    expect(floridaTaxReminders("FL", [saved], at(2026, 9, 16))).toEqual([]);
    expect(floridaTaxReminders("FL", [saved], at(2026, 8, 20))).toEqual([]); // 26 days out
    // The owner's own date is used even for a year outside the table.
    const later: TaxYearStatus = { year: 2028, exemption: "Unknown", petitionDeadline: "2028-09-12" };
    expect(floridaTaxReminders("FL", [later], at(2028, 9, 1))).toMatchObject([{ kind: "PetitionDeadline" }]);
  });

  it("ignores a petition date saved on another year's record", () => {
    const old: TaxYearStatus = { year: 2026, exemption: "Granted", petitionDeadline: "2027-09-10" };
    expect(floridaTaxReminders("FL", [old], at(2027, 9, 1))).toMatchObject([{ kind: "TrimNotice" }]);
  });
});
