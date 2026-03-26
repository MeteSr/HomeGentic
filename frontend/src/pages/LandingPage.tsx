import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();
  const marqueeRef = useRef<HTMLDivElement>(null);

  const s = {
    ink:   "#0E0E0C",
    paper: "#F4F1EB",
    rule:  "#C8C3B8",
    rust:  "#C94C2E",
    sage:  "#3D6B57",
    gold:  "#B89040",
    serif: "'Playfair Display', Georgia, serif" as const,
    mono:  "'IBM Plex Mono', monospace" as const,
    sans:  "'IBM Plex Sans', sans-serif" as const,
  };

  return (
    <div style={{ background: s.paper, color: s.ink, fontFamily: s.sans, overflowX: "hidden" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{
        display: "flex", alignItems: "stretch",
        borderBottom: `1px solid ${s.rule}`,
        height: "3.5rem",
      }}>
        <div style={{
          fontFamily: s.mono, fontWeight: 500, fontSize: "0.875rem",
          letterSpacing: "0.08em", textTransform: "uppercase",
          padding: "0 1.5rem", borderRight: `1px solid ${s.rule}`,
          display: "flex", alignItems: "center", flexShrink: 0,
        }}>
          Home<span style={{ color: s.rust }}>Fax</span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 1.5rem", gap: "2rem" }}>
          {["Features", "Pricing", "About"].map((l) => (
            <span key={l} style={{
              fontFamily: s.mono, fontSize: "0.688rem", letterSpacing: "0.12em",
              textTransform: "uppercase", color: "#888", cursor: "pointer",
            }}>{l}</span>
          ))}
        </div>
        <button
          onClick={() => navigate("/login")}
          style={{
            fontFamily: s.mono, fontSize: "0.688rem", letterSpacing: "0.12em",
            textTransform: "uppercase", padding: "0 1.5rem",
            background: s.ink, color: s.paper, border: "none",
            cursor: "pointer", borderLeft: `1px solid ${s.rule}`,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = s.rust; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = s.ink; }}
        >
          Get Started
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "520px" }}>
        {/* Left */}
        <div style={{
          padding: "60px 48px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          borderRight: `1px solid ${s.rule}`,
        }}>
          <div>
            <div style={{
              fontFamily: s.mono, fontSize: "0.688rem", letterSpacing: "0.18em",
              textTransform: "uppercase", color: s.rust, marginBottom: "1.5rem",
              display: "flex", alignItems: "center", gap: "0.625rem",
            }}>
              <span style={{ display: "block", width: "24px", height: "1px", background: s.rust }} />
              Home maintenance intelligence
            </div>

            <h1 style={{
              fontFamily: s.serif, fontWeight: 900, fontSize: "clamp(42px,5vw,62px)",
              lineHeight: 1.0, letterSpacing: "-1px", marginBottom: "2rem",
            }}>
              Your home,<br />
              <em style={{ fontStyle: "italic", color: s.rust }}>fully</em><br />
              accounted for.
            </h1>

            <p style={{
              fontFamily: s.sans, fontWeight: 300, fontSize: "1rem",
              lineHeight: 1.75, color: "#555", maxWidth: "420px", marginBottom: "2.5rem",
            }}>
              HomeFax tracks every repair, reminds you before things break, and builds
              the complete maintenance record your home deserves.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
              <button
                onClick={() => navigate("/login")}
                style={{
                  background: s.ink, color: s.paper,
                  fontFamily: s.mono, fontSize: "0.7rem", letterSpacing: "0.12em",
                  textTransform: "uppercase", padding: "14px 32px",
                  border: `1px solid ${s.ink}`, cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = s.rust; b.style.borderColor = s.rust;
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = s.ink; b.style.borderColor = s.ink;
                }}
              >
                Start for free
              </button>
              <button
                onClick={() => navigate("/login")}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: s.mono, fontSize: "0.7rem", letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "#888",
                  display: "flex", alignItems: "center", gap: "0.5rem",
                }}
              >
                See how it works →
              </button>
            </div>
          </div>

          <div style={{ fontFamily: s.mono, fontSize: "0.688rem", color: "#AAA", letterSpacing: "0.06em" }}>
            No credit card required &nbsp;·&nbsp; Works for any home
          </div>
        </div>

        {/* Right — blueprint */}
        <div style={{ position: "relative", background: "#E8E4DC", overflow: "hidden" }}>
          {/* Grid */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,#C8C3B8 39px,#C8C3B8 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#C8C3B8 39px,#C8C3B8 40px)",
            opacity: 0.4,
          }} />
          {/* House SVG */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-52%)" }}>
            <svg width="340" height="320" viewBox="0 0 340 320" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="40" y="148" width="260" height="148" fill="none" stroke="#0E0E0C" strokeWidth="1.5"/>
              <polyline points="20,148 170,40 320,148" fill="none" stroke="#0E0E0C" strokeWidth="1.5"/>
              <rect x="130" y="210" width="80" height="86" fill="none" stroke="#0E0E0C" strokeWidth="1"/>
              <circle cx="205" cy="254" r="4" fill="#0E0E0C"/>
              <rect x="56" y="180" width="52" height="44" fill="none" stroke="#0E0E0C" strokeWidth="1"/>
              <line x1="82" y1="180" x2="82" y2="224" stroke="#0E0E0C" strokeWidth="0.75"/>
              <line x1="56" y1="202" x2="108" y2="202" stroke="#0E0E0C" strokeWidth="0.75"/>
              <rect x="232" y="180" width="52" height="44" fill="none" stroke="#0E0E0C" strokeWidth="1"/>
              <line x1="258" y1="180" x2="258" y2="224" stroke="#0E0E0C" strokeWidth="0.75"/>
              <line x1="232" y1="202" x2="284" y2="202" stroke="#0E0E0C" strokeWidth="0.75"/>
              <line x1="40" y1="296" x2="300" y2="296" stroke="#0E0E0C" strokeWidth="1.5"/>
              <rect x="154" y="90" width="32" height="22" fill="none" stroke="#C94C2E" strokeWidth="1"/>
              <line x1="162" y1="95" x2="178" y2="107" stroke="#C94C2E" strokeWidth="0.75"/>
              <line x1="178" y1="95" x2="162" y2="107" stroke="#C94C2E" strokeWidth="0.75"/>
              <text x="56" y="172" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill="#C94C2E" letterSpacing="0.08em">LIVING ROOM</text>
              <text x="232" y="172" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill="#3D6B57" letterSpacing="0.08em">BEDROOM</text>
              <text x="136" y="264" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill="#888" letterSpacing="0.08em">ENTRY</text>
              <text x="125" y="312" fontFamily="'IBM Plex Mono',monospace" fontSize="9" fill="#B89040" letterSpacing="0.08em">HOMEFAX · REV. 01</text>
              <line x1="40" y1="148" x2="40" y2="316" stroke="#0E0E0C" strokeWidth="0.5" strokeDasharray="3,4"/>
              <text x="26" y="234" fontFamily="'IBM Plex Mono',monospace" fontSize="8" fill="#AAA" transform="rotate(-90,26,234)">11'-6"</text>
              <line x1="40" y1="316" x2="300" y2="316" stroke="#0E0E0C" strokeWidth="0.5" strokeDasharray="3,4"/>
              <text x="165" y="326" fontFamily="'IBM Plex Mono',monospace" fontSize="8" fill="#AAA" textAnchor="middle">24'-0"</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Metrics strip ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: `1px solid ${s.rule}`, borderBottom: `1px solid ${s.rule}` }}>
        {[
          { num: "47", sup: "k", label: "Homes tracked" },
          { num: "$3.2", sup: "B", label: "In repairs documented" },
          { num: "98", sup: "%", label: "Issue prevention rate" },
        ].map((m, i) => (
          <div key={m.label} style={{
            padding: "2rem 3rem",
            borderRight: i < 2 ? `1px solid ${s.rule}` : "none",
          }}>
            <div style={{ fontFamily: s.serif, fontWeight: 700, fontSize: "2.625rem", lineHeight: 1, marginBottom: "0.375rem" }}>
              {m.num}<sup style={{ fontSize: "1.25rem", verticalAlign: "super" }}>{m.sup}</sup>
            </div>
            <div style={{ fontFamily: s.mono, fontSize: "0.688rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#888" }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Marquee ──────────────────────────────────────────────────────────── */}
      <div style={{ background: s.ink, color: s.paper, padding: "0.875rem 0", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div style={{ display: "inline-block", animation: "marquee-scroll 22s linear infinite" }}>
          {["Track every repair", "Schedule maintenance", "Monitor home health", "Document appliances", "Log contractor visits", "Set smart reminders",
            "Track every repair", "Schedule maintenance", "Monitor home health", "Document appliances", "Log contractor visits", "Set smart reminders"].map((t, i) => (
            <React.Fragment key={i}>
              <span style={{ fontFamily: s.mono, fontSize: "0.75rem", letterSpacing: "0.18em", textTransform: "uppercase", marginRight: "3.5rem", display: "inline-block" }}>
                {t}
              </span>
              <span style={{ display: "inline-block", width: "5px", height: "5px", background: s.rust, borderRadius: "50%", marginRight: "3.5rem", verticalAlign: "middle" }} />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${s.rule}` }}>
        {[
          {
            num: "01",
            title: "Complete repair history",
            body: "Every fix, every contractor, every receipt — organized in a permanent record that adds real value when you sell.",
            dark: false,
          },
          {
            num: "02",
            title: "Proactive reminders",
            body: "HomeFax knows when your furnace filter is due before you do. Seasonal checklists that adapt to your actual home.",
            dark: true,
          },
          {
            num: "03",
            title: "Health score",
            body: "A single number that tells you where your home stands — and exactly what to do to improve it this month.",
            dark: false,
          },
        ].map((f, i) => (
          <div key={f.num} style={{
            padding: "3rem",
            borderRight: i < 2 ? `1px solid ${s.rule}` : "none",
            background: f.dark ? s.ink : "transparent",
            color: f.dark ? s.paper : s.ink,
          }}>
            <div style={{ fontFamily: s.mono, fontSize: "0.688rem", color: f.dark ? s.gold : s.rust, letterSpacing: "0.1em", marginBottom: "1.25rem" }}>
              {f.num}
            </div>
            <div style={{ width: "32px", height: "2px", background: f.dark ? "#444" : s.rule, marginBottom: "1.25rem" }} />
            <div style={{ fontFamily: s.serif, fontWeight: 700, fontSize: "1.375rem", lineHeight: 1.2, marginBottom: "0.875rem" }}>
              {f.title}
            </div>
            <p style={{ fontFamily: s.sans, fontWeight: 300, fontSize: "0.875rem", lineHeight: 1.7, color: f.dark ? "#AAA" : "#666" }}>
              {f.body}
            </p>
          </div>
        ))}
      </div>

      {/* ── CTA band ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto",
        alignItems: "center", padding: "3.5rem 3rem", gap: "2.5rem",
        borderBottom: `1px solid ${s.rule}`,
      }}>
        <div style={{ fontFamily: s.serif, fontWeight: 900, fontStyle: "italic", fontSize: "clamp(28px,3.5vw,44px)", lineHeight: 1.1, maxWidth: "560px" }}>
          Stop discovering problems.<br />Start preventing them.
        </div>
        <button
          onClick={() => navigate("/login")}
          style={{
            background: s.rust, color: "#fff",
            fontFamily: s.mono, fontSize: "0.7rem", letterSpacing: "0.12em",
            textTransform: "uppercase", padding: "18px 40px",
            border: "none", cursor: "pointer", whiteSpace: "nowrap",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#A83D23"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = s.rust; }}
        >
          Create your home file
        </button>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.375rem 3rem", borderTop: `1px solid ${s.rule}`,
      }}>
        <div style={{ fontFamily: s.mono, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#AAA" }}>
          Home<span style={{ color: s.rust }}>Fax</span>
        </div>
        <div style={{ fontFamily: s.mono, fontSize: "0.688rem", color: "#CCC", letterSpacing: "0.06em" }}>
          © 2026 HomeFax Inc. &nbsp;·&nbsp; All rights reserved
        </div>
      </footer>

    </div>
  );
}
