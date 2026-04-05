/**
 * @jest-environment node
 */
import {
  canSign,
  signButtonLabel,
  signConfirmationText,
  type SignableJob,
} from "../../services/signJobService";

const BASE: SignableJob = {
  id:              "job_1",
  serviceType:     "HVAC",
  propertyAddress: "123 Main St",
  amountCents:     185000,
  completedDate:   "2026-03-28",
  awaitingRole:    "contractor",
};

// ── canSign ───────────────────────────────────────────────────────────────────

describe("canSign", () => {
  it("returns true when awaitingRole matches the current role", () => {
    expect(canSign(BASE, "contractor")).toBe(true);
  });

  it("returns false when awaitingRole does not match current role", () => {
    expect(canSign(BASE, "homeowner")).toBe(false);
  });

  it("returns true for homeowner when awaiting homeowner", () => {
    const job = { ...BASE, awaitingRole: "homeowner" as const };
    expect(canSign(job, "homeowner")).toBe(true);
  });
});

// ── signButtonLabel ───────────────────────────────────────────────────────────

describe("signButtonLabel", () => {
  it("returns contractor label when awaiting contractor", () => {
    expect(signButtonLabel("contractor")).toBe("SIGN AS CONTRACTOR");
  });

  it("returns homeowner label when awaiting homeowner", () => {
    expect(signButtonLabel("homeowner")).toBe("SIGN AS HOMEOWNER");
  });
});

// ── signConfirmationText ──────────────────────────────────────────────────────

describe("signConfirmationText", () => {
  it("includes the service type", () => {
    expect(signConfirmationText(BASE)).toContain("HVAC");
  });

  it("includes the formatted dollar amount", () => {
    expect(signConfirmationText(BASE)).toContain("$1,850");
  });

  it("includes the completed date", () => {
    expect(signConfirmationText(BASE)).toContain("2026-03-28");
  });
});
