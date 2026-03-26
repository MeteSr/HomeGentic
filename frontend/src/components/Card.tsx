import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "elevated" | "outlined";
}

export function Card({
  children,
  className = "",
  header,
  footer,
  onClick,
  variant = "default",
}: CardProps) {
  const variants = {
    default: "bg-white border border-gray-200 shadow-sm",
    elevated: "bg-white shadow-md",
    outlined: "bg-white border-2 border-gray-300",
  };

  const clickable = onClick
    ? "cursor-pointer hover:shadow-md transition-shadow"
    : "";

  return (
    <div
      className={`rounded-xl overflow-hidden ${variants[variant]} ${clickable} ${className}`}
      onClick={onClick}
    >
      {header && (
        <div className="px-6 py-4 border-b border-gray-100 font-semibold text-gray-800">
          {header}
        </div>
      )}
      <div className={header || footer ? "p-6" : ""}>{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          {footer}
        </div>
      )}
    </div>
  );
}
