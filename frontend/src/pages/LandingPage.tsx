import React, { useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { neighborReferralService } from "@/services/neighborReferral";
import { Helmet } from "react-helmet-async";
import { TrendingUp, CalendarDays, Archive, Home, Download, Link as LinkIcon, Lock } from "lucide-react";
import { CSS } from "./landingStyles";


export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeFeature, setActiveFeature] = React.useState(0);
  const [heroPhase, setHeroPhase] = React.useState(0);
  const [annual, setAnnual] = React.useState(false);

  const HERO_PHASES = [
    { icon: "📋", label: "14 records verified", detail: "Share link ready" },
    { icon: "📊", label: "Score updated", detail: "88 → 91 ↑" },
    { icon: "📤", label: "Share link copied", detail: "Sent to buyer" },
  ];

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
    const t = setInterval(() => setHeroPhase((p) => (p + 1) % 3), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) neighborReferralService.capturePendingRefCode(ref);
  }, [searchParams]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <Helmet>
        <title>HomeGentic — Verified Home Maintenance Records</title>
        <meta name="description" content="HomeGentic gives homeowners a verified, blockchain-backed record of every repair, upgrade, and inspection — boosting home value and buyer confidence." />
        <meta property="og:title" content="HomeGentic — Verified Home Maintenance Records" />
        <meta property="og:description" content="Homes with a verified HomeGentic record sell faster and command a premium. Build your home's complete repair, permit, and service history — shareable in one click." />
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
          <div style={{ display: "flex", alignItems: "center" }}>
            <a href="/" className="hfl-logo">Home<span>Gentic</span></a>
            <ul className={`hfl-nav-links${menuOpen ? " hfl-menu-open" : ""}`}>
              <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/demo"); }}>Demo</a></li>
              <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/pricing"); }}>Pricing</a></li>
              <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/for-pros"); }}>For Pros</a></li>
            </ul>
          </div>
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

        <main>

        {/* ── Social Proof Bar ────────────────────────────────────────────── */}
        <div className="hfl-proof-bar">
          <span className="hfl-proof-stars">★★★★★</span>
          <span className="hfl-proof-sep">·</span>
          <span className="hfl-proof-quote">"Finally, a Carfax for homes"</span>
          <span className="hfl-proof-sep">·</span>
          <span className="hfl-proof-stat">Trusted by 3,400+ homeowners</span>
        </div>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="hfl-hero">
          <div className="hfl-hero-left">
            <h1>Your home's<br /><em>complete record</em></h1>
            <ul className="hfl-hero-bullets">
              <li><span className="hfl-hb-dot">✓</span>Every repair, logged and signed on the blockchain</li>
              <li><span className="hfl-hb-dot">✓</span>AI reminders before things break</li>
              <li><span className="hfl-hb-dot">✓</span>Share your full record with buyers in one click</li>
            </ul>
            <div className="hfl-actions">
              <button className="hfl-btn-main" onClick={() => navigate("/login")}>Start my home's record</button>
              <button className="hfl-btn-soft" onClick={() => window.open("/sample-report", "_blank", "noopener,noreferrer")}>View Sample Report</button>
            </div>
          </div>

          <div className="hfl-hero-right">
            <img src="/hero_home.png" alt="HomeGentic home dashboard" className="hfl-hero-img" />
          </div>
        </section>


        {/* ── Problem ─────────────────────────────────────────────────────── */}
        <section className="hfl-problem">
          <div className="hfl-problem-inner">
            <div className="hfl-problem-img">
              <img src="/records_everywhere.png" alt="Records scattered everywhere" />
            </div>
            <div className="hfl-problem-text">
              <h2>Your home's history is<br /><em>scattered and disappearing</em></h2>
              <p className="hfl-sec-sub">Repair receipts in email. Warranties in a drawer. Permit records at the county office. When it's time to sell — or file an insurance claim — that scattered history costs you thousands.</p>
            </div>
          </div>
        </section>

        {/* ── How It Works ────────────────────────────────────────────────── */}
        <section id="hfl-features" className="hfl-how">
          <div className="hfl-section-header">
            <h2>How It Works</h2>
          </div>
          <div className="hfl-flow">
            {[
              { img: "/setup_your_home.png",        num: "1", title: "Set Up Your Home",       desc: "Add your property and import existing records. AI agents begin organizing your home's history automatically." },
              { img: "/manage_and_maintain.png",    num: "2", title: "Manage & Maintain",       desc: "Schedule services with verified providers. Every job is logged, receipted, and stored on your permanent record." },
              { img: "/generate_your_report.png",   num: "3", title: "Generate Your Report",    desc: "Your HomeGentic Report is a tamper-proof property biography. Share it with buyers or attach it to any listing." },
              { img: "/sell_with_confidence.png",   num: "4", title: "Sell With Confidence",    desc: "List with the agent who wins your bid — or go FSBO with our full suite of seller tools. Your home, your terms." },
            ].map((s) => (
              <div key={s.title} className="hfl-step">
                <div className="hfl-step-num">{s.num}</div>
                <div className="hfl-step-icon">
                  <img src={s.img} alt={s.title} />
                </div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature Showcase ────────────────────────────────────────────── */}
        <section id="hfl-sell" className="hfl-showcase">
          <div className="hfl-showcase-inner">
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
                    <span className="hfl-sc-tab-title">{f.kicker}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="hfl-sc-content">
              <div className="hfl-sc-slide" key={activeFeature}>
                <div className="hfl-sc-heading">{FEATURES[activeFeature].heading}</div>
                <p className="hfl-sc-desc">{FEATURES[activeFeature].desc}</p>
                {activeFeature === 1 ? (
                  <div className="hfl-sc-ai-row">
                    <ul className="hfl-sc-bullets">
                      {FEATURES[activeFeature].bullets.map((b) => (
                        <li key={b}><span className="hfl-sc-bullet-dot">✓</span>{b}</li>
                      ))}
                    </ul>
                    <img src="/ai_buddy.png" alt="HomeGentic AI" className="hfl-sc-ai-buddy" />
                  </div>
                ) : (
                  <ul className="hfl-sc-bullets">
                    {FEATURES[activeFeature].bullets.map((b) => (
                      <li key={b}><span className="hfl-sc-bullet-dot">✓</span>{b}</li>
                    ))}
                  </ul>
                )}
                <button className="hfl-sc-cta" onClick={() => navigate("/login")}>
                  {FEATURES[activeFeature].cta}
                </button>
              </div>

              {/* Visual panel */}
              <div className="hfl-sc-visual" key={`v-${activeFeature}`}>
                <div className="hfl-sc-vis-inner">
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

                {activeFeature === 1 && (
                  <div style={{ background: "white" }}>
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
                  </div>
                )}

                {activeFeature === 2 && (<>
                  <div className="hfl-compete-hdr">
                    <div className="hfl-compete-title">Agent Proposals</div>
                    <div className="hfl-compete-sub">327 Keech Street · 5 received</div>
                  </div>
                  <div className="hfl-compete-body">
                    {[
                      { avi: "/female_agent.png",  name: "Lisa Chen · Keller Williams", detail: "2.4% · Est. net $487k · 18 days", comm: "2.4%", best: true },
                      { avi: "/male_agent.png",    name: "Marcus Rivera · RE/MAX",      detail: "2.8% · Est. net $481k · 22 days", comm: "2.8%", best: false },
                      { avi: "/male_agent_2.png",  name: "Priya Nair · Compass",        detail: "3.0% · Est. net $479k · 25 days", comm: "3.0%", best: false },
                    ].map((a, i) => (
                      <div key={i} className={`hfl-compete-agent${a.best ? " hfl-compete-agent-featured" : ""}`}>
                        <div className="hfl-compete-avi">
                          <img src={a.avi} alt={a.name} />
                        </div>
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
                          {c.verified && <div style={{ fontSize: 10, color: "var(--sage-text)", fontWeight: 700 }}>✓ Verified</div>}
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
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--sage-text)", background: "rgba(122,175,118,0.2)", borderRadius: 100, padding: "3px 10px" }}>$380 ✦ lowest</span>
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
          </div>
        </section>

        {/* ── Report CTA ──────────────────────────────────────────────────── */}
        <section id="hfl-report" className="hfl-report">
          <div className="hfl-report-card">
            <div className="hfl-report-img-col">
              <img src="/sample_report.png" alt="Sample HomeGentic Report" />
            </div>
            <div className="hfl-report-body">
              <div className="hfl-rc-label">The HomeGentic Report</div>
              <h2>Your Home's Verified<br /><em>Biography</em></h2>
              <p>
                When it's time to sell, your HomeGentic Report is a tamper-proof document showing
                every owner, every service, every improvement. Buyers love it. Agents share it.
                Homes with it sell first.
              </p>
              <div className="hfl-rc-actions">
                <button className="hfl-rc-btn" onClick={() => navigate("/login")}>Start Journey</button>
                <button className="hfl-btn-soft" onClick={() => window.open("/sample-report", "_blank", "noopener,noreferrer")}>View Sample Report</button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature Deep Dive ───────────────────────────────────────────── */}
        <section className="hfl-fdd">
          <div className="hfl-fdd-inner">
            <div className="hfl-fdd-header">
              <h2>Built for the moments<br /><em>that actually matter</em></h2>
              <p>Most home apps give you a checklist. HomeGentic gives you documentation that works for you at resale, during insurance claims, and before emergencies happen.</p>
            </div>
            <div className="hfl-fdd-cols">
              {([
                { icon: TrendingUp,   title: "Market Intelligence",         tagline: "Know which renovations actually pay off in your zip code.",       desc: "Uses remodeling data to rank projects by ROI for your area. Compares your score to similar nearby properties so you see exactly where you stand." },
                  { icon: CalendarDays, title: "5-Year Maintenance Calendar", tagline: "Budget for the future instead of being blindsided.",             desc: "Based on your home's system ages and service history, HomeGentic generates a personalized 5-year schedule with projected costs for every task." },
                { icon: Archive,      title: "Warranty Wallet",             tagline: "Every warranty, receipt, and manual — attached to your home.",   desc: "Store appliance warranties, installation receipts, and product manuals tied to the exact job they belong to. Linked to your blockchain record, not buried in your email." },
              ] as const).map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="hfl-fdd-row">
                    <div className="hfl-fdd-icon-wrap">
                      <Icon size={18} color="white" />
                    </div>
                    <div className="hfl-fdd-text">
                      <div className="hfl-fdd-title">{f.title}</div>
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
          <div className="hfl-tcard">
            <div className="hfl-tcard-img">
              <img src="/testimonial_image.png" alt="Homeowners celebrating their sale" />
            </div>
            <div className="hfl-tcard-body">
              <div className="hfl-tcard-openquote">"</div>
              <div className="hfl-tcard-headline">We got <span className="hfl-tcard-green">$7K</span><br />over asking.</div>
              <p className="hfl-tcard-text">Our buyers said the HomeGentic Report was the reason they felt comfortable waiving the inspection contingency. It's a game changer."</p>
              <div className="hfl-tcard-meta">
                <span className="hfl-tcard-stars">★★★★★</span>
                <span className="hfl-tcard-verified">✓ VERIFIED SELLER</span>
              </div>
              <div className="hfl-tcard-author">
                <span className="hfl-tcard-name">Micah R.</span>
                <span className="hfl-tcard-divider" />
                <span className="hfl-tcard-location">Winter Park, FL</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────────────── */}
        <section className="hfl-pricing">
          <div className="hfl-pricing-inner">
            <div className="hfl-pricing-header">
              <h2>Start for {annual ? "$100/yr" : "$10/mo"}.<br /><em>Your home earns it back.</em></h2>
              <p className="hfl-sec-sub">A verified maintenance record pays for itself the first time a buyer negotiates. Pick the plan that fits your homeownership stage.</p>
            </div>

            {/* Billing toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2.5rem" }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase" as const, color: annual ? "var(--plum-mid)" : "var(--plum)", fontWeight: annual ? 400 : 700 }}>Monthly</span>
              <button
                onClick={() => setAnnual((v) => !v)}
                aria-label="Toggle annual billing"
                style={{
                  width: "2.5rem", height: "1.375rem", borderRadius: 100,
                  border: "none", cursor: "pointer",
                  background: annual ? "var(--sage)" : "var(--rule)",
                  position: "relative", transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: "3px",
                  left: annual ? "calc(100% - 1.125rem)" : "3px",
                  width: "1rem", height: "1rem", borderRadius: "50%",
                  background: "white", transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase" as const, color: annual ? "var(--plum)" : "var(--plum-mid)", fontWeight: annual ? 700 : 400 }}>Annual</span>
              {annual && (
                <span style={{ background: "var(--sage)", color: "white", padding: "2px 10px", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em" }}>
                  Save 2 months
                </span>
              )}
            </div>

            <div className="hfl-pricing-grid">
              {([
                { tier: "Basic",   monthly: 10, annual: 100, tag: null as string | null, properties: "1 property",   photos: "5 photos/job",  quotes: "3 open quotes" },
                { tier: "Pro",     monthly: 20, annual: 200, tag: "Most Popular",        properties: "5 properties", photos: "10 photos/job", quotes: "10 open quotes" },
                { tier: "Premium", monthly: 40, annual: 400, tag: null as string | null, properties: "20 properties", photos: "30 photos/job", quotes: "Unlimited quotes" },
              ]).map((plan) => (
                <div key={plan.tier} className={`hfl-plan-card${plan.tag ? " hfl-plan-featured" : ""}`}>
                  {plan.tag && <div className="hfl-plan-badge">{plan.tag}</div>}
                  <div className="hfl-plan-tier">{plan.tier}</div>
                  <div className="hfl-plan-price">
                    ${annual ? plan.annual : plan.monthly}<span className="hfl-plan-period">/{annual ? "yr" : "mo"}</span>
                  </div>
                  {annual && (
                    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.7rem", color: "var(--sage-text)", marginTop: "-20px", marginBottom: "20px", fontWeight: 600 }}>
                      ${(plan.annual / 12).toFixed(2)}/mo billed annually
                    </div>
                  )}
                  <ul className="hfl-plan-features">
                    <li>✓ {plan.properties}</li>
                    <li>✓ {plan.photos}</li>
                    <li>✓ {plan.quotes}</li>
                    <li>✓ Verified maintenance record</li>
                    <li>✓ AI home intelligence</li>
                  </ul>
                  <button className="hfl-plan-cta" onClick={() => navigate("/login")}>Get started</button>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "0.9rem", color: "var(--plum-mid)", marginTop: "1.5rem", lineHeight: 1.7 }}>
              {annual
                ? "* Billed annually upfront. Cancel anytime — subscription access ends at the close of your current billing year. Your blockchain records remain yours forever."
                : "* Billed monthly. Cancel anytime — subscription access ends at the close of your current billing period. Your blockchain records remain yours forever."}
            </p>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────────── */}
        <section className="hfl-final-cta">
          <div className="hfl-final-cta-inner">
            <div className="hfl-kicker" style={{ color: "rgba(253,252,250,0.45)" }}>✦ Start Today</div>
            <h2>Your home's history is being<br /><em>lost every day it goes unrecorded.</em></h2>
            <p className="hfl-final-cta-sub">3,400+ homeowners have already started building their record. The best time to start was the day you moved in. The second best time is now.</p>
            <button className="hfl-final-cta-btn" onClick={() => navigate("/login")}>Start my home's record</button>
            <div className="hfl-final-cta-fine">From $10/mo · Cancel anytime · Your records live on the blockchain forever</div>
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
                { Icon: Home,     title: "Your home, your history", body: "Every repair, permit, and inspection you log is yours to keep — whether you stay with HomeGentic for one year or ten." },
                { Icon: Download, title: "Download anytime",        body: "Export your full record as a PDF or raw data file whenever you want. No hoops, no waiting, no fees." },
                { Icon: LinkIcon,  title: "Survives us",             body: "Even if HomeGentic ever closed tomorrow, your records would still be readable by anyone with the address. That's the promise." },
                { Icon: Lock,     title: "Private by default",      body: "Only you decide who sees what. Sharing a HomeGentic Report with a buyer is your choice — nothing is public until you say so." },
              ].map((card) => (
                <div key={card.title} className="hfl-data-card">
                  <div className="hfl-data-card-icon"><card.Icon size={22} strokeWidth={1.5} /></div>
                  <div>
                    <div className="hfl-data-card-title">{card.title}</div>
                    <div className="hfl-data-card-body">{card.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        </main>

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
