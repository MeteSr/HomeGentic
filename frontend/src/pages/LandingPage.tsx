import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { neighborReferralService } from "@/services/neighborReferral";
import { Helmet } from "react-helmet-async";
import { CSS } from "./landingStyles";
import {
  LayoutDashboard, Home, Wrench, FileText, CreditCard, Zap, Cpu,
  ClipboardList, Bot, Bell, MoreVertical,
  ShieldCheck, Lock, CheckCircle2, Infinity,
  Users, Briefcase, Shield,
  Wifi, MessageSquare, Globe, Mic,
} from "lucide-react";

/* ── House SVG logo ── */
function HouseSvg() {
  return (
    <svg width="26" height="24" viewBox="0 0 26 24" fill="none" aria-hidden="true">
      <polygon points="13,1 25,11 1,11" fill="#00CEC8" />
      <rect x="1" y="11" width="12" height="12" fill="#EB4203" />
      <rect x="13" y="11" width="12" height="12" fill="#FF9C5F" />
      <rect x="10" y="17" width="6" height="6" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

/* ── ICP gradient infinity symbol ── */
function IcpLogo({ size = 40 }: { size?: number }) {
  const id = `icp-${size}`;
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#8B5CF6" />
          <stop offset="50%"  stopColor="#F97316" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>
      </defs>
      <path
        d="M30 18C30 18 20 2 10 2C2 2 2 18 10 18C2 18 2 34 10 34C20 34 30 18 30 18Z"
        fill={`url(#${id})`}
      />
      <path
        d="M30 18C30 18 40 2 50 2C58 2 58 18 50 18C58 18 58 34 50 34C40 34 30 18 30 18Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}

/* ── Quorum hexagon logo ── */
function QuorumLogo() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" fill="#0F4C2A" />
      <polygon points="22,8 36,16 36,30 22,38 8,30 8,16" fill="#16A34A" fillOpacity="0.3" />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="white" fontFamily="Inter,sans-serif">Q</text>
    </svg>
  );
}

/* ── Gift icon ── */
function GiftIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="4" y="18" width="36" height="24" rx="2" fill="#FED7AA" />
      <rect x="4" y="12" width="36" height="8" rx="2" fill="#FB923C" />
      <rect x="20" y="4" width="4" height="36" fill="#F97316" />
      <path d="M22 12C22 12 16 4 12 6C9 7.5 10 12 22 12Z" fill="#F97316" />
      <path d="M22 12C22 12 28 4 32 6C35 7.5 34 12 22 12Z" fill="#F97316" />
    </svg>
  );
}

/* ── Hero illustration: warm glow + house silhouette + palm trees ── */
function HeroIllustration() {
  return (
    <svg
      className="hfl-hero-illustration"
      viewBox="0 0 600 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Warm background glows */}
      <ellipse cx="480" cy="120" rx="260" ry="200" fill="rgba(252,239,195,0.45)" />
      <ellipse cx="520" cy="300" rx="180" ry="160" fill="rgba(255,156,95,0.18)" />
      <ellipse cx="100" cy="360" rx="160" ry="120" fill="rgba(0,206,200,0.10)" />

      {/* Faded luxury house silhouette */}
      <g opacity="0.07" fill="#1E293B">
        <polygon points="300,140 460,240 140,240" />
        <rect x="140" y="240" width="320" height="180" />
        <rect x="240" y="300" width="60" height="120" />
        <rect x="320" y="280" width="80" height="60" />
        <rect x="180" y="260" width="70" height="50" />
      </g>

      {/* Teal palm tree — left */}
      <g opacity="0.22">
        <rect x="88" y="290" width="7" height="160" rx="3" fill="#00CEC8" />
        <ellipse cx="68" cy="270" rx="38" ry="18" fill="#00CEC8" transform="rotate(-30 68 270)" />
        <ellipse cx="118" cy="258" rx="38" ry="18" fill="#00A09B" transform="rotate(20 118 258)" />
        <ellipse cx="78" cy="248" rx="32" ry="15" fill="#00CEC8" transform="rotate(-50 78 248)" />
        <ellipse cx="108" cy="242" rx="32" ry="15" fill="#00A09B" transform="rotate(45 108 242)" />
        <ellipse cx="91" cy="235" rx="28" ry="12" fill="#00CEC8" transform="rotate(-10 91 235)" />
      </g>

      {/* Salmon palm tree — right */}
      <g opacity="0.15">
        <rect x="496" y="310" width="7" height="140" rx="3" fill="#FF9C5F" />
        <ellipse cx="476" cy="292" rx="36" ry="16" fill="#FF9C5F" transform="rotate(-25 476 292)" />
        <ellipse cx="522" cy="280" rx="36" ry="16" fill="#EB4203" transform="rotate(18 522 280)" />
        <ellipse cx="482" cy="270" rx="30" ry="13" fill="#FF9C5F" transform="rotate(-45 482 270)" />
        <ellipse cx="514" cy="265" rx="30" ry="13" fill="#EB4203" transform="rotate(40 514 265)" />
        <ellipse cx="499" cy="258" rx="26" ry="11" fill="#FF9C5F" transform="rotate(-8 499 258)" />
      </g>
    </svg>
  );
}

