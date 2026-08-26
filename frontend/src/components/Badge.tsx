import React from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface BadgeProps {
  variant?: "verified" | "attention" | "risk" | "neutral" | "success" | "warning" | "error" | "info" | "default";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  // ── V2 semantic variants ──────────────────────────────────────────────────
  verified:   { backgroundColor: V2_COLORS.vbadge,      color: V2_COLORS.blue,      border: `1px solid ${V2_COLORS.cobalTint}` },
  attention:  { backgroundColor: V2_COLORS.attentionBg, color: "#92640A",            border: "1px solid #E8C84A" },
  risk:       { backgroundColor: "#FFE8E3",              color: V2_COLORS.coralText,  border: "1px solid #FFBCAF" },
  neutral:    { backgroundColor: V2_COLORS.surface,     color: V2_COLORS.muted,      border: `1px solid ${V2_COLORS.border}` },
  // ── Legacy aliases (deprecated — migrate to V2 variants above) ───────────
  success:    { backgroundColor: V2_COLORS.vbadge,      color: V2_COLORS.blue,       border: `1px solid ${V2_COLORS.cobalTint}` },
  warning:    { backgroundColor: V2_COLORS.attentionBg, color: "#92640A",            border: "1px solid #E8C84A" },
  error:      { backgroundColor: "#FFE8E3",              color: V2_COLORS.coralText,  border: "1px solid #FFBCAF" },
  info:       { backgroundColor: V2_COLORS.lblue,       color: V2_COLORS.blue,       border: `1px solid ${V2_COLORS.cobalTint}` },
  default:    { backgroundColor: V2_COLORS.surface,     color: V2_COLORS.muted,      border: `1px solid ${V2_COLORS.border}` },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { padding: "0.1rem 0.5rem",   fontSize: "0.6rem"  },
  md: { padding: "0.2rem 0.625rem", fontSize: "0.65rem" },
  lg: { padding: "0.3rem 0.75rem",  fontSize: "0.75rem" },
};

export function Badge({
  variant = "default",
  size = "md",
  children,
}: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: V2_FONTS.mono,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        borderRadius: 100,
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
      }}
    >
      {children}
    </span>
  );
}
