import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { propertyService, Property, VerificationLevel, SubscriptionTier } from "@/services/property";
import { useAuthStore } from "@/store/authStore";
import {
  Shield, CheckCircle, XCircle, User, RefreshCw,
  AlertCircle, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "verifications" | "tiers";

const TIERS: SubscriptionTier[] = ["Free", "Pro", "Premium", "ContractorPro"];

const TIER_COLORS: Record<SubscriptionTier, { bg: string; color: string }> = {
  Free:          { bg: "#F3F4F6", color: "#374151" },
  Pro:           { bg: "#DBEAFE", color: "#1D4ED8" },
  Premium:       { bg: "#EDE9FE", color: "#6D28D9" },
  ContractorPro: { bg: "#D1FAE5", color: "#065F46" },
};

// ─── Verification Card ────────────────────────────────────────────────────────

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
    <div style={{
      backgroundColor: "white", border: "1px solid #E5E7EB",
      borderRadius: "1rem", padding: "1.5rem",
      display: "flex", flexDirection: "column", gap: "1rem",
    }}>
      {/* Property info */}
      <div>
        <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: "0.25rem" }}>
          {property.address}, {property.city}, {property.state} {property.zipCode}
        </p>
        <p style={{ fontSize: "0.8rem", color: "#6B7280" }}>
          ID: {String(property.id)} · Owner: <code style={{ fontSize: "0.75rem", backgroundColor: "#F3F4F6", padding: "0.1rem 0.3rem", borderRadius: "0.25rem" }}>{property.owner}</code>
        </p>
        <p style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "0.25rem" }}>
          Built: {String(property.yearBuilt)} · {String(property.squareFeet)} sq ft · {property.propertyType}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "#374151", fontWeight: 600 }}>Approve as:</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as "Basic" | "Premium")}
            disabled={loading}
            style={{
              padding: "0.375rem 0.625rem", borderRadius: "0.5rem",
              border: "1px solid #D1D5DB", fontSize: "0.8rem",
              backgroundColor: "white", cursor: "pointer",
            }}
          >
            <option value="Basic">Basic (Utility Bill)</option>
            <option value="Premium">Premium (Deed / Tax Record)</option>
          </select>
        </div>

        <button
          onClick={() => act(() => onApprove(property.id, level))}
          disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.375rem",
            padding: "0.5rem 1rem", borderRadius: "0.5rem",
            backgroundColor: "#16A34A", color: "white",
            border: "none", fontSize: "0.8rem", fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <CheckCircle size={14} /> Approve
        </button>

        <button
          onClick={() => act(() => onReject(property.id))}
          disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.375rem",
            padding: "0.5rem 1rem", borderRadius: "0.5rem",
            backgroundColor: "#DC2626", color: "white",
            border: "none", fontSize: "0.8rem", fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <XCircle size={14} /> Reject
        </button>
      </div>
    </div>
  );
}

