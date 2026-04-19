/**
 * ListingPhotoManager — Issue #114
 *
 * Owner view  : upload photos, drag-to-reorder, delete.  First photo becomes
 *               the cover image shown in the public listing.
 * Gallery view: read-only ordered gallery for prospective buyers.
 *
 * Props
 *  propertyId  — the FSBO listing's property ID
 *  isOwner     — when true the full management UI is shown
 *  onPhotoCountChange — optional callback so the parent can reflect the count
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Trash2, GripVertical, AlertCircle, Upload } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "@/theme";
import { photoService, type Photo } from "@/services/photo";
import { listingService } from "@/services/listing";

const MAX_PHOTOS = 15;

const UI = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  rust:     COLORS.rust,
  paper:    COLORS.white,
  sans:     FONTS.sans,
  mono:     FONTS.sans,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByOrder(photos: Photo[], order: string[]): Photo[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  // Photos present in order list first (preserves sequence), then any extras
  const sorted = order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const inOrder = new Set(order);
  photos.forEach((p) => { if (!inOrder.has(p.id)) sorted.push(p); });
  return sorted;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ListingPhotoManagerProps {
  propertyId:          string;
  isOwner:             boolean;
  onPhotoCountChange?: (count: number) => void;
}

export default function ListingPhotoManager({
  propertyId,
  isOwner,
  onPhotoCountChange,
}: ListingPhotoManagerProps) {
  const [photos,     setPhotos]     = useState<Photo[]>([]);
  const [order,      setOrder]      = useState<string[]>([]);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // drag-to-reorder state
  const dragIndexRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [rawPhotos, rawOrder] = await Promise.all([
        photoService.getListingPhotos(propertyId),
        listingService.getListingPhotos(propertyId),
      ]);
      setPhotos(rawPhotos);
      setOrder(rawOrder);
      onPhotoCountChange?.(rawPhotos.length);
    } catch {
      // non-fatal — show empty state
    }
  }, [propertyId, onPhotoCountChange]);

  useEffect(() => { load(); }, [load]);

  const sorted = sortByOrder(photos, order);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (photos.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos per listing.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (photos.length >= MAX_PHOTOS) break;
        if (!file.type.startsWith("image/")) continue;
        const photo = await photoService.uploadListingPhoto(file, propertyId, file.name);
        await listingService.addListingPhoto(propertyId, photo.id);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(photoId: string) {
    try {
      await photoService.deletePhoto(photoId);
      await listingService.removeListingPhoto(propertyId, photoId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // ── Drag-to-reorder ───────────────────────────────────────────────────────

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    const next = [...sorted];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    dragIndexRef.current = index;
    const newOrder = next.map((p) => p.id);
    setOrder(newOrder);
    setPhotos(next);
  }

  async function handleDrop() {
    dragIndexRef.current = null;
    const newOrder = sorted.map((p) => p.id);
    try {
      await listingService.reorderListingPhotos(propertyId, newOrder);
    } catch {
      // revert on failure
      await load();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const atCap = photos.length >= MAX_PHOTOS;

  return (
    <div data-testid="listing-photo-manager">

      {/* ── Owner upload controls ────────────────────────────────────────── */}
      {isOwner && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              data-testid="upload-listing-photo-btn"
              disabled={uploading || atCap}
              onClick={() => fileInputRef.current?.click()}
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          "0.4rem",
                background:   atCap ? UI.rule : UI.sage,
                color:        atCap ? UI.inkLight : "#fff",
                border:       "none",
                borderRadius: RADIUS.pill,
                padding:      "0.5rem 1.1rem",
                fontFamily:   UI.mono,
                fontSize:     "0.75rem",
                fontWeight:   700,
                cursor:       atCap ? "not-allowed" : "pointer",
                opacity:      uploading ? 0.6 : 1,
              }}
            >
              <Upload size={13} />
              {uploading ? "Uploading…" : "Add Photos"}
            </button>
            <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>
              {photos.length} / {MAX_PHOTOS} photos
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {isOwner && photos.length > 1 && (
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginTop: "0.5rem" }}>
              Drag photos to reorder — first photo becomes the cover image.
            </p>
          )}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "0.4rem",
            background:   "#FFF5F5",
            border:       `1px solid ${UI.rust}60`,
            borderRadius: RADIUS.card,
            padding:      "0.6rem 0.85rem",
            marginBottom: "0.75rem",
            fontFamily:   UI.sans,
            fontSize:     "0.8rem",
            color:        UI.rust,
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {photos.length === 0 && (
        <div
          data-testid="listing-photo-empty"
          style={{
            background:   UI.rule + "50",
            border:       `1px dashed ${UI.rule}`,
            borderRadius: RADIUS.card,
            padding:      "2rem",
            textAlign:    "center",
            color:        UI.inkLight,
          }}
        >
          <Camera size={28} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
          <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", margin: 0 }}>
            {isOwner ? "No photos yet — add some to attract buyers." : "No photos available."}
          </p>
        </div>
      )}

      {/* ── Photo grid ───────────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <div
          data-testid="listing-photo-grid"
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap:                 "0.65rem",
          }}
        >
          {sorted.map((photo, index) => (
            <div
              key={photo.id}
              draggable={isOwner}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              style={{
                position:     "relative",
                border:       index === 0 ? `2px solid ${UI.sage}` : `1px solid ${UI.rule}`,
                borderRadius: RADIUS.card,
                overflow:     "hidden",
                cursor:       isOwner ? "grab" : "default",
                background:   "#f5f5f0",
              }}
            >
              <img
                src={photo.url}
                alt={photo.description || `Listing photo ${index + 1}`}
                style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }}
              />

              {/* Cover badge */}
              {index === 0 && (
                <span style={{
                  position:   "absolute",
                  top:        "0.35rem",
                  left:       "0.35rem",
                  background: UI.sage,
                  color:      "#fff",
                  fontFamily: UI.mono,
                  fontSize:   "0.55rem",
                  fontWeight: 700,
                  padding:    "0.15rem 0.4rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  Cover
                </span>
              )}

              {/* Owner controls overlay */}
              {isOwner && (
                <div style={{
                  position:       "absolute",
                  inset:          0,
                  background:     "rgba(0,0,0,0)",
                  display:        "flex",
                  alignItems:     "flex-start",
                  justifyContent: "flex-end",
                  padding:        "0.35rem",
                  gap:            "0.25rem",
                  opacity:        0,
                  transition:     "opacity 0.15s",
                }}
                  className="photo-overlay"
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                >
                  <button
                    aria-label="Drag to reorder"
                    style={{
                      background:   "rgba(255,255,255,0.85)",
                      border:       "none",
                      borderRadius: "4px",
                      padding:      "0.25rem",
                      cursor:       "grab",
                      display:      "flex",
                    }}
                  >
                    <GripVertical size={14} color={UI.inkLight} />
                  </button>
                  <button
                    aria-label="Delete photo"
                    data-testid={`delete-photo-${photo.id}`}
                    onClick={() => handleDelete(photo.id)}
                    style={{
                      background:   "rgba(255,255,255,0.85)",
                      border:       "none",
                      borderRadius: "4px",
                      padding:      "0.25rem",
                      cursor:       "pointer",
                      display:      "flex",
                    }}
                  >
                    <Trash2 size={14} color={UI.rust} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
