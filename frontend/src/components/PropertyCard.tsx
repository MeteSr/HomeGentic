import React from "react";
import { Home } from "lucide-react";
import { type Property } from "@/services/property";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

export function PropertyCard({ property, onClick, badge }: { property: Property; onClick: () => void; badge: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: COLORS.white,
        cursor: "pointer",
        padding: "1.5rem",
        borderRadius: RADIUS.card,
        border: `1.5px solid ${hovered ? COLORS.sageMid : COLORS.rule}`,
        boxShadow: hovered ? SHADOWS.hover : SHADOWS.card,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      <div style={{ height: "6rem", background: COLORS.sageLight, borderRadius: RADIUS.sm, marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <Home size={28} color={COLORS.sageMid} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.375rem" }}>
        <h3 style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: COLORS.plum }}>{property.address}</h3>
        {badge}
      </div>
      <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: COLORS.plumMid, marginBottom: "0.75rem" }}>
        {property.city}, {property.state} {property.zipCode}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: COLORS.plumMid }}>
        <span style={{ textTransform: "uppercase" }}>{property.propertyType}</span>
        <span style={{ color: COLORS.sage }}>View Details →</span>
      </div>
    </div>
  );
}
