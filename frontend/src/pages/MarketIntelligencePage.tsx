import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, BarChart2, Wrench, Star, ArrowRight, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { jobService } from "@/services/job";
import {
  marketService,
  buildPropertySummary,
  CompetitiveAnalysis,
  ProjectRecommendation,
} from "@/services/market";
import { paymentService, type PlanTier } from "@/services/payment";
import { usePropertyStore } from "@/store/propertyStore";
import { UpgradeGate } from "@/components/UpgradeGate";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

type Tab = "competitive" | "projects";
type SortBy = "roi" | "cost" | "payback";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const GRADE_COLOR: Record<string, string> = {
  A: S.sage, B: COLORS.plum, C: COLORS.plumMid, D: COLORS.plumMid, F: S.rust,
};

const PRIORITY_VARIANT: Record<string, "error" | "warning" | "default"> = {
  High: "error", Medium: "warning", Low: "default",
};

function ScoreCard({ label, dim }: { label: string; dim: { score: number; grade: string; detail: string } }) {
  return (
    <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
          {label}
        </p>
        <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: GRADE_COLOR[dim.grade] ?? S.inkLight }}>
          {dim.grade}
        </span>
      </div>
      <div style={{ height: "3px", background: S.rule, marginBottom: "0.625rem" }}>
        <div style={{ height: "3px", background: GRADE_COLOR[dim.grade] ?? S.inkLight, width: `${dim.score}%`, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>{dim.detail}</p>
        <p style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.75rem", color: S.ink }}>{dim.score}/100</p>
      </div>
    </div>
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
  const [userTier, setUserTier] = useState<PlanTier>("Free");

  useEffect(() => {
    if (properties.length > 0 && !selectedId) {
      setSelectedId(String(properties[0].id));
    }
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {});
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

  if (userTier === "Free") {
    return (
      <Layout>
        <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
          <UpgradeGate
            feature="Market Intelligence"
            description="See how your home's maintenance investment stacks up against comparable properties — and which projects will move the needle most."
            icon="📊"
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
            Intelligence
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem" }}>
            Market Intelligence
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            Competitive position analysis and ROI-ranked improvement recommendations.
          </p>
        </div>

        {/* Controls */}
        <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 12rem" }}>
            <label style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.375rem" }}>
              Property
            </label>
            <select className="form-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 10rem" }}>
            <label style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.375rem" }}>
              Max Budget
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: S.inkLight, fontSize: "0.875rem", pointerEvents: "none" }}>$</span>
              <input className="form-input" type="number" min="0" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ paddingLeft: "1.5rem" }} />
            </div>
          </div>
          <Button loading={loading} onClick={runAnalysis} icon={<BarChart2 size={14} />}>
            Run Analysis
          </Button>
        </div>

        {!analysis && !loading && (
          <div style={{ border: `1px dashed ${S.rule}`, padding: "4rem", textAlign: "center" }}>
            <TrendingUp size={32} color={S.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: S.serif, fontWeight: 700, marginBottom: "0.375rem" }}>Select a property and run analysis</p>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>See your competitive score and top ROI projects.</p>
          </div>
        )}

        {analysis && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
              {(["competitive", "projects"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "0.625rem 1.25rem",
                    fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                    color: tab === t ? S.rust : S.inkLight,
                    marginBottom: "-1px", background: "none", border: "none",
                    borderBottom: tab === t ? `2px solid ${S.rust}` : "2px solid transparent",
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
                <div style={{ background: S.ink, padding: "2rem", color: COLORS.white, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.5rem" }}>
                      Overall HomeGentic Score
                    </p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                      <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "3rem", lineHeight: 1 }}>{analysis.overallScore}</span>
                      <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: COLORS.plumMid }}>/100</span>
                      <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", marginLeft: "0.5rem", color: GRADE_COLOR[analysis.overallGrade] ?? COLORS.white }}>
                        {analysis.overallGrade}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.375rem" }}>Competitive rank</p>
                    <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1 }}>
                      #{analysis.rankOutOf} <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: COLORS.plumMid }}>of {analysis.totalCompared}</span>
                    </p>
                  </div>
                </div>

                {/* Dimension scores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <ScoreCard label="Maintenance History"  dim={analysis.maintenanceScore} />
                  <ScoreCard label="System Modernization" dim={analysis.systemModernization} />
                </div>
                <ScoreCard label="Verification Depth" dim={analysis.verificationDepth} />

                {/* Strengths */}
                {analysis.strengths.length > 0 && (
                  <div style={{ border: `1px solid ${S.sage}`, background: COLORS.white, padding: "1.25rem" }}>
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.sage, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Star size={12} /> Strengths
                    </p>
                    {analysis.strengths.map((s, i) => (
                      <p key={i} style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.ink, marginBottom: "0.25rem" }}>· {s}</p>
                    ))}
                  </div>
                )}

                {/* Improvements */}
                {analysis.improvements.length > 0 && (
                  <div style={{ border: `1px solid ${S.rust}`, background: COLORS.blush, padding: "1.25rem" }}>
                    <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.rust, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <AlertCircle size={12} /> Improvement Opportunities
                    </p>
                    {analysis.improvements.map((s, i) => (
                      <p key={i} style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.ink, marginBottom: "0.25rem" }}>· {s}</p>
                    ))}
                  </div>
                )}

                <Button variant="outline" icon={<ArrowRight size={14} />} onClick={() => setTab("projects")}>
                  View recommended projects
                </Button>
              </div>
            )}

            {tab === "projects" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Sort controls */}
                {projects.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
                      Sort by
                    </span>
                    {(["roi", "cost", "payback"] as SortBy[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        style={{
                          fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                          padding: "0.25rem 0.75rem",
                          background: sortBy === s ? S.ink : "none",
                          color: sortBy === s ? COLORS.white : S.inkLight,
                          border: `1px solid ${sortBy === s ? S.ink : S.rule}`,
                          cursor: "pointer",
                        }}
                      >
                        {s === "roi" ? "ROI %" : s === "cost" ? "Cost ↑" : "Payback ↑"}
                      </button>
                    ))}
                  </div>
                )}
                {projects.length === 0 ? (
                  <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
                    <Wrench size={32} color={S.rule} style={{ margin: "0 auto 1rem" }} />
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
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
                    <div key={i} style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                            <p style={{ fontWeight: 700, color: S.ink }}>{p.name}</p>
                            <Badge variant={PRIORITY_VARIANT[p.priority]} size="sm">{p.priority} priority</Badge>
                            {p.requiresPermit && <Badge variant="default" size="sm">Permit required</Badge>}
                          </div>
                          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight }}>{p.rationale}</p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: S.ink }}>
                            {marketService.formatCost(p.estimatedCostCents)}
                          </p>
                          <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight }}>estimated cost</p>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                        {[
                          { label: "ROI", value: `${p.estimatedRoiPercent}%` },
                          { label: "Value Added", value: marketService.formatCost(p.estimatedGainCents) },
                          { label: "Payback", value: `${p.paybackMonths} mo` },
                        ].map((m) => (
                          <div key={m.label} style={{ background: COLORS.white, padding: "0.75rem", textAlign: "center", borderRadius: RADIUS.card, boxShadow: SHADOWS.card }}>
                            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.ink }}>{m.value}</p>
                            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
