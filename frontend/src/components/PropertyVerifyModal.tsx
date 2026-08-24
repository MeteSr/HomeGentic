import React from "react";
import { useNavigate } from "react-router-dom";
import { Shield, X } from "lucide-react";
import { Button } from "@/components/Button";
import { COLORS, FONTS, RADIUS } from "@/theme";

export interface PropertyVerifyModalProps {
  open:        boolean;
  onClose:     () => void;
  propertyId:  string;
  /** Called after the user navigates to the verify flow (modal closes). */
  onSuccess?:  () => void;
}

export default function PropertyVerifyModal({ open, onClose, propertyId }: PropertyVerifyModalProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const handleStart = () => {
    onClose();
    navigate(`/properties/${propertyId}/verify`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verify Property Ownership"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(14,14,12,0.55)",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:   COLORS.white,
        border:       `1px solid ${COLORS.rule}`,
        borderRadius: RADIUS.card,
        padding:      "2rem",
        maxWidth:     "480px",
        width:        "100%",
        position:     "relative",
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: "0.25rem" }}
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
          <div style={{ border: `1px solid ${COLORS.sage}`, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "4rem", height: "4rem", borderRadius: RADIUS.card }}>
            <Shield size={28} color={COLORS.sage} />
          </div>
        </div>

        <div style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.sage, marginBottom: "0.375rem", textAlign: "center" }}>
          Ownership
        </div>
        <h2 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: COLORS.plum, marginBottom: "0.875rem", textAlign: "center" }}>
          Verify your ownership
        </h2>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: COLORS.plumMid, lineHeight: 1.7, marginBottom: "1.5rem", textAlign: "center" }}>
          Complete two quick steps — a photo ID check and an ownership document upload — within 72 hours to lock in your property record.
        </p>

        <Button size="lg" style={{ width: "100%" }} onClick={handleStart} icon={<Shield size={14} />}>
          Start verification
        </Button>
      </div>
    </div>
  );
}
