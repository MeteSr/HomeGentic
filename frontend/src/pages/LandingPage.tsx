import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { neighborReferralService } from "@/services/neighborReferral";
import { Helmet } from "react-helmet-async";

// ── Design tokens ──────────────────────────────────────────────────────────────
const BLUE   = "#2B34FF";
const YELLOW = "#FFD23F";
const CORAL  = "#FF5C39";
const INK    = "#0B0D1A";
const PAPER  = "#FCFCFD";
const MUTED  = "#6B7080";
const MUTED2 = "#5A5F70";
const BORDER = "#EDEEF2";
const LBLUE  = "#F3F4FF";  // light blue card bg
const VBADGE = "#E0E2FF";  // verified badge bg

const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";
const BODY    = "'Hanken Grotesk', sans-serif";
const MONO    = "'JetBrains Mono', monospace";

// ── Keyframe CSS ───────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes hgwMarquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes hgwRise {
  from { transform: translateY(22px); }
  to   { transform: translateY(0); }
}
@keyframes hgwPulse {
  0%   { opacity: 0.7; transform: scale(1); }
  100% { opacity: 0;   transform: scale(1.9); }
}
@keyframes hgwBar {
  0%, 100% { transform: scaleY(0.35); }
  50%      { transform: scaleY(1); }
}
@keyframes hgwSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

