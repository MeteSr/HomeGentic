import React, { useState, useRef } from "react";
import { PhotoQuotaDisplay } from "./PhotoQuotaDisplay";

const PHASES = [
  "Pre-Work",
  "Demo",
  "Foundation",
  "Framing",
  "Rough-In",
  "Insulation",
  "Drywall",
  "Finish",
  "Final Inspection",
];

interface Preview {
  url: string;
  name: string;
  phase: string;
}

interface ConstructionPhotoUploadProps {
  onUpload: (file: File, phase: string) => void;
  quota: { used: number; limit: number; tier: string };
  onUpgradeQuota?: () => void;
}

export function ConstructionPhotoUpload({
  onUpload,
  quota,
  onUpgradeQuota,
}: ConstructionPhotoUploadProps) {
  const [phase, setPhase] = useState(PHASES[0]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (quota.used + previews.length >= quota.limit) return;
    const url = URL.createObjectURL(file);
    setPreviews((p) => [...p, { url, name: file.name, phase }]);
    onUpload(file, phase);
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
        <label className="form-label">Construction Phase</label>
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          className="form-input"
          style={{ width: "100%" }}
        >
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#3b82f6" : "#d1d5db"}`,
          borderRadius: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          cursor: "pointer",
          backgroundColor: dragging ? "#eff6ff" : "#f9fafb",
          transition: "all 0.2s",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          Drag photos here or click to browse
        </p>
        <p style={{ color: "#9ca3af", fontSize: "0.75rem", marginTop: "0.25rem" }}>
          PNG, JPG, HEIC up to 10MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) =>
            Array.from(e.target.files || []).forEach(handleFile)
          }
        />
      </div>

      {previews.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.5rem",
          }}
        >
          {previews.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={p.url}
                alt={p.name}
                style={{
                  width: "100%",
                  height: "6rem",
                  objectFit: "cover",
                  borderRadius: "0.5rem",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: "0.25rem",
                  left: "0.25rem",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  color: "white",
                  fontSize: "0.625rem",
                  padding: "0.125rem 0.25rem",
                  borderRadius: "0.25rem",
                }}
              >
                {p.phase}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
