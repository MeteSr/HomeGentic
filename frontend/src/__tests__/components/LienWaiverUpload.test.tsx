/**
 * #716 LienWaiverUpload: the contractor who signed a job attaches its final
 * lien waiver from the sign-off page. The file goes into the home's document
 * vault (photoService.uploadWaiver) and is then filed on the job
 * (jobService.addPaper). Copy never says the home is lien-free.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LienWaiverUpload } from "@/components/LienWaiverUpload";
import { canisterError } from "@/services/candid";

const { mockUploadWaiver, mockAddPaper } = vi.hoisted(() => ({
  mockUploadWaiver: vi.fn(),
  mockAddPaper: vi.fn(),
}));
vi.mock("@/services/photo", () => ({ photoService: { uploadWaiver: mockUploadWaiver } }));
vi.mock("@/services/job", () => ({ jobService: { addPaper: mockAddPaper } }));

const pdf = (size = 4, name = "final-waiver.pdf") =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

function choose(file: File) {
  fireEvent.change(screen.getByLabelText(/attach final lien waiver/i), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadWaiver.mockResolvedValue("PHOTO_W");
  mockAddPaper.mockResolvedValue(undefined);
});

describe("LienWaiverUpload", () => {
  it("explains what happens to the file without claiming the home is lien-free", () => {
    render(<LienWaiverUpload jobId="job-1" />);
    expect(screen.getByText(/paid in full/i)).toBeInTheDocument();
    expect(screen.getByText(/homeowner's document vault/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/lien[- ]free/i);
  });

  it("uploads the file, files it on the job and says so", async () => {
    render(<LienWaiverUpload jobId="job-1" />);
    choose(pdf());
    expect(await screen.findByText(/waiver filed/i)).toBeInTheDocument();
    expect(mockUploadWaiver).toHaveBeenCalledWith(expect.any(File), "job-1");
    expect(mockAddPaper).toHaveBeenCalledWith("job-1", "lienWaiver", "PHOTO_W");
  });

  it("refuses a file over 1.5 MB before uploading", async () => {
    render(<LienWaiverUpload jobId="job-1" />);
    choose(pdf(1_500_001));
    expect(await screen.findByRole("alert")).toHaveTextContent(/1\.5 MB/);
    expect(mockUploadWaiver).not.toHaveBeenCalled();
  });

  it("shows a readable message when the upload is refused", async () => {
    mockUploadWaiver.mockRejectedValue(canisterError({ NotAuthorized: null }));
    render(<LienWaiverUpload jobId="job-1" />);
    choose(pdf());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/only the contractor who signed this job/i),
    );
    expect(mockAddPaper).not.toHaveBeenCalled();
  });

  it("shows a message when filing on the job fails", async () => {
    mockAddPaper.mockRejectedValue(new Error("boom"));
    render(<LienWaiverUpload jobId="job-1" />);
    choose(pdf());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
