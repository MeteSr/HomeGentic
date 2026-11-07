import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, SectionHeader, hudButtonStyle, hudInputStyle } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { errorMessage } from "@/services/candid";
import { photoService, type Photo } from "@/services/photo";
import { downloadText } from "@/utils/csv";
import { formatCents, formatIsoDate } from "@/utils/format";
import {
  inventoryService,
  inventoryCsv,
  inventoryIdOfPhoto,
  inventoryPhotoDescription,
  inventoryPhotoJobId,
  inventoryTotalCents,
  isReceipt,
  itemTotalCents,
  groupByRoom,
  validateItem,
  EMPTY_ITEM,
  INVENTORY_CATEGORIES,
  type InventoryInput,
  type InventoryItem,
  type RoomRef,
} from "@/services/inventory";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const small: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };
const ink: React.CSSProperties = { fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)", margin: 0 };
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "1rem",
};

/** The file name a stored description ends with, "… (name.pdf)". */
const fileNameOf = (description: string) => /\(([^()]*)\)$/.exec(description)?.[1] ?? "file";

// ─── Form ─────────────────────────────────────────────────────────────────────

interface Form {
  name: string;
  roomId: string;
  category: string;
  quantity: string;
  value: string;
  purchaseDate: string;
  serialNumber: string;
  notes: string;
}

function toForm(i: InventoryInput): Form {
  return {
    name: i.name,
    roomId: i.roomId ?? "",
    category: i.category,
    quantity: String(i.quantity),
    value: i.valueCents === null ? "" : (i.valueCents / 100).toFixed(2),
    purchaseDate: i.purchaseDate,
    serialNumber: i.serialNumber,
    notes: i.notes,
  };
}

/** The form as canister input, or the reason it can't be. */
function fromForm(f: Form): InventoryInput | string {
  const raw = f.value.replace(/[$,\s]/g, "");
  let valueCents: number | null = null;
  if (raw !== "") {
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "Enter the value in dollars";
    valueCents = Math.round(Number(raw) * 100);
  }
  const q = f.quantity.trim();
  const input: InventoryInput = {
    roomId: f.roomId || null,
    name: f.name.trim(),
    category: f.category.trim(),
    quantity: /^\d+$/.test(q) ? Number(q) : NaN,
    valueCents,
    purchaseDate: f.purchaseDate,
    serialNumber: f.serialNumber.trim(),
    notes: f.notes.trim(),
  };
  return validateItem(input) ?? input;
}

