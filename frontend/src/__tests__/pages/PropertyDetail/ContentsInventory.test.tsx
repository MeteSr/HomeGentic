import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InventoryItem } from "@/services/inventory";
import { canisterError } from "@/services/candid";

const { mockInventory, mockPhoto, mockToast, mockDownload } = vi.hoisted(() => ({
  mockInventory: { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() },
  mockPhoto: { upload: vi.fn(), deletePhoto: vi.fn() },
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockDownload: vi.fn(),
}));

vi.mock("@/services/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/inventory")>()),
  inventoryService: mockInventory,
}));
vi.mock("@/services/photo", () => ({ photoService: mockPhoto }));
vi.mock("react-hot-toast", () => ({ default: mockToast }));
vi.mock("@/utils/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/csv")>()),
  downloadText: mockDownload,
}));

import { ContentsInventory } from "@/pages/PropertyDetail/ContentsInventory";

const ROOMS = [
  { id: "r1", name: "Living room" },
  { id: "r2", name: "Bedroom" },
];

const TV: InventoryItem = {
  id: "i1",
  propertyId: "p1",
  roomId: "r1",
  name: "65-inch TV",
  category: "Electronics",
  quantity: 1,
  valueCents: 129_900,
  purchaseDate: "2024-11-29",
  serialNumber: "SN-123",
  notes: "Wall mounted",
  createdAt: 1,
  updatedAt: 1,
};
const CHAIRS: InventoryItem = {
  ...TV,
  id: "i2",
  roomId: "r2",
  name: "Dining chair",
  category: "Furniture",
  quantity: 4,
  valueCents: 15_000,
  purchaseDate: "",
  serialNumber: "",
  notes: "",
};
const BIKE: InventoryItem = { ...CHAIRS, id: "i3", roomId: null, name: "Bike", quantity: 1, valueCents: null };

const photo = (over: Record<string, unknown>) => ({
  id: "ph1",
  jobId: "inventory_i1",
  propertyId: "p1",
  phase: "PostConstruction",
  description: "Inventory photo: 65-inch TV (tv.jpg)",
  hash: "a".repeat(64),
  url: "blob:tv",
  size: 100,
  verified: false,
  createdAt: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockInventory.list.mockResolvedValue([]);
  mockPhoto.deletePhoto.mockResolvedValue(undefined);
});

const renderIt = (over: Partial<React.ComponentProps<typeof ContentsInventory>> = {}) =>
  render(<ContentsInventory propertyId="p1" canEdit rooms={ROOMS} {...over} />);

