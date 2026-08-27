import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Wrench, ShieldAlert, ShieldCheck, Clock, CheckCircle2,
  AlertTriangle, MessageSquare, X, Zap,
} from "lucide-react";
import { V2_COLORS, V2_FONTS } from "@/theme";
import type { ActivityEvent } from "@/services/activityFeed";

interface ActivityFeedDrawerProps {
  events:     ActivityEvent[];
  feedLoaded: boolean;
  lastReadAt: number;
  onClose:    () => void;
}

export function ActivityFeedDrawer({ events, feedLoaded, lastReadAt, onClose }: ActivityFeedDrawerProps) {
  const navigate = useNavigate();

  const icons: Record<ActivityEvent["type"], React.ReactNode> = {
    pending_verification: <ShieldAlert size={14} color={V2_COLORS.muted} />,
    warranty_expiring:    <AlertTriangle size={14} color={V2_COLORS.blue} />,
    job_pending_sig:      <Clock size={14} color={V2_COLORS.blue} />,
    recent_job:           <Wrench size={14} color={V2_COLORS.muted} />,
    open_quote:           <MessageSquare size={14} color={V2_COLORS.blue} />,
    bill_anomaly:         <Zap size={14} color="#C94C2E" />,
    insurance_trigger:    <ShieldCheck size={14} color={V2_COLORS.blue} />,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(46,37,64,0.3)", zIndex: 200 }}
      />

      {/* Drawer panel */}
      <div style={{
        position:      "fixed",
        top:           0,
        right:         0,
        bottom:        0,
        width:         "22rem",
        maxWidth:      "100vw",
        background:    V2_COLORS.paper,
        borderLeft:    `1px solid ${V2_COLORS.border}`,
        zIndex:        201,
        display:       "flex",
        flexDirection: "column",
        overflowY:     "auto",
      }}>
        {/* Header */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "1rem 1.25rem",
          borderBottom:   `1px solid ${V2_COLORS.border}`,
          background:     V2_COLORS.paper,
          flexShrink:     0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Bell size={14} color={V2_COLORS.blue} />
            <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 600, color: V2_COLORS.ink }}>
              Activity
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted }}>
            <X size={16} />
          </button>
        </div>

        {/* Events */}
        {!feedLoaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
            <CheckCircle2 size={32} color={V2_COLORS.cobalTint} style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", letterSpacing: "0.08em", color: V2_COLORS.muted }}>
              Nothing to catch up on.
            </p>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            {events.map((event) => {
              const isUnread = event.timestamp > lastReadAt;
              return (
                <div
                  key={event.id}
                  onClick={() => { onClose(); navigate(event.href); }}
                  style={{
                    display:      "flex",
                    alignItems:   "flex-start",
                    gap:          "0.875rem",
                    padding:      "0.875rem 1.25rem",
                    borderBottom: `1px solid ${V2_COLORS.border}`,
                    background:   isUnread ? V2_COLORS.lblue : "transparent",
                    cursor:       "pointer",
                    transition:   "background 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = V2_COLORS.lblue; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? V2_COLORS.lblue : "transparent"; }}
                >
                  <div style={{ flexShrink: 0, marginTop: "0.1rem" }}>{icons[event.type]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.125rem" }}>
                      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 500, color: V2_COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.title}
                      </p>
                      {isUnread && (
                        <span style={{ width: "6px", height: "6px", background: V2_COLORS.blue, borderRadius: "50%", flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.04em", color: V2_COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {event.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
