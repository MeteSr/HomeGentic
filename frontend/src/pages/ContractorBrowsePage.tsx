import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, MapPin, ShieldCheck, Star, ArrowRight, Users, Snowflake, Droplets, Zap,
  Home as HomeIcon, Paintbrush, Leaf, Settings2, LayoutGrid, AppWindow, Wrench,
  ChevronRight, ChevronDown, FileText, Lock, MoreVertical, Plus, CheckCircle2,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { contractorService, ContractorProfile } from "@/services/contractor";
import { jobService, Job } from "@/services/job";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  blue:     COLORS.navActive,
  blueBg:   COLORS.navActiveBg,
  muted:    COLORS.navInactive,
  inkLight: COLORS.plumMid,
  green:    "#16A34A",
  greenBg:  "#F0FDF4",
  amber:    "#D97706",
  sans:     FONTS.sans,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const SPECIALTY_META: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
  HVAC:        { Icon: Snowflake,  color: "#2563EB", bg: "#DBEAFE" },
  Plumbing:    { Icon: Droplets,   color: "#0891B2", bg: "#E0F2FE" },
  Electrical:  { Icon: Zap,        color: "#7C3AED", bg: "#EDE9FE" },
  Roofing:     { Icon: HomeIcon,   color: "#374151", bg: "#F3F4F6" },
  Painting:    { Icon: Paintbrush, color: "#DC2626", bg: "#FEE2E2" },
  Flooring:    { Icon: LayoutGrid, color: "#92400E", bg: "#FEF3C7" },
  Windows:     { Icon: AppWindow,  color: "#0284C7", bg: "#E0F2FE" },
  Landscaping: { Icon: Leaf,       color: "#15803D", bg: "#DCFCE7" },
  Appliances:  { Icon: Settings2,  color: "#B45309", bg: "#FEF3C7" },
};
const DEFAULT_META = { Icon: Wrench, color: "#6B7280", bg: "#F3F4F6" };

const CATEGORY_CHIPS: { label: string; value: string; Icon: React.ElementType }[] = [
  { label: "All Categories", value: "All",        Icon: LayoutGrid },
  { label: "HVAC",           value: "HVAC",       Icon: Snowflake  },
  { label: "Plumbing",       value: "Plumbing",   Icon: Droplets   },
  { label: "Electrical",     value: "Electrical", Icon: Zap        },
  { label: "Roofing",        value: "Roofing",    Icon: HomeIcon   },
  { label: "Appliances",     value: "Appliances", Icon: Settings2  },
  { label: "Painting",       value: "Painting",   Icon: Paintbrush },
];

const WHY_ITEMS: { Icon: React.ElementType; color: string; bg: string; title: string; sub: string }[] = [
  { Icon: ShieldCheck, color: "#2563EB", bg: "#DBEAFE", title: "Identity Verified",   sub: "All contractors are verified and trusted." },
  { Icon: FileText,    color: "#2563EB", bg: "#DBEAFE", title: "Work History",         sub: "Past work is securely recorded on ICP." },
  { Icon: Star,        color: "#D97706", bg: "#FEF3C7", title: "Ratings & Reviews",   sub: "Real reviews from homeowners like you." },
  { Icon: Lock,        color: "#16A34A", bg: "#F0FDF4", title: "Secure Records",      sub: "Quotes, invoices, and warranties in one place." },
];

