import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, BarChart2, Wrench, Shield, Star, ArrowRight, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { jobService } from "@/services/job";
import { propertyService } from "@/services/property";
import {
  marketService,
  buildPropertySummary,
  CompetitiveAnalysis,
  ProjectRecommendation,
} from "@/services/market";
import { usePropertyStore } from "@/store/propertyStore";

type Tab = "competitive" | "projects";

const GRADE_COLOR: Record<string, string> = {
  A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444",
};

const PRIORITY_VARIANT: Record<string, "error" | "warning" | "default"> = {
  High: "error", Medium: "warning", Low: "default",
};

export default function MarketIntelligencePage() {
  const navigate = useNavigate();
  const { properties } = usePropertyStore();
  const [tab, setTab] = useState<Tab>("competitive");
  const [selectedId, setSelectedId] = useState<string>("");
  const [analysis, setAnalysis] = useState<CompetitiveAnalysis | null>(null);
  const [projects, setProjects] = useState<ProjectRecommendation[]>([]);
  const [budget, setBudget] = useState("50000");
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

      // Use other properties as comparisons if available; otherwise use subject with simulated peers
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

  const ScoreCard = ({ label, dim }: { label: string; dim: { score: number; grade: string; detail: string } }) => (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "0.875rem",
        padding: "1.25rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <p style={{ fontSize: "0.813rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </p>
        <span
          style={{
            fontSize: "1.25rem",
            fontWeight: 900,
            color: GRADE_COLOR[dim.grade] ?? "#6b7280",
          }}
        >
          {dim.grade}
        </span>
      </div>
      {/* Score bar */}
      <div style={{ height: "0.5rem", backgroundColor: "#f3f4f6", borderRadius: "9999px", marginBottom: "0.5rem" }}>
        <div
          style={{
            height: "100%",
            width: `${dim.score}%`,
            backgroundColor: GRADE_COLOR[dim.grade] ?? "#6b7280",
            borderRadius: "9999px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{dim.detail}</p>
        <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "#111827" }}>{dim.score}/100</p>
      </div>
    </div>
  );

  return (
    <Layout>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
            <TrendingUp size={22} color="#3b82f6" />
            <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#111827" }}>
              Market Intelligence
            </h1>
          </div>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            Competitive position analysis and ROI-ranked improvement recommendations.
          </p>
        </div>

        {/* Controls */}
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "1rem",
            padding: "1.25rem",
            marginBottom: "1.5rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 12rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", display: "block", marginBottom: "0.375rem" }}>
              PROPERTY
            </label>
            <select
              className="form-input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {properties.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {p.address}, {p.city}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 10rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", display: "block", marginBottom: "0.375rem" }}>
              MAX BUDGET
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "0.875rem" }}>
                $
              </span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="1000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                style={{ paddingLeft: "1.5rem" }}
              />
            </div>
          </div>

          <Button loading={loading} onClick={runAnalysis} icon={<BarChart2 size={16} />}>
            Run Analysis
          </Button>
        </div>

        {!analysis && !loading && (
          <div
            style={{
              textAlign: "center",
              padding: "4rem 0",
              color: "#9ca3af",
              border: "2px dashed #e5e7eb",
              borderRadius: "1rem",
            }}
          >
            <TrendingUp size={40} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>Select a property and run analysis</p>
            <p style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
              See your competitive score and top ROI projects.
            </p>
          </div>
        )}

        {analysis && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", marginBottom: "1.5rem" }}>
              {(["competitive", "projects"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "0.75rem 1.25rem",
                    fontSize: "0.875rem",
                    fontWeight: tab === t ? 700 : 500,
                    color: tab === t ? "#3b82f6" : "#6b7280",
                    borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
                    marginBottom: "-2px",
                    background: "none",
                    border: "none",
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
                <div
                  style={{
                    background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
                    borderRadius: "1.25rem",
                    padding: "1.75rem",
                    color: "white",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <p style={{ opacity: 0.8, fontSize: "0.813rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Overall HomeFax Score
                    </p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginTop: "0.25rem" }}>
                      <span style={{ fontSize: "3rem", fontWeight: 900, lineHeight: 1 }}>
                        {analysis.overallScore}
                      </span>
                      <span style={{ opacity: 0.7 }}>/100</span>
                      <span
                        style={{
                          fontSize: "1.75rem",
                          fontWeight: 900,
                          marginLeft: "0.5rem",
                          color: GRADE_COLOR[analysis.overallGrade] ?? "white",
                        }}
                      >
                        {analysis.overallGrade}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ opacity: 0.8, fontSize: "0.813rem" }}>Competitive rank</p>
                    <p style={{ fontSize: "1.75rem", fontWeight: 900 }}>
                      #{analysis.rankOutOf} <span style={{ fontSize: "1rem", opacity: 0.7 }}>of {analysis.totalCompared}</span>
                    </p>
                  </div>
                </div>

                {/* Dimension scores */}
                <div className="rsp-grid-2" style={{ gap: "1rem" }}>
                  <ScoreCard label="Maintenance History"  dim={analysis.maintenanceScore} />
                  <ScoreCard label="System Modernization" dim={analysis.systemModernization} />
                </div>
                <ScoreCard label="Verification Depth" dim={analysis.verificationDepth} />

                {/* Strengths */}
                {analysis.strengths.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "0.875rem",
                      padding: "1.25rem",
                    }}
                  >
                    <p style={{ fontWeight: 700, color: "#166534", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Star size={16} /> Strengths
                    </p>
                    {analysis.strengths.map((s, i) => (
                      <p key={i} style={{ fontSize: "0.875rem", color: "#166534", marginBottom: "0.25rem" }}>
                        · {s}
                      </p>
                    ))}
                  </div>
                )}

                {/* Improvements */}
                {analysis.improvements.length > 0 && (
                  <div
                    style={{
                      backgroundColor: "#fff7ed",
                      border: "1px solid #fed7aa",
                      borderRadius: "0.875rem",
                      padding: "1.25rem",
                    }}
                  >
                    <p style={{ fontWeight: 700, color: "#9a3412", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <AlertCircle size={16} /> Improvement Opportunities
                    </p>
                    {analysis.improvements.map((s, i) => (
                      <p key={i} style={{ fontSize: "0.875rem", color: "#9a3412", marginBottom: "0.25rem" }}>
                        · {s}
                      </p>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  icon={<ArrowRight size={16} />}
                  onClick={() => setTab("projects")}
                >
                  View recommended projects
                </Button>
              </div>
            )}

            {tab === "projects" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem 0", color: "#9ca3af" }}>
                    <Wrench size={36} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
                    <p>No projects fit your budget, or all key systems are recently updated.</p>
                  </div>
                ) : (
                  projects.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "1rem",
                        padding: "1.25rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                            <p style={{ fontWeight: 700, color: "#111827" }}>{p.name}</p>
                            <Badge variant={PRIORITY_VARIANT[p.priority]} size="sm">{p.priority} priority</Badge>
                            {p.requiresPermit && (
                              <Badge variant="default" size="sm">Permit required</Badge>
                            )}
                          </div>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>{p.rationale}</p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontSize: "1.25rem", fontWeight: 900, color: "#111827" }}>
                            {marketService.formatCost(p.estimatedCostCents)}
                          </p>
                          <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>estimated cost</p>
                        </div>
                      </div>

                      {/* ROI metrics */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
                        {[
                          { label: "ROI", value: `${p.estimatedRoiPercent}%` },
                          { label: "Value Added", value: marketService.formatCost(p.estimatedGainCents) },
                          { label: "Payback", value: `${p.paybackMonths} mo` },
                        ].map((m) => (
                          <div
                            key={m.label}
                            style={{
                              backgroundColor: "#f9fafb",
                              borderRadius: "0.625rem",
                              padding: "0.625rem",
                              textAlign: "center",
                            }}
                          >
                            <p style={{ fontSize: "1rem", fontWeight: 700, color: "#111827" }}>{m.value}</p>
                            <p style={{ fontSize: "0.688rem", color: "#9ca3af" }}>{m.label}</p>
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
