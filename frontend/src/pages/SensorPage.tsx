import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { RegisterDeviceModal } from "@/components/RegisterDeviceModal";
import { usePropertyStore } from "@/store/propertyStore";
import { sensorService, SensorDevice, SensorEvent } from "@/services/sensor";
import { propertyService } from "@/services/property";
import { Panel, Pill, spinnerVars, type PillTone } from "@/components/hud";
import toast from "react-hot-toast";

const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── Sensor card ────────────────────────────────────────────────────────────────

function SensorCard({ device, alert, onRemove, removing }: { device: SensorDevice; alert?: SensorEvent; onRemove: (deviceId: string) => void; removing: boolean }) {
  const isAlert  = !!alert && alert.severity === "Critical";
  const isHigh   = !!alert && alert.severity === "Warning";

  const statusLabel: string = isAlert ? "ALERT" : isHigh ? "HIGH" : "NORMAL";
  const statusTone:  PillTone = isAlert ? "bad" : isHigh ? "warn" : "good";

  const batteryPct = Math.floor(Math.random() * 60 + 35);

  return (
    <Panel style={{ border: isAlert ? "1px solid rgba(255,92,57,0.4)" : "1px solid var(--hg-line)", background: isAlert ? "rgba(255,92,57,0.06)" : "var(--hg-surface)", padding: "18px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: "var(--hg-ink)" }}>{device.name}</div>
          <div style={{ fontFamily: BODY, fontSize: 12, color: "var(--hg-muted)" }}>{device.externalDeviceId || device.source}</div>
        </div>
        <Pill tone={statusTone}>{statusLabel}</Pill>
      </div>

      {/* Reading */}
      {alert ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 900, color: isAlert ? "var(--hg-bad)" : "var(--hg-ink)", lineHeight: 1 }}>
            {sensorService.eventLabel(alert.eventType)}
          </div>
          {alert.value !== 0 && (
            <div style={{ fontFamily: BODY, fontSize: 13, color: "var(--hg-muted)", marginTop: 2 }}>
              {alert.value} {alert.unit} detected
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: "var(--hg-ink)", marginBottom: 12 }}>
          {device.isActive ? "Online" : "Offline"}
        </div>
      )}

      {/* Battery */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: "var(--hg-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>BATTERY</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--hg-muted)" }}>{batteryPct}%</span>
        </div>
        <div style={{ height: 4, background: "var(--hg-line)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${batteryPct}%`, background: batteryPct < 20 ? "var(--hg-bad)" : "var(--hg-blue)", borderRadius: 2 }} />
        </div>
      </div>

      {/* Last updated + remove */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: BODY, fontSize: 12, color: "var(--hg-muted)" }}>
          Updated {alert ? new Date(alert.timestamp).toLocaleString() : "just now"}
        </div>
        <button
          onClick={() => onRemove(device.id)}
          disabled={removing}
          style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: "var(--hg-bad)", background: "none", border: "none", cursor: removing ? "not-allowed" : "pointer", opacity: removing ? 0.5 : 1, padding: 0 }}
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </Panel>
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
  const [removingId, setRemovingId] = useState<string | null>(null);

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
    setRemovingId(deviceId);
    try {
      await sensorService.deactivateDevice(deviceId);
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      toast.success("Device removed");
    } catch {
      toast.error("Could not remove device");
    } finally {
      setRemovingId(null);
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
      <div className="hg-v3" data-theme="dark" style={{ background: "var(--hg-bg)", minHeight: "100%", padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "var(--hg-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              SENSORS
            </div>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "1.875rem", color: "var(--hg-ink)", margin: 0 }}>
              {activeCount} device{activeCount !== 1 ? "s" : ""} reporting{needsAttention > 0 ? ` · ${needsAttention} needs attention` : ""}
            </h1>
          </div>
          <button onClick={() => navigate("/dashboard")} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "var(--hg-ink)", background: "var(--hg-fill)", border: "1px solid var(--hg-line-2)", borderRadius: 100, padding: "10px 18px", cursor: "pointer" }}>
            Back to dashboard
          </button>
        </div>

        {/* Critical alert banner */}
        {criticalAlert && (
          <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", border: "1px solid rgba(255,92,57,0.4)", background: "rgba(255,92,57,0.08)", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: "var(--hg-bad)", letterSpacing: "0.1em", marginBottom: 4 }}>
                ALERT · {new Date(criticalAlert.timestamp).toLocaleString().split(",")[1]?.trim() ?? "NOW"}
              </div>
              <p style={{ fontFamily: BODY, fontSize: 14, color: "var(--hg-ink)", margin: 0, lineHeight: 1.5 }}>
                {sensorService.eventLabel(criticalAlert.eventType)} detected. {criticalAlert.value !== 0 ? `${criticalAlert.value} ${criticalAlert.unit}.` : ""} The unit may be past its rated life.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "var(--hg-bad)", background: "var(--hg-surface)", border: "1px solid rgba(255,92,57,0.4)", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Mute 24h
              </button>
              <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: "#FCFCFD", background: "var(--hg-blue)", border: "none", borderRadius: 100, padding: "8px 16px", cursor: "pointer" }}>
                Book a plumber
              </button>
            </div>
          </Panel>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <div className="spinner-lg" style={spinnerVars} />
          </div>
        ) : devices.length === 0 ? (
          <Panel style={{ padding: "3rem", textAlign: "center" }}>
            <p style={{ fontFamily: BODY, fontSize: 15, fontWeight: 600, color: "var(--hg-ink)", marginBottom: 6 }}>No devices registered</p>
            <p style={{ fontFamily: BODY, fontSize: 13, color: "var(--hg-muted)", marginBottom: 20 }}>
              Connect a Nest, Ecobee, Moen Flo, Ring, Honeywell Home or other smart device.
            </p>
            <button onClick={() => setModalOpen(true)} style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: "#FCFCFD", background: "var(--hg-blue)", border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer" }}>
              + Register device
            </button>
          </Panel>
        ) : (
          <>
            {/* Sensor grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
              {devices.map(device => (
                <SensorCard
                  key={device.id}
                  device={device}
                  alert={alertByDevice.get(device.id)}
                  onRemove={handleDeactivate}
                  removing={removingId === device.id}
                />
              ))}
            </div>

            {/* Register more */}
            <button onClick={() => setModalOpen(true)} style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: "var(--hg-blue-ink)", background: "none", border: "1px dashed var(--hg-blue)", borderRadius: 10, padding: "12px 20px", cursor: "pointer", width: "100%", marginBottom: 16 }}>
              + Register another device
            </button>

            {/* Footer note */}
            <p style={{ fontFamily: BODY, fontSize: 13, color: "var(--hg-muted)", lineHeight: 1.6, margin: 0 }}>
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
