/**
 * @jest-environment node
 */
import {
  parseTimelineDays,
  validateBidForm,
  buildBidPayload,
  type BidForm,
} from "../../services/bidFormService";

const VALID: BidForm = {
  amountDollars: "1500",
  timelineDays:  "5",
  notes:         "",
};

// ── parseTimelineDays ─────────────────────────────────────────────────────────

describe("parseTimelineDays", () => {
  it("parses a valid positive integer", ()  => expect(parseTimelineDays("5")).toBe(5));
  it("parses 30 days",                 ()  => expect(parseTimelineDays("30")).toBe(30));
  it("parses 365 days (max)",          ()  => expect(parseTimelineDays("365")).toBe(365));
  it("returns null for zero",          ()  => expect(parseTimelineDays("0")).toBeNull());
  it("returns null for negative",      ()  => expect(parseTimelineDays("-1")).toBeNull());
  it("returns null for empty string",  ()  => expect(parseTimelineDays("")).toBeNull());
  it("returns null for non-numeric",   ()  => expect(parseTimelineDays("abc")).toBeNull());
  it("returns null for > 365",         ()  => expect(parseTimelineDays("366")).toBeNull());
  it("floors decimals",                ()  => expect(parseTimelineDays("3.9")).toBe(3));
});

// ── validateBidForm ───────────────────────────────────────────────────────────

describe("validateBidForm", () => {
  it("returns null for a valid form", () => {
    expect(validateBidForm(VALID)).toBeNull();
  });

  it("returns null when notes are present", () => {
    expect(validateBidForm({ ...VALID, notes: "Will use certified parts." })).toBeNull();
  });

  it("returns error when amount is zero", () => {
    expect(validateBidForm({ ...VALID, amountDollars: "0" })).toMatch(/amount/i);
  });

  it("returns error when amount is empty", () => {
    expect(validateBidForm({ ...VALID, amountDollars: "" })).toMatch(/amount/i);
  });

  it("returns error when amount is non-numeric", () => {
    expect(validateBidForm({ ...VALID, amountDollars: "abc" })).toMatch(/amount/i);
  });

  it("returns error when timeline is zero", () => {
    expect(validateBidForm({ ...VALID, timelineDays: "0" })).toMatch(/timeline/i);
  });

  it("returns error when timeline is empty", () => {
    expect(validateBidForm({ ...VALID, timelineDays: "" })).toMatch(/timeline/i);
  });

  it("returns error when timeline exceeds 365", () => {
    expect(validateBidForm({ ...VALID, timelineDays: "400" })).toMatch(/timeline/i);
  });
});

// ── buildBidPayload ───────────────────────────────────────────────────────────

describe("buildBidPayload", () => {
  it("converts dollar amount to cents", () => {
    expect(buildBidPayload("req_1", VALID).amountCents).toBe(150000);
  });

  it("parses timeline as integer days", () => {
    expect(buildBidPayload("req_1", VALID).timelineDays).toBe(5);
  });

  it("sets notes to null when empty", () => {
    expect(buildBidPayload("req_1", { ...VALID, notes: "" }).notes).toBeNull();
  });

  it("includes notes when provided", () => {
    expect(buildBidPayload("req_1", { ...VALID, notes: "Certified tech." }).notes)
      .toBe("Certified tech.");
  });

  it("passes requestId through", () => {
    expect(buildBidPayload("req_abc", VALID).requestId).toBe("req_abc");
  });
});
