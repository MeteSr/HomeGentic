import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mic, MicOff, Volume2, X, History, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Paperclip } from "lucide-react";
import { useVoiceAgent } from "../hooks/useVoiceAgent";
import { COLORS, FONTS, RADIUS } from "@/theme";

/** Called by Layout's avatar menu to open the agent's file picker. */
export const voiceAgentFileInputRef: { current: HTMLInputElement | null } = { current: null };

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.mono,
};

export function VoiceAgent() {
  const navigate = useNavigate();
  const {
    state, transcript, response, error, isSupported,
    alerts, history, clearHistory, pendingImage,
    startListening, stopListening, reset,
    attachImage, clearImage, sendImageToAgent,
  } = useVoiceAgent();

  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isSupported) return null;

  const isListening  = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle" || state === "error";
  const hasBubble    = transcript || response || error;

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", right: "1.5rem",
      zIndex: 50, display: "flex", flexDirection: "column",
      alignItems: "flex-end", gap: "0.75rem",
    }}>

      {/* Speech bubble */}
      {hasBubble && (
        <div style={{
          position: "relative", width: "20rem",
          background: COLORS.plum, border: `1px solid ${COLORS.rule}`,
          padding: "1rem 1.25rem", borderRadius: RADIUS.card,
        }}>
          <button
            onClick={reset}
            style={{ position: "absolute", top: "0.75rem", right: "0.75rem", background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: 0, display: "flex" }}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>

          {transcript && (
            <p style={{ marginBottom: "0.5rem", fontFamily: S.mono, fontSize: "0.7rem", color: COLORS.plumMid, fontStyle: "italic", paddingRight: "1.25rem" }}>
              "{transcript}"
            </p>
          )}

          {response && (
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", color: COLORS.white, lineHeight: 1.55, paddingRight: "1.25rem" }}>
              {response}
              {isProcessing && (
                <span style={{ display: "inline-block", width: "2px", height: "0.875rem", marginLeft: "2px", backgroundColor: COLORS.sage, animation: "spin 1s step-end infinite", verticalAlign: "middle" }} />
              )}
            </p>
          )}

          {isProcessing && !response && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Loader2 size={13} color={COLORS.plumMid} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: COLORS.plumMid }}>Thinking…</span>
            </div>
          )}

          {error && (
            <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: COLORS.sage }}>{error}</p>
          )}
        </div>
      )}

      {/* Action history panel */}
      {history.length > 0 && (
        <div style={{ width: "20rem", background: COLORS.plum, border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.5rem 0.875rem", background: "none", border: "none", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <History size={11} color={COLORS.plumMid} />
              <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>
                Agent History ({history.length})
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {showHistory && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearHistory(); setShowHistory(false); }}
                  style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Clear
                </button>
              )}
              {showHistory ? <ChevronDown size={11} color={COLORS.plumMid} /> : <ChevronUp size={11} color={COLORS.plumMid} />}
            </div>
          </button>

          {showHistory && (
            <div style={{ borderTop: `1px solid ${COLORS.rule}`, maxHeight: "12rem", overflowY: "auto" }}>
              {history.slice(0, 20).map((action) => (
                <div key={action.id} style={{
                  display: "flex", alignItems: "flex-start", gap: "0.5rem",
                  padding: "0.5rem 0.875rem",
                  borderBottom: `1px solid rgba(212,207,200,0.15)`,
                }}>
                  {action.success
                    ? <CheckCircle size={11} color={COLORS.sage} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    : <XCircle    size={11} color={COLORS.sage}  style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: action.success ? COLORS.sage : COLORS.plumMid, marginBottom: "0.1rem" }}>
                      {action.label}
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: COLORS.plumMid, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {action.summary}
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.5rem", color: COLORS.plumMid, marginTop: "0.1rem" }}>
                      {new Date(action.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending image indicator */}
      {pendingImage && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: COLORS.plum, border: `1px solid ${COLORS.rule}`,
          padding: "0.35rem 0.75rem", borderRadius: RADIUS.sm,
        }}>
          <Paperclip size={10} color={COLORS.sage} />
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: COLORS.plumMid }}>
            Image attached — tap mic to describe it
          </span>
          <button
            onClick={clearImage}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.plumMid, padding: 0, display: "flex" }}
            aria-label="Remove image"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Mic button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem" }}>
        <button
          onClick={isListening ? stopListening : isIdle ? startListening : undefined}
          disabled={isProcessing || isSpeaking}
          aria-label={isListening ? "Stop listening" : "Ask HomeGentic"}
          style={{
            width: "3.25rem", height: "3.25rem",
            borderRadius: RADIUS.pill,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${isListening ? COLORS.sage : COLORS.plum}`,
            backgroundColor: isListening ? COLORS.sage : isProcessing || isSpeaking ? COLORS.sageLight : COLORS.plum,
            cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            boxShadow: isIdle ? "0 4px 16px rgba(46,37,64,0.2)" : "none",
          }}
        >
          {isListening  && <MicOff  size={20} color={COLORS.white} />}
          {isProcessing && <Loader2 size={20} color={COLORS.plumMid} style={{ animation: "spin 1s linear infinite" }} />}
          {isSpeaking   && <Volume2 size={20} color={COLORS.plumMid} />}
          {isIdle       && <Mic     size={20} color={COLORS.white} />}
        </button>

        <span style={{
          fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
          textTransform: "uppercase", color: S.inkLight, userSelect: "none",
        }}>
          {isListening  && "Listening"}
          {isProcessing && "Thinking"}
          {isSpeaking   && "Speaking"}
          {isIdle       && "Ask HomeGentic"}
        </span>
      </div>

      {/* Hidden file input for image attachment (16.6.1) */}
      <input
        ref={(el) => { (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; voiceAgentFileInputRef.current = el; }}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: "none" }}
        aria-label="Attach receipt or photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attachImage(file);
          e.target.value = "";
        }}
      />

    </div>
  );
}
