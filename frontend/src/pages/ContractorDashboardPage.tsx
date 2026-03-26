import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, TrendingUp, DollarSign, Star, Bell, Wrench, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { contractorService, ContractorProfile } from "@/services/contractor";

const MOCK_LEADS: never[] = [];
const MOCK_ACTIVE_JOBS: never[] = [];
const MONTHLY_EARNINGS: { month: string; amount: number }[] = [];

export default function ContractorDashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ContractorProfile | null>(null);

  useEffect(() => {
    contractorService.getMyProfile().then(setProfile);
  }, []);

  const maxEarning = MONTHLY_EARNINGS.length > 0 ? Math.max(...MONTHLY_EARNINGS.map((m) => m.amount)) : 1;
  const totalEarnings = MONTHLY_EARNINGS.reduce((s, m) => s + m.amount, 0);

  const urgencyBadge = (urgency: "low" | "medium" | "high" | "emergency") => {
    const map: Record<string, "success" | "warning" | "error"> = {
      low: "success",
      medium: "warning",
      high: "error",
      emergency: "error",
    };
    return <Badge variant={map[urgency] || "default"}>{urgency}</Badge>;
  };

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "1.875rem", fontWeight: 900, color: "#111827" }}>
              Contractor Dashboard
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
              {profile?.name ?? "Loading..."}
            </p>
          </div>
          <Button icon={<Bell size={16} />} variant="outline">
            {MOCK_LEADS.length} New Leads
          </Button>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1.25rem",
            marginBottom: "2rem",
          }}
        >
          {[
            {
              label: "Active Leads",
              value: MOCK_LEADS.length,
              icon: <Bell size={22} color="#3b82f6" />,
              bg: "#eff6ff",
            },
            {
              label: "Jobs in Progress",
              value: MOCK_ACTIVE_JOBS.filter((j) => j.status === "in_progress").length,
              icon: <Briefcase size={22} color="#f59e0b" />,
              bg: "#fffbeb",
            },
            {
              label: "Total Earnings (6mo)",
              value: `$${totalEarnings.toLocaleString()}`,
              icon: <DollarSign size={22} color="#10b981" />,
              bg: "#f0fdf4",
            },
            {
              label: "Trust Score",
              value: `${profile?.trustScore ?? "—"}/100`,
              icon: <Star size={22} color="#8b5cf6" />,
              bg: "#f5f3ff",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "1rem",
                padding: "1.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <div>
                <p style={{ fontSize: "0.813rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: "1.625rem", fontWeight: 900, color: "#111827" }}>{stat.value}</p>
              </div>
              <div
                style={{
                  width: "3rem",
                  height: "3rem",
                  backgroundColor: stat.bg,
                  borderRadius: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {stat.icon}
              </div>
            </div>
          ))}
        </div>

        <div className="rsp-grid-2" style={{ marginBottom: "2rem" }}>
          {/* Trust Score Breakdown */}
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
              padding: "1.5rem",
            }}
          >
            <h2 style={{ fontWeight: 800, color: "#111827", marginBottom: "1.25rem" }}>Trust Score</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              {/* Score circle */}
              <div
                style={{
                  width: "6rem",
                  height: "6rem",
                  borderRadius: "9999px",
                  border: "6px solid #8b5cf6",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "1.625rem", fontWeight: 900, color: "#111827", lineHeight: 1 }}>
                  {profile?.trustScore ?? "—"}
                </span>
                <span style={{ fontSize: "0.625rem", color: "#9ca3af" }}>/ 100</span>
              </div>
              <div style={{ flex: 1 }}>
                {[
                  { label: "Jobs Completed", value: profile?.jobsCompleted ?? 0, max: 200 },
                  { label: "Rating", value: (profile?.rating ?? 0) * 20, max: 100, display: `${profile?.rating ?? 0}/5.0` },
                  { label: "Response Rate", value: 94, max: 100 },
                ].map((item) => (
                  <div key={item.label} style={{ marginBottom: "0.625rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <span>{item.label}</span>
                      <span style={{ fontWeight: 600 }}>{item.display ?? item.value}</span>
                    </div>
                    <div
                      style={{
                        height: "4px",
                        backgroundColor: "#e5e7eb",
                        borderRadius: "9999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "4px",
                          backgroundColor: "#8b5cf6",
                          width: `${Math.min((item.value / item.max) * 100, 100)}%`,
                          borderRadius: "9999px",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Earnings Chart */}
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
              padding: "1.5rem",
            }}
          >
            <h2 style={{ fontWeight: 800, color: "#111827", marginBottom: "1.25rem" }}>Monthly Earnings</h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: "8rem" }}>
              {MONTHLY_EARNINGS.map((m) => {
                const pct = (m.amount / maxEarning) * 100;
                const isCurrent = m.month === "Mar";
                return (
                  <div
                    key={m.month}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}
                  >
                    <span style={{ fontSize: "0.625rem", color: "#9ca3af" }}>
                      ${(m.amount / 1000).toFixed(1)}k
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: `${pct}%`,
                        backgroundColor: isCurrent ? "#3b82f6" : "#dbeafe",
                        borderRadius: "0.375rem 0.375rem 0 0",
                        minHeight: "4px",
                        transition: "height 0.3s",
                      }}
                    />
                    <span style={{ fontSize: "0.625rem", color: isCurrent ? "#3b82f6" : "#9ca3af", fontWeight: isCurrent ? 700 : 400 }}>
                      {m.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Leads */}
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontWeight: 800, color: "#111827", fontSize: "1.125rem", marginBottom: "1rem" }}>
            New Leads
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {MOCK_LEADS.map((lead) => (
              <div
                key={lead.id}
                style={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "1rem",
                  padding: "1.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                    <p style={{ fontWeight: 700, color: "#111827" }}>{lead.service}</p>
                    {urgencyBadge(lead.urgency)}
                  </div>
                  <p style={{ fontSize: "0.813rem", color: "#6b7280" }}>
                    {lead.area} · {lead.postedAt} · {lead.quotesReceived} quote{lead.quotesReceived !== 1 ? "s" : ""} received
                  </p>
                </div>
                <Button size="sm" onClick={() => navigate(`/quotes/${lead.id}`)}>
                  View & Quote
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Active Jobs */}
        <div>
          <h2 style={{ fontWeight: 800, color: "#111827", fontSize: "1.125rem", marginBottom: "1rem" }}>
            Active Jobs
          </h2>
          {MOCK_ACTIVE_JOBS.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "2rem",
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "1rem",
                color: "#9ca3af",
              }}
            >
              No active jobs
            </div>
          ) : (
            <div
              style={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "1rem",
                overflow: "hidden",
              }}
            >
              {MOCK_ACTIVE_JOBS.map((job, i) => (
                <div
                  key={job.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem 1.25rem",
                    borderBottom: i < MOCK_ACTIVE_JOBS.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  <div
                    style={{
                      width: "2.25rem",
                      height: "2.25rem",
                      backgroundColor: job.status === "in_progress" ? "#f0fdf4" : "#fffbeb",
                      borderRadius: "9999px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {job.status === "in_progress" ? (
                      <Wrench size={14} color="#10b981" />
                    ) : (
                      <Clock size={14} color="#f59e0b" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#111827" }}>
                      {job.service}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                      {job.address} · Starts {job.startDate}
                    </p>
                  </div>
                  <Badge variant={job.status === "in_progress" ? "success" : "warning"} size="sm">
                    {job.status === "in_progress" ? "In Progress" : "Upcoming"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
