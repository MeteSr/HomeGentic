import React, { useState } from "react";
import { X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/Button";
import { sensorService, type SensorDevice, type DeviceSource } from "@/services/sensor";
import { useOAuthDevicePicker, type OAuthPickedDevice } from "@/hooks/useOAuthDevicePicker";
import toast from "react-hot-toast";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  inkLight: V2_COLORS.muted,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
  sans:     V2_FONTS.body,
};

// ─── Tier classification ──────────────────────────────────────────────────────

const TIER_B: DeviceSource[] = ["Ecobee", "HoneywellHome", "LGThinQ", "GESmartHQ"];
const TIER_C: DeviceSource[] = ["EnphaseEnvoy", "TeslaPowerwall"];

const TIER_B_PLATFORM: Record<string, string> = {
  Ecobee:        "ecobee",
  HoneywellHome: "honeywell",
  LGThinQ:       "lgthinq",
  GESmartHQ:     "ge",
};

// ─── Tier A help text ─────────────────────────────────────────────────────────

interface DeviceHelp { format: string; instructions: string }

const DEVICE_ID_HELP: Partial<Record<DeviceSource, DeviceHelp>> = {
  Nest: {
    format:       "projects/{project-id}/devices/{device-id}",
    instructions: "Find your device ID in the Google Home app → Device Settings → Linked Accounts, or in the Google SDM console at console.nest.google.com.",
  },
  MoenFlo: {
    format:       "00000000-0000-0000-0000-000000000000 (UUID)",
    instructions: "Open the Moen Flo app → Settings → Device → copy the Device ID field.",
  },
  RingAlarm: {
    format:       "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (hex string)",
    instructions: "Run `npx ring-client-api ding` and copy the device ID from the console output.",
  },
  Rachio: {
    format:       "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (UUID)",
    instructions: "Log into app.rach.io → Account → Devices → click your controller → copy the UUID from the URL bar.",
  },
  SmartThings: {
    format:       "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (UUID)",
    instructions: "SmartThings app → … (more) → Settings → API Access → copy the Device ID, or from the SmartThings Developer Workspace.",
  },
  HomeAssistant: {
    format:       "entity_id (e.g. sensor.living_room_temp)",
    instructions: "Home Assistant → Settings → Devices & Services → click your device → copy the Entity ID.",
  },
  SolarEdge: {
    format:       "123456 (numeric site ID)",
    instructions: "Log into monitoring.solaredge.com. Your site ID appears in the URL: /p/site/123456/dashboard.",
  },
  Manual: {
    format:       "Any unique identifier you choose",
    instructions: "Enter any code you want to use to track this device, e.g. HOME-SENSOR-01.",
  },
};

// ─── Sources (Tier D removed from this list) ─────────────────────────────────

const SOURCES: { value: DeviceSource; label: string }[] = [
  { value: "Nest",           label: "Google Nest"            },
  { value: "Ecobee",         label: "Ecobee"                 },
  { value: "MoenFlo",        label: "Moen Flo"               },
  { value: "RingAlarm",      label: "Ring Alarm"             },
  { value: "HoneywellHome",  label: "Honeywell Home"         },
  { value: "Rachio",         label: "Rachio Smart Sprinkler" },
  { value: "SmartThings",    label: "Samsung SmartThings"    },
  { value: "HomeAssistant",  label: "Home Assistant"         },
  { value: "SolarEdge",      label: "SolarEdge Solar"        },
  { value: "EnphaseEnvoy",   label: "Enphase IQ Gateway"     },
  { value: "TeslaPowerwall", label: "Tesla Powerwall"        },
  { value: "LGThinQ",        label: "LG ThinQ"               },
  { value: "GESmartHQ",      label: "GE SmartHQ"             },
  { value: "Manual",         label: "Manual Entry"           },
];

const BLANK = { name: "", externalDeviceId: "", source: "Nest" as DeviceSource };

interface Props {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess:  (device: SensorDevice) => void;
  propertyId: string;
}

