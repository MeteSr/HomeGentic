import React, { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ShieldCheck, TrendingUp, CalendarDays, Archive, RefreshCw } from "lucide-react";
import { CSS } from "./landingStyles";


export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeFeature, setActiveFeature] = React.useState(0);
  const [showcasePaused, setShowcasePaused] = React.useState(false);

  const FEATURES = [
    {
      icon: "📋", kicker: "The Verified Record",
      heading: <>The Carfax<br /><em>your home deserves</em></>,
      desc: "Every service, repair, and renovation — documented, signed, and stored permanently on the blockchain. No middlemen, no expiry.",
      bullets: ["Full ownership & transaction history", "Verified contractor records & warranties", "Permitted renovations on file", "AI agents continuously update your score"],
      cta: "Build my record",
    },
    {
      icon: "🎤", kicker: "AI Home Intelligence",
      heading: <>Your home has a voice.<br /><em>So do you.</em></>,
      desc: "Ask your home anything out loud, and it reaches out first when something needs attention — before you even think to ask.",
      bullets: ["Voice queries across your full maintenance history", "Proactive alerts before costly failures occur", "Utility bill anomaly & spike detection", "IoT sensor events trigger auto-scheduling"],
      cta: "Try the AI",
    },
    {
      icon: "⚖️", kicker: "Sell Smarter",
      heading: <>Make agents compete<br /><em>for your listing</em></>,
      desc: "Post your listing intent and let verified agents submit competing proposals. Compare commissions and net proceeds side by side — or go FSBO.",
      bullets: ["Competing agent proposals within 48 hours", "Compare strategy, commissions & estimated net proceeds", "FSBO mode with showing management & offer inbox", "Sealed-bid offer management"],
      cta: "List your home",
    },
    {
      icon: "👷", kicker: "Service Network",
      heading: <>Verified contractors,<br /><em>auto-logged work</em></>,
      desc: "Every contractor in our network is credentialed, reviewed, and bonded. Their completed work is automatically logged to your home's permanent record.",
      bullets: ["Credentialed & background-checked providers", "Work auto-signed and logged to your record", "Verified receipts & warranties on file", "Rate-limited reviews — real feedback only"],
      cta: "Browse the network",
    },
  ];

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!document.getElementById("hf-landing-fonts")) {
      const link = document.createElement("link");
      link.id = "hf-landing-fonts";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,900;1,9..144,300;1,9..144,600;1,9..144,900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
    return () => {
      document.getElementById("hf-landing-fonts")?.remove();
    };
  }, []);

  useEffect(() => {
    if (showcasePaused) return;
    const t = setInterval(() => setActiveFeature((p) => (p + 1) % FEATURES.length), 8000);
    return () => clearInterval(t);
  }, [showcasePaused, FEATURES.length]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <Helmet>
        <title>HomeGentic — Verified Home Maintenance Records</title>
        <meta name="description" content="HomeGentic gives homeowners a verified, blockchain-backed record of every repair, upgrade, and inspection — boosting home value and buyer confidence." />
        <meta property="og:title" content="HomeGentic — Verified Home Maintenance Records" />
        <meta property="og:description" content="Prove your home's history. Verified maintenance records for homeowners, contractors, and buyers." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "HomeGentic",
          "url": "https://homegentic.app/",
          "description": "Verified home maintenance records on the blockchain.",
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://homegentic.app/check?address={search_term_string}",
            "query-input": "required name=search_term_string"
          }
        })}</script>
      </Helmet>
      <style>{CSS}</style>
      <div className="hfl">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav className="hfl-nav">
          <a href="/" className="hfl-logo">Home<span>Gentic</span></a>
          <ul className={`hfl-nav-links${menuOpen ? " hfl-menu-open" : ""}`}>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-features"); }}>For Homeowners</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-sell"); }}>Sell Smarter</a></li>
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
            <h1>Own It.<br /><em>Prove It.</em><br />Sell It.</h1>
            <p className="hfl-sub">
              HomeGentic tracks every repair, reminds you before things break, and builds
              the complete maintenance record your home deserves — so when it's time to sell,
              you're ready to command a premium.
            </p>
            <div className="hfl-actions">
              <button className="hfl-btn-main" onClick={() => navigate("/login")}>Get Started</button>
              <button className="hfl-btn-soft" onClick={() => navigate("/login")}>See a HomeGentic Report</button>
            </div>
            <div className="hfl-hero-trust">
              <span className="hfl-hero-trust-lbl">Trusted by homeowners in</span>
              {["Austin, TX", "Denver, CO", "Seattle, WA", "Tampa, FL"].map((c) => (
                <span key={c} className="hfl-hero-city">📍 {c}</span>
              ))}
            </div>
          </div>

          <div className="hfl-hero-right">
            <div className="hfl-blob-wrap">
              <div className="hfl-blob-bg" />
              <div className="hfl-dash-card">
                <div className="hfl-dc-header">
                  <div className="hfl-dc-top">
                    <span className="hfl-dc-title">My Home Dashboard</span>
                    <span className="hfl-dc-ver">✓ Verified</span>
                  </div>
                  <div className="hfl-dc-addr">327 Keech Street, Daytona Beach FL</div>
                  <div className="hfl-dc-score-row">
                    <div>
                      <div className="hfl-dc-score-lbl">HomeGentic Score</div>
                      <div className="hfl-dc-num">91</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="hfl-dc-bar-wrap"><div className="hfl-dc-bar" /></div>
                    </div>
                  </div>
                </div>
                <div className="hfl-dc-body">
                  <div className="hfl-dc-sec-lbl">Maintenance &amp; Services</div>
                  <div className="hfl-dc-items">
                    <div className="hfl-dc-item">
                      <span className="hfl-dc-item-l"><span>❄️</span> HVAC Service</span>
                      <span className="hfl-status-done">✓ Logged</span>
                    </div>
                    <div className="hfl-dc-item">
                      <span className="hfl-dc-item-l"><span>🔌</span> Electrical Panel</span>
                      <span className="hfl-status-ok">✓ Verified</span>
                    </div>
                    <div className="hfl-dc-item">
                      <span className="hfl-dc-item-l"><span>🌿</span> Landscaping</span>
                      <span className="hfl-status-due">Due Nov 10</span>
                    </div>
                  </div>
                  <div className="hfl-dc-ver-row">
                    <span style={{ fontSize: 18 }}>📋</span>
                    <span className="hfl-dc-ver-text">
                      <strong>HomeGentic Report Ready</strong> — 14 records verified, share in one click
                    </span>
                  </div>
                </div>
              </div>
              <div className="hfl-badge hfl-badge-1">
                <span className="hfl-badge-icon">🏆</span> Score: 91 · Top 8%
              </div>
              <div className="hfl-badge hfl-badge-2">
                <span className="hfl-badge-icon">⚡</span> 3 agents competing
              </div>
            </div>
          </div>
        </section>


        {/* ── How It Works ────────────────────────────────────────────────── */}
        <section id="hfl-features" className="hfl-how">
          <div className="hfl-section-header">
            <h2>How It Works</h2>
            <p className="hfl-sec-sub">HomeGentic works across the entire homeownership lifecycle — from move-in to sale day.</p>
          </div>
          <div className="hfl-flow">
            {[
              { icon: "🏠", num: "01", title: "Set Up Your Home", desc: "Add your property and import existing records. AI agents begin organizing your home's history automatically." },
              { icon: "🔧", num: "02", title: "Manage & Maintain", desc: "Schedule services with verified providers. Every job is logged, receipted, and stored on your permanent record." },
              { icon: "📋", num: "03", title: "Generate Your Report", desc: "Your HomeGentic Report is a tamper-proof property biography. Share it with buyers or attach it to any listing." },
              { icon: "🏆", num: "04", title: "Sell With Confidence", desc: "List with the agent who wins your bid — or go FSBO with our full suite of seller tools. Your home, your terms." },
            ].map((s) => (
              <div key={s.title} className="hfl-step">
                <div className="hfl-step-num">{s.num}</div>
                <div className="hfl-step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature Showcase ────────────────────────────────────────────── */}
        <section id="hfl-sell" className="hfl-showcase">
          <div className="hfl-showcase-header">
            <div className="hfl-kicker">✦ Everything You Need</div>
            <h2>Built for the entire<br /><em>homeownership journey</em></h2>
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
                    <span className="hfl-sc-tab-title">{f.kicker}</span>
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
                    <li key={b}><span className="hfl-sc-bullet-dot">✓</span>{b}</li>
                  ))}
                </ul>
                <button className="hfl-sc-cta" onClick={() => navigate("/login")}>
                  {FEATURES[activeFeature].cta}
                </button>
              </div>

              {/* Visual panel */}
              <div className="hfl-sc-visual" key={`v-${activeFeature}`}>
                {activeFeature === 0 && (
                  <div className="hfl-rec-hdr" style={{ borderRadius: 0 }}>
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
                )}
                {activeFeature === 0 && (
                  <div className="hfl-rec-body">
                    <div className="hfl-rec-section-lbl">Verified History</div>
                    <div className="hfl-rec-items">
                      {[
                        { icon: "🔨", label: "Roof Replacement", val: "2022 · Signed ✓", cls: "hfl-rec-pass" },
                        { icon: "❄️", label: "HVAC Full Service", val: "Aug 2024 · Verified ✓", cls: "hfl-rec-pass" },
                        { icon: "🔌", label: "Electrical Panel",  val: "Permitted 2021 ✓", cls: "hfl-rec-pass" },
                        { icon: "🚰", label: "Water Heater",      val: "Lifespan: 2 yrs", cls: "hfl-rec-due" },
                      ].map((r) => (
                        <div key={r.label} className="hfl-rec-item">
                          <span className="hfl-rec-item-l"><span>{r.icon}</span>{r.label}</span>
                          <span className={r.cls}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="hfl-rec-footer" style={{ margin: "16px -26px -20px", padding: "14px 26px" }}>
                      📋 <span>47 records verified · Link ready</span>
                    </div>
                  </div>
                )}

                {activeFeature === 1 && (<>
                  <div className="hfl-ai-panel-hdr">
                    <div className="hfl-ai-panel-hdr-l">
                      <span style={{ fontSize: 16 }}>🏠</span>
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
                      { avi: "👩", name: "Lisa Chen · Keller Williams", detail: "2.4% · Est. net $487k · 18 days", comm: "2.4%", best: true },
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
                  <div style={{ background: "var(--plum)", padding: "18px 22px", borderBottom: "1px solid rgba(253,252,250,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: "white" }}>Service Network</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#A8DCA5", background: "rgba(122,175,118,0.25)", border: "1px solid rgba(122,175,118,0.4)", borderRadius: 100, padding: "3px 9px" }}>247 providers nearby</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Daytona Beach, FL · All trades</div>
                  </div>
                  <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
                    {[
                      { emoji: "🔧", name: "Mike's HVAC Pro",      rating: "4.9★", jobs: "32 jobs on HomeGentic", verified: true },
                      { emoji: "🔌", name: "Coastal Electric",      rating: "4.8★", jobs: "18 jobs on HomeGentic", verified: true },
                      { emoji: "🔨", name: "Sunrise Roofing Co.",   rating: "5.0★", jobs: "41 jobs on HomeGentic", verified: true },
                    ].map((c) => (
                      <div key={c.name} style={{ background: "var(--sage-light)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                        <span style={{ fontSize: 20 }}>{c.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: "var(--plum)", marginBottom: 2 }}>{c.name}</div>
                          <div style={{ color: "var(--plum-mid)" }}>{c.jobs}</div>
                        </div>
                        <div style={{ textAlign: "right" as const }}>
                          <div style={{ fontWeight: 700, color: "var(--plum)" }}>{c.rating}</div>
                          {c.verified && <div style={{ fontSize: 10, color: "var(--sage)", fontWeight: 700 }}>✓ Verified</div>}
                        </div>
                      </div>
                    ))}
                    {/* Contractor bid snippet */}
                    <div style={{ background: "var(--butter)", border: "1px solid rgba(46,37,64,0.1)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--plum)", letterSpacing: "1.5px", textTransform: "uppercase" as const, marginBottom: 6 }}>⚡ Open Quote Request</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--plum)", marginBottom: 4 }}>Roof inspection + repair estimate</div>
                      <div style={{ fontSize: 11, color: "var(--plum-mid)", marginBottom: 8 }}>3 contractors have submitted bids · Closes in 48 hrs</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--plum)", background: "rgba(46,37,64,0.08)", borderRadius: 100, padding: "3px 10px" }}>$420</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--plum)", background: "rgba(46,37,64,0.08)", borderRadius: 100, padding: "3px 10px" }}>$395</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--sage)", background: "rgba(122,175,118,0.2)", borderRadius: 100, padding: "3px 10px" }}>$380 ✦ lowest</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--plum-mid)", fontWeight: 600, padding: "4px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                      👷 <span>Work auto-logged to your HomeGentic Record</span>
                    </div>
                  </div>
                </>)}

              </div>
            </div>
          </div>
        </section>

        {/* ── Report CTA ──────────────────────────────────────────────────── */}
        <section id="hfl-report" className="hfl-report">
          <div>
            <div className="hfl-rc-label">The HomeGentic Report</div>
            <h2>Your Home's Verified<br /><em>Biography</em></h2>
            <p>
              When it's time to sell, your HomeGentic Report is a tamper-proof document showing
              every owner, every service, every improvement. Buyers love it. Agents share it.
              Homes with it sell first.
            </p>
            <div className="hfl-rc-actions">
              <button className="hfl-rc-btn" onClick={() => navigate("/login")}>Generate My HomeGentic</button>
              <button className="hfl-rc-ghost" onClick={() => window.open("/sample-report", "_blank", "noopener,noreferrer")}>View Sample Report</button>
            </div>
          </div>
          <div>
            <div className="hfl-report-mock">
              <div className="hfl-mock-top">
                <span className="hfl-mock-addr">327 Keech Street, Daytona Beach FL</span>
                <span className="hfl-mock-badge">HomeGentic ✓</span>
              </div>
              <div className="hfl-mock-score">
                <div className="hfl-mock-num">91</div>
                <div style={{ flex: 1 }}>
                  <div className="hfl-mock-score-lbl">HomeGentic Property Score</div>
                  <div className="hfl-mock-bar"><div className="hfl-mock-bar-fill" /></div>
                </div>
              </div>
              <div className="hfl-mock-rows">
                {[
                  { label: "📋 Title & Ownership",     val: "Clear ✓",            cls: "hfl-mock-pass" },
                  { label: "🔨 Permits & Renovations", val: "12 Logged ✓",        cls: "hfl-mock-pass" },
                  { label: "🔧 Service History",        val: "47 Records ✓",       cls: "hfl-mock-pass" },
                  { label: "🌿 Recurring Services",     val: "4 Under Contract ✓", cls: "hfl-mock-pass" },
                  { label: "⚖️ Liens & Encumbrances",  val: "None ✓",             cls: "hfl-mock-pass" },
                ].map((r) => (
                  <div key={r.label} className="hfl-mock-row">
                    <span className="hfl-mock-row-lbl">{r.label}</span>
                    <span className={r.cls}>{r.val}</span>
                  </div>
                ))}
              </div>
              <div className="hfl-mock-footer">📋 <span>All records independently verified · Shareable link generated</span></div>
            </div>
          </div>
        </section>

        {/* ── Feature Deep Dive ───────────────────────────────────────────── */}
        <section className="hfl-fdd">
          <div className="hfl-fdd-inner">
            <div className="hfl-fdd-header">
              <div className="hfl-kicker">✦ Feature Deep Dive</div>
              <h2>Built for the moments<br /><em>that actually matter</em></h2>
              <p>Most home apps give you a checklist. HomeGentic gives you documentation that works for you at resale, during insurance claims, and before emergencies happen.</p>
            </div>
            <div className="hfl-fdd-cols">
              {([
                { icon: ShieldCheck,  title: "Insurance Defense Mode",      tagline: "Fight a rate hike or claim denial with a single report.",        desc: "Generates a print-ready document of every insurance-relevant job — roof, HVAC, electrical, plumbing — sorted by system and dated, ready to hand to your insurer." },
                { icon: TrendingUp,   title: "Market Intelligence",         tagline: "Know which renovations actually pay off in your zip code.",       desc: "Uses remodeling data to rank projects by ROI for your area. Compares your score to similar nearby properties so you see exactly where you stand." },
                  { icon: CalendarDays, title: "5-Year Maintenance Calendar", tagline: "Budget for the future instead of being blindsided.",             desc: "Based on your home's system ages and service history, HomeGentic generates a personalized 5-year schedule with projected costs for every task." },
                { icon: Archive,      title: "Warranty Wallet",             tagline: "Every warranty, receipt, and manual — attached to your home.",   desc: "Store appliance warranties, installation receipts, and product manuals tied to the exact job they belong to. Linked to your blockchain record, not buried in your email." },
                { icon: RefreshCw,    title: "Recurring Services",          tagline: "Never miss the HVAC tune-up that prevents a $12k failure.",      desc: "Log ongoing service contracts — HVAC, pest control, landscaping — and HomeGentic tracks every visit, sends reminders, and builds a documented history automatically." },
              ] as const).map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="hfl-fdd-row">
                    <div className="hfl-fdd-icon-wrap">
                      <Icon size={18} color="var(--sage)" />
                    </div>
                    <div className="hfl-fdd-text">
                      <div className="hfl-fdd-title">{f.title}</div>
                      <div className="hfl-fdd-tagline">{f.tagline}</div>
                      <div className="hfl-fdd-desc">{f.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Testimonials ────────────────────────────────────────────────── */}
        <section className="hfl-testimonials">
          <div className="hfl-testimonials-header">
            <div className="hfl-kicker">★ Homeowner Stories</div>
            <h2>Homeowners Love Home<em>Gentic</em></h2>
            <p>Real results from real people who took control of their home's story.</p>
          </div>

          <div className="hfl-featured-quote">
            <p className="hfl-featured-quote-text">
              "We got <em>$28k over asking</em>. Our buyers said the HomeGentic Report was
              the reason they felt comfortable waiving the inspection contingency. It's a game changer."
            </p>
            <div className="hfl-featured-author">
              <div className="hfl-featured-avi">👩</div>
              <div>
                <div className="hfl-featured-name">Sarah M.</div>
                <div className="hfl-featured-role">Seller · Austin, TX</div>
              </div>
              <div className="hfl-featured-result">
                <div className="hfl-featured-result-num">+$28k</div>
                <div className="hfl-featured-result-lbl">over asking price</div>
              </div>
            </div>
          </div>

          <div className="hfl-test-grid">
            {[
              {
                quote: "I posted my listing intent and got five agent proposals in 48 hours. Ended up saving $11k in commission compared to what I would have paid without negotiating.",
                name: "Marcus T.", role: "Seller · Denver, CO", avi: "hfl-avi-2", emoji: "👨",
              },
              {
                quote: "The AI agent reminded me my HVAC was overdue, booked a verified tech, and logged it to my HomeGentic automatically. When I sold six months later, it was right there in the report.",
                name: "Priya K.", role: "Homeowner · Seattle, WA", avi: "hfl-avi-3", emoji: "👩",
              },
              {
                quote: "Our inspector said our HomeGentic Score was the highest he'd seen. Buyers skipped the inspection entirely. Closed in 11 days.",
                name: "James L.", role: "Seller · Tampa, FL", avi: "hfl-avi-1", emoji: "👨",
              },
            ].map((t) => (
              <div key={t.name} className="hfl-test-card">
                <div className="hfl-stars">★★★★★</div>
                <blockquote>"{t.quote}"</blockquote>
                <div className="hfl-test-author">
                  <div className={`hfl-avi ${t.avi}`}>{t.emoji}</div>
                  <div>
                    <div className="hfl-test-name">{t.name}</div>
                    <div className="hfl-test-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Persona CTA ─────────────────────────────────────────────────── */}
        <section className="hfl-cta">
          <div className="hfl-cta-inner">
            <div className="hfl-cta-blob1" />
            <div className="hfl-cta-blob2" />
            <h2>How do you want to start?</h2>
            <p className="hfl-cta-sub">HomeGentic works for every stage of homeownership. Pick what fits you now.</p>
            <div className="hfl-personas">
              {[
                {
                  icon: "🏠", role: "Homeowner", title: "Build My HomeGentic",
                  desc: "Log services, track maintenance, grow your property score, and be ready to sell on your terms.",
                  cta: "Get started",
                },
                {
                  icon: "👷", role: "Contractor", title: "Join the Network",
                  desc: "Get verified, receive job requests, and have your work permanently credited on homeowner records.",
                  cta: "Apply to join",
                },
                {
                  icon: "🏡", role: "Real Estate Agent", title: "Win More Listings",
                  desc: "Submit proposals on active listing intents, showcase your track record, and earn verified reviews directly on HomeGentic.",
                  cta: "Join as an agent",
                  giftCta: true,
                },
                {
                  icon: "🏆", role: "Ready to Sell", title: "Make Agents Compete for Your Listing",
                  desc: "Post your listing intent, collect competing agent proposals, or go FSBO with our full seller toolkit.",
                  cta: "Start selling smarter",
                },
              ].map((p) => (
                <div key={p.role} className="hfl-persona" onClick={() => navigate("/login")}>
                  <div className="hfl-persona-icon">{p.icon}</div>
                  <div className="hfl-persona-role">{p.role}</div>
                  <div className="hfl-persona-title">{p.title}</div>
                  <div className="hfl-persona-desc">{p.desc}</div>
                  <div className="hfl-persona-cta">
                    {p.cta}
                  </div>
                  {(p as any).giftCta && (
                    <a
                      href="/gift"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-block", marginTop: 12,
                        fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600,
                        color: "var(--sage)", textDecoration: "none",
                        borderBottom: "1px solid transparent",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = "var(--sage)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
                    >
                      🎁 Gift a subscription to a buyer
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Your Data ───────────────────────────────────────────────────── */}
        <section id="hfl-data" className="hfl-data">
          <div className="hfl-data-inner">
            <div>
              <h2>Your records.<br /><em>Forever yours.</em></h2>
              <p className="hfl-data-lead">
                Most apps keep your data on their servers. If they shut down, your records disappear.
                HomeGentic is different — every record you log lives on a public blockchain that no one
                controls, including us. You own it completely.
              </p>
            </div>
            <div className="hfl-data-cards">
              {[
                { icon: "🏠", title: "Your home, your history", body: "Every repair, permit, and inspection you log is yours to keep — whether you stay with HomeGentic for one year or ten." },
                { icon: "📥", title: "Download anytime",        body: "Export your full record as a PDF or raw data file whenever you want. No hoops, no waiting, no fees." },
                { icon: "🔗", title: "Survives us",             body: "Even if HomeGentic ever closed tomorrow, your records would still be readable by anyone with the address. That's the promise." },
                { icon: "🔐", title: "Private by default",      body: "Only you decide who sees what. Sharing a HomeGentic Report with a buyer is your choice — nothing is public until you say so." },
              ].map((card) => (
                <div key={card.title} className="hfl-data-card">
                  <div className="hfl-data-card-icon">{card.icon}</div>
                  <div>
                    <div className="hfl-data-card-title">{card.title}</div>
                    <div className="hfl-data-card-body">{card.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Free Tools ──────────────────────────────────────────────────── */}
        <section id="hfl-tools" className="hfl-tools">
          <div className="hfl-tools-inner">
            <div className="hfl-cta-blob1" />
            <div className="hfl-cta-blob2" />
          <div className="hfl-tools-header">
            <h2>Free tools</h2>
            <p className="hfl-tools-sub">Try these before you sign up — no login, no credit card.</p>
          </div>
          <div className="hfl-tools-grid">
            {[
              {
                icon: "🔍", label: "Buyer tool", title: "HomeGentic Report Lookup",
                desc: "Enter any address to see if the owner has a verified HomeGentic maintenance report ready to share.",
                cta: "Check an address", href: "/check",
              },
              {
                icon: "📅", label: "Planning tool", title: "Instant System Forecast",
                desc: "Enter your home's year built and get a 10-year cost forecast for HVAC, roof, plumbing, electrical, and more.",
                cta: "Get my forecast", href: "/instant-forecast",
              },
              {
                icon: "💰", label: "Pricing tool", title: "Contractor Price Lookup",
                desc: "See what homeowners in your area actually pay for roofing, HVAC, plumbing, flooring, and other common jobs.",
                cta: "Look up prices", href: "/prices",
              },
              {
                icon: "⚙️", label: "Estimator", title: "Home Systems Estimator",
                desc: "Get lifespan estimates and replacement cost ranges for every major system in your home based on install year.",
                cta: "Estimate my systems", href: "/home-systems",
              },
              {
                icon: "🔎", label: "Buyer tool", title: "Buyer's Truth Kit",
                desc: "Enter any address and what the seller is claiming. Get permit records, credibility flags, and the exact questions to ask before you close.",
                cta: "Build my kit", href: "/truth-kit",
              },
            ].map((tool) => (
              <a key={tool.href} href={tool.href} className="hfl-tool-card">
                <div className="hfl-tool-icon">{tool.icon}</div>
                <div>
                  <div className="hfl-tool-label">{tool.label}</div>
                  <div className="hfl-tool-title">{tool.title}</div>
                </div>
                <p className="hfl-tool-desc">{tool.desc}</p>
                <span className="hfl-tool-cta">{tool.cta}</span>
              </a>
            ))}
          </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="hfl-footer">
          <div className="hfl-footer-top">
            <div>
              <span className="hfl-footer-logo">Home<span>Gentic</span></span>
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
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>For Homeowners</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>Service Network</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-report"); }}>HomeGentic Report</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-sell"); }}>Sell Smarter</a></li>
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
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-data"); }}>Your Data</a></li>
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
