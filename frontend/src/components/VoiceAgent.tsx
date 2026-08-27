import React, { useState, useRef } from "react";
import { Loader2, Mic, MicOff, Volume2, X, History, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Paperclip } from "lucide-react";
import { useVoiceAgent } from "../hooks/useVoiceAgent";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

/** Called by Layout's avatar menu to open the agent's file picker. */
export const voiceAgentFileInputRef: { current: HTMLInputElement | null } = { current: null };

function ProposalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: V2_COLORS.muted, flexShrink: 0, width: "4.5rem" }}>{label}</span>
      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.72rem", color: V2_COLORS.paper, lineHeight: 1.3 }}>{value}</span>
    </div>
  );
}

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  inkLight: V2_COLORS.muted,
  mono:     V2_FONTS.body,
};

export function VoiceAgent() {
  const {
    state, transcript, response, error, isSupported,
    history, clearHistory, pendingImage,
    pendingProposal,
    startListening, stopListening, reset,
    attachImage, clearImage, sendImageToAgent,
    confirmProposal, dismissProposal,
  } = useVoiceAgent();

  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isSupported) return null;

  const isListening  = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle" || state === "error";
  const hasBubble    = transcript || response || error || pendingProposal;

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", right: "1.5rem",
      zIndex: 50, display: "flex", flexDirection: "column",
      alignItems: "flex-end", gap: "0.75rem",
    }}>

      {/* Speech bubble */}
      {hasBubble && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="false"
          style={{
            position: "relative", width: "20rem",
            background: V2_COLORS.ink, border: `1px solid ${V2_COLORS.border}`,
            padding: "1rem 1.25rem", borderRadius: V2_RADIUS.card,
          }}
        >
          <button
            onClick={reset}
            style={{ position: "absolute", top: "0.75rem", right: "0.75rem", background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, padding: 0, display: "flex" }}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>

          {transcript && (
            <p style={{ marginBottom: "0.5rem", fontFamily: UI.mono, fontSize: "0.7rem", color: V2_COLORS.muted, fontStyle: "italic", paddingRight: "1.25rem" }}>
              "{transcript}"
            </p>
          )}

          {response && (
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: V2_COLORS.paper, lineHeight: 1.55, paddingRight: "1.25rem" }}>
              {response}
              {isProcessing && (
                <span style={{ display: "inline-block", width: "2px", height: "0.875rem", marginLeft: "2px", backgroundColor: V2_COLORS.blue, animation: "spin 1s step-end infinite", verticalAlign: "middle" }} />
              )}
            </p>
          )}

          {pendingProposal && (
            <div style={{
              marginTop: response ? "0.75rem" : 0,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid rgba(212,207,200,0.2)`,
              padding: "0.75rem",
            }}>
              <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: V2_COLORS.muted, marginBottom: "0.5rem" }}>
                Proposal to send
              </div>

              {pendingProposal.duplicateInfo && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: "0.375rem",
                  background: "rgba(201,76,46,0.15)", border: "1px solid rgba(201,76,46,0.35)",
                  padding: "0.375rem 0.5rem", marginBottom: "0.5rem",
                }}>
                  <AlertTriangle size={10} color={V2_COLORS.coralText} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                  <span style={{ fontFamily: UI.mono, fontSize: "0.575rem", color: V2_COLORS.coralText, lineHeight: 1.4 }}>
                    Possible duplicate — a similar job already exists (#{pendingProposal.duplicateInfo.jobId.slice(-6)}). The homeowner will decide.
                  </span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginBottom: "0.625rem" }}>
                <ProposalRow label="Service"  value={pendingProposal.serviceType} />
                <ProposalRow label="Address"  value={pendingProposal.propertyAddress} />
                <ProposalRow label="Amount"   value={`$${(pendingProposal.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <ProposalRow label="Date"     value={pendingProposal.completedDate} />
                {pendingProposal.contractorName && (
                  <ProposalRow label="Contractor" value={pendingProposal.contractorName} />
                )}
              </div>

              <div style={{ display: "flex", gap: "0.375rem" }}>
                <button
                  onClick={confirmProposal}
                  style={{
                    flex: 1, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
                    textTransform: "uppercase", padding: "0.375rem 0",
                    background: V2_COLORS.blue, border: "none", color: V2_COLORS.paper, cursor: "pointer",
                  }}
                >
                  Confirm &amp; Send
                </button>
                <button
                  onClick={dismissProposal}
                  style={{
                    flex: 1, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
                    textTransform: "uppercase", padding: "0.375rem 0",
                    background: "none", border: `1px solid rgba(212,207,200,0.3)`, color: V2_COLORS.muted, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isProcessing && !response && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Loader2 size={13} color={V2_COLORS.muted} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: V2_COLORS.muted }}>Thinking…</span>
            </div>
          )}

          {error && (
            <p style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: V2_COLORS.blue }}>{error}</p>
          )}
        </div>
      )}

      {/* Action history panel */}
      {history.length > 0 && (
        <div style={{ width: "20rem", background: V2_COLORS.ink, border: `1px solid ${V2_COLORS.border}`, borderRadius: V2_RADIUS.card, overflow: "hidden" }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.5rem 0.875rem", background: "none", border: "none", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <History size={11} color={V2_COLORS.muted} />
              <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: V2_COLORS.muted }}>
                Agent History ({history.length})
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {showHistory && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearHistory(); setShowHistory(false); }}
                  style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: V2_COLORS.blue, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Clear
                </button>
              )}
              {showHistory ? <ChevronDown size={11} color={V2_COLORS.muted} /> : <ChevronUp size={11} color={V2_COLORS.muted} />}
            </div>
          </button>

          {showHistory && (
            <div style={{ borderTop: `1px solid ${V2_COLORS.border}`, maxHeight: "12rem", overflowY: "auto" }}>
              {history.slice(0, 20).map((action) => (
                <div key={action.id} style={{
                  display: "flex", alignItems: "flex-start", gap: "0.5rem",
                  padding: "0.5rem 0.875rem",
                  borderBottom: `1px solid rgba(212,207,200,0.15)`,
                }}>
                  {action.success
                    ? <CheckCircle size={11} color={V2_COLORS.blue} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    : <XCircle    size={11} color={V2_COLORS.blue}  style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: action.success ? V2_COLORS.blue : V2_COLORS.muted, marginBottom: "0.1rem" }}>
                      {action.label}
                    </div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: V2_COLORS.muted, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {action.summary}
                    </div>
                    <div style={{ fontFamily: UI.mono, fontSize: "0.5rem", color: V2_COLORS.muted, marginTop: "0.1rem" }}>
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
          background: V2_COLORS.ink, border: `1px solid ${V2_COLORS.border}`,
          padding: "0.35rem 0.75rem", borderRadius: V2_RADIUS.sm,
        }}>
          <Paperclip size={10} color={V2_COLORS.blue} />
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: V2_COLORS.muted }}>
            Image attached — tap mic to describe it
          </span>
          <button
            onClick={clearImage}
            style={{ background: "none", border: "none", cursor: "pointer", color: V2_COLORS.muted, padding: 0, display: "flex" }}
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
            borderRadius: V2_RADIUS.pill,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${isListening ? V2_COLORS.blue : V2_COLORS.ink}`,
            backgroundColor: isListening ? V2_COLORS.blue : isProcessing || isSpeaking ? V2_COLORS.lblue : V2_COLORS.ink,
            cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            boxShadow: isIdle ? "0 4px 16px rgba(46,37,64,0.2)" : "none",
          }}
        >
          {isListening  && <MicOff  size={20} color={V2_COLORS.paper} />}
          {isProcessing && <Loader2 size={20} color={V2_COLORS.muted} style={{ animation: "spin 1s linear infinite" }} />}
          {isSpeaking   && <Volume2 size={20} color={V2_COLORS.muted} />}
          {isIdle       && <Mic     size={20} color={V2_COLORS.paper} />}
        </button>

        <span style={{
          fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
          textTransform: "uppercase", color: UI.inkLight, userSelect: "none",
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
