import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wifi, WifiOff, AlertTriangle, Plus, Trash2, Wrench } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { RegisterDeviceModal } from "@/components/RegisterDeviceModal";
import { usePropertyStore } from "@/store/propertyStore";
import { sensorService, SensorDevice, SensorEvent } from "@/services/sensor";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

function inferServiceType(eventType: string): string {
  if (/water|leak|flood/i.test(eventType)) return "Plumbing";
  if (/hvac|filter|temperature|humidity/i.test(eventType)) return "HVAC";
  return "Other";
}

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

const SOURCES: { value: string; label: string }[] = [
  { value: "Nest",    label: "Google Nest"  },
  { value: "Ecobee",  label: "Ecobee"       },
  { value: "MoenFlo", label: "Moen Flo"     },
  { value: "Manual",  label: "Manual Entry" },
];

export default function SensorPage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [devices,       setDevices]       = useState<SensorDevice[]>([]);
  const [alerts,        setAlerts]        = useState<SensorEvent[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);

  // Pick the first property by default
  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(String(properties[0].id));
    }
  }, [properties]);

  useEffect(() => {
    if (!selectedPropertyId) return;
    setLoading(true);
    Promise.all([
      sensorService.getDevicesForProperty(selectedPropertyId),
      sensorService.getPendingAlerts(selectedPropertyId),
    ]).then(([devs, alts]) => {
      setDevices(devs);
      setAlerts(alts);
    }).catch((e) => console.error("[SensorPage] load failed:", e)).finally(() => setLoading(false));
  }, [selectedPropertyId]);

  const handleDeactivate = async (deviceId: string) => {
    try {
      await sensorService.deactivateDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      toast.success("Device removed");
    } catch {
      toast.error("Could not remove device");
    }
  };

  return (
    <Layout>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
            IoT Gateway
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1 }}>
              Smart Home Sensors
            </h1>
            <Button icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
              Register Device
            </Button>
          </div>
        </div>

        {/* Property selector */}
        {properties.length > 1 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              style={{
                fontFamily: UI.mono, fontSize: "0.75rem", padding: "0.5rem 0.75rem",
                border: `1px solid ${UI.rule}`, background: COLORS.white, color: UI.ink, cursor: "pointer",
              }}
            >
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{p.address}</option>
              ))}
            </select>
          </div>
        )}

        {/* Stats bar */}
        {(devices.length > 0 || alerts.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Active Devices", value: devices.filter((d) => d.isActive).length },
              { label: "Active Alerts",  value: alerts.length,                             accent: alerts.length > 0 ? UI.rust : undefined },
              { label: "Auto-Created Jobs", value: alerts.filter((a) => a.jobId).length,   accent: alerts.filter((a) => a.jobId).length > 0 ? COLORS.plumMid : undefined },
            ].map((stat) => (
              <div key={stat.label} style={{ background: COLORS.white, padding: "0.875rem 1.25rem", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.25rem" }}>{stat.label}</p>
                <p style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: stat.accent ?? UI.ink }}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.75rem" }}>
              Active Alerts
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {alerts.map((evt) => (
                <div key={evt.id} style={{
                  background: COLORS.white, padding: "1rem 1.25rem",
                  display: "flex", alignItems: "center", gap: "1rem",
                  borderLeft: `3px solid ${sensorService.severityColor(evt.severity)}`,
                  borderRadius: RADIUS.card, boxShadow: SHADOWS.card,
                }}>
                  <AlertTriangle size={16} color={sensorService.severityColor(evt.severity)} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500, fontSize: "0.875rem", marginBottom: "0.125rem" }}>
                      {sensorService.eventLabel(evt.eventType)}
                    </p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.06em" }}>
                      {evt.value !== 0 ? `${evt.value} ${evt.unit} · ` : ""}
                      {new Date(evt.timestamp).toLocaleString()}
                      {evt.jobId && ` · Job #${evt.jobId} auto-created`}
                    </p>
                  </div>
                  <Badge variant={evt.severity === "Critical" ? "error" : "warning"}>{evt.severity}</Badge>
                  {evt.severity === "Critical" && !evt.jobId && (
                    <button
                      onClick={() => navigate("/jobs/new", { state: { prefill: { serviceType: inferServiceType(evt.eventType) } } })}
                      title="Log a job for this alert"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.75rem", background: UI.rust, color: COLORS.white, border: "none", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 }}
                    >
                      <Wrench size={11} /> Log Job
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Devices */}
        <div>
          <h2 style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.75rem" }}>
            Registered Devices
          </h2>

          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
              <div className="spinner-lg" />
            </div>
          )}

          {!loading && devices.length === 0 && (
            <div style={{ border: `1px dashed ${UI.rule}`, padding: "3rem", textAlign: "center" }}>
              <Wifi size={36} color={UI.rule} style={{ margin: "0 auto 1rem" }} />
              <p style={{ fontFamily: UI.serif, fontWeight: 700, marginBottom: "0.375rem" }}>No devices registered</p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight, marginBottom: "1.25rem" }}>
                Connect a Nest, Ecobee, or Moen Flo device to automatically log critical home events.
              </p>
              <Button icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
                Register Your First Device
              </Button>
            </div>
          )}

          {devices.length > 0 && (
            <div style={{ border: `1px solid ${UI.rule}` }}>
              {devices.map((device, i) => (
                <div key={device.id} style={{
                  display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.25rem", background: COLORS.white,
                  borderBottom: i < devices.length - 1 ? `1px solid ${UI.rule}` : "none",
                }}>
                  {device.isActive
                    ? <Wifi size={16} color={COLORS.sage} style={{ flexShrink: 0 }} />
                    : <WifiOff size={16} color={UI.rule} style={{ flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500, fontSize: "0.875rem", marginBottom: "0.125rem" }}>{device.name}</p>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.06em" }}>
                      {SOURCES.find((s) => s.value === device.source)?.label ?? device.source} · {device.externalDeviceId}
                    </p>
                  </div>
                  <Badge variant={device.isActive ? "success" : "default"} size="sm">
                    {device.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <button
                    onClick={() => handleDeactivate(device.id)}
                    title="Remove device"
                    style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight, padding: "0.25rem" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info callout */}
        <div style={{ marginTop: "2rem", border: `1px solid ${UI.rule}`, padding: "1rem 1.25rem", background: COLORS.white }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5rem", color: UI.inkLight }}>
            How it works
          </p>
          <p style={{ fontSize: "0.8rem", fontWeight: 300, lineHeight: 1.6, color: UI.inkLight }}>
            Your IoT gateway forwards events from Nest, Ecobee, and Moen Flo to HomeGentic.
            Critical events — water leaks, HVAC faults, pipe-freeze risk — automatically open a pending job
            on your property record so nothing falls through the cracks.
          </p>
        </div>

      </div>

      <RegisterDeviceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={(device) => setDevices((prev) => [...prev, device])}
        propertyId={selectedPropertyId}
      />
    </Layout>
  );
}
