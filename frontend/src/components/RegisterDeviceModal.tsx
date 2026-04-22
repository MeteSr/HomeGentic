import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/Button";
import { sensorService, type SensorDevice, type DeviceSource } from "@/services/sensor";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
  sans:     FONTS.sans,
};

const SOURCES: { value: DeviceSource; label: string }[] = [
  { value: "Nest",          label: "Google Nest"             },
  { value: "Ecobee",        label: "Ecobee"                  },
  { value: "MoenFlo",       label: "Moen Flo"                },
  { value: "RingAlarm",     label: "Ring Alarm"              },
  { value: "HoneywellHome", label: "Honeywell Home"          },
  { value: "RheemEcoNet",   label: "Rheem EcoNet"            },
  { value: "Sense",         label: "Sense Energy Monitor"    },
  { value: "EmporiaVue",    label: "Emporia Vue"             },
  { value: "Rachio",        label: "Rachio Smart Sprinkler"  },
  { value: "SmartThings",   label: "Samsung SmartThings"     },
  { value: "HomeAssistant", label: "Home Assistant"          },
  { value: "Manual",        label: "Manual Entry"            },
];

const BLANK = {
  name:             "",
  externalDeviceId: "",
  source:           "Nest" as DeviceSource,
};

interface Props {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess:  (device: SensorDevice) => void;
  propertyId: string;
}

export function RegisterDeviceModal({ isOpen, onClose, onSuccess, propertyId }: Props) {
  const [form,    setForm]    = useState({ ...BLANK });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.externalDeviceId.trim()) {
      toast.error("Device name and ID are required");
      return;
    }
    if (!propertyId) {
      toast.error("No property selected");
      return;
    }
    setLoading(true);
    try {
      const device = await sensorService.registerDevice(
        propertyId,
        form.externalDeviceId.trim(),
        form.source,
        form.name.trim(),
      );
      toast.success("Device registered");
      onSuccess(device);
      setForm({ ...BLANK });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to register device");
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
    textTransform: "uppercase", color: UI.inkLight, display: "block", marginBottom: "0.35rem",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    fontFamily: UI.sans, fontSize: "0.875rem", fontWeight: 300,
    padding: "0.5rem 0.75rem", border: `1px solid ${UI.rule}`,
    background: COLORS.white, color: UI.ink, outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(14,14,12,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: COLORS.white, width: "100%", maxWidth: "28rem",
          borderRadius: RADIUS.card, padding: "1.75rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.1rem", color: UI.ink }}>
            Register Device
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, padding: "0.25rem" }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Source */}
          <div>
            <label htmlFor="register-device-source" style={labelStyle}>Device Type</label>
            <select id="register-device-source" value={form.source} onChange={set("source")} style={inputStyle}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Device Name</label>
            <input
              type="text"
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. Basement Water Sensor"
              style={inputStyle}
            />
          </div>

          {/* External ID */}
          <div>
            <label style={labelStyle}>Device / Serial ID</label>
            <input
              type="text"
              value={form.externalDeviceId}
              onChange={set("externalDeviceId")}
              placeholder="e.g. NEST-ABC-12345"
              style={inputStyle}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontFamily: UI.mono, fontSize: "0.7rem", letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "0.5rem 1rem",
                background: "none", border: `1px solid ${UI.rule}`, cursor: "pointer", color: UI.inkLight,
              }}
            >
              Cancel
            </button>
            <Button type="submit" disabled={loading}>
              {loading ? "Registering…" : "Register Device"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