describe("ContentsInventory", () => {
  it("says what it is and that nothing goes to the insurer", async () => {
    renderIt();
    expect(await screen.findByText(/nothing listed yet/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't appraise anything or send it to your insurer/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download CSV" })).not.toBeInTheDocument();
  });

  it("groups items by room with subtotals and a total for the home", async () => {
    mockInventory.list.mockResolvedValue([BIKE, CHAIRS, TV]);
    renderIt();
    const groups = await screen.findAllByRole("heading", { level: 3 });
    expect(groups.map((h) => h.textContent)).toEqual(["Living room", "Bedroom", "No room"]);
    expect(screen.getByText("3 items · $1,899 listed")).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 items have a value/i)).toBeInTheDocument();
    const bedroom = screen.getByRole("region", { name: "Bedroom" });
    expect(within(bedroom).getByText("Dining chair")).toBeInTheDocument();
    expect(within(bedroom).getByText("4 × $150 = $600")).toBeInTheDocument();
    expect(within(bedroom).getByText("$600")).toBeInTheDocument();
    const living = screen.getByRole("region", { name: "Living room" });
    expect(within(living).getByText(/Electronics · Bought Nov 29, 2024 · Serial SN-123/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "No room" })).getByText("No value entered")).toBeInTheDocument();
  });

  it("downloads the list as CSV", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    expect(mockDownload).toHaveBeenCalledWith(expect.stringContaining("Living room,65-inch TV"), "home-inventory.csv");
  });

  it("adds an item from the form", async () => {
    mockInventory.add.mockResolvedValue(TV);
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Add an item" }));
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: " 65-inch TV " } });
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "r1" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Electronics" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Value each ($)"), { target: { value: "1,299" } });
    fireEvent.change(screen.getByLabelText("Purchase date"), { target: { value: "2024-11-29" } });
    fireEvent.change(screen.getByLabelText("Serial number"), { target: { value: "SN-123" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Wall mounted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() =>
      expect(mockInventory.add).toHaveBeenCalledWith("p1", {
        roomId: "r1",
        name: "65-inch TV",
        category: "Electronics",
        quantity: 1,
        valueCents: 129_900,
        purchaseDate: "2024-11-29",
        serialNumber: "SN-123",
        notes: "Wall mounted",
      }),
    );
    expect(await screen.findByText("65-inch TV")).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalledWith("Item added");
  });

  it("refuses a bad item before calling the canister", async () => {
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Add an item" }));
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Name the item");
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "TV" } });
    fireEvent.change(screen.getByLabelText("Value each ($)"), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the value in dollars");
    expect(mockInventory.add).not.toHaveBeenCalled();
  });

  it("shows the canister's refusal", async () => {
    mockInventory.add.mockRejectedValue(canisterError({ InvalidInput: "This home already lists 500 items" }));
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Add an item" }));
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "TV" } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("This home already lists 500 items"));
  });

  it("edits an item, moving it to another room", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    mockInventory.update.mockResolvedValue({ ...TV, roomId: "r2" });
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "Edit 65-inch TV" }));
    expect(screen.getByLabelText("Value each ($)")).toHaveValue("1299.00");
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() =>
      expect(mockInventory.update).toHaveBeenCalledWith("i1", expect.objectContaining({ roomId: "r2" })),
    );
    expect(await screen.findByRole("region", { name: "Bedroom" })).toBeInTheDocument();
  });

  it("shows an item's photos and receipts from the home's photos", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    renderIt({
      propertyPhotos: [
        photo({}),
        photo({ id: "ph2", description: "Inventory receipt: 65-inch TV (receipt.pdf)", url: "blob:r" }),
        photo({ id: "ph3", jobId: "claim_c1" }),
      ],
    });
    expect(await screen.findByRole("img", { name: "Inventory photo: 65-inch TV (tv.jpg)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Receipt: receipt.pdf" })).toHaveAttribute("href", "blob:r");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("uploads a photo and a receipt under the item's id", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    mockPhoto.upload
      .mockResolvedValueOnce(photo({ id: "new1", description: "Inventory photo: 65-inch TV (tv.jpg)" }))
      .mockResolvedValueOnce(photo({ id: "new2", description: "Inventory receipt: 65-inch TV (r.pdf)" }));
    renderIt();
    const tvFile = new File(["x"], "tv.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByLabelText("Add photos of 65-inch TV"), { target: { files: [tvFile] } });
    await waitFor(() =>
      expect(mockPhoto.upload).toHaveBeenCalledWith(
        tvFile,
        "inventory_i1",
        "p1",
        "PostConstruction",
        "Inventory photo: 65-inch TV (tv.jpg)",
      ),
    );
    const receipt = new File(["x"], "r.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Add a receipt for 65-inch TV"), { target: { files: [receipt] } });
    await waitFor(() =>
      expect(mockPhoto.upload).toHaveBeenLastCalledWith(
        receipt,
        "inventory_i1",
        "p1",
        "PostConstruction",
        "Inventory receipt: 65-inch TV (r.pdf)",
      ),
    );
    expect(await screen.findByRole("link", { name: "Receipt: r.pdf" })).toBeInTheDocument();
  });

  it("deletes an item and its photos after confirming", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    mockInventory.remove.mockResolvedValue(undefined);
    renderIt({ propertyPhotos: [photo({})] });
    fireEvent.click(await screen.findByRole("button", { name: "Delete 65-inch TV" }));
    expect(
      screen.getByText(/delete this item and its photos and receipts\? this can't be undone/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(mockInventory.remove).toHaveBeenCalledWith("i1"));
    expect(mockPhoto.deletePhoto).toHaveBeenCalledWith("ph1");
    await waitFor(() => expect(screen.queryByText("65-inch TV")).not.toBeInTheDocument());
  });

  it("says so when an item's photos couldn't all be removed", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    mockInventory.remove.mockResolvedValue(undefined);
    mockPhoto.deletePhoto.mockRejectedValue(new Error("nope"));
    renderIt({ propertyPhotos: [photo({})] });
    fireEvent.click(await screen.findByRole("button", { name: "Delete 65-inch TV" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        "Item deleted, but 1 photo or receipt couldn't be removed. It stays with the home's photos.",
      ),
    );
  });

  it("is read-only for viewers", async () => {
    mockInventory.list.mockResolvedValue([TV]);
    renderIt({ canEdit: false });
    expect(await screen.findByText("65-inch TV")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add an item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit 65-inch TV" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add photos of 65-inch TV")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
  });

  it("offers a retry when the list can't load", async () => {
    mockInventory.list.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([TV]);
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("65-inch TV")).toBeInTheDocument();
  });
});
