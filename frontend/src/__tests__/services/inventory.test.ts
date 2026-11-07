import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stateful stand-in for the property canister's #711 inventory methods.
let rows: any[] = [];
let n = 0;
const NS = 1_700_000_000_000_000_000n;
const mockActor = {
  getInventory: vi.fn(async (propertyId: string) =>
    propertyId === "missing" ? { err: { NotFound: null } } : { ok: rows.filter((r) => r.propertyId === propertyId) },
  ),
  addInventoryItem: vi.fn(async (propertyId: string, input: any) => {
    if (input.name === "bad") return { err: { InvalidInput: "Name the item" } };
    const row = { ...input, id: `i${++n}`, propertyId, createdAt: NS, updatedAt: NS };
    rows.push(row);
    return { ok: row };
  }),
  updateInventoryItem: vi.fn(async (id: string, input: any) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return { err: { NotFound: null } };
    rows[i] = { ...rows[i], ...input };
    return { ok: rows[i] };
  }),
  deleteInventoryItem: vi.fn(async (id: string) => {
    const before = rows.length;
    rows = rows.filter((r) => r.id !== id);
    return rows.length < before ? { ok: null } : { err: { NotFound: null } };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  inventoryService,
  inventoryPhotoJobId,
  inventoryIdOfPhoto,
  inventoryPhotoDescription,
  isReceipt,
  itemTotalCents,
  inventoryTotalCents,
  groupByRoom,
  inventoryCsv,
  validateItem,
  EMPTY_ITEM,
  type InventoryInput,
  type InventoryItem,
} from "@/services/inventory";

const INPUT: InventoryInput = {
  roomId: "r1",
  name: "65-inch TV",
  category: "Electronics",
  quantity: 1,
  valueCents: 129_900,
  purchaseDate: "2024-11-29",
  serialNumber: "SN-123",
  notes: "Wall mounted",
};

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  ...INPUT,
  id: "i1",
  propertyId: "p1",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  rows = [];
  n = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_inventory;
});

describe("inventoryService", () => {
  it("adds an item in canister form and lists it back", async () => {
    const added = await inventoryService.add("p1", INPUT);
    expect(mockActor.addInventoryItem).toHaveBeenCalledWith("p1", {
      ...INPUT,
      roomId: ["r1"],
      quantity: 1n,
      valueCents: [129_900n],
    });
    expect(added).toEqual({
      ...INPUT,
      id: "i1",
      propertyId: "p1",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    expect(await inventoryService.list("p1")).toEqual([added]);
  });

  it("sends no room and no value as empty optionals", async () => {
    const added = await inventoryService.add("p1", { ...INPUT, roomId: null, valueCents: null });
    expect(mockActor.addInventoryItem).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ roomId: [], valueCents: [] }),
    );
    expect(added.roomId).toBeNull();
    expect(added.valueCents).toBeNull();
  });

  it("updates and deletes an item", async () => {
    const added = await inventoryService.add("p1", INPUT);
    const edited = await inventoryService.update(added.id, { ...INPUT, quantity: 2 });
    expect(edited.quantity).toBe(2);
    await inventoryService.remove(added.id);
    expect(await inventoryService.list("p1")).toEqual([]);
  });

  it("throws the canister's error", async () => {
    await expect(inventoryService.list("missing")).rejects.toMatchObject({ code: "NotFound" });
    await expect(inventoryService.add("p1", { ...INPUT, name: "bad" })).rejects.toMatchObject({
      code: "InvalidInput",
    });
    await expect(inventoryService.remove("nope")).rejects.toMatchObject({ code: "NotFound" });
  });

  it("uses the e2e store when one is injected", async () => {
    (window as any).__e2e_inventory = { p1: [] };
    const added = await inventoryService.add("p1", INPUT);
    expect(added.propertyId).toBe("p1");
    const edited = await inventoryService.update(added.id, { ...INPUT, name: "TV" });
    expect(edited.name).toBe("TV");
    expect(await inventoryService.list("p1")).toEqual([edited]);
    await inventoryService.remove(added.id);
    expect(await inventoryService.list("p1")).toEqual([]);
    await expect(inventoryService.update("gone", INPUT)).rejects.toThrow();
    expect(mockActor.addInventoryItem).not.toHaveBeenCalled();
  });
});

describe("inventory photos", () => {
  it("files photos under the item's own id", () => {
    expect(inventoryPhotoJobId("abc")).toBe("inventory_abc");
    expect(inventoryIdOfPhoto({ jobId: "inventory_abc" })).toBe("abc");
    expect(inventoryIdOfPhoto({ jobId: "inventory_" })).toBeNull();
    expect(inventoryIdOfPhoto({ jobId: "claim_abc" })).toBeNull();
  });

  it("labels photos and receipts so they read right among the home's photos", () => {
    expect(inventoryPhotoDescription("photo", "65-inch TV", "tv.jpg")).toBe("Inventory photo: 65-inch TV (tv.jpg)");
    expect(inventoryPhotoDescription("receipt", "65-inch TV", "r.pdf")).toBe("Inventory receipt: 65-inch TV (r.pdf)");
    const long = inventoryPhotoDescription("photo", "x".repeat(150), "y".repeat(150));
    expect(long.length).toBeLessThanOrEqual(200);
    expect(isReceipt({ description: "Inventory receipt: TV (r.pdf)" })).toBe(true);
    expect(isReceipt({ description: "Inventory photo: TV (tv.jpg)" })).toBe(false);
  });
});