export function RegisterDeviceModal({ isOpen, onClose, onSuccess, propertyId }: Props) {
  const [form,        setForm]        = useState({ ...BLANK });
  const [loading,     setLoading]     = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);
  const [lanIp,       setLanIp]       = useState("");
  const [pickedDevice, setPickedDevice] = useState<OAuthPickedDevice | null>(null);

  const oAuth = useOAuthDevicePicker();

  if (!isOpen) return null;

  const source = form.source;
  const isTierB = (TIER_B as string[]).includes(source);
  const isTierC = (TIER_C as string[]).includes(source);
  const help    = DEVICE_ID_HELP[source];

  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
      setPickedDevice(null);
      oAuth.reset();
      setShowHelp(false);
    };

  const handlePickDevice = (device: OAuthPickedDevice) => {
    setPickedDevice(device);
    setForm((prev) => ({ ...prev, name: device.name, externalDeviceId: device.id }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const deviceId = isTierC ? lanIp.trim() + ":" + form.externalDeviceId.trim()
                              : form.externalDeviceId.trim();
    if (!form.name.trim() || !form.externalDeviceId.trim()) {
      toast.error("Device name and ID are required");
      return;
    }
    if (isTierC && !lanIp.trim()) {
      toast.error("Local IP address is required");
      return;
    }
    if (!propertyId) {
      toast.error("No property selected");
      return;
    }
    setLoading(true);
    try {
      const device = await sensorService.registerDevice(
        propertyId, deviceId, form.source, form.name.trim(),
      );
      toast.success("Device registered");
      onSuccess(device);
      setForm({ ...BLANK });
      setLanIp("");
      setPickedDevice(null);
      oAuth.reset();
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
    background: V2_COLORS.paper, color: UI.ink, outline: "none",
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
      <div role="dialog" aria-modal="true" aria-label="Register device" style={{
        background: V2_COLORS.paper, width: "100%", maxWidth: "30rem",
        borderRadius: V2_RADIUS.card, padding: "1.75rem",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.1rem", color: UI.ink }}>
            Register Device
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, padding: "0.25rem" }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Device type */}
          <div>
            <label htmlFor="register-device-source" style={labelStyle}>Device Type</label>
            <select id="register-device-source" value={form.source} onChange={set("source")} style={inputStyle}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Device name */}
          <div>
            <label htmlFor="register-device-name" style={labelStyle}>Device Name</label>
            <input
              id="register-device-name"
              type="text" value={form.name} onChange={set("name")}
              placeholder={isTierB && pickedDevice ? pickedDevice.name : "e.g. Basement Water Sensor"}
              style={inputStyle}
            />
          </div>

          {/* ── Tier B: OAuth button + device picker ── */}
          {isTierB && (
            <div>
              {!oAuth.devices.length && !pickedDevice && (
                <>
                  <button
                    type="button"
                    onClick={() => oAuth.start(TIER_B_PLATFORM[source])}
                    disabled={oAuth.loading}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.5rem 1rem", fontFamily: UI.mono, fontSize: "0.72rem",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      background: UI.ink, color: V2_COLORS.paper, border: "none", cursor: "pointer",
                    }}
                  >
                    <ExternalLink size={13} />
                    {oAuth.loading ? "Connecting…" : `Connect ${SOURCES.find((s) => s.value === source)?.label} Account`}
                  </button>
                  {oAuth.error && (
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: V2_COLORS.coralText, marginTop: "0.4rem" }}>
                      {oAuth.error}
                    </p>
                  )}
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.4rem" }}>
                    A popup will open to authorize HomeGentic to read your device list. No data is stored.
                  </p>
                </>
              )}

              {oAuth.devices.length > 0 && !pickedDevice && (
                <div>
                  <label style={labelStyle}>Select Device</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "180px", overflowY: "auto" }}>
                    {oAuth.devices.map((d) => (
                      <button
                        key={d.id} type="button" onClick={() => handlePickDevice(d)}
                        style={{
                          textAlign: "left", padding: "0.6rem 0.75rem",
                          border: `1px solid ${UI.rule}`, background: "transparent",
                          cursor: "pointer", fontFamily: UI.sans, fontSize: "0.825rem",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginLeft: "0.5rem" }}>
                          {d.type} · {d.id}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pickedDevice && (
                <div style={{ border: `1px solid ${UI.rule}`, padding: "0.6rem 0.75rem", background: "#f9f7f3" }}>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.2rem" }}>
                    Selected
                  </p>
                  <p style={{ fontFamily: UI.sans, fontSize: "0.825rem", fontWeight: 500, color: UI.ink }}>
                    {pickedDevice.name}
                  </p>
                  <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                    {pickedDevice.type} · {pickedDevice.id}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setPickedDevice(null); oAuth.reset(); setForm((p) => ({ ...p, name: "", externalDeviceId: "" })); }}
                    style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, background: "none", border: "none", cursor: "pointer", marginTop: "0.4rem", padding: 0 }}
                  >
                    Choose a different device
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tier C: LAN IP + serial ── */}
          {isTierC && (
            <>
              <div>
                <label htmlFor="register-device-lan-ip" style={labelStyle}>Local IP Address</label>
                <input
                  id="register-device-lan-ip"
                  type="text" value={lanIp} onChange={(e) => setLanIp(e.target.value)}
                  placeholder="192.168.1.42"
                  style={inputStyle}
                />
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.3rem" }}>
                  Check your router's device list for the gateway's LAN IP.
                </p>
              </div>
              <div>
                <label htmlFor="register-device-serial" style={labelStyle}>Serial Number</label>
                <input
                  id="register-device-serial"
                  type="text" value={form.externalDeviceId} onChange={set("externalDeviceId")}
                  placeholder={source === "TeslaPowerwall" ? "e.g. 1232100-00-J--T..." : "e.g. 202201..."}
                  style={inputStyle}
                />
                <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.3rem" }}>
                  Found on the hardware sticker on the device.
                </p>
              </div>
            </>
          )}

          {/* ── Tier A: ID field with optional help text ── */}
          {!isTierB && !isTierC && (
            <div>
              <label htmlFor="register-device-external-id" style={labelStyle}>Device / Site ID</label>
              <input
                id="register-device-external-id"
                type="text" value={form.externalDeviceId} onChange={set("externalDeviceId")}
                placeholder={help?.format ?? "e.g. DEVICE-ABC-12345"}
                style={inputStyle}
              />
              {help && (
                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight,
                    background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0", marginTop: "0.2rem",
                  }}
                >
                  {showHelp ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  Where do I find this?
                </button>
              )}
              {showHelp && help && (
                <div style={{
                  background: "#f9f7f3", border: `1px solid ${UI.rule}`,
                  padding: "0.6rem 0.75rem", marginTop: "0.25rem",
                  fontFamily: UI.mono, fontSize: "0.65rem", lineHeight: 1.6, color: UI.inkLight,
                }}>
                  <p style={{ marginBottom: "0.3rem" }}><strong>Format:</strong> {help.format}</p>
                  <p>{help.instructions}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button" onClick={onClose}
              style={{
                fontFamily: UI.mono, fontSize: "0.7rem", letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "0.5rem 1rem",
                background: "none", border: `1px solid ${UI.rule}`, cursor: "pointer", color: UI.inkLight,
              }}
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={loading || (isTierB && !pickedDevice) || (isTierC && (!lanIp.trim() || !form.externalDeviceId.trim()))}
            >
              {loading ? "Registering…" : "Register Device"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
