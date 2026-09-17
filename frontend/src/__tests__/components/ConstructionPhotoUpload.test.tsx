/**
 * ConstructionPhotoUpload — real logic worth locking down:
 *   - a file added via the hidden input calls onUpload with the file
 *     and the currently selected doc type, and shows a tagged preview
 *   - uploads are blocked once quota.used + previews already added
 *     reaches quota.limit (no onUpload call, no new preview)
 *   - a drag-and-drop drop also uploads its files
 *   - drag state toggles the dropzone's border/background
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConstructionPhotoUpload } from "@/components/ConstructionPhotoUpload";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn().mockReturnValue("blob:preview") });
});

function makeFile(name = "receipt.png") {
  return new File(["x"], name, { type: "image/png" });
}

describe("ConstructionPhotoUpload — file input upload", () => {
  it("uploads a file with the selected doc type and shows a tagged preview", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <ConstructionPhotoUpload onUpload={onUpload} quota={{ used: 0, limit: 10, tier: "Free" }} />
    );

    fireEvent.change(screen.getByLabelText("Document Type"), { target: { value: "Invoice" } });
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [makeFile("invoice.png")] } });

    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "invoice.png" }), "Invoice");
    expect(screen.getByAltText("invoice.png")).toBeInTheDocument();
    expect(screen.getByAltText("invoice.png").nextElementSibling).toHaveTextContent("Invoice");
  });

  it("uploads multiple files from one selection", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <ConstructionPhotoUpload onUpload={onUpload} quota={{ used: 0, limit: 10, tier: "Free" }} />
    );
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [makeFile("a.png"), makeFile("b.png")] } });

    expect(onUpload).toHaveBeenCalledTimes(2);
  });
});

describe("ConstructionPhotoUpload — quota gating", () => {
  it("blocks new uploads once at the quota limit", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <ConstructionPhotoUpload onUpload={onUpload} quota={{ used: 10, limit: 10, tier: "Free" }} />
    );
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.queryByAltText("receipt.png")).not.toBeInTheDocument();
  });

  it("blocks further uploads within the same session once local previews reach the limit", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <ConstructionPhotoUpload onUpload={onUpload} quota={{ used: 9, limit: 10, tier: "Free" }} />
    );
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [makeFile("first.png")] } });
    expect(onUpload).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { files: [makeFile("second.png")] } });
    expect(onUpload).toHaveBeenCalledTimes(1); // second upload blocked: used(9) + previews(1) >= limit(10)
  });
});

describe("ConstructionPhotoUpload — drag and drop", () => {
  it("uploads files dropped onto the dropzone", () => {
    const onUpload = vi.fn();
    render(<ConstructionPhotoUpload onUpload={onUpload} quota={{ used: 0, limit: 10, tier: "Free" }} />);
    const dropzone = screen.getByText("Drag files here or click to browse").closest("div")!;

    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveStyle({ background: "rgb(255, 246, 219)" });

    fireEvent.drop(dropzone, { dataTransfer: { files: [makeFile("dropped.png")] } });

    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "dropped.png" }), "Receipt");
    expect(dropzone).toHaveStyle({ background: "rgb(252, 252, 253)" });
  });

  it("clears drag state on dragLeave without uploading", () => {
    const onUpload = vi.fn();
    render(<ConstructionPhotoUpload onUpload={onUpload} quota={{ used: 0, limit: 10, tier: "Free" }} />);
    const dropzone = screen.getByText("Drag files here or click to browse").closest("div")!;

    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);

    expect(dropzone).toHaveStyle({ background: "rgb(252, 252, 253)" });
    expect(onUpload).not.toHaveBeenCalled();
  });
});