const POPULAR_SERVICES: { label: string; Icon: React.ElementType; color: string }[] = [
  { label: "HVAC Maintenance",         Icon: Snowflake,  color: "#2563EB" },
  { label: "Plumbing Repair",          Icon: Droplets,   color: "#0891B2" },
  { label: "Roof Inspection",          Icon: HomeIcon,   color: "#374151" },
  { label: "Electrical Panel Upgrade", Icon: Zap,        color: "#7C3AED" },
  { label: "Interior Painting",        Icon: Paintbrush, color: "#DC2626" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarDisplay({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(value * 10) / 10;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <span style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.82rem", color: S.ink }}>{rounded.toFixed(1)}</span>
      <div style={{ display: "flex", gap: "1px" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={12} color="#F59E0B" fill={n <= Math.round(value) ? "#F59E0B" : "none"} />
        ))}
      </div>
      {count != null && (
        <span style={{ fontFamily: S.sans, fontSize: "0.72rem", color: S.muted }}>({count})</span>
      )}
    </div>
  );
}

function ContractorCard({ contractor, onClick }: { contractor: ContractorProfile; onClick: () => void }) {
  const primarySpec = contractor.specialties[0] ?? "";
  const { Icon, color, bg } = SPECIALTY_META[primarySpec] ?? DEFAULT_META;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: S.paper,
        border: `1px solid ${S.rule}`,
        borderRadius: RADIUS.card,
        boxShadow: hovered ? SHADOWS.hover : SHADOWS.card,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.18s",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "1.125rem", display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
        {/* Icon + name */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={22} color={color} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.9rem", color: S.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "0.15rem" }}>
              {contractor.name}
            </h3>
            <p style={{ fontFamily: S.sans, fontSize: "0.75rem", color: S.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {contractor.specialties.join(", ") || "—"}
            </p>
          </div>
        </div>

        {/* Rating + verified */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {contractor.rating != null && contractor.rating > 0
            ? <StarDisplay value={contractor.rating} count={contractor.jobsCompleted} />
            : <span style={{ fontFamily: S.sans, fontSize: "0.75rem", color: S.muted }}>No reviews yet</span>
          }
          {contractor.isVerified && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <CheckCircle2 size={12} color={S.green} />
              <span style={{ fontFamily: S.sans, fontSize: "0.72rem", color: S.green, fontWeight: 500 }}>Verified on ICP</span>
            </div>
          )}
        </div>

        {/* Specialty tags */}
        {contractor.specialties.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {contractor.specialties.slice(0, 3).map((sp) => (
              <span key={sp} style={{ fontFamily: S.sans, fontSize: "0.68rem", fontWeight: 500, padding: "0.2rem 0.55rem", background: "#F1F5F9", color: "#475569", borderRadius: RADIUS.pill }}>
                {sp}
              </span>
            ))}
          </div>
        )}

        {/* Location */}
        {contractor.serviceArea && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <MapPin size={11} color={S.muted} />
            <span style={{ fontFamily: S.sans, fontSize: "0.72rem", color: S.muted }}>{contractor.serviceArea}</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${S.rule}`, padding: "0.75rem 1.125rem" }}>
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          style={{ width: "100%", padding: "0.5rem", background: "none", border: `1px solid ${S.blue}`, borderRadius: RADIUS.sm, color: S.blue, fontFamily: S.sans, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}
        >
          View Profile <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

function TrustBanner() {
  return (
    <div style={{ background: S.greenBg, border: "1px solid #BBF7D0", borderRadius: RADIUS.sm, padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <ShieldCheck size={20} color={S.green} />
      </div>
      <div>
        <p style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.9rem", color: S.ink, marginBottom: "0.2rem" }}>
          Trust you can verify.
        </p>
        <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.inkLight, lineHeight: 1.4 }}>
          All contractors are identity-verified and work history is immutably recorded on the Internet Computer Protocol (ICP).
        </p>
      </div>
    </div>
  );
}

function RightSidebar({ onPostJob, recentJobs }: { onPostJob: () => void; recentJobs: Job[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: 272, flexShrink: 0 }}>
      {/* Why HomeGentic */}
      <div style={{ background: S.paper, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "1.25rem", boxShadow: SHADOWS.card }}>
        <h3 style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.9rem", color: S.ink, marginBottom: "1rem" }}>
          Why HomeGentic Contractors?
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {WHY_ITEMS.map(({ Icon, color, bg, title, sub }) => (
            <div key={title} style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={17} color={color} />
              </div>
              <div>
                <p style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.8rem", color: S.ink }}>{title}</p>
                <p style={{ fontFamily: S.sans, fontSize: "0.72rem", color: S.muted, lineHeight: 1.4 }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.875rem", background: "none", border: "none", cursor: "pointer", fontFamily: S.sans, fontSize: "0.78rem", fontWeight: 600, color: S.blue, padding: 0 }}>
          Learn more <ArrowRight size={13} />
        </button>
      </div>

      {/* Popular Services */}
      <div style={{ background: S.paper, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "1.25rem", boxShadow: SHADOWS.card }}>
        <h3 style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.9rem", color: S.ink, marginBottom: "0.875rem" }}>
          Popular Services
        </h3>
        {POPULAR_SERVICES.map(({ label, Icon, color }) => (
          <button
            key={label}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "0.5rem 0", borderTop: `1px solid ${S.rule}`, borderRight: "none", borderBottom: "none", borderLeft: "none", background: "none", cursor: "pointer", fontFamily: S.sans, fontSize: "0.8rem", color: S.ink, textAlign: "left" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Icon size={14} color={color} />
              {label}
            </div>
            <ChevronRight size={14} color={S.muted} />
          </button>
        ))}
        <button style={{ display: "flex", alignItems: "center", gap: "0.3rem", borderTop: `1px solid ${S.rule}`, borderRight: "none", borderBottom: "none", borderLeft: "none", padding: "0.625rem 0 0 0", width: "100%", background: "none", cursor: "pointer", fontFamily: S.sans, fontSize: "0.78rem", fontWeight: 600, color: S.blue } as React.CSSProperties}>
          View all services <ArrowRight size={13} />
        </button>
      </div>

      {/* Need something done */}
      <div style={{ background: S.blueBg, border: "1px solid #BFDBFE", borderRadius: RADIUS.card, padding: "1.25rem" }}>
        <h3 style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.9rem", color: S.ink, marginBottom: "0.5rem" }}>
          Need something done?
        </h3>
        <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.inkLight, marginBottom: "1rem", lineHeight: 1.4 }}>
          Post a job and receive quotes from trusted contractors.
        </p>
        <button
          onClick={onPostJob}
          style={{ width: "100%", padding: "0.625rem", background: S.blue, color: "#fff", border: "none", borderRadius: RADIUS.sm, fontFamily: S.sans, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}
        >
          Post a Job
        </button>
      </div>

      {/* Recent Activity */}
      {recentJobs.length > 0 && (
        <div style={{ background: S.paper, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "1.25rem", boxShadow: SHADOWS.card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
            <h3 style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "0.9rem", color: S.ink }}>Recent Activity</h3>
            <button style={{ background: "none", border: "none", cursor: "pointer", fontFamily: S.sans, fontSize: "0.75rem", color: S.blue, fontWeight: 600, padding: 0 }}>View all</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {recentJobs.slice(0, 3).map((j) => {
              const { Icon, color, bg } = SPECIALTY_META[j.serviceType] ?? DEFAULT_META;
              return (
                <div key={j.id} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} color={color} />
                  </div>
                  <div>
                    <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.ink, lineHeight: 1.3 }}>
                      {j.status === "verified" ? "Work completed" : j.status === "pending" ? "Job added" : "Job updated"}
                      {j.contractorName ? ` · ${j.contractorName}` : ""}
                    </p>
                    <p style={{ fontFamily: S.sans, fontSize: "0.7rem", color: S.muted, marginTop: "0.1rem" }}>
                      {j.date ? new Date(j.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MyContractorsTab({
  myContractors,
  loading,
  onNavigate,
}: {
  myContractors: { name: string; service: string; lastDate: string; count: number }[];
  loading: boolean;
  onNavigate: (name: string) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <p style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.muted }}>
          Contractors who have worked on your property.
        </p>
        <button
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", background: S.blue, color: "#fff", border: "none", borderRadius: RADIUS.sm, fontFamily: S.sans, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={14} /> Add Contractor
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <div className="spinner-lg" />
        </div>
      ) : myContractors.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.card }}>
          <Users size={36} color={S.rule} style={{ margin: "0 auto 1rem" }} />
          <p style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.9rem", color: S.ink, marginBottom: "0.375rem" }}>
            No contractors yet
          </p>
          <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.muted }}>
            Contractors who have completed work on your property will appear here.
          </p>
        </div>
      ) : (
        <div style={{ background: S.paper, border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden", boxShadow: SHADOWS.card }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.3fr 0.8fr 1.2fr", padding: "0.75rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: "#F8FAFC" }}>
            {["CONTRACTOR", "SERVICE", "LAST WORK DATE", "PROJECTS", "ACTIONS"].map((h) => (
              <span key={h} style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: S.muted, fontWeight: 600, textTransform: "uppercase" as const }}>
                {h}
              </span>
            ))}
          </div>

          {myContractors.map((mc, i) => {
            const { Icon, color, bg } = SPECIALTY_META[mc.service] ?? DEFAULT_META;
            return (
              <div
                key={mc.name}
                style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.3fr 0.8fr 1.2fr", padding: "0.875rem 1.25rem", borderBottom: i < myContractors.length - 1 ? `1px solid ${S.rule}` : "none", alignItems: "center" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={16} color={color} />
                  </div>
                  <div>
                    <p style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.83rem", color: S.ink }}>{mc.name}</p>
                    <p style={{ fontFamily: S.sans, fontSize: "0.72rem", color: S.muted }}>{mc.service}</p>
                  </div>
                </div>
                <span style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.ink }}>{mc.service}</span>
                <span style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.ink }}>
                  {mc.lastDate ? new Date(mc.lastDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </span>
                <span style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.ink }}>{mc.count}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    onClick={() => onNavigate(mc.name)}
                    style={{ padding: "0.35rem 0.75rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.sm, background: "none", fontFamily: S.sans, fontSize: "0.75rem", color: S.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 600 }}
                  >
                    View Details <ChevronRight size={12} />
                  </button>
                  <button style={{ padding: "0.35rem", border: "none", background: "none", cursor: "pointer", color: S.muted, display: "flex", alignItems: "center" }}>
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ContractorBrowsePage() {
  const navigate = useNavigate();
  const [tab,           setTab]           = useState<"find" | "my">("find");
  const [contractors,   setContractors]   = useState<ContractorProfile[]>([]);
  const [jobs,          setJobs]          = useState<Job[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [query,         setQuery]         = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    Promise.all([
      contractorService.search(),
      jobService.getAll().catch(() => [] as Job[]),
    ])
      .then(([ctrs, js]) => { setContractors(ctrs); setJobs(js); })
      .catch((e) => console.error("[ContractorBrowsePage] load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = contractors;
    if (activeCategory !== "All") list = list.filter((c) => c.specialties.includes(activeCategory));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.specialties.some((s) => s.toLowerCase().includes(q)) ||
      (c.serviceArea ?? "").toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.trustScore - a.trustScore);
  }, [contractors, activeCategory, query]);

  const myContractors = useMemo(() => {
    const byName = new Map<string, { name: string; service: string; lastDate: string; count: number }>();
    for (const j of jobs) {
      if (!j.contractorName) continue;
      const existing = byName.get(j.contractorName);
      if (!existing) {
        byName.set(j.contractorName, { name: j.contractorName, service: j.serviceType, lastDate: j.date, count: 1 });
      } else {
        const useThis = j.date > existing.lastDate;
        byName.set(j.contractorName, {
          ...existing,
          lastDate: useThis ? j.date : existing.lastDate,
          service: useThis ? j.serviceType : existing.service,
          count: existing.count + 1,
        });
      }
    }
    return [...byName.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [jobs]);

  const recentJobs = useMemo(
    () => [...jobs].sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 3),
    [jobs]
  );

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Page header */}
        <div style={{ marginBottom: "1.75rem" }}>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", color: S.ink, lineHeight: 1.1, marginBottom: "0.375rem" }}>
            Contractors
          </h1>
          <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.muted }}>
            Find trusted professionals and manage the contractors who work on your home.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.75rem" }}>
          {([
            { value: "find" as const, label: "Find Contractors" },
            { value: "my"   as const, label: myContractors.length > 0 ? `My Contractors (${myContractors.length})` : "My Contractors" },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              style={{ padding: "0.625rem 1.125rem", background: "none", border: "none", borderBottom: tab === value ? `2px solid ${S.blue}` : "2px solid transparent", marginBottom: "-1px", fontFamily: S.sans, fontSize: "0.875rem", fontWeight: tab === value ? 600 : 400, color: tab === value ? S.blue : S.muted, cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "find" && (
          <>
            {/* Search row */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.125rem", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 16rem" }}>
                <Search size={15} color={S.muted} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by service, trade, or company name..."
                  style={{ width: "100%", padding: "0.625rem 0.75rem 0.625rem 2.5rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.85rem", background: S.paper, boxSizing: "border-box", outline: "none" }}
                />
              </div>
              <div style={{ position: "relative", flex: "0 1 14rem" }}>
                <input
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  placeholder="City, State"
                  style={{ width: "100%", padding: "0.625rem 2.25rem 0.625rem 0.75rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.85rem", background: S.paper, boxSizing: "border-box", outline: "none" }}
                />
                <MapPin size={14} color={S.muted} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </div>
              <button style={{ padding: "0.625rem 1.25rem", background: S.blue, color: "#fff", border: "none", borderRadius: RADIUS.input, fontFamily: S.sans, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                Find Contractors
              </button>
            </div>

            {/* Category chips */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              {CATEGORY_CHIPS.map(({ label, value, Icon }) => {
                const active = activeCategory === value;
                return (
                  <button
                    key={value}
                    onClick={() => setActiveCategory(value)}
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.875rem", border: `1px solid ${active ? S.blue : S.rule}`, borderRadius: RADIUS.pill, background: active ? S.blueBg : S.paper, color: active ? S.blue : S.inkLight, fontFamily: S.sans, fontSize: "0.8rem", fontWeight: active ? 600 : 400, cursor: "pointer" }}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                );
              })}
              <button style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.875rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.pill, background: S.paper, color: S.inkLight, fontFamily: S.sans, fontSize: "0.8rem", cursor: "pointer" }}>
                More <ChevronDown size={13} />
              </button>
            </div>

            {/* Trust banner */}
            <TrustBanner />

            {/* Two-column: main content + right sidebar */}
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h2 style={{ fontFamily: S.sans, fontWeight: 700, fontSize: "1rem", color: S.ink }}>
                    {activeCategory === "All" && !query.trim() ? "Recommended for your home" : `${filtered.length} contractor${filtered.length !== 1 ? "s" : ""} found`}
                  </h2>
                  {!loading && filtered.length > 0 && (
                    <p style={{ fontFamily: S.sans, fontSize: "0.75rem", color: S.muted }}>
                      Top-rated contractors based on your home's needs and maintenance history.
                    </p>
                  )}
                </div>

                {loading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                    <div className="spinner-lg" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, padding: "3rem", textAlign: "center" }}>
                    <Users size={36} color={S.rule} style={{ margin: "0 auto 1rem" }} />
                    <p style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.9rem", color: S.ink, marginBottom: "0.375rem" }}>
                      No contractors found
                    </p>
                    <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.muted }}>
                      {query || activeCategory !== "All" ? "Try clearing your filters." : "No contractors are registered yet."}
                    </p>
                    {(query || activeCategory !== "All") && (
                      <button
                        onClick={() => { setQuery(""); setActiveCategory("All"); }}
                        style={{ marginTop: "1rem", fontFamily: S.sans, fontSize: "0.78rem", fontWeight: 600, padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, borderRadius: RADIUS.sm, background: "none", cursor: "pointer", color: S.inkLight }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))", gap: "1rem" }}>
                    {filtered.map((c) => (
                      <ContractorCard key={c.id} contractor={c} onClick={() => navigate(`/contractor/${c.id}`)} />
                    ))}
                  </div>
                )}
              </div>

              <RightSidebar onPostJob={() => navigate("/quotes/new")} recentJobs={recentJobs} />
            </div>
          </>
        )}

        {tab === "my" && (
          <MyContractorsTab
            myContractors={myContractors}
            loading={loading}
            onNavigate={(name) => {
              const match = contractors.find((c) => c.name === name);
              if (match) navigate(`/contractor/${match.id}`);
            }}
          />
        )}
      </div>
    </Layout>
  );
}
