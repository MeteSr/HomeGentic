import React, { useState } from "react";
import { roomService, type Room as RoomRecord, type UpdateRoomArgs, type AddFixtureArgs } from "@/services/room";
import { type Photo } from "@/services/photo";
import { Button } from "@/components/Button";
import { AddRoomModal } from "@/components/AddRoomModal";
import { COLORS, FONTS, SHADOWS } from "@/theme";
import toast from "react-hot-toast";

const FLOOR_TYPES = ["Hardwood", "Tile", "Carpet", "Laminate", "Vinyl", "Concrete", "Stone", "Other"];

const EMPTY_FIXTURE_FORM: AddFixtureArgs = {
  brand: "",
  model: "",
  serialNumber: "",
  installedDate: "",
  warrantyExpiry: "",
  notes: "",
};

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
  const [savingRoom,     setSavingRoom]     = useState(false);
  const [expandedRoom,   setExpandedRoom]   = useState<string | null>(null);
  const [editingRoom,    setEditingRoom]    = useState<string | null>(null);
  const [editForm,       setEditForm]       = useState<UpdateRoomArgs | null>(null);
  const [addFixtureRoom, setAddFixtureRoom] = useState<string | null>(null);
  const [fixtureForm,    setFixtureForm]    = useState<AddFixtureArgs>({ ...EMPTY_FIXTURE_FORM });
  const [savingFixture,  setSavingFixture]  = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  const handleUpdateRoom = async (id: string) => {
    if (!editForm || !editForm.name.trim()) return;
    setSavingRoom(true);
    try {
      const updated = await roomService.updateRoom(id, editForm);
      onRoomsChange(rooms.map((r) => r.id === id ? updated : r));
      setEditingRoom(null);
      setEditForm(null);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update room");
    } finally {
      setSavingRoom(false);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    try {
      await roomService.deleteRoom(id);
      onRoomsChange(rooms.filter((r) => r.id !== id));
      if (expandedRoom === id) setExpandedRoom(null);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete room");
    }
  };

  const handleAddFixture = async (roomId: string) => {
    setSavingFixture(true);
    try {
      const updated = await roomService.addFixture(roomId, fixtureForm);
      onRoomsChange(rooms.map((r) => r.id === roomId ? updated : r));
      setAddFixtureRoom(null);
      setFixtureForm({ ...EMPTY_FIXTURE_FORM });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add fixture");
    } finally {
      setSavingFixture(false);
    }
  };

  const handleRemoveFixture = async (roomId: string, fixtureId: string) => {
    try {
      const updated = await roomService.removeFixture(roomId, fixtureId);
      onRoomsChange(rooms.map((r) => r.id === roomId ? updated : r));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove fixture");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.625rem",
    fontFamily: FONTS.sans, fontSize: "0.8rem",
    border: `1px solid ${COLORS.rule}`, background: COLORS.white,
    color: COLORS.plum, outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: FONTS.sans, fontSize: "0.6rem",
    letterSpacing: "0.08em", textTransform: "uppercase",
    color: COLORS.plumMid, marginBottom: "0.25rem",
  };

  return (
    <div>
      <AddRoomModal
        isOpen={showAddRoom}
        onClose={() => setShowAddRoom(false)}
        propertyId={propertyId}
        onSuccess={(room) => {
          onRoomsChange([...rooms, room]);
          setExpandedRoom(room.id);
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.85rem", color: COLORS.plumMid, fontWeight: 300 }}>
          Track finishes, paint, and appliances room by room.
        </p>
        <Button size="sm" onClick={() => setShowAddRoom(true)}>+ Add Room</Button>
      </div>

      {rooms.length === 0 && !showAddRoom && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", border: `1px dashed ${COLORS.rule}` }}>
          <p style={{ fontFamily: FONTS.sans, color: COLORS.plumMid, fontSize: "0.875rem", fontWeight: 300 }}>
            No rooms yet. Add your first room to start building your digital twin.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {rooms.map((room) => {
          const isExpanded = expandedRoom === room.id;
          const isEditing  = editingRoom  === room.id;

          return (
            <div key={room.id} style={{ border: `1px solid ${COLORS.rule}`, background: COLORS.white, boxShadow: SHADOWS.card }}>
              {/* Room header */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", cursor: "pointer" }}
                onClick={() => setExpandedRoom(isExpanded ? null : room.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div>
                    <div style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1rem", color: COLORS.plum }}>{room.name}</div>
                    <div style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.06em", color: COLORS.plumMid, marginTop: "0.2rem" }}>
                      {[room.floorType, room.paintColor && `${room.paintColor}${room.paintCode ? ` (${room.paintCode})` : ""}`]
                        .filter(Boolean).join(" · ") || "No finishes recorded"}
                      {room.fixtures.length > 0 && ` · ${room.fixtures.length} fixture${room.fixtures.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditingRoom(room.id); setEditForm({ name: room.name, floorName: room.floorName, floorType: room.floorType, paintColor: room.paintColor, paintBrand: room.paintBrand, paintCode: room.paintCode, notes: room.notes }); setExpandedRoom(room.id); }}
                    style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, background: "none", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem" }}
                  >Edit</button>
                  <button
                    onClick={() => { if (window.confirm(`Delete "${room.name}"?`)) handleDeleteRoom(room.id); }}
                    style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage, background: "none", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem" }}
                  >Delete</button>
                  <span style={{ color: COLORS.plumMid, fontSize: "0.75rem" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: `1px solid ${COLORS.rule}`, padding: "1rem 1.25rem" }}>

                  {isEditing && editForm && (
                    <div style={{ marginBottom: "1.25rem", padding: "1rem", background: COLORS.white, border: `1px solid ${COLORS.rule}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                        <div>
                          <label style={labelStyle}>Room Name *</label>
                          <input style={inputStyle} value={editForm.name}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <label style={labelStyle}>Floor Type</label>
                          <select style={inputStyle} value={editForm.floorType}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, floorType: e.target.value }))}>
                            <option value="">— Select —</option>
                            {FLOOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Paint Color</label>
                          <input style={inputStyle} value={editForm.paintColor}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, paintColor: e.target.value }))} />
                        </div>
                        <div>
                          <label style={labelStyle}>Paint Brand</label>
                          <input style={inputStyle} value={editForm.paintBrand}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, paintBrand: e.target.value }))} />
                        </div>
                        <div>
                          <label style={labelStyle}>Paint Code</label>
                          <input style={inputStyle} value={editForm.paintCode}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, paintCode: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginBottom: "1rem" }}>
                        <label style={labelStyle}>Notes</label>
                        <textarea style={{ ...inputStyle, minHeight: "3.5rem", resize: "vertical" }} value={editForm.notes}
                          onChange={(e) => setEditForm((f) => f && ({ ...f, notes: e.target.value }))} />
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Button size="sm" onClick={() => handleUpdateRoom(room.id)} disabled={savingRoom}>
                          {savingRoom ? "Saving…" : "Save Changes"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingRoom(null); setEditForm(null); }}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {!isEditing && room.notes && (
                    <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.plumMid, fontWeight: 300, marginBottom: "1rem", fontStyle: "italic" }}>
                      {room.notes}
                    </p>
                  )}

                  {/* Photo gallery */}
                  {(() => {
                    const roomPhotos = photosByJob[`ROOM_${room.id}`] ?? [];
                    return (
                      <div style={{ marginBottom: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <span style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>
                            Photos{roomPhotos.length > 0 ? ` (${roomPhotos.length})` : ""}
                          </span>
                          <label style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage, cursor: "pointer" }}>
                            {uploadingPhoto === room.id ? "Uploading…" : "+ Add Photo"}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              disabled={uploadingPhoto === room.id}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingPhoto(room.id);
                                try { await onRoomPhotoUpload(room.id, file); }
                                finally { setUploadingPhoto(null); e.target.value = ""; }
                              }}
                            />
                          </label>
                        </div>
                        {roomPhotos.length > 0 && (
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {roomPhotos.map((photo) => (
                              <img
                                key={photo.id}
                                src={photo.url}
                                alt={photo.description || "Room photo"}
                                style={{ width: "5rem", height: "5rem", objectFit: "cover", border: `1px solid ${COLORS.rule}` }}
                              />
                            ))}
                          </div>
                        )}
                        {roomPhotos.length === 0 && (
                          <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid, fontWeight: 300, fontStyle: "italic" }}>
                            No photos yet.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Fixtures */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>
                        Appliances & Fixtures
                      </span>
                      {addFixtureRoom !== room.id && (
                        <button
                          onClick={() => { setAddFixtureRoom(room.id); setFixtureForm({ ...EMPTY_FIXTURE_FORM }); }}
                          style={{ fontFamily: FONTS.sans, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage, background: "none", border: "none", cursor: "pointer" }}
                        >+ Add Fixture</button>
                      )}
                    </div>

                    {addFixtureRoom === room.id && (
                      <div style={{ border: `1px solid ${COLORS.rule}`, padding: "1rem", marginBottom: "0.75rem", background: COLORS.white }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem", marginBottom: "0.625rem" }}>
                          <div>
                            <label style={labelStyle}>Brand</label>
                            <input style={inputStyle} placeholder="e.g. KitchenAid" value={fixtureForm.brand}
                              onChange={(e) => setFixtureForm((f) => ({ ...f, brand: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Model</label>
                            <input style={inputStyle} placeholder="e.g. KFIS29PBMS" value={fixtureForm.model}
                              onChange={(e) => setFixtureForm((f) => ({ ...f, model: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Serial Number</label>
                            <input style={inputStyle} value={fixtureForm.serialNumber}
                              onChange={(e) => setFixtureForm((f) => ({ ...f, serialNumber: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Installed Date</label>
                            <input style={inputStyle} type="date" value={fixtureForm.installedDate}
                              onChange={(e) => setFixtureForm((f) => ({ ...f, installedDate: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Warranty Expires</label>
                            <input style={inputStyle} type="date" value={fixtureForm.warrantyExpiry}
                              onChange={(e) => setFixtureForm((f) => ({ ...f, warrantyExpiry: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Notes</label>
                            <input style={inputStyle} placeholder="e.g. French door refrigerator" value={fixtureForm.notes}
                              onChange={(e) => setFixtureForm((f) => ({ ...f, notes: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Button size="sm" onClick={() => handleAddFixture(room.id)} disabled={savingFixture}>
                            {savingFixture ? "Saving…" : "Add Fixture"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAddFixtureRoom(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {room.fixtures.length === 0 && addFixtureRoom !== room.id && (
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid, fontWeight: 300, fontStyle: "italic" }}>
                        No fixtures recorded.
                      </p>
                    )}
                    {room.fixtures.map((f) => {
                      const isExpired     = f.warrantyExpiry && new Date(f.warrantyExpiry) < new Date();
                      const expiringSoon  = f.warrantyExpiry && !isExpired && new Date(f.warrantyExpiry) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                      return (
                        <div key={f.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "0.625rem 0", borderBottom: `1px solid ${COLORS.rule}` }}>
                          <div>
                            <div style={{ fontFamily: FONTS.sans, fontWeight: 500, fontSize: "0.825rem", color: COLORS.plum }}>
                              {f.brand} {f.model}
                            </div>
                            <div style={{ fontFamily: FONTS.sans, fontSize: "0.55rem", letterSpacing: "0.06em", color: COLORS.plumMid, marginTop: "0.2rem" }}>
                              {f.serialNumber && `S/N ${f.serialNumber}`}
                              {f.installedDate && ` · Installed ${f.installedDate}`}
                              {f.warrantyExpiry && (
                                <span style={{ color: isExpired ? COLORS.sage : expiringSoon ? "#C94C2E" : COLORS.plumMid }}>
                                  {` · Warranty ${isExpired ? "expired" : "expires"} ${f.warrantyExpiry}`}
                                </span>
                              )}
                            </div>
                            {f.notes && (
                              <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid, fontWeight: 300, marginTop: "0.2rem" }}>
                                {f.notes}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveFixture(room.id, f.id)}
                            style={{ fontFamily: FONTS.sans, fontSize: "0.55rem", letterSpacing: "0.06em", color: COLORS.plumMid, background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginLeft: "1rem" }}
                          >Remove</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
