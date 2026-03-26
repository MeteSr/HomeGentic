import React, { useState } from "react";
import { User, CreditCard, Bell, Lock, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { authService } from "@/services/auth";
import { PLANS } from "@/services/payment";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

type Tab = "account" | "subscription" | "notifications" | "privacy";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "account",       label: "Account",       icon: <User size={14} /> },
  { key: "subscription",  label: "Subscription",  icon: <CreditCard size={14} /> },
  { key: "notifications", label: "Notifications", icon: <Bell size={14} /> },
  { key: "privacy",       label: "Privacy",       icon: <Lock size={14} /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("account");
  const { profile, setProfile } = useAuthStore();

  return (
    <Layout>
      <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Account
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "1.5rem" }}>
          Settings
        </h1>

        <div style={{ display: "flex", gap: "1.5rem" }}>
          {/* Sidebar */}
          <div style={{ width: "12rem", flexShrink: 0, border: `1px solid ${S.rule}` }}>
            {TABS.map((t, i) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.625rem",
                  width: "100%", padding: "0.75rem 1rem",
                  borderBottom: i < TABS.length - 1 ? `1px solid ${S.rule}` : "none",
                  fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: tab === t.key ? S.rust : S.inkLight,
                  background: tab === t.key ? "#FAF0ED" : "#fff",
                  border: "none", borderBottom: i < TABS.length - 1 ? `1px solid ${S.rule}` : "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            {tab === "account"       && <AccountTab profile={profile} setProfile={setProfile} />}
            {tab === "subscription"  && <SubscriptionTab profile={profile} />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "privacy"       && <PrivacyTab />}
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
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Account Details</p>
      </div>
      <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="form-label">Role</label>
          <div style={{ padding: "0.5rem 0" }}>
            <Badge variant="info">{profile?.role ?? "Unknown"}</Badge>
          </div>
        </div>
        <div>
          <label className="form-label">Email Address</label>
          <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Phone Number</label>
          <input className="form-input" type="tel" placeholder="+1 (555) 000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button loading={loading} onClick={handleSave} icon={<CheckCircle size={14} />}>Save Changes</Button>
      </div>
    </div>
  );
}

function SubscriptionTab({ profile }: { profile: any }) {
  const currentTier = profile?.role === "Contractor" ? "ContractorPro" : "Free";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ border: `1px solid ${S.rule}`, background: "#fff" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Current Plan</p>
        </div>
        <div style={{ padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Badge variant="info" size="lg">{currentTier}</Badge>
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            {currentTier === "Free" ? "Free forever" : "Active subscription"}
          </span>
        </div>
      </div>
      <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Upgrade Plan</p>
      {PLANS.filter((p) => p.tier !== "Free" && p.tier !== currentTier).map((plan) => (
        <div key={plan.tier} style={{ border: `1px solid ${plan.tier === "Pro" ? S.rust : S.rule}`, background: "#fff", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{plan.tier}</span>
              {plan.tier === "Pro" && <Badge variant="info" size="sm">Most Popular</Badge>}
            </div>
            <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>{plan.features[0]}, {plan.features[1]}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, marginBottom: "0.5rem" }}>
              ${plan.price}<span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 400, color: S.inkLight }}>/{plan.period}</span>
            </p>
            <Button size="sm" variant={plan.tier === "Pro" ? "primary" : "outline"}>Upgrade</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
      <div>
        <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{label}</p>
        {desc && <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, marginTop: "0.125rem" }}>{desc}</p>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: "2.5rem", height: "1.25rem",
          background: value ? S.rust : S.rule,
          cursor: "pointer", position: "relative", flexShrink: 0,
        }}
      >
        <div style={{
          position: "absolute", top: "0.125rem",
          left: value ? "1.375rem" : "0.125rem",
          width: "1rem", height: "1rem",
          background: "#fff", transition: "left 0.15s",
        }} />
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [emailVerified, setEmailVerified] = useState(true);
  const [emailQuote, setEmailQuote] = useState(true);
  const [emailJob, setEmailJob] = useState(false);
  const [smsAlerts, setSmsAlerts] = useState(false);
  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Notifications</p>
      </div>
      <ToggleRow label="Email: Job Verified"   desc="When a job is verified on-chain"          value={emailVerified} onChange={setEmailVerified} />
      <ToggleRow label="Email: Quote Received" desc="When a contractor submits a quote"         value={emailQuote}    onChange={setEmailQuote} />
      <ToggleRow label="Email: Job Updates"    desc="Status changes on your jobs"               value={emailJob}      onChange={setEmailJob} />
      <ToggleRow label="SMS Alerts"            desc="Critical alerts via text message"          value={smsAlerts}     onChange={setSmsAlerts} />
      <div style={{ padding: "1.25rem" }}>
        <Button onClick={() => toast.success("Preferences saved")}>Save Preferences</Button>
      </div>
    </div>
  );
}

function PrivacyTab() {
  const [publicReport, setPublicReport] = useState(true);
  const [contractorView, setContractorView] = useState(true);
  const [analyticsShare, setAnalyticsShare] = useState(false);
  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Privacy</p>
      </div>
      <ToggleRow label="Public HomeFax Report"   desc="Allow anyone with the link to view your property history" value={publicReport}    onChange={setPublicReport} />
      <ToggleRow label="Contractor Visibility"   desc="Allow contractors to find and view your properties"       value={contractorView}  onChange={setContractorView} />
      <ToggleRow label="Share Analytics"         desc="Help improve HomeFax with anonymous usage data"           value={analyticsShare}  onChange={setAnalyticsShare} />
      <div style={{ padding: "1.25rem" }}>
        <Button onClick={() => toast.success("Privacy settings saved")}>Save Privacy Settings</Button>
      </div>
    </div>
  );
}
