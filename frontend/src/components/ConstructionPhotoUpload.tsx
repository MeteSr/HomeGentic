import React, { useState, useRef } from "react";
import { PhotoQuotaDisplay } from "./PhotoQuotaDisplay";
import { COLORS, FONTS, RADIUS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  mono:     FONTS.mono,
};

export const DOC_TYPES = [
  "Receipt",
  "Invoice",
  "Permit",
  "Before Photo",
  "After Photo",
  "Warranty Card",
  "Inspection Report",
  "Other",
];

interface Preview {
  url: string;
  name: string;
  docType: string;
}

interface ConstructionPhotoUploadProps {
  onUpload: (file: File, docType: string) => void;
  quota: { used: number; limit: number; tier: string };
  onUpgradeQuota?: () => void;
}

export function ConstructionPhotoUpload({
  onUpload,
  quota,
  onUpgradeQuota,
}: ConstructionPhotoUploadProps) {
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [previews, setPreviews]   = useState<Preview[]>([]);
  const [dragging, setDragging]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (quota.used + previews.length >= quota.limit) return;
    const url = URL.createObjectURL(file);
    setPreviews((p) => [...p, { url, name: file.name, docType }]);
    onUpload(file, docType);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(handleFile);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <PhotoQuotaDisplay {...quota} onUpgrade={onUpgradeQuota} />

      <div>
        <label className="form-label">Document Type</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="form-input"
          style={{ width: "100%" }}
        >
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? UI.rust : UI.rule}`,
          padding: "2rem",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? COLORS.blush : UI.paper,
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <p style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>
          Drag files here or click to browse
        </p>
        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.25rem", opacity: 0.7 }}>
          PNG, JPG, PDF, HEIC up to 10 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => Array.from(e.target.files || []).forEach(handleFile)}
        />
      </div>

      {previews.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
          {previews.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={p.url}
                alt={p.name}
                style={{ width: "100%", height: "6rem", objectFit: "cover", display: "block" }}
              />
              <span style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "rgba(46,37,64,0.65)",
                color: COLORS.white,
                fontFamily: UI.mono,
                fontSize: "0.55rem",
                letterSpacing: "0.06em",
                padding: "0.2rem 0.375rem",
              }}>
                {p.docType}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