// ── Logo ───────────────────────────────────────────────────────────────────────
function Logo({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  const bodyColor  = dark ? BLUE  : PAPER;
  const strokeColor = dark ? PAPER : BLUE;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M14 2.4 25.4 11.2V24a1.8 1.8 0 0 1-1.8 1.8H4.4A1.8 1.8 0 0 1 2.6 24V11.2z" fill={bodyColor} />
      <path d="M14 2.4 25.4 11.2H2.6z" fill={YELLOW} />
      <path d="m9.4 17.2 3.4 3.4 6.4-6.6" stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Property record card (hero right) ─────────────────────────────────────────
const LEDGER = [
  { title: "Roof replacement",     meta: "Harpeth Roofing · $14,200 · Jun 2025", tag: "VERIFIED",  bg: LBLUE,       tagColor: BLUE,     tagBg: VBADGE    },
  { title: "Panel upgrade to 200A",meta: "Eastside Electric · $3,850 · Apr 2024",tag: "VERIFIED",  bg: LBLUE,       tagColor: BLUE,     tagBg: VBADGE    },
  { title: "Water heater · 14 yrs",meta: "Past its 10-year rated life",           tag: "AT RISK",  bg: LBLUE,       tagColor: "#8C2402",tagBg: "#FFDCD3" },
  { title: "Gutter cleaning",      meta: "Bell & Sons · $180 · Aug 2026",         tag: "VERIFIED",  bg: LBLUE,       tagColor: BLUE,     tagBg: VBADGE    },
];

function PropertyCard() {
  return (
    <div style={{ background: PAPER, borderRadius: 28, padding: 26, boxShadow: `0 44px 90px rgba(11,13,26,0.4)` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: MUTED2 }}>412 ELDER ST · 37206</div>
          <div style={{ font: `700 20px/1.2 ${DISPLAY}`, color: INK, letterSpacing: "-.03em", marginTop: 8 }}>Property record</div>
        </div>
        <div style={{ flexShrink: 0, width: 76, height: 76, borderRadius: "50%", background: BLUE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ font: `800 30px/1 ${DISPLAY}`, color: PAPER, letterSpacing: "-.04em" }}>82</div>
          <div style={{ font: `700 9px/1 ${MONO}`, color: YELLOW, marginTop: 3 }}>GRADE A</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
        {LEDGER.map((e) => (
          <div key={e.title} style={{ background: e.bg, borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14.5px/1.3 ${BODY}`, color: INK }}>{e.title}</div>
              <div style={{ font: `400 12.5px/1.3 ${BODY}`, color: MUTED2, marginTop: 5 }}>{e.meta}</div>
            </div>
            <div style={{ flexShrink: 0, font: `700 8.5px/1 ${MONO}`, letterSpacing: ".1em", color: e.tagColor, background: e.tagBg, borderRadius: 100, padding: "6px 9px" }}>{e.tag}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <div style={{ font: `500 12px/1.45 ${BODY}`, color: MUTED2 }}>Stored on Internet Computer Protocol · Record #HG-2026-04129</div>
      </div>
    </div>
  );
}

// ── Voice orb ──────────────────────────────────────────────────────────────────
type VoiceMode = "listening" | "thinking" | "speaking" | "idle";

function MicIcon({ stroke }: { stroke: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v4" /><path d="M8 22h8" />
    </svg>
  );
}

function VoiceOrb({ mode }: { mode: VoiceMode }) {
  if (mode === "listening") {
    return (
      <div style={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${BLUE}`, animation: `hgwPulse 2.1s ease-out infinite`, animationDelay: `${i * 0.7}s` }} />
        ))}
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: BLUE, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MicIcon stroke={PAPER} />
        </div>
      </div>
    );
  }
  if (mode === "speaking") {
    return (
      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
        {[0.9, 0.5, 1.3, 0.7, 1.1, 0.4, 1.0].map((d, i) => (
          <div key={i} style={{ width: 7, height: 50, borderRadius: 100, background: BLUE, animation: `hgwBar 0.9s ease-in-out infinite`, animationDelay: `-${d}s` }} />
        ))}
      </div>
    );
  }
  if (mode === "thinking") {
    return (
      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" style={{ animation: "hgwSpin 1s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MicIcon stroke={INK} />
      </div>
    </div>
  );
}

// ── Voice demo ─────────────────────────────────────────────────────────────────
const DEMO_Q  = "What maintenance is due this month?";
const DEMO_A  = "Three things. Gutter cleaning is due in four days — Bell & Sons did it in May for $180 and they have Friday open. Your HVAC filter is due September 2nd, and the chimney inspection is annual, due the 9th. Want me to book the gutters?";

function VoiceDemo() {
  const [mode, setMode]         = useState<VoiceMode>("idle");
  const [transcript, setTrans]  = useState("");
  const [response, setResp]     = useState("");
  const [proposal, setProposal] = useState<"none" | "pending" | "confirmed">("none");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    function cycle() {
      clear();
      setMode("listening"); setTrans(""); setResp(""); setProposal("none");
      const qWords = DEMO_Q.split(" ");
      qWords.forEach((w, i) => later(() => setTrans((p) => p ? p + " " + w : w), 800 + i * 130));
      const heard = 800 + qWords.length * 130;
      later(() => setMode("thinking"), heard + 300);
      later(() => { setMode("speaking"); setTrans(DEMO_Q); }, heard + 1400);
      const aWords = DEMO_A.split(" ");
      aWords.forEach((w, i) => later(() => setResp((p) => p ? p + " " + w : w), heard + 1500 + i * 65));
      const done = heard + 1600 + aWords.length * 65;
      later(() => { setMode("idle"); setProposal("pending"); }, done);
      later(() => setProposal("confirmed"), done + 2000);
      later(() => cycle(), done + 5000);
    }
    cycle();
    return clear;
  }, []);

  const stateLabel = mode === "listening" ? "LISTENING" : mode === "thinking" ? "THINKING" : mode === "speaking" ? "SPEAKING" : "READY";
  const stateColor = mode === "idle" ? INK : PAPER;
  const stateBg    = mode === "idle" ? YELLOW : mode === "listening" ? "rgba(255,255,255,0.18)" : mode === "thinking" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.18)";

  return (
    <div style={{ background: PAPER, borderRadius: 28, padding: 24, boxShadow: "0 30px 70px rgba(0,0,0,0.4)", height: 560, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ font: `700 15px/1 ${DISPLAY}`, letterSpacing: "-.02em", color: INK }}>Ask about your home</div>
        <div style={{ flex: 1 }} />
        <div style={{ font: `700 9px/1 ${MONO}`, letterSpacing: ".12em", color: stateColor, background: stateBg, borderRadius: 100, padding: "6px 10px", flexShrink: 0 }}>{stateLabel}</div>
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0 2px", flexShrink: 0 }}>
        <VoiceOrb mode={mode} />
        <div style={{ font: `500 12.5px/1.4 ${BODY}`, color: MUTED, marginTop: 14, textAlign: "center", minHeight: 18 }}>
          {mode === "listening" ? "Listening…" : mode === "thinking" ? "Checking your record…" : mode === "speaking" ? "Speaking" : "Tap to ask"}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 16, borderRadius: 20, background: "#F3F4FF", flex: 1, minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}>
        {transcript && (
          <div style={{ font: `400 13.5px/1.5 ${BODY}`, color: MUTED2, fontStyle: "italic" }}>"{transcript}"</div>
        )}
        {mode === "thinking" && (
          <div style={{ font: `400 13.5px/1.5 ${BODY}`, color: MUTED, marginTop: 9 }}>Checking your record…</div>
        )}
        {response && (
          <div style={{ font: `400 13.5px/1.6 ${BODY}`, color: INK, marginTop: 10 }}>{response}</div>
        )}
      </div>

      <div style={{ flexShrink: 0, minHeight: 110, boxSizing: "border-box" }}>
        {proposal === "pending" && (
          <div style={{ marginTop: 12, padding: 16, borderRadius: 20, background: "#E0E2FF" }}>
            <div style={{ font: `700 9px/1 ${MONO}`, letterSpacing: ".12em", color: BLUE }}>PROPOSAL</div>
            <div style={{ font: `500 13.5px/1.5 ${BODY}`, color: INK, marginTop: 8 }}>Gutter cleaning · Bell & Sons · Fri Aug 21 · $180.00</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setProposal("confirmed")} style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", padding: "12px 22px", borderRadius: 100, background: BLUE, color: PAPER, font: `700 13.5px/1 ${BODY}`, border: "none" }}>Confirm</button>
              <button onClick={() => setProposal("none")} style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", padding: "12px 18px", borderRadius: 100, background: "transparent", border: `1.5px solid #B9BDF5`, color: MUTED2, font: `600 13.5px/1 ${BODY}` }}>Not now</button>
            </div>
          </div>
        )}
        {proposal === "confirmed" && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "15px 16px", borderRadius: 20, background: YELLOW }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" />
            </svg>
            <div style={{ font: `600 12.5px/1.4 ${BODY}`, color: INK }}>Booked for Aug 21, and logged as a verified job.</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "7px 10px 7px 16px", border: `1.5px solid #E6E7EE`, borderRadius: 100, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, font: `400 13.5px/1.2 ${BODY}`, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Ask anything about your home…
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 100, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: BLUE }}>
          <MicIcon stroke={PAPER} />
        </div>
      </div>
    </div>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────
