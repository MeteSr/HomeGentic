import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Photo } from "@/services/photo";

const { mockPhoto, mockGetAccessRole } = vi.hoisted(() => ({
  mockPhoto: { getByJob: vi.fn(), upload: vi.fn(), deletePhoto: vi.fn() },
  mockGetAccessRole: vi.fn(),
}));

vi.mock("@/services/photo", () => ({ photoService: mockPhoto }));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: mockGetAccessRole } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { DocumentsTab } from "@/pages/PropertyDetail/DocumentsTab";

function doc(id: string, description: string, createdAt = 1): Photo {
  return {
    id,
    jobId: "docs_p1",
    propertyId: "p1",
    phase: "PostConstruction",
    description,
    hash: "a".repeat(64),
    url: "",
    size: 2048,
    verified: false,
    createdAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAccessRole.mockResolvedValue("Owner");
  mockPhoto.getByJob.mockImplementation(async (jobId: string) =>
    jobId === "docs_p1" ? [doc("D1", "[Deed] deed-2019.pdf", 3), doc("D2", "[Receipt] roof.pdf", 2)] : [],
  );
});
afterEach(() => vi.restoreAllMocks());

describe("DocumentsTab — home document vault", () => {
  it("offers home papers as document types", async () => {
    render(<DocumentsTab propertyId="p1" />);
    const picker = await screen.findByLabelText("Document type");
    const options = within(picker)
      .getAllByRole("option")
      .map((o) => o.textContent);
    for (const label of [
      "Deed",
      "Closing papers",
      "Title policy",
      "Survey",
      "Insurance policy",
      "Elevation certificate",
      "HOA documents",
      "Manual",
      "Receipt",
      "Other",
    ]) {
      expect(options).toContain(label);
    }
  });

  it("uploads with the chosen type", async () => {
    mockPhoto.upload.mockResolvedValue(doc("D3", "[Closing] cd.pdf", 4));
    const { container } = render(<DocumentsTab propertyId="p1" />);
    fireEvent.change(await screen.findByLabelText("Document type"), { target: { value: "Closing" } });
    const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "cd.pdf", { type: "application/pdf" })] } });
    await waitFor(() =>
      expect(mockPhoto.upload).toHaveBeenCalledWith(
        expect.any(File),
        "docs_p1",
        "p1",
        "PostConstruction",
        "[Closing] cd.pdf",
      ),
    );
  });

  it("lists documents under their group", async () => {
    render(<DocumentsTab propertyId="p1" />);
    expect(await screen.findByText("deed-2019.pdf")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ownership and closing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Work records" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Insurance and risk" })).not.toBeInTheDocument();
  });

  it("says who can see the files, including a buyer at handoff", async () => {
    render(<DocumentsTab propertyId="p1" />);
    const note = (await screen.findByText(/who can see these files/i)).closest("p")!;
    expect(note.textContent).toMatch(/People/);
    expect(note.textContent).toMatch(/buyer/i);
  });

  it("doesn't claim files are stored on-chain", async () => {
    mockPhoto.getByJob.mockResolvedValue([]);
    render(<DocumentsTab propertyId="p1" />);
    await screen.findByText("No documents yet");
    expect(document.body.textContent).not.toMatch(/on-chain/i);
  });

  it("removes a document after the owner confirms", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockPhoto.deletePhoto.mockResolvedValue(undefined);
    render(<DocumentsTab propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove deed-2019.pdf" }));
    await waitFor(() => expect(mockPhoto.deletePhoto).toHaveBeenCalledWith("D1"));
    await waitFor(() => expect(screen.queryByText("deed-2019.pdf")).not.toBeInTheDocument());
  });

  it("keeps the document when the owner cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DocumentsTab propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove deed-2019.pdf" }));
    expect(mockPhoto.deletePhoto).not.toHaveBeenCalled();
    expect(screen.getByText("deed-2019.pdf")).toBeInTheDocument();
  });

  it("a viewer can open files but not upload or remove them", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    render(<DocumentsTab propertyId="p1" />);
    expect(await screen.findByText("deed-2019.pdf")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText("Document type")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
