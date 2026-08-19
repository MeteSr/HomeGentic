import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ShieldCheck, AlertTriangle, ChevronRight, ChevronLeft,
  Printer, Share2, ArrowRight, Check, ExternalLink, Info,
  Home, Zap, Flame, Droplets, Wind, Square, Layers,
} from "lucide-react";

/* ─── Types (mirrors server types) ────────────────────────────────────────── */
type SystemStatus = "replaced" | "original" | "unknown";

interface SystemClaim {
  status: SystemStatus;
  year?: number;
  brand?: string;
  material?: string;
  extraNotes?: string;
}

interface Claims {
  roof:          SystemClaim;
  hvacPrimary:   SystemClaim;
  hvacSecondary: SystemClaim & { present: boolean | "unknown" };
  waterHeater:   SystemClaim & { kind?: "tank" | "tankless" | "unknown" };
  electrical:    SystemClaim;
  plumbing:      SystemClaim;
  windows:       SystemClaim;
  foundation:    SystemClaim;
}

interface KitSystem {
  name:              string;
  claimed:           string;
  credibilityScore:  number;
  credibilityLabel:  "Verified" | "Plausible" | "Questionable" | "High Risk" | "Unknown";
  finding:           string;
  estimatedAge:      string;
  remainingLifespan: string;
  replacementCost:   string;
  financialRisk:     "low" | "medium" | "high";
  questions:         string[];
  documents:         string[];
  inspectorChecks:   string[];
  permitNote:        string;
}

interface RedFlag {
  severity:    "critical" | "major" | "minor";
  title:       string;
  description: string;
  action:      string;
}

interface EraRisk { item: string; description: string; likelihood: "common" | "possible" | "rare" }

interface KitAnalysis {
  overallRisk:      "low" | "medium" | "high";
  overallSummary:   string;
  systems:          KitSystem[];
  redFlags:         RedFlag[];
  eraRisks:         EraRisk[];
  generalQuestions: string[];
  generalDocuments: string[];
}

interface PermitResult {
  searched: boolean; found: boolean; count: number;
  records: { description: string; date?: string; status?: string }[];
  portalUrl: string; portalName: string; instructions: string; note: string;
}

interface KitResponse {
  property: { address: string; yearBuilt: number; geocoded: boolean; city?: string; state?: string };
  permits:  PermitResult;
  kit:      KitAnalysis;
}

/* ─── Defaults ───────────────────────────────────────────────────────────── */
const DEFAULT_CLAIM: SystemClaim = { status: "unknown" };
const DEFAULT_CLAIMS: Claims = {
  roof:          { ...DEFAULT_CLAIM },
  hvacPrimary:   { ...DEFAULT_CLAIM },
  hvacSecondary: { ...DEFAULT_CLAIM, present: "unknown" },
  waterHeater:   { ...DEFAULT_CLAIM, kind: "unknown" },
  electrical:    { ...DEFAULT_CLAIM },
  plumbing:      { ...DEFAULT_CLAIM },
  windows:       { ...DEFAULT_CLAIM },
  foundation:    { ...DEFAULT_CLAIM },
};

/* ─── Design Tokens ──────────────────────────────────────────────────────── */
const C = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#6B7080",
  border: "#EDEEF2",
  white:  "#FFFFFF",
  blueFg: "#F3F4FF",
};
const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const SYSTEM_ICONS: Record<string, React.ReactNode> = {
  "Roof":              <Layers size={15} />,
  "HVAC (Primary)":    <Wind size={15} />,
  "HVAC (Secondary)":  <Wind size={15} />,
  "Water Heater":      <Flame size={15} />,
  "Electrical Panel":  <Zap size={15} />,
  "Plumbing":          <Droplets size={15} />,
  "Windows":           <Square size={15} />,
  "Foundation":        <Home size={15} />,
};

const INPUT_SYSTEM_ICONS: Record<string, React.ReactNode> = {
  roof:          <Layers size={16} />,
  hvacPrimary:   <Wind size={16} />,
  hvacSecondary: <Wind size={16} />,
  waterHeater:   <Flame size={16} />,
  electrical:    <Zap size={16} />,
  plumbing:      <Droplets size={16} />,
  windows:       <Square size={16} />,
  foundation:    <Home size={16} />,
};

const SYSTEM_LABELS: Record<string, string> = {
  roof: "Roof", hvacPrimary: "HVAC (Primary)", hvacSecondary: "HVAC (Secondary / Upstairs)",
  waterHeater: "Water Heater", electrical: "Electrical Panel",
  plumbing: "Plumbing", windows: "Windows", foundation: "Foundation",
};

function scoreColor(score: number) {
  if (score >= 75) return C.blue;
  if (score >= 50) return "#FFB340";
  return C.coral;
}

function credLabelColor(label: string): { color: string; background: string } {
  switch (label) {
    case "Verified":     return { color: C.blue,    background: C.blueFg };
    case "Plausible":    return { color: C.muted,   background: C.border };
    case "Questionable": return { color: "#FFB340", background: "#FFF8E6" };
    case "High Risk":    return { color: C.coral,   background: "#FFECEA" };
    default:             return { color: C.muted,   background: C.border };
  }
}

