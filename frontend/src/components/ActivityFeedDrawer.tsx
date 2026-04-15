import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Wrench, ShieldAlert, ShieldCheck, Clock, CheckCircle2,
  AlertTriangle, MessageSquare, X, Zap,
} from "lucide-react";
import { COLORS, FONTS } from "@/theme";
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
    pending_verification: <ShieldAlert size={14} color={COLORS.plumMid} />,
    warranty_expiring:    <AlertTriangle size={14} color={COLORS.sage} />,
    job_pending_sig:      <Clock size={14} color={COLORS.sage} />,
    recent_job:           <Wrench size={14} color={COLORS.plumMid} />,
    open_quote:           <MessageSquare size={14} color={COLORS.sage} />,
    bill_anomaly:         <Zap size={14} color="#C94C2E" />,
    insurance_trigger:    <ShieldCheck size={14} color={COLORS.sage} />,
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
        background:    COLORS.white,
        borderLeft:    `1px solid ${COLORS.rule}`,
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
          borderBottom:   `1px solid ${COLORS.rule}`,
          background:     COLORS.white,
          flexShrink:     0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Bell size={14} color={COLORS.sage} />
            <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: COLORS.plum }}>
              Activity
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid }}>
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
            <CheckCircle2 size={32} color={COLORS.sageMid} style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: COLORS.plumMid }}>
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
                    borderBottom: `1px solid ${COLORS.rule}`,
                    background:   isUnread ? COLORS.sageLight : "transparent",
                    cursor:       "pointer",
                    transition:   "background 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = COLORS.sageLight; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? COLORS.sageLight : "transparent"; }}
                >
                  <div style={{ flexShrink: 0, marginTop: "0.1rem" }}>{icons[event.type]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.125rem" }}>
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: COLORS.plum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.title}
                      </p>
                      {isUnread && (
                        <span style={{ width: "6px", height: "6px", background: COLORS.sage, borderRadius: "50%", flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: COLORS.plumMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
