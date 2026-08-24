import React, { useState } from "react";
import { roomService, type Room as RoomRecord, type UpdateRoomArgs, type AddFixtureArgs } from "@/services/room";
import { type Photo } from "@/services/photo";
import { Button } from "@/components/Button";
import { AddRoomModal } from "@/components/AddRoomModal";
import { V2_COLORS, V2_FONTS } from "@/theme";
import toast from "react-hot-toast";

const C = V2_COLORS;
const F = V2_FONTS;

const FLOOR_TYPES = ["Hardwood", "Tile", "Carpet", "Laminate", "Vinyl", "Concrete", "Stone", "Other"];

const EMPTY_FIXTURE_FORM: AddFixtureArgs = {
  brand: "", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
};

function RoomCard({
  room,
  onEdit,
  onDelete,
  onAddFixture,
}: {
  room:        RoomRecord;
  onEdit:      (id: string) => void;
  onDelete:    (id: string) => void;
  onAddFixture:(id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const receipted = room.fixtures.filter(f => f.warrantyExpiry || f.installedDate).length;
  const finishCount = (room.floorType ? 1 : 0) + (room.paintColor ? 1 : 0) + room.fixtures.length;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        background: "#fff",
        padding: "18px 20px",
        position: "relative",
        transition: "box-shadow 0.15s",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: F.display, fontSize: 17, fontWeight: 800, color: C.ink }}>
              {room.name}
            </span>
            {receipted > 0 && (
              <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.blue, background: C.vbadge, borderRadius: 4, padding: "2px 7px" }}>
                {receipted} RECEIPTED
              </span>
            )}
          </div>
          {(room as any).sqft && (
            <div style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
              {(room as any).sqft} SQ FT
            </div>
          )}
        </div>
        <button
          onClick={() => onEdit(room.id)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontFamily: F.body, fontSize: 12, color: C.muted, cursor: "pointer" }}
        >
          ›
        </button>
      </div>

      {/* Flooring */}
      {room.floorType && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            FLOORING
          </div>
          <div style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink }}>
            {room.floorName || room.floorType}
          </div>
          {room.paintCode && (
            <div style={{ fontFamily: F.body, fontSize: 12, color: C.blue }}>
              {room.paintCode}
            </div>
          )}
        </div>
      )}

      {/* Wall paint */}
      {room.paintColor && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            WALL PAINT
          </div>
          <div style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink }}>
            {room.paintBrand ? `${room.paintBrand} ${room.paintColor}` : room.paintColor}
          </div>
          {room.paintCode && !room.floorType && (
            <div style={{ fontFamily: F.body, fontSize: 12, color: C.blue }}>
              {room.paintCode}
            </div>
          )}
        </div>
      )}

      {/* Fixtures / appliances */}
      {room.fixtures.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            APPLIANCE
          </div>
          {room.fixtures.slice(0, 1).map(f => (
            <div key={f.id}>
              <div style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink }}>
                {f.brand} {f.model}
              </div>
              {f.notes && (
                <div style={{ fontFamily: F.body, fontSize: 12, color: C.blue }}>
                  {f.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>
          {finishCount} finish{finishCount !== 1 ? "es" : ""} recorded
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onAddFixture(room.id)}
            style={{ fontFamily: F.body, fontSize: 12, fontWeight: 500, color: C.blue, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            + Add
          </button>
          <button
            onClick={() => { if (window.confirm(`Delete "${room.name}"?`)) onDelete(room.id); }}
            style={{ fontFamily: F.body, fontSize: 12, color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit drawer ────────────────────────────────────────────────────────────────

function EditRoomDrawer({
  room,
  onSave,
  onClose,
}: {
  room:    RoomRecord;
  onSave:  (id: string, args: UpdateRoomArgs) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<UpdateRoomArgs>({
    name:       room.name,
    floorName:  room.floorName,
    floorType:  room.floorType,
    paintColor: room.paintColor,
    paintBrand: room.paintBrand,
    paintCode:  room.paintCode,
    notes:      room.notes,
  });
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px",
    fontFamily: F.body, fontSize: 13,
    border: `1px solid ${C.border}`, borderRadius: 8, outline: "none",
    background: "#fff", color: C.ink,
    boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontFamily: F.mono, fontSize: 9, fontWeight: 700,
    letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 4,
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(room.id, form); onClose(); }
    catch (err: any) { toast.error(err.message ?? "Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: F.display, fontSize: 18, fontWeight: 800, color: C.ink, marginBottom: 20 }}>Edit {room.name}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Room name *</label>
            <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Floor type</label>
            <select style={inp} value={form.floorType} onChange={e => setForm(f => ({ ...f, floorType: e.target.value }))}>
              <option value="">— Select —</option>
              {FLOOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Floor name / product</label>
            <input style={inp} placeholder="e.g. White oak, site-finished" value={form.floorName} onChange={e => setForm(f => ({ ...f, floorName: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Paint color</label>
            <input style={inp} value={form.paintColor} onChange={e => setForm(f => ({ ...f, paintColor: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Paint brand</label>
            <input style={inp} value={form.paintBrand} onChange={e => setForm(f => ({ ...f, paintBrand: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Paint code / finish</label>
            <input style={inp} placeholder="e.g. SW 7008 · eggshell" value={form.paintCode} onChange={e => setForm(f => ({ ...f, paintCode: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, minHeight: 64, resize: "vertical" }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ flex: 1, fontFamily: F.body, fontSize: 14, fontWeight: 700, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "11px", cursor: "pointer", opacity: saving || !form.name.trim() ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose} style={{ fontFamily: F.body, fontSize: 14, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 100, padding: "11px 20px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add fixture drawer ─────────────────────────────────────────────────────────

function AddFixtureDrawer({ roomId, onSave, onClose }: { roomId: string; onSave: (id: string, args: AddFixtureArgs) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<AddFixtureArgs>({ ...EMPTY_FIXTURE_FORM });
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px",
    fontFamily: F.body, fontSize: 13,
    border: `1px solid ${C.border}`, borderRadius: 8, outline: "none",
    background: "#fff", color: C.ink, boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontFamily: F.mono, fontSize: 9, fontWeight: 700,
    letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 4,
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(roomId, form); onClose(); }
    catch (err: any) { toast.error(err.message ?? "Failed to add"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: F.display, fontSize: 18, fontWeight: 800, color: C.ink, marginBottom: 20 }}>Add Appliance / Fixture</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={lbl}>Brand</label>
            <input style={inp} placeholder="e.g. Rheem" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Model</label>
            <input style={inp} placeholder="e.g. XE50T10H45U0" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Serial number</label>
            <input style={inp} value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Installed date</label>
            <input style={inp} type="date" value={form.installedDate} onChange={e => setForm(f => ({ ...f, installedDate: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Warranty expires</label>
            <input style={inp} type="date" value={form.warrantyExpiry} onChange={e => setForm(f => ({ ...f, warrantyExpiry: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Notes / description</label>
            <input style={inp} placeholder="e.g. 50 gal" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, fontFamily: F.body, fontSize: 14, fontWeight: 700, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "11px", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Add fixture"}
          </button>
          <button onClick={onClose} style={{ fontFamily: F.body, fontSize: 14, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 100, padding: "11px 20px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function RoomsTab({
  propertyId,
  rooms,
  onRoomsChange,
  photosByJob,
  onRoomPhotoUpload,
}: {
  propertyId:        string;
  rooms:             RoomRecord[];
  onRoomsChange:     (rooms: RoomRecord[]) => void;
  photosByJob:       Record<string, Photo[]>;
  onRoomPhotoUpload: (roomId: string, file: File) => Promise<void>;
}) {
  const [showAddRoom,    setShowAddRoom]    = useState(false);
  const [editingRoom,    setEditingRoom]    = useState<RoomRecord | null>(null);
  const [addFixtureRoom, setAddFixtureRoom] = useState<string | null>(null);

  const totalFinishes = rooms.reduce((acc, r) => {
    return acc + (r.floorType ? 1 : 0) + (r.paintColor ? 1 : 0) + r.fixtures.length;
  }, 0);
  const totalReceipted = rooms.reduce((acc, r) => {
    return acc + r.fixtures.filter(f => f.warrantyExpiry || f.installedDate).length;
  }, 0);
  const totalSqft = rooms.reduce((acc, r) => acc + ((r as any).sqft ?? 0), 0);

  const handleUpdateRoom = async (id: string, args: UpdateRoomArgs) => {
    const updated = await roomService.updateRoom(id, args);
    onRoomsChange(rooms.map(r => r.id === id ? updated : r));
  };

  const handleDeleteRoom = async (id: string) => {
    try {
      await roomService.deleteRoom(id);
      onRoomsChange(rooms.filter(r => r.id !== id));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete room");
    }
  };

  const handleAddFixture = async (roomId: string, args: AddFixtureArgs) => {
    const updated = await roomService.addFixture(roomId, args);
    onRoomsChange(rooms.map(r => r.id === roomId ? updated : r));
  };

  return (
    <div>
      <AddRoomModal
        isOpen={showAddRoom}
        onClose={() => setShowAddRoom(false)}
        propertyId={propertyId}
        onSuccess={(room) => onRoomsChange([...rooms, room])}
      />

      {editingRoom && (
        <EditRoomDrawer
          room={editingRoom}
          onSave={handleUpdateRoom}
          onClose={() => setEditingRoom(null)}
        />
      )}

      {addFixtureRoom && (
        <AddFixtureDrawer
          roomId={addFixtureRoom}
          onSave={handleAddFixture}
          onClose={() => setAddFixtureRoom(null)}
        />
      )}

      {/* Stats row */}
      {rooms.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          {[
            { label: "ROOMS",         value: String(rooms.length) },
            { label: "FINISHES",      value: String(totalFinishes) },
            { label: "RECEIPTED",     value: `${totalReceipted} of ${totalFinishes}` },
            { label: "RECORDED AREA", value: totalSqft > 0 ? `${totalSqft.toLocaleString()} sq ft` : "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "#fff", padding: "14px 16px" }}>
              <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 900, color: C.ink }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add room header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>
          What the house is made of, room by room. Paint codes, flooring, fixtures and appliances, so an exact match is one lookup away years later.
        </p>
        <button
          onClick={() => setShowAddRoom(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.body, fontSize: 14, fontWeight: 600, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "10px 18px", cursor: "pointer", flexShrink: 0, marginLeft: 16 }}
        >
          + Add room
        </button>
      </div>

      {rooms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", border: `1px dashed ${C.border}`, borderRadius: 12 }}>
          <p style={{ fontFamily: F.body, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No rooms yet</p>
          <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>
            Add rooms to track your finishes, paint codes, and appliances.
          </p>
          <button onClick={() => setShowAddRoom(true)} style={{ fontFamily: F.body, fontSize: 14, fontWeight: 600, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer" }}>
            + Add your first room
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              onEdit={id => setEditingRoom(rooms.find(r => r.id === id) ?? null)}
              onDelete={handleDeleteRoom}
              onAddFixture={id => setAddFixtureRoom(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
