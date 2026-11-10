import React, { useState } from "react";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import {
  APP_HOST,
  CHATGPT_APP_NAME,
  MCP_URL,
  SAMPLE_PROMPTS,
  askUrl,
  isConnectorConnected,
  setConnectorConnected,
} from "@/services/aiConnectors";

/**
 * Settings → AI assistants: how to use HomeGentic from ChatGPT or Claude
 * through DFINITY's ICP MCP connector. Shown only when connectorsLive().
 */
export function AiAssistantsSettings() {
  const [connected, setConnected] = useState(isConnectorConnected);

  const h3: React.CSSProperties = {
    fontFamily: V2_FONTS.body,
    fontWeight: 700,
    fontSize: "1rem",
    color: V2_COLORS.ink,
    margin: "1.75rem 0 0.75rem",
  };
  const p: React.CSSProperties = {
    fontFamily: V2_FONTS.body,
    fontSize: "0.9375rem",
    color: V2_COLORS.ink,
    lineHeight: 1.6,
    margin: "0 0 0.75rem",
  };
  const code: React.CSSProperties = {
    fontFamily: V2_FONTS.mono,
    fontSize: "0.8125rem",
    background: V2_COLORS.lblue,
    padding: "0.125rem 0.375rem",
    borderRadius: 6,
    wordBreak: "break-all",
  };
  const link: React.CSSProperties = {
    fontFamily: V2_FONTS.body,
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: V2_COLORS.blue,
    textDecoration: "none",
  };

  const toggle = () => {
    const next = !connected;
    setConnectorConnected(next);
    setConnected(next);
  };

  return (
    <div>
      <h2
        style={{
          fontFamily: V2_FONTS.display,
          fontWeight: 800,
          fontSize: "1.375rem",
          color: V2_COLORS.ink,
          margin: "0 0 0.75rem",
        }}
      >
        Use HomeGentic in ChatGPT or Claude
      </h2>
      <p style={p}>
        Ask your own ChatGPT or Claude about your home. It reads the same records you see here, as you, and your
        assistant plan covers the questions, so there's no daily limit from us.
      </p>

      <h3 style={h3}>Set it up once</h3>
      <ol style={{ ...p, paddingLeft: "1.25rem" }}>
        <li>
          <strong>ChatGPT:</strong> add the "{CHATGPT_APP_NAME}" app from ChatGPT's app directory.{" "}
          <strong>Claude:</strong> in Settings → Connectors, add a custom connector with the address{" "}
          <span style={code}>{MCP_URL}</span>.
        </li>
        <li>
          Ask it to open <span style={code}>{APP_HOST}</span>, then sign in with Internet Identity, the same way you
          sign in here.
        </li>
        <li>
          Choose what it may do. <strong>Questions only</strong> lets it read your records.{" "}
          <strong>Actions &amp; questions</strong> also lets it add and change records for you, such as logging a job or
          a bill. It can't make payments or transfer a home either way.
        </li>
      </ol>
      <p style={p}>
        You can disconnect at any time in Internet Identity's settings. What the assistant reads goes to its provider
        under their privacy policy (see our Privacy Policy).
      </p>
      <label style={{ ...p, display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
        <input type="checkbox" checked={connected} onChange={toggle} />
        I've connected it (shows "Ask in ChatGPT / Claude" links on your dashboard)
      </label>

      <h3 style={h3}>Things to ask</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {SAMPLE_PROMPTS.map((q) => (
          <li
            key={q}
            style={{
              border: `1px solid ${V2_COLORS.border}`,
              borderRadius: V2_RADIUS.sm,
              padding: "0.75rem 1rem",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ ...p, margin: "0 0 0.375rem" }}>{q}</div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <a href={askUrl("chatgpt", q)} target="_blank" rel="noopener noreferrer" style={link}>
                Ask in ChatGPT
              </a>
              <a href={askUrl("claude", q)} target="_blank" rel="noopener noreferrer" style={link}>
                Ask in Claude
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
