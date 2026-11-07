import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InsuranceClaim } from "@/services/insuranceClaims";

const { mockClaims, mockPhoto, mockNavigate, mockToast } = vi.hoisted(() => ({
  mockClaims: { list: vi.fn(), create: vi.fn(), update: vi.fn(), addLog: vi.fn(), remove: vi.fn() },
  mockPhoto: { getByJob: vi.fn(), upload: vi.fn() },
  mockNavigate: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/insuranceClaims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/insuranceClaims")>()),
  insuranceClaimService: mockClaims,
}));
vi.mock("@/services/photo", () => ({ photoService: mockPhoto }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { ClaimKit } from "@/pages/PropertyDetail/ClaimKit";

const CLAIM: InsuranceClaim = {
  id: "c1",
  propertyId: "p1",
  title: "Kitchen ceiling leak",
  dateOfLoss: "2026-09-28",
  cause: "Water leak",
  description: "Water through the ceiling",
  claimNumber: "CLM-778",
  adjusterName: "Dana Ruiz",
  adjusterContact: "dana@example.com",
  status: "open",
  log: [{ date: "2026-09-29", note: "Reported by phone", addedAt: 1 }],
  createdAt: 1,
  updatedAt: 1,
};

const PHOTO = {
  id: "ph1",
  jobId: "claim_c1",
  propertyId: "p1",
  phase: "PreConstruction",
  description: "Damage photo: ceiling.jpg",
  hash: "a".repeat(64),
  url: "blob:x",
  size: 100,
  verified: false,
  createdAt: Date.UTC(2026, 8, 29, 15, 4),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 2, 15)));
  mockClaims.list.mockResolvedValue([]);
  mockPhoto.getByJob.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("ClaimKit", () => {
  it("says what it is and that nothing is filed with the insurer", async () => {
    render(<ClaimKit propertyId="p1" canEdit />);
    expect(await screen.findByText(/no claim records yet/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't file or follow up on claims/i)).toBeInTheDocument();
  });

  it("starts a claim record from the form", async () => {
    mockClaims.create.mockResolvedValue(CLAIM);
    render(<ClaimKit propertyId="p1" canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a claim record" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Kitchen ceiling leak" } });
    fireEvent.change(screen.getByLabelText("Date of loss"), { target: { value: "2026-09-28" } });
    fireEvent.change(screen.getByLabelText("Cause"), { target: { value: "Water leak" } });
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "Water through the ceiling" } });
    fireEvent.change(screen.getByLabelText("Claim number"), { target: { value: "CLM-778" } });
    fireEvent.change(screen.getByLabelText("Adjuster"), { target: { value: "Dana Ruiz" } });
    fireEvent.change(screen.getByLabelText("Adjuster phone or email"), { target: { value: "dana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save claim" }));
    await waitFor(() =>
      expect(mockClaims.create).toHaveBeenCalledWith("p1", {
        title: "Kitchen ceiling leak",
        dateOfLoss: "2026-09-28",
        cause: "Water leak",
        description: "Water through the ceiling",
        claimNumber: "CLM-778",
        adjusterName: "Dana Ruiz",
        adjusterContact: "dana@example.com",
        status: "open",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Kitchen ceiling leak" })).toBeInTheDocument();
  });

  it("explains a problem with the form instead of saving", async () => {
    render(<ClaimKit propertyId="p1" canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a claim record" }));
    fireEvent.click(screen.getByRole("button", { name: "Save claim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/title/i);
    expect(mockClaims.create).not.toHaveBeenCalled();
  });

  it("shows a claim with its log and dated damage photos", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    mockPhoto.getByJob.mockResolvedValue([PHOTO]);
    render(<ClaimKit propertyId="p1" canEdit />);
    const card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    expect(within(card).getByText(/Loss on Sep 28, 2026/)).toBeInTheDocument();
    expect(within(card).getByText("CLM-778")).toBeInTheDocument();
    expect(within(card).getByText(/Dana Ruiz/)).toBeInTheDocument();
    expect(within(card).getByText("Reported by phone")).toBeInTheDocument();
    expect(await within(card).findByText(/Uploaded Sep 29, 2026/)).toBeInTheDocument();
    expect(mockPhoto.getByJob).toHaveBeenCalledWith("claim_c1");
  });

  it("adds a dated line to the claim log", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    mockClaims.addLog.mockResolvedValue({
      ...CLAIM,
      log: [...CLAIM.log, { date: "2026-10-02", note: "Adjuster visited", addedAt: 2 }],
    });
    render(<ClaimKit propertyId="p1" canEdit />);
    const card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    expect(within(card).getByLabelText("Log date")).toHaveValue("2026-10-02");
    fireEvent.change(within(card).getByLabelText("What happened on this date"), {
      target: { value: "Adjuster visited" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Add to log" }));
    await waitFor(() => expect(mockClaims.addLog).toHaveBeenCalledWith("c1", "2026-10-02", "Adjuster visited"));
    expect(await within(card).findByText("Adjuster visited")).toBeInTheDocument();
  });

  it("uploads damage photos under the claim", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    mockPhoto.upload.mockResolvedValue(PHOTO);
    render(<ClaimKit propertyId="p1" canEdit />);
    const card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    const file = new File(["x"], "ceiling.jpg", { type: "image/jpeg" });
    fireEvent.change(within(card).getByLabelText("Add damage photos"), { target: { files: [file] } });
    await waitFor(() =>
      expect(mockPhoto.upload).toHaveBeenCalledWith(
        file,
        "claim_c1",
        "p1",
        "PreConstruction",
        "Insurance claim photo: Kitchen ceiling leak (ceiling.jpg)",
      ),
    );
    expect(await within(card).findByText(/Uploaded Sep 29, 2026/)).toBeInTheDocument();
  });

  it("shows why a photo upload failed", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    mockPhoto.upload.mockRejectedValue(new Error("boom"));
    render(<ClaimKit propertyId="p1" canEdit />);
    const card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    fireEvent.change(within(card).getByLabelText("Add damage photos"), {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it("opens the quote form pre-filled for the repair", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    render(<ClaimKit propertyId="p1" canEdit />);
    const card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    fireEvent.click(within(card).getByRole("button", { name: "Get repair quotes" }));
    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new", {
      state: {
        prefill: {
          propertyId: "p1",
          serviceType: "Plumbing",
          description:
            "Repair needed after: Kitchen ceiling leak (loss on Sep 28, 2026). Water through the ceiling. Insurance claim CLM-778.",
        },
      },
    });
  });

  it("edits, closes and deletes a claim", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    mockClaims.update.mockImplementation(async (_id: string, input: any) => ({ ...CLAIM, ...input }));
    mockClaims.remove.mockResolvedValue(undefined);
    render(<ClaimKit propertyId="p1" canEdit />);
    let card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });

    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Kitchen ceiling leak");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ceiling leak" } });
    fireEvent.click(screen.getByRole("button", { name: "Save claim" }));
    await waitFor(() =>
      expect(mockClaims.update).toHaveBeenCalledWith("c1", expect.objectContaining({ title: "Ceiling leak" })),
    );

    card = await screen.findByRole("article", { name: "Ceiling leak" });
    fireEvent.click(within(card).getByRole("button", { name: "Mark closed" }));
    await waitFor(() =>
      expect(mockClaims.update).toHaveBeenLastCalledWith("c1", expect.objectContaining({ status: "closed" })),
    );
    expect(await within(card).findByRole("button", { name: "Reopen" })).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(card).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(mockClaims.remove).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText(/no claim records yet/i)).toBeInTheDocument();
  });

  it("keeps photos from deleted or earlier claims, labelled as claim photos", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    const old = {
      ...PHOTO,
      id: "ph9",
      jobId: "claim_gone",
      description: "Insurance claim photo: Hail 2024 (roof.jpg)",
    };
    const job = { ...PHOTO, id: "ph8", jobId: "JOB_1", description: "Job photo" };
    render(<ClaimKit propertyId="p1" canEdit propertyPhotos={[PHOTO, old, job]} />);
    const section = await screen.findByRole("region", { name: "Photos from earlier claims" });
    expect(within(section).getByText("Insurance claim photo: Hail 2024 (roof.jpg)")).toBeInTheDocument();
    expect(within(section).getAllByRole("img")).toHaveLength(1);
    expect(within(section).queryByText("Job photo")).not.toBeInTheDocument();
  });

  it("has no earlier-claims section when every claim photo belongs to a current claim", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    render(<ClaimKit propertyId="p1" canEdit propertyPhotos={[PHOTO]} />);
    await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    expect(screen.queryByRole("region", { name: "Photos from earlier claims" })).not.toBeInTheDocument();
  });

  it("is read-only for a viewer", async () => {
    mockClaims.list.mockResolvedValue([CLAIM]);
    render(<ClaimKit propertyId="p1" canEdit={false} />);
    const card = await screen.findByRole("article", { name: "Kitchen ceiling leak" });
    expect(screen.queryByRole("button", { name: "Start a claim record" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(card).queryByLabelText("Add damage photos")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Add to log" })).not.toBeInTheDocument();
  });

  it("offers a retry when claims can't be loaded", async () => {
    mockClaims.list.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([CLAIM]);
    render(<ClaimKit propertyId="p1" canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("article", { name: "Kitchen ceiling leak" })).toBeInTheDocument();
  });
});
