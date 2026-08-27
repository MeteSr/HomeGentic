import React from "react";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowUpCircle, CreditCard, Paperclip, LogOut, Gift } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { voiceAgentFileInputRef } from "./VoiceAgent";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

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
    fontFamily:  V2_FONTS.body,
    fontSize:    "0.9375rem",
    color:       V2_COLORS.ink,
    textAlign:   "left",
  };

  const hoverOn  = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = V2_COLORS.lblue; };
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
        background:    V2_COLORS.paper,
        border:        `1px solid ${V2_COLORS.border}`,
        borderRadius:  V2_RADIUS.card,
        boxShadow:     V2_SHADOWS.modal,
        zIndex:        9999,
        paddingTop:    "0.375rem",
        paddingBottom: "0.375rem",
        overflow:      "hidden",
      }}>
        {/* User header */}
        <div style={{
          padding:      "0.875rem 1.125rem 0.75rem",
          borderBottom: `1px solid ${V2_COLORS.border}`,
        }}>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.9375rem", fontWeight: 600, color: V2_COLORS.ink, marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </p>
        </div>

        <button onClick={() => { onClose(); navigate("/settings"); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <Settings size={16} style={{ flexShrink: 0, color: V2_COLORS.muted }} />
          Settings
        </button>

        <button onClick={() => { onClose(); navigate("/settings?tab=subscription"); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <CreditCard size={16} style={{ flexShrink: 0, color: V2_COLORS.muted }} />
          Billing & Plan
        </button>

        <button onClick={() => { onClose(); navigate("/refer"); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <Gift size={16} style={{ flexShrink: 0, color: V2_COLORS.blue }} />
          Invite a neighbor
        </button>

        <button
          onClick={() => { onClose(); voiceAgentFileInputRef.current?.click(); }}
          style={menuItemStyle}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
        >
          <Paperclip size={16} style={{ flexShrink: 0, color: V2_COLORS.muted }} />
          Attach receipt or photo
        </button>

        <div style={{ height: "1px", background: V2_COLORS.border, margin: "0.3rem 0" }} />

        <button onClick={() => { onClose(); onUpgrade(); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <ArrowUpCircle size={16} style={{ flexShrink: 0, color: V2_COLORS.blue }} />
          Upgrade plan
        </button>

        <div style={{ height: "1px", background: V2_COLORS.border, margin: "0.3rem 0" }} />

        <button onClick={() => { onClose(); logout(); }} style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <LogOut size={16} style={{ flexShrink: 0, color: V2_COLORS.muted }} />
          Sign out
        </button>
      </div>
    </>
  );
}
