import React from "react";
import { Home } from "lucide-react";
import { type Property } from "@/services/property";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

export function PropertyCard({ property, onClick, badge }: { property: Property; onClick: () => void; badge: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: V2_COLORS.paper,
        cursor: "pointer",
        padding: "1.5rem",
        borderRadius: V2_RADIUS.card,
        border: `1.5px solid ${hovered ? V2_COLORS.cobalTint : V2_COLORS.border}`,
        boxShadow: hovered ? V2_SHADOWS.hover : V2_SHADOWS.card,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      <div style={{ height: "6rem", background: V2_COLORS.lblue, borderRadius: V2_RADIUS.sm, marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <Home size={28} color={V2_COLORS.cobalTint} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.375rem" }}>
        <h3 style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 600, color: V2_COLORS.ink }}>{property.address}</h3>
        {badge}
      </div>
      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", letterSpacing: "0.06em", color: V2_COLORS.muted, marginBottom: "0.75rem" }}>
        {property.city}, {property.state} {property.zipCode}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: V2_FONTS.body, fontSize: "0.65rem", letterSpacing: "0.08em", color: V2_COLORS.muted }}>
        <span style={{ textTransform: "uppercase" }}>{property.propertyType}</span>
        <span style={{ color: V2_COLORS.muted }}>View Details →</span>
      </div>
    </div>
  );
}
