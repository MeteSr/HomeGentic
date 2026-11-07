import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReviewRequest, Assessment, CondoRecord } from "@/services/hoaRecords";

const { svc, mockGetAccessRole, mockGetByJob, mockToast } = vi.hoisted(() => ({
  svc: {
    listReviews: vi.fn(),
    addReview: vi.fn(),
    updateReview: vi.fn(),
    deleteReview: vi.fn(),
    listAssessments: vi.fn(),
    addAssessment: vi.fn(),
    updateAssessment: vi.fn(),
    deleteAssessment: vi.fn(),
    getCondo: vi.fn(),
    saveCondo: vi.fn(),
  },
  mockGetAccessRole: vi.fn(),
  mockGetByJob: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/hoaRecords", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/hoaRecords")>()),
  hoaService: svc,
}));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: mockGetAccessRole } }));
vi.mock("@/services/photo", () => ({ photoService: { getByJob: mockGetByJob } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { HoaTab } from "@/pages/PropertyDetail/HoaTab";

const NOW = Date.UTC(2026, 10, 7, 15);
const JOBS = [{ id: "job-1", label: "Fence install (Mar 30, 2026)" }];
const FENCE: ReviewRequest = {
  id: "r1",
  project: "Replace the back fence",
  details: "6 ft vinyl",
  submittedDate: "2026-03-02",
  status: "ApprovedWithConditions",
  decisionDate: "2026-03-20",
  conditions: "Match the neighbours",
  approvalDocId: "doc-1",
  jobId: "job-1",
};
const ROOF: Assessment = {
  id: "a1",
  title: "Roof replacement",
  amount: 4500,
  dueDate: "2026-09-01",
  paidDate: "",
  notes: "",
  documentId: null,
};
const CONDO: CondoRecord = {
  associationName: "Bayview Towers",
  milestoneLastDate: "2024-12-15",
  milestoneNextDue: "2026-12-15",
  milestoneDocId: "doc-1",
  reserveStudyLastDate: "",
  reserveStudyNextDue: "",
  reserveStudyDocId: null,
  notes: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  mockGetAccessRole.mockResolvedValue("Owner");
  mockGetByJob.mockImplementation(async (jobId: string) =>
    jobId === "docs_p1" ? [{ id: "doc-1", description: "[HOA] arc-approval.pdf" }] : [],
  );
  svc.listReviews.mockResolvedValue([]);
  svc.listAssessments.mockResolvedValue([]);
  svc.getCondo.mockResolvedValue(null);
  svc.addReview.mockImplementation(async (_p: string, r: ReviewRequest) => ({ ...r, id: "r9" }));
  svc.updateReview.mockImplementation(async (id: string, r: ReviewRequest) => ({ ...r, id }));
  svc.deleteReview.mockResolvedValue(undefined);
  svc.addAssessment.mockImplementation(async (_p: string, a: Assessment) => ({ ...a, id: "a9" }));
  svc.updateAssessment.mockImplementation(async (id: string, a: Assessment) => ({ ...a, id }));
  svc.deleteAssessment.mockResolvedValue(undefined);
  svc.saveCondo.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("HoaTab", () => {
  it("says HomeGentic only records what the owner enters", async () => {
    render(<HoaTab propertyId="p1" propertyType="SingleFamily" jobs={JOBS} />);
    expect(await screen.findByText(/doesn't contact the association or check anything/i)).toBeInTheDocument();
  });

  it("logs a review request with its approval letter and job", async () => {
    render(<HoaTab propertyId="p1" propertyType="SingleFamily" jobs={JOBS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a request" }));
    fireEvent.change(screen.getByLabelText("What's the request for?"), { target: { value: "Replace the back fence" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "6 ft vinyl" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ApprovedWithConditions" } });
    fireEvent.change(screen.getByLabelText("Submitted"), { target: { value: "2026-03-02" } });
    fireEvent.change(screen.getByLabelText("Decision date"), { target: { value: "2026-03-20" } });
    fireEvent.change(screen.getByLabelText("Conditions"), { target: { value: "Match the neighbours" } });
    fireEvent.change(await screen.findByLabelText("Approval letter"), { target: { value: "doc-1" } });
    fireEvent.change(screen.getByLabelText("Job for the work"), { target: { value: "job-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save request" }));

    const { id: _id, ...sent } = FENCE;
    await waitFor(() => expect(svc.addReview).toHaveBeenCalledWith("p1", sent));
    const item = (await screen.findByText("Replace the back fence")).closest("li")!;
    expect(within(item).getByText("Approved with conditions")).toBeInTheDocument();
    expect(within(item).getByText(/arc-approval\.pdf/)).toBeInTheDocument();
    expect(within(item).getByText(/Fence install/)).toBeInTheDocument();
  });

  it("refuses a decision without a date, before calling the canister", async () => {
    render(<HoaTab propertyId="p1" propertyType="SingleFamily" jobs={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a request" }));
    fireEvent.change(screen.getByLabelText("What's the request for?"), { target: { value: "Shutters" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Approved" } });
    fireEvent.change(screen.getByLabelText("Submitted"), { target: { value: "2026-03-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Save request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/decision/i);
    expect(svc.addReview).not.toHaveBeenCalled();
  });

  it("edits and deletes a review request", async () => {
    svc.listReviews.mockResolvedValue([FENCE]);
    render(<HoaTab propertyId="p1" propertyType="SingleFamily" jobs={JOBS} />);
    const item = (await screen.findByText("Replace the back fence")).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Conditions"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Approved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save request" }));
    await waitFor(() =>
      expect(svc.updateReview).toHaveBeenCalledWith(
        "r1",
        expect.objectContaining({ status: "Approved", conditions: "" }),
      ),
    );
    const again = (await screen.findByText("Replace the back fence")).closest("li")!;
    fireEvent.click(within(again).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(again).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(svc.deleteReview).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByText("Replace the back fence")).toBeNull());
  });

  it("records special assessments and totals what is still owed", async () => {
    svc.listAssessments.mockResolvedValue([
      ROOF,
      { ...ROOF, id: "a2", title: "Elevator", amount: 800, paidDate: "2026-01-10" },
    ]);
    render(<HoaTab propertyId="p1" propertyType="Condo" jobs={[]} />);
    expect(await screen.findByText(/still owed: \$4,500/i)).toBeInTheDocument();
    expect(screen.getByText(/paid: \$800/i)).toBeInTheDocument();
    const roof = screen.getByText("Roof replacement").closest("li")!;
    expect(within(roof).getByText("Past due")).toBeInTheDocument();

    fireEvent.click(within(roof).getByRole("button", { name: "Mark paid" }));
    const { id: _id, ...roofFields } = ROOF;
    await waitFor(() =>
      expect(svc.updateAssessment).toHaveBeenCalledWith("a1", { ...roofFields, paidDate: "2026-11-07" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add an assessment" }));
    fireEvent.change(screen.getByLabelText("What's it for?"), { target: { value: "Seawall" } });
    fireEvent.change(screen.getByLabelText("Amount, $"), { target: { value: "2,250.50" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assessment" }));
    await waitFor(() =>
      expect(svc.addAssessment).toHaveBeenCalledWith("p1", {
        title: "Seawall",
        amount: 2250.5,
        dueDate: "2027-02-01",
        paidDate: "",
        notes: "",
        documentId: null,
      }),
    );
  });

  it("keeps the condo association's inspection and reserve study dates, for condos only", async () => {
    const { unmount } = render(<HoaTab propertyId="p1" propertyType="SingleFamily" jobs={[]} />);
    await screen.findByRole("button", { name: "Add a request" });
    expect(screen.queryByText(/milestone inspection/i)).toBeNull();
    unmount();

    render(<HoaTab propertyId="p1" propertyType="Condo" jobs={[]} />);
    fireEvent.change(await screen.findByLabelText("Association name"), { target: { value: "Bayview Towers" } });
    fireEvent.change(screen.getByLabelText("Last milestone inspection"), { target: { value: "2024-12-15" } });
    fireEvent.change(screen.getByLabelText("Next milestone inspection due"), { target: { value: "2026-12-15" } });
    fireEvent.change(screen.getByLabelText("Milestone inspection report"), { target: { value: "doc-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save condo record" }));
    await waitFor(() => expect(svc.saveCondo).toHaveBeenCalledWith("p1", CONDO));
    expect(await screen.findByText(/due within a year/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't say whether the building is safe/i)).toBeInTheDocument();
  });

  it("shows viewers the records without edit controls", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    svc.listReviews.mockResolvedValue([FENCE]);
    svc.listAssessments.mockResolvedValue([ROOF]);
    svc.getCondo.mockResolvedValue(CONDO);
    render(<HoaTab propertyId="p1" propertyType="Condo" jobs={JOBS} />);
    expect(await screen.findByText("Replace the back fence")).toBeInTheDocument();
    await waitFor(() => expect(mockGetAccessRole).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add a request" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Mark paid" })).toBeNull();
    expect(screen.getByText("Bayview Towers")).toBeInTheDocument();
  });

  it("offers a retry when the records can't be loaded", async () => {
    svc.listReviews.mockRejectedValueOnce(new Error("down"));
    render(<HoaTab propertyId="p1" propertyType="SingleFamily" jobs={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("button", { name: "Add a request" })).toBeInTheDocument();
  });
});
