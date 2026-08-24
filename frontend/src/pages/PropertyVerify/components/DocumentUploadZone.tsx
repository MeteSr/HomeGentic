import React, { useRef, useState } from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface Props {
  onFile  : (file: File, hash: string) => void;
  accept ?: string;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer     = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function DocumentUploadZone({ onFile, accept = ".pdf,.jpg,.jpeg,.png" }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hashing,  setHashing]  = useState(false);

  const process = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    setHashing(true);
    try {
      const hash = await sha256Hex(file);
      onFile(file, hash);
    } finally {
      setHashing(false);
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) process(f); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border      : `2px dashed ${dragOver ? V2_COLORS.blue : V2_COLORS.border}`,
          borderRadius: 12,
          padding     : "32px 24px",
          textAlign   : "center",
          cursor      : hashing ? "wait" : "pointer",
          background  : dragOver ? V2_COLORS.lblue : V2_COLORS.paper,
          transition  : "border-color 0.15s, background 0.15s",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink, marginBottom: 4 }}>
          {hashing ? "Computing hash…" : "Drop a file or click to browse"}
        </div>
        <div style={{ fontSize: 12, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>
          PDF, JPG, PNG — max 10 MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); }}
        />
      </div>
    </div>
  );
}
