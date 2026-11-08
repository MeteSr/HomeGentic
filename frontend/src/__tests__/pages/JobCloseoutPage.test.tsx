/**
 * JobCloseoutPage (#716): per job, the household records the permit status
 * and files the close-out papers (a final lien waiver, a Florida Notice of
 * Commencement) from the home's document vault. Copy never says the home is
 * lien-free or a permit is closed unless the record shows it.
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
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div data-testid="layout">{children}</div> }));
const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: vi.fn() } }));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: any) => sel({ principal: "owner-principal" }) }));

const { svc } = vi.hoisted(() => ({
  svc: {
    getByProperty: vi.fn(),
    getCloseouts: vi.fn(),
    setPermitStatus: vi.fn(),
    addPaper: vi.fn(),
    removePaper: vi.fn(),
    getProperty: vi.fn(),
    getAccessRole: vi.fn(),
    getByJob: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return {
    ...actual,
    jobService: {
      getByProperty: svc.getByProperty,
      getCloseouts: svc.getCloseouts,
      setPermitStatus: svc.setPermitStatus,
      addPaper: svc.addPaper,
      removePaper: svc.removePaper,
    },
  };
});
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getProperty: svc.getProperty, getAccessRole: svc.getAccessRole } };
});
vi.mock("@/services/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/photo")>();
  return { ...actual, photoService: { getByJob: svc.getByJob, upload: svc.upload } };
});

import JobCloseoutPage from "@/pages/JobCloseoutPage";

function job(overrides: Partial<Job>): Job {
  return {
    id: "j",
    propertyId: "prop-1",
    homeowner: "owner-principal",
    serviceType: "Roofing",
    contractorName: "Acme Roofing",
    amount: 1_800_000,
    date: "2026-03-10",
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
const roof = job({ id: "roof", permitNumber: "BLD-2026-1" });
const fence = job({
  id: "fence",
  serviceType: "Fencing",
  description: "Fence",
  amount: 400_000,
  contractorName: "Fence Co",
});
const paint = job({
  id: "paint",
  serviceType: "Painting",
  description: "Touch-up",
  amount: 50_000,
  isDiy: true,
  contractorName: undefined,
});
const proposal = job({ id: "prop", description: "Gutters", status: "pending_homeowner_approval" });

const vaultDoc = (id: string, description: string) => ({
  id,
  description,
  jobId: "docs_prop-1",
  propertyId: "prop-1",
  phase: "PostConstruction",
  hash: "",
  url: "",
  size: 1,
  verified: false,
  createdAt: 0,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <JobCloseoutPage />
    </MemoryRouter>,
  );
}
const row = async (text: string) => (await screen.findByText(text)).closest("tr") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  svc.getByProperty.mockResolvedValue([roof, fence, paint, proposal]);
  svc.getCloseouts.mockResolvedValue([
    {
      jobId: "roof",
      permitStatus: "open",
      papers: [{ kind: "lienWaiver", photoId: "PHOTO_W", addedBy: "pro", addedAt: 1 }],
    },
  ]);
  svc.getProperty.mockResolvedValue({
    id: "prop-1",
    address: "12 Release Rd",
    city: "Orlando",
    state: "FL",
    zipCode: "32801",
  });
  svc.getAccessRole.mockResolvedValue("Owner");
  svc.getByJob.mockResolvedValue([vaultDoc("PHOTO_W", "[LienWaiver] roof|roof-waiver.pdf")]);
  svc.setPermitStatus.mockResolvedValue(undefined);
  svc.addPaper.mockResolvedValue(undefined);
  svc.removePaper.mockResolvedValue(undefined);
  svc.upload.mockResolvedValue(vaultDoc("PHOTO_N", "[NOC] fence|noc.pdf"));
});

describe("JobCloseoutPage", () => {
  it("lists the home's jobs, leaving out proposals", async () => {
    renderPage();
    expect(await screen.findByText("New roof")).toBeInTheDocument();
    expect(screen.getByText("Fence")).toBeInTheDocument();
    expect(screen.getByText("Touch-up")).toBeInTheDocument();
    expect(screen.queryByText("Gutters")).not.toBeInTheDocument();
  });

  it("says it is the household's own record, not a permit or title check", async () => {
    renderPage();
    await screen.findByText("New roof");
    expect(screen.getByText(/title search/i)).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/lien[- ]free/i);
  });

  it("counts open permits and larger contractor jobs with no waiver on file", async () => {
    renderPage();
    await screen.findByText("New roof");
    expect(screen.getByTestId("open-permits")).toHaveTextContent("1");
    expect(screen.getByTestId("missing-waivers")).toHaveTextContent("1");
  });

  it("records a permit status", async () => {
    renderPage();
    const r = await row("New roof");
    fireEvent.change(within(r).getByLabelText(/permit status for new roof/i), { target: { value: "closed" } });
    await waitFor(() => expect(svc.setPermitStatus).toHaveBeenCalledWith("roof", "closed"));
    fireEvent.change(within(r).getByLabelText(/permit status for new roof/i), { target: { value: "" } });
    await waitFor(() => expect(svc.setPermitStatus).toHaveBeenLastCalledWith("roof", null));
  });

  it("puts the status back and says so when saving fails", async () => {
    svc.setPermitStatus.mockRejectedValue(new Error("boom"));
    renderPage();
    const r = await row("New roof");
    const select = within(r).getByLabelText(/permit status for new roof/i);
    fireEvent.change(select, { target: { value: "expired" } });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(select).toHaveValue("open");
  });

  it("shows the waiver on file by file name and flags a larger job with none", async () => {
    renderPage();
    expect(within(await row("New roof")).getByText("roof-waiver.pdf")).toBeInTheDocument();
    expect(within(await row("Fence")).getByText(/no final lien waiver on file/i)).toBeInTheDocument();
    expect(within(await row("Touch-up")).queryByText(/lien waiver on file/i)).not.toBeInTheDocument();
  });

  it("notes when Florida generally expects a Notice of Commencement", async () => {
    renderPage();
    expect(within(await row("New roof")).getByText(/notice of commencement generally expected/i)).toBeInTheDocument();
    expect(within(await row("Touch-up")).queryByText(/generally expected/i)).not.toBeInTheDocument();
  });

  it("uploads a Notice of Commencement into the vault and files it on the job", async () => {
    renderPage();
    const r = await row("Fence");
    const file = new File([new Uint8Array(3)], "noc.pdf", { type: "application/pdf" });
    fireEvent.change(within(r).getByLabelText(/add notice of commencement for fence/i), { target: { files: [file] } });
    await waitFor(() => expect(svc.addPaper).toHaveBeenCalledWith("fence", "noticeOfCommencement", "PHOTO_N"));
    expect(svc.upload).toHaveBeenCalledWith(file, "docs_prop-1", "prop-1", "PostConstruction", "[NOC] fence|noc.pdf");
    expect(await within(r).findByText("noc.pdf")).toBeInTheDocument();
  });

  it("uploads a final lien waiver for a contractor job, not for DIY work", async () => {
    svc.upload.mockResolvedValue(vaultDoc("PHOTO_F", "[LienWaiver] fence|waiver.pdf"));
    renderPage();
    const r = await row("Fence");
    const file = new File([new Uint8Array(3)], "waiver.pdf", { type: "application/pdf" });
    fireEvent.change(within(r).getByLabelText(/add final lien waiver for fence/i), { target: { files: [file] } });
    await waitFor(() => expect(svc.addPaper).toHaveBeenCalledWith("fence", "lienWaiver", "PHOTO_F"));
    expect(within(await row("Touch-up")).queryByLabelText(/add final lien waiver/i)).not.toBeInTheDocument();
  });

  it("takes a paper off the job", async () => {
    renderPage();
    const r = await row("New roof");
    fireEvent.click(within(r).getByRole("button", { name: /remove roof-waiver.pdf/i }));
    await waitFor(() => expect(svc.removePaper).toHaveBeenCalledWith("roof", "PHOTO_W"));
    await waitFor(() => expect(within(r).queryByText("roof-waiver.pdf")).not.toBeInTheDocument());
  });

  it("is read-only for a viewer", async () => {
    svc.getAccessRole.mockResolvedValue("Viewer");
    renderPage();
    const r = await row("New roof");
    await waitFor(() => expect(within(r).getByLabelText(/permit status for new roof/i)).toBeDisabled());
    expect(within(r).queryByLabelText(/add notice of commencement/i)).not.toBeInTheDocument();
    expect(within(r).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("shows an empty state with no jobs", async () => {
    svc.getByProperty.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no jobs on record yet/i)).toBeInTheDocument();
  });
});
