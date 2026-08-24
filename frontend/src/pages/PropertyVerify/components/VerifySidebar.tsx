import React from "react";

interface Props {
  children: React.ReactNode;
}

export function VerifySidebar({ children }: Props) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      {children}
    </div>
  );
}
