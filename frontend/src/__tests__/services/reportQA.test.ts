/**
 * reportQAService — real logic worth locking down:
 *   - ask() creates and stores a new question with a null answer
 *   - getByProperty scopes questions to the given property only
 *   - __reset clears all stored questions
 */

import { describe, it, expect, beforeEach } from "vitest";
import { reportQAService } from "@/services/reportQA";

beforeEach(() => reportQAService.__reset());

describe("reportQAService.ask", () => {
  it("creates a question with a null answer and a unique id", async () => {
    const qa = await reportQAService.ask("prop-1", "Was the roof replaced?");
    expect(qa.propertyId).toBe("prop-1");
    expect(qa.question).toBe("Was the roof replaced?");
    expect(qa.answer).toBeNull();
    expect(qa.id).toMatch(/^qa-/);
  });

  it("generates distinct ids for consecutive questions", async () => {
    const a = await reportQAService.ask("prop-1", "Q1");
    const b = await reportQAService.ask("prop-1", "Q2");
    expect(a.id).not.toBe(b.id);
  });
});

describe("reportQAService.getByProperty", () => {
  it("scopes questions to only the given property", async () => {
    await reportQAService.ask("prop-1", "Q about prop-1");
    await reportQAService.ask("prop-2", "Q about prop-2");

    const prop1Questions = reportQAService.getByProperty("prop-1");
    expect(prop1Questions).toHaveLength(1);
    expect(prop1Questions[0].question).toBe("Q about prop-1");
  });

  it("returns an empty array for a property with no questions", () => {
    expect(reportQAService.getByProperty("prop-nobody")).toEqual([]);
  });
});

describe("reportQAService.__reset", () => {
  it("clears all stored questions", async () => {
    await reportQAService.ask("prop-1", "Q1");
    reportQAService.__reset();
    expect(reportQAService.getByProperty("prop-1")).toEqual([]);
  });
});
