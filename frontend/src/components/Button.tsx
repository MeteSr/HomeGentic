import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: "#0E0E0C",
    color: "#F4F1EB",
    border: "1px solid #0E0E0C",
  },
  secondary: {
    backgroundColor: "#F4F1EB",
    color: "#0E0E0C",
    border: "1px solid #C8C3B8",
  },
  outline: {
    backgroundColor: "transparent",
    color: "#0E0E0C",
    border: "1px solid #0E0E0C",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "#7A7268",
    border: "1px solid transparent",
  },
};

const HOVER_BG: Record<string, string> = {
  primary:   "#C94C2E",
  secondary: "#EDE9E0",
  outline:   "#F4F1EB",
  ghost:     "#EDE9E0",
};

const HOVER_BORDER: Record<string, string> = {
  primary:   "#C94C2E",
  secondary: "#C8C3B8",
  outline:   "#0E0E0C",
  ghost:     "transparent",
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { padding: "0.375rem 0.875rem", fontSize: "0.688rem" },
  md: { padding: "0.5rem 1.25rem",    fontSize: "0.7rem" },
  lg: { padding: "0.75rem 2rem",      fontSize: "0.75rem" },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  children,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 500,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    borderRadius: 0,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.5 : 1,
    transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
    outline: "none",
    whiteSpace: "nowrap",
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    backgroundColor:
      hovered && !disabled && !loading
        ? HOVER_BG[variant]
        : (VARIANT_STYLES[variant].backgroundColor as string),
    borderColor:
      hovered && !disabled && !loading
        ? HOVER_BORDER[variant]
        : (VARIANT_STYLES[variant].border as string)?.split(" ").pop(),
    color:
      hovered && !disabled && !loading && variant === "primary"
        ? "#F4F1EB"
        : (VARIANT_STYLES[variant].color as string),
    ...style,
  };

  return (
    <button
      style={baseStyle}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      {loading ? <span className="btn-spinner" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}
