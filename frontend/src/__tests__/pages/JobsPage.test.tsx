/**
 * JobsPage — real branching logic worth locking down:
 *   - loading -> empty -> populated states
 *   - openJobs excludes verified jobs and rejected_by_homeowner
 *   - bidCount sums bids across all open quote requests
 *   - accept/decline remove the bid from bidsMap (optimistic update)
 *   - mobile vs desktop switch
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import JobsPage from "@/pages/JobsPage";
import type { Job } from "@/services/job";
import type { QuoteRequest, Quote } from "@/services/quote";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetAll, mockGetRequests, mockGetQuotesForRequest } = vi.hoisted(() => ({
  mockGetAll:               vi.fn(),
  mockGetRequests:          vi.fn(),
  mockGetQuotesForRequest:  vi.fn(),
}));

vi.mock("@/services/job", () => ({
  jobService: { getAll: mockGetAll },
}));

vi.mock("@/services/quote", () => ({
  quoteService: { getRequests: mockGetRequests, getQuotesForRequest: mockGetQuotesForRequest },
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: [{ id: "prop-1", address: "123 Main St" }] }),
}));

const { mockBreakpoint } = vi.hoisted(() => ({ mockBreakpoint: { isMobile: false, isTablet: false } }));

vi.mock("@/hooks/useBreakpoint", () => ({
  useBreakpoint: () => mockBreakpoint,
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/pages/MobileJobsPage", () => ({
  MobileJobsPage: () => <div data-testid="mobile-jobs" />,
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner",
    serviceType: "HVAC", amount: 50000, date: "2024-01-01",
    description: "Annual service", isDiy: false, status: "completed",
    verified: false, homeownerSigned: true, contractorSigned: true,
    photos: [], createdAt: Date.now(),
    ...overrides,
  } as Job;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/jobs"]}>
      <JobsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBreakpoint.isMobile = false;
  mockBreakpoint.isTablet = false;
  mockGetRequests.mockResolvedValue([]);
  mockGetQuotesForRequest.mockResolvedValue([]);
});

describe("JobsPage — loading and empty states", () => {
  it("shows a spinner while loading", () => {
    mockGetAll.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderPage();
    expect(container.querySelector(".spinner-lg")).toBeInTheDocument();
  });

  it("shows the empty state when there are no open jobs and no requests", async () => {
    mockGetAll.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No open jobs")).toBeInTheDocument());
    expect(screen.getByText("Post your first job")).toBeInTheDocument();
  });
});

describe("JobsPage — open job filtering", () => {
  it("excludes verified jobs from the open-jobs count", async () => {
    mockGetAll.mockResolvedValue([
      makeJob({ id: "j1", verified: false, status: "completed" }),
      makeJob({ id: "j2", verified: true, status: "completed" }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/1 open job/)).toBeInTheDocument());
  });

  it("excludes jobs rejected_by_homeowner from the open-jobs count", async () => {
    mockGetAll.mockResolvedValue([
      makeJob({ id: "j1", verified: false, status: "completed" }),
      makeJob({ id: "j2", verified: false, status: "rejected_by_homeowner" as any }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/1 open job/)).toBeInTheDocument());
  });

  it("pluralizes the header correctly for multiple open jobs", async () => {
    mockGetAll.mockResolvedValue([
      makeJob({ id: "j1" }),
      makeJob({ id: "j2" }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/2 open jobs/)).toBeInTheDocument());
  });
});

describe("JobsPage — bid count and accept/decline", () => {
  it("sums bids across open quote requests into the header count", async () => {
    mockGetAll.mockResolvedValue([makeJob({ id: "j1", propertyId: "prop-1" })]);
    const request: QuoteRequest = {
      id: "req-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
      urgency: "medium", description: "x", status: "open", createdAt: Date.now(),
    };
    mockGetRequests.mockResolvedValue([request]);
    const quote: Quote = {
      id: "q1", requestId: "req-1", contractor: "Cool Air LLC",
      amount: 45000, timeline: 3, validUntil: Date.now(), status: "pending", createdAt: Date.now(),
    };
    mockGetQuotesForRequest.mockResolvedValue([quote]);

    renderPage();
    await waitFor(() => expect(screen.getByText(/1 bid waiting on you/)).toBeInTheDocument());
    expect(screen.getByText("Accept bid")).toBeInTheDocument();
  });

  it("removes the bid from the list after Accept is clicked", async () => {
    mockGetAll.mockResolvedValue([makeJob({ id: "j1", propertyId: "prop-1" })]);
    const request: QuoteRequest = {
      id: "req-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
      urgency: "medium", description: "x", status: "open", createdAt: Date.now(),
    };
    mockGetRequests.mockResolvedValue([request]);
    const quote: Quote = {
      id: "q1", requestId: "req-1", contractor: "Cool Air LLC",
      amount: 45000, timeline: 3, validUntil: Date.now(), status: "pending", createdAt: Date.now(),
    };
    mockGetQuotesForRequest.mockResolvedValue([quote]);

    renderPage();
    await waitFor(() => expect(screen.getByText("Accept bid")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Accept bid"));
    await waitFor(() => expect(screen.queryByText("Accept bid")).not.toBeInTheDocument());
  });
});

describe("JobsPage — navigation", () => {
  it("navigates to /jobs/new when 'Post a job' is clicked", async () => {
    mockGetAll.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No open jobs")).toBeInTheDocument());
    fireEvent.click(screen.getByText("+ Post a job"));
    expect(mockNavigate).toHaveBeenCalledWith("/jobs/new");
  });

  it("navigates to /dashboard when 'Back to dashboard' is clicked", async () => {
    mockGetAll.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No open jobs")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Back to dashboard"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});

describe("JobsPage — mobile switch", () => {
  it("renders MobileJobsPage when isMobile is true", async () => {
    mockBreakpoint.isMobile = true;
    mockGetAll.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("mobile-jobs")).toBeInTheDocument());
  });
});
