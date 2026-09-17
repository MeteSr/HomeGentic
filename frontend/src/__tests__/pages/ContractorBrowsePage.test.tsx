/**
 * ContractorBrowsePage — real logic worth locking down:
 *   - client-side filtering by zip and specialty (both together, and each alone)
 *   - result label pluralization and "filtered" vs "registry total" wording
 *   - awaiting-countersignature alert: only shows for a job that's
 *     homeownerSigned && !contractorSigned && has a contractorName
 *   - clear resets zip input, active zip, and active specialty
 *   - request-quote navigates with prefill state built from the contractor
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ContractorBrowsePage from "@/pages/ContractorBrowsePage";
import type { ContractorProfile } from "@/services/contractor";
import type { Job } from "@/services/job";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockSearch, mockGetAll } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockGetAll: vi.fn(),
}));

vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return { ...actual, contractorService: { search: mockSearch } };
});

vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getAll: mockGetAll } };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

function makeContractor(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
  return {
    id: "ctr-1", name: "Alice Anderson", specialties: ["HVAC"],
    email: "a@example.com", phone: "555-0100", bio: null, licenseNumber: null,
    serviceArea: null, serviceZips: ["78701"], trustScore: 80, jobsCompleted: 12,
    isVerified: true, createdAt: Date.now(),
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    contractorName: "Alice Anderson", amount: 10000, date: "2024-06-01",
    description: "", isDiy: false, status: "Completed" as any, verified: false,
    homeownerSigned: true, contractorSigned: false, photos: [], createdAt: Date.now(),
    ...overrides,
  } as Job;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ContractorBrowsePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
});

describe("ContractorBrowsePage — result summary", () => {
  it("shows the registry total when no filter is active", async () => {
    mockSearch.mockResolvedValue([makeContractor({ id: "c1" }), makeContractor({ id: "c2", name: "Bob Baker" })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2 contractors in the registry")).toBeInTheDocument());
  });

  it("uses singular wording for exactly one contractor", async () => {
    mockSearch.mockResolvedValue([makeContractor({ id: "c1" })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("1 contractor in the registry")).toBeInTheDocument());
  });
});

describe("ContractorBrowsePage — filtering", () => {
  it("filters by zip code on search", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", name: "Alice Anderson", serviceZips: ["78701"] }),
      makeContractor({ id: "c2", name: "Bob Baker", serviceZips: ["90210"] }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2 contractors in the registry")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("ZIP CODE"), { target: { value: "78701" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(screen.getByText("1 contractor found")).toBeInTheDocument());
    expect(screen.getByText("Alice Anderson")).toBeInTheDocument();
    expect(screen.queryByText("Bob Baker")).not.toBeInTheDocument();
  });

  it("filters by specialty", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", name: "Alice Anderson", specialties: ["HVAC"] }),
      makeContractor({ id: "c2", name: "Bob Baker", specialties: ["Plumbing"] }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2 contractors in the registry")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("SERVICE TYPE"), { target: { value: "Plumbing" } });

    await waitFor(() => expect(screen.getByText("1 contractor found")).toBeInTheDocument());
    expect(screen.getByText("Bob Baker")).toBeInTheDocument();
    expect(screen.queryByText("Alice Anderson")).not.toBeInTheDocument();
  });

  it("combines zip and specialty filters (AND, not OR)", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", name: "Alice Anderson", specialties: ["HVAC"], serviceZips: ["78701"] }),
      makeContractor({ id: "c2", name: "Bob Baker", specialties: ["HVAC"], serviceZips: ["90210"] }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2 contractors in the registry")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("SERVICE TYPE"), { target: { value: "HVAC" } });
    fireEvent.change(screen.getByLabelText("ZIP CODE"), { target: { value: "90210" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(screen.getByText("1 contractor found")).toBeInTheDocument());
    expect(screen.getByText("Bob Baker")).toBeInTheDocument();
  });

  it("clears zip, specialty, and search input via Clear", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", name: "Alice Anderson", serviceZips: ["78701"] }),
      makeContractor({ id: "c2", name: "Bob Baker", serviceZips: ["90210"] }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("2 contractors in the registry")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("ZIP CODE"), { target: { value: "78701" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => expect(screen.getByText("1 contractor found")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Clear"));

    await waitFor(() => expect(screen.getByText("2 contractors in the registry")).toBeInTheDocument());
    expect(screen.getByLabelText("ZIP CODE")).toHaveValue("");
  });

  it("shows the no-match empty state with a way back to the full list", async () => {
    mockSearch.mockResolvedValue([makeContractor({ id: "c1", serviceZips: ["78701"] })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("1 contractor in the registry")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("ZIP CODE"), { target: { value: "00000" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(screen.getByText("No contractors match your search")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Show all contractors"));
    await waitFor(() => expect(screen.getByText("1 contractor in the registry")).toBeInTheDocument());
  });
});

describe("ContractorBrowsePage — awaiting countersignature alert", () => {
  it("shows the alert only for a job that's homeowner-signed, not contractor-signed, and named", async () => {
    mockSearch.mockResolvedValue([makeContractor({ name: "Alice Anderson" })]);
    mockGetAll.mockResolvedValue([
      makeJob({ contractorName: "Alice Anderson", homeownerSigned: true, contractorSigned: false }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText(/has not countersigned the/)).toBeInTheDocument());
  });

  it("does not show the alert once the contractor has countersigned", async () => {
    mockSearch.mockResolvedValue([makeContractor({ name: "Alice Anderson" })]);
    mockGetAll.mockResolvedValue([
      makeJob({ contractorName: "Alice Anderson", homeownerSigned: true, contractorSigned: true }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("1 contractor in the registry")).toBeInTheDocument());
    expect(screen.queryByText(/has not countersigned the/)).not.toBeInTheDocument();
  });

  it("marks an awaiting contractor's card with an AWAITING badge", async () => {
    mockSearch.mockResolvedValue([makeContractor({ name: "Alice Anderson" })]);
    mockGetAll.mockResolvedValue([
      makeJob({ contractorName: "Alice Anderson", homeownerSigned: true, contractorSigned: false }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("AWAITING")).toBeInTheDocument());
  });
});

describe("ContractorBrowsePage — request quote", () => {
  it("navigates to /quotes/new with a prefill built from the contractor", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", name: "Alice Anderson", specialties: ["HVAC", "Roofing"], serviceZips: ["78701"] }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Request quote")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Request quote"));

    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new", {
      state: {
        prefill: {
          serviceType: "HVAC",
          contractorName: "Alice Anderson",
          zipCode: "78701",
        },
      },
    });
  });

  it("navigates to the contractor's profile on View profile", async () => {
    mockSearch.mockResolvedValue([makeContractor({ id: "c1", name: "Alice Anderson" })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("View profile")).toBeInTheDocument());

    fireEvent.click(screen.getByText("View profile"));

    expect(mockNavigate).toHaveBeenCalledWith("/contractor/c1");
  });
});

describe("ContractorBrowsePage — empty registry", () => {
  it("shows the no-contractors-yet state with a link back to the dashboard", async () => {
    mockSearch.mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getByText("No contractors yet")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Back to dashboard"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});
