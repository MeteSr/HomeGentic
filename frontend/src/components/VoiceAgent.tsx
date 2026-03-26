import { Loader2, Mic, MicOff, Volume2, X } from "lucide-react";
import { useVoiceAgent } from "../hooks/useVoiceAgent";

export function VoiceAgent() {
  const {
    state,
    transcript,
    response,
    error,
    isSupported,
    startListening,
    stopListening,
    reset,
  } = useVoiceAgent();

  if (!isSupported) return null;

  const isListening  = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle" || state === "error";

  const hasBubble = transcript || response || error;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "0.75rem",
      }}
    >
      {/* Speech bubble */}
      {hasBubble && (
        <div
          style={{
            position: "relative",
            width: "20rem",
            background: "#0E0E0C",
            border: "1px solid #C8C3B8",
            padding: "1rem 1.25rem",
          }}
        >
          <button
            onClick={reset}
            style={{
              position: "absolute",
              top: "0.75rem",
              right: "0.75rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#7A7268",
              padding: 0,
              display: "flex",
            }}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>

          {transcript && (
            <p style={{
              marginBottom: "0.5rem",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.7rem",
              color: "#7A7268",
              fontStyle: "italic",
              paddingRight: "1.25rem",
            }}>
              "{transcript}"
            </p>
          )}

          {response && (
            <p style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: "0.8rem",
              color: "#F4F1EB",
              lineHeight: 1.55,
              paddingRight: "1.25rem",
            }}>
              {response}
              {isProcessing && (
                <span style={{
                  display: "inline-block",
                  width: "2px",
                  height: "0.875rem",
                  marginLeft: "2px",
                  backgroundColor: "#C94C2E",
                  animation: "spin 1s step-end infinite",
                  verticalAlign: "middle",
                }} />
              )}
            </p>
          )}

          {isProcessing && !response && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Loader2 size={13} color="#7A7268" style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.7rem", color: "#7A7268" }}>
                Thinking…
              </span>
            </div>
          )}

          {error && (
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.7rem", color: "#C94C2E" }}>
              {error}
            </p>
          )}
        </div>
      )}

      {/* Mic button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem" }}>
        <button
          onClick={isListening ? stopListening : isIdle ? startListening : undefined}
          disabled={isProcessing || isSpeaking}
          aria-label={isListening ? "Stop listening" : "Ask HomeFax"}
          style={{
            width: "3.25rem",
            height: "3.25rem",
            borderRadius: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid " + (isListening ? "#C94C2E" : "#0E0E0C"),
            backgroundColor: isListening ? "#C94C2E" : isProcessing || isSpeaking ? "#EDE9E0" : "#0E0E0C",
            cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {isListening  && <MicOff  size={20} color="#F4F1EB" />}
          {isProcessing && <Loader2 size={20} color="#7A7268" style={{ animation: "spin 1s linear infinite" }} />}
          {isSpeaking   && <Volume2 size={20} color="#7A7268" />}
          {isIdle       && <Mic     size={20} color="#F4F1EB" />}
        </button>

        <span style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "0.6rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#7A7268",
          userSelect: "none",
        }}>
          {isListening  && "Listening"}
          {isProcessing && "Thinking"}
          {isSpeaking   && "Speaking"}
          {isIdle       && "Ask HomeFax"}
        </span>
      </div>
    </div>
  );
}
