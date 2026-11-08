/**
 * @jest-environment node
 */
import {
  validateQuoteForm,
  buildQuotePayload,
  urgencyLabel,
  initialQuoteForm,
  type QuoteForm,
} from "../../services/quoteFormService";

const VALID: QuoteForm = {
  serviceType: "HVAC",
  urgency:     "high",
  description: "AC unit not cooling — needs diagnosis",
};

// ── validateQuoteForm ─────────────────────────────────────────────────────────

describe("validateQuoteForm", () => {
  it("returns null for a valid form", () => {
    expect(validateQuoteForm(VALID)).toBeNull();
  });

  it("returns error when serviceType is missing", () => {
    expect(validateQuoteForm({ ...VALID, serviceType: "" })).toMatch(/service type/i);
  });

  it("returns error when urgency is missing", () => {
    expect(validateQuoteForm({ ...VALID, urgency: "" as any })).toMatch(/urgency/i);
  });

  it("returns error when description is empty", () => {
    expect(validateQuoteForm({ ...VALID, description: "" })).toMatch(/description/i);
  });

  it("returns error when description is too short", () => {
    expect(validateQuoteForm({ ...VALID, description: "short" })).toMatch(/description/i);
  });

  it("accepts description exactly at the minimum length", () => {
    const tenChars = "1234567890";
    expect(validateQuoteForm({ ...VALID, description: tenChars })).toBeNull();
  });
});

// ── buildQuotePayload ─────────────────────────────────────────────────────────

describe("buildQuotePayload", () => {
  it("passes propertyId through", () => {
    expect(buildQuotePayload("prop_1", VALID).propertyId).toBe("prop_1");
  });

  it("trims whitespace from description", () => {
    const payload = buildQuotePayload("prop_1", { ...VALID, description: "  leaking roof  " });
    expect(payload.description).toBe("leaking roof");
  });

  it("includes serviceType and urgency unchanged", () => {
    const payload = buildQuotePayload("prop_1", VALID);
    expect(payload.serviceType).toBe("HVAC");
    expect(payload.urgency).toBe("high");
  });
});

// ── urgencyLabel ──────────────────────────────────────────────────────────────

describe("urgencyLabel", () => {
  it("capitalises low", ()       => expect(urgencyLabel("low")).toBe("Low"));
  it("capitalises medium", ()    => expect(urgencyLabel("medium")).toBe("Medium"));
  it("capitalises high", ()      => expect(urgencyLabel("high")).toBe("High"));
  it("capitalises emergency", () => expect(urgencyLabel("emergency")).toBe("Emergency"));
});

// ── initialQuoteForm (#715) ──────────────────────────────────────────────────

describe("initialQuoteForm", () => {
  it("starts blank", () => {
    expect(initialQuoteForm()).toEqual({ serviceType: "", urgency: "", description: "" });
  });
  it("starts with Emergency when the emergency card opens it", () => {
    expect(initialQuoteForm("emergency").urgency).toBe("emergency");
  });
});
