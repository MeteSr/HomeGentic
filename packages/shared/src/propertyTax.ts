/**
 * #714: Florida property-tax dates for the Property tax card and the weekly
 * Home Pulse email.
 *
 *   Homestead exemption  apply with the county property appraiser by March 1
 *                        of the tax year (s. 196.011(1)(a), Florida Statutes).
 *   TRIM notice          the Notice of Proposed Property Taxes, which property
 *                        appraisers mail in August (DOR, "usually in
 *                        mid-August").
 *   VAB petition         due 25 days after the TRIM notice is mailed
 *                        (s. 194.011(3)(d)). The date varies by county and is
 *                        printed on the notice, so it's only ever the date the
 *                        owner saved from their own notice.
 *
 * FLORIDA_TAX_CALENDAR holds only years whose dates were checked against the
 * statutes in force; add a year only after checking it again. A year that
 * isn't in the table gets no homestead or TRIM reminder. Nothing here
 * estimates savings from an exemption or an appeal, and none of it is tax
 * advice.
 *
 * Dates are "YYYY-MM-DD" (UTC).
 */

export type TaxExemption = "Unknown" | "NotApplying" | "Applied" | "Granted" | "Denied";

/** What the reminders read from one saved tax year. */
export interface TaxYearStatus {
  year: number;
  exemption: TaxExemption;
  /** The petition deadline printed on the TRIM notice, or "". */
  petitionDeadline: string;
}

export interface FloridaTaxYear {
  year: number;
  homesteadDeadline: string;
  /** The month the TRIM notice is mailed, 1-12. */
  trimMonth: number;
}

export const FLORIDA_TAX_CALENDAR: Record<number, FloridaTaxYear> = {
  // Checked 2026-11-07 against the 2026 Florida Statutes (s. 196.011, s. 194.011).
  2026: { year: 2026, homesteadDeadline: "2026-03-01", trimMonth: 8 },
  2027: { year: 2027, homesteadDeadline: "2027-03-01", trimMonth: 8 },
};

export interface TaxSource {
  label: string;
  url: string;
}

export const FLORIDA_TAX_SOURCES = {
  homestead: {
    label: "Florida Statutes, s. 196.011",
    url: "https://www.flsenate.gov/Laws/Statutes/2026/196.011",
  },
  petition: {
    label: "Florida Department of Revenue: Petitions to the Value Adjustment Board",
    url: "https://floridarevenue.com/property/Documents/pt101.pdf",
  },
} as const satisfies Record<string, TaxSource>;

export const HOMESTEAD_REMINDER_DAYS = 60;
export const PETITION_REMINDER_DAYS = 25;
/** The TRIM reminder runs from the 1st of the TRIM month to this day of the next month. */
const TRIM_REMINDER_END_DAY = 15;

export type TaxReminderKind = "Homestead" | "TrimNotice" | "PetitionDeadline";

export interface TaxReminder {
  kind: TaxReminderKind;
  /** The tax year it's about. */
  year: number;
  /** The deadline (Homestead, PetitionDeadline) or the 1st of the TRIM month. */
  date: string;
  source: TaxSource;
}

export function isFloridaState(state: string): boolean {
  const s = state.trim().toUpperCase();
  return s === "FL" || s === "FLORIDA";
}

function dateMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().startsWith(date) ? ms : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The reminders due on `nowMs` for a home in `state`, given the tax years the
 * owner saved: the homestead deadline (unless this year is marked, or last
 * year's exemption was granted), the TRIM notice (until this year's petition
 * deadline is saved) and the saved petition deadline.
 */
export function floridaTaxReminders(state: string, years: TaxYearStatus[], nowMs: number): TaxReminder[] {
  if (!isFloridaState(state)) return [];
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const today = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
  const daysTo = (date: string) => {
    const ms = dateMs(date);
    return ms === null ? null : Math.round((ms - today) / 86_400_000);
  };
  const thisYear = years.find((y) => y.year === year);
  const lastYear = years.find((y) => y.year === year - 1);
  const out: TaxReminder[] = [];

  const cal = FLORIDA_TAX_CALENDAR[year];
  if (cal) {
    const days = daysTo(cal.homesteadDeadline);
    const marked = thisYear !== undefined && thisYear.exemption !== "Unknown";
    if (days !== null && days >= 0 && days <= HOMESTEAD_REMINDER_DAYS && !marked && lastYear?.exemption !== "Granted") {
      out.push({ kind: "Homestead", year, date: cal.homesteadDeadline, source: FLORIDA_TAX_SOURCES.homestead });
    }
    const start = Date.UTC(year, cal.trimMonth - 1, 1);
    const end = Date.UTC(year, cal.trimMonth, TRIM_REMINDER_END_DAY);
    if (today >= start && today <= end && !thisYear?.petitionDeadline) {
      out.push({
        kind: "TrimNotice",
        year,
        date: `${year}-${pad(cal.trimMonth)}-01`,
        source: FLORIDA_TAX_SOURCES.petition,
      });
    }
  }

  const deadline = thisYear?.petitionDeadline ?? "";
  const days = deadline.startsWith(`${year}-`) ? daysTo(deadline) : null;
  if (days !== null && days >= 0 && days <= PETITION_REMINDER_DAYS) {
    out.push({ kind: "PetitionDeadline", year, date: deadline, source: FLORIDA_TAX_SOURCES.petition });
  }
  return out;
}
