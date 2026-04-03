import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { propertyService, Property, VerificationLevel, SubscriptionTier } from "@/services/property";
import { monitoringService, CanisterMetrics, runwayDays, cyclesToUsd } from "@/services/monitoringService";
import { useAuthStore } from "@/store/authStore";
import { Shield, CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";

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

type Tab = "verifications" | "tiers" | "cycles";
const TIERS: SubscriptionTier[] = ["Free", "Pro", "Premium", "ContractorPro"];

// ─── 13.6.3: Cycles burn rate dashboard ──────────────────────────────────────

const RUNWAY_WARN_DAYS  = 30;   // orange alert
const RUNWAY_CRIT_DAYS  = 7;    // red alert

function runwayColor(days: number | null): string {
  if (days === null) return S.inkLight;
  if (days < RUNWAY_CRIT_DAYS)  return S.rust;
  if (days < RUNWAY_WARN_DAYS)  return "#d97706";
  return "#16a34a";
}

function formatCycles(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  return `${n}`;
}

function CyclesDashboard() {
  const [metrics,  setMetrics]  = useState<CanisterMetrics[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [critCount, setCritCount] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [all, mon] = await Promise.all([
        monitoringService.getAllCanisterMetrics(),
        monitoringService.getMetrics(),
      ]);
      setMetrics(all);
      setCritCount(mon.criticalAlerts);
    } catch {
      toast.error("Failed to load monitoring data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading || !metrics) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  const totalBalance = metrics.reduce((s, m) => s + m.cyclesBalance, 0);
  const totalBurn    = metrics.reduce((s, m) => s + m.cyclesBurned,  0);
  const minRunway    = metrics
    .map((m) => runwayDays(m.cyclesBalance, m.cyclesBurned))
    .filter((d): d is number => d !== null)
    .reduce((min, d) => Math.min(min, d), Infinity);

  const atRisk = metrics.filter((m) => {
    const d = runwayDays(m.cyclesBalance, m.cyclesBurned);
    return d !== null && d < RUNWAY_WARN_DAYS;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        {[
          { label: "Total Balance",     value: formatCycles(totalBalance),             sub: `$${cyclesToUsd(totalBalance).toFixed(2)} USD` },
          { label: "Daily Burn (est.)", value: formatCycles(totalBurn),                sub: `$${cyclesToUsd(totalBurn).toFixed(4)}/day` },
          { label: "Min Runway",        value: isFinite(minRunway) ? `${Math.floor(minRunway)}d` : "—", sub: minRunway < RUNWAY_WARN_DAYS ? "⚠ Top-up needed" : "Safe" },
          { label: "Critical Alerts",   value: String(critCount),                       sub: critCount > 0 ? "Review alerts" : "All clear" },
        ].map((c) => (
          <div key={c.label} style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "0.875rem 1.25rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>{c.label}</p>
            <p style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.4rem", lineHeight: 1, color: S.ink }}>{c.value}</p>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.25rem" }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* At-risk banner */}
      {atRisk.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1.25rem", border: `1px solid #d97706`, background: "#fffbeb" }}>
          <AlertTriangle size={16} color="#d97706" />
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: "#92400e" }}>
            {atRisk.length} canister{atRisk.length > 1 ? "s" : ""} below {RUNWAY_WARN_DAYS}-day runway — top up cycles soon.
          </span>
        </div>
      )}

      {/* Per-canister table */}
      <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            Per-Canister Cycles
          </span>
          <button
            onClick={load}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.875rem", border: `1px solid ${S.rule}`, background: COLORS.white, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", color: S.inkLight }}
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: S.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${S.rule}` }}>
              {["Canister", "Balance", "Daily Burn", "Runway", "Memory", "Error Rate"].map((h) => (
                <th key={h} style={{ padding: "0.625rem 1rem", textAlign: "left", fontWeight: 400, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics
              .slice()
              .sort((a, b) => {
                const da = runwayDays(a.cyclesBalance, a.cyclesBurned) ?? Infinity;
                const db = runwayDays(b.cyclesBalance, b.cyclesBurned) ?? Infinity;
                return da - db;   // lowest runway first
              })
              .map((m) => {
                const runway = runwayDays(m.cyclesBalance, m.cyclesBurned);
                const errRate = m.requestCount > 0 ? ((m.errorCount / m.requestCount) * 100).toFixed(1) + "%" : "—";
                const memPct = m.memoryCapacity > 0 ? ((m.memoryBytes / m.memoryCapacity) * 100).toFixed(0) + "%" : "—";
                const rowAlert = runway !== null && runway < RUNWAY_CRIT_DAYS;

                return (
                  <tr
                    key={m.canisterId}
                    style={{ borderBottom: `1px solid ${S.rule}`, background: rowAlert ? "#fff1f2" : "transparent" }}
                  >
                    <td style={{ padding: "0.625rem 1rem", fontSize: "0.65rem", color: S.ink }}>
                      <code style={{ fontSize: "0.6rem" }}>{m.canisterId.slice(0, 18)}…</code>
                    </td>
                    <td style={{ padding: "0.625rem 1rem", color: S.ink }}>
                      {formatCycles(m.cyclesBalance)}
                    </td>
                    <td style={{ padding: "0.625rem 1rem", color: S.inkLight }}>
                      {formatCycles(m.cyclesBurned)}/day
                    </td>
                    <td style={{ padding: "0.625rem 1rem", fontWeight: 600, color: runwayColor(runway) }}>
                      {runway !== null ? `${Math.floor(runway)}d` : "—"}
                      {runway !== null && runway < RUNWAY_WARN_DAYS && " ⚠"}
                    </td>
                    <td style={{ padding: "0.625rem 1rem", color: S.inkLight }}>{memPct}</td>
                    <td style={{ padding: "0.625rem 1rem", color: m.errorCount > 0 ? S.rust : S.inkLight }}>{errRate}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight }}>
        Daily burn estimated from last snapshot window. Alert threshold: {RUNWAY_WARN_DAYS}-day runway.
        Sorted by lowest runway first.
      </p>
    </div>
  );
}

function VerificationCard({
  property,
  onApprove,
  onReject,
}: {
  property: Property;
  onApprove: (id: bigint, level: "Basic" | "Premium") => Promise<void>;
  onReject: (id: bigint) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<"Basic" | "Premium">("Basic");

  const act = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  };

  return (
    <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <p style={{ fontWeight: 700, fontSize: "0.95rem", color: S.ink, marginBottom: "0.25rem" }}>
          {property.address}, {property.city}, {property.state} {property.zipCode}
        </p>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
          ID: {String(property.id)} · Owner: <code style={{ fontSize: "0.7rem", background: S.paper, padding: "0.1rem 0.3rem" }}>{property.owner}</code>
        </p>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.25rem" }}>
          Built: {String(property.yearBuilt)} · {String(property.squareFeet)} sq ft · {property.propertyType}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>Approve as:</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as "Basic" | "Premium")}
            disabled={loading}
            style={{ padding: "0.375rem 0.625rem", border: `1px solid ${S.rule}`, fontSize: "0.8rem", background: COLORS.white, cursor: "pointer" }}
          >
            <option value="Basic">Basic (Utility Bill)</option>
            <option value="Premium">Premium (Deed / Tax Record)</option>
          </select>
        </div>
        <button
          onClick={() => act(() => onApprove(property.id, level))}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${S.sage}`, background: COLORS.white, color: S.sage, fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          <CheckCircle size={12} /> Approve
        </button>
        <button
          onClick={() => act(() => onReject(property.id))}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${S.rust}`, background: COLORS.white, color: S.rust, fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          <XCircle size={12} /> Reject
        </button>
      </div>
    </div>
  );
}

function TierManager() {
  const [principal, setPrincipal] = useState("");
  const [tier, setTier] = useState<SubscriptionTier>("Pro");
  const [loading, setLoading] = useState(false);

  const handleSet = async () => {
    if (!principal.trim()) { toast.error("Enter a principal"); return; }
    setLoading(true);
    try {
      await propertyService.setTier(principal.trim(), tier);
      toast.success(`Set ${principal.trim().slice(0, 12)}… to ${tier}`);
      setPrincipal("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to set tier");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.5rem" }}>
      <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1.25rem" }}>
        Set Subscription Tier
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "32rem" }}>
        <div>
          <label className="form-label">User Principal</label>
          <input
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="abc12-xyz34-..."
            className="form-input"
            style={{ fontFamily: S.mono }}
          />
        </div>

        <div>
          <label className="form-label" style={{ display: "block", marginBottom: "0.5rem" }}>Tier</label>
          <div style={{ display: "flex", gap: "1rem" }}>
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                style={{
                  flex: 1, padding: "0.5rem 0.75rem",
                  fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  cursor: "pointer",
                  border: `1px solid ${S.rule}`,
                  background: tier === t ? S.ink : COLORS.white,
                  color: tier === t ? COLORS.white : S.inkLight,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSet}
          disabled={loading || !principal.trim()}
          style={{ padding: "0.625rem 1.5rem", border: `1px solid ${S.ink}`, background: S.ink, color: COLORS.white, fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading || !principal.trim() ? "not-allowed" : "pointer", opacity: loading || !principal.trim() ? 0.6 : 1, alignSelf: "flex-start" }}
        >
          {loading ? "Saving…" : "Set Tier"}
        </button>
      </div>

      <div style={{ marginTop: "1.5rem", border: `1px solid ${S.rule}`, padding: "1rem" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>Tier limits</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
          {[
            { tier: "Free",          props: "1 property",      quotes: "3 open requests" },
            { tier: "Pro",           props: "5 properties",    quotes: "10 open requests" },
            { tier: "Premium",       props: "25 properties",   quotes: "10 open requests" },
            { tier: "ContractorPro", props: "Unlimited",       quotes: "Unlimited" },
          ].map((r) => (
            <div key={r.tier} style={{ background: COLORS.white, padding: "0.625rem 0.875rem", border: `1px solid ${S.rule}` }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.ink, fontWeight: 700 }}>{r.tier}</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{r.props} · {r.quotes}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { isAuthenticated, principal } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("verifications");
  const [pending, setPending] = useState<Property[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    if (!principal) return;
    propertyService.isAdmin(principal).then(setIsAdmin).catch(() => setIsAdmin(false));
  }, [principal]);

  const loadPending = async () => {
    setLoadingPending(true);
    try {
      const props = await propertyService.getPendingVerifications();
      setPending(props);
    } catch {
      toast.error("Failed to load pending verifications");
    } finally {
      setLoadingPending(false);
      setLastRefreshed(new Date());
    }
  };

  useEffect(() => {
    if (isAdmin && tab === "verifications") loadPending();
  }, [isAdmin, tab]);

  if (!isAuthenticated || isAdmin === null) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  if (isAdmin === false) return <Navigate to="/dashboard" replace />;

  const handleApprove = async (id: bigint, level: "Basic" | "Premium") => {
    await propertyService.verifyProperty(id, level as VerificationLevel);
    toast.success(`Property approved as ${level}`);
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const handleReject = async (id: bigint) => {
    await propertyService.verifyProperty(id, "Unverified");
    toast.success("Property rejected — returned to Unverified");
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <Layout>
      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
              Admin
            </div>
            <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem" }}>
              Admin Dashboard
            </h1>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
              Principal: <code style={{ background: S.paper, padding: "0.1rem 0.4rem" }}>{principal}</code>
            </p>
          </div>
        </div>

        {/* Metrics bar */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ flex: 1, background: COLORS.white, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", border: `1px solid ${S.rule}` }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Pending Verifications</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: pending.length > 0 ? S.rust : S.ink }}>{pending.length}</span>
                {pending.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0.15rem 0.5rem", background: S.rust, color: COLORS.white, fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Action needed
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, background: COLORS.white, padding: "0.875rem 1.25rem", border: `1px solid ${S.rule}` }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Last Refreshed</p>
            <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink }}>
              {lastRefreshed ? lastRefreshed.toLocaleTimeString() : "—"}
            </p>
          </div>
          <div style={{ background: COLORS.white, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", border: `1px solid ${S.rule}` }}>
            <button
              onClick={loadPending}
              disabled={loadingPending}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: loadingPending ? S.paper : COLORS.white, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: loadingPending ? "not-allowed" : "pointer", color: S.inkLight, opacity: loadingPending ? 0.7 : 1 }}
            >
              <RefreshCw size={11} style={{ animation: loadingPending ? "spin 1s linear infinite" : "none" }} />
              {loadingPending ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
          {([
            { id: "verifications", label: `Verifications${pending.length > 0 ? ` (${pending.length})` : ""}` },
            { id: "tiers",         label: "Subscription Tiers" },
            { id: "cycles",        label: "Cycles & Health" },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "0.625rem 1.25rem",
                fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                color: tab === t.id ? S.rust : S.inkLight,
                border: "none", borderBottom: tab === t.id ? `2px solid ${S.rust}` : "2px solid transparent",
                background: "transparent", cursor: "pointer", marginBottom: "-1px",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Verifications tab */}
        {tab === "verifications" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
                Properties awaiting ownership verification review.
              </p>
              <button
                onClick={loadPending}
                disabled={loadingPending}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.875rem", border: `1px solid ${S.rule}`, background: COLORS.white, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", color: S.inkLight }}
              >
                <RefreshCw size={11} style={{ animation: loadingPending ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>

            {loadingPending ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                <div className="spinner-lg" />
              </div>
            ) : pending.length === 0 ? (
              <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
                <CheckCircle size={32} color={S.rule} style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>No pending verifications. All caught up!</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {pending.map((p) => (
                  <VerificationCard key={String(p.id)} property={p} onApprove={handleApprove} onReject={handleReject} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "tiers" && <TierManager />}

        {tab === "cycles" && <CyclesDashboard />}
      </div>
    </Layout>
  );
}
