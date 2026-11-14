/**
 * Settings → Privacy → "Share job costs": one switch per home the user owns.
 * Each switch loads from and saves to the job canister (getMyCostSharing /
 * setCostSharing) as it changes, and rolls back with an error toast when the
 * save fails. The copy says exactly what is shared and with whom.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { job, property, mockToastError } = vi.hoisted(() => ({
  job: { getMyCostSharing: vi.fn(), setCostSharing: vi.fn() },
  property: { getMyProperties: vi.fn() },
  mockToastError: vi.fn(),
}));
vi.mock("@/services/job", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/job")>()),
  jobService: job,
}));
vi.mock("@/services/property", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/property")>()),
  propertyService: property,
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: mockToastError } }));

import { CostSharingSettings } from "@/components/CostSharingSettings";

const HOMES = [
  { id: "P1", address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801" },
  { id: "P2", address: "4 Oak Ave", city: "Orlando", state: "FL", zipCode: "32803" },
];
const sw = (name: string) => screen.getByRole("switch", { name });

beforeEach(() => {
  vi.clearAllMocks();
  property.getMyProperties.mockResolvedValue(HOMES);
});

describe("CostSharingSettings", () => {
  it("says what is shared, with whom, and the anonymity rules", async () => {
    job.getMyCostSharing.mockResolvedValue([]);
    render(<CostSharingSettings />);
    expect(await screen.findByText("Share job costs")).toBeInTheDocument();
    const intro = screen.getByText(/signed off by you and a HomeGentic-verified contractor/);
    expect(intro).toHaveTextContent(/anyone/i);
    expect(intro).toHaveTextContent(/at least 5 homes and 3 contractors/);
    expect(intro).toHaveTextContent(/never shows your address, contractor, dates or name/);
  });

  it("shows one switch per owned home with its saved setting", async () => {
    job.getMyCostSharing.mockResolvedValue(["P2"]);
    render(<CostSharingSettings />);
    await waitFor(() => expect(sw("Share costs: 12 Elm St")).toBeEnabled());
    expect(sw("Share costs: 12 Elm St")).toHaveAttribute("aria-checked", "false");
    expect(sw("Share costs: 4 Oak Ave")).toHaveAttribute("aria-checked", "true");
  });

  it("saves a change straight away", async () => {
    job.getMyCostSharing.mockResolvedValue([]);
    job.setCostSharing.mockResolvedValue(undefined);
    render(<CostSharingSettings />);
    await waitFor(() => expect(sw("Share costs: 12 Elm St")).toBeEnabled());
    fireEvent.click(sw("Share costs: 12 Elm St"));
    expect(job.setCostSharing).toHaveBeenCalledWith("P1", true);
    expect(sw("Share costs: 12 Elm St")).toHaveAttribute("aria-checked", "true");
  });

  it("rolls back and says so when the save fails", async () => {
    job.getMyCostSharing.mockResolvedValue(["P1"]);
    job.setCostSharing.mockRejectedValue(new Error("The property service didn't answer."));
    render(<CostSharingSettings />);
    await waitFor(() => expect(sw("Share costs: 12 Elm St")).toBeEnabled());
    fireEvent.click(sw("Share costs: 12 Elm St"));
    await waitFor(() => expect(sw("Share costs: 12 Elm St")).toHaveAttribute("aria-checked", "true"));
    expect(mockToastError).toHaveBeenCalledWith("The property service didn't answer.");
  });

  it("says there is nothing to share without an owned home", async () => {
    property.getMyProperties.mockResolvedValue([]);
    job.getMyCostSharing.mockResolvedValue([]);
    render(<CostSharingSettings />);
    expect(await screen.findByText(/Homes you own will appear here/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("keeps the switches disabled when the settings can't be loaded", async () => {
    job.getMyCostSharing.mockRejectedValue(new Error("offline"));
    render(<CostSharingSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your sharing settings/i);
    expect(sw("Share costs: 12 Elm St")).toBeDisabled();
  });
});
