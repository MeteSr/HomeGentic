import React, { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CSS } from "./landingStyles";

// ── Inline SVG house illustration ────────────────────────────────────────────
const HouseIllustration = () => (
  <svg width="280" height="300" viewBox="0 0 280 300" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Ground shadow */}
    <ellipse cx="142" cy="278" rx="100" ry="14" fill="rgba(46,37,64,0.12)" />

    {/* Back wall */}
    <path d="M80 220 L80 110 L142 80 L204 110 L204 220 Z" fill="#3D3254" />

    {/* Roof left face */}
    <path d="M52 118 L142 72 L142 80 L80 110 Z" fill="#1A1425" />
    {/* Roof right face */}
    <path d="M142 72 L232 118 L204 110 L142 80 Z" fill="#221B31" />
    {/* Roof ridge cap */}
    <path d="M52 118 L142 72 L232 118" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" fill="none" />

    {/* Left face */}
    <path d="M52 118 L80 110 L80 220 L52 228 Z" fill="#221B31" />
    {/* Right face */}
    <path d="M204 110 L232 118 L232 228 L204 220 Z" fill="#1A1425" />

    {/* Front face */}
    <rect x="80" y="110" width="124" height="110" fill="#2E2540" />

    {/* Windows left column */}
    <rect x="95" y="130" width="30" height="24" rx="3" fill="#7AAF76" opacity="0.65" />
    <rect x="135" y="130" width="30" height="24" rx="3" fill="#7AAF76" opacity="0.45" />
    {/* Window top row */}
    <rect x="175" y="130" width="20" height="14" rx="2" fill="#7AAF76" opacity="0.3" />
    {/* Lower windows */}
    <rect x="95" y="165" width="30" height="20" rx="3" fill="#7AAF76" opacity="0.3" />
    <rect x="135" y="165" width="30" height="20" rx="3" fill="#7AAF76" opacity="0.2" />

    {/* Door */}
    <path d="M151 220 L151 192 Q151 188 155 188 L171 188 Q175 188 175 192 L175 220 Z" fill="#0F0B1A" />
    {/* Door knob */}
    <circle cx="152" cy="207" r="2" fill="#7AAF76" opacity="0.6" />

    {/* Left face windows */}
    <rect x="57" y="138" width="16" height="12" rx="2" fill="#7AAF76" opacity="0.2" />
    <rect x="57" y="160" width="16" height="12" rx="2" fill="#7AAF76" opacity="0.15" />

    {/* Chimney */}
    <rect x="170" y="64" width="14" height="22" fill="#1A1425" />
    <rect x="168" y="62" width="18" height="5" fill="#221B31" />

    {/* Green accent dots (IoT sensors) */}
    <circle cx="88" cy="126" r="4" fill="#7AAF76" opacity="0.8" />
    <circle cx="88" cy="126" r="7" fill="#7AAF76" opacity="0.15" />
    <circle cx="202" cy="118" r="3.5" fill="#7AAF76" opacity="0.6" />
    <circle cx="202" cy="118" r="6" fill="#7AAF76" opacity="0.12" />
  </svg>
);

// ── Orbit diagram for final CTA ───────────────────────────────────────────────
const ORBIT_NODES = [
  { label: "REPORT",    emoji: "📋", angle: -90  },
  { label: "HVAC",      emoji: "❄️", angle: -30  },
  { label: "ELECTRICAL",emoji: "⚡", angle: 30   },
  { label: "PLUMBING",  emoji: "🔧", angle: 90   },
  { label: "ROOF",      emoji: "🏠", angle: 150  },
  { label: "LANDSCAPE", emoji: "🌿", angle: 210  },
];

