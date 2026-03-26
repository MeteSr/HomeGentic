import React, { useState, useEffect } from "react";
import { User, CreditCard, Bell, Lock, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { authService } from "@/services/auth";
import { PLANS } from "@/services/payment";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

type Tab = "account" | "subscription" | "notifications" | "privacy";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "account", label: "Account", icon: <User size={16} /> },
  { key: "subscription", label: "Subscription", icon: <CreditCard size={16} /> },
  { key: "notifications", label: "Notifications", icon: <Bell size={16} /> },
  { key: "privacy", label: "Privacy", icon: <Lock size={16} /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("account");
  const { profile, setProfile } = useAuthStore();

  return (
    <Layout>
      <div style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#111827", marginBottom: "1.5rem" }}>
          Settings
        </h1>

        <div style={{ display: "flex", gap: "1.5rem" }}>
          {/* Sidebar */}
          <div
            style={{
              width: "14rem",
              flexShrink: 0,
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
              padding: "0.5rem",
              height: "fit-content",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  width: "100%",
                  padding: "0.625rem 0.875rem",
                  borderRadius: "0.625rem",
                  fontSize: "0.875rem",
                  fontWeight: tab === t.key ? 700 : 500,
                  color: tab === t.key ? "#3b82f6" : "#6b7280",
                  backgroundColor: tab === t.key ? "#eff6ff" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            {tab === "account" && <AccountTab profile={profile} setProfile={setProfile} />}
            {tab === "subscription" && <SubscriptionTab profile={profile} />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "privacy" && <PrivacyTab />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function AccountTab({ profile, setProfile }: { profile: any; setProfile: any }) {
  const [email, setEmail] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updated = await authService.updateProfile({ email, phone });
      setProfile(updated);
      toast.success("Profile updated!");
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "1rem",
        padding: "1.5rem",
      }}
    >
      <h2 style={{ fontWeight: 800, color: "#111827", marginBottom: "1.25rem" }}>Account Details</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <label className="form-label">Role</label>
          <div style={{ padding: "0.625rem 0.75rem" }}>
            <Badge variant="info">{profile?.role ?? "Unknown"}</Badge>
          </div>
        </div>
        <div>
          <label className="form-label">Email Address</label>
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Phone Number</label>
          <input
            className="form-input"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <Button loading={loading} onClick={handleSave} icon={<CheckCircle size={16} />}>
        Save Changes
      </Button>
    </div>
  );
}

function SubscriptionTab({ profile }: { profile: any }) {
  const currentTier = profile?.role === "Contractor" ? "ContractorPro" : "Free";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Current plan */}
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "1rem",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontWeight: 800, color: "#111827", marginBottom: "0.5rem" }}>Current Plan</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Badge variant="info" size="lg">
            {currentTier}
          </Badge>
          <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
            {currentTier === "Free" ? "Free forever" : "Active subscription"}
          </span>
        </div>
      </div>

      {/* Upgrade options */}
      <h3 style={{ fontWeight: 700, color: "#111827", fontSize: "0.938rem" }}>Upgrade Plan</h3>
      {PLANS.filter((p) => p.tier !== "Free" && p.tier !== currentTier).map((plan) => (
        <div
          key={plan.tier}
          style={{
            backgroundColor: "white",
            border: plan.tier === "Pro" ? "2px solid #3b82f6" : "1px solid #e5e7eb",
            borderRadius: "1rem",
            padding: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontWeight: 700, color: "#111827" }}>{plan.tier}</span>
              {plan.tier === "Pro" && <Badge variant="info" size="sm">Most Popular</Badge>}
            </div>
            <p style={{ fontSize: "0.813rem", color: "#6b7280" }}>{plan.features[0]}, {plan.features[1]}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 900, color: "#111827", fontSize: "1.125rem" }}>
              ${plan.price}
              <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#6b7280" }}>
                /{plan.period}
              </span>
            </p>
            <Button size="sm" variant={plan.tier === "Pro" ? "primary" : "outline"} style={{ marginTop: "0.375rem" }}>
              Upgrade
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.875rem 0",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <div>
        <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#111827" }}>{label}</p>
        {desc && <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{desc}</p>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: "2.75rem",
          height: "1.5rem",
          borderRadius: "9999px",
          backgroundColor: value ? "#3b82f6" : "#d1d5db",
          cursor: "pointer",
          position: "relative",
          transition: "background-color 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "0.125rem",
            left: value ? "1.375rem" : "0.125rem",
            width: "1.25rem",
            height: "1.25rem",
            borderRadius: "9999px",
            backgroundColor: "white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }}
        />
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [emailVerified, setEmailVerified] = useState(true);
  const [emailQuote, setEmailQuote] = useState(true);
  const [emailJob, setEmailJob] = useState(false);
  const [smsAlerts, setSmsAlerts] = useState(false);

  const handleSave = () => toast.success("Notification preferences saved");

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "1rem",
        padding: "1.5rem",
      }}
    >
      <h2 style={{ fontWeight: 800, color: "#111827", marginBottom: "1.25rem" }}>Notifications</h2>
      <ToggleRow
        label="Email: Job Verified"
        desc="When a job is verified on-chain"
        value={emailVerified}
        onChange={setEmailVerified}
      />
      <ToggleRow
        label="Email: Quote Received"
        desc="When a contractor submits a quote"
        value={emailQuote}
        onChange={setEmailQuote}
      />
      <ToggleRow
        label="Email: Job Updates"
        desc="Status changes on your jobs"
        value={emailJob}
        onChange={setEmailJob}
      />
      <ToggleRow
        label="SMS Alerts"
        desc="Critical alerts via text message"
        value={smsAlerts}
        onChange={setSmsAlerts}
      />
      <Button onClick={handleSave} style={{ marginTop: "1.25rem" }}>
        Save Preferences
      </Button>
    </div>
  );
}

function PrivacyTab() {
  const [publicReport, setPublicReport] = useState(true);
  const [contractorView, setContractorView] = useState(true);
  const [analyticsShare, setAnalyticsShare] = useState(false);

  const handleSave = () => toast.success("Privacy settings saved");

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "1rem",
        padding: "1.5rem",
      }}
    >
      <h2 style={{ fontWeight: 800, color: "#111827", marginBottom: "1.25rem" }}>Privacy</h2>
      <ToggleRow
        label="Public HomeFax Report"
        desc="Allow anyone with the link to view your property history"
        value={publicReport}
        onChange={setPublicReport}
      />
      <ToggleRow
        label="Contractor Visibility"
        desc="Allow contractors to find and view your properties"
        value={contractorView}
        onChange={setContractorView}
      />
      <ToggleRow
        label="Share Analytics"
        desc="Help improve HomeFax with anonymous usage data"
        value={analyticsShare}
        onChange={setAnalyticsShare}
      />
      <Button onClick={handleSave} style={{ marginTop: "1.25rem" }}>
        Save Privacy Settings
      </Button>
    </div>
  );
}
