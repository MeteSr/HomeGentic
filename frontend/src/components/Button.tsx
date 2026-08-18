import React from "react";
import { COLORS, FONTS } from "@/theme";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: COLORS.plum,
    color: COLORS.white,
    border: `1.5px solid ${COLORS.plum}`,
  },
  secondary: {
    backgroundColor: COLORS.sageLight,
    color: COLORS.plum,
    border: `1.5px solid ${COLORS.sageMid}`,
  },
  outline: {
    backgroundColor: "transparent",
    color: COLORS.plum,
    border: `1.5px solid ${COLORS.plum}`,
  },
  ghost: {
    backgroundColor: "transparent",
    color: COLORS.plumMid,
    border: "1.5px solid transparent",
  },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { padding: "0.4rem 1rem",   fontSize: "0.8rem"  },
  md: { padding: "0.55rem 1.4rem", fontSize: "0.875rem" },
  lg: { padding: "0.75rem 2rem",  fontSize: "0.95rem"  },
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

  const isDisabled = disabled || loading;

  const hoverOverrides: React.CSSProperties = (() => {
    if (!hovered || isDisabled) return {};
    switch (variant) {
      case "primary":
        return { transform: "translateY(-2px)", boxShadow: "0 8px 24px rgba(46,37,64,0.28)" };
      case "secondary":
        return { borderColor: COLORS.sage, backgroundColor: COLORS.sageLight };
      case "outline":
        return { backgroundColor: COLORS.sageLight, transform: "translateY(-1px)" };
      case "ghost":
        return { backgroundColor: COLORS.sageLight, color: COLORS.plum };
      default:
        return {};
    }
  })();

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    fontFamily: FONTS.sans,
    fontWeight: 600,
    borderRadius: 100,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.5 : 1,
    transition: "background-color 0.18s, border-color 0.18s, color 0.18s, transform 0.18s, box-shadow 0.18s",
    whiteSpace: "nowrap",
    minHeight: "44px",
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    ...hoverOverrides,
    ...style,
  };

  return (
    <button
      style={baseStyle}
      disabled={isDisabled}
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
