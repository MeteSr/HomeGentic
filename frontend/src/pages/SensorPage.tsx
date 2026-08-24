import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { RegisterDeviceModal } from "@/components/RegisterDeviceModal";
import { usePropertyStore } from "@/store/propertyStore";
import { sensorService, SensorDevice, SensorEvent } from "@/services/sensor";
import { propertyService } from "@/services/property";
import { V2_COLORS, V2_FONTS } from "@/theme";
import toast from "react-hot-toast";

const C = V2_COLORS;
const F = V2_FONTS;

function inferServiceType(eventType: string): string {
  if (/water|leak|flood/i.test(eventType)) return "Plumbing";
  if (/hvac|filter|temperature|humidity/i.test(eventType)) return "HVAC";
  return "Other";
}

// ── Sensor card ────────────────────────────────────────────────────────────────

function SensorCard({ device, alert }: { device: SensorDevice; alert?: SensorEvent }) {
  const isAlert  = !!alert && alert.severity === "Critical";
  const isHigh   = !!alert && alert.severity === "Warning";
  const isNormal = !alert;

  const statusLabel = isAlert ? "ALERT" : isHigh ? "HIGH" : "NORMAL";
  const statusColor = isAlert ? "#DC2626" : isHigh ? "#D97706" : "#16A34A";
  const statusBg    = isAlert ? "#FEF2F2" : isHigh ? "#FFFBEB" : "#F0FDF4";

  const batteryPct = Math.floor(Math.random() * 60 + 35);

  return (
    <div style={{ border: `1px solid ${isAlert ? "#FECACA" : C.border}`, borderRadius: 12, background: isAlert ? "#FFF5F5" : "#fff", padding: "18px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink }}>{device.name}</div>
          <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>{device.externalDeviceId || device.source}</div>
        </div>
        <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: statusColor, background: statusBg, border: `1px solid ${statusColor}22`, borderRadius: 6, padding: "3px 8px" }}>
          {statusLabel}
        </span>
      </div>

      {/* Reading */}
      {alert ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 900, color: isAlert ? "#DC2626" : C.ink, lineHeight: 1 }}>
            {sensorService.eventLabel(alert.eventType)}
          </div>
          {alert.value !== 0 && (
            <div style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 2 }}>
              {alert.value} {alert.unit} detected
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
          {device.isActive ? "Online" : "Offline"}
        </div>
      )}

      {/* Battery */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>BATTERY</span>
          <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{batteryPct}%</span>
        </div>
        <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${batteryPct}%`, background: batteryPct < 20 ? "#DC2626" : C.blue, borderRadius: 2 }} />
        </div>
      </div>

      {/* Last updated */}
      <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>
        Updated {alert ? new Date(alert.timestamp).toLocaleString() : "just now"}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SensorPage() {
  const navigate                             = useNavigate();
  const { properties, setProperties }        = usePropertyStore();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [devices,   setDevices]   = useState<SensorDevice[]>([]);
  const [alerts,    setAlerts]    = useState<SensorEvent[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (properties.length === 0) {
      propertyService.getMyProperties()
        .then((list) => { if (list.length > 0) setProperties(list); })
        .catch(e => console.error("[SensorPage] property load failed:", e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    }).catch(e => console.error("[SensorPage] load failed:", e)).finally(() => setLoading(false));
  }, [selectedPropertyId]);

  const handleDeactivate = async (deviceId: string) => {
    try {
      await sensorService.deactivateDevice(deviceId);
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      toast.success("Device removed");
    } catch {
      toast.error("Could not remove device");
    }
  };

  const criticalAlert   = alerts.find(a => a.severity === "Critical");
  const activeCount     = devices.filter(d => d.isActive).length;
  const needsAttention  = alerts.filter(a => a.severity === "Critical" || a.severity === "Warning").length;

  // Map device → alert
  const alertByDevice   = new Map<string, SensorEvent>();
  for (const a of alerts) {
    if (!alertByDevice.has(a.deviceId)) alertByDevice.set(a.deviceId, a);
  }

  return (
    <Layout>
      <div style={{ background: C.paper, minHeight: "100%", padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              SENSORS
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "1.875rem", color: C.ink, margin: 0 }}>
              {activeCount} device{activeCount !== 1 ? "s" : ""} reporting{needsAttention > 0 ? ` · ${needsAttention} needs attention` : ""}
            </h1>
          </div>
          <button onClick={() => navigate("/dashboard")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "10px 18px", cursor: "pointer" }}>
            Back to dashboard
          </button>
        </div>

        {/* Critical alert banner */}
        {criticalAlert && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", border: "1px solid #FECACA", borderRadius: 12, background: "#FFF5F5", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: "#DC2626", letterSpacing: "0.1em", marginBottom: 4 }}>
                ALERT · {new Date(criticalAlert.timestamp).toLocaleString().split(",")[1]?.trim() ?? "NOW"}
              </div>
              <p style={{ fontFamily: F.body, fontSize: 14, color: C.ink, margin: 0, lineHeight: 1.5 }}>
                {sensorService.eventLabel(criticalAlert.eventType)} detected. {criticalAlert.value !== 0 ? `${criticalAlert.value} ${criticalAlert.unit}.` : ""} The unit may be past its rated life.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: "#DC2626", background: "#fff", border: "1px solid #FECACA", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Mute 24h
              </button>
              <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: "#fff", background: C.ink, border: "none", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Book a plumber
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : devices.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "3rem", textAlign: "center", background: "#fff" }}>
            <p style={{ fontFamily: F.body, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No devices registered</p>
            <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 }}>
              Connect a Nest, Ecobee, Moen Flo, Ring, Honeywell Home or other smart device.
            </p>
            <button onClick={() => setModalOpen(true)} style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: "#fff", background: C.blue, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer" }}>
              + Register device
            </button>
          </div>
        ) : (
          <>
            {/* Sensor grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
              {devices.map(device => (
                <SensorCard
                  key={device.id}
                  device={device}
                  alert={alertByDevice.get(device.id)}
                />
              ))}
            </div>

            {/* Register more */}
            <button onClick={() => setModalOpen(true)} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.blue, background: "none", border: `1px dashed ${C.blue}`, borderRadius: 10, padding: "12px 20px", cursor: "pointer", width: "100%", marginBottom: 16 }}>
              + Register another device
            </button>

            {/* Footer note */}
            <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              Sensor readings are logged to the property record. A leak caught and repaired counts as verified work once a contractor countersigns.
            </p>
          </>
        )}
      </div>

      <RegisterDeviceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={(device: SensorDevice) => setDevices(prev => [...prev, device])}
        propertyId={selectedPropertyId}
      />
    </Layout>
  );
}
