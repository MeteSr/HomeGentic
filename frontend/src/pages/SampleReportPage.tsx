import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// ── Tokens ─────────────────────────────────────────────────────────────────────
const BLUE   = "#2B34FF";
const YELLOW = "#FFD23F";
const CORAL  = "#FF5C39";
const INK    = "#0B0D1A";
const PAPER  = "#FCFCFD";
const MUTED  = "#6B7080";
const BORDER = "#EDEEF2";
const LBLUE  = "#F3F4FF";
const VBADGE = "#E0E2FF";

const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";
const BODY    = "'Hanken Grotesk', sans-serif";
const MONO    = "'JetBrains Mono', monospace";

// ── Mock data ──────────────────────────────────────────────────────────────────
const PROPERTY = {
  address: "323 Keech St",
  city:    "Daytona Beach, FL 32114",
  since:   "2019",
  score:   87,
  grade:   "A",
  token:   "HG-2025-08291",
};

type JobStatus = "VERIFIED" | "PENDING" | "DIY";

interface Job {
  title:       string;
  contractor:  string | null;
  date:        string;
  cost:        string;
  category:    string;
  status:      JobStatus;
  note:        string;
  sigDate:     string | null;
}

const JOBS: Job[] = [
  {
    title: "Roof Replacement",
    contractor: "Harpeth Roofing Co.",
    date: "Jun 12, 2025",
    cost: "$14,200",
    category: "Structural",
    status: "VERIFIED",
    note: "Full tear-off, 30-year architectural shingles. Gutters reseated.",
    sigDate: "Jun 14, 2025",
  },
  {
    title: "Water Softener Installation",
    contractor: "H2O Solutions FL",
    date: "Aug 5, 2025",
    cost: "$890",
    category: "Plumbing",
    status: "PENDING",
    note: "Whole-house softener installed at main supply line. Homeowner signed Aug 5 — awaiting contractor confirmation to lock the record.",
    sigDate: null,
  },
  {
    title: "HVAC Tune-Up & Filter",
    contractor: "Cool Air HVAC",
    date: "Mar 4, 2025",
    cost: "$380",
    category: "HVAC",
    status: "VERIFIED",
    note: "Annual service. Coils cleaned, refrigerant checked. Filter replaced.",
    sigDate: "Mar 4, 2025",
  },
  {
    title: "Backyard Fence Staining",
    contractor: null,
    date: "Jul 14, 2025",
    cost: "$210",
    category: "Exterior",
    status: "DIY",
    note: "Owner applied Olympic Maximum semi-transparent stain, two coats. Approx. 180 linear feet treated. Materials receipts on file.",
    sigDate: "Jul 14, 2025",
  },
  {
    title: "Electrical Panel Upgrade — 100A → 200A",
    contractor: "Eastside Electric",
    date: "Apr 18, 2024",
    cost: "$3,850",
    category: "Electrical",
    status: "VERIFIED",
    note: "Main panel replaced. Permit #2024-E-04471 on file.",
    sigDate: "Apr 22, 2024",
  },
  {
    title: "Water Heater Replacement",
    contractor: "Daytona Plumbing Pros",
    date: "Jan 9, 2024",
    cost: "$1,200",
    category: "Plumbing",
    status: "VERIFIED",
    note: "50-gal gas water heater replaced. 6-yr tank warranty on file.",
    sigDate: "Jan 10, 2024",
  },
  {
    title: "Gutter Cleaning & Downspout Flush",
    contractor: "Bell & Sons",
    date: "Aug 21, 2023",
    cost: "$180",
    category: "Exterior",
    status: "VERIFIED",
    note: "All gutters cleared. Downspout extensions repositioned.",
    sigDate: "Aug 21, 2023",
  },
  {
    title: "Window & Door Weatherstripping",
    contractor: "ProSeal FL",
    date: "May 3, 2023",
    cost: "$650",
    category: "Envelope",
    status: "VERIFIED",
    note: "7 windows + 2 exterior doors resealed. Draft test passed.",
    sigDate: "May 5, 2023",
  },
];

const SCORE_FACTORS = [
  { label: "Verified jobs",         pts: 40, max: 40, pct: "100%", color: YELLOW },
  { label: "Documented value",      pts: 16, max: 20, pct: "80%",  color: "#6E77FF" },
  { label: "Property verification", pts: 12, max: 20, pct: "60%",  color: "#6E77FF" },
  { label: "System diversity",      pts: 19, max: 20, pct: "95%",  color: YELLOW },
];

