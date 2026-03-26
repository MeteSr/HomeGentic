import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, CheckCircle, DollarSign, TrendingUp, Plus, Wrench, MessageSquare, Sparkles, ArrowRight, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { principal, profile } = useAuthStore();
  const { properties, setProperties } = usePropertyStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    Promise.all([loadProperties(), loadJobs()]).finally(() => setLoading(false));
  }, []);

  async function loadProperties() {
    if ((window as any).__e2e_properties) { setProperties((window as any).__e2e_properties); return; }
    try { setProperties(await propertyService.getMyProperties()); }
    catch (err: any) { toast.error("Failed to load properties: " + err.message); }
  }

  async function loadJobs() {
    try { setJobs(await jobService.getAll()); } catch { /* canister not deployed */ }
  }

  const totalValue    = jobService.getTotalValue(jobs);
  const verifiedCount = jobService.getVerifiedCount(jobs);

  const hasProperty  = properties.length > 0;
  const hasVerified  = properties.some((p) => p.verificationLevel !== "Unverified" && p.verificationLevel !== "PendingReview");
  const hasJob       = jobs.length > 0;
  const showBanner   = !loading && !(hasProperty && hasVerified && hasJob) && !bannerDismissed;

  const verificationBadge = (level: string) => {
    if (level === "Premium")       return <Badge variant="success">Premium Verified</Badge>;
    if (level === "Basic")         return <Badge variant="info">Basic Verified</Badge>;
    if (level === "PendingReview") return <Badge variant="warning">Pending</Badge>;
    return <Badge variant="default">Unverified</Badge>;
  };

  return (
    <Layout>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
              Overview
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1 }}>
              Dashboard
            </h1>
            {principal && (
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.375rem" }}>
                {principal.slice(0, 16)}…
                {profile?.email && ` · ${profile.email}`}
              </p>
            )}
          </div>
          <Button onClick={() => navigate("/properties/new")} icon={<Plus size={14} />}>
            Add Property
          </Button>
        </div>

        {/* Onboarding banner */}
        {showBanner && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
            border: `1px solid ${S.rust}`, padding: "1rem 1.25rem", marginBottom: "2rem",
            background: "#FAF0ED", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Sparkles size={16} color={S.rust} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  Finish setting up
                </p>
                <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>
                  {!hasProperty ? "Add your first property to start building your home's verified history."
                    : !hasVerified ? "Verify ownership so buyers can trust your history."
                    : "Log your first job to add value to your HomeFax report."}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                onClick={() => navigate("/onboarding")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.5rem 1rem", background: S.rust, color: "#fff",
                  border: "none", fontFamily: S.mono, fontSize: "0.65rem",
                  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                }}
              >
                Continue setup <ArrowRight size={12} />
              </button>
              <button onClick={() => setBannerDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight }}>
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderTop: `1px solid ${S.rule}`, borderLeft: `1px solid ${S.rule}`, marginBottom: "2.5rem" }}>
          {[
            { label: "Properties",        value: properties.length,                                     accent: false },
            { label: "Verified Jobs",      value: verifiedCount,                                         accent: false },
            { label: "Total Value Added",  value: `$${(totalValue / 100).toLocaleString()}`,             accent: false },
            { label: "HomeFax Premium™",   value: `$${Math.round((totalValue / 100) * 0.03).toLocaleString()}`, accent: true },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: "1.5rem",
              borderRight: `1px solid ${S.rule}`,
              borderBottom: `1px solid ${S.rule}`,
              background: stat.accent ? S.ink : "#fff",
            }}>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: stat.accent ? "#7A7268" : S.inkLight, marginBottom: "0.625rem" }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "2rem", lineHeight: 1, color: stat.accent ? "#F4F1EB" : S.ink }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button variant="outline" icon={<Plus size={14} />}         onClick={() => navigate("/properties/new")}>Add Property</Button>
            <Button variant="outline" icon={<Wrench size={14} />}       onClick={() => navigate("/jobs/new")}>Log a Job</Button>
            <Button variant="outline" icon={<MessageSquare size={14} />} onClick={() => navigate("/quotes/new")}>Request Quote</Button>
          </div>
        </div>

        {/* Properties */}
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
            My Properties
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}><div className="spinner-lg" /></div>
          ) : properties.length === 0 ? (
            <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
              <Home size={40} color={S.rule} style={{ margin: "0 auto 1rem" }} />
              <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>No properties yet</p>
              <p style={{ fontSize: "0.875rem", color: S.inkLight, fontWeight: 300, maxWidth: "24rem", margin: "0 auto 1.5rem" }}>
                Add your first property to start building a verified, on-chain maintenance history.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                <Button onClick={() => navigate("/onboarding")} icon={<Sparkles size={14} />}>Get started</Button>
                <Button variant="outline" onClick={() => navigate("/properties/new")} icon={<Plus size={14} />}>Add property</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "1px", background: S.rule }}>
              {properties.map((property) => (
                <PropertyCard key={String(property.id)} property={property} onClick={() => navigate(`/properties/${property.id}`)} badge={verificationBadge(property.verificationLevel)} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {jobs.length > 0 && (
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem" }}>
              Recent Activity
            </div>
            <div style={{ border: `1px solid ${S.rule}` }}>
              {jobs.slice(0, 5).map((job, i) => (
                <div key={job.id} className="rsp-activity-row" style={{ borderBottom: i < Math.min(jobs.length, 5) - 1 ? `1px solid ${S.rule}` : "none", background: "#fff" }}>
                  <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Wrench size={13} color={S.inkLight} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.serviceType} — {job.isDiy ? "DIY" : job.contractorName}
                    </p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>{job.date}</p>
                  </div>
                  <div className="rsp-activity-right">
                    <p style={{ fontFamily: S.mono, fontSize: "0.75rem", fontWeight: 500 }}>${(job.amount / 100).toLocaleString()}</p>
                    <Badge variant={job.status === "verified" ? "success" : job.status === "completed" ? "info" : "warning"} size="sm">
                      {job.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}

function PropertyCard({ property, onClick, badge }: { property: Property; onClick: () => void; badge: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", cursor: "pointer", padding: "1.5rem", transition: "background 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FAF0ED"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fff"; }}
    >
      {/* Blueprint thumbnail */}
      <div style={{ height: "6rem", background: "#E8E4DC", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 11px,#C8C3B8 11px,#C8C3B8 12px),repeating-linear-gradient(90deg,transparent,transparent 11px,#C8C3B8 11px,#C8C3B8 12px)",
          opacity: 0.3,
        }} />
        <Home size={28} color="#C8C3B8" />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.375rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 500 }}>{property.address}</h3>
        {badge}
      </div>
      <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "0.75rem" }}>
        {property.city}, {property.state} {property.zipCode}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight }}>
        <span style={{ textTransform: "uppercase" }}>{property.propertyType}</span>
        <span style={{ color: S.rust }}>View Details →</span>
      </div>
    </div>
  );
}