function encodeState(address: string, yearBuilt: number, claims: Claims): string {
  return btoa(JSON.stringify({ address, yearBuilt, claims }));
}

function decodeState(s: string): { address: string; yearBuilt: number; claims: Claims } | null {
  try { return JSON.parse(atob(s)); } catch { return null; }
}

const VOICE_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

async function fetchKit(address: string, yearBuilt: number, claims: Claims): Promise<KitResponse> {
  const res = await fetch(`${VOICE_URL}/api/buyers-truth-kit`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ address, yearBuilt, claims }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Analysis failed");
  }
  return res.json();
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function Progress({ step }: { step: number }) {
  const steps = ["Home Details", "Seller Claims", "Your Kit"];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:40 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div
            title={s}
            style={{
              width:10, height:10, borderRadius:"50%", flexShrink:0, transition:"all .2s",
              ...(i < step  ? { background: C.blue }
                : i === step ? { background: C.ink, transform:"scale(1.3)" }
                : { background: C.border }),
            }}
          />
          {i < steps.length - 1 && <div style={{ flex:1, height:1, background:C.border }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function StatusButtons({ value, onChange }: { value: SystemStatus; onChange: (v: SystemStatus) => void }) {
  const configs: Record<SystemStatus, { label:string; activeStyle: React.CSSProperties }> = {
    replaced: { label:"Was Replaced",      activeStyle: { background:C.blue, color:C.white, borderColor:C.blue } },
    original: { label:"Original to Home",  activeStyle: { background:"#FFB340", color:C.white, borderColor:"#FFB340" } },
    unknown:  { label:"Don't Know",        activeStyle: { background:C.ink, color:C.white, borderColor:C.ink } },
  };
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {(["replaced", "original", "unknown"] as SystemStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          style={{
            padding:"7px 16px", borderRadius:100, fontSize:13, fontWeight:600,
            cursor:"pointer", border:`1.5px solid ${C.border}`, background:C.white,
            fontFamily:F.body, color:C.muted, transition:"all .15s",
            ...(value === s ? configs[s].activeStyle : {}),
          }}
        >
          {configs[s].label}
        </button>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width:"100%", padding:"9px 12px", border:`1.5px solid ${C.border}`,
  borderRadius:8, fontSize:13, fontFamily:F.body, color:C.ink,
  background:C.white, outline:"none",
};

const selectStyle: React.CSSProperties = {
  width:"100%", padding:"8px 12px", border:`1.5px solid ${C.border}`,
  borderRadius:8, fontSize:13, fontFamily:F.body, color:C.ink,
  background:C.white, cursor:"pointer", outline:"none",
};

const inlineLabelStyle: React.CSSProperties = {
  fontSize:12, fontWeight:600, color:C.muted, marginBottom:5,
};

function SystemCard({
  id, claim, onChange,
}: {
  id: keyof Claims;
  claim: SystemClaim & { present?: boolean | "unknown"; kind?: string };
  onChange: (id: keyof Claims, updated: Partial<SystemClaim & { present?: boolean | "unknown"; kind?: string }>) => void;
}) {
  const [open, setOpen] = useState(true);

  const statusColors: Record<SystemStatus, { bg:string; color:string }> = {
    replaced: { bg:C.blueFg, color:C.blue },
    original: { bg:"#FFF8E6", color:"#FFB340" },
    unknown:  { bg:C.border, color:C.muted },
  };
  const sc = statusColors[claim.status];

  return (
    <div style={{ border:`1.5px solid ${C.border}`, borderRadius:14, overflow:"hidden", transition:"border-color .15s" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:"rgba(11,13,26,0.02)", borderBottom:open ? `1px solid ${C.border}` : "none", cursor:"pointer" }}
      >
        <div style={{ width:34, height:34, background:C.blueFg, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:C.blue, flexShrink:0 }}>
          {INPUT_SYSTEM_ICONS[id]}
        </div>
        <div style={{ fontSize:14, fontWeight:700, color:C.ink, flex:1 }}>{SYSTEM_LABELS[id]}</div>
        <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:100, background:sc.bg, color:sc.color }}>
          {claim.status === "replaced" ? "Replaced" : claim.status === "original" ? "Original" : "Unknown"}
        </span>
        <ChevronRight size={15} style={{ color:C.muted, transform:open ? "rotate(90deg)" : "none", transition:"transform .2s", flexShrink:0 }} />
      </div>

      {open && (
        <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
          <StatusButtons value={claim.status} onChange={(v) => onChange(id, { status:v, year:undefined })} />

          {claim.status === "replaced" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <div style={inlineLabelStyle}>Year replaced</div>
                <input
                  style={inputStyle} type="number" placeholder="e.g. 2019"
                  value={claim.year ?? ""} min={1950} max={new Date().getFullYear()}
                  onChange={(e) => onChange(id, { year: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <div style={inlineLabelStyle}>Brand / contractor (optional)</div>
                <input
                  style={inputStyle} placeholder="e.g. Carrier, Owens Corning"
                  value={claim.brand ?? ""}
                  onChange={(e) => onChange(id, { brand: e.target.value || undefined })}
                />
              </div>
            </div>
          )}

          {/* Secondary HVAC presence toggle */}
          {id === "hvacSecondary" && (
            <div>
              <div style={inlineLabelStyle}>Is there a second HVAC unit (e.g. for upstairs)?</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {([true, false, "unknown"] as const).map((v) => (
                  <button key={String(v)} type="button"
                    onClick={() => onChange(id, { present: v })}
                    style={{
                      padding:"7px 16px", borderRadius:100, fontSize:13, fontWeight:600,
                      cursor:"pointer", border:`1.5px solid ${C.border}`, fontFamily:F.body,
                      transition:"all .15s",
                      ...(claim.present === v
                        ? { background:C.blue, color:C.white, borderColor:C.blue }
                        : { background:C.white, color:C.muted }),
                    }}
                  >
                    {v === true ? "Yes" : v === false ? "No" : "Not Sure"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Water heater type */}
          {id === "waterHeater" && (
            <div>
              <div style={inlineLabelStyle}>Type</div>
              <select style={selectStyle} value={claim.kind ?? "unknown"}
                onChange={(e) => onChange(id, { kind: e.target.value as any })}>
                <option value="unknown">Unknown</option>
                <option value="tank">Tank (traditional)</option>
                <option value="tankless">Tankless / on-demand</option>
              </select>
            </div>
          )}

          {/* Electrical: brand hint */}
          {id === "electrical" && (
            <div>
              <div style={inlineLabelStyle}>Panel brand (if visible on label)</div>
              <input style={inputStyle} placeholder="e.g. Square D, Federal Pacific, Zinsco"
                value={claim.brand ?? ""}
                onChange={(e) => onChange(id, { brand: e.target.value || undefined })}
              />
              {(claim.brand?.toLowerCase().includes("federal") || claim.brand?.toLowerCase().includes("zinsco")) && (
                <div style={{ marginTop:6, fontSize:12, color:C.coral, fontWeight:600 }}>
                  ⚠️ This panel brand has known safety risks — flag for inspector.
                </div>
              )}
            </div>
          )}

          {/* Plumbing: material */}
          {id === "plumbing" && (
            <div>
              <div style={inlineLabelStyle}>Pipe material (if known)</div>
              <select style={selectStyle} value={claim.material ?? "unknown"}
                onChange={(e) => onChange(id, { material: e.target.value || undefined })}>
                <option value="unknown">Unknown</option>
                <option value="copper">Copper</option>
                <option value="pex">PEX (flexible plastic)</option>
                <option value="pvc">PVC</option>
                <option value="galvanized">Galvanized Steel</option>
                <option value="polybutylene">Polybutylene (Quest / gray plastic)</option>
                <option value="cast iron">Cast Iron</option>
              </select>
              {claim.material === "polybutylene" && (
                <div style={{ marginTop:6, fontSize:12, color:C.coral, fontWeight:600 }}>
                  ⚠️ Polybutylene was subject to a class-action settlement — high failure risk.
                </div>
              )}
              {claim.material === "galvanized" && (
                <div style={{ marginTop:6, fontSize:12, color:"#FFB340", fontWeight:600 }}>
                  ⚠️ Galvanized steel corrodes from the inside — check water pressure and color.
                </div>
              )}
            </div>
          )}

          {/* Roof material */}
          {id === "roof" && (
            <div>
              <div style={inlineLabelStyle}>Material (if known)</div>
              <select style={selectStyle} value={claim.material ?? "unknown"}
                onChange={(e) => onChange(id, { material: e.target.value || undefined })}>
                <option value="unknown">Unknown</option>
                <option value="asphalt">Asphalt shingle</option>
                <option value="metal">Metal</option>
                <option value="tile">Tile / clay</option>
                <option value="flat">Flat / TPO / EPDM</option>
              </select>
            </div>
          )}

          <div>
            <div style={inlineLabelStyle}>Notes (anything else seller mentioned)</div>
            <input style={inputStyle} placeholder="e.g. 'replaced after hail storm', 'never had issues'"
              value={claim.extraNotes ?? ""}
              onChange={(e) => onChange(id, { extraNotes: e.target.value || undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CredibilityBar({ score, label }: { score: number; label: string }) {
  const lc = credLabelColor(label);
  return (
    <>
      <span style={{ fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:100, whiteSpace:"nowrap", ...lc }}>
        {label}
      </span>
      <div style={{ height:4, background:C.border, margin:"10px 16px 0", borderRadius:100, overflow:"hidden" }}>
        <div style={{ width:`${score}%`, height:"100%", borderRadius:100, background:scoreColor(score), transition:"width .6s ease" }} />
      </div>
    </>
  );
}

function SystemResultCard({ sys }: { sys: KitSystem }) {
  const [expanded, setExpanded] = useState(false);
  const icon = SYSTEM_ICONS[sys.name] ?? <Home size={15} />;

  const riskChip: Record<string, React.CSSProperties> = {
    high:   { background:"#FFECEA", color:C.coral },
    medium: { background:"#FFF8E6", color:"#FFB340" },
    low:    { background:C.blueFg,  color:C.blue },
  };

  return (
    <div style={{ border:`1.5px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
      <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ width:30, height:30, background:C.blueFg, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:C.blue, flexShrink:0 }}>
          {icon}
        </div>
        <div style={{ fontSize:13, fontWeight:700, color:C.ink, flex:1 }}>{sys.name}</div>
        <CredibilityBar score={sys.credibilityScore} label={sys.credibilityLabel} />
      </div>
      <div style={{ padding:"12px 16px 14px" }}>
        <p style={{ fontSize:12, color:C.muted, lineHeight:1.55, marginBottom:10 }}>{sys.finding}</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
          <span style={{ fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:100, background:C.border, color:C.ink }}>
            Age: {sys.estimatedAge}
          </span>
          <span style={{ fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:100, background:C.border, color:C.ink }}>
            Life left: {sys.remainingLifespan}
          </span>
          <span style={{ fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:100, ...riskChip[sys.financialRisk] }}>
            Replace: {sys.replacementCost}
          </span>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ width:"100%", textAlign:"left", background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.muted, fontFamily:F.body, fontWeight:600, display:"flex", alignItems:"center", gap:4, padding:0, marginTop:4, transition:"color .15s" }}
        >
          {expanded ? "▲ Hide" : "▼ Show"} questions, documents & inspector checks
        </button>
        {expanded && (
          <div style={{ marginTop:12, borderTop:`1px solid ${C.border}`, paddingTop:12, display:"flex", flexDirection:"column", gap:10 }}>
            {sys.questions.length > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"1.5px", color:C.muted, marginBottom:5 }}>Questions to ask seller</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {sys.questions.map((q, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12, color:C.muted, lineHeight:1.5 }}>
                      <div style={{ flexShrink:0, width:14, height:14, borderRadius:"50%", background:C.blueFg, color:C.blue, display:"flex", alignItems:"center", justifyContent:"center", marginTop:1, fontSize:8, fontWeight:700 }}>{i+1}</div>
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sys.documents.length > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"1.5px", color:C.muted, marginBottom:5 }}>Documents to request</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {sys.documents.map((d, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12, color:C.muted, lineHeight:1.5 }}>
                      <div style={{ flexShrink:0, width:14, height:14, borderRadius:"50%", background:C.blueFg, color:C.blue, display:"flex", alignItems:"center", justifyContent:"center", marginTop:1, fontSize:8, fontWeight:700 }}>✓</div>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sys.inspectorChecks.length > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"1.5px", color:C.muted, marginBottom:5 }}>Tell your inspector</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {sys.inspectorChecks.map((c, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12, color:C.muted, lineHeight:1.5 }}>
                      <div style={{ flexShrink:0, width:14, height:14, borderRadius:"50%", background:C.blueFg, color:C.blue, display:"flex", alignItems:"center", justifyContent:"center", marginTop:1, fontSize:8, fontWeight:700 }}>→</div>
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sys.permitNote && (
              <div style={{ fontSize:11, background:C.border, borderRadius:7, padding:"8px 10px", color:C.muted, marginTop:6 }}>
                {sys.permitNote}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function BuyersTruthKitPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [screen, setScreen]     = useState<"landing" | 0 | 1 | "loading" | "results">("landing");
  const [address, setAddress]   = useState("");
  const [yearBuilt, setYearBuilt] = useState<number | "">("");
  const [claims, setClaims]     = useState<Claims>(DEFAULT_CLAIMS);
  const [loadStep, setLoadStep] = useState(0);
  const [kit, setKit]           = useState<KitResponse | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Decode shared URL
  useEffect(() => {
    const encoded = searchParams.get("d");
    if (encoded) {
      const decoded = decodeState(encoded);
      if (decoded) {
        setAddress(decoded.address);
        setYearBuilt(decoded.yearBuilt);
        setClaims(decoded.claims);
        runAnalysis(decoded.address, decoded.yearBuilt, decoded.claims);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateClaim(id: keyof Claims, patch: Partial<SystemClaim & { present?: boolean | "unknown"; kind?: string }>) {
    setClaims((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function runAnalysis(addr: string, yr: number, cl: Claims) {
    setScreen("loading");
    setLoadStep(0);
    setError(null);

    const steps = [
      { label: "Locating property...",       delay: 800  },
      { label: "Querying permit records...", delay: 2200 },
      { label: "Analyzing seller claims...", delay: 3800 },
      { label: "Generating your kit...",     delay: 5200 },
    ];
    steps.forEach(({ delay }, i) => setTimeout(() => setLoadStep(i + 1), delay));

    try {
      const result = await fetchKit(addr, yr, cl);
      setKit(result);
      setScreen("results");
      const encoded = encodeState(addr, yr, cl);
      setSearchParams({ d: encoded }, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
      setScreen(1);
    }
  }

  function handleGenerate() {
    if (!address.trim() || !yearBuilt) return;
    runAnalysis(address.trim(), Number(yearBuilt), claims);
  }

  function handleShare() {
    if (!address || !yearBuilt) return;
    const encoded = encodeState(address, Number(yearBuilt), claims);
    const url = `${window.location.origin}/truth-kit?d=${encoded}`;
    navigator.clipboard.writeText(url).then(() => alert("Link copied to clipboard!"));
  }

  function handlePrint() { window.print(); }

  const canProceedStep0 = address.trim().length > 5 && yearBuilt && Number(yearBuilt) > 1800;

  const LOAD_STEPS = [
    "Locating property...",
    "Querying permit records...",
    "Analyzing seller claims...",
    "Generating your kit...",
  ];

  /* ── Shared element styles ── */
  const navStyle: React.CSSProperties = {
    position:"fixed", top:0, left:0, right:0, zIndex:100,
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"0 56px", height:70,
    background:"rgba(252,252,253,0.96)", backdropFilter:"blur(16px)",
    borderBottom:`1px solid ${C.border}`,
  };

  const btnBack: React.CSSProperties = {
    display:"flex", alignItems:"center", gap:6, padding:"11px 22px",
    borderRadius:100, fontSize:14, fontWeight:600,
    background:C.white, border:`2px solid ${C.border}`, color:C.muted,
    cursor:"pointer", fontFamily:F.body, transition:"all .15s",
  };

  const btnNext: React.CSSProperties = {
    display:"flex", alignItems:"center", gap:6, padding:"12px 28px",
    borderRadius:100, fontSize:14, fontWeight:700,
    background:C.blue, color:C.white, border:"none",
    cursor:"pointer", fontFamily:F.body, transition:"transform .2s, box-shadow .2s",
    boxShadow:"0 4px 18px rgba(43,52,255,0.28)",
  };

  const formInputStyle: React.CSSProperties = {
    width:"100%", padding:"12px 16px", border:`1.5px solid ${C.border}`,
    borderRadius:10, fontSize:15, fontFamily:F.body, color:C.ink,
    background:C.white, outline:"none",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily:F.display, fontSize:22, fontWeight:800, color:C.ink,
    letterSpacing:"-0.5px", marginBottom:16, paddingBottom:12,
    borderBottom:`2px solid ${C.border}`,
    display:"flex", alignItems:"center", gap:10,
  };

  const overallRiskStyles: Record<string, React.CSSProperties> = {
    low:    { background:C.blueFg,  color:C.blue },
    medium: { background:"#FFF8E6", color:"#FFB340" },
    high:   { background:"#FFECEA", color:C.coral },
  };

  const flagStyles: Record<string, React.CSSProperties> = {
    critical: { background:"#FFECEA", border:`1px solid rgba(255,92,57,0.25)` },
    major:    { background:"#FFF8E6", border:`1px solid rgba(255,179,64,0.25)` },
    minor:    { background:`rgba(11,13,26,0.04)`, border:`1px solid ${C.border}` },
  };

  const flagIconColor: Record<string, string> = {
    critical: C.coral,
    major:    "#FFB340",
    minor:    C.muted,
  };

  return (
    <div style={{ background:C.paper, color:C.ink, fontFamily:F.body, minHeight:"100vh" }}>
      <Helmet>
        <title>Buyer's Truth Kit — Know What You're Actually Buying</title>
        <meta name="description" content="Enter any home address and seller claims. Get a personalized due-diligence kit: permit records, red flags, questions to ask, and documents to request." />
      </Helmet>

      {/* Print styles */}
      <style>{`
        @media print {
          .btk-nav-bar, .btk-hero-sect, .btk-results-actions-row, .btk-cta-sect { display: none !important; }
          .btk-results-area { padding: 20px !important; }
          .btk-sys-grid { grid-template-columns: 1fr 1fr !important; }
          body { background: white !important; }
        }
        @media (max-width: 740px) {
          .btk-nav-bar { padding: 0 20px !important; }
          .btk-hero-sect { padding: 90px 20px 48px !important; }
          .btk-two-col { grid-template-columns: 1fr !important; }
          .btk-step-wrap-inner { padding: 70px 16px 48px !important; }
          .btk-sys-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes btk-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Nav */}
      <nav style={navStyle} className="btk-nav-bar">
        <Link to="/" style={{ fontFamily:F.display, fontSize:22, fontWeight:800, color:C.ink, textDecoration:"none", letterSpacing:"-0.5px" }}>
          Home<span style={{ color:C.yellow }}>Gentic</span>
        </Link>
        <Link to="/" style={{ display:"flex", alignItems:"center", gap:6, fontSize:14, fontWeight:500, color:C.muted, textDecoration:"none", padding:"8px 14px", borderRadius:8 }}>
          <ChevronLeft size={15} /> Back to Home
        </Link>
        <Link to="/login" style={{ background:C.blue, color:C.white, padding:"10px 22px", borderRadius:100, fontSize:14, fontWeight:600, border:"none", cursor:"pointer", fontFamily:F.body, textDecoration:"none", display:"flex", alignItems:"center", gap:6, boxShadow:"0 4px 18px rgba(43,52,255,0.28)" }}>
          Get Started <ArrowRight size={14} />
        </Link>
      </nav>

      {/* ── Landing ─────────────────────────────────────────────────────── */}
      {screen === "landing" && (
        <section className="btk-hero-sect" style={{ padding:"110px 56px 64px", maxWidth:800, margin:"0 auto", textAlign:"center" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:C.blueFg, color:C.blue, padding:"6px 16px", borderRadius:100, fontSize:13, fontWeight:600, marginBottom:24, border:`1px solid rgba(43,52,255,0.15)`, fontFamily:F.mono }}>
            🔍 Free Tool — No Account Required
          </div>
          <h1 style={{ fontFamily:F.display, fontSize:"clamp(38px,5vw,62px)", fontWeight:800, lineHeight:1.05, letterSpacing:"-2px", marginBottom:18, color:C.ink }}>
            Know what you're<br /><em style={{ fontStyle:"italic", color:C.blue }}>actually buying.</em>
          </h1>
          <p style={{ fontSize:17, lineHeight:1.75, color:C.muted, marginBottom:36 }}>
            Enter the address and what the seller is claiming about each major system.
            We'll check permit records, flag credibility gaps, and give you the exact
            questions to ask before you sign anything.
          </p>
          <div style={{ display:"flex", justifyContent:"center", gap:24, flexWrap:"wrap", marginBottom:40 }}>
            {[
              "Permit records checked",
              "Credibility score per system",
              "Red flags ranked by cost",
              "Questions & documents to request",
              "Inspector checklist included",
            ].map((b) => (
              <div key={b} style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, color:C.muted, fontWeight:500 }}>
                <div style={{ width:18, height:18, background:C.blueFg, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:C.blue, flexShrink:0 }}>
                  <Check size={10} />
                </div>
                {b}
              </div>
            ))}
          </div>
          <button
            onClick={() => setScreen(0)}
            style={{ display:"inline-flex", alignItems:"center", gap:8, background:C.blue, color:C.white, padding:"16px 36px", borderRadius:100, fontSize:16, fontWeight:700, border:"none", cursor:"pointer", fontFamily:F.body, boxShadow:"0 4px 18px rgba(43,52,255,0.28)" }}
          >
            Build My Truth Kit <ChevronRight size={18} />
          </button>
        </section>
      )}

      {/* ── Step 0: Home Details ──────────────────────────────────────── */}
      {screen === 0 && (
        <div className="btk-step-wrap-inner" style={{ maxWidth:720, margin:"0 auto", padding:"80px 24px 60px" }}>
          <Progress step={0} />
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", color:C.blue, marginBottom:10, fontFamily:F.mono }}>
            Step 1 of 2
          </div>
          <h2 style={{ fontFamily:F.display, fontSize:"clamp(24px,3vw,36px)", fontWeight:800, letterSpacing:"-0.8px", color:C.ink, marginBottom:8, lineHeight:1.15 }}>
            Tell us about the home.
          </h2>
          <p style={{ fontSize:15, color:C.muted, marginBottom:32, lineHeight:1.65 }}>
            We use the address to query permit records and tailor the analysis to local building departments.
          </p>

          {error && (
            <div style={{ background:"#FFECEA", border:`1px solid rgba(255,92,57,0.25)`, borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:13, color:C.coral, fontWeight:600 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:600, color:C.ink, marginBottom:6 }}>
              Property address <span style={{ fontSize:11, fontWeight:400, color:C.muted, marginLeft:6 }}>required</span>
            </label>
            <input
              style={formInputStyle}
              placeholder="123 Main St, Plano, TX 75023"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="btk-two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:13, fontWeight:600, color:C.ink, marginBottom:6 }}>
                Year built <span style={{ fontSize:11, fontWeight:400, color:C.muted, marginLeft:6 }}>required</span>
              </label>
              <input
                style={formInputStyle} type="number" placeholder="e.g. 1987" min={1800} max={new Date().getFullYear()}
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value ? Number(e.target.value) : "")}
              />
            </div>
          </div>

          <div style={{ background:`rgba(43,52,255,0.04)`, borderRadius:10, padding:"13px 16px", fontSize:13, color:C.muted, marginTop:8 }}>
            <Info size={14} style={{ display:"inline", marginRight:6, verticalAlign:"middle" }} />
            Your address is used only to look up permit records. It is never stored or shared.
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:36 }}>
            <button style={btnBack} onClick={() => setScreen("landing")}>
              <ChevronLeft size={14} /> Back
            </button>
            <button
              style={{ ...btnNext, ...(!canProceedStep0 ? { opacity:0.45, cursor:"not-allowed", boxShadow:"none" } : {}) }}
              disabled={!canProceedStep0}
              onClick={() => setScreen(1)}
            >
              Next: Seller Claims <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Seller Claims ─────────────────────────────────────── */}
      {screen === 1 && (
        <div className="btk-step-wrap-inner" style={{ maxWidth:720, margin:"0 auto", padding:"80px 24px 60px" }}>
          <Progress step={1} />
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", color:C.blue, marginBottom:10, fontFamily:F.mono }}>
            Step 2 of 2
          </div>
          <h2 style={{ fontFamily:F.display, fontSize:"clamp(24px,3vw,36px)", fontWeight:800, letterSpacing:"-0.8px", color:C.ink, marginBottom:8, lineHeight:1.15 }}>
            What has the seller claimed?
          </h2>
          <p style={{ fontSize:15, color:C.muted, marginBottom:32, lineHeight:1.65 }}>
            Enter what you've been told about each system — or mark it as unknown. The more you fill in, the sharper the analysis.
          </p>

          {error && (
            <div style={{ background:"#FFECEA", border:`1px solid rgba(255,92,57,0.25)`, borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:13, color:C.coral, fontWeight:600 }}>
              {error}
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {(Object.keys(SYSTEM_LABELS) as (keyof Claims)[]).map((id) => (
              <SystemCard key={id} id={id} claim={claims[id] as any} onChange={updateClaim} />
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:36 }}>
            <button style={btnBack} onClick={() => setScreen(0)}>
              <ChevronLeft size={14} /> Back
            </button>
            <button style={btnNext} onClick={handleGenerate}>
              Generate My Truth Kit <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {screen === "loading" && (
        <div style={{ maxWidth:480, margin:"0 auto", padding:"100px 24px", textAlign:"center" }}>
          <div style={{ width:48, height:48, border:`3px solid ${C.border}`, borderTopColor:C.blue, borderRadius:"50%", animation:"btk-spin 0.8s linear infinite", margin:"0 auto 28px" }} />
          <h2 style={{ fontFamily:F.display, fontSize:28, fontWeight:800, color:C.ink, marginBottom:8 }}>
            Building your kit…
          </h2>
          <p style={{ fontSize:14, color:C.muted }}>This takes 15–30 seconds.</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:24, textAlign:"left", maxWidth:300, marginLeft:"auto", marginRight:"auto" }}>
            {LOAD_STEPS.map((s, i) => (
              <div
                key={s}
                style={{
                  display:"flex", alignItems:"center", gap:10, fontSize:13,
                  ...(i < loadStep  ? { color:C.blue }
                    : i === loadStep ? { color:C.ink, fontWeight:600 }
                    : { color:C.muted, opacity:0.5 }),
                }}
              >
                <span>{i < loadStep ? "✓" : i === loadStep ? "→" : "○"}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────── */}
      {screen === "results" && kit && (
        <div className="btk-results-area" ref={resultsRef} style={{ maxWidth:900, margin:"0 auto", padding:"80px 24px 80px" }}>

          {/* Header */}
          <div style={{ marginBottom:40 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontFamily:F.mono }}>
              {kit.property.address}
            </div>
            <h2 style={{ fontFamily:F.display, fontSize:"clamp(26px,3.5vw,40px)", fontWeight:800, color:C.ink, letterSpacing:"-1px", marginBottom:12, lineHeight:1.1 }}>
              Your Buyer's Truth Kit
            </h2>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 20px", borderRadius:100, fontSize:14, fontWeight:700, marginBottom:16, ...overallRiskStyles[kit.kit.overallRisk] }}>
              {kit.kit.overallRisk === "high"   && <AlertTriangle size={15} />}
              {kit.kit.overallRisk === "medium" && <AlertTriangle size={15} />}
              {kit.kit.overallRisk === "low"    && <ShieldCheck size={15} />}
              Overall Risk: {kit.kit.overallRisk.charAt(0).toUpperCase() + kit.kit.overallRisk.slice(1)}
            </div>
            <p style={{ fontSize:16, lineHeight:1.75, color:C.muted, marginBottom:24, maxWidth:680 }}>{kit.kit.overallSummary}</p>
            <div className="btk-results-actions-row" style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:48 }}>
              {[
                { label:"Print Kit",       icon:<Printer size={14} />,  fn:handlePrint },
                { label:"Copy Share Link", icon:<Share2 size={14} />,   fn:handleShare },
              ].map(({ label, icon, fn }) => (
                <button key={label} onClick={fn} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 20px", borderRadius:100, fontSize:13, fontWeight:600, cursor:"pointer", border:`1.5px solid ${C.border}`, background:C.white, fontFamily:F.body, color:C.ink }}>
                  {icon} {label}
                </button>
              ))}
              <button
                onClick={() => { setScreen(1); setKit(null); setSearchParams({}); }}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 20px", borderRadius:100, fontSize:13, fontWeight:600, cursor:"pointer", border:`1.5px solid ${C.border}`, background:C.white, fontFamily:F.body, color:C.ink }}
              >
                ← Edit Claims
              </button>
            </div>
          </div>

          {/* Red Flags */}
          {kit.kit.redFlags.length > 0 && (
            <div style={{ marginBottom:48 }}>
              <div style={sectionTitleStyle}>
                <AlertTriangle size={18} color={C.coral} /> Red Flags ({kit.kit.redFlags.length})
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {kit.kit.redFlags.map((f, i) => (
                  <div key={i} style={{ borderRadius:12, padding:"16px 18px", display:"flex", gap:14, ...flagStyles[f.severity] }}>
                    <div style={{ flexShrink:0, marginTop:1 }}>
                      <AlertTriangle size={16} color={flagIconColor[f.severity]} />
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:4 }}>{f.title}</div>
                      <div style={{ fontSize:13, color:C.muted, lineHeight:1.55, marginBottom:4 }}>{f.description}</div>
                      <div style={{ fontSize:12, fontWeight:600, color:C.ink }}>→ {f.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* System-by-system */}
          {kit.kit.systems.length > 0 && (
            <div style={{ marginBottom:48 }}>
              <div style={sectionTitleStyle}>
                <ShieldCheck size={18} color={C.blue} /> System Credibility — {kit.property.yearBuilt} Home
              </div>
              <div className="btk-sys-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {kit.kit.systems.map((sys) => (
                  <SystemResultCard key={sys.name} sys={sys} />
                ))}
              </div>
            </div>
          )}

          {/* Era Risks */}
          {kit.kit.eraRisks.length > 0 && (
            <div style={{ marginBottom:48 }}>
              <div style={sectionTitleStyle}>
                <Info size={18} color="#FFB340" /> Known Risks for {kit.property.yearBuilt} Homes
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:10 }}>
                {kit.kit.eraRisks.map((r, i) => (
                  <div key={i} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{
                      fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"1px", marginBottom:5,
                      color: r.likelihood === "common" ? C.coral : r.likelihood === "possible" ? "#FFB340" : C.muted,
                    }}>
                      {r.likelihood}
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:4 }}>{r.item}</div>
                    <div style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>{r.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Questions */}
          {kit.kit.generalQuestions.length > 0 && (
            <div style={{ marginBottom:48 }}>
              <div style={sectionTitleStyle}>Questions to Ask at Every Showing</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {kit.kit.generalQuestions.map((q, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"11px 14px", background:`rgba(43,52,255,0.03)`, borderRadius:9, fontSize:13, color:C.ink, lineHeight:1.55 }}>
                    <div style={{ flexShrink:0, width:22, height:22, background:C.blue, color:C.white, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, marginTop:1 }}>{i+1}</div>
                    {q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Documents */}
          {kit.kit.generalDocuments.length > 0 && (
            <div style={{ marginBottom:48 }}>
              <div style={sectionTitleStyle}>Documents to Request Before Closing</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {kit.kit.generalDocuments.map((d, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"11px 14px", background:`rgba(43,52,255,0.03)`, borderRadius:9, fontSize:13, color:C.ink, lineHeight:1.55 }}>
                    <div style={{ flexShrink:0, width:22, height:22, background:C.blue, color:C.white, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, marginTop:1 }}>
                      <Check size={10} />
                    </div>
                    {d}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Permit Lookup */}
          <div style={{ marginBottom:48 }}>
            <div style={sectionTitleStyle}>
              <ExternalLink size={18} color={C.muted} /> Permit Records
            </div>
            <div style={{ border:`1.5px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ padding:"14px 18px", background:`rgba(11,13,26,0.03)`, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{kit.permits.portalName}</span>
                {kit.permits.searched && kit.permits.found
                  ? <span style={{ fontSize:12, fontWeight:700, color:C.blue, background:C.blueFg, padding:"3px 10px", borderRadius:100 }}>{kit.permits.count} records found</span>
                  : <span style={{ fontSize:12, color:C.muted }}>Manual search required</span>}
              </div>
              <div style={{ padding:"16px 18px" }}>
                <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
                  {kit.permits.note}<br /><span style={{ fontWeight:600 }}>{kit.permits.instructions}</span>
                </p>
                {kit.permits.records.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:14 }}>
                    {kit.permits.records.map((r, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"9px 12px", background:C.blueFg, borderRadius:8, fontSize:12 }}>
                        <div>
                          <div style={{ fontWeight:600, color:C.ink }}>{r.description}</div>
                          {(r.date || r.status) && (
                            <div style={{ color:C.muted, marginTop:2 }}>{[r.date, r.status].filter(Boolean).join(" · ")}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <a
                  href={kit.permits.portalUrl}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600, color:C.ink, textDecoration:"none", padding:"9px 16px", border:`1.5px solid ${C.border}`, borderRadius:8 }}
                >
                  Open Permit Portal <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="btk-cta-sect" style={{ background:C.ink, padding:"56px 40px", textAlign:"center", marginTop:64, borderRadius:24 }}>
            <div style={{ fontFamily:F.mono, fontSize:"0.65rem", letterSpacing:"0.12em", textTransform:"uppercase", color:C.yellow, marginBottom:12 }}>
              Next Step
            </div>
            <h3 style={{ fontFamily:F.display, fontSize:"clamp(22px,3vw,34px)", fontWeight:800, color:C.white, letterSpacing:"-0.8px", marginBottom:12 }}>
              Already made an offer?<br />
              <em style={{ fontStyle:"italic", color:C.yellow }}>Document everything from day one.</em>
            </h3>
            <p style={{ fontSize:15, color:"rgba(255,255,255,0.65)", marginBottom:28 }}>
              HomeGentic tracks every job, repair, and contractor — so the next buyer gets a verified record, not a guess.
            </p>
            <Link
              to="/login"
              style={{ display:"inline-flex", alignItems:"center", gap:7, background:C.blue, color:C.white, padding:"14px 30px", borderRadius:100, fontSize:15, fontWeight:700, border:"none", cursor:"pointer", fontFamily:F.body, textDecoration:"none", boxShadow:"0 4px 18px rgba(43,52,255,0.35)" }}
            >
              Start Documenting <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