function ItemForm({
  initial,
  rooms,
  onSave,
  onCancel,
}: {
  initial: InventoryInput;
  rooms: RoomRef[];
  onSave: (input: InventoryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const categories = useId();
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const out = fromForm(form);
    if (typeof out === "string") {
      setProblem(out);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await onSave(out);
    } finally {
      setSaving(false);
    }
  };

  const input = (label: string, k: keyof Form, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label style={field}>
      <span style={labelText}>{label}</span>
      <input aria-label={label} value={form[k]} onChange={set(k)} style={hudInputStyle} {...props} />
    </label>
  );

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={grid}>
        {input("Item", "name", { type: "text", maxLength: 100, placeholder: "65-inch TV" })}
        <label style={field}>
          <span style={labelText}>Room</span>
          <select aria-label="Room" value={form.roomId} onChange={set("roomId")} style={hudInputStyle}>
            <option value="">No room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {input("Category", "category", { type: "text", maxLength: 40, list: categories })}
        <datalist id={categories}>
          {INVENTORY_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {input("Quantity", "quantity", { type: "text", inputMode: "numeric" })}
        {input("Value each ($)", "value", {
          type: "text",
          inputMode: "decimal",
          placeholder: "What it would cost to replace",
        })}
        {input("Purchase date", "purchaseDate", { type: "date" })}
        {input("Serial number", "serialNumber", { type: "text", maxLength: 100 })}
      </div>
      <label style={field}>
        <span style={labelText}>Notes</span>
        <textarea
          aria-label="Notes"
          value={form.notes}
          onChange={set("notes")}
          maxLength={500}
          rows={2}
          placeholder="Model, where you bought it, anything that helps identify it"
          style={{ ...hudInputStyle, resize: "vertical" }}
        />
      </label>
      {problem && (
        <p role="alert" style={{ ...small, color: "var(--hg-bad)" }}>
          {problem}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
          {saving ? "Saving…" : "Save item"}
        </Button>
        <Button type="button" onClick={onCancel} style={hudButtonStyle("ghost")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── One item ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  rooms,
  canEdit,
  photos,
  onChange,
  onDeleted,
  onPhoto,
}: {
  item: InventoryItem;
  rooms: RoomRef[];
  canEdit: boolean;
  photos: Photo[];
  onChange: (i: InventoryItem) => void;
  onDeleted: (id: string) => void;
  onPhoto: (p: Photo) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pictures = photos.filter((p) => !isReceipt(p));
  const receipts = photos.filter(isReceipt);
  const meta = [
    item.category,
    item.purchaseDate ? `Bought ${formatIsoDate(item.purchaseDate)}` : "",
    item.serialNumber ? `Serial ${item.serialNumber}` : "",
  ].filter(Boolean);
  const value =
    item.valueCents === null
      ? "No value entered"
      : item.quantity > 1
        ? `${item.quantity} × ${formatCents(item.valueCents)} = ${formatCents(itemTotalCents(item))}`
        : formatCents(item.valueCents);

  const save = async (input: InventoryInput) => {
    try {
      onChange(await inventoryService.update(item.id, input));
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the item"));
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await inventoryService.remove(item.id);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the item"));
      setBusy(false);
      return;
    }
    const results = await Promise.allSettled(photos.map((p) => photoService.deletePhoto(p.id)));
    const left = results.filter((r) => r.status === "rejected").length;
    if (left > 0)
      toast.error(
        `Item deleted, but ${left} ${left === 1 ? "photo or receipt" : "photos or receipts"} couldn't be removed. ${left === 1 ? "It stays" : "They stay"} with the home's photos.`,
      );
    onDeleted(item.id);
  };

  const upload = (kind: "photo" | "receipt") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const ref = kind === "photo" ? photoRef : receiptRef;
    if (ref.current) ref.current.value = "";
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        onPhoto(
          await photoService.upload(
            file,
            inventoryPhotoJobId(item.id),
            item.propertyId,
            "PostConstruction",
            inventoryPhotoDescription(kind, item.name, file.name),
          ),
        );
      } catch (err) {
        toast.error(errorMessage(err, `Couldn't upload ${file.name}`));
      }
    }
    setUploading(false);
  };

  if (editing) {
    return (
      <li style={{ borderTop: "1px solid var(--hg-line)", padding: "0.875rem 0" }}>
        <ItemForm initial={item} rooms={rooms} onSave={save} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li style={{ borderTop: "1px solid var(--hg-line)", padding: "0.875rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ ...ink, fontWeight: 700 }}>{item.name}</p>
          {meta.length > 0 && <p style={{ ...small, marginTop: 2 }}>{meta.join(" · ")}</p>}
          {item.notes && <p style={{ ...small, marginTop: 2, whiteSpace: "pre-wrap" }}>{item.notes}</p>}
        </div>
        <p style={{ ...(item.valueCents === null ? small : ink), whiteSpace: "nowrap" }}>{value}</p>
      </div>

      {(pictures.length > 0 || receipts.length > 0) && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.625rem", alignItems: "center" }}>
          {pictures.map((p) =>
            p.url ? (
              <img
                key={p.id}
                src={p.url}
                alt={p.description}
                style={{ width: 88, height: 66, objectFit: "cover", borderRadius: 6, display: "block" }}
              />
            ) : null,
          )}
          {receipts.map((p) => (
            <a
              key={p.id}
              href={p.url || undefined}
              target="_blank"
              rel="noreferrer"
              style={{ ...small, color: "var(--hg-blue)", textDecoration: "underline" }}
            >
              Receipt: {fileNameOf(p.description)}
            </a>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.625rem", alignItems: "center" }}>
          {confirmDelete ? (
            <>
              <span style={ink}>Delete this item and its photos and receipts? This can't be undone.</span>
              <Button onClick={() => void remove()} disabled={busy} style={hudButtonStyle("danger")}>
                Yes, delete
              </Button>
              <Button onClick={() => setConfirmDelete(false)} style={hudButtonStyle("ghost")}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                aria-label={`Edit ${item.name}`}
                onClick={() => setEditing(true)}
                style={hudButtonStyle("outline")}
              >
                Edit
              </Button>
              <label style={{ ...hudButtonStyle("outline"), cursor: uploading ? "wait" : "pointer" }}>
                {uploading ? "Uploading…" : "Add photos"}
                <input
                  ref={photoRef}
                  aria-label={`Add photos of ${item.name}`}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={upload("photo")}
                  style={{ display: "none" }}
                />
              </label>
              <label style={{ ...hudButtonStyle("outline"), cursor: uploading ? "wait" : "pointer" }}>
                Add receipt
                <input
                  ref={receiptRef}
                  aria-label={`Add a receipt for ${item.name}`}
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploading}
                  onChange={upload("receipt")}
                  style={{ display: "none" }}
                />
              </label>
              <Button
                aria-label={`Delete ${item.name}`}
                onClick={() => setConfirmDelete(true)}
                style={hudButtonStyle("ghost")}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Inventory ────────────────────────────────────────────────────────────────

/** One room's items, labelled by the room. */
function RoomSection({ label, children, subtotal }: { label: string; subtotal: number; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
        <h3 id={headingId} style={{ ...ink, fontSize: "0.9375rem", fontWeight: 700 }}>
          {label}
        </h3>
        <span style={small}>{formatCents(subtotal)}</span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0.375rem 0 0" }}>{children}</ul>
    </section>
  );
}

/**
 * #711 contents inventory: what's in the home, room by room, with value,
 * photos and receipts, to put a claim for belongings together.
 */
export function ContentsInventory({
  propertyId,
  canEdit,
  rooms = [],
  propertyPhotos = [],
}: {
  propertyId: string;
  canEdit: boolean;
  rooms?: RoomRef[];
  /** The home's photos; an item's photos and receipts are among them. */
  propertyPhotos?: Photo[];
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [adding, setAdding] = useState(false);
  const [uploaded, setUploaded] = useState<Photo[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  const load = useCallback(() => {
    setState("loading");
    inventoryService
      .list(propertyId)
      .then((list) => {
        setItems(list);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId]);

  useEffect(load, [load]);

  const photosOf = (id: string) =>
    [...propertyPhotos, ...uploaded]
      .filter((p) => inventoryIdOfPhoto(p) === id && !removed.has(p.id))
      .sort((a, b) => a.createdAt - b.createdAt);

  const add = async (input: InventoryInput) => {
    try {
      const i = await inventoryService.add(propertyId, input);
      setItems((prev) => [...prev, i]);
      setAdding(false);
      toast.success("Item added");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the item"));
    }
  };

  const deleted = (id: string) => {
    setRemoved((prev) => new Set([...prev, ...photosOf(id).map((p) => p.id)]));
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const valued = items.filter((i) => i.valueCents !== null).length;
  const groups = groupByRoom(items, rooms);

  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Contents inventory"
        sub="List what's in the home, room by room, with what each thing would cost to replace, so a claim for lost or damaged belongings is quicker to put together. This is your own list. HomeGentic doesn't appraise anything or send it to your insurer."
      />
      {state === "loading" && <p style={small}>Loading the inventory…</p>}
      {state === "error" && <LoadError what="your inventory" onRetry={load} compact />}
      {state === "ready" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {items.length === 0 ? (
            <p style={small}>Nothing listed yet.</p>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ ...ink, fontWeight: 700 }}>
                  {items.length} {items.length === 1 ? "item" : "items"} · {formatCents(inventoryTotalCents(items))}{" "}
                  listed
                </p>
                {valued < items.length && (
                  <p style={{ ...small, marginTop: 2 }}>
                    {valued} of {items.length} items have a value. Add the rest to get a full total.
                  </p>
                )}
              </div>
              <Button
                onClick={() => downloadText(inventoryCsv(items, rooms), "home-inventory.csv")}
                style={hudButtonStyle("outline")}
              >
                Download CSV
              </Button>
            </div>
          )}

          {groups.map((g) => (
            <RoomSection key={g.roomId ?? "none"} label={g.label} subtotal={inventoryTotalCents(g.items)}>
              {g.items.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  rooms={rooms}
                  canEdit={canEdit}
                  photos={photosOf(i.id)}
                  onChange={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                  onDeleted={deleted}
                  onPhoto={(p) => setUploaded((prev) => [...prev, p])}
                />
              ))}
            </RoomSection>
          ))}

          {canEdit &&
            (adding ? (
              <div style={{ border: "1px solid var(--hg-line)", borderRadius: 12, padding: "1.25rem" }}>
                <ItemForm initial={EMPTY_ITEM} rooms={rooms} onSave={add} onCancel={() => setAdding(false)} />
              </div>
            ) : (
              <div>
                <Button onClick={() => setAdding(true)} style={hudButtonStyle("outline")}>
                  Add an item
                </Button>
              </div>
            ))}
          {canEdit && (
            <p style={{ ...small, fontSize: "0.75rem" }}>
              Photos and receipts count toward your plan's photo limits. Rooms come from the Rooms tab.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