const CATEGORY_COLORS: Record<string, string> = {
  Structural: BLUE,
  HVAC:       "#7B61FF",
  Electrical: "#F59E0B",
  Plumbing:   "#29ABE2",
  Exterior:   CORAL,
  Envelope:   "#34A853",
  DIY:        MUTED,
};

interface Room {
  name:     string;
  sqft:     number;
  fixtures: string[];
  lastWork: string;
  icon:     string;
}

const ROOMS: Room[] = [
  {
    name: "Kitchen",
    sqft: 210,
    icon: "🍳",
    fixtures: [
      "GE Profile 30\" Range (2021)",
      "Samsung French Door Refrigerator (2019)",
      "Bosch 500 Series Dishwasher (2022)",
    ],
    lastWork: "Cabinet repaint · May 2024",
  },
  {
    name: "Primary Bathroom",
    sqft: 95,
    icon: "🚿",
    fixtures: [
      "American Standard Champion Toilet (replaced Jan 2024)",
      "Delta Trinsic faucets",
      "60\" alcove tub/shower combo",
    ],
    lastWork: "Toilet replacement · Jan 2024",
  },
  {
    name: "Living Room",
    sqft: 320,
    icon: "🛋️",
    fixtures: [
      "Hardwood floors, refinished Mar 2023",
      "Crown molding",
      "Hunter 52\" ceiling fan (2022)",
    ],
    lastWork: "Floor refinish · Mar 2023",
  },
  {
    name: "Garage",
    sqft: 480,
    icon: "🚗",
    fixtures: [
      "2-car, attached",
      "LiftMaster 84501 opener (2022)",
      "220V outlet — EV-ready",
    ],
    lastWork: "Door spring replacement · Oct 2022",
  },
];

interface RecurringService {
  name:        string;
  provider:    string;
  frequency:   string;
  costPerVisit: string;
  lastVisit:   string;
  nextVisit:   string;
  status:      "ACTIVE" | "DUE";
}

const RECURRING: RecurringService[] = [
  {
    name:        "HVAC Maintenance",
    provider:    "Precision Air FL",
    frequency:   "Quarterly",
    costPerVisit: "$185",
    lastVisit:   "Apr 2025",
    nextVisit:   "Jul 2025",
    status:      "DUE",
  },
  {
    name:        "Pest Control",
    provider:    "Enviro Shield Pest",
    frequency:   "Monthly",
    costPerVisit: "$85",
    lastVisit:   "Jul 2025",
    nextVisit:   "Aug 2025",
    status:      "ACTIVE",
  },
  {
    name:        "Lawn & Irrigation",
    provider:    "Green Zone FL",
    frequency:   "Bi-monthly",
    costPerVisit: "$120",
    lastVisit:   "Jun 2025",
    nextVisit:   "Aug 2025",
    status:      "ACTIVE",
  },
];

interface Sensor {
  type:     string;
  model:    string;
  location: string;
  status:   "ONLINE" | "OFFLINE";
  icon:     string;
}

const SENSORS: Sensor[] = [
  { type: "Thermostat",    model: "Ecobee SmartThermostat Premium", location: "Living Room",      status: "ONLINE",  icon: "🌡️" },
  { type: "Leak Detector", model: "Moen Flo Smart Water Monitor",   location: "Main Supply Line", status: "ONLINE",  icon: "💧" },
  { type: "Energy Monitor",model: "Sense Energy Monitor",           location: "Main Panel",       status: "ONLINE",  icon: "⚡" },
  { type: "Security",      model: "Ring Alarm Pro",                  location: "Whole Home",       status: "ONLINE",  icon: "🔒" },
];

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  VERIFIED: { label: "VERIFIED",         bg: "#E6FAE6", color: "#1A7A3A" },
  PENDING:  { label: "PENDING SIG",      bg: "#FFFBEB", color: "#92400E" },
  DIY:      { label: "DIY — OWNER CERT", bg: LBLUE,     color: BLUE      },
};