describe("inventory totals and grouping", () => {
  it("multiplies value by quantity and skips items with no value", () => {
    expect(itemTotalCents(item({ quantity: 4, valueCents: 2_500 }))).toBe(10_000);
    expect(itemTotalCents(item({ valueCents: null }))).toBe(0);
    expect(inventoryTotalCents([item({ quantity: 2, valueCents: 1_000 }), item({ id: "i2", valueCents: null })])).toBe(
      2_000,
    );
  });

  it("groups by room in the home's room order, with unknown or missing rooms last", () => {
    const rooms = [
      { id: "r1", name: "Living room" },
      { id: "r2", name: "Bedroom" },
    ];
    const items = [
      item({ id: "a", roomId: "r2", name: "Dresser" }),
      item({ id: "b", roomId: null, name: "Bike" }),
      item({ id: "c", roomId: "gone", name: "Lamp" }),
      item({ id: "d", roomId: "r1", name: "Sofa" }),
      item({ id: "e", roomId: "r1", name: "Armchair" }),
    ];
    const groups = groupByRoom(items, rooms);
    expect(groups.map((g) => g.label)).toEqual(["Living room", "Bedroom", "No room"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Armchair", "Sofa"]);
    expect(groups[2].items.map((i) => i.name)).toEqual(["Bike", "Lamp"]);
    expect(groups[2].roomId).toBeNull();
  });
});

describe("inventoryCsv", () => {
  it("writes one row per item with room names and dollar values, quoting where needed", () => {
    const csv = inventoryCsv(
      [
        item({ name: 'TV, "big"', quantity: 2, valueCents: 129_900, notes: "line1\nline2" }),
        item({ id: "i2", roomId: null, name: "Rug", valueCents: null, purchaseDate: "", serialNumber: "" }),
      ],
      [{ id: "r1", name: "Living room" }],
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Room,Item,Category,Quantity,Value each (USD),Total value (USD),Purchase date,Serial number,Notes",
    );
    expect(lines[1]).toBe('Living room,"TV, ""big""",Electronics,2,1299.00,2598.00,2024-11-29,SN-123,"line1\nline2"');
    expect(lines[2]).toBe("No room,Rug,Electronics,1,,,,,Wall mounted");
  });

  it("neutralises cells a spreadsheet would run as a formula", () => {
    const csv = inventoryCsv([item({ name: "=HYPERLINK(1)", notes: "+1" })], []);
    expect(csv.split("\r\n")[1]).toContain(",'=HYPERLINK(1),");
    expect(csv.split("\r\n")[1]).toMatch(/,'\+1$/);
  });
});

describe("validateItem", () => {
  it("accepts a full item and a bare one", () => {
    expect(validateItem(INPUT)).toBeNull();
    expect(validateItem({ ...EMPTY_ITEM, name: "Rug" })).toBeNull();
  });

  it("matches the canister's rules", () => {
    expect(validateItem({ ...INPUT, name: "  " })).toMatch(/name/i);
    expect(validateItem({ ...INPUT, name: "x".repeat(101) })).toMatch(/100/);
    expect(validateItem({ ...INPUT, category: "x".repeat(41) })).toMatch(/40/);
    expect(validateItem({ ...INPUT, quantity: 0 })).toMatch(/1 to 999/);
    expect(validateItem({ ...INPUT, quantity: 1000 })).toMatch(/1 to 999/);
    expect(validateItem({ ...INPUT, quantity: 1.5 })).toMatch(/1 to 999/);
    expect(validateItem({ ...INPUT, valueCents: 10_000_000_001 })).toMatch(/100,000,000/);
    expect(validateItem({ ...INPUT, valueCents: -1 })).toMatch(/value/i);
    expect(validateItem({ ...INPUT, purchaseDate: "11/29/2024" })).toMatch(/date/i);
    expect(validateItem({ ...INPUT, purchaseDate: "1899-12-31" })).toMatch(/date/i);
    expect(validateItem({ ...INPUT, purchaseDate: "2024-02-30" })).toMatch(/date/i);
    expect(validateItem({ ...INPUT, purchaseDate: "1987-06-01" })).toBeNull();
    expect(validateItem({ ...INPUT, serialNumber: "x".repeat(101) })).toMatch(/100/);
    expect(validateItem({ ...INPUT, notes: "x".repeat(501) })).toMatch(/500/);
  });
});