const MARQUEE_ITEMS = [
  "ROOF · VERIFIED", "HVAC SERVICE · VERIFIED", "PANEL UPGRADE · VERIFIED",
  "WATER HEATER · FLAGGED", "GUTTERS · VERIFIED", "RADON TEST · VERIFIED",
  "FURNACE · VERIFIED", "WINDOWS · VERIFIED", "PLUMBING · VERIFIED",
];

const STEPS = [
  {
    num: "01", title: "Log the work",
    body: "Add a repair in under a minute — service type, date, cost, and a photo of the receipt. Past work counts, going back as far as you have paperwork.",
    bg: LBLUE, numBg: BLUE, numColor: PAPER, titleColor: INK, bodyColor: MUTED2,
  },
  {
    num: "02", title: "The contractor signs it",
    body: "The pro who did the job confirms it from their side. Both signatures make the record permanent: neither of you can quietly edit it later.",
    bg: BLUE, numBg: YELLOW, numColor: INK, titleColor: PAPER, bodyColor: PAPER,
  },
  {
    num: "03", title: "Share the proof",
    body: "Generate a report for a buyer, an agent, or an insurer as a link that shows verified work only. No spreadsheet, no shoebox of receipts.",
    bg: LBLUE, numBg: BLUE, numColor: PAPER, titleColor: INK, bodyColor: MUTED2,
  },
];

const SCORE_FACTORS = [
  { label: "Verified jobs",         max: "40 pts", pct: "100%", color: YELLOW },
  { label: "Documented value",      max: "20 pts", pct: "52%",  color: "#6E77FF" },
  { label: "Property verification", max: "20 pts", pct: "50%",  color: "#6E77FF" },
  { label: "Job diversity",         max: "20 pts", pct: "100%", color: YELLOW },
];

const PULSE_ITEMS = [
  { title: "Gutter cleaning", tag: "DUE NOW",  tone: CORAL,  chipColor: "#8C2402",  chipBg: "#FFDCD3", body: "Bell & Sons quoted $180 in May. They have Friday open." },
  { title: "HVAC filter",     tag: "DUE SEP 2",tone: YELLOW, chipColor: "#8A6800",chipBg: "#FFF0B0",body: "Last replaced 84 days ago. Rated for 90 days." },
  { title: "Chimney",         tag: "ANNUAL",   tone: BLUE,   chipColor: BLUE,   chipBg: VBADGE,    body: "Last inspected Oct 2024. Due before first fire of the season." },
];

