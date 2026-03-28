import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, CreditCard, Bell, Lock, CheckCircle, LayoutDashboard, Download } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { authService } from "@/services/auth";
import { PLANS, paymentService, type PlanTier } from "@/services/payment";
import { agentProfileService, type AgentProfile } from "@/services/agentProfile";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
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
  const [email,   setEmail]   = useState(profile?.email ?? "");
  const [phone,   setPhone]   = useState(profile?.phone ?? "");
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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

      {profile?.role === "Realtor" && <AgentBrandingSection />}
      {profile?.role === "Realtor" && <AgentDashboardLink />}
    </div>
  );
}

function AgentBrandingSection() {
  const saved = agentProfileService.load();
  const [name,      setName]      = useState(saved?.name      ?? "");
  const [brokerage, setBrokerage] = useState(saved?.brokerage ?? "");
  const [phone,     setBrandPhone] = useState(saved?.phone    ?? "");
  const [logoUrl,   setLogoUrl]   = useState(saved?.logoUrl   ?? "");

  const handleSave = () => {
    agentProfileService.save({ name, brokerage, phone, logoUrl });
    toast.success("Agent branding saved");
  };

  const handleClear = () => {
    agentProfileService.clear();
    setName(""); setBrokerage(""); setBrandPhone(""); setLogoUrl("");
    toast.success("Branding cleared");
  };

  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: "#FAFAF8" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>
          Agent Co-Branding
        </p>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, fontWeight: 300 }}>
          Your branding appears on HomeFax reports you share with buyers. ICP verification remains intact.
        </p>
      </div>
      <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="form-label">Full Name</label>
          <input className="form-input" type="text" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Brokerage</label>
          <input className="form-input" type="text" placeholder="Keller Williams Austin" value={brokerage} onChange={(e) => setBrokerage(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input className="form-input" type="tel" placeholder="+1 (512) 000-0000" value={phone} onChange={(e) => setBrandPhone(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Logo URL <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, textTransform: "none", letterSpacing: 0 }}>(optional — https://)</span></label>
          <input className="form-input" type="url" placeholder="https://yourbrokerage.com/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </div>
        {/* Preview */}
        {(name || brokerage) && (
          <div style={{ border: `1px solid ${S.rule}`, padding: "0.875rem 1.25rem", background: "#F4F1EB", display: "flex", alignItems: "center", gap: "0.875rem" }}>
            {logoUrl && (
              <img src={logoUrl} alt="logo" style={{ height: "2rem", objectFit: "contain", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            <div>
              {name && <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.875rem", color: S.ink }}>{name}</p>}
              {brokerage && <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight }}>{brokerage}</p>}
              {phone && <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>{phone}</p>}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button onClick={handleSave} icon={<CheckCircle size={14} />}>Save Branding</Button>
          {saved && (
            <Button variant="outline" onClick={handleClear}>Clear</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentDashboardLink() {
  const navigate = useNavigate();
  return (
    <div style={{ border: `1px solid ${S.rule}`, marginTop: "1.5rem" }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: "#FAFAF8" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>
          Agent Dashboard
        </p>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, fontWeight: 300 }}>
          Track all share links across your client properties — view counts, expiry, and revocation.
        </p>
      </div>
      <div style={{ padding: "1.25rem" }}>
        <Button onClick={() => navigate("/agent-dashboard")} icon={<LayoutDashboard size={14} />}>
          Open Agent Dashboard
        </Button>
      </div>
    </div>
  );
}

function SubscriptionTab({ profile }: { profile: any }) {
  const navigate = useNavigate();
  const [tier,      setTier]      = useState<PlanTier>(profile?.role === "Contractor" ? "ContractorPro" : "Free");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const [upgrading, setUpgrading] = useState<PlanTier | null>(null);
  const [cancelStep, setCancelStep] = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [pauseState, setPauseState] = useState(paymentService.getPauseState());

  useEffect(() => {
    paymentService.getMySubscription().then((sub) => {
      setTier(sub.tier);
      setExpiresAt(sub.expiresAt);
    }).catch(() => {}).finally(() => setSubLoaded(true));
  }, []);

  const handlePause = (months: 1 | 2 | 3) => {
    paymentService.pause(months);
    setPauseState(paymentService.getPauseState());
    toast.success(`Subscription paused for ${months} month${months > 1 ? "s" : ""}`);
  };

  const handleResume = () => {
    paymentService.resume();
    setPauseState(null);
    toast.success("Subscription resumed");
  };

  const currentPlan = PLANS.find((p) => p.tier === tier) ?? PLANS[0];
  const isPaid      = tier !== "Free";

  const handleUpgrade = async (targetTier: PlanTier) => {
    setUpgrading(targetTier);
    try {
      await paymentService.initiate(targetTier);
      setTier(targetTier);
      setExpiresAt(Date.now() + 30 * 24 * 60 * 60 * 1000);
      toast.success(`Upgraded to ${targetTier}!`);
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  };

  const handleCancel = async () => {
    setCancelStep("loading");
    try {
      await paymentService.cancel();
      setTier("Free");
      setExpiresAt(null);
      setCancelStep("done");
    } catch (err: any) {
      toast.error(err.message || "Cancellation failed");
      setCancelStep("confirm");
    }
  };

  if (!subLoaded) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner-lg" /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Current plan */}
      <div style={{ border: `1px solid ${S.rule}`, background: "#fff" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Current Plan</p>
        </div>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Badge variant="info" size="lg">{tier}</Badge>
            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
              {!isPaid
                ? "Free forever"
                : expiresAt
                ? `Renews ${new Date(expiresAt).toLocaleDateString()}`
                : "Active subscription"}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {currentPlan.features.map((f) => (
              <span key={f} style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight, border: `1px solid ${S.rule}`, padding: "0.15rem 0.5rem", background: S.paper }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade options */}
      {PLANS.filter((p) => p.tier !== "Free" && p.tier !== tier).length > 0 && (
        <>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            {isPaid ? "Switch Plan" : "Upgrade Plan"}
          </p>
          {PLANS.filter((p) => p.tier !== "Free" && p.tier !== tier).map((plan) => (
            <div key={plan.tier} style={{ border: `1px solid ${plan.tier === "Pro" ? S.rust : S.rule}`, background: "#fff", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{plan.tier}</span>
                  {plan.tier === "Pro" && <Badge variant="info" size="sm">Most Popular</Badge>}
                </div>
                <p style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>{plan.features[0]}, {plan.features[1]}</p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, marginBottom: "0.5rem" }}>
                  ${plan.price}<span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 400, color: S.inkLight }}>/{plan.period}</span>
                </p>
                <Button
                  size="sm"
                  variant={plan.tier === "Pro" ? "primary" : "outline"}
                  loading={upgrading === plan.tier}
                  onClick={() => handleUpgrade(plan.tier)}
                >
                  {isPaid ? "Switch" : "Upgrade"}
                </Button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Pause status banner */}
      {isPaid && pauseState && (
        <div style={{ border: `1px solid #D4820E`, background: "#FEF3DC", padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8B6914", marginBottom: "0.2rem" }}>
              Subscription Paused
            </p>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: "#8B6914" }}>
              {pauseState.daysLeft} day{pauseState.daysLeft !== 1 ? "s" : ""} remaining — resumes {new Date(pauseState.pausedUntil).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={handleResume}
            style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 1rem", border: "1px solid #D4820E", background: "#fff", color: "#8B6914", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Resume now
          </button>
        </div>
      )}

      {/* Cancellation */}
      {isPaid && cancelStep !== "done" && (
        <div style={{ border: `1px solid ${S.rule}`, background: "#fff" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Cancel Subscription</p>
          </div>

          {cancelStep === "idle" && (
            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.6 }}>
                Not ready to cancel? You can pause your subscription for up to 3 months — your records and score stay active, billing stops.
              </p>
              {!pauseState && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {([1, 2, 3] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => handlePause(m)}
                      style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.4rem 0.875rem", border: "1px solid #D4820E", background: "#FEF3DC", color: "#8B6914", cursor: "pointer" }}
                    >
                      Pause {m} month{m > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "0.875rem" }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.6, marginBottom: "0.75rem" }}>
                  Cancelling will immediately downgrade your account to Free. Your records and property history will be preserved.
                </p>
                <button
                  onClick={() => setCancelStep("confirm")}
                  style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${S.rust}`, background: "none", color: S.rust, cursor: "pointer" }}
                >
                  Cancel Plan
                </button>
              </div>
            </div>
          )}

          {cancelStep === "confirm" && (
            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem", background: "#FAF0ED", border: `1px solid ${S.rust}40` }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
                  You will lose access to:
                </p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {currentPlan.features.filter((f) => !PLANS[0].features.includes(f)).map((f) => (
                    <li key={f} style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight }}>
                      — {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ padding: "0.875rem 1rem", background: "#F0F6F3", border: "1px solid #B5D4C8" }}>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: "#3D6B57", lineHeight: 1.6 }}>
                  <strong>Your ICP records are permanent.</strong> All your maintenance history, verified jobs, and blockchain records remain on the Internet Computer after cancellation.
                  You can still view them — you just won't earn new score points or get priority support.
                </p>
              </div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight }}>
                Or pause instead — keeps your account active without billing.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  onClick={handleCancel}
                  style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${S.rust}`, background: S.rust, color: "#F4F1EB", cursor: "pointer" }}
                >
                  Confirm Cancellation
                </button>
                {!pauseState && (
                  <button
                    onClick={() => { handlePause(1); setCancelStep("idle"); }}
                    style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: "1px solid #D4820E", background: "#FEF3DC", color: "#8B6914", cursor: "pointer" }}
                  >
                    Pause 1 month instead
                  </button>
                )}
                <button
                  onClick={() => setCancelStep("idle")}
                  style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${S.rule}`, background: "none", color: S.inkLight, cursor: "pointer" }}
                >
                  Keep Plan
                </button>
              </div>
            </div>
          )}

          {cancelStep === "loading" && (
            <div style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className="spinner-lg" style={{ width: "1rem", height: "1rem" }} />
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>Processing cancellation…</span>
            </div>
          )}
        </div>
      )}

      {/* Post-cancellation confirmation */}
      {cancelStep === "done" && (
        <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <CheckCircle size={16} color="#3D6B57" style={{ flexShrink: 0 }} />
          <div>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#3D6B57", marginBottom: "0.2rem" }}>
              Subscription cancelled
            </p>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
              Your account has been downgraded to Free. All your records are intact.
            </p>
          </div>
        </div>
      )}
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
  const [pulseEnabled, setPulseEnabled] = useState(() =>
    localStorage.getItem("homefax_pulse_enabled") !== "false"
  );
  const [scoreAlerts, setScoreAlerts] = useState(() =>
    localStorage.getItem("homefax_score_alerts") !== "false"
  );

  function savePrefs() {
    localStorage.setItem("homefax_pulse_enabled", pulseEnabled ? "true" : "false");
    localStorage.setItem("homefax_score_alerts", scoreAlerts ? "true" : "false");
    toast.success("Preferences saved");
  }

  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Notifications</p>
      </div>
      <ToggleRow label="Weekly Home Pulse"     desc="In-app maintenance tips on your dashboard" value={pulseEnabled}  onChange={setPulseEnabled} />
      <ToggleRow label="Score Change Alerts"   desc="Banner when your HomeFax Score increases"  value={scoreAlerts}   onChange={setScoreAlerts} />
      <ToggleRow label="Email: Job Verified"   desc="When a job is verified on-chain"           value={emailVerified} onChange={setEmailVerified} />
      <ToggleRow label="Email: Quote Received" desc="When a contractor submits a quote"         value={emailQuote}    onChange={setEmailQuote} />
      <ToggleRow label="Email: Job Updates"    desc="Status changes on your jobs"               value={emailJob}      onChange={setEmailJob} />
      <ToggleRow label="SMS Alerts"            desc="Critical alerts via text message"          value={smsAlerts}     onChange={setSmsAlerts} />
      <div style={{ padding: "1.25rem" }}>
        <Button onClick={savePrefs}>Save Preferences</Button>
      </div>
    </div>
  );
}

function PrivacyTab() {
  const [publicReport, setPublicReport] = useState(true);
  const [contractorView, setContractorView] = useState(true);
  const [analyticsShare, setAnalyticsShare] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { properties } = usePropertyStore();
  const { jobs } = useJobStore();

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        properties: properties.map((p) => ({
          id:                String(p.id),
          address:           p.address,
          city:              p.city,
          state:             p.state,
          zipCode:           p.zipCode,
          propertyType:      p.propertyType,
          yearBuilt:         String(p.yearBuilt),
          squareFeet:        String(p.squareFeet),
          verificationLevel: p.verificationLevel,
          tier:              p.tier,
          createdAt:         new Date(Number(p.createdAt) / 1_000_000).toISOString(),
        })),
        jobs: jobs.map((j) => ({
          id:             j.id,
          propertyId:     j.propertyId,
          serviceType:    j.serviceType,
          description:    j.description,
          contractorName: j.contractorName,
          amountUsd:      (j.amount / 100).toFixed(2),
          date:           j.date,
          status:         j.status,
          verified:       j.verified,
          isDiy:          j.isDiy,
          permitNumber:   j.permitNumber ?? null,
          warrantyMonths: j.warrantyMonths,
        })),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `homefax-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${S.rule}` }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}` }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>Privacy</p>
      </div>
      <ToggleRow label="Public HomeFax Report"   desc="Allow anyone with the link to view your property history" value={publicReport}    onChange={setPublicReport} />
      <ToggleRow label="Contractor Visibility"   desc="Allow contractors to find and view your properties"       value={contractorView}  onChange={setContractorView} />
      <ToggleRow label="Share Analytics"         desc="Help improve HomeFax with anonymous usage data"           value={analyticsShare}  onChange={setAnalyticsShare} />
      <div style={{ padding: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Button onClick={() => toast.success("Privacy settings saved")}>Save Privacy Settings</Button>
      </div>

      {/* Data Export */}
      <div style={{ borderTop: `1px solid ${S.rule}`, padding: "1.25rem" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
          Export Your Data
        </p>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.6, marginBottom: "1rem" }}>
          Download all your property and job records as JSON. Your data is yours — no lock-in,
          no expiration. Records are also permanently stored on the Internet Computer blockchain.
        </p>
        <Button
          loading={exporting}
          onClick={handleExport}
          icon={<Download size={13} />}
          variant="outline"
        >
          Download My Data (JSON)
        </Button>
        <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: S.inkLight, marginTop: "0.5rem", lineHeight: 1.5 }}>
          Includes {properties.length} propert{properties.length !== 1 ? "ies" : "y"} and {jobs.length} job record{jobs.length !== 1 ? "s" : ""}.
        </p>
      </div>
    </div>
  );
}
