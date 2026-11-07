/**
 * PropertyDetail TimelineTab — a property's job history, signing and warranty
 * uploads (test-gap audit 2026-11-03, M3: no unit coverage before).
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import { canisterError } from "@/services/candid";

const m = vi.hoisted(() => ({ upload: vi.fn(), navigate: vi.fn(), toastOk: vi.fn(), toastErr: vi.fn() }));
vi.mock("@/services/photo", () => ({ photoService: { upload: m.upload } }));
vi.mock("react-hot-toast", () => ({ default: { success: m.toastOk, error: m.toastErr } }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => m.navigate,
}));

import { TimelineTab, warrantyStatus } from "@/pages/PropertyDetail/TimelineTab";

const ME = "me-principal";
const job = (over: Partial<Job>): Job =>
  ({
    id: "J1",
    propertyId: "P1",
    homeowner: ME,
    serviceType: "HVAC",
    contractorName: "Cool Air LLC",
    amount: 125_000,
    date: "2025-06-01",
    description: "",
    isDiy: false,
    status: "pending",
    verified: false,
    homeownerSigned: false,
    contractorSigned: false,
    photos: [],
    createdAt: 0,
    ...over,
  }) as Job;
const PROPERTY = { id: "P1", owner: ME } as unknown as Property;

function renderTab(jobs: Job[], props: Partial<Parameters<typeof TimelineTab>[0]> = {}) {
  const onVerify = vi.fn();
  const onInviteContractor = vi.fn();
  render(
    <MemoryRouter>
      <TimelineTab
        property={PROPERTY}
        jobs={jobs}
        onVerify={onVerify}
        currentPrincipal={ME}
        photosByJob={{}}
        onPhotoUpload={vi.fn()}
        onInviteContractor={onInviteContractor}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onVerify, onInviteContractor };
}

beforeEach(() => vi.clearAllMocks());

describe("TimelineTab", () => {
  it("shows the empty state with no jobs", () => {
    renderTab([]);
    expect(screen.getByText("No jobs recorded yet")).toBeInTheDocument();
  });

  it("lists jobs newest first with a year marker, and flips the order", () => {
    renderTab([
      job({ id: "A", serviceType: "Roofing", date: "2023-01-05" }),
      job({ id: "B", serviceType: "Plumbing", date: "2025-02-01" }),
    ]);
    const order = () => screen.getAllByTestId(/^job-/).map((e) => e.getAttribute("data-testid"));
    expect(order()).toEqual(["job-plumbing", "job-roofing"]);
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("2023")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Newest First ↓" }));
    expect(order()).toEqual(["job-roofing", "job-plumbing"]);
  });

  it("the homeowner signs an unsigned contractor job, then sees the review nudge", () => {
    const { onVerify } = renderTab([job({ contractor: "c-principal" })]);
    fireEvent.click(screen.getByRole("button", { name: "Sign →" }));
    expect(onVerify).toHaveBeenCalledWith("J1");
    expect(screen.getByText("Job verified — leave a review")).toBeInTheDocument();
    expect(screen.getByText(/reviewing Cool Air LLC/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    expect(m.navigate).toHaveBeenCalledWith("/contractor/c-principal");
  });

  it("someone who isn't the homeowner can't sign", () => {
    renderTab([job({})], { currentPrincipal: "someone-else" });
    expect(screen.queryByRole("button", { name: "Sign →" })).toBeNull();
  });

  it("after the homeowner signs, offers to invite the contractor", () => {
    const { onInviteContractor } = renderTab([job({ homeownerSigned: true })]);
    expect(screen.getByText("Awaiting contractor signature")).toBeInTheDocument();
    expect(screen.getByText(/Contractor \(not linked\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invite →" }));
    expect(onInviteContractor).toHaveBeenCalledWith(expect.objectContaining({ id: "J1" }));
  });

  it("celebrates three verified jobs but doesn't count unverified contractors", () => {
    const v = { verified: true, status: "verified" as const, homeownerSigned: true, contractorSigned: true };
    renderTab([
      job({ id: "1", ...v }),
      job({ id: "2", ...v, date: "2025-01-01" }),
      job({ id: "3", ...v, date: "2024-01-01", contractorUnverified: true }),
    ]);
    expect(screen.queryByText("Home History Taking Shape")).toBeNull();
    expect(screen.getByText("Contractor not yet verified · not counted")).toBeInTheDocument();
  });

  it("shows the badge once three counted jobs are verified", () => {
    const v = { verified: true, status: "verified" as const };
    renderTab([job({ id: "1", ...v }), job({ id: "2", ...v }), job({ id: "3", ...v })]);
    expect(screen.getByText("Home History Taking Shape")).toBeInTheDocument();
  });

  it("details show the permit and job id, and an editable record can be edited", () => {
    renderTab([job({ permitNumber: "BLD-77", description: "New condenser", isDiy: true })]);
    fireEvent.click(screen.getByRole("button", { name: "▼ details" }));
    expect(screen.getByText("BLD-77")).toBeInTheDocument();
    expect(screen.getByText("J1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit record" }));
    expect(m.navigate).toHaveBeenCalledWith("/jobs/new", { state: { editJob: expect.objectContaining({ id: "J1" }) } });
    fireEvent.click(screen.getByRole("button", { name: "▲ less" }));
    expect(screen.queryByText("BLD-77")).toBeNull();
  });

  it("a verified job links to its ICP record and has no edit button", () => {
    renderTab([job({ verified: true, status: "verified", description: "Done" })]);
    fireEvent.click(screen.getByRole("button", { name: "▼ details" }));
    expect(screen.getByRole("link", { name: "Verified on ICP ↗" })).toHaveAttribute(
      "href",
      `https://dashboard.internetcomputer.org/account/${ME}`,
    );
    expect(screen.queryByRole("button", { name: "Edit record" })).toBeNull();
  });

  it("uploads a warranty document for a job with a warranty", async () => {
    m.upload.mockResolvedValue({});
    renderTab([job({ warrantyMonths: 24, description: "x", date: new Date().toISOString().slice(0, 10) })]);
    fireEvent.click(screen.getByRole("button", { name: "▼ details" }));
    const input = document.querySelector('input[accept="image/*,application/pdf"]') as HTMLInputElement;
    const file = new File(["pdf"], "warranty.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(m.toastOk).toHaveBeenCalledWith("Warranty document uploaded"));
    expect(m.upload).toHaveBeenCalledWith(file, "J1", "P1", "Warranty", "Warranty|HVAC|warranty.pdf");
  });

  it.each([
    [canisterError({ Duplicate: "PH_1" }), "Already uploaded"],
    [new Error("Storage full"), "Storage full"],
  ])("reports a failed warranty upload (%s)", async (err, msg) => {
    m.upload.mockRejectedValue(err);
    renderTab([job({ warrantyMonths: 12, description: "x" })]);
    fireEvent.click(screen.getByRole("button", { name: "▼ details" }));
    const input = document.querySelector('input[accept="image/*,application/pdf"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "w.pdf")] } });
    await waitFor(() => expect(m.toastErr).toHaveBeenCalledWith(msg));
  });

  it("shows a job's warranty status", () => {
    renderTab([job({ warrantyMonths: 24, date: new Date().toISOString().slice(0, 10) })]);
    const card = screen.getByTestId("job-hvac");
    expect(within(card).getByText(/🛡/)).toBeInTheDocument();
  });
});

describe("warrantyStatus", () => {
  it("is null without a warranty and says expired once it has run out", () => {
    expect(warrantyStatus(job({}))).toBeNull();
    expect(warrantyStatus(job({ warrantyMonths: 12, date: "2000-01-01" }))?.label).toMatch(/expired/i);
  });
});
