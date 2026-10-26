import { describe, it, expect } from "vitest";
import { draftPrefill } from "@/components/ForwardedInvoices";

const DRAFT = {
  id: "D1", receivedAt: 0, fromAddress: "a@b.example", subject: "Invoice", title: "AC tune-up",
  serviceType: "HVAC", contractorName: "Cool Air LLC", amountCents: 18900, completedDate: "2026-09-14",
  warrantyMonths: 12, description: "Cleaned coils.",
};

describe("draftPrefill", () => {
  it("maps a draft to the job form's prefill", () => {
    expect(draftPrefill(DRAFT)).toEqual({
      serviceType: "HVAC", contractorName: "Cool Air LLC", amount: "189.00", date: "2026-09-14",
      description: "Cleaned coils.", warrantyMonths: "12", emailDraftId: "D1",
    });
  });
  it("leaves unknown amounts and warranties blank and falls back to the title", () => {
    const p = draftPrefill({ ...DRAFT, amountCents: 0, warrantyMonths: 0, description: "" });
    expect(p).toMatchObject({ amount: "", warrantyMonths: "", description: "AC tune-up" });
  });
});
