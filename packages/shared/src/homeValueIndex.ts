/**
 * An index-based home value: the home's value when the loan was made, moved by
 * the change in the FHFA House Price Index (all transactions, by state) since
 * then. It follows the state's prices, not this home, so it's an estimate,
 * not an appraisal, and the owner can always type their own value instead.
 *
 * The voice Worker fetches FHFA's quarterly state file (/api/home-value-index)
 * and parses it with parseStateHpiCsv; the app works out the estimate.
 */

/** [year, quarter (1–4), index value]. */
export type HpiPoint = [number, number, number];

export interface Quarter {
  year: number;
  quarter: number;
}

export interface IndexEstimate {
  /** Dollars, rounded to $1,000. */
  estimate: number;
  /** Whole percent change of the index between the two quarters. */
  changePct: number;
  from: Quarter;
  to: Quarter;
}

export const HPI_SOURCE = "FHFA House Price Index, all transactions, by state";

const unquote = (s: string) =>
  s
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();

/** FHFA's state file: rows of state, year, quarter, index (a header row and extra columns are skipped). */
export function parseStateHpiCsv(text: string): Record<string, HpiPoint[]> {
  const out: Record<string, HpiPoint[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split(",").map(unquote);
    if (cols.length < 4) continue;
    const state = cols[0].toUpperCase();
    const year = Number(cols[1]);
    const quarter = Number(cols[2]);
    const index = Number(cols[3]);
    if (!/^[A-Z]{2}$/.test(state) || !Number.isInteger(year) || year < 1900) continue;
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) continue;
    if (!cols[3] || !Number.isFinite(index) || index <= 0) continue;
    (out[state] ??= []).push([year, quarter, index]);
  }
  for (const series of Object.values(out)) series.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out;
}

/** The quarter the loan was made: the month before the first payment ("YYYY-MM-DD"). */
export function loanStartQuarter(firstPaymentDate: string): Quarter | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(firstPaymentDate);
  if (!m) return null;
  let year = Number(m[1]);
  let month = Number(m[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return { year, quarter: Math.ceil(month / 3) };
}

export const quarterLabel = (q: Quarter) => `Q${q.quarter} ${q.year}`;

/** The value moved by the index from `start` to the latest quarter, or null when the data can't back it. */
export function indexEstimate(
  originalValue: number | null,
  series: HpiPoint[],
  start: Quarter | null,
): IndexEstimate | null {
  if (!originalValue || originalValue <= 0 || !start || series.length === 0) return null;
  const from = series.find(([y, q]) => y === start.year && q === start.quarter);
  const latest = series[series.length - 1];
  if (!from || from === latest) return null;
  const ratio = latest[2] / from[2];
  return {
    estimate: Math.round((originalValue * ratio) / 1000) * 1000,
    changePct: Math.round((ratio - 1) * 100),
    from: { ...start },
    to: { year: latest[0], quarter: latest[1] },
  };
}
