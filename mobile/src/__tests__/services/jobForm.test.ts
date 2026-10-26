/**
 * @jest-environment node
 */
import {
  parseDollarAmount,
  validateJobForm,
  buildJobPayload,
  type JobForm,
} from "../../services/jobFormService";

const VALID_DIY: JobForm = {
  serviceType:    "HVAC",
  description:    "Replaced air filter",
  amountDollars:  "45",
  completedDate:  "2026-03-15",
  isDiy:          true,
  contractorName: "",
  permitNumber:   "",
};

const VALID_CONTRACTOR: JobForm = {
  serviceType:    "Plumbing",
  description:    "Fixed leaking faucet under kitchen sink",
  amountDollars:  "320",
  completedDate:  "2026-02-20",
  isDiy:          false,
  contractorName: "Joe's Plumbing",
  permitNumber:   "",
};

// ── parseDollarAmount ─────────────────────────────────────────────────────────

describe("parseDollarAmount", () => {
  it("parses a plain integer string to cents", () => {
    expect(parseDollarAmount("45")).toBe(4500);
  });

  it("parses a dollar-sign prefix", () => {
    expect(parseDollarAmount("$320")).toBe(32000);
  });

  it("parses commas in thousands", () => {
    expect(parseDollarAmount("1,850")).toBe(185000);
  });

  it("parses decimal dollars", () => {
    expect(parseDollarAmount("99.99")).toBe(9999);
  });

  it("rounds half-cents", () => {
    expect(parseDollarAmount("0.015")).toBe(2);  // rounds up
  });

  it("returns null for empty string", () => {
    expect(parseDollarAmount("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseDollarAmount("abc")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parseDollarAmount("0")).toBeNull();
  });

  it("returns null for negative", () => {
    expect(parseDollarAmount("-10")).toBeNull();
  });
});

// ── validateJobForm ───────────────────────────────────────────────────────────

describe("validateJobForm", () => {
  it("returns null for a valid DIY form", () => {
    expect(validateJobForm(VALID_DIY)).toBeNull();
  });

  it("returns null for a valid contractor form", () => {
    expect(validateJobForm(VALID_CONTRACTOR)).toBeNull();
  });

  it("returns error when serviceType is missing", () => {
    expect(validateJobForm({ ...VALID_DIY, serviceType: "" })).toMatch(/service type/i);
  });

  it("returns error when description is empty", () => {
    expect(validateJobForm({ ...VALID_DIY, description: "" })).toMatch(/description/i);
  });

  it("returns error when amount is invalid", () => {
    expect(validateJobForm({ ...VALID_DIY, amountDollars: "0" })).toMatch(/amount/i);
  });

  it("returns error when completedDate is not YYYY-MM-DD", () => {
    expect(validateJobForm({ ...VALID_DIY, completedDate: "03/15/2026" })).toMatch(/date/i);
  });

  it("returns error when completedDate is empty", () => {
    expect(validateJobForm({ ...VALID_DIY, completedDate: "" })).toMatch(/date/i);
  });

  it("returns error when contractor job has no contractor name", () => {
    expect(validateJobForm({ ...VALID_CONTRACTOR, contractorName: "" })).toMatch(/contractor/i);
  });

  it("does not require contractorName when isDiy is true", () => {
    expect(validateJobForm({ ...VALID_DIY, contractorName: "" })).toBeNull();
  });
});

// ── buildJobPayload ───────────────────────────────────────────────────────────

describe("buildJobPayload", () => {
  it("converts dollar amount to cents", () => {
    const payload = buildJobPayload("prop_1", VALID_DIY);
    expect(payload.amountCents).toBe(4500);
  });

  it("sets contractorName to null for DIY jobs", () => {
    const payload = buildJobPayload("prop_1", VALID_DIY);
    expect(payload.contractorName).toBeNull();
  });

  it("includes contractorName for non-DIY jobs", () => {
    const payload = buildJobPayload("prop_1", VALID_CONTRACTOR);
    expect(payload.contractorName).toBe("Joe's Plumbing");
  });

  it("sets permitNumber to null when empty", () => {
    const payload = buildJobPayload("prop_1", { ...VALID_DIY, permitNumber: "" });
    expect(payload.permitNumber).toBeNull();
  });

  it("includes permitNumber when provided", () => {
    const payload = buildJobPayload("prop_1", { ...VALID_DIY, permitNumber: "P-12345" });
    expect(payload.permitNumber).toBe("P-12345");
  });

  it("passes propertyId through", () => {
    const payload = buildJobPayload("prop_abc", VALID_DIY);
    expect(payload.propertyId).toBe("prop_abc");
  });
});

describe("warranty months", () => {
  it("passes a whole number of months through to the payload", () => {
    expect(buildJobPayload("p1", { ...VALID_DIY, warrantyMonths: " 24 " }).warrantyMonths).toBe(24);
    expect(buildJobPayload("p1", { ...VALID_DIY, warrantyMonths: "" }).warrantyMonths).toBeNull();
    expect(buildJobPayload("p1", VALID_DIY).warrantyMonths).toBeNull();
  });

  it("rejects a warranty that isn't a whole number", () => {
    expect(validateJobForm({ ...VALID_DIY, warrantyMonths: "1.5" })).toMatch(/whole number/);
    expect(validateJobForm({ ...VALID_DIY, warrantyMonths: "12" })).toBeNull();
  });
});
