/**
 * Florida 4-point and wind-mitigation readiness for one property
 * (services/insuranceReadiness.ts): what each inspection looks at, what the
 * home's record already shows, and what's missing. Part of the Insurance
 * Defense page, so it prints with the rest of the packet; the buttons don't.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, CircleDashed, CircleAlert, Search } from "lucide-react";
import SystemAgesModal from "@/components/SystemAgesModal";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";
import { systemAgesService } from "@/services/systemAges";
import {
  fourPointReadiness, windMitigationReadiness, readinessCounts, inspectionQuotePrefill,
  type ReadinessItem, type ReadinessStatus,
} from "@/services/insuranceReadiness";
import { V2_COLORS, V2_FONTS } from "@/theme";

const MONO = V2_FONTS.body;

const STATUS: Record<ReadinessStatus, { label: string; color: string; Icon: typeof CheckCircle }> = {
  documented: { label: "In your record",   color: "#188038",          Icon: CheckCircle },
  partial:    { label: "Partly recorded",  color: V2_COLORS.blue,     Icon: CircleDashed },
  missing:    { label: "Not recorded yet", color: "#B3261E",          Icon: CircleAlert },
  onSite:     { label: "Inspector checks", color: V2_COLORS.muted,    Icon: Search },
};

const btn: React.CSSProperties = {
  fontFamily: MONO, fontSize: "0.7rem", fontWeight: 600, padding: "0.45rem 0.9rem",
  border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper, color: V2_COLORS.ink, cursor: "pointer", borderRadius: 100,
};

function Item({ item }: { item: ReadinessItem }) {
  const s = STATUS[item.status];
  return (
    <div data-testid={`readiness-${item.key}`} style={{ padding: "0.875rem 1rem", borderTop: `1px solid ${V2_COLORS.border}`, breakInside: "avoid" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "0.95rem", color: V2_COLORS.ink }}>
          {item.label}{item.ageYears !== null ? <span style={{ fontWeight: 400, color: V2_COLORS.muted }}> · about {item.ageYears} yrs</span> : null}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: "0.7rem", fontWeight: 600, color: s.color }}>
          <s.Icon size={12} aria-hidden /> {s.label}
        </span>
      </div>
      {item.evidence.map((e) => (
        <p key={e} style={{ fontFamily: MONO, fontSize: "0.75rem", color: V2_COLORS.ink, margin: "0.3rem 0 0", lineHeight: 1.45 }}>✓ {e}</p>
      ))}
      {item.missing.map((m) => (
        <p key={m} style={{ fontFamily: MONO, fontSize: "0.75rem", color: V2_COLORS.muted, margin: "0.3rem 0 0", lineHeight: 1.45 }}>○ {m}</p>
      ))}
      {item.ageNote && (
        <p style={{ fontFamily: MONO, fontSize: "0.72rem", color: V2_COLORS.ink, margin: "0.4rem 0 0", fontStyle: "italic" }}>{item.ageNote}</p>
      )}
    </div>
  );
}

function Section({ title, intro, items, onBook }: { title: string; intro: string; items: ReadinessItem[]; onBook: () => void }) {
  const c = readinessCounts(items);
  return (
    <div style={{ border: `1px solid ${V2_COLORS.border}`, marginBottom: "1rem", background: V2_COLORS.paper }}>
      <div style={{ padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "1.05rem", margin: 0 }}>{title}</h3>
          <p style={{ fontFamily: MONO, fontSize: "0.72rem", color: V2_COLORS.muted, margin: "0.2rem 0 0" }}>
            {intro} {c.documented} in your record, {c.partial} partly, {c.missing} not yet{c.onSite ? `, ${c.onSite} checked on site` : ""}.
          </p>
        </div>
        <button className="no-print" onClick={onBook} style={btn}>Get inspector quotes</button>
      </div>
      {items.map((i) => <Item key={i.key} item={i} />)}
    </div>
  );
}

export function InsuranceReadiness({ property, jobs }: { property: Property; jobs: Job[] }) {
  const navigate = useNavigate();
  const pid = String(property.id);
  const [ages, setAges]       = useState(() => systemAgesService.get(pid));
  const [agesOpen, setAgesOpen] = useState(false);
  const facts = { yearBuilt: Number(property.yearBuilt), state: property.state };
  const own = jobs.filter((j) => j.propertyId === pid);
  const book = (kind: "fourPoint" | "windMit") => navigate("/quotes/new", { state: { prefill: inspectionQuotePrefill(kind, pid) } });

  return (
    <div data-testid="insurance-readiness" style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <div>
          <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: V2_COLORS.muted, margin: 0 }}>
            Florida inspection readiness · {property.address}
          </p>
          <p style={{ fontFamily: MONO, fontSize: "0.75rem", color: V2_COLORS.ink, margin: "0.3rem 0 0", maxWidth: "40rem", lineHeight: 1.5 }}>
            What a 4-point and a wind mitigation inspector will look at, next to what this home's record already shows. It doesn't predict whether a carrier will insure the home or what it will charge.
          </p>
        </div>
        <button className="no-print" onClick={() => setAgesOpen(true)} style={btn}>Set install years</button>
      </div>
      <Section
        title="4-point inspection"
        intro="Roof, electrical, plumbing and HVAC."
        items={fourPointReadiness(facts, own, ages)}
        onBook={() => book("fourPoint")}
      />
      <Section
        title="Wind mitigation"
        intro="The credits on Florida's uniform mitigation form."
        items={windMitigationReadiness(facts, own)}
        onBook={() => book("windMit")}
      />
      <SystemAgesModal
        open={agesOpen}
        onClose={() => setAgesOpen(false)}
        propertyId={pid}
        yearBuilt={facts.yearBuilt}
        onSuccess={() => { setAges(systemAgesService.get(pid)); setAgesOpen(false); }}
      />
    </div>
  );
}
