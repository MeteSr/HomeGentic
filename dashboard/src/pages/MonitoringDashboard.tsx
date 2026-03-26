import React, { useEffect, useState } from "react";

interface HealthStatus {
  timestamp: bigint;
  canisters: bigint;
  isHealthy: boolean;
  version: string;
}

interface Metric {
  name: string;
  value: bigint;
  timestamp: bigint;
}

const CANISTERS = [
  "auth",
  "property",
  "job",
  "contractor",
  "quote",
  "price",
  "payment",
  "photo",
  "monitoring",
];

export default function MonitoringDashboard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Placeholder: in production, wire up @dfinity/agent calls here
  useEffect(() => {
    const mockHealth: HealthStatus = {
      timestamp: BigInt(Date.now() * 1_000_000),
      canisters: BigInt(9),
      isHealthy: true,
      version: "0.1.0",
    };
    setHealth(mockHealth);
    setMetrics([]);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        <p>Loading monitoring data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        HomeFax — Monitoring Dashboard
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Last refreshed: {lastRefresh.toLocaleTimeString()}
      </p>

      {health && (
        <div
          style={{
            background: health.isHealthy ? "#d1fae5" : "#fee2e2",
            border: `1px solid ${health.isHealthy ? "#10b981" : "#ef4444"}`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Platform Health: {health.isHealthy ? "Healthy" : "Degraded"}
          </h2>
          <p style={{ margin: "4px 0 0", color: "#374151" }}>
            Version: {health.version} | Active canisters:{" "}
            {health.canisters.toString()}
          </p>
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Canisters
      </h2>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: 24,
        }}
      >
        <thead>
          <tr style={{ background: "#f3f4f6" }}>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>Canister</th>
            <th style={{ padding: "8px 12px", textAlign: "left" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {CANISTERS.map((name) => (
            <tr key={name} style={{ borderTop: "1px solid #e5e7eb" }}>
              <td style={{ padding: "8px 12px" }}>{name}</td>
              <td style={{ padding: "8px 12px", color: "#10b981" }}>Running</td>
            </tr>
          ))}
        </tbody>
      </table>

      {metrics.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Recorded Metrics
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Name</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 12px" }}>{m.name}</td>
                  <td style={{ padding: "8px 12px" }}>{m.value.toString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
