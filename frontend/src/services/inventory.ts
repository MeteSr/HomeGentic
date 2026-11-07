/**
 * #711 contents inventory: the household's list of what's in the home, room
 * by room, with value, for an insurance claim (property canister:
 * addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventory).
 * HomeGentic doesn't appraise anything or send the list to an insurer. Photos
 * and receipts go to the photo canister under the item's own id
 * (inventoryPhotoJobId).
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";
import { isoDateMs } from "./insurancePolicy";
import { csvCell } from "@/utils/csv";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export interface InventoryInput {
  /** A room on this home, or null. */
  roomId: string | null;
  name: string;
  category: string;
  quantity: number;
  /** What one of them is worth, in cents, or null if not entered. */
  valueCents: number | null;
  /** "" or "YYYY-MM-DD" */
  purchaseDate: string;
  serialNumber: string;
  notes: string;
}

export interface InventoryItem extends InventoryInput {
  id: string;
  propertyId: string;
  createdAt: number;
  updatedAt: number;
}

export const EMPTY_ITEM: InventoryInput = {
  roomId: null,
  name: "",
  category: "",
  quantity: 1,
  valueCents: null,
  purchaseDate: "",
  serialNumber: "",
  notes: "",
};

/** Categories offered in the form (free text is allowed too). */
export const INVENTORY_CATEGORIES = [
  "Electronics",
  "Furniture",
  "Appliances",
  "Jewelry",
  "Clothing",
  "Art and collectibles",
  "Tools and equipment",
  "Kitchenware",
  "Sports and outdoor",
  "Other",
];

/** The photo canister jobId an item's photos and receipts are filed under. */
export function inventoryPhotoJobId(itemId: string): string {
  return `inventory_${itemId}`;
}

/** The item a photo was filed under, or null if it isn't an inventory photo. */
export function inventoryIdOfPhoto(photo: { jobId: string }): string | null {
  const prefix = "inventory_";
  return photo.jobId.startsWith(prefix) && photo.jobId.length > prefix.length ? photo.jobId.slice(prefix.length) : null;
}

const RECEIPT_PREFIX = "Inventory receipt: ";

/**
 * The description a photo or receipt is stored with, so it reads right
 * wherever the home's photos show up. Kept short of the canister's limit.
 */
export function inventoryPhotoDescription(kind: "photo" | "receipt", itemName: string, fileName: string): string {
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const prefix = kind === "receipt" ? RECEIPT_PREFIX : "Inventory photo: ";
  return `${prefix}${cut(itemName, 100)} (${cut(fileName, 70)})`;
}

export function isReceipt(photo: { description: string }): boolean {
  return photo.description.startsWith(RECEIPT_PREFIX);
}

/** Value times quantity, or 0 when no value was entered. */
export function itemTotalCents(i: InventoryItem): number {
  return (i.valueCents ?? 0) * i.quantity;
}

export function inventoryTotalCents(items: InventoryItem[]): number {
  return items.reduce((sum, i) => sum + itemTotalCents(i), 0);
}

export interface RoomRef {
  id: string;
  name: string;
}

export interface RoomGroup {
  roomId: string | null;
  label: string;
  items: InventoryItem[];
}

/**
 * Items grouped by room, in the home's room order, each sorted by name. Items
 * with no room, or whose room was deleted, come last under "No room".
 */
export function groupByRoom(items: InventoryItem[], rooms: RoomRef[]): RoomGroup[] {
  const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name);
  const known = new Set(rooms.map((r) => r.id));
  const groups: RoomGroup[] = rooms
    .map((r) => ({ roomId: r.id, label: r.name, items: items.filter((i) => i.roomId === r.id).sort(byName) }))
    .filter((g) => g.items.length > 0);
  const loose = items.filter((i) => i.roomId === null || !known.has(i.roomId)).sort(byName);
  if (loose.length > 0) groups.push({ roomId: null, label: "No room", items: loose });
  return groups;
}

const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

const CSV_HEADER = [
  "Room",
  "Item",
  "Category",
  "Quantity",
  "Value each (USD)",
  "Total value (USD)",
  "Purchase date",
  "Serial number",
  "Notes",
];

