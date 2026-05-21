import type React from "react";

interface IconBadgeProps {
  Icon: React.ElementType;
  color: string;
  bg: string;
  size?: number;
  badgeSize?: number;
  radius?: number | string;
}

export function IconBadge({ Icon, color, bg, size = 20, badgeSize = 44, radius = "50%" }: IconBadgeProps) {
  return (
    <div style={{
      width:          badgeSize,
      height:         badgeSize,
      borderRadius:   radius,
      background:     bg,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      flexShrink:     0,
    }}>
      <Icon size={size} color={color} />
    </div>
  );
}
