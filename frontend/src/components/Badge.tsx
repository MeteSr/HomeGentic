import React from "react";

interface BadgeProps {
  variant?: "success" | "warning" | "error" | "info" | "default";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  success: { backgroundColor: "#EAF4EE", color: "#2D6A3F", border: "1px solid #A8D5B4" },
  warning: { backgroundColor: "#FDF4E3", color: "#7A5000", border: "1px solid #E8C97A" },
  error:   { backgroundColor: "#FAE8E3", color: "#A83D23", border: "1px solid #E8A898" },
  info:    { backgroundColor: "#EDE9E0", color: "#4A4A45", border: "1px solid #C8C3B8" },
  default: { backgroundColor: "#EDE9E0", color: "#7A7268", border: "1px solid #C8C3B8" },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { padding: "0.1rem 0.4rem",  fontSize: "0.6rem" },
  md: { padding: "0.15rem 0.5rem", fontSize: "0.65rem" },
  lg: { padding: "0.25rem 0.625rem", fontSize: "0.75rem" },
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
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        borderRadius: 0,
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
      }}
    >
      {children}
    </span>
  );
}