// ── Icons ──────────────────────────────────────────────────────────────────────
function CheckIcon({ color = BLUE }: { color?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}

function SigIcon({ color = BLUE }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17c3-3 5-8 8-8s2 4 4 4 3-2 5-2" /><path d="M21 17H3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PersonIcon({ color = BLUE }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ── Job card ───────────────────────────────────────────────────────────────────
function JobCard({ job }: { job: Job }) {
  const sc   = STATUS_CONFIG[job.status];
  const catC = CATEGORY_COLORS[job.category] ?? MUTED;

  return (
    <div style={{ background: PAPER, border: `1px solid ${job.status === "PENDING" ? "#FDE68A" : BORDER}`, borderRadius: 20, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: INK }}>{job.title}</span>
            <span style={{ fontFamily: MONO, fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", color: sc.color, background: sc.bg, borderRadius: 100, padding: "4px 9px", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {job.status === "VERIFIED" && <CheckIcon color={sc.color} />}
              {job.status === "PENDING"  && <ClockIcon />}
              {job.status === "DIY"      && <PersonIcon color={sc.color} />}
              {sc.label}
            </span>
            <span style={{ fontFamily: MONO, fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", color: catC, background: LBLUE, borderRadius: 100, padding: "4px 9px", textTransform: "uppercase" }}>
              {job.category}
            </span>
          </div>
          <p style={{ fontSize: "0.8125rem", color: MUTED, marginTop: 6, lineHeight: 1.55 }}>{job.note}</p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "1.0625rem", color: INK, letterSpacing: "-0.02em" }}>{job.cost}</div>
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: MUTED, marginTop: 2 }}>{job.date}</div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {job.status === "DIY" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: VBADGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <PersonIcon color={BLUE} />
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: INK }}>DIY — Owner performed</div>
                <div style={{ fontFamily: MONO, fontSize: "0.58rem", color: MUTED }}>No contractor</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SigIcon color={BLUE} />
              <span style={{ fontSize: "0.75rem", color: MUTED }}>Owner self-certified · {job.sigDate}</span>
            </div>
          </>
        ) : job.status === "PENDING" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <PersonIcon color="#92400E" />
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: INK }}>{job.contractor}</div>
                <div style={{ fontFamily: MONO, fontSize: "0.58rem", color: MUTED }}>Contractor</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SigIcon color="#1A7A3A" />
              <span style={{ fontSize: "0.75rem", color: "#1A7A3A", fontWeight: 500 }}>Owner signed · {job.date}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ClockIcon />
              <span style={{ fontSize: "0.75rem", color: "#92400E", fontWeight: 500 }}>Awaiting contractor signature</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: VBADGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <PersonIcon color={BLUE} />
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: INK }}>{job.contractor}</div>
                <div style={{ fontFamily: MONO, fontSize: "0.58rem", color: MUTED }}>Contractor</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SigIcon />
              <span style={{ fontSize: "0.75rem", color: MUTED }}>Both parties signed · {job.sigDate}</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
              <LockIcon />
              <span style={{ fontFamily: MONO, fontSize: "0.58rem", color: MUTED }}>On-chain</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Room card ──────────────────────────────────────────────────────────────────
