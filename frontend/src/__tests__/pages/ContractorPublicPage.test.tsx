/**
 * ContractorPublicPage — real logic worth locking down:
 *   - not-found state when the contractor doesn't exist
 *   - review submission validation order: rating -> comment -> job id
 *   - rate-limit errors get a friendlier message than other failures
 *   - success hides the form and shows the "submitted" state
 *   - credentials are sorted newest-verified-first with an on-chain count
 *   - reviews are sorted newest-first with correct pluralization
 *   - request-quote navigates with a prefill built from the contractor
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ContractorPublicPage from "@/pages/ContractorPublicPage";
import type { ContractorProfile, JobCredential } from "@/services/contractor";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "ctr-1" }), useNavigate: () => mockNavigate };
});

const { mockGetContractor, mockGetCredentials, mockGetReviews, mockSubmitReview } = vi.hoisted(() => ({
  mockGetContractor:  vi.fn(),
  mockGetCredentials: vi.fn(),
  mockGetReviews:     vi.fn(),
  mockSubmitReview:   vi.fn(),
}));

vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return {
    ...actual,
    contractorService: {
      getContractor: mockGetContractor,
      getCredentials: mockGetCredentials,
      getReviewsForContractor: mockGetReviews,
      submitReview: mockSubmitReview,
    },
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError:   vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: mockToastError, success: mockToastSuccess },
}));

function makeContractor(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
  return {
    id: "ctr-1", name: "Alice Anderson", specialties: ["HVAC"],
    email: "alice@example.com", phone: "512-555-0100", bio: null, licenseNumber: null,
    serviceArea: null, serviceZips: [], trustScore: 80, jobsCompleted: 3,
    isVerified: false, createdAt: Date.now(), origin: { type: "SelfRegistered" },
    ...overrides,
  };
}

function makeCredential(overrides: Partial<JobCredential> = {}): JobCredential {
  return {
    id: 1, jobId: "job-1", contractorId: "ctr-1", serviceType: "HVAC",
    verifiedAt: Date.now(), homeownerPrincipal: "p-owner",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ContractorPublicPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCredentials.mockResolvedValue([]);
  mockGetReviews.mockResolvedValue([]);
});

describe("ContractorPublicPage — not found", () => {
  it("shows a not-found state when the contractor doesn't exist", async () => {
    mockGetContractor.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText("Contractor not found")).toBeInTheDocument());
  });
});

describe("ContractorPublicPage — review validation", () => {
  beforeEach(() => mockGetContractor.mockResolvedValue(makeContractor()));

  it("requires a star rating before anything else", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit Review")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Submit Review"));
    expect(mockToastError).toHaveBeenLastCalledWith("Please select a star rating");
    expect(mockSubmitReview).not.toHaveBeenCalled();
  });

  it("requires a comment once a rating is set", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit Review")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Rate 4 stars"));
    fireEvent.click(screen.getByText("Submit Review"));
    expect(mockToastError).toHaveBeenLastCalledWith("Please write a short comment");
  });

  it("requires a job id once rating and comment are set", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit Review")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Rate 4 stars"));
    fireEvent.change(screen.getByPlaceholderText("Describe the quality of work, communication, and punctuality..."), { target: { value: "Great work" } });
    fireEvent.click(screen.getByText("Submit Review"));
    expect(mockToastError).toHaveBeenLastCalledWith("Please enter the job ID from your records");
  });

  it("submits successfully and shows the thank-you state", async () => {
    mockSubmitReview.mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit Review")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Rate 5 stars"));
    fireEvent.change(screen.getByPlaceholderText("Describe the quality of work, communication, and punctuality..."), { target: { value: "Great work" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. JOB_1"), { target: { value: "JOB_1" } });
    fireEvent.click(screen.getByText("Submit Review"));

    await waitFor(() => expect(mockSubmitReview).toHaveBeenCalledWith("ctr-1", 5, "Great work", "JOB_1"));
    await waitFor(() => expect(screen.getByText("✓ Review submitted")).toBeInTheDocument());
    expect(mockToastSuccess).toHaveBeenCalledWith("Review submitted — thank you!");
  });

  it("shows a friendlier message for rate-limit errors", async () => {
    mockSubmitReview.mockRejectedValue(new Error("RateLimit exceeded"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit Review")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Rate 5 stars"));
    fireEvent.change(screen.getByPlaceholderText("Describe the quality of work, communication, and punctuality..."), { target: { value: "Great work" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. JOB_1"), { target: { value: "JOB_1" } });
    fireEvent.click(screen.getByText("Submit Review"));

    await waitFor(() => expect(mockToastError).toHaveBeenLastCalledWith("You've already reviewed this contractor today. Try again tomorrow."));
    expect(screen.queryByText("✓ Review submitted")).not.toBeInTheDocument();
  });

  it("shows the raw error message for non-rate-limit failures", async () => {
    mockSubmitReview.mockRejectedValue(new Error("Job not found in your records"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit Review")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Rate 5 stars"));
    fireEvent.change(screen.getByPlaceholderText("Describe the quality of work, communication, and punctuality..."), { target: { value: "Great work" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. JOB_1"), { target: { value: "bad-job" } });
    fireEvent.click(screen.getByText("Submit Review"));

    await waitFor(() => expect(mockToastError).toHaveBeenLastCalledWith("Job not found in your records"));
  });
});

describe("ContractorPublicPage — credentials", () => {
  beforeEach(() => mockGetContractor.mockResolvedValue(makeContractor()));

  it("shows the empty state when there are no verified credentials", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/No verified jobs yet/)).toBeInTheDocument());
  });

  it("sorts credentials newest-verified-first and shows the on-chain count", async () => {
    mockGetCredentials.mockResolvedValue([
      makeCredential({ id: 1, serviceType: "Older Job", verifiedAt: 1000 }),
      makeCredential({ id: 2, serviceType: "Newer Job", verifiedAt: 2000 }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("2 on-chain")).toBeInTheDocument());
    const items = screen.getAllByText(/Older Job|Newer Job/).map((el) => el.textContent);
    expect(items[0]).toBe("Newer Job");
    expect(items[1]).toBe("Older Job");
  });
});

describe("ContractorPublicPage — reviews", () => {
  beforeEach(() => mockGetContractor.mockResolvedValue(makeContractor()));

  it("shows the empty state when there are no reviews", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/No reviews yet/)).toBeInTheDocument());
  });

  it("sorts reviews newest-first and pluralizes the count", async () => {
    mockGetReviews.mockResolvedValue([
      { id: "r1", rating: 4, comment: "Old review", jobId: "job-1", createdAt: 1000 },
      { id: "r2", rating: 5, comment: "New review", jobId: "job-2", createdAt: 2000 },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("2 reviews")).toBeInTheDocument());
    const comments = screen.getAllByText(/Old review|New review/).map((el) => el.textContent);
    expect(comments[0]).toBe("New review");
    expect(comments[1]).toBe("Old review");
  });

  it("uses singular wording for exactly one review", async () => {
    mockGetReviews.mockResolvedValue([
      { id: "r1", rating: 4, comment: "Solo review", jobId: "job-1", createdAt: 1000 },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("1 review")).toBeInTheDocument());
  });
});

describe("ContractorPublicPage — request quote", () => {
  it("navigates to /quotes/new with a prefill built from the contractor", async () => {
    mockGetContractor.mockResolvedValue(makeContractor({ name: "Alice Anderson", specialties: ["HVAC", "Roofing"] }));
    renderPage();
    await waitFor(() => expect(screen.getByText("Request Quote")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Request Quote"));

    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new", {
      state: { prefill: { serviceType: "HVAC", contractorName: "Alice Anderson" } },
    });
  });
});
