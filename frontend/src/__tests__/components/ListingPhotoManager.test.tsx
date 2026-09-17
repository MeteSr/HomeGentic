/**
 * ListingPhotoManager — real logic worth locking down:
 *   - empty state text differs for owner vs. gallery viewer
 *   - the first photo (by listing order) is the cover image, and
 *     non-cover photos in the order list are preserved/sorted
 *   - upload skips non-image files, blocks once at MAX_PHOTOS, and
 *     surfaces the real error message (falling back to a generic one
 *     for a non-Error rejection)
 *   - delete removes both the photo and its listing-order entry, then
 *     reloads
 *   - the Add Photos button disables once at capacity or while
 *     uploading
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ListingPhotoManager from "@/components/ListingPhotoManager";
import type { Photo } from "@/services/photo";

const { mockGetPhotos, mockUpload, mockDeletePhoto } = vi.hoisted(() => ({
  mockGetPhotos: vi.fn(),
  mockUpload: vi.fn(),
  mockDeletePhoto: vi.fn(),
}));
vi.mock("@/services/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/photo")>();
  return {
    ...actual,
    photoService: {
      getListingPhotos: mockGetPhotos,
      uploadListingPhoto: mockUpload,
      deletePhoto: mockDeletePhoto,
    },
  };
});

const { mockGetOrder, mockAddPhoto, mockRemovePhoto, mockReorder } = vi.hoisted(() => ({
  mockGetOrder: vi.fn(),
  mockAddPhoto: vi.fn(),
  mockRemovePhoto: vi.fn(),
  mockReorder: vi.fn(),
}));
vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return {
    ...actual,
    listingService: {
      getListingPhotos: mockGetOrder,
      addListingPhoto: mockAddPhoto,
      removeListingPhoto: mockRemovePhoto,
      reorderListingPhotos: mockReorder,
    },
  };
});

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  const id = overrides.id ?? "photo-1";
  return {
    id, jobId: "job-1", propertyId: "prop-1", phase: "Before",
    description: "", hash: "h1", url: `blob:${id}`, size: 1000,
    verified: false, createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPhotos.mockResolvedValue([]);
  mockGetOrder.mockResolvedValue([]);
});

describe("ListingPhotoManager — empty state", () => {
  it("shows the owner-specific empty message", async () => {
    render(<ListingPhotoManager propertyId="prop-1" isOwner />);
    expect(await screen.findByText("No photos yet — add some to attract buyers.")).toBeInTheDocument();
  });

  it("shows the gallery-viewer empty message", async () => {
    render(<ListingPhotoManager propertyId="prop-1" isOwner={false} />);
    expect(await screen.findByText("No photos available.")).toBeInTheDocument();
  });
});

describe("ListingPhotoManager — ordering", () => {
  it("renders photos sorted by the listing order, marking the first as Cover", async () => {
    mockGetPhotos.mockResolvedValue([
      makePhoto({ id: "p-a" }),
      makePhoto({ id: "p-b" }),
    ]);
    mockGetOrder.mockResolvedValue(["p-b", "p-a"]);

    render(<ListingPhotoManager propertyId="prop-1" isOwner={false} />);

    const grid = await screen.findByTestId("listing-photo-grid");
    const imgs = grid.querySelectorAll("img");
    expect(imgs[0]).toHaveAttribute("src", "blob:p-b");
    expect(imgs[1]).toHaveAttribute("src", "blob:p-a");
    expect(screen.getByText("Cover")).toBeInTheDocument();
  });
});

describe("ListingPhotoManager — upload", () => {
  it("uploads image files and skips non-image files", async () => {
    mockUpload.mockResolvedValue(makePhoto({ id: "new-photo" }));
    render(<ListingPhotoManager propertyId="prop-1" isOwner />);
    await screen.findByTestId("listing-photo-empty");

    const imageFile = new File(["x"], "photo.png", { type: "image/png" });
    const textFile = new File(["x"], "notes.txt", { type: "text/plain" });
    const input = screen.getByTestId("listing-photo-manager").querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [imageFile, textFile] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledWith(imageFile, "prop-1", "photo.png");
    expect(mockAddPhoto).toHaveBeenCalledWith("prop-1", "new-photo");
  });

  it("blocks uploads once at MAX_PHOTOS and shows the limit error", async () => {
    mockGetPhotos.mockResolvedValue(Array.from({ length: 15 }, (_, i) => makePhoto({ id: `p-${i}` })));
    mockGetOrder.mockResolvedValue(Array.from({ length: 15 }, (_, i) => `p-${i}`));
    render(<ListingPhotoManager propertyId="prop-1" isOwner />);
    await screen.findByTestId("listing-photo-grid");

    expect(screen.getByTestId("upload-listing-photo-btn")).toBeDisabled();

    const input = screen.getByTestId("listing-photo-manager").querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });

    expect(await screen.findByText("Maximum 15 photos per listing.")).toBeInTheDocument();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("shows the real error message on a failed upload, or a generic fallback for a non-Error rejection", async () => {
    mockUpload.mockRejectedValue(new Error("Storage quota exceeded"));
    render(<ListingPhotoManager propertyId="prop-1" isOwner />);
    await screen.findByTestId("listing-photo-empty");

    const input = screen.getByTestId("listing-photo-manager").querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });

    expect(await screen.findByText("Storage quota exceeded")).toBeInTheDocument();

    mockUpload.mockRejectedValue("not an Error instance");
    fireEvent.change(input, { target: { files: [new File(["x"], "photo2.png", { type: "image/png" })] } });
    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });
});

describe("ListingPhotoManager — delete", () => {
  it("deletes a photo and removes it from the listing order", async () => {
    mockGetPhotos.mockResolvedValue([makePhoto({ id: "p-a" })]);
    mockGetOrder.mockResolvedValue(["p-a"]);
    mockDeletePhoto.mockResolvedValue(undefined);
    render(<ListingPhotoManager propertyId="prop-1" isOwner />);

    fireEvent.click(await screen.findByTestId("delete-photo-p-a"));

    await waitFor(() => expect(mockDeletePhoto).toHaveBeenCalledWith("p-a"));
    expect(mockRemovePhoto).toHaveBeenCalledWith("prop-1", "p-a");
  });
});
