import React, { useState, useEffect } from "react";
import { X, Home } from "lucide-react";
import { Button } from "./Button";
import { roomService, type Room, type CreateRoomArgs } from "@/services/room";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const FLOOR_TYPES = [
  "Hardwood", "Tile", "Carpet", "Laminate", "Vinyl", "Concrete", "Stone", "Other",
];

const EMPTY_FORM: Omit<CreateRoomArgs, "propertyId"> = {
  name:       "",
  floorType:  "",
  paintColor: "",
  paintBrand: "",
  paintCode:  "",
  notes:      "",
};

interface AddRoomModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  onSuccess:   (room: Room) => void;
  propertyId:  string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.625rem",
  fontFamily: FONTS.sans, fontSize: "0.8rem",
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.white, color: COLORS.plum, outline: "none",
  borderRadius: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: FONTS.sans, fontSize: "0.75rem",
  fontWeight: 600,
  color: COLORS.plumMid, marginBottom: "0.25rem",
};

export function AddRoomModal({ isOpen, onClose, onSuccess, propertyId }: AddRoomModalProps) {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY_FORM);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Room name is required"); return; }
    setSaving(true);
    try {
      const room = await roomService.createRoom({ ...form, propertyId });
      toast.success(`${room.name} added`);
      onSuccess(room);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create room");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(46,37,64,0.5)",
        zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.white,
          borderRadius: RADIUS.card,
          boxShadow: SHADOWS.modal,
          width: "100%",
          maxWidth: "32rem",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          borderBottom: `1px solid ${COLORS.rule}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <Home size={15} color={COLORS.sage} />
            <div>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.7rem", fontWeight: 600, color: COLORS.sage, marginBottom: "0.2rem" }}>
                Room Digital Twin
              </p>
              <h2 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: COLORS.plum }}>
                Add Room
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Room name — full width */}
          <div>
            <label style={labelStyle}>Room Name *</label>
            <input
              style={inputStyle}
              placeholder="e.g. Kitchen, Master Bedroom"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </div>

          {/* Floor + paint row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Floor Type</label>
              <select
                style={inputStyle}
                value={form.floorType}
                onChange={(e) => set("floorType", e.target.value)}
              >
                <option value="">— Select —</option>
                {FLOOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Paint Color</label>
              <input
                style={inputStyle}
                placeholder="e.g. Agreeable Gray"
                value={form.paintColor}
                onChange={(e) => set("paintColor", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Paint Brand</label>
              <input
                style={inputStyle}
                placeholder="e.g. Sherwin-Williams"
                value={form.paintBrand}
                onChange={(e) => set("paintBrand", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Paint Code</label>
              <input
                style={inputStyle}
                placeholder="e.g. SW 7029"
                value={form.paintCode}
                onChange={(e) => set("paintCode", e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
              placeholder="Anything useful to remember about this room…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: "0.625rem", justifyContent: "flex-end",
          padding: "1rem 1.5rem",
          borderTop: `1px solid ${COLORS.rule}`,
          flexShrink: 0,
        }}>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave} disabled={!form.name.trim()}>
            Save Room
          </Button>
        </div>
      </div>
    </div>
  );
}