/** The inventory as CSV (RFC 4180 line endings), grouped by room, to attach to a claim. */
export function inventoryCsv(items: InventoryItem[], rooms: RoomRef[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const g of groupByRoom(items, rooms)) {
    for (const i of g.items) {
      lines.push(
        [
          g.label,
          i.name,
          i.category,
          String(i.quantity),
          dollars(i.valueCents),
          i.valueCents === null ? "" : dollars(itemTotalCents(i)),
          i.purchaseDate,
          i.serialNumber,
          i.notes,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return lines.join("\r\n");
}

const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);

function fromCanister(r: PropertyTypes.InventoryItem): InventoryItem {
  return {
    id: r.id,
    propertyId: r.propertyId,
    roomId: r.roomId[0] ?? null,
    name: r.name,
    category: r.category,
    quantity: Number(r.quantity),
    valueCents: r.valueCents.length > 0 ? Number(r.valueCents[0]) : null,
    purchaseDate: r.purchaseDate,
    serialNumber: r.serialNumber,
    notes: r.notes,
    createdAt: nsToMs(r.createdAt),
    updatedAt: nsToMs(r.updatedAt),
  };
}

function toCanister(i: InventoryInput): PropertyTypes.InventoryItemInput {
  return {
    ...i,
    roomId: i.roomId === null ? [] : [i.roomId],
    quantity: BigInt(i.quantity),
    valueCents: i.valueCents === null ? [] : [BigInt(i.valueCents)],
  };
}

/** E2E: window.__e2e_inventory = { [propertyId]: InventoryItem[] } stands in for the canister. */
function e2eStore(): Record<string, InventoryItem[]> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_inventory : undefined;
}

function e2eFind(store: Record<string, InventoryItem[]>, id: string): InventoryItem {
  const i = Object.values(store)
    .flat()
    .find((x) => x.id === id);
  if (!i) throw new Error("Item not found");
  return i;
}

function unwrap<T>(res: { ok: T } | { err: PropertyTypes.Error }): T {
  if ("err" in res) throw canisterError(res.err);
  return res.ok;
}

export const inventoryService = {
  async list(propertyId: string): Promise<InventoryItem[]> {
    const e2e = e2eStore();
    if (e2e) return [...(e2e[propertyId] ?? [])];
    const a = await getActor();
    return unwrap(await a.getInventory(propertyId)).map(fromCanister);
  },

  async add(propertyId: string, input: InventoryInput): Promise<InventoryItem> {
    const e2e = e2eStore();
    if (e2e) {
      const now = Date.now();
      const i: InventoryItem = { ...input, id: `e2e-item-${now}`, propertyId, createdAt: now, updatedAt: now };
      e2e[propertyId] = [...(e2e[propertyId] ?? []), i];
      return i;
    }
    const a = await getActor();
    return fromCanister(unwrap(await a.addInventoryItem(propertyId, toCanister(input))));
  },

  async update(itemId: string, input: InventoryInput): Promise<InventoryItem> {
    const e2e = e2eStore();
    if (e2e) {
      const next = { ...e2eFind(e2e, itemId), ...input, updatedAt: Date.now() };
      e2e[next.propertyId] = e2e[next.propertyId].map((x) => (x.id === itemId ? next : x));
      return next;
    }
    const a = await getActor();
    return fromCanister(unwrap(await a.updateInventoryItem(itemId, toCanister(input))));
  },

  async remove(itemId: string): Promise<void> {
    const e2e = e2eStore();
    if (e2e) {
      const i = e2eFind(e2e, itemId);
      e2e[i.propertyId] = e2e[i.propertyId].filter((x) => x.id !== itemId);
      return;
    }
    const a = await getActor();
    unwrap(await a.deleteInventoryItem(itemId));
  },
};

/** The canister's rules for an item. Returns the problem, or null. */
export function validateItem(i: InventoryInput): string | null {
  const name = i.name.trim();
  if (!name) return "Name the item";
  if (name.length > 100) return "Name is over 100 characters";
  if (i.category.trim().length > 40) return "Category is over 40 characters";
  if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 999) return "Quantity must be 1 to 999";
  if (i.valueCents !== null) {
    if (!Number.isInteger(i.valueCents) || i.valueCents < 0) return "Enter the value in dollars";
    if (i.valueCents > 10_000_000_000) return "Value is over $100,000,000";
  }
  const year = Number(i.purchaseDate.slice(0, 4));
  if (i.purchaseDate !== "" && (isoDateMs(i.purchaseDate) === null || year < 1900 || year > 2100))
    return "Purchase date must be a real date written YYYY-MM-DD";
  if (i.serialNumber.trim().length > 100) return "Serial number is over 100 characters";
  if (i.notes.trim().length > 500) return "Notes are over 500 characters";
  return null;
}
