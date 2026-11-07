import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HomeWarrantyPlan, WarrantyClaim } from "@/services/homeWarranty";

const { svc, mockGetAccessRole, mockGetByJob, mockToast } = vi.hoisted(() => ({
  svc: {
    getPlan: vi.fn(),
    savePlan: vi.fn(),
    listClaims: vi.fn(),
    addClaim: vi.fn(),
    updateClaim: vi.fn(),
    deleteClaim: vi.fn(),
  },
  mockGetAccessRole: vi.fn(),
  mockGetByJob: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/homeWarranty", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/homeWarranty")>()),
  homeWarrantyService: svc,
}));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: mockGetAccessRole } }));
vi.mock("@/services/photo", () => ({ photoService: { getByJob: mockGetByJob } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { HomeWarrantyTab } from "@/pages/PropertyDetail/HomeWarrantyTab";

const JOBS = [{ id: "job-1", label: "HVAC (Jul 3, 2026)" }];
const PLAN: HomeWarrantyPlan = {
  provider: "American Home Shield",
  planName: "ShieldGold",
  contractNumber: "AHS-1",
  claimContact: "1-800-555-0100",
  serviceFee: 125,
  startDate: "2026-01-15",
  renewalDate: "2026-12-07",
  coverageNotes: "HVAC, plumbing, water heater",
  exclusionNotes: "Pool equipment",
  contractDocId: "doc-1",
};
const AC: WarrantyClaim = {
  id: "c1",
  dateFiled: "2026-07-02",
  issue: "AC not cooling",
  claimNumber: "WO-1",
  jobId: "job-1",
  serviceFeePaid: 125,
  outcome: "PartlyApproved",
  outcomeNotes: "Compressor covered",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 7, 15)));
  mockGetAccessRole.mockResolvedValue("Owner");
  mockGetByJob.mockImplementation(async (jobId: string) =>
    jobId === "docs_p1" ? [{ id: "doc-1", description: "[Warranty] ahs-contract.pdf" }] : [],
  );
  svc.getPlan.mockResolvedValue(null);
  svc.listClaims.mockResolvedValue([]);
  svc.savePlan.mockResolvedValue(undefined);
  svc.addClaim.mockImplementation(async (_p: string, c: WarrantyClaim) => ({ ...c, id: "c9" }));
  svc.updateClaim.mockImplementation(async (id: string, c: WarrantyClaim) => ({ ...c, id }));
  svc.deleteClaim.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("HomeWarrantyTab", () => {
  it("says what it is and isn't, and offers to add the plan", async () => {
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    expect(await screen.findByText(/doesn't sell or rate home warranty plans/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your plan" })).toBeInTheDocument();
  });

  it("saves a plan from the form, with the contract from Documents", async () => {
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add your plan" }));
    fireEvent.change(screen.getByLabelText("Home warranty company"), { target: { value: " American Home Shield " } });
    fireEvent.change(screen.getByLabelText("Service-call fee, $"), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Renewal date"), { target: { value: "2026-12-07" } });
    fireEvent.change(screen.getByLabelText("What it covers"), { target: { value: "HVAC" } });
    fireEvent.change(screen.getByLabelText("Contract"), { target: { value: "doc-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() =>
      expect(svc.savePlan).toHaveBeenCalledWith("p1", expect.objectContaining({
        provider: "American Home Shield", serviceFee: 125, renewalDate: "2026-12-07", coverageNotes: "HVAC", contractDocId: "doc-1",
      })),
    );
    expect(await screen.findByText("Renews in 30 days")).toBeInTheDocument();
  });

  it("refuses a plan without a renewal date", async () => {
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add your plan" }));
    fireEvent.change(screen.getByLabelText("Home warranty company"), { target: { value: "AHS" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/renewal date/i);
    expect(svc.savePlan).not.toHaveBeenCalled();
  });

  it("shows the saved plan in the owner's words, with the renewal countdown", async () => {
    svc.getPlan.mockResolvedValue(PLAN);
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    expect(await screen.findByText("American Home Shield · ShieldGold")).toBeInTheDocument();
    expect(screen.getByText("Renews in 30 days")).toBeInTheDocument();
    expect(screen.getByText(/covers \(as you entered it\)/i)).toBeInTheDocument();
    expect(screen.getByText("HVAC, plumbing, water heater")).toBeInTheDocument();
    expect(screen.getByText("ahs-contract.pdf")).toBeInTheDocument();
    expect(screen.getByText(/housing costs on the bills tab/i)).toBeInTheDocument();
  });

  it("flags a renewal date that has passed", async () => {
    svc.getPlan.mockResolvedValue({ ...PLAN, renewalDate: "2026-11-01" });
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    expect(await screen.findByText("Renewal date passed")).toBeInTheDocument();
  });

  it("logs a claim linked to a job, and totals the fees paid", async () => {
    svc.listClaims.mockResolvedValue([AC]);
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    const item = await screen.findByText("AC not cooling");
    const row = item.closest("li")!;
    expect(within(row).getByText("Partly approved")).toBeInTheDocument();
    expect(within(row).getByText(/HVAC \(Jul 3, 2026\)/)).toBeInTheDocument();
    expect(screen.getByText("Service-call fees paid: $125 across 1 claim")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log a claim" }));
    fireEvent.change(screen.getByLabelText("What's the claim for?"), { target: { value: "Water heater leak" } });
    fireEvent.change(screen.getByLabelText("Date filed"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Service fee paid, $"), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Job"), { target: { value: "job-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save claim" }));
    await waitFor(() =>
      expect(svc.addClaim).toHaveBeenCalledWith("p1", expect.objectContaining({
        issue: "Water heater leak", dateFiled: "2026-10-01", serviceFeePaid: 125, jobId: "job-1", outcome: "Open",
      })),
    );
    expect(await screen.findByText("Service-call fees paid: $250 across 2 claims · 1 open")).toBeInTheDocument();
  });

  it("edits and deletes a claim", async () => {
    svc.listClaims.mockResolvedValue([AC]);
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    const row = (await screen.findByText("AC not cooling")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "Denied" } });
    fireEvent.click(screen.getByRole("button", { name: "Save claim" }));
    await waitFor(() => expect(svc.updateClaim).toHaveBeenCalledWith("c1", expect.objectContaining({ outcome: "Denied" })));
    const again = (await screen.findByText("AC not cooling")).closest("li")!;
    fireEvent.click(within(again).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(again).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(svc.deleteClaim).toHaveBeenCalledWith("c1"));
    expect(screen.queryByText("AC not cooling")).not.toBeInTheDocument();
  });

  it("is read-only for viewers", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    svc.getPlan.mockResolvedValue(PLAN);
    svc.listClaims.mockResolvedValue([AC]);
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    await screen.findByText("AC not cooling");
    expect(screen.queryByRole("button", { name: "Edit plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log a claim" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    svc.getPlan.mockRejectedValueOnce(new Error("down"));
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("button", { name: "Add your plan" })).toBeInTheDocument();
  });

  it("removes the plan", async () => {
    svc.getPlan.mockResolvedValue(PLAN);
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove plan" }));
    await waitFor(() => expect(svc.savePlan).toHaveBeenCalledWith("p1", null));
    expect(await screen.findByRole("button", { name: "Add your plan" })).toBeInTheDocument();
  });

  it("tells the user when saving fails", async () => {
    svc.savePlan.mockRejectedValue(new Error("boom"));
    svc.getPlan.mockResolvedValue(PLAN);
    render(<HomeWarrantyTab propertyId="p1" jobs={JOBS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});