function OrbitDiagram() {
  const R = 150;
  return (
    <div className="hfl-orbit-wrap">
      <div className="hfl-orbit-ring hfl-orbit-ring-1" />
      <div className="hfl-orbit-ring hfl-orbit-ring-2" />
      <div className="hfl-orbit-center">
        <div className="hfl-orbit-score">91</div>
        <div className="hfl-orbit-score-lbl">Score</div>
      </div>
      {ORBIT_NODES.map((n) => {
        const rad = (n.angle * Math.PI) / 180;
        const x = Math.cos(rad) * R;
        const y = Math.sin(rad) * R;
        return (
          <div
            key={n.label}
            className="hfl-orbit-node"
            style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`, position: "absolute", top: "50%", left: "50%" }}
          >
            <div className="hfl-orbit-node-circle">{n.emoji}</div>
            <div className="hfl-orbit-node-lbl">{n.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Feature showcase tabs ─────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "📋", kicker: "THE VERIFIED RECORD",
    heading: <>The Carfax<br /><em>your home deserves</em></>,
    desc: "Every service, repair, and renovation — documented, signed, and stored permanently on the blockchain. No middlemen, no expiry.",
    bullets: ["Full ownership & transaction history", "Verified contractor records & warranties", "Permitted renovations on file", "AI agents continuously update your score"],
    cta: "Build my record",
  },
  {
    icon: "🎤", kicker: "AI HOME INTELLIGENCE",
    heading: <>Your home has a voice.<br /><em>So do you.</em></>,
    desc: "Ask your home anything out loud, and it reaches out first when something needs attention — before you even think to ask.",
    bullets: ["Voice queries across your full maintenance history", "Proactive alerts before costly failures occur", "Utility bill anomaly & spike detection", "IoT sensor events trigger auto-scheduling"],
    cta: "Try the AI",
  },
  {
    icon: "⚖️", kicker: "SELL SMARTER",
    heading: <>Make agents compete<br /><em>for your listing</em></>,
    desc: "Post your listing intent and let verified agents submit competing proposals. Compare commissions and net proceeds side by side — or go FSBO.",
    bullets: ["Competing agent proposals within 48 hours", "Compare strategy, commissions & estimated net proceeds", "FSBO mode with showing management & offer inbox", "Sealed-bid offer management"],
    cta: "List your home",
  },
  {
    icon: "👷", kicker: "SERVICE NETWORK",
    heading: <>Verified contractors,<br /><em>auto-logged work</em></>,
    desc: "Every contractor in our network is credentialed and reviewed. Their completed work is automatically logged to your home's permanent record.",
    bullets: ["Credentialed & background-checked providers", "Work auto-signed and logged to your record", "Verified receipts & warranties on file", "Rate-limited reviews — real feedback only"],
    cta: "Browse the network",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeFeature, setActiveFeature] = React.useState(0);
  const [showcasePaused, setShowcasePaused] = React.useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", close); window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  useEffect(() => {
    if (!document.getElementById("hf-landing-fonts")) {
      const link = document.createElement("link");
      link.id = "hf-landing-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,900;1,9..144,300;1,9..144,600;1,9..144,900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
    return () => { document.getElementById("hf-landing-fonts")?.remove(); };
  }, []);

  useEffect(() => {
    if (showcasePaused) return;
    const t = setInterval(() => setActiveFeature((p) => (p + 1) % FEATURES.length), 8000);
    return () => clearInterval(t);
  }, [showcasePaused, FEATURES.length]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <Helmet>
        <title>HomeGentic — Verified Home Maintenance Records</title>
        <meta name="description" content="HomeGentic gives homeowners a verified, blockchain-backed record of every repair, upgrade, and inspection — boosting home value and buyer confidence." />
        <meta property="og:title" content="HomeGentic — Verified Home Maintenance Records" />
        <meta property="og:description" content="Prove your home's history. Verified maintenance records for homeowners, contractors, and buyers." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://homegentic.app/" />
      </Helmet>
      <style>{CSS}</style>
      <div className="hfl">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav className="hfl-nav">
          <a href="/" className="hfl-logo">Home<span>Gentic</span></a>
          <ul className={`hfl-nav-links${menuOpen ? " hfl-menu-open" : ""}`}>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-how"); }}>For Homeowners</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-split"); }}>Sell Smarter</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/demo"); }}>Demo</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/pricing"); }}>Pricing</a></li>
          </ul>
          <div className="hfl-nav-actions">
            <button className="hfl-nav-signin" onClick={() => navigate("/login")}>Sign in</button>
            <button className="hfl-nav-pill" onClick={() => navigate("/login")}>Get Started</button>
            <button
              className={`hfl-hamburger${menuOpen ? " hfl-menu-open" : ""}`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span /><span /><span />
            </button>
          </div>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="hfl-hero">
          <div className="hfl-hero-left">
            <div className="hfl-eyebrow">
              <span className="hfl-eyebrow-dot" />
              Blockchain-verified home records
            </div>
            <h1>Own It.<br /><em>Prove It.</em><br />Sell It.</h1>
            <p className="hfl-sub">
              HomeGentic builds your home's permanent blockchain record, generates your HomeGentic Score,
              tracks every repair, and helps you sell with confidence — so you command a premium price.
            </p>
            <div className="hfl-actions">
              <button className="hfl-btn-main" onClick={() => navigate("/login")}>Get Started Free</button>
              <button className="hfl-btn-soft" onClick={() => navigate("/login")}>See a Sample HomeGentic Report</button>
            </div>
            <div className="hfl-hero-badges">
              <span className="hfl-hero-badge"><span>🔒</span>Blockchain-Secured</span>
              <span className="hfl-hero-badge"><span>🛡️</span>Privacy First</span>
              <span className="hfl-hero-badge"><span>✓</span>GDPR Compliant</span>
            </div>
          </div>

          <div className="hfl-hero-right">
            <div className="hfl-hero-visual">
              <div className="hfl-house">
                <HouseIllustration />
              </div>

              {/* Dashboard card */}
              <div className="hfl-hero-card">
                <div className="hfl-hc-hdr">
                  <div className="hfl-hc-title">HomeGentic Dashboard</div>
                  <div className="hfl-hc-addr">327 Keech St, Daytona Beach FL</div>
                  <div className="hfl-hc-score">
                    <div className="hfl-hc-num">91</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Score</div>
                      <div className="hfl-hc-bar-wrap"><div className="hfl-hc-bar" /></div>
                    </div>
                  </div>
                </div>
                <div className="hfl-hc-body">
                  {[
                    { icon: "❄️", label: "HVAC Service",      status: "✓ Logged",    cls: "hfl-hc-pass" },
                    { icon: "🔌", label: "Electrical Panel",  status: "✓ Verified",  cls: "hfl-hc-pass" },
                    { icon: "🌿", label: "Landscaping",       status: "Due Nov 10",  cls: "hfl-hc-due"  },
                  ].map((r) => (
                    <div key={r.label} className="hfl-hc-item">
                      <span className="hfl-hc-lbl"><span>{r.icon}</span>{r.label}</span>
                      <span className={r.cls}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating chips */}
              <div className="hfl-float-chip hfl-float-chip-1">
                <span className="hfl-float-chip-dot" />
                🏆 Score: 91 · Top 8%
              </div>
              <div className="hfl-float-chip hfl-float-chip-2">
                <span className="hfl-float-chip-dot" />
                ⚡ 3 agents competing
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ────────────────────────────────────────────────── */}
        <section id="hfl-how" className="hfl-how">
          <div className="hfl-how-header">
            <span className="hfl-kicker">✦ Simple By Design</span>
            <h2>How It Works</h2>
            <p className="hfl-sec-sub">HomeGentic works across the entire homeownership lifecycle — from move-in to sale day.</p>
          </div>
          <div className="hfl-how-grid">
            {[
              { num: "01", icon: "🏠", title: "Set Up Your Home", desc: "Add your property and import existing records. AI agents begin organizing your home's history automatically." },
              { num: "02", icon: "🔧", title: "Manage & Maintain", desc: (<>Schedule services with <span style={{ color: "var(--sage-dark)", fontWeight: 600 }}>verified</span> providers. Every job is logged, receipted, and stored on your permanent record.</>), },
              { num: "03", icon: "📋", title: "Generate Your Report", desc: (<>Your <span style={{ color: "var(--sage-dark)", fontWeight: 600 }}>HomeGentic Report</span> is a tamper-proof property biography. Share it with buyers or attach it to any listing.</>), },
              { num: "04", icon: "🏆", title: "Sell With Confidence", desc: "List with the agent who wins your bid — or go FSBO with our full suite of seller tools. Your home, your terms." },
            ].map((s) => (
              <div key={s.num} className="hfl-how-card">
                <div className="hfl-how-card-top">
                  <div className="hfl-how-card-icon">{s.icon}</div>
                </div>
                <div className="hfl-how-card-body">
                  <div className="hfl-how-num">{s.num}</div>
                  <div className="hfl-how-title">{s.title}</div>
                  <p className="hfl-how-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Stats Strip ─────────────────────────────────────────────────── */}
        <div className="hfl-stats">
          {[
            { num: "98%",  lbl: "Secure Records"    },
            { num: "42%",  lbl: "Faster Hiring"     },
            { num: "5K+",  lbl: "Homes Managed"     },
            { num: "250+", lbl: "IoT Integrations"  },
          ].map((s) => (
            <div key={s.lbl} className="hfl-stat">
              <div className="hfl-stat-num">{s.num}</div>
              <div className="hfl-stat-lbl">{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* ── Key Features ────────────────────────────────────────────────── */}
        <section id="hfl-features" className="hfl-features">
          <div className="hfl-features-header">
            <span className="hfl-kicker">✦ Everything You Need</span>
            <h2>Key Features</h2>
          </div>
          <div
            className="hfl-showcase-inner"
            onMouseEnter={() => setShowcasePaused(true)}
            onMouseLeave={() => setShowcasePaused(false)}
          >
            {/* Tab nav */}
            <div className="hfl-sc-nav">
              <div className="hfl-sc-nav-label">Features</div>
              {FEATURES.map((f, i) => (
                <button
                  key={i}
                  className={`hfl-sc-tab${activeFeature === i ? " hfl-sc-tab-active" : ""}`}
                  onClick={() => setActiveFeature(i)}
                >
                  <div className="hfl-sc-tab-row">
                    <span className="hfl-sc-tab-icon">{f.icon}</span>
                    <span className="hfl-sc-tab-title">{f.kicker.split(" ").slice(1).join(" ")}</span>
                  </div>
                  {activeFeature === i && (
                    <div className="hfl-sc-progress-track">
                      <div className="hfl-sc-progress-bar" key={`${i}-${showcasePaused}`} style={{ animationPlayState: showcasePaused ? "paused" : "running" }} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="hfl-sc-content">
              <div className="hfl-sc-slide" key={activeFeature}>
                <div className="hfl-sc-kicker">{FEATURES[activeFeature].kicker}</div>
                <div className="hfl-sc-heading">{FEATURES[activeFeature].heading}</div>
                <p className="hfl-sc-desc">{FEATURES[activeFeature].desc}</p>
                <ul className="hfl-sc-bullets">
                  {FEATURES[activeFeature].bullets.map((b) => (
                    <li key={b}><span className="hfl-sc-check">✓</span>{b}</li>
                  ))}
                </ul>
                <button className="hfl-sc-cta" onClick={() => navigate("/login")}>
                  {FEATURES[activeFeature].cta}
                </button>
              </div>

              {/* Visual panel */}
              <div className="hfl-sc-visual" key={`v-${activeFeature}`}>
                {activeFeature === 0 && (<>
                  <div className="hfl-rec-hdr">
                    <div className="hfl-rec-hdr-top">
                      <span className="hfl-rec-title">HomeGentic Record</span>
                      <span className="hfl-rec-verified">✓ Verified</span>
                    </div>
                    <div className="hfl-rec-addr">327 Keech Street, Daytona Beach FL</div>
                    <div className="hfl-rec-score-row">
                      <div className="hfl-rec-score-num">91</div>
                      <div className="hfl-rec-score-right">
                        <div className="hfl-rec-score-lbl">HomeGentic Score</div>
                        <div className="hfl-rec-bar-wrap"><div className="hfl-rec-bar" /></div>
                      </div>
                    </div>
                  </div>
                  <div className="hfl-rec-body">
                    <div className="hfl-rec-section-lbl">Verified History</div>
                    <div className="hfl-rec-items">
                      {[
                        { icon: "🔨", label: "Roof Replacement",  val: "2022 · Signed ✓",    cls: "hfl-rec-pass" },
                        { icon: "❄️", label: "HVAC Full Service",  val: "Aug 2024 · Verified ✓", cls: "hfl-rec-pass" },
                        { icon: "🔌", label: "Electrical Panel",   val: "Permitted 2021 ✓",   cls: "hfl-rec-pass" },
                        { icon: "🚰", label: "Water Heater",       val: "Lifespan: 2 yrs",    cls: "hfl-rec-due"  },
                      ].map((r) => (
                        <div key={r.label} className="hfl-rec-item">
                          <span className="hfl-rec-item-l"><span>{r.icon}</span>{r.label}</span>
                          <span className={r.cls}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="hfl-rec-footer">📋 <span>47 records verified · Link ready</span></div>
                  </div>
                </>)}

                {activeFeature === 1 && (<>
                  <div className="hfl-ai-panel-hdr">
                    <div className="hfl-ai-panel-hdr-l">
                      <span style={{ fontSize: 14 }}>🏠</span>
                      <span className="hfl-ai-panel-name">HomeGentic AI</span>
                    </div>
                    <div className="hfl-ai-panel-live"><div className="hfl-ai-panel-dot" />Live</div>
                  </div>
                  <div className="hfl-ai-panel-body">
                    <div className="hfl-ai-notice">
                      <div className="hfl-ai-notice-tag"><span>⚡</span> HomeGentic noticed</div>
                      <p>Your water heater (2013) is past average lifespan. Want a verified quote before winter?</p>
                      <button className="hfl-ai-notice-btn">Yes, get me quotes</button>
                    </div>
                    <div className="hfl-ai-user-msg">
                      <div className="hfl-ai-user-icon">🎤</div>
                      <p>"What's my biggest maintenance risk this winter?"</p>
                    </div>
                    <div className="hfl-ai-reply">
                      <div className="hfl-ai-reply-tag">HomeGentic AI</div>
                      <p>Your roof was last inspected in 2021 and your furnace filter is 3 months overdue. I'd prioritize both. Want me to schedule?</p>
                    </div>
                  </div>
                  <div className="hfl-ai-panel-footer">
                    <div className="hfl-ai-mic">🎤</div>
                    <span className="hfl-ai-mic-hint">Tap to ask anything…</span>
                  </div>
                </>)}

                {activeFeature === 2 && (<>
                  <div className="hfl-compete-hdr">
                    <div className="hfl-compete-title">Agent Proposals</div>
                    <div className="hfl-compete-sub">327 Keech Street · 5 received</div>
                  </div>
                  <div className="hfl-compete-body">
                    {[
                      { avi: "👩", name: "Lisa Chen · Keller Williams", detail: "2.4% · Est. net $487k · 18 days", comm: "2.4%", best: true  },
                      { avi: "👨", name: "Marcus Rivera · RE/MAX",      detail: "2.8% · Est. net $481k · 22 days", comm: "2.8%", best: false },
                      { avi: "👩", name: "Priya Nair · Compass",        detail: "3.0% · Est. net $479k · 25 days", comm: "3.0%", best: false },
                    ].map((a, i) => (
                      <div key={i} className={`hfl-compete-agent${a.best ? " hfl-compete-agent-featured" : ""}`}>
                        <div className="hfl-compete-avi">{a.avi}</div>
                        <div className="hfl-compete-info">
                          <div className="hfl-compete-name">{a.name}</div>
                          <div className="hfl-compete-detail">{a.detail}</div>
                          {a.best && <span className="hfl-compete-best">✦ Best offer</span>}
                        </div>
                        <div className="hfl-compete-comm">{a.comm}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hfl-compete-footer">⚖️ <span>All verified HomeGentic partners</span></div>
                </>)}

                {activeFeature === 3 && (<>
                  <div className="hfl-sc-contr-hdr">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: "white" }}>Service Network</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#A8DCA5", background: "rgba(122,175,118,0.2)", borderRadius: 100, padding: "2px 8px" }}>247 nearby</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Daytona Beach, FL</div>
                  </div>
                  <div className="hfl-sc-contr-cards">
                    {[
                      { emoji: "🔧", name: "Mike's HVAC Pro",     rating: "4.9★", jobs: "32 jobs on HomeGentic" },
                      { emoji: "🔌", name: "Coastal Electric",     rating: "4.8★", jobs: "18 jobs on HomeGentic" },
                      { emoji: "🔨", name: "Sunrise Roofing Co.",  rating: "5.0★", jobs: "41 jobs on HomeGentic" },
                    ].map((c) => (
                      <div key={c.name} className="hfl-sc-contr-card">
                        <span style={{ fontSize: 18 }}>{c.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div className="hfl-sc-contr-name">{c.name}</div>
                          <div className="hfl-sc-contr-jobs">{c.jobs}</div>
                        </div>
                        <div style={{ textAlign: "right" as const }}>
                          <div style={{ fontWeight: 700, color: "white", fontSize: 12 }}>{c.rating}</div>
                          <div className="hfl-sc-contr-vbadge">✓ Verified</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hfl-sc-quote-box">
                    <div className="hfl-sc-quote-label">⚡ Open Quote Request</div>
                    <div className="hfl-sc-quote-title">Roof inspection + repair estimate</div>
                    <div className="hfl-sc-quote-sub">3 contractors · Closes in 48 hrs</div>
                    <div className="hfl-sc-quote-bids">
                      <span className="hfl-sc-quote-bid">$420</span>
                      <span className="hfl-sc-quote-bid">$395</span>
                      <span className="hfl-sc-quote-bid hfl-sc-quote-bid-best">$380 ✦ lowest</span>
                    </div>
                  </div>
                </>)}
              </div>
            </div>
          </div>
        </section>

        {/* ── Split: Sell Smarter / Service Network ───────────────────────── */}
        <div id="hfl-split" className="hfl-split">
          <div className="hfl-split-left">
            <div className="hfl-split-kicker-l">🏡 Sell Smarter</div>
            <h2>Make agents compete<br /><em>for your listing</em></h2>
            <ul className="hfl-split-bullets">
              <li><span>✓</span>Get multiple competing proposals</li>
              <li><span>✓</span>Compare commission structures side-by-side</li>
              <li><span>✓</span>FSBO tools to sell on your own terms</li>
            </ul>
            <button className="hfl-split-btn-l" onClick={() => navigate("/login")}>List Your Home</button>
          </div>
          <div className="hfl-split-right">
            <div className="hfl-split-kicker-r">👷 Service Network</div>
            <h2>Verified contractors,<br /><em>auto-logged work</em></h2>
            <div className="hfl-contr-grid">
              {[
                { emoji: "🔧", name: "Mike's HVAC Pro",    stars: "★★★★★", jobs: "Jobs completed" },
                { emoji: "⚡", name: "Coastal Electric",    stars: "★★★★½", jobs: "Jobs completed" },
                { emoji: "🔨", name: "Sunrise Roofing Co.", stars: "★★★★★", jobs: "Jobs completed" },
                { emoji: "💧", name: "Flow Masters",        stars: "★★★★★", jobs: "Jobs completed" },
              ].map((c) => (
                <div key={c.name} className="hfl-contr-card">
                  <div className="hfl-contr-emoji">{c.emoji}</div>
                  <div className="hfl-contr-name">{c.name}</div>
                  <div className="hfl-contr-stars">{c.stars}</div>
                  <div className="hfl-contr-jobs">{c.jobs}</div>
                  <div className="hfl-contr-badge">Verified</div>
                </div>
              ))}
            </div>
            <button className="hfl-contr-browse" onClick={() => navigate("/login")}>
              Browse the Network →
            </button>
          </div>
        </div>

        {/* ── AI Section ──────────────────────────────────────────────────── */}
        <section id="hfl-ai" className="hfl-ai-section">
          <div className="hfl-ai-visual">
            <div className="hfl-ai-chat-wrap">
              <div style={{ position: "relative", display: "inline-block" }}>
                <div className="hfl-ai-pulse-ring" />
                <div className="hfl-ai-pulse-ring hfl-ai-pulse-ring-2" />
              </div>
              <div className="hfl-ai-bubble">
                <div className="hfl-ai-bubble-header">
                  <div className="hfl-ai-bubble-icon">🏠</div>
                  <div>
                    <div className="hfl-ai-bubble-title">HomeGentic AI</div>
                    <div className="hfl-ai-bubble-tag">Proactive alert</div>
                  </div>
                </div>
                <div className="hfl-ai-bubble-text">
                  Your water heater (2013) is past average lifespan. I've found 3 verified HVAC techs nearby — want me to request quotes?
                </div>
              </div>
              <div className="hfl-ai-user-bubble">
                <div className="hfl-ai-mic-icon">🎤</div>
                <span>"What's my biggest maintenance risk heading into winter?"</span>
              </div>
              <div className="hfl-ai-bubble" style={{ marginTop: 12 }}>
                <div className="hfl-ai-bubble-header">
                  <div className="hfl-ai-bubble-icon">🏠</div>
                  <div>
                    <div className="hfl-ai-bubble-title">HomeGentic AI</div>
                    <div className="hfl-ai-bubble-tag">Analysis complete</div>
                  </div>
                </div>
                <div className="hfl-ai-bubble-text">
                  Roof last inspected 2021, furnace filter 3 months overdue. I'd prioritize both. Shall I schedule?
                </div>
              </div>
            </div>
          </div>
          <div className="hfl-ai-text">
            <span className="hfl-kicker" style={{ color: "var(--sage)" }}>✦ AI Home Intelligence</span>
            <h2>Your home has a voice.<br /><em>So do you.</em></h2>
            <ul className="hfl-ai-bullets">
              <li><span>✓</span>Voice queries across your full maintenance history</li>
              <li><span>✓</span>Proactive alerts before costly failures occur</li>
              <li><span>✓</span>Utility bill anomaly &amp; spike detection</li>
              <li><span>✓</span>IoT sensor events trigger auto-scheduling</li>
            </ul>
            <div className="hfl-ai-btns">
              <button className="hfl-ai-btn-live">
                <span className="hfl-ai-live-dot" /> Live
              </button>
              <button className="hfl-ai-btn-try" onClick={() => navigate("/login")}>Try the AI</button>
            </div>
          </div>
        </section>

        {/* ── Testimonials ────────────────────────────────────────────────── */}
        <section className="hfl-testimonials">
          <div className="hfl-testimonials-header">
            <span className="hfl-kicker">★ Homeowner Stories</span>
            <h2>Homeowners Love Home<em>Gentic</em></h2>
            <p>Real results from real people who took control of their home's story.</p>
          </div>
          <div className="hfl-test-grid">
            {[
              {
                initial: "S", stars: "★★★★★",
                headline: "$28k Over Asking!",
                quote: "Our buyers said the HomeGentic Report was the reason they felt comfortable waiving the inspection contingency. It's a game changer.",
                name: "Sarah M.", role: "Seller · Austin, TX",
              },
              {
                initial: "M", stars: "★★★★★",
                headline: "Best Offer in Austin!",
                quote: "I posted my listing intent and got five agent proposals in 48 hours. Ended up saving $11k in commission.",
                name: "Marcus T.", role: "Seller · Denver, CO",
              },
              {
                initial: "J", stars: "★★★★☆",
                headline: "Top 1% in Tampa!",
                quote: "Our inspector said our HomeGentic Score was the highest he'd seen. Buyers skipped the inspection entirely. Closed in 11 days.",
                name: "James L.", role: "Seller · Tampa, FL",
              },
            ].map((t) => (
              <div key={t.name} className="hfl-test-card">
                <div className="hfl-test-card-top">
                  <div className="hfl-test-avi">{t.initial}</div>
                  <div className="hfl-test-stars">{t.stars}</div>
                </div>
                <div className="hfl-test-headline">{t.headline}</div>
                <p className="hfl-test-quote">"{t.quote}"</p>
                <div className="hfl-test-author-name">{t.name}</div>
                <div className="hfl-test-author-role">{t.role}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────────── */}
        <section className="hfl-final-cta">
          <div>
            <div className="hfl-cta-kicker">✦ Get Started Today</div>
            <h2>Take Control of Your<br /><em>Home's Story Today</em></h2>
            <p>
              Your home is your biggest asset. Build the permanent record that proves its value,
              protects your investment, and helps you sell with confidence.
            </p>
            <div className="hfl-cta-btns">
              <button className="hfl-cta-btn-main" onClick={() => navigate("/login")}>Get Started Free</button>
              <button className="hfl-cta-btn-ghost" onClick={() => window.open("/sample-report", "_blank", "noopener,noreferrer")}>See a Sample Report</button>
            </div>
            <div className="hfl-cta-trust">
              <span className="hfl-cta-trust-item">🔒 Blockchain-Secured</span>
              <span className="hfl-cta-trust-item">🛡️ Privacy First</span>
              <span className="hfl-cta-trust-item">✓ GDPR Compliant</span>
            </div>
          </div>
          <OrbitDiagram />
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="hfl-footer">
          <div className="hfl-footer-top">
            <div>
              <a href="/" className="hfl-footer-logo">Home<span>Gentic</span></a>
              <p className="hfl-footer-tagline">
                The verified maintenance record that makes your home worth more and easier to sell.
              </p>
              <div className="hfl-footer-social">
                <a href="#" aria-label="HomeGentic on X" rel="noopener noreferrer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <div className="hfl-footer-col-title">Product</div>
              <ul className="hfl-footer-col-links">
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-how"); }}>For Homeowners</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>Key Features</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-split"); }}>Sell Smarter</a></li>
                <li><a onClick={() => navigate("/demo")}>Interactive Demo</a></li>
                <li><a onClick={() => navigate("/pricing")}>Pricing</a></li>
              </ul>
            </div>
            <div>
              <div className="hfl-footer-col-title">Free Tools</div>
              <ul className="hfl-footer-col-links">
                <li><a href="/check">Report Lookup</a></li>
                <li><a href="/instant-forecast">System Forecast</a></li>
                <li><a href="/prices">Price Lookup</a></li>
                <li><a href="/home-systems">Systems Estimator</a></li>
                <li><a href="/truth-kit">Buyer's Truth Kit</a></li>
              </ul>
            </div>
            <div>
              <div className="hfl-footer-col-title">Company</div>
              <ul className="hfl-footer-col-links">
                <li><Link to="/faq">FAQ</Link></li>
                <li><Link to="/gift">Gift a Subscription</Link></li>
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/support">Support</Link></li>
              </ul>
            </div>
          </div>
          <div className="hfl-footer-bottom">
            <span>© 2026 HomeGentic Inc.</span>
            <div className="hfl-footer-bottom-links">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/support">Support</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
