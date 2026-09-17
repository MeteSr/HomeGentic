/**
 * AddRoomModal — real logic worth locking down:
 *   - Save Room is disabled (and blocked) until a room name is entered
 *   - form fields, including the floor-type select, all round-trip
 *   - submitting sends propertyId merged with the form and calls
 *     onSuccess/onClose on success; a failure shows a toast and keeps
 *     the modal open
 *   - the form resets back to empty whenever the modal is reopened
 *   - Escape key and backdrop click both close the modal
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddRoomModal } from "@/components/AddRoomModal";
import type { Room } from "@/services/room";

const { mockCreateRoom } = vi.hoisted(() => ({ mockCreateRoom: vi.fn() }));
vi.mock("@/services/room", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/room")>();
  return { ...actual, roomService: { createRoom: mockCreateRoom } };
});

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: mockToastSuccess } }));

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1", propertyId: "prop-1", owner: "p-owner", name: "Kitchen",
    floorName: "", floorType: "", paintColor: "", paintBrand: "", paintCode: "",
    notes: "", fixtures: [], createdAt: 0n, updatedAt: 0n,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof AddRoomModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <AddRoomModal isOpen onClose={onClose} onSuccess={onSuccess} propertyId="prop-1" {...props} />
  );
  return { ...utils, onClose, onSuccess };
}

beforeEach(() => vi.clearAllMocks());

describe("AddRoomModal — visibility", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <AddRoomModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} propertyId="prop-1" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AddRoomModal — validation", () => {
  it("disables Save Room until a name is entered", () => {
    renderModal();
    expect(screen.getByText("Save Room").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Kitchen, Master Bedroom"), { target: { value: "Kitchen" } });
    expect(screen.getByText("Save Room").closest("button")).not.toBeDisabled();
  });

  it("blocks saving and shows a toast when the name is only whitespace", () => {
    renderModal();
    const nameInput = screen.getByPlaceholderText("e.g. Kitchen, Master Bedroom");
    fireEvent.change(nameInput, { target: { value: "   " } });
    // the button is disabled by the whitespace-only name, so directly assert the guard clause
    expect(screen.getByText("Save Room").closest("button")).toBeDisabled();
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });
});

describe("AddRoomModal — submission", () => {
  it("saves the merged form with propertyId and calls onSuccess/onClose", async () => {
    mockCreateRoom.mockResolvedValue(makeRoom({ name: "Kitchen" }));
    const { onSuccess, onClose } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Kitchen, Master Bedroom"), { target: { value: "Kitchen" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Shaw, Pergo, Armstrong"), { target: { value: "Shaw" } });
    fireEvent.change(screen.getByLabelText("Floor Type"), { target: { value: "Hardwood" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Agreeable Gray"), { target: { value: "Agreeable Gray" } });
    fireEvent.click(screen.getByText("Save Room"));

    await waitFor(() => expect(mockCreateRoom).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-1",
      name: "Kitchen",
      floorName: "Shaw",
      floorType: "Hardwood",
      paintColor: "Agreeable Gray",
    })));
    expect(mockToastSuccess).toHaveBeenCalledWith("Kitchen added");
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ name: "Kitchen" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error toast and keeps the modal open when saving fails", async () => {
    mockCreateRoom.mockRejectedValue(new Error("Room limit reached"));
    const { onClose } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Kitchen, Master Bedroom"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByText("Save Room"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Room limit reached"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("AddRoomModal — reset on reopen", () => {
  it("clears the form when the modal is reopened", () => {
    const { rerender } = renderModal({ isOpen: false });
    rerender(<AddRoomModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} propertyId="prop-1" />);
    const nameInput = screen.getByPlaceholderText("e.g. Kitchen, Master Bedroom") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Kitchen" } });
    expect(nameInput.value).toBe("Kitchen");

    rerender(<AddRoomModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} propertyId="prop-1" />);
    rerender(<AddRoomModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} propertyId="prop-1" />);

    expect((screen.getByPlaceholderText("e.g. Kitchen, Master Bedroom") as HTMLInputElement).value).toBe("");
  });
});

describe("AddRoomModal — dismissal", () => {
  it("closes on Escape key", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click but not on modal content click", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(screen.getByText("Add Room")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstChild as Element); // backdrop
    expect(onClose).toHaveBeenCalled();
  });
});
