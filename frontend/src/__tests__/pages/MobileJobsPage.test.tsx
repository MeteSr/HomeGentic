/**
 * MobileJobsPage — real logic worth locking down:
 *   - jobs are split into "with active bids" vs "awaiting bids" based on
 *     whether their quote requests have any bids yet
 *   - verified jobs render as Scheduled cards, using the property address map
 *   - the unique-contractors list dedupes by contractor principal across all bids
 *   - contractor names and verified-job counts come from the contractor profile,
 *     never made up
 *   - the empty state shows only when there are no open jobs and no requests
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MobileJobsPage } from "@/pages/MobileJobsPage";
import type { Job } from "@/services/job";
import type { QuoteRequest, Quote } from "@/services/quote";

const { mockGetAll, mockGetRequests, mockGetQuotesForRequest, mockUsePropertyStore, mockGetContractor } = vi.hoisted(() => ({
  mockGetContractor: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetRequests: vi.fn(),
  mockGetQuotesForRequest: vi.fn(),
  mockUsePropertyStore: vi.fn(),
}));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getAll: mockGetAll } };
});
vi.mock("@/services/quote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/quote")>();
  return { ...actual, quoteService: { getRequests: mockGetRequests, getQuotesForRequest: mockGetQuotesForRequest } };
});
vi.mock("@/store/propertyStore", () => ({ usePropertyStore: mockUsePropertyStore }));
vi.mock("@/services/contractor", () => ({ contractorService: { getContractor: mockGetContractor } }));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-06-01", description: "AC repair", isDiy: false,
    contractorName: "Cool Air Co.", status: "pending" as any, verified: false,
    homeownerSigned: false, contractorSigned: false, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return { id: "req-1", propertyId: "prop-1", serviceType: "HVAC", description: "d", urgency: "medium", status: "open", createdAt: Date.now(), ...overrides } as QuoteRequest;
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return { id: "quote-1", requestId: "req-1", contractor: "acme-principal", amount: 50000, timeline: 7, ...overrides } as Quote;
}

function renderPage() {
  return render(<MemoryRouter><MobileJobsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePropertyStore.mockReturnValue({ properties: [{ id: "prop-1", address: "123 Main St, Austin, TX" }] });
  mockGetContractor.mockImplementation((id: string) =>
    Promise.resolve(id === "acme-principal" ? { id, name: "Acme Co.", jobsCompleted: 12, isVerified: true } : null)
  );
});

describe("MobileJobsPage — empty state", () => {
  it("shows the empty state when there are no jobs and no requests", async () => {
    mockGetAll.mockResolvedValue([]);
    mockGetRequests.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No open jobs yet")).toBeInTheDocument();
  });
});

describe("MobileJobsPage — job classification", () => {
  it("shows a job as an active-bid card when its request has bids", async () => {
    mockGetAll.mockResolvedValue([makeJob()]);
    mockGetRequests.mockResolvedValue([makeRequest({ status: "quoted" })]);
    mockGetQuotesForRequest.mockResolvedValue([makeQuote()]);
    renderPage();

    await waitFor(() => expect(screen.getByText(/1 NEW BID/)).toBeInTheDocument());
    expect(screen.getByText("Compare bids")).toBeInTheDocument();
  });

  it("shows a job as awaiting-bids when its request has no bids yet", async () => {
    mockGetAll.mockResolvedValue([makeJob()]);
    mockGetRequests.mockResolvedValue([makeRequest({ status: "open" })]);
    mockGetQuotesForRequest.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("AWAITING BIDS")).toBeInTheDocument();
  });

  it("shows a verified job as Scheduled, with the property address resolved", async () => {
    // requests must be non-empty for the page to render past the empty state,
    // even though this unrelated request has no bearing on the verified job
    mockGetAll.mockResolvedValue([makeJob({ verified: true })]);
    mockGetRequests.mockResolvedValue([makeRequest({ id: "unrelated-req", propertyId: "prop-other" })]);
    mockGetQuotesForRequest.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("SCHEDULED")).toBeInTheDocument();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
  });
});

describe("MobileJobsPage — contractors list", () => {
  it("dedupes contractors by principal across multiple bids", async () => {
    mockGetAll.mockResolvedValue([makeJob({ id: "j1" }), makeJob({ id: "j2", propertyId: "prop-1" })]);
    mockGetRequests.mockResolvedValue([makeRequest({ id: "req-1" }), makeRequest({ id: "req-2" })]);
    mockGetQuotesForRequest.mockImplementation((id: string) =>
      Promise.resolve([makeQuote({ id: `q-${id}`, requestId: id, contractor: "acme-principal" })])
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("YOUR CONTRACTORS")).toBeInTheDocument());
    const contractorsHeading = screen.getByText("YOUR CONTRACTORS");
    const contractorsList = contractorsHeading.nextElementSibling as HTMLElement;
    expect(await within(contractorsList).findAllByText("Acme Co.")).toHaveLength(1);
  });
});

describe("MobileJobsPage — contractor details", () => {
  it("shows the profile's real verified-job count and the bid's timeline", async () => {
    mockGetAll.mockResolvedValue([makeJob()]);
    mockGetRequests.mockResolvedValue([makeRequest({ status: "quoted" })]);
    mockGetQuotesForRequest.mockResolvedValue([makeQuote()]);
    renderPage();

    expect(await screen.findByText("12 verified jobs · 7-day timeline")).toBeInTheDocument();
    const contractorsList = screen.getByText("YOUR CONTRACTORS").nextElementSibling as HTMLElement;
    expect(within(contractorsList).getByText("12 verified jobs")).toBeInTheDocument();
  });

  it("shows no job count when the bidder has no contractor profile", async () => {
    mockGetAll.mockResolvedValue([makeJob()]);
    mockGetRequests.mockResolvedValue([makeRequest({ status: "quoted" })]);
    mockGetQuotesForRequest.mockResolvedValue([makeQuote({ contractor: "unknown-principal" })]);
    renderPage();

    expect(await screen.findByText("7-day timeline")).toBeInTheDocument();
    expect(screen.queryByText(/verified job/)).not.toBeInTheDocument();
  });

  it("only shows a close date when the request has a bid window", async () => {
    mockGetAll.mockResolvedValue([makeJob()]);
    mockGetRequests.mockResolvedValue([makeRequest({ status: "quoted" })]);
    mockGetQuotesForRequest.mockResolvedValue([makeQuote()]);
    renderPage();

    await screen.findByText(/1 NEW BID/);
    expect(screen.queryByText(/CLOSES/)).not.toBeInTheDocument();
  });
});
