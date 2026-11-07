import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InsurancePolicy } from "@/services/insurancePolicy";

const { mockGet, mockSave, mockGetAccessRole, mockToast } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSave: vi.fn(),
  mockGetAccessRole: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/insurancePolicy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/insurancePolicy")>()),
  insurancePolicyService: { get: mockGet, save: mockSave },
}));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: mockGetAccessRole } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { InsuranceTab } from "@/pages/PropertyDetail/InsuranceTab";

const POLICY: InsurancePolicy = {
  carrier: "Citizens",
  policyNumber: "HO3-42",
  renewalDate: "2026-12-07",
  coverageA: 350_000,
  hurricaneDeductible: { kind: "percent", percent: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 7, 15)));
  mockGetAccessRole.mockResolvedValue("Owner");
  mockGet.mockResolvedValue(null);
  mockSave.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("InsuranceTab", () => {
  it("lets the owner save a policy, then shows it", async () => {
    render(<InsuranceTab propertyId="p1" />);
    expect(await screen.findByText(/no policy saved yet/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Insurance company"), { target: { value: "Citizens" } });
    fireEvent.change(screen.getByLabelText("Policy number"), { target: { value: "HO3-42" } });
    fireEvent.change(screen.getByLabelText("Renewal date"), { target: { value: "2026-12-07" } });
    fireEvent.change(screen.getByLabelText("Coverage A (dwelling), $"), { target: { value: "350,000" } });
    fireEvent.change(screen.getByLabelText("Hurricane deductible"), { target: { value: "percent" } });
    fireEvent.change(screen.getByLabelText("Percent of Coverage A"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith("p1", POLICY));
    expect(await screen.findByText("Citizens")).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("shows the renewal countdown and works out a percent deductible", async () => {
    mockGet.mockResolvedValue(POLICY);
    render(<InsuranceTab propertyId="p1" />);
    expect(await screen.findByText("Citizens")).toBeInTheDocument();
    expect(screen.getByText("HO3-42")).toBeInTheDocument();
    expect(screen.getByText("Dec 7, 2026")).toBeInTheDocument();
    expect(screen.getByText("Renews in 30 days")).toBeInTheDocument();
    expect(screen.getByText("$350,000")).toBeInTheDocument();
    expect(screen.getByText("2% of Coverage A (about $7,000)")).toBeInTheDocument();
    // Copy matches what happens: a reminder in the weekly email, nothing sent to the insurer.
    expect(screen.getByText(/weekly Home Pulse email/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't check these with your insurer/i)).toBeInTheDocument();
  });

  it("asks for a new date once the renewal date has passed", async () => {
    mockGet.mockResolvedValue({ ...POLICY, renewalDate: "2026-11-01" });
    render(<InsuranceTab propertyId="p1" />);
    expect(await screen.findByText(/renewal date has passed/i)).toBeInTheDocument();
  });

  it("is read-only for a viewer", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    mockGet.mockResolvedValue(POLICY);
    render(<InsuranceTab propertyId="p1" />);
    expect(await screen.findByText("Citizens")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows no form to a viewer when nothing is saved", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    render(<InsuranceTab propertyId="p1" />);
    expect(await screen.findByText(/no policy saved yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Insurance company")).not.toBeInTheDocument();
  });

  it("explains a problem with the form instead of saving", async () => {
    render(<InsuranceTab propertyId="p1" />);
    await screen.findByText(/no policy saved yet/i);
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/insurance company/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("edits a saved policy", async () => {
    mockGet.mockResolvedValue(POLICY);
    render(<InsuranceTab propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Insurance company")).toHaveValue("Citizens");
    fireEvent.change(screen.getByLabelText("Hurricane deductible"), { target: { value: "amount" } });
    fireEvent.change(screen.getByLabelText("Deductible amount, $"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("p1", {
        ...POLICY,
        hurricaneDeductible: { kind: "amount", dollars: 5000 },
      }),
    );
    expect(await screen.findByText("$5,000")).toBeInTheDocument();
  });

  it("removes the policy after a confirm", async () => {
    mockGet.mockResolvedValue(POLICY);
    render(<InsuranceTab propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(mockSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith("p1", null));
    expect(await screen.findByText(/no policy saved yet/i)).toBeInTheDocument();
  });

  it("shows a save failure without losing the form", async () => {
    mockSave.mockRejectedValue(new Error("boom"));
    mockGet.mockResolvedValue(POLICY);
    render(<InsuranceTab propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Insurance company")).toHaveValue("Citizens");
  });

  it("offers a retry when the policy can't be loaded", async () => {
    mockGet.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(POLICY);
    render(<InsuranceTab propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("Citizens")).toBeInTheDocument();
  });
});
