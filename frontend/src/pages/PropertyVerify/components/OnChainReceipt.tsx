import React, { useState } from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface Props {
  identity  : string;
  docHash   : string;
  block     : string;
  claimant  : string;
}

export function OnChainReceipt({ identity, docHash, block, claimant }: Props) {
  const [copied, setCopied] = useState(false);

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(docHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const rows = [
    { label: "CLAIMANT",       value: claimant },
    { label: "IDENTITY",       value: identity },
    { label: "DOCUMENT SHA-256", value: docHash },
    { label: "BLOCK",          value: block },
  ];

  return (
    <div style={{ border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${V2_COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontFamily: V2_FONTS.mono, fontWeight: 600, color: V2_COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          On-chain Receipt
        </span>
        <button
          onClick={copyHash}
          style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.blue, background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: 6 }}
        >
          {copied ? "Copied!" : "Copy hash"}
        </button>
      </div>
      <div>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr", borderBottom: `1px solid ${V2_COLORS.border}`, padding: "10px 16px", gap: 12 }}>
            <span style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", alignSelf: "center" }}>
              {row.label}
            </span>
            <span style={{ fontSize: 12, fontFamily: V2_FONTS.mono, color: V2_COLORS.ink, wordBreak: "break-all" }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
