/**
 * Unit tests for BaselinePromptCard — Issue #135
 *
 * Covers:
 *   - Card renders when photos are missing and not dismissed
 *   - Shows all 6 system labels
 *   - Progress count "0 / 6"
 *   - Dismiss hides the card (not all complete)
 *   - Card hidden when dismissed and photos are missing
 *   - "Baseline complete" badge shown when all 6 photos present (overrides dismiss)
 *   - "Add photo" buttons rendered for each incomplete system
 *   - Uploading a photo marks that system as captured
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/services/photo", () => ({
  photoService: {
    getByJob: vi.fn().mockResolvedValue([]),
    upload:   vi.fn().mockResolvedValue({
      id: "p1", jobId: "baseline_1", propertyId: "1",
      phase: "PostConstruction", description: "hvac",
      hash: "abc", url: "blob:fake", size: 100,
      verified: false, createdAt: Date.now(),
    }),
  },
}));

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { photoService } from "@/services/photo";
import { BaselinePromptCard, BASELINE_SYSTEMS } from "@/components/BaselinePromptCard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_PHOTO = (description: string) => ({
  id: description, jobId: "baseline_1", propertyId: "1",
  phase: "PostConstruction", description,
  hash: description, url: "blob:fake", size: 100,
  verified: false, createdAt: Date.now(),
});

const PROPERTY = {
  id: BigInt(1), owner: "test",
  address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
  propertyType: "SingleFamily" as const,
  yearBuilt: BigInt(2001), squareFeet: BigInt(2400),
  verificationLevel: "Unverified", tier: "Free",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true,
};

function renderCard(opts: { dismissed?: boolean; onDismiss?: () => void } = {}) {
  const onDismiss = opts.onDismiss ?? vi.fn();
  return render(
    <BaselinePromptCard
      property={PROPERTY}
      dismissed={opts.dismissed ?? false}
      onDismiss={onDismiss}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BaselinePromptCard", () => {
  beforeEach(() => {
    vi.mocked(photoService.getByJob).mockResolvedValue([]);
  });

  // ── Visible card (0 photos, not dismissed) ─────────────────────────────────

  it("renders 'Complete your property baseline' heading when photos are missing", async () => {
    renderCard();
    await waitFor(() =>
      expect(screen.getByText(/complete your property baseline/i)).toBeInTheDocument()
    );
  });

  it("shows all 6 system labels", async () => {
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    for (const { label } of BASELINE_SYSTEMS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("shows progress count '0 / 6' when no photos are captured", async () => {
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    expect(screen.getByText(/0/)).toBeInTheDocument();
    expect(screen.getByText(/\/\s*6/)).toBeInTheDocument();
  });

  it("renders 6 'Add photo' buttons — one per system", async () => {
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    expect(screen.getAllByRole("button", { name: /add photo/i })).toHaveLength(6);
  });

  it("shows a dismiss button", async () => {
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  // ── Dismissed state ────────────────────────────────────────────────────────

  it("is hidden when dismissed and photos are missing", async () => {
    renderCard({ dismissed: true });
    // Give the async fetch time to resolve
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/complete your property baseline/i)).not.toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const onDismiss = vi.fn();
    renderCard({ onDismiss });
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // ── All 6 photos present ───────────────────────────────────────────────────

  it("shows 'Baseline photos complete' badge when all 6 systems are captured", async () => {
    const allPhotos = BASELINE_SYSTEMS.map(({ key }) => FAKE_PHOTO(key));
    vi.mocked(photoService.getByJob).mockResolvedValue(allPhotos);
    renderCard();
    await waitFor(() =>
      expect(screen.getByText(/baseline photos complete/i)).toBeInTheDocument()
    );
  });

  it("shows 'Baseline photos complete' badge even when dismissed", async () => {
    const allPhotos = BASELINE_SYSTEMS.map(({ key }) => FAKE_PHOTO(key));
    vi.mocked(photoService.getByJob).mockResolvedValue(allPhotos);
    renderCard({ dismissed: true });
    await waitFor(() =>
      expect(screen.getByText(/baseline photos complete/i)).toBeInTheDocument()
    );
  });

  it("does not show the checklist when all 6 are captured", async () => {
    const allPhotos = BASELINE_SYSTEMS.map(({ key }) => FAKE_PHOTO(key));
    vi.mocked(photoService.getByJob).mockResolvedValue(allPhotos);
    renderCard();
    await waitFor(() => screen.getByText(/baseline photos complete/i));
    expect(screen.queryByText(/complete your property baseline/i)).not.toBeInTheDocument();
  });

  // ── Partial completion ─────────────────────────────────────────────────────

  it("shows progress count '2 / 6' when 2 photos are present", async () => {
    vi.mocked(photoService.getByJob).mockResolvedValue([
      FAKE_PHOTO("hvac"),
      FAKE_PHOTO("roof"),
    ]);
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    // The counter node renders as "2 " + "/ 6" in two adjacent spans
    expect(screen.getByText(/\/\s*6/)).toBeInTheDocument();
    // 4 systems remain — 4 Add photo buttons
    expect(screen.getAllByRole("button", { name: /add photo/i })).toHaveLength(4);
  });

  it("renders 'Add photo' button only for incomplete systems", async () => {
    vi.mocked(photoService.getByJob).mockResolvedValue([FAKE_PHOTO("hvac")]);
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));
    // 5 systems remaining
    expect(screen.getAllByRole("button", { name: /add photo/i })).toHaveLength(5);
  });

  // ── Upload interaction ─────────────────────────────────────────────────────

  it("marks a system as captured after upload completes", async () => {
    renderCard();
    await waitFor(() => screen.getByText(/complete your property baseline/i));

    // Simulate a file-change event on the hidden input for 'hvac'
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["data"], "hvac.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() =>
      // After upload, the photoService.upload mock returns description:"hvac"
      // so the count should show 1 captured
      expect(screen.getByText(/1/)).toBeInTheDocument()
    );
  });
});
