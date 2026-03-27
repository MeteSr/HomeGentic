import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { propertyService, Property, VerificationLevel, SubscriptionTier } from "@/services/property";
import { useAuthStore } from "@/store/authStore";
import { Shield, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

type Tab = "verifications" | "tiers";
const TIERS: SubscriptionTier[] = ["Free", "Pro", "Premium", "ContractorPro"];

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
    <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
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
            style={{ padding: "0.375rem 0.625rem", border: `1px solid ${S.rule}`, fontSize: "0.8rem", background: "#fff", cursor: "pointer" }}
          >
            <option value="Basic">Basic (Utility Bill)</option>
            <option value="Premium">Premium (Deed / Tax Record)</option>
          </select>
        </div>
        <button
          onClick={() => act(() => onApprove(property.id, level))}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${S.sage}`, background: "#fff", color: S.sage, fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          <CheckCircle size={12} /> Approve
        </button>
        <button
          onClick={() => act(() => onReject(property.id))}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${S.rust}`, background: "#fff", color: S.rust, fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
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
    <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.5rem" }}>
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
          <div style={{ display: "flex", gap: "1px", background: S.rule }}>
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                style={{
                  flex: 1, padding: "0.5rem 0.75rem",
                  fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  cursor: "pointer",
                  border: "none",
                  background: tier === t ? S.ink : "#fff",
                  color: tier === t ? "#F4F1EB" : S.inkLight,
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
          style={{ padding: "0.625rem 1.5rem", border: `1px solid ${S.ink}`, background: S.ink, color: "#F4F1EB", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading || !principal.trim() ? "not-allowed" : "pointer", opacity: loading || !principal.trim() ? 0.6 : 1, alignSelf: "flex-start" }}
        >
          {loading ? "Saving…" : "Set Tier"}
        </button>
      </div>

      <div style={{ marginTop: "1.5rem", border: `1px solid ${S.rule}`, padding: "1rem" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>Tier limits</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1px", background: S.rule }}>
          {[
            { tier: "Free",          props: "1 property",      quotes: "3 open requests" },
            { tier: "Pro",           props: "5 properties",    quotes: "10 open requests" },
            { tier: "Premium",       props: "25 properties",   quotes: "10 open requests" },
            { tier: "ContractorPro", props: "Unlimited",       quotes: "Unlimited" },
          ].map((r) => (
            <div key={r.tier} style={{ background: "#fff", padding: "0.625rem 0.875rem" }}>
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
        <div style={{ display: "flex", gap: "1px", background: S.rule, marginBottom: "1.5rem" }}>
          <div style={{ flex: 1, background: "#fff", padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Pending Verifications</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: pending.length > 0 ? S.rust : S.ink }}>{pending.length}</span>
                {pending.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0.15rem 0.5rem", background: S.rust, color: "#fff", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Action needed
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, background: "#fff", padding: "0.875rem 1.25rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Last Refreshed</p>
            <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink }}>
              {lastRefreshed ? lastRefreshed.toLocaleTimeString() : "—"}
            </p>
          </div>
          <div style={{ background: "#fff", padding: "0.875rem 1.25rem", display: "flex", alignItems: "center" }}>
            <button
              onClick={loadPending}
              disabled={loadingPending}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: loadingPending ? S.paper : "#fff", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: loadingPending ? "not-allowed" : "pointer", color: S.inkLight, opacity: loadingPending ? 0.7 : 1 }}
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
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.875rem", border: `1px solid ${S.rule}`, background: "#fff", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", color: S.inkLight }}
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
      </div>
    </Layout>
  );
}
