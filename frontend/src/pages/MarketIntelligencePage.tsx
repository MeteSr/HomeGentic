import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, BarChart2, Wrench, Star, ArrowRight, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { jobService } from "@/services/job";
import {
  marketService,
  buildPropertySummary,
  CompetitiveAnalysis,
  ProjectRecommendation,
} from "@/services/market";
import { usePropertyStore } from "@/store/propertyStore";
import { Panel, Pill, hudButtonStyle, hudInputStyle, type PillTone } from "@/components/hud";

type Tab = "competitive" | "projects";
type SortBy = "roi" | "cost" | "payback";

const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const GRADE_COLOR: Record<string, string> = {
  A: "var(--hg-good)", B: "var(--hg-ink)", C: "var(--hg-muted)", D: "var(--hg-muted)", F: "var(--hg-bad)",
};

const PRIORITY_TONE: Record<string, PillTone> = {
  High: "bad", Medium: "warn", Low: "neutral",
};

function ScoreCard({ label, dim }: { label: string; dim: { score: number; grade: string; detail: string } }) {
  return (
    <Panel style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-muted)" }}>
          {label}
        </p>
        <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: GRADE_COLOR[dim.grade] ?? "var(--hg-muted)" }}>
          {dim.grade}
        </span>
      </div>
      <div style={{ height: "3px", background: "var(--hg-line)", marginBottom: "0.625rem" }}>
        <div style={{ height: "3px", background: GRADE_COLOR[dim.grade] ?? "var(--hg-muted)", width: `${dim.score}%`, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>{dim.detail}</p>
        <p style={{ fontFamily: MONO, fontWeight: 700, fontSize: "0.75rem", color: "var(--hg-ink)" }}>{dim.score}/100</p>
      </div>
    </Panel>
  );
}