// ─── Tier Manager ─────────────────────────────────────────────────────────────

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
    <div style={{
      backgroundColor: "white", border: "1px solid #E5E7EB",
      borderRadius: "1rem", padding: "1.5rem",
    }}>
      <h3 style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: "1.25rem" }}>
        Set Subscription Tier
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "32rem" }}>
        <label style={{ fontSize: "0.85rem" }}>
          <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.375rem" }}>
            User Principal
          </span>
          <input
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="abc12-xyz34-..."
            style={{
              width: "100%", padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem", border: "1px solid #D1D5DB",
              fontSize: "0.85rem", fontFamily: "monospace", boxSizing: "border-box",
            }}
          />
        </label>

        <label style={{ fontSize: "0.85rem" }}>
          <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.375rem" }}>
            Tier
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                style={{
                  padding: "0.5rem 1rem", borderRadius: "9999px",
                  fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                  border: tier === t ? "2px solid #1D4ED8" : "2px solid #E5E7EB",
                  backgroundColor: tier === t ? TIER_COLORS[t].bg : "white",
                  color: tier === t ? TIER_COLORS[t].color : "#6B7280",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </label>

        <button
          onClick={handleSet}
          disabled={loading || !principal.trim()}
          style={{
            padding: "0.625rem 1.5rem", borderRadius: "0.5rem",
            backgroundColor: "#1D4ED8", color: "white",
            border: "none", fontSize: "0.875rem", fontWeight: 600,
            cursor: loading || !principal.trim() ? "not-allowed" : "pointer",
            opacity: loading || !principal.trim() ? 0.6 : 1,
            alignSelf: "flex-start",
          }}
        >
          {loading ? "Saving…" : "Set Tier"}
        </button>
      </div>

      <div style={{
        marginTop: "1.5rem", padding: "0.875rem",
        backgroundColor: "#F9FAFB", borderRadius: "0.75rem",
        border: "1px solid #E5E7EB",
      }}>
        <p style={{ fontSize: "0.78rem", color: "#6B7280", marginBottom: "0.5rem", fontWeight: 600 }}>
          Tier limits
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.375rem" }}>
          {[
            { tier: "Free",          props: "1 property",      quotes: "3 open requests" },
            { tier: "Pro",           props: "5 properties",    quotes: "10 open requests" },
            { tier: "Premium",       props: "25 properties",   quotes: "10 open requests" },
            { tier: "ContractorPro", props: "Unlimited",       quotes: "Unlimited" },
          ].map((r) => (
            <div key={r.tier} style={{
              padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
              backgroundColor: TIER_COLORS[r.tier as SubscriptionTier].bg,
            }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: TIER_COLORS[r.tier as SubscriptionTier].color }}>
                {r.tier}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#6B7280" }}>{r.props} · {r.quotes}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { isAuthenticated, principal } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("verifications");
  const [pending, setPending] = useState<Property[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Check admin access on mount
  useEffect(() => {
    if (!principal) return;
    propertyService.isAdmin(principal)
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false));
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
    }
  };

  useEffect(() => {
    if (isAdmin && tab === "verifications") loadPending();
  }, [isAdmin, tab]);

  // Still checking
  if (!isAuthenticated || isAdmin === null) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  // Not an admin
  if (isAdmin === false) {
    return <Navigate to="/dashboard" replace />;
  }

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <Shield size={20} color="#1D4ED8" />
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827" }}>Admin Dashboard</h1>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#6B7280" }}>
              Principal: <code style={{ fontSize: "0.78rem", backgroundColor: "#F3F4F6", padding: "0.1rem 0.4rem", borderRadius: "0.25rem" }}>{principal}</code>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", marginBottom: "1.5rem" }}>
          {([
            { id: "verifications", label: `Verifications${pending.length > 0 ? ` (${pending.length})` : ""}` },
            { id: "tiers",         label: "Subscription Tiers" },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600,
                border: "none", borderBottom: tab === t.id ? "2px solid #1D4ED8" : "2px solid transparent",
                color: tab === t.id ? "#1D4ED8" : "#6B7280",
                backgroundColor: "transparent", cursor: "pointer",
                marginBottom: "-1px",
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
              <p style={{ fontSize: "0.875rem", color: "#6B7280" }}>
                Properties awaiting ownership verification review.
              </p>
              <button
                onClick={loadPending}
                disabled={loadingPending}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.375rem 0.875rem", borderRadius: "0.5rem",
                  border: "1px solid #E5E7EB", backgroundColor: "white",
                  fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", color: "#374151",
                }}
              >
                <RefreshCw size={13} style={{ animation: loadingPending ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>

            {loadingPending ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                <div className="spinner-lg" />
              </div>
            ) : pending.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "3rem",
                backgroundColor: "white", border: "1px solid #E5E7EB", borderRadius: "1rem",
              }}>
                <CheckCircle size={36} color="#D1D5DB" style={{ margin: "0 auto 0.75rem" }} />
                <p style={{ color: "#6B7280", fontWeight: 600 }}>No pending verifications</p>
                <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>All caught up!</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {pending.map((p) => (
                  <VerificationCard
                    key={String(p.id)}
                    property={p}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tiers tab */}
        {tab === "tiers" && <TierManager />}
      </div>
    </Layout>
  );
}
