import React from "react";

interface PhotoQuotaDisplayProps {
  used: number;
  limit: number;
  tier: string;
  onUpgrade?: () => void;
}

export function PhotoQuotaDisplay({
  used,
  limit,
  tier,
  onUpgrade,
}: PhotoQuotaDisplayProps) {
  const pct = Math.min((used / limit) * 100, 100);
  const barColor =
    pct > 95 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500";
  const textColor =
    pct > 95
      ? "text-red-600"
      : pct > 80
      ? "text-yellow-600"
      : "text-green-600";

  return (
    <div className="space-y-2">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.875rem",
        }}
      >
        <span style={{ color: "#6b7280" }}>Photos Used</span>
        <span
          style={{
            fontWeight: 600,
            color:
              pct > 95 ? "#dc2626" : pct > 80 ? "#d97706" : "#059669",
          }}
        >
          {used}/{limit}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          backgroundColor: "#e5e7eb",
          borderRadius: "9999px",
          height: "8px",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "8px",
            borderRadius: "9999px",
            backgroundColor:
              pct > 95 ? "#ef4444" : pct > 80 ? "#f59e0b" : "#10b981",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {pct > 80 && onUpgrade && (
        <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          Running low on photo quota.{" "}
          <button
            onClick={onUpgrade}
            style={{
              color: "#3b82f6",
              textDecoration: "underline",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Upgrade from {tier}
          </button>
        </p>
      )}
    </div>
  );
}