export default function MarketIntelligencePage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [tab, setTab] = useState<Tab>("competitive");
  const [selectedId, setSelectedId] = useState<string>("");
  const [analysis, setAnalysis] = useState<CompetitiveAnalysis | null>(null);
  const [projects, setProjects] = useState<ProjectRecommendation[]>([]);
  const [budget, setBudget] = useState("50000");
  const [sortBy, setSortBy] = useState<SortBy>("roi");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (properties.length > 0 && !selectedId) {
      setSelectedId(String(properties[0].id));
    }
  }, [properties]);

  const runAnalysis = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const property = properties.find((p) => String(p.id) === selectedId);
      if (!property) return;
      const jobs = await jobService.getByProperty(selectedId);
      const allJobs = await jobService.getAll();
      const subject = buildPropertySummary(property, jobs);
      const comparisons = properties
        .filter((p) => String(p.id) !== selectedId)
        .map((p) => {
          const pJobs = allJobs.filter((j) => j.propertyId === String(p.id));
          return buildPropertySummary(p, pJobs);
        });
      const result = marketService.analyzeCompetitivePosition(subject, comparisons);
      setAnalysis(result);
      const budgetCents = parseFloat(budget) * 100;
      const recs = marketService.recommendValueAddingProjects(
        {
          yearBuilt:    Number(property.yearBuilt),
          squareFeet:   Number(property.squareFeet),
          propertyType: String(property.propertyType),
          state:        property.state,
          zipCode:      property.zipCode,
        },
        subject.jobs,
        isNaN(budgetCents) ? 0 : budgetCents
      );
      setProjects(recs);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="hg-v3" data-theme="dark" style={{ minHeight: "100dvh", background: "var(--hg-bg)" }}>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--hg-blue-ink)", marginBottom: "0.5rem" }}>
            Intelligence
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem", color: "var(--hg-ink)" }}>
            Market Intelligence
          </h1>
          <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>
            Competitive position analysis and ROI-ranked improvement recommendations.
          </p>
        </div>

        {/* Controls */}
        <Panel style={{ padding: "1.25rem", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 12rem" }}>
            <label htmlFor="market-property" style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-muted)", display: "block", marginBottom: "0.375rem" }}>
              Property
            </label>
            <select id="market-property" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ ...hudInputStyle, width: "100%" }}>
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 10rem" }}>
            <label htmlFor="market-max-budget" style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-muted)", display: "block", marginBottom: "0.375rem" }}>
              Max Budget
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--hg-muted)", fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
              <input id="market-max-budget" type="number" min="0" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ ...hudInputStyle, width: "100%", paddingLeft: "1.5rem" }} />
            </div>
          </div>
          <Button loading={loading} onClick={runAnalysis} icon={<BarChart2 size={14} />} style={hudButtonStyle("primary")}>
            Run Analysis
          </Button>
        </Panel>

        {!analysis && !loading && (
          <div style={{ border: "1px dashed var(--hg-line-2)", padding: "4rem", textAlign: "center" }}>
            <TrendingUp size={32} color="var(--hg-line-2)" style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, marginBottom: "0.375rem", color: "var(--hg-ink)" }}>Select a property and run analysis</p>
            <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>See your competitive score and top ROI projects.</p>
          </div>
        )}

        {analysis && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--hg-line)", marginBottom: "1.5rem" }}>
              {(["competitive", "projects"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "0.625rem 1.25rem",
                    fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                    color: tab === t ? "var(--hg-blue-ink)" : "var(--hg-muted)",
                    marginBottom: "-1px", background: "none", border: "none",
                    borderBottom: tab === t ? "2px solid var(--hg-blue)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {t === "competitive" ? "Competitive Analysis" : `Projects (${projects.length})`}
                </button>
              ))}
            </div>

            {tab === "competitive" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Overall score banner */}
                <Panel style={{ background: "var(--hg-fill)", padding: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--hg-muted)", marginBottom: "0.5rem" }}>
                      Overall HomeGentic Score
                    </p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                      <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "3rem", lineHeight: 1, color: "var(--hg-ink)" }}>{analysis.overallScore}</span>
                      <span style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-muted)" }}>/100</span>
                      <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "1.75rem", marginLeft: "0.5rem", color: GRADE_COLOR[analysis.overallGrade] ?? "var(--hg-ink)" }}>
                        {analysis.overallGrade}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-muted)", marginBottom: "0.375rem" }}>Competitive rank</p>
                    <p style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: "var(--hg-ink)" }}>
                      #{analysis.rankOutOf} <span style={{ fontFamily: MONO, fontSize: "0.75rem", color: "var(--hg-muted)" }}>of {analysis.totalCompared}</span>
                    </p>
                  </div>
                </Panel>

                {/* Dimension scores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <ScoreCard label="Maintenance History"  dim={analysis.maintenanceScore} />
                  <ScoreCard label="System Modernization" dim={analysis.systemModernization} />
                </div>
                <ScoreCard label="Verification Depth" dim={analysis.verificationDepth} />

                {/* Strengths */}
                {analysis.strengths.length > 0 && (
                  <Panel style={{ border: "1px solid var(--hg-good-edge)", background: "var(--hg-good-wash)", padding: "1.25rem" }}>
                    <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-good)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Star size={12} /> Strengths
                    </p>
                    {analysis.strengths.map((s, i) => (
                      <p key={i} style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.04em", color: "var(--hg-ink)", marginBottom: "0.25rem" }}>· {s}</p>
                    ))}
                  </Panel>
                )}

                {/* Improvements */}
                {analysis.improvements.length > 0 && (
                  <Panel style={{ border: "1px solid var(--hg-yel-edge)", background: "var(--hg-yel-wash)", padding: "1.25rem" }}>
                    <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-yel-ink)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <AlertCircle size={12} /> Improvement Opportunities
                    </p>
                    {analysis.improvements.map((s, i) => (
                      <p key={i} style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.04em", color: "var(--hg-ink)", marginBottom: "0.25rem" }}>· {s}</p>
                    ))}
                  </Panel>
                )}

                <Button variant="outline" icon={<ArrowRight size={14} />} onClick={() => setTab("projects")} style={hudButtonStyle("outline")}>
                  View recommended projects
                </Button>
              </div>
            )}

            {tab === "projects" && (
              <>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Sort controls */}
                {projects.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-muted)" }}>
                      Sort by
                    </span>
                    {(["roi", "cost", "payback"] as SortBy[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        style={{
                          fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                          padding: "0.25rem 0.75rem",
                          background: sortBy === s ? "var(--hg-blue)" : "none",
                          color: sortBy === s ? "var(--hg-chip-on)" : "var(--hg-muted)",
                          border: `1px solid ${sortBy === s ? "var(--hg-blue)" : "var(--hg-line-2)"}`,
                          cursor: "pointer",
                        }}
                      >
                        {s === "roi" ? "ROI %" : s === "cost" ? "Cost ↑" : "Payback ↑"}
                      </button>
                    ))}
                  </div>
                )}
                {projects.length === 0 ? (
                  <div style={{ border: "1px dashed var(--hg-line-2)", padding: "3rem", textAlign: "center" }}>
                    <Wrench size={32} color="var(--hg-line-2)" style={{ margin: "0 auto 1rem" }} />
                    <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>
                      No projects fit your budget, or all key systems are recently updated.
                    </p>
                  </div>
                ) : (
                  [...projects]
                    .sort((a, b) =>
                      sortBy === "roi"     ? b.estimatedRoiPercent - a.estimatedRoiPercent
                      : sortBy === "cost"  ? a.estimatedCostCents  - b.estimatedCostCents
                      : a.paybackMonths    - b.paybackMonths
                    )
                    .map((p, i) => (
                    <Panel key={i} style={{ padding: "1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                            <p style={{ fontFamily: BODY, fontWeight: 700, color: "var(--hg-ink)" }}>{p.name}</p>
                            <Pill tone={PRIORITY_TONE[p.priority]}>{p.priority} priority</Pill>
                            {p.requiresPermit && <Pill tone="neutral">Permit required</Pill>}
                          </div>
                          <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.04em", color: "var(--hg-muted)" }}>{p.rationale}</p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: "var(--hg-ink)" }}>
                            {marketService.formatCost(p.estimatedCostCents)}
                          </p>
                          <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", color: "var(--hg-muted)" }}>estimated cost</p>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                        {[
                          { label: "ROI", value: `${p.estimatedRoiPercent}%` },
                          { label: "Value Added", value: marketService.formatCost(p.estimatedGainCents) },
                          { label: "Payback", value: `${p.paybackMonths} mo` },
                        ].map((m) => (
                          <div key={m.label} style={{ background: "var(--hg-fill)", border: "1px solid var(--hg-line)", padding: "0.75rem", textAlign: "center", borderRadius: 10 }}>
                            <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "1rem", color: "var(--hg-ink)" }}>{m.value}</p>
                            <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-muted)" }}>{m.label}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.875rem" }}>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<ArrowRight size={13} />}
                          onClick={() => navigate("/quotes/new")}
                          style={hudButtonStyle("outline")}
                        >
                          Request Quote
                        </Button>
                      </div>
                    </Panel>
                  ))
                )}
              </div>
              <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.04em", color: "var(--hg-muted)", marginTop: "0.75rem", padding: "0 0.25rem" }}>
                ROI data: 2024 Cost vs. Value Report, Remodeling Magazine. Adjusted for national averages; actual returns vary by market and condition.
              </p>
              </>
            )}
          </>
        )}
      </div>
      </div>
    </Layout>
  );
}