/* ── Dashboard mockup (right side of hero) ── */
function DashboardMockup() {
  const navItems = [
    { Icon: LayoutDashboard, label: "Dashboard",         active: true },
    { Icon: Home,            label: "My Properties"     },
    { Icon: Wrench,          label: "Maintenance"       },
    { Icon: FileText,        label: "Documents"         },
    { Icon: CreditCard,      label: "Transactions"      },
    { Icon: Zap,             label: "Bills & Utilities" },
    { Icon: Cpu,             label: "IoT Devices"       },
    { Icon: ClipboardList,   label: "Reports"           },
    { Icon: Bot,             label: "AI Assistant"      },
  ];
  const activity = [
    { dot: "hfl-dm-act-dot-green",  title: "HVAC maintenance completed",    sub: "Duct cleaning by you and AC Pro Services", date: "May 4" },
    { dot: "hfl-dm-act-dot-blue",   title: "Added document: Roof Inspection", sub: "Uploaded to 123 Maple St",               date: "May 3" },
    { dot: "hfl-dm-act-dot-orange", title: "New quote received",             sub: "Kitchen sink repair",                     date: "May 2" },
  ];
  return (
    <div className="hfl-dm" aria-hidden="true">
      {/* Top bar */}
      <div className="hfl-dm-topbar">
        <div className="hfl-dm-topbar-logo">
          <HouseSvg />
          <span>Home<span style={{ color: "#00CEC8" }}>Gentic</span></span>
        </div>
        <div className="hfl-dm-topbar-icons">
          <Bell size={12} color="#64748B" />
          <MoreVertical size={12} color="#64748B" />
        </div>
      </div>

      {/* Body */}
      <div className="hfl-dm-body">
        {/* Sidebar */}
        <div className="hfl-dm-sidebar">
          {navItems.map((item) => (
            <div key={item.label} className={`hfl-dm-nav${item.active ? " hfl-dm-nav-active" : ""}`}>
              <item.Icon size={12} color={item.active ? "#EB4203" : "#64748B"} />
              {item.label}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="hfl-dm-main">
          <div className="hfl-dm-welcome">Welcome back, Sarah!</div>
          <div className="hfl-dm-main-cols">
            {/* Left column: existing cards */}
            <div className="hfl-dm-main-left">
              <div className="hfl-dm-cards-row">
                <div className="hfl-dm-score-card">
                  <div className="hfl-dm-card-label">Property Health Score</div>
                  <div className="hfl-dm-score-wrap">
                    <div className="hfl-dm-score-ring">
                      <span className="hfl-dm-score-val">82</span>
                    </div>
                    <div>
                      <div className="hfl-dm-score-delta">↑ 12 pts</div>
                      <div className="hfl-dm-score-sub">vs last month</div>
                    </div>
                  </div>
                </div>
                <div className="hfl-dm-maint-card">
                  <div className="hfl-dm-card-label">Upcoming Maintenance</div>
                  <div className="hfl-dm-maint-nums">
                    <div>
                      <div className="hfl-dm-maint-num">3</div>
                      <div className="hfl-dm-maint-lbl">This Week</div>
                    </div>
                    <div>
                      <div className="hfl-dm-maint-num">7</div>
                      <div className="hfl-dm-maint-lbl">This Month</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hfl-dm-stats-row">
                {[
                  { label: "Open Jobs",       val: 2 },
                  { label: "Quotes Received", val: 5 },
                  { label: "Open Offers",     val: 1 },
                ].map((s) => (
                  <div key={s.label} className="hfl-dm-stat">
                    <div className="hfl-dm-stat-label">{s.label}</div>
                    <div className="hfl-dm-stat-val">{s.val}</div>
                    <div className="hfl-dm-stat-link">View</div>
                  </div>
                ))}
              </div>

              <div className="hfl-dm-activity-label">Recent Activity</div>
              {activity.map((a) => (
                <div key={a.title} className="hfl-dm-act-item">
                  <div className={`hfl-dm-act-dot ${a.dot}`} />
                  <div className="hfl-dm-act-body">
                    <div className="hfl-dm-act-title">{a.title}</div>
                    <div className="hfl-dm-act-sub">{a.sub}</div>
                  </div>
                  <div className="hfl-dm-act-date">{a.date}</div>
                </div>
              ))}
            </div>

            {/* Right column: property, membership, next maintenance */}
            <div className="hfl-dm-main-right">
              {/* Property card */}
              <div className="hfl-dm-prop-card">
                <svg width="108" height="52" viewBox="0 0 108 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="108" height="52" fill="#F1F5F9" />
                  <polygon points="54,8 90,28 18,28" fill="#00CEC8" opacity="0.7" />
                  <rect x="18" y="28" width="36" height="20" fill="#EB4203" opacity="0.6" />
                  <rect x="54" y="28" width="36" height="20" fill="#FF9C5F" opacity="0.6" />
                  <rect x="47" y="36" width="14" height="12" fill="white" opacity="0.8" />
                </svg>
                <div className="hfl-dm-prop-info">
                  <div className="hfl-dm-prop-addr">123 Maple Street</div>
                  <div className="hfl-dm-prop-city">Austin, TX 78701</div>
                </div>
              </div>

              {/* Membership card */}
              <div className="hfl-dm-member-card">
                <div className="hfl-dm-member-title">MEMBERSHIP</div>
                <div className="hfl-dm-member-tier">
                  Pro Plan
                  <span className="hfl-dm-member-verified">✓ Verified</span>
                </div>
                <div className="hfl-dm-member-detail">5 properties · Renews Jun 1</div>
                <div className="hfl-dm-member-link">Manage plan →</div>
              </div>

              {/* Next maintenance card */}
              <div className="hfl-dm-next-maint">
                <div className="hfl-dm-next-title">NEXT TASK</div>
                <div className="hfl-dm-next-date">May 28</div>
                <div className="hfl-dm-next-task">HVAC filter replacement due</div>
                <div className="hfl-dm-next-link">Schedule →</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Data ── */
const TRUST_BADGES: { bg: string; color: string; Icon: React.ElementType; title: string; sub: string }[] = [
  { bg: "#E0FAFA", color: "#00CEC8", Icon: ShieldCheck,   title: "Blockchain Verified",  sub: "Built on ICP for data permanence" },
  { bg: "#FFF3EE", color: "#FF9C5F", Icon: Lock,          title: "Secure & Private",      sub: "You own your data. Always." },
  { bg: "#FFF3EE", color: "#EB4203", Icon: CheckCircle2,  title: "Dual-Signature",        sub: "Every job verified by both parties" },
  { bg: "#E0FAFA", color: "#00CEC8", Icon: Infinity,      title: "Internet Computer",     sub: "Decentralized. Scalable. Unstoppable." },
];

const ROLES: { bg: string; color: string; Icon: React.ElementType; title: string; desc: string }[] = [
  {
    bg: "#E0FAFA", color: "#00CEC8", Icon: Users, title: "For Homeowners",
    desc: "Track maintenance, manage bills, get quotes, monitor property health, and list FSBO.",
  },
  {
    bg: "#FFF3EE", color: "#FF9C5F", Icon: Briefcase, title: "For Contractors",
    desc: "Receive quote requests, submit bids, log jobs, build your reputation, and grow your business.",
  },
  {
    bg: "#FFF3EE", color: "#EB4203", Icon: Shield, title: "For Admins",
    desc: "Verify ownership, manage subscriptions, monitor platform health and security.",
  },
];

const FEATURES: { bg: string; color: string; Icon: React.ElementType; title: string; desc: string }[] = [
  { bg: "#E0FAFA", color: "#00CEC8", Icon: Wrench,        title: "Smart Maintenance",     desc: "Track history, schedule tasks, and get AI-powered predictive maintenance recommendations." },
  { bg: "#FFF3EE", color: "#FF9C5F", Icon: Wifi,          title: "IoT Integration",       desc: "Connect Nest, Ecobee, Moen Flo, Ring Alarm, and 8+ devices for real-time monitoring." },
  { bg: "#FFF3EE", color: "#EB4203", Icon: MessageSquare, title: "Get Quotes",            desc: "Request quotes from trusted contractors and compare bids side-by-side." },
  { bg: "#FFF3EE", color: "#EB4203", Icon: ShieldCheck,   title: "Dual-Signature Jobs",  desc: "Jobs are verified by both homeowner and contractor and immutably recorded on ICP." },
  { bg: "#E0FAFA", color: "#00CEC8", Icon: Home,          title: "FSBO Listings",        desc: "List your property for sale, manage sealed-bid offers, and match with verified agents." },
  { bg: "#FFF3EE", color: "#FF9C5F", Icon: Globe,         title: "360° Panorama Viewer", desc: "Immersive property tours with PlayCanvas-powered 360° panorama viewer." },
  { bg: "#FFF3EE", color: "#EB4203", Icon: Mic,           title: "AI Voice Agent",        desc: "Ask questions, get updates, and manage your property—hands-free with Claude-powered AI." },
  { bg: "#E0FAFA", color: "#00CEC8", Icon: ClipboardList, title: "Immutable Reports",    desc: "Generate tamper-proof reports with shareable links for insurance, buyers, or contractors." },
];

const PLANS = [
  {
    tier: "Basic", sub: "For homeowners getting started", price: 10, tag: null as string | null,
    tierClass: "hfl-plan-tier-teal", ctaClass: "hfl-plan-cta-teal", checkClass: "hfl-plan-feat-check-teal",
    features: ["1 Property", "Basic Maintenance Tracking", "Document Storage", "Email Support"],
  },
  {
    tier: "Pro", sub: "For growing homeowners", price: 20, tag: null,
    tierClass: "hfl-plan-tier-teal", ctaClass: "hfl-plan-cta-teal", checkClass: "hfl-plan-feat-check-teal",
    features: ["Up to 5 Properties", "Advanced Maintenance", "IoT Integrations", "Priority Support"],
  },
  {
    tier: "Premium", sub: "For power users", price: 40, tag: "Most Popular",
    tierClass: "hfl-plan-tier-orange", ctaClass: "hfl-plan-cta-orange", checkClass: "hfl-plan-feat-check-orange",
    features: ["Up to 20 Properties", "All Insights & Predictions", "360° Viewer", "Premium Support"],
  },
  {
    tier: "Contractor Free", sub: "For contractors starting out", price: 0, tag: null,
    tierClass: "hfl-plan-tier-peach", ctaClass: "hfl-plan-cta-peach", checkClass: "hfl-plan-feat-check-teal",
    features: ["Receive Quote Requests", "Submit Bids", "Basic Profile", "Up to 5 Jobs/Month"],
  },
  {
    tier: "Contractor Pro", sub: "For growing contractors", price: 30, tag: null,
    tierClass: "hfl-plan-tier-orange", ctaClass: "hfl-plan-cta-orange", checkClass: "hfl-plan-feat-check-orange",
    features: ["Unlimited Quote Requests", "Priority Placement", "Verified Badge", "Analytics & Insights"],
  },
];

const INTEGRATIONS = ["nest", "ecobee", "MOEN", "ring", "Schneider Electric", "myQ", "August", "+8 more"];

/* ── Component ── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = React.useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) neighborReferralService.capturePendingRefCode(ref);
  }, [searchParams]);

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

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <Helmet>
        <title>HomeGentic™ — Verified Home Maintenance Records on ICP</title>
        <meta name="description" content="HomeGentic helps homeowners and contractors manage maintenance, documentation, and transactions with blockchain-verified trust and AI-powered insights." />
        <meta property="og:title" content="HomeGentic™ — Verified Home Maintenance Records" />
        <meta property="og:description" content="Manage. Maintain. Protect. Your Home. Built on the Internet Computer." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "HomeGentic™",
          "url": "https://homegentic.app/",
          "description": "Verified home maintenance records on the Internet Computer blockchain.",
        })}</script>
      </Helmet>
      <style>{CSS}</style>
      <div className="hfl">

        {/* ── Nav ── */}
        <nav className="hfl-nav">
          <a href="/" className="hfl-logo">
            <HouseSvg />
            <span className="hfl-logo-text">Home<span>Gentic™</span></span>
          </a>
          <ul className="hfl-nav-links">
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features-section"); }}>Features</a></li>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-roles-section"); }}>For Homeowners</a></li>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-roles-section"); }}>For Contractors</a></li>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-pricing-section"); }}>Pricing</a></li>
            <li><a onClick={(e) => e.preventDefault()}>Security</a></li>
            <li><a onClick={(e) => e.preventDefault()}>Resources ▾</a></li>
          </ul>
          <div className="hfl-nav-actions">
            <button className="hfl-nav-signin" onClick={() => navigate("/login")}>Log In</button>
            <button className="hfl-nav-pill" onClick={() => navigate("/login")}>Sign Up</button>
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

        {/* ── Hero ── */}
        <div className="hfl-hero-wrap">
          <section className="hfl-hero">
            <div className="hfl-hero-left">
              <div className="hfl-hero-badge">BUILT ON THE INTERNET COMPUTER (ICP)</div>
              <h1>
                Manage. Maintain.<br />
                <span className="hfl-hero-teal">Protect.</span>{" "}
                <span className="hfl-hero-orange">Your Home.</span>
              </h1>
              <p>
                HomeGentic helps homeowners manage maintenance,
                documentation, and transactions with blockchain-verified trust
                and AI-powered insights.
              </p>
              <div className="hfl-actions">
                <button className="hfl-btn-main" onClick={() => navigate("/login")}>Get Started Free</button>
                <button className="hfl-btn-soft" onClick={() => scrollTo("hfl-features-section")}>
                  ▶ See How It Works
                </button>
              </div>
              <div className="hfl-trust-pills">
                {TRUST_BADGES.map((b) => (
                  <div key={b.title} className="hfl-trust-pill">
                    <div className="hfl-trust-pill-icon" style={{ background: b.bg }}>
                      <b.Icon size={15} color={b.color} />
                    </div>
                    <div>
                      <div className="hfl-trust-pill-label">{b.title}</div>
                      <div className="hfl-trust-pill-sub">{b.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hfl-hero-right">
              <HeroIllustration />
              <div className="hfl-dm-wrap">
                <DashboardMockup />
              </div>
            </div>
          </section>
        </div>

        {/* ── Roles ── */}
        <section id="hfl-roles-section" className="hfl-roles">
          <div className="hfl-section-header">
            <h2>Built for every role in your property journey</h2>
          </div>
          <div className="hfl-roles-grid">
            {ROLES.map((r) => (
              <div key={r.title} className="hfl-role-card">
                <div className="hfl-role-icon" style={{ background: r.bg }}>
                  <r.Icon size={24} color={r.color} />
                </div>
                <div className="hfl-role-title">{r.title}</div>
                <div className="hfl-role-desc">{r.desc}</div>
                <button className="hfl-role-link" onClick={() => navigate("/login")}>
                  Learn more →
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section id="hfl-features-section" className="hfl-features">
          <div className="hfl-section-header">
            <h2>Everything you need to protect and grow your property</h2>
          </div>
          <div className="hfl-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="hfl-feat-card">
                <div className="hfl-feat-icon" style={{ background: f.bg }}>
                  <f.Icon size={20} color={f.color} />
                </div>
                <div className="hfl-feat-body">
                  <div className="hfl-feat-title">{f.title}</div>
                  <div className="hfl-feat-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust Strip ── */}
        <div className="hfl-strip">
          <div className="hfl-strip-inner">
            <div className="hfl-strip-col">
              <div className="hfl-strip-logo"><QuorumLogo /></div>
              <div>
                <div className="hfl-strip-title">Quorum HOA Members</div>
                <div className="hfl-strip-desc">Get 10% off any plan</div>
                <div>Use code: <span className="hfl-strip-code">QUORUM10</span></div>
              </div>
            </div>
            <div className="hfl-strip-col">
              <div className="hfl-strip-logo"><GiftIcon /></div>
              <div>
                <div className="hfl-strip-title">Invite a Neighbor, Get Rewarded</div>
                <div className="hfl-strip-desc">You get $10 credit. They get $10 off.</div>
                <button className="hfl-strip-link" onClick={() => navigate("/invite")}>
                  Learn how it works →
                </button>
              </div>
            </div>
            <div className="hfl-strip-col">
              <div className="hfl-strip-logo"><IcpLogo size={44} /></div>
              <div>
                <div className="hfl-strip-title">Built on ICP</div>
                <div className="hfl-strip-desc">
                  Your data is yours. Permanently stored. Tamper-proof. Future-proof.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Integrations ── */}
        <div className="hfl-integrations">
          <h3>Works with the tools you already use</h3>
          <div className="hfl-integ-logos">
            {INTEGRATIONS.map((name) => (
              <span key={name} className="hfl-integ-logo">{name}</span>
            ))}
          </div>
        </div>

        {/* ── Pricing ── */}
        <section id="hfl-pricing-section" className="hfl-pricing">
          <div className="hfl-pricing-header">
            <h2>Simple, transparent pricing for everyone</h2>
            <p>Choose the plan that fits your needs. All plans include blockchain verification and immutable storage.</p>
          </div>
          <div className="hfl-pricing-grid">
            {PLANS.map((p) => (
              <div key={p.tier} className={`hfl-plan-card${p.tag ? " hfl-plan-featured" : ""}`}>
                {p.tag && <div className="hfl-plan-badge">{p.tag}</div>}
                <div className={`hfl-plan-tier ${p.tierClass}`}>{p.tier}</div>
                <div className="hfl-plan-sub">{p.sub}</div>
                <div className="hfl-plan-price">
                  {p.price === 0 ? "$0" : `$${p.price}`}
                  <span>/month</span>
                </div>
                <ul className="hfl-plan-features">
                  {p.features.map((f) => (
                    <li key={f}>
                      <span className={`hfl-plan-feat-check ${p.checkClass}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`hfl-plan-cta ${p.ctaClass}`}
                  onClick={() => navigate("/login")}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
          <div className="hfl-pricing-guarantee">
            <ShieldCheck size={16} color="#00CEC8" />
            <span>30-day money-back guarantee</span>
            <span className="hfl-pricing-guarantee-sep">•</span>
            <span>Cancel anytime</span>
          </div>
        </section>

        </main>

        {/* ── Footer ── */}
        <footer className="hfl-footer">
          <div className="hfl-footer-inner">
            <div className="hfl-footer-left">
              <div className="hfl-footer-icp-logo">
                <IcpLogo size={44} />
              </div>
              <div>
                <div className="hfl-footer-icp-title">Built on the Internet Computer Protocol (ICP)</div>
                <div className="hfl-footer-icp-sub">
                  Your data is yours. Permanently stored. Tamper-proof. Future-proof.
                </div>
              </div>
            </div>
            <div className="hfl-footer-quorum-center">
              <div className="hfl-footer-quorum-center-title">Quorum HOA members save 10%</div>
              <div className="hfl-footer-quorum-center-code">
                Use code: <span className="hfl-footer-quorum-code">QUORUM10</span>
              </div>
            </div>
            <button
              className="hfl-footer-btn"
              onClick={() => window.open("https://internetcomputer.org", "_blank", "noopener,noreferrer")}
            >
              Learn About ICP
            </button>
          </div>
        </footer>

      </div>
    </>
  );
}
