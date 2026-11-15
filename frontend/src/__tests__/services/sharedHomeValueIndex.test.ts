/**
 * packages/shared/src/homeValueIndex.ts: an index-based home value. The
 * value when the loan was made, moved by the change in the FHFA House Price
 * Index for the home's state since then. An estimate, not an appraisal.
 *
 *  HV.1 parseStateHpiCsv reads state, year, quarter, index rows (header or not)
 *  HV.2 it skips junk rows and keeps each state's quarters in order
 *  HV.3 loanStartQuarter is the quarter of the month before the first payment
 *  HV.4 indexEstimate scales the value by the index change, rounded to $1,000
 *  HV.5 it gives nothing without a value, a start quarter in the series, or data
 */
import { describe, it, expect } from "vitest";
import {
  parseStateHpiCsv,
  loanStartQuarter,
  indexEstimate,
  quarterLabel,
  type HpiPoint,
} from "@homegentic/shared/homeValueIndex";

describe("parseStateHpiCsv", () => {
  it("HV.1 reads rows with or without a header, any case, extra columns ignored", () => {
    const csv = [
      "state,yr,qtr,index_nsa",
      "FL,2019,2,250.5",
      "fl,2019,1,248",
      '"TX","2019","2","220.25","x"',
      "TX,2026,2,301",
    ].join("\n");
    const out = parseStateHpiCsv(csv);
    expect(out.FL).toEqual([
      [2019, 1, 248],
      [2019, 2, 250.5],
    ]);
    expect(out.TX).toEqual([
      [2019, 2, 220.25],
      [2026, 2, 301],
    ]);
  });

  it("HV.2 skips junk rows", () => {
    const out = parseStateHpiCsv(
      "\nFL,2019,5,1\nFL,abc,1,2\nFLA,2019,1,2\nFL,2019,1,-3\nFL,2019,1,.\nFL,2020,3,260\r\n",
    );
    expect(out).toEqual({ FL: [[2020, 3, 260]] });
  });
});

describe("loanStartQuarter", () => {
  it("HV.3 is the quarter of the month before the first payment", () => {
    expect(loanStartQuarter("2019-07-01")).toEqual({ year: 2019, quarter: 2 });
    expect(loanStartQuarter("2019-08-01")).toEqual({ year: 2019, quarter: 3 });
    expect(loanStartQuarter("2020-01-01")).toEqual({ year: 2019, quarter: 4 });
    expect(loanStartQuarter("")).toBeNull();
    expect(loanStartQuarter("July 2019")).toBeNull();
    expect(quarterLabel({ year: 2019, quarter: 2 })).toBe("Q2 2019");
  });
});

describe("indexEstimate", () => {
  const series: HpiPoint[] = [
    [2019, 1, 240],
    [2019, 2, 250],
    [2026, 1, 340],
    [2026, 2, 345],
  ];

  it("HV.4 scales the value by the index change since the start quarter", () => {
    expect(indexEstimate(300_000, series, { year: 2019, quarter: 2 })).toEqual({
      estimate: 414_000,
      changePct: 38,
      from: { year: 2019, quarter: 2 },
      to: { year: 2026, quarter: 2 },
    });
    // Falling prices round the same way.
    expect(
      indexEstimate(
        301_000,
        [
          [2022, 2, 400],
          [2023, 2, 380],
        ],
        { year: 2022, quarter: 2 },
      ),
    ).toMatchObject({
      estimate: 286_000,
      changePct: -5,
    });
  });

  it("HV.5 gives nothing it can't back with the data", () => {
    expect(indexEstimate(null, series, { year: 2019, quarter: 2 })).toBeNull();
    expect(indexEstimate(0, series, { year: 2019, quarter: 2 })).toBeNull();
    expect(indexEstimate(300_000, series, null)).toBeNull();
    expect(indexEstimate(300_000, series, { year: 2018, quarter: 4 })).toBeNull();
    expect(indexEstimate(300_000, [], { year: 2019, quarter: 2 })).toBeNull();
    // The start is the latest quarter: no change to report yet.
    expect(indexEstimate(300_000, series, { year: 2026, quarter: 2 })).toBeNull();
  });
});
