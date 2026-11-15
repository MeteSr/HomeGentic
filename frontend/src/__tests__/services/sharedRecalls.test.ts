/**
 * CPSC recall records and model matching (packages/shared/src/recalls.ts),
 * shared by the voice Worker's /api/recalls and the relay's weekly recall
 * alert. A match is only ever a possible recall.
 */
import { describe, it, expect } from "vitest";
import { normModel, recallMatches, toRecall } from "../../../../packages/shared/src/recalls";

const RHEEM = {
  RecallID: 9001,
  RecallNumber: "24-123",
  RecallDate: "2024-03-07T00:00:00",
  Title: "Rheem Recalls Gas Water Heaters",
  Description: "This recall involves Rheem gas water heaters.",
  URL: "https://www.cpsc.gov/Recalls/2024/Rheem",
  Products: [{ Name: "Gas water heaters", Model: "XG40T06EC36U1, XG50T06EC36U1; XE50T" }],
  Hazards: [{ Name: "Fire hazard" }],
  Remedies: [{ Name: "Repair" }, { Name: "Replace" }],
};

describe("toRecall", () => {
  it("keeps the fields we show and the model list for matching", () => {
    const r = toRecall(RHEEM);
    expect(r).toMatchObject({
      id: "9001",
      number: "24-123",
      date: "2024-03-07",
      hazard: "Fire hazard",
      remedy: "Repair; Replace",
    });
    expect(r.url).toBe("https://www.cpsc.gov/Recalls/2024/Rheem");
    expect(r.models).toEqual(["XG40T06EC36U1", "XG50T06EC36U1", "XE50T"]);
  });

  it("drops non-CPSC links and tolerates missing fields", () => {
    expect(toRecall({ ...RHEEM, URL: "https://evil.example/x" }).url).toBe("");
    expect(toRecall({})).toMatchObject({ id: "", title: "", models: [], hazard: "", remedy: "" });
  });
});

describe("recallMatches", () => {
  const r = toRecall(RHEEM);
  it("matches a model named in the recall, or one starting with a listed family", () => {
    expect(recallMatches(r, "XG40T06EC36U1")).toBe(true);
    expect(recallMatches(r, "xe50t-10h45u0")).toBe(true);
  });

  it("doesn't match other or too-short models", () => {
    expect(recallMatches(r, "RDH-50")).toBe(false);
    expect(recallMatches(r, "XE5")).toBe(false);
  });

  it("normalises model numbers to uppercase letters and digits", () => {
    expect(normModel(" xe-50t/10 ")).toBe("XE50T10");
  });
});
