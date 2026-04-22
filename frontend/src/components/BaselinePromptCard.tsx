import React, { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, X } from "lucide-react";
import { photoService, type Photo } from "@/services/photo";
import type { Property } from "@/services/property";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

// ─── Constants ────────────────────────────────────────────────────────────────

export const BASELINE_SYSTEMS = [
  { key: "hvac",        label: "HVAC / Air Conditioning"   },
  { key: "waterHeater", label: "Water Heater"               },
  { key: "electrical",  label: "Electrical Panel"           },
  { key: "shutoff",     label: "Main Water Shut-off Valve"  },
  { key: "roof",        label: "Roof"                       },
  { key: "garageDoor",  label: "Garage Door Opener"         },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  property:  Property;
  dismissed: boolean;
  onDismiss: () => void;
}

export function BaselinePromptCard({ property, dismissed, onDismiss }: Props) {
  const [photos,    setPhotos]    = useState<Photo[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const propertyId = String(property.id);

  useEffect(() => {
    photoService.getByJob(`baseline_${propertyId}`)
      .then(setPhotos)
      .catch((e) => console.error("[BaselinePromptCard] photo fetch failed:", e))
      .finally(() => setLoading(false));
  }, [propertyId]);

  const captured       = new Set(photos.map((p) => p.description));
  const completedCount = BASELINE_SYSTEMS.filter(({ key }) => captured.has(key)).length;
  const allComplete    = completedCount === BASELINE_SYSTEMS.length;

  const handleUpload = async (key: string, file: File) => {
    setUploading(key);
    try {
      const photo = await photoService.upload(
        file,
        `baseline_${propertyId}`,
        propertyId,
        "PostConstruction",
        key,
      );
      setPhotos((prev) => [...prev, photo]);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  if (loading) return null;

  // All 6 captured — show compact success badge regardless of dismiss state
  if (allComplete) {
    return (
      <div
        data-testid={`baseline-complete-${propertyId}`}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 0.875rem",
          border: `1px solid ${COLORS.sage}`,
          background: "#F2FAF4",
        }}
      >
        <CheckCircle size={14} color={COLORS.sage} />
        <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 500, color: COLORS.sage }}>
          Baseline photos complete — {property.address}
        </span>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div
      data-testid={`baseline-prompt-${propertyId}`}
      style={{ border: `1px solid ${COLORS.rule}`, background: COLORS.white }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.875rem 1.125rem",
        borderBottom: `1px solid ${COLORS.rule}`,
      }}>
        <div>
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>
            {property.address}
          </span>
          <h3 style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1rem", color: COLORS.plum, margin: "0.1rem 0 0" }}>
            Complete your property baseline
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <span style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "0.9rem", color: COLORS.plum }}>
            {completedCount}{" "}
            <span style={{ fontWeight: 300, color: COLORS.plumMid, fontSize: "0.8rem" }}>/ {BASELINE_SYSTEMS.length}</span>
          </span>
          <button
            onClick={onDismiss}
            aria-label="Dismiss baseline prompt"
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem", display: "flex" }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ padding: "0.75rem 1.125rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {BASELINE_SYSTEMS.map(({ key, label }) => {
          const done        = captured.has(key);
          const isUploading = uploading === key;
          return (
            <div
              key={key}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.5rem 0.75rem",
                background: done ? "#F2FAF4" : COLORS.white,
                border: `1px solid ${done ? COLORS.sage : COLORS.rule}`,
              }}
            >
              {done
                ? <CheckCircle size={14} color={COLORS.sage} style={{ flexShrink: 0 }} />
                : <Camera      size={14} color={COLORS.plumMid} style={{ flexShrink: 0 }} />
              }
              <span style={{
                flex: 1, fontFamily: FONTS.sans, fontSize: "0.8rem",
                fontWeight: done ? 400 : 500, color: done ? COLORS.plumMid : COLORS.plum,
                textDecoration: done ? "line-through" : "none",
              }}>
                {label}
              </span>
              {!done && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    ref={(el) => { inputRefs.current[key] = el; }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(key, file).catch(() => {}); // errors surfaced via toast inside handleUpload
                      e.target.value = "";
                    }}
                  />
                  <button
                    disabled={isUploading}
                    onClick={() => inputRefs.current[key]?.click()}
                    style={{
                      padding: "0.25rem 0.625rem",
                      fontFamily: FONTS.sans, fontSize: "0.65rem", fontWeight: 600,
                      background: "none", color: COLORS.plum,
                      border: `1px solid ${COLORS.rule}`,
                      cursor: isUploading ? "wait" : "pointer",
                      opacity: isUploading ? 0.6 : 1, flexShrink: 0,
                    }}
                  >
                    {isUploading ? "Uploading…" : "Add photo"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
