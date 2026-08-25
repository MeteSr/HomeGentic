import React from "react";
import { ArrowRight, MicOff, Loader2, Volume2, Mic, Sparkles } from "lucide-react";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { Card } from "./panels";
import { C, FONTS } from "./tokens";

const SUGGESTIONS = [
  "When should I replace my water heater?",
  "What maintenance is due this month?",
  "How can I increase my home value?",
  "Summarize my home maintenance history",
];

export function AIAssistantPanel() {
  const {
    state, transcript, response, error, isSupported,
    startListening, stopListening, reset, sendChat,
    fallbackNotice, quotaExhausted,
    pendingProposal, confirmProposal, dismissProposal,
  } = useVoiceAgent();
  const [inputText, setInputText] = React.useState("");

  const isListening  = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle" || state === "error";
  const hasContent   = !!(transcript || response || error);

  return (
    <Card style={{ overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "0.875rem 1rem",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem",
            background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles size={14} color="#7C3AED" />
          </div>
          <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>
            AI Assistant
          </h3>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "1rem" }}>
        {isIdle && !hasContent && (
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginBottom: "0.875rem" }}>
            Hi! I'm here to help with your home.
          </p>
        )}

        {hasContent && (
          <div style={{
            marginBottom: "0.75rem", background: "#F9FAFB",
            borderRadius: "0.5rem", padding: "0.75rem",
          }}>
            {fallbackNotice && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.6875rem", color: C.muted, marginBottom: "0.375rem" }}>
                ⓘ Agent limit reached — answering via chat
              </p>
            )}
            {transcript && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, fontStyle: "italic", marginBottom: response ? "0.375rem" : 0 }}>
                "{transcript}"
              </p>
            )}
            {isProcessing && !response && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>Thinking…</p>
            )}
            {response && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, lineHeight: 1.5 }}>{response}</p>
            )}
            {error && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.red }}>{error}</p>
            )}
            <button onClick={reset} style={{ marginTop: "0.375rem", background: "none", border: "none", cursor: "pointer", fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, padding: 0 }}>
              Clear
            </button>
          </div>
        )}

        {isIdle && !hasContent && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.875rem" }}>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginBottom: "0.125rem" }}>Try asking me:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendChat(s)}
                style={{
                  fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text,
                  background: "#F9FAFB", border: `1px solid ${C.border}`,
                  borderRadius: "0.5rem", padding: "0.5rem 0.75rem",
                  cursor: "pointer", textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB"; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {pendingProposal && (
          <div style={{
            marginBottom: "0.75rem", borderRadius: "0.5rem",
            background: C.greenBg, border: `1px solid ${C.greenBdr}`,
            padding: "0.75rem",
          }}>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600, color: C.green, marginBottom: "0.25rem" }}>Proposal</p>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text, marginBottom: "0.5rem" }}>
              {pendingProposal.serviceType} · {pendingProposal.propertyAddress} · ${(pendingProposal.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={confirmProposal} style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", padding: "0.375rem 0.875rem", background: C.green, border: "none", color: "#fff", cursor: "pointer", borderRadius: "0.375rem" }}>Confirm</button>
              <button onClick={dismissProposal} style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", padding: "0.375rem 0.875rem", background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", borderRadius: "0.375rem" }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          border: `1px solid ${C.border}`, borderRadius: "0.625rem",
          padding: "0.5rem 0.75rem", background: "#FFFFFF",
        }}>
          <input
            type="text"
            aria-label="Ask about your home"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = inputText.trim();
                if (!t || isProcessing) return;
                setInputText("");
                sendChat(t);
              }
            }}
            placeholder={quotaExhausted ? "Chat mode…" : "Ask me anything about your home…"}
            disabled={isProcessing || isListening}
            style={{
              flex: 1, border: "none", outline: "none",
              fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text,
              background: "transparent",
            }}
          />
          {inputText.trim() ? (
            <button
              onClick={() => { const t = inputText.trim(); if (t) { setInputText(""); sendChat(t); } }}
              disabled={isProcessing}
              aria-label="Send"
              style={{
                width: "1.875rem", height: "1.875rem", borderRadius: "0.375rem",
                background: C.blue, border: "none", cursor: isProcessing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <ArrowRight size={14} color="#fff" />
            </button>
          ) : isSupported ? (
            <button
              onClick={isListening ? stopListening : isIdle ? startListening : undefined}
              disabled={isProcessing || isSpeaking}
              aria-label={isListening ? "Stop listening" : "Use voice mode"}
              style={{
                background: "none", border: "none", padding: "0.125rem",
                cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center",
                color: isListening ? C.red : C.muted,
              }}
            >
              {isListening  && <MicOff size={16} />}
              {isProcessing && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
              {isSpeaking   && <Volume2 size={16} />}
              {isIdle       && <Mic size={16} />}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