const FEATURES = [
  {
    span: 2, kicker: "MAINTENANCE", title: "Reminders that read your house",
    desc: "Recurring services, seasonal priorities for your climate zone, and predictive flags when a system passes its rated life — so the water heater gets replaced before it floods the utility room.",
    bg: YELLOW, border: YELLOW, kickerColor: INK, titleColor: INK, bodyColor: "rgba(11,13,26,0.72)",
  },
  {
    span: 1, kicker: "VERIFICATION", title: "Dual-signature jobs",
    desc: "Verified by both homeowner and contractor, creating a record neither party can alter.",
    bg: PAPER, border: BORDER, kickerColor: MUTED, titleColor: INK, bodyColor: MUTED2,
  },
  {
    span: 1, kicker: "REPORTS", title: "Shareable proof",
    desc: "Tamper-proof reports with links for insurance, buyers, or contractors.",
    bg: PAPER, border: BORDER, kickerColor: MUTED, titleColor: INK, bodyColor: MUTED2,
  },
  {
    span: 1, kicker: "MARKET", title: "What the work is worth",
    desc: "See which projects return the most in your zip code before you spend.",
    bg: BLUE, border: BLUE, kickerColor: YELLOW, titleColor: PAPER, bodyColor: PAPER,
  },
  {
    span: 1, kicker: "ALERTS", title: "Warnings before penalties",
    desc: "Expiring warranties and aging systems surface while there is still time to act.",
    bg: INK, border: INK, kickerColor: YELLOW, titleColor: PAPER, bodyColor: PAPER,
  },
];

const PLANS = [
  {
    tier: "Basic", sub: "For homeowners getting started", price: "$10",
    features: ["1 property", "Maintenance tracking", "Verified job records", "Shareable reports"],
    tag: null as string | null, tagBg: YELLOW,
    bg: PAPER, border: BORDER, shadow: "none",
    titleColor: INK, subColor: MUTED,
    ctaBg: "transparent", ctaBorder: BLUE, ctaColor: BLUE, cta: "Get started",
    checkBg: LBLUE, checkColor: BLUE,
  },
  {
    tier: "Pro", sub: "For growing homeowners", price: "$20",
    features: ["Up to 5 properties", "All Basic features", "Voice AI assistant", "Priority support"],
    tag: "MOST POPULAR", tagBg: YELLOW,
    bg: BLUE, border: BLUE, shadow: "0 20px 60px rgba(43,52,255,0.4)",
    titleColor: PAPER, subColor: PAPER,
    ctaBg: YELLOW, ctaBorder: YELLOW, ctaColor: INK, cta: "Get Pro",
    checkBg: "rgba(252,252,253,0.2)", checkColor: PAPER,
  },
  {
    tier: "Premium", sub: "For power users", price: "$40",
    features: ["Up to 20 properties", "All Pro features", "20 AI calls/day", "White-glove support"],
    tag: null, tagBg: YELLOW,
    bg: INK, border: INK, shadow: "0 20px 60px rgba(11,13,26,0.4)",
    titleColor: PAPER, subColor: PAPER,
    ctaBg: YELLOW, ctaBorder: YELLOW, ctaColor: INK, cta: "Get Premium",
    checkBg: "rgba(252,252,253,0.15)", checkColor: PAPER,
  },
];

// ── Hover helper ───────────────────────────────────────────────────────────────
function useHover() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  };
}

// ── Nav link ───────────────────────────────────────────────────────────────────
function NavLink({ label, onClick }: { label: string; onClick: () => void }) {
  const { hovered, handlers } = useHover();
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      style={{
        font: `600 13.5px/1 ${BODY}`, color: hovered ? INK : PAPER,
        cursor: "pointer", padding: "10px 16px", borderRadius: 100,
        background: hovered ? PAPER : "transparent",
        border: "none",
        transition: "background-color .18s, color .18s",
      }}
    >
      {label}
    </button>
  );
}

