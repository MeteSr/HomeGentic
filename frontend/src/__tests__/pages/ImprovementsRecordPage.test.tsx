/**
 * ImprovementsRecordPage (#713): the owner marks each job as an improvement
 * or a repair, sees the running total, and exports the list for their tax
 * preparer as CSV or a printed / saved PDF.
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Job } from "@/services/job";

const { mockUseParams } = vi.hoisted(() => ({ mockUseParams: vi.fn(() => ({ id: "prop-1" })) }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: mockUseParams };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: vi.fn() } }));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: any) => sel({ principal: "owner-principal" }),
}));

const { svc } = vi.hoisted(() => ({
  svc: {
    getByProperty: vi.fn(),
    getCostCategories: vi.fn(),
    setCostCategory: vi.fn(),
    getProperty: vi.fn(),
    getAccessRole: vi.fn(),
    getByJob: vi.fn(),
  },
}));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return {
    ...actual,
    jobService: {
      getByProperty: svc.getByProperty,
      getCostCategories: svc.getCostCategories,
      setCostCategory: svc.setCostCategory,
    },
  };
});
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getProperty: svc.getProperty, getAccessRole: svc.getAccessRole } };
});
vi.mock("@/services/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/photo")>();
  return { ...actual, photoService: { getByJob: svc.getByJob } };
});

import ImprovementsRecordPage from "@/pages/ImprovementsRecordPage";

function job(overrides: Partial<Job>): Job {
  return {
    id: "j",
    propertyId: "prop-1",
    homeowner: "owner-principal",
    serviceType: "Roofing",
    contractorName: "Acme Roofing",
    amount: 1_500_000,
    date: "2024-03-10",
    description: "New roof",
    isDiy: false,
    status: "verified",
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    photos: [],
    createdAt: 0,
    ...overrides,
  };
}

const JOBS: Job[] = [
  job({ id: "roof" }),
  job({
    id: "leak",
    serviceType: "Plumbing",
    amount: 40_000,
    date: "2023-06-01",
    description: "Fixed leak",
    contractorName: "Pipes Co",
  }),
  job({
    id: "deck",
    serviceType: "Other",
    amount: 300_000,
    date: "2022-09-15",
    description: "Back deck",
    isDiy: true,
    contractorName: undefined,
    verified: false,
    status: "completed",
  }),
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ImprovementsRecordPage />
    </MemoryRouter>,
  );
}

const rowFor = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  svc.getByProperty.mockResolvedValue(JOBS);
  svc.getCostCategories.mockResolvedValue({ deck: "improvement" });
  svc.setCostCategory.mockResolvedValue(undefined);
  svc.getProperty.mockResolvedValue({
    id: "prop-1",
    address: "9 Basis Lane",
    city: "Orlando",
    state: "FL",
    zipCode: "32801",
  });
  svc.getAccessRole.mockResolvedValue("Owner");
  svc.getByJob.mockImplementation(async (jobId: string) =>
    jobId === "docs_prop-1"
      ? [
          { id: "d1", description: "[Receipt] roof-invoice.pdf", createdAt: 2 },
          { id: "d2", description: "[Deed] deed.pdf", createdAt: 1 },
        ]
      : [],
  );
});

describe("ImprovementsRecordPage", () => {
  it("lists every job with the owner's mark or a suggestion, and totals the improvements", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /improvements record/i })).toBeInTheDocument();
    expect(await screen.findByText("New roof")).toBeInTheDocument();

    expect(within(rowFor("Back deck")).getByRole("combobox")).toHaveValue("improvement");
    expect(within(rowFor("Back deck")).queryByText(/suggested/i)).toBeNull();
    expect(within(rowFor("New roof")).getByRole("combobox")).toHaveValue("improvement");
    expect(within(rowFor("New roof")).getByText(/suggested/i)).toBeInTheDocument();
    expect(within(rowFor("Fixed leak")).getByRole("combobox")).toHaveValue("repair");

    expect(screen.getByTestId("improvement-total")).toHaveTextContent("$18,000");
    expect(screen.getByTestId("improvement-total")).toHaveTextContent("2 jobs");
  });

  it("says it is a record for a tax preparer, not tax advice", async () => {
    renderPage();
    await screen.findByText("New roof");
    expect(screen.getAllByText(/not tax advice/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/tax preparer/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/deduct|tax credit|25C|25D/i);
  });

  it("saves a changed mark and updates the total", async () => {
    renderPage();
    await screen.findByText("New roof");
    fireEvent.change(within(rowFor("New roof")).getByRole("combobox"), { target: { value: "repair" } });
    await waitFor(() => expect(svc.setCostCategory).toHaveBeenCalledWith("roof", "repair"));
    expect(screen.getByTestId("improvement-total")).toHaveTextContent("$3,000");
    expect(within(rowFor("New roof")).queryByText(/suggested/i)).toBeNull();
  });

  it("puts the mark back and explains when saving fails", async () => {
    svc.setCostCategory.mockRejectedValueOnce(
      Object.assign(new Error("You don't have permission to do that."), { code: "NotAuthorized" }),
    );
    renderPage();
    await screen.findByText("New roof");
    fireEvent.change(within(rowFor("New roof")).getByRole("combobox"), { target: { value: "repair" } });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(within(rowFor("New roof")).getByRole("combobox")).toHaveValue("improvement");
    expect(screen.getByTestId("improvement-total")).toHaveTextContent("$18,000");
  });

  it("lets a viewer read but not change the marks", async () => {
    svc.getAccessRole.mockResolvedValue("Viewer");
    renderPage();
    await screen.findByText("New roof");
    await waitFor(() => expect(within(rowFor("New roof")).getByRole("combobox")).toBeDisabled());
  });

  it("keeps only work from the chosen date onward", async () => {
    renderPage();
    await screen.findByText("New roof");
    fireEvent.change(screen.getByLabelText(/include work from/i), { target: { value: "2023-01-01" } });
    expect(screen.queryByText("Back deck")).toBeNull();
    expect(screen.getByTestId("improvement-total")).toHaveTextContent("$15,000");
  });

  it("downloads the list as a CSV file", async () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage();
    await screen.findByText("New roof");
    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe("text/csv");
    expect(await blob.text()).toContain("2024-03-10,New roof,Roofing,Acme Roofing,15000.00,Improvement,Suggested");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("opens the print dialog for a PDF copy", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage();
    await screen.findByText("New roof");
    fireEvent.click(screen.getByRole("button", { name: /print or save as pdf/i }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it("lists the receipts and invoices kept in the home's documents", async () => {
    renderPage();
    expect(await screen.findByText("roof-invoice.pdf")).toBeInTheDocument();
    expect(screen.queryByText("deed.pdf")).toBeNull();
  });

  it("shows an empty state when there are no jobs", async () => {
    svc.getByProperty.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no jobs on record yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download csv/i })).toBeDisabled();
  });
});
