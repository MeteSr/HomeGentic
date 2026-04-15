import React from "react";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowUpCircle, Paperclip, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { voiceAgentFileInputRef } from "./VoiceAgent";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

interface UserMenuPopoverProps {
  displayName: string;
  onClose:     () => void;
  onUpgrade:   () => void;
}

export function UserMenuPopover({ displayName, onClose, onUpgrade }: UserMenuPopoverProps) {
  const navigate   = useNavigate();
  const { logout } = useAuth();

  const menuItemStyle: React.CSSProperties = {
    display:     "flex",
    alignItems:  "center",
    gap:         "0.75rem",
    width:       "100%",
    padding:     "0.7rem 1.125rem",
    background:  "none",
    border:      "none",
    cursor:      "pointer",
    fontFamily:  FONTS.sans,
    fontSize:    "0.9375rem",
    color:       COLORS.plum,
    textAlign:   "left",
  };

  const hoverOn  = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = COLORS.sageLight; };
  const hoverOff = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "none"; };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={onClose}
      />

      {/* Popover */}
      <div style={{
        position:      "fixed",
        bottom:        "1rem",
        left:          "1rem",
        width:         "280px",
        background:    COLORS.white,
        border:        `1px solid ${COLORS.rule}`,
        borderRadius:  RADIUS.card,
        boxShadow:     SHADOWS.modal,
        zIndex:        9999,
        paddingTop:    "0.375rem",
        paddingBottom: "0.375rem",
        overflow:      "hidden",
      }}>
        {/* User header */}
        <div style={{
          padding:      "0.875rem 1.125rem 0.75rem",
          borderBottom: `1px solid ${COLORS.rule}`,
        }}>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.9375rem", fontWeight: 600, color: COLORS.plum, marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </p>
        </div>

        <button onClick={() => { onClose(); navigate("/settings"); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <Settings size={16} style={{ flexShrink: 0, color: COLORS.plumMid }} />
          Settings
        </button>

        <button
          onClick={() => { onClose(); voiceAgentFileInputRef.current?.click(); }}
          style={menuItemStyle}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
        >
          <Paperclip size={16} style={{ flexShrink: 0, color: COLORS.plumMid }} />
          Attach receipt or photo
        </button>

        <div style={{ height: "1px", background: COLORS.rule, margin: "0.3rem 0" }} />

        <button onClick={() => { onClose(); onUpgrade(); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <ArrowUpCircle size={16} style={{ flexShrink: 0, color: COLORS.sage }} />
          Upgrade plan
        </button>

        <div style={{ height: "1px", background: COLORS.rule, margin: "0.3rem 0" }} />

        <button onClick={() => { onClose(); logout(); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <LogOut size={16} style={{ flexShrink: 0, color: COLORS.plumMid }} />
          Sign out
        </button>
      </div>
    </>
  );
}