// ── Pill button ────────────────────────────────────────────────────────────────
function PillBtn({
  label, onClick, variant = "yellow", size = "md",
}: {
  label: string;
  onClick: () => void;
  variant?: "yellow" | "glass" | "outline";
  size?: "md" | "lg";
}) {
  const { hovered, handlers } = useHover();
  const pad = size === "lg" ? "18px 32px" : "13px 24px";
  const fontSize = size === "lg" ? 16 : 14;
  const minH = size === "lg" ? 56 : 46;

  let bg = YELLOW, color = INK, border = `1.5px solid ${YELLOW}`, shadow = "";
  if (variant === "glass") { bg = "rgba(252,252,253,0.14)"; color = PAPER; border = `1.5px solid rgba(252,252,253,0.4)`; }
  if (variant === "outline") { bg = "transparent"; color = BLUE; border = `1.5px solid ${BLUE}`; }

  const hoverTransform = hovered ? "translateY(-3px)" : "none";
  const hoverShadow = hovered && variant === "yellow" ? "0 16px 36px rgba(11,13,26,0.3)" : "";

  return (
    <button
      onClick={onClick}
      {...handlers}
      style={{
        cursor: "pointer", boxSizing: "border-box", minHeight: minH,
        display: "inline-flex", alignItems: "center", padding: pad,
        borderRadius: 100, background: bg, border, color,
        font: `700 ${fontSize}px/1 ${BODY}`, whiteSpace: "nowrap",
        transition: "transform .2s, box-shadow .2s",
        transform: hoverTransform, boxShadow: hoverShadow || shadow,
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) neighborReferralService.capturePendingRefCode(ref);
  }, [searchParams]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const marqueeItems = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <>
      <Helmet>
        <title>HomeGentic™ — Your house keeps receipts.</title>
        <meta name="description" content="HomeGentic keeps every repair in one verified record, signed by the contractor who did the work and stored where nobody can edit it." />
        <meta property="og:title" content="HomeGentic™ — Your house keeps receipts." />
        <meta property="og:description" content="Verified home maintenance records on the Internet Computer. One number buyers, agents, and insurers can trust." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "HomeGentic",
          "url": "https://homegentic.app",
          "description": "Verified home maintenance records on the Internet Computer. One number buyers, agents, and insurers can trust.",
        })}</script>
      </Helmet>

      <style>{KEYFRAMES}</style>

      <div style={{ width: "100%", background: PAPER, color: INK, overflowX: "hidden" }}>

        {/* ── Nav ── */}
        <div style={{ background: BLUE, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72, gap: 24, boxSizing: "border-box" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}>
              <Logo size={26} />
              <span style={{ font: `800 20px/1 ${DISPLAY}`, letterSpacing: "-.03em", color: PAPER, whiteSpace: "nowrap" }}>
                Home<span style={{ color: YELLOW }}>Gentic</span>
              </span>
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(11,13,26,0.18)", borderRadius: 100, padding: 6 }}>
              <NavLink label="The record" onClick={() => scrollTo("hg-how")} />
              <NavLink label="The score"  onClick={() => scrollTo("hg-score")} />
              <NavLink label="Pricing"    onClick={() => scrollTo("hg-pricing")} />
              <NavLink label="Contractors" onClick={() => navigate("/for-pros")} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => navigate("/login")} style={{ cursor: "pointer", font: `600 14px/1 ${BODY}`, color: PAPER, background: "none", border: "none", padding: "12px 6px" }}>
                Log in
              </button>
              <PillBtn label="Start free" onClick={() => navigate("/login")} variant="yellow" />
            </div>
          </div>
        </div>

        {/* ── Hero ── */}
        <div style={{ background: BLUE, position: "relative", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", top: -180, right: -140, width: 620, height: 620, borderRadius: "50%", background: "#3D46FF", pointerEvents: "none" }} />
          <div aria-hidden="true" style={{ position: "absolute", bottom: -260, left: -120, width: 520, height: 520, borderRadius: "50%", background: "#1F27E8", pointerEvents: "none" }} />
          <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "72px 40px 108px", boxSizing: "border-box" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 460px", gap: 56, alignItems: "center" }}>
              <div style={{ minWidth: 0, animation: "hgwRise .6s cubic-bezier(.2,.8,.3,1) both" }}>
                <h1 style={{ font: `800 80px/.94 ${DISPLAY}`, color: PAPER, letterSpacing: "-.045em", margin: 0, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                  Your house<br />keeps <span style={{ color: YELLOW }}>receipts</span>.
                </h1>
                <p style={{ font: `400 19px/1.6 ${BODY}`, color: PAPER, marginTop: 24, maxWidth: 500, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                  The roof, the rewire, the furnace you replaced in a cold snap. HomeGentic keeps every job in one record, signed by the contractor who did the work and stored where nobody can edit it.
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 38, flexWrap: "wrap", alignItems: "center" }}>
                  <PillBtn label="Start your record" onClick={() => navigate("/login")} variant="yellow" size="lg" />
                  <PillBtn label="See a sample report" onClick={() => navigate("/sample-report")} variant="glass" size="lg" />
                </div>
              </div>
              <div style={{ flexShrink: 0, animation: "hgwRise .7s cubic-bezier(.2,.8,.3,1) both", animationDelay: ".12s" }}>
                <PropertyCard />
              </div>
            </div>
          </div>
        </div>

        {/* ── Marquee ── */}
        <div style={{ background: YELLOW, padding: "20px 0", overflow: "hidden" }}>
          <div style={{ display: "flex", width: "max-content", animation: "hgwMarquee 34s linear infinite" }}>
            {marqueeItems.map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, padding: "0 22px", whiteSpace: "nowrap" }}>
                <div style={{ font: `700 15px/1 ${MONO}`, letterSpacing: "-.01em", color: INK }}>{label}</div>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: BLUE, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* ── How It Works ── */}
        <div id="hg-how" style={{ maxWidth: 1280, margin: "0 auto", padding: "104px 40px 0", boxSizing: "border-box" }}>
          <div style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".18em", color: MUTED }}>HOW IT WORKS</div>
          <div style={{ font: `800 52px/1.04 ${DISPLAY}`, color: INK, letterSpacing: "-.04em", marginTop: 18, maxWidth: 660, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
            Three steps, then the record keeps itself.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20, marginTop: 48 }}>
            {STEPS.map((st) => (
              <StepCard key={st.num} step={st} />
            ))}
          </div>
        </div>

        {/* ── The Score ── */}
        <div id="hg-score" style={{ maxWidth: 1280, margin: "0 auto", padding: "104px 40px 0", boxSizing: "border-box" }}>
          <div style={{ background: INK, borderRadius: 34, padding: 56, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 56, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".18em", color: YELLOW }}>THE SCORE</div>
              <div style={{ font: `800 42px/1.08 ${DISPLAY}`, color: PAPER, letterSpacing: "-.04em", marginTop: 18, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                One number a buyer, an agent or an insurer can check.
              </div>
              <p style={{ font: `400 16.5px/1.66 ${BODY}`, color: PAPER, marginTop: 18, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                Every verified job, receipt and inspection adds points. Lapsed warranties, aging systems and long gaps take them away, so the score reflects the house as it is today — not the day you signed up.
              </p>
              <PillBtn label="See a sample report" onClick={() => navigate("/sample-report")} variant="yellow" />
            </div>
            <div style={{ minWidth: 0, background: "rgba(252,252,253,0.06)", border: "1px solid rgba(252,252,253,0.14)", borderRadius: 26, padding: 30 }}>
              <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: PAPER }}>WHERE THE POINTS COME FROM</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 22 }}>
                {SCORE_FACTORS.map((f) => (
                  <div key={f.label}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ font: `600 14.5px/1.3 ${BODY}`, color: PAPER }}>{f.label}</div>
                      <div style={{ font: `500 12px/1 ${MONO}`, color: PAPER, flexShrink: 0 }}>{f.max}</div>
                    </div>
                    <div style={{ height: 6, borderRadius: 100, background: "rgba(252,252,253,0.12)", marginTop: 9, overflow: "hidden" }}>
                      <div style={{ height: 6, width: f.pct, background: f.color, borderRadius: 100 }} />
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ font: `400 13px/1.6 ${BODY}`, color: PAPER, marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(252,252,253,0.12)", textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                Points are capped per category, so a hundred filter changes never outweigh a verified roof.
              </p>
            </div>
          </div>
        </div>

        {/* ── AI Section ── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "104px 40px 0", boxSizing: "border-box" }}>
          <div style={{ background: BLUE, borderRadius: 34, padding: 56, position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", top: -200, left: -120, width: 520, height: 520, borderRadius: "50%", background: "#3D46FF", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".18em", color: YELLOW }}>ASK IT ANYTHING</div>
              <div style={{ font: `800 46px/1.06 ${DISPLAY}`, color: PAPER, letterSpacing: "-.04em", marginTop: 18, maxWidth: 720, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                It knows your house, not houses in general.
              </div>
              <p style={{ font: `400 16.5px/1.66 ${BODY}`, color: PAPER, marginTop: 18, maxWidth: 620, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                Ask out loud and the answer comes from your own record — the job, the contractor who did it last time, the price they charged. It can book the next one while you are still standing in the driveway.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,420px) minmax(0,1fr)", gap: 32, marginTop: 44, alignItems: "start" }}>
                <VoiceDemo />
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ background: "rgba(252,252,253,0.08)", border: "1px solid rgba(252,252,253,0.14)", borderRadius: 26, padding: 30 }}>
                    <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: PAPER }}>MONDAY BRIEFING · ZONE 4 · SUMMER</div>
                    <div style={{ font: `700 26px/1.2 ${DISPLAY}`, color: PAPER, letterSpacing: "-.03em", marginTop: 14, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                      Every Monday, your house tells you what it needs.
                    </div>
                    <p style={{ font: `400 15px/1.62 ${BODY}`, color: PAPER, marginTop: 12, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                      Not a generic checklist. The briefing reads the age of each system, your climate zone and the season, then ranks what actually matters this week.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
                      {PULSE_ITEMS.map((pi) => (
                        <div key={pi.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                          <div style={{ width: 4, borderRadius: 100, background: pi.tone, flexShrink: 0, alignSelf: "stretch" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                              <div style={{ font: `600 15px/1.3 ${BODY}`, color: PAPER }}>{pi.title}</div>
                              <div style={{ font: `700 8.5px/1 ${MONO}`, letterSpacing: ".1em", color: pi.chipColor, background: pi.chipBg, borderRadius: 100, padding: "5px 9px" }}>{pi.tag}</div>
                            </div>
                            <div style={{ font: `400 13.5px/1.55 ${BODY}`, color: PAPER, marginTop: 6 }}>{pi.body}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ font: `500 13px/1.5 ${BODY}`, color: PAPER }}>
                    Voice runs in your browser · Chrome today, more soon
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── What You Get ── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "104px 40px 0", boxSizing: "border-box" }}>
          <div style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".18em", color: MUTED }}>WHAT YOU GET</div>
          <div style={{ font: `800 52px/1.04 ${DISPLAY}`, color: INK, letterSpacing: "-.04em", marginTop: 18, maxWidth: 720, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
            Built for the years you own the house, not just the week you sell it.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20, marginTop: 48 }}>
            {FEATURES.map((ft) => (
              <FeatureCard key={ft.title} feature={ft} />
            ))}
          </div>
        </div>

        {/* ── Pricing ── */}
        <div id="hg-pricing" style={{ maxWidth: 1280, margin: "0 auto", padding: "104px 40px 0", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
            <div style={{ maxWidth: 620 }}>
              <div style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".18em", color: MUTED }}>PRICING</div>
              <div style={{ font: `800 52px/1.04 ${DISPLAY}`, color: INK, letterSpacing: "-.04em", marginTop: 18, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                Priced under a single service call.
              </div>
            </div>
            <p style={{ font: `400 15px/1.62 ${BODY}`, color: MUTED2, maxWidth: 340, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
              Every plan keeps your records permanently and includes shareable reports. Contractors have their own free plan.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20, marginTop: 48, alignItems: "stretch" }}>
            {PLANS.map((pl) => (
              <PlanCard key={pl.tier} plan={pl} onStart={() => navigate("/login")} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 28, font: `500 13.5px/1 ${BODY}`, color: MUTED }}>
            <span>30-day money-back guarantee</span>
            <span aria-hidden="true" style={{ color: "#C9CCD6" }}>·</span>
            <span>Cancel anytime</span>
            <span aria-hidden="true" style={{ color: "#C9CCD6" }}>·</span>
            <span>Your records stay yours if you leave</span>
          </div>
        </div>

        {/* ── CTA Band ── */}
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "104px 40px", boxSizing: "border-box" }}>
          <div style={{ background: BLUE, borderRadius: 34, padding: "72px 56px", position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", top: -140, right: -80, width: 460, height: 460, borderRadius: "50%", background: "#3D46FF", pointerEvents: "none" }} />
            <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48, flexWrap: "wrap" }}>
              <div style={{ maxWidth: 580 }}>
                <div style={{ font: `800 46px/1.06 ${DISPLAY}`, color: PAPER, letterSpacing: "-.04em", textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                  Start with the last repair you paid for.
                </div>
                <p style={{ font: `400 16.5px/1.62 ${BODY}`, color: PAPER, marginTop: 16, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                  One receipt is enough to open a record. Free for a single property, and the record is yours whether you stay or go.
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <PillBtn label="Get started" onClick={() => navigate("/login")} variant="yellow" size="lg" />
                <PillBtn label="Talk to us" onClick={() => navigate("/support")} variant="glass" size="lg" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer style={{ borderTop: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 40px 28px", boxSizing: "border-box", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 48, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 320 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Logo size={26} dark />
                <div style={{ font: `800 18px/1 ${DISPLAY}`, letterSpacing: "-.03em", color: INK }}>
                  Home<span style={{ color: BLUE }}>Gentic</span>
                </div>
              </div>
              <p style={{ font: `400 13px/1.65 ${BODY}`, color: MUTED, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>
                Records are stored on the Internet Computer Protocol — permanent, tamper-proof, and yours to export at any time.
              </p>
            </div>
            <div style={{ display: "flex", gap: 64, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: MUTED }}>PRODUCT</div>
                {["The record", "The score", "Pricing", "For contractors"].map((l) => (
                  <FooterLink key={l} label={l} onClick={() => l === "For contractors" ? navigate("/for-pros") : scrollTo(l === "Pricing" ? "hg-pricing" : l === "The score" ? "hg-score" : "hg-how")} />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: MUTED }}>COMPANY</div>
                {[
                  { label: "Security",  path: "/support" },
                  { label: "Privacy",   path: "/privacy" },
                  { label: "Terms",     path: "/terms" },
                  { label: "Contact",   path: "/support" },
                ].map((l) => (
                  <FooterLink key={l.label} label={l.label} onClick={() => navigate(l.path)} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px 44px", boxSizing: "border-box", font: `500 12.5px/1 ${BODY}`, color: MUTED }}>
            © 2026 HomeGentic · Nashville, TN
          </div>
        </footer>

      </div>
    </>
  );
}

// ── Sub-components (defined after main to keep exports clean) ──────────────────

function StepCard({ step }: { step: typeof STEPS[number] }) {
  const { hovered, handlers } = useHover();
  return (
    <div
      {...handlers}
      style={{
        minWidth: 0, background: step.bg, borderRadius: 26, padding: 32,
        transition: "transform .2s", transform: hovered ? "translateY(-4px)" : "none",
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 100, background: step.numBg, display: "flex", alignItems: "center", justifyContent: "center", font: `800 17px/1 ${DISPLAY}`, color: step.numColor }}>
        {step.num}
      </div>
      <div style={{ font: `700 24px/1.16 ${DISPLAY}`, color: step.titleColor, letterSpacing: "-.03em", marginTop: 22 }}>{step.title}</div>
      <p style={{ font: `400 15px/1.62 ${BODY}`, color: step.bodyColor, marginTop: 12, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>{step.body}</p>
    </div>
  );
}

function FeatureCard({ feature: ft }: { feature: typeof FEATURES[number] }) {
  const { hovered, handlers } = useHover();
  return (
    <div
      {...handlers}
      style={{
        minWidth: 0, gridColumn: `span ${ft.span}`,
        background: ft.bg, border: `1px solid ${ft.border}`, borderRadius: 26, padding: 30,
        transition: "transform .2s", transform: hovered ? "translateY(-4px)" : "none",
      }}
    >
      <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: ft.kickerColor }}>{ft.kicker}</div>
      <div style={{ font: `700 22px/1.2 ${DISPLAY}`, color: ft.titleColor, letterSpacing: "-.03em", marginTop: 16 }}>{ft.title}</div>
      <p style={{ font: `400 15px/1.62 ${BODY}`, color: ft.bodyColor, marginTop: 11, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>{ft.desc}</p>
    </div>
  );
}

function PlanCard({ plan: pl, onStart }: { plan: typeof PLANS[number]; onStart: () => void }) {
  const { hovered: btnHovered, handlers: btnHandlers } = useHover();
  const planFeatures = ["1 property", "Up to 5 properties", "Up to 20 properties"];
  return (
    <div style={{ minWidth: 0, background: pl.bg, border: `1.5px solid ${pl.border}`, borderRadius: 28, padding: 32, display: "flex", flexDirection: "column", boxShadow: pl.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ font: `700 20px/1 ${DISPLAY}`, color: pl.titleColor, letterSpacing: "-.03em" }}>{pl.tier}</div>
        {pl.tag && (
          <div style={{ font: `700 8.5px/1 ${MONO}`, letterSpacing: ".12em", color: INK, background: pl.tagBg, borderRadius: 100, padding: "6px 10px" }}>{pl.tag}</div>
        )}
      </div>
      <div style={{ font: `400 14px/1.5 ${BODY}`, color: pl.subColor, marginTop: 10 }}>{pl.sub}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 24 }}>
        <div style={{ font: `800 46px/1 ${DISPLAY}`, color: pl.titleColor, letterSpacing: "-.045em" }}>{pl.price}</div>
        <div style={{ font: `400 14px/1 ${BODY}`, color: pl.subColor }}>/month</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
        {pl.features.map((pf) => (
          <div key={pf} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: pl.checkBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={pl.checkColor} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </div>
            <div style={{ font: `400 14.5px/1.45 ${BODY}`, color: pl.titleColor === PAPER ? PAPER : MUTED2 }}>{pf}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 28 }} />
      <button
        onClick={onStart}
        {...btnHandlers}
        style={{
          cursor: "pointer", boxSizing: "border-box", minHeight: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "15px 22px", borderRadius: 100,
          background: pl.ctaBg, border: `1.5px solid ${pl.ctaBorder}`,
          font: `700 15px/1 ${BODY}`, color: pl.ctaColor, whiteSpace: "nowrap",
          transition: "transform .2s", transform: btnHovered ? "translateY(-3px)" : "none",
        }}
      >
        {pl.cta}
      </button>
    </div>
  );
}

function FooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  const { hovered, handlers } = useHover();
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      style={{ font: `500 13.5px/1 ${BODY}`, color: hovered ? BLUE : INK, cursor: "pointer", transition: "color .15s", background: "none", border: "none", padding: 0 }}
    >
      {label}
    </button>
  );
}