function RoomCard({ room }: { room: Room }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: LBLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
          {room.icon}
        </div>
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.02em", color: INK }}>{room.name}</div>
          <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: MUTED }}>{room.sqft} SQ FT</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {room.fixtures.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: BLUE, flexShrink: 0, marginTop: 7 }} />
            <span style={{ fontSize: "0.8125rem", color: INK, lineHeight: 1.5 }}>{f}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={CORAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: MUTED }}>Last logged work: {room.lastWork}</span>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SampleReportPage() {
  const navigate = useNavigate();
  const verifiedJobs  = JOBS.filter((j) => j.status === "VERIFIED");
  const totalValue    = verifiedJobs.reduce((s, j) => s + Number(j.cost.replace(/[$,]/g, "")), 0);

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: BODY, color: INK }}>
      <Helmet>
        <title>Sample Property Report — HomeGentic</title>
        <meta name="description" content="See what a HomeGentic verified property report looks like — score, job history, contractor signatures, and a shareable link." />
      </Helmet>

      {/* ── Nav ── */}
      <div style={{ background: BLUE, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, boxSizing: "border-box" }}>
          <button type="button" onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "1.125rem", color: PAPER, letterSpacing: "-0.03em" }}>
              Home<span style={{ color: YELLOW }}>Gentic</span>
            </span>
          </button>
          <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: "rgba(252,252,253,0.55)", textTransform: "uppercase" }}>
            Sample Report
          </div>
          <button type="button" onClick={() => navigate("/login")} style={{ padding: "9px 20px", borderRadius: 100, background: YELLOW, border: "none", fontFamily: BODY, fontWeight: 700, fontSize: "0.8125rem", color: INK, cursor: "pointer" }}>
            Create yours
          </button>
        </div>
      </div>

      {/* ── Sample banner ── */}
      <div style={{ background: YELLOW, padding: "10px 32px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: "0.63rem", fontWeight: 700, letterSpacing: "0.14em", color: INK, textTransform: "uppercase" }}>
          This is a sample — no real property data
        </span>
        <span style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "rgba(11,13,26,0.65)" }}>·</span>
        <button type="button" onClick={() => navigate("/login")} style={{ fontFamily: BODY, fontSize: "0.8125rem", fontWeight: 600, color: INK, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
          Start your own record →
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 80px", boxSizing: "border-box" }}>

        {/* ── Property header ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "flex-start", marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: MUTED, textTransform: "uppercase", marginBottom: 8 }}>
              Property Record · {PROPERTY.token}
            </div>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "2.25rem", letterSpacing: "-0.04em", color: INK, margin: 0, lineHeight: 1.1 }}>
              {PROPERTY.address}
            </h1>
            <div style={{ fontFamily: BODY, fontSize: "1rem", color: MUTED, marginTop: 6 }}>
              {PROPERTY.city} · Owner since {PROPERTY.since}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: VBADGE, borderRadius: 100, padding: "6px 12px" }}>
                <CheckIcon color={BLUE} />
                <span style={{ fontFamily: MONO, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: BLUE, textTransform: "uppercase" }}>Verified Property</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F0FFF4", borderRadius: 100, padding: "6px 12px" }}>
                <SigIcon color="#1A7A3A" />
                <span style={{ fontFamily: MONO, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: "#1A7A3A", textTransform: "uppercase" }}>{verifiedJobs.length} Verified Jobs</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: LBLUE, borderRadius: 100, padding: "6px 12px" }}>
                <LockIcon />
                <span style={{ fontFamily: MONO, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: BLUE, textTransform: "uppercase" }}>Tamper-Proof Record</span>
              </div>
            </div>
          </div>

          {/* Score circle */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", background: BLUE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "2.5rem", color: PAPER, letterSpacing: "-0.04em", lineHeight: 1 }}>{PROPERTY.score}</div>
              <div style={{ fontFamily: MONO, fontSize: "0.6rem", fontWeight: 700, color: YELLOW, letterSpacing: "0.1em", marginTop: 3 }}>GRADE {PROPERTY.grade}</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: MUTED, letterSpacing: "0.1em", marginTop: 8, textTransform: "uppercase" }}>HomeGentic Score</div>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "flex-start" }}>

          {/* ── Left: Job history + Rooms ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

            {/* Job history */}
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: CORAL, textTransform: "uppercase", marginBottom: 6 }}>Work History</div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "1.375rem", letterSpacing: "-0.03em", color: INK }}>
                  {JOBS.length} records · ${totalValue.toLocaleString()} in verified work
                </div>
                {/* Legend */}
                <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                  {(["VERIFIED", "PENDING", "DIY"] as JobStatus[]).map((s) => {
                    const c = STATUS_CONFIG[s];
                    return (
                      <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                        <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: MUTED, textTransform: "uppercase" }}>{c.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {JOBS.map((job) => <JobCard key={job.title} job={job} />)}
              </div>
            </div>

            {/* Rooms */}
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: CORAL, textTransform: "uppercase", marginBottom: 6 }}>Rooms & Fixtures</div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "1.375rem", letterSpacing: "-0.03em", color: INK }}>
                  {ROOMS.length} rooms documented
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {ROOMS.map((room) => <RoomCard key={room.name} room={room} />)}
              </div>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Score breakdown */}
            <div style={{ background: INK, borderRadius: 24, padding: 26 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: YELLOW, textTransform: "uppercase", marginBottom: 4 }}>Score Breakdown</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "3rem", color: PAPER, letterSpacing: "-0.05em", lineHeight: 1 }}>{PROPERTY.score}</div>
              <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: "rgba(252,252,253,0.45)", marginBottom: 22 }}>out of 100</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {SCORE_FACTORS.map((f) => (
                  <div key={f.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.8125rem", color: PAPER, fontWeight: 500 }}>{f.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: "rgba(252,252,253,0.5)" }}>{f.pts}/{f.max} pts</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 100, background: "rgba(252,252,253,0.1)" }}>
                      <div style={{ height: 5, width: f.pct, borderRadius: 100, background: f.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: "0.75rem", color: "rgba(252,252,253,0.45)", lineHeight: 1.6 }}>
                Pending jobs and DIY records don't add points until both signatures are on file.
              </div>
            </div>

            {/* Share link demo */}
            <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 24, padding: 26 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: CORAL, textTransform: "uppercase", marginBottom: 14 }}>Share This Report</div>
              <div style={{ background: LBLUE, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <LockIcon />
                <span style={{ fontFamily: MONO, fontSize: "0.62rem", color: BLUE, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  homegentic.app/report/hg-2025-08291
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: MUTED, lineHeight: 1.6, marginBottom: 16 }}>
                Buyers, agents, and insurers see only verified jobs. Nothing editable. Link expires when you revoke it.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["Buyer view", "Insurance view", "Full record"].map((v) => (
                  <div key={v} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: VBADGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <CheckIcon color={BLUE} />
                    </div>
                    <span style={{ fontSize: "0.8125rem", color: INK }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Maintenance */}
            <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 24, padding: 26 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: CORAL, textTransform: "uppercase", marginBottom: 14 }}>Upcoming Maintenance</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { title: "HVAC filter",     due: "Due Sep 2",  tone: "#F59E0B", bg: "#FFFBEB" },
                  { title: "Chimney inspect", due: "Due Oct 1",  tone: BLUE,      bg: LBLUE     },
                  { title: "Gutter cleaning", due: "Due Oct 15", tone: BLUE,      bg: LBLUE     },
                ].map((item) => (
                  <div key={item.title} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 4, borderRadius: 100, alignSelf: "stretch", background: item.tone, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: INK }}>{item.title}</div>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "0.6rem", background: item.bg, color: item.tone === BLUE ? BLUE : "#92400E", borderRadius: 100, padding: "4px 9px", flexShrink: 0 }}>{item.due}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recurring services */}
            <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 24, padding: 26 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: CORAL, textTransform: "uppercase", marginBottom: 14 }}>Recurring Services</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {RECURRING.map((r) => (
                  <div key={r.name} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: INK }}>{r.name}</div>
                      <div style={{ fontSize: "0.75rem", color: MUTED, marginTop: 2 }}>{r.provider} · {r.frequency} · {r.costPerVisit}</div>
                      <div style={{ fontFamily: MONO, fontSize: "0.58rem", color: MUTED, marginTop: 3 }}>Last: {r.lastVisit}</div>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ fontFamily: MONO, fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.1em", color: r.status === "DUE" ? "#92400E" : "#1A7A3A", background: r.status === "DUE" ? "#FFFBEB" : "#E6FAE6", borderRadius: 100, padding: "3px 8px" }}>
                        {r.status === "DUE" ? "DUE" : "ACTIVE"}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: MUTED }}>Next: {r.nextVisit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connected sensors */}
            <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 24, padding: 26 }}>
              <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.14em", color: CORAL, textTransform: "uppercase", marginBottom: 4 }}>Connected Sensors</div>
              <div style={{ fontSize: "0.75rem", color: MUTED, marginBottom: 14 }}>{SENSORS.filter(s => s.status === "ONLINE").length}/{SENSORS.length} online</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {SENSORS.map((s) => (
                  <div key={s.model} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: LBLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>
                      {s.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.model}</div>
                      <div style={{ fontFamily: MONO, fontSize: "0.58rem", color: MUTED }}>{s.type} · {s.location}</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.status === "ONLINE" ? "#22C55E" : MUTED, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{ marginTop: 56, background: BLUE, borderRadius: 28, padding: "48px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "1.75rem", color: PAPER, letterSpacing: "-0.04em", lineHeight: 1.15 }}>
              Build yours — from $10 a month.
            </div>
            <p style={{ fontFamily: BODY, fontSize: "0.9375rem", color: "rgba(252,252,253,0.76)", marginTop: 10, maxWidth: 480 }}>
              Every plan comes with permanent storage and shareable reports. Start with the last repair you paid for.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/login")} style={{ padding: "15px 30px", borderRadius: 100, background: YELLOW, border: "none", fontFamily: BODY, fontWeight: 700, fontSize: "0.9375rem", color: INK, cursor: "pointer" }}>
              Get started
            </button>
            <button type="button" onClick={() => navigate("/pricing")} style={{ padding: "15px 30px", borderRadius: 100, background: "rgba(252,252,253,0.12)", border: "1.5px solid rgba(252,252,253,0.3)", fontFamily: BODY, fontWeight: 600, fontSize: "0.9375rem", color: PAPER, cursor: "pointer" }}>
              See pricing
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
