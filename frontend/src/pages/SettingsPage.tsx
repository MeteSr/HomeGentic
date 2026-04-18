import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User, CreditCard, Bell, Lock, CheckCircle, LayoutDashboard, Download } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { authService } from "@/services/auth";
import { PLANS, type PlanTier } from "@/services/planConstants";
import { paymentService } from "@/services/payment";
import { winBackService } from "@/services/winBackService";
import { agentProfileService, type AgentProfile } from "@/services/agentProfile";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
import toast from "react-hot-toast";
import UpgradeModal from "@/components/UpgradeModal";
import { COLORS, FONTS, RADIUS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { isValidEmail, isValidPhone, isValidHttpsUrl } from "@/utils/validators";

type Tab = "account" | "subscription" | "notifications" | "privacy";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "account",       label: "Account",       icon: <User size={14} /> },
  { key: "subscription",  label: "Subscription",  icon: <CreditCard size={14} /> },
  { key: "notifications", label: "Notifications", icon: <Bell size={14} /> },
  { key: "privacy",       label: "Privacy",       icon: <Lock size={14} /> },
];

// ── Shared section primitives ─────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1rem", color: COLORS.plum, margin: "0 0 1rem" }}>
      {children}
    </h3>
  );
}

function SectionDivider() {
  return <div style={{ borderTop: `1px solid ${COLORS.rule}`, margin: "1.75rem 0" }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontFamily: FONTS.sans, fontWeight: 500, fontSize: "0.875rem", color: COLORS.plum, marginBottom: "0.375rem" }}>
      {children}
    </label>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "account";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : "account");
  const { profile, setProfile } = useAuthStore();
  const { isMobile } = useBreakpoint();

  return (
    <Layout>
      <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem" }}>

        <h1 style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2rem", color: COLORS.plum, marginBottom: "2rem" }}>
          Settings
        </h1>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: "2.5rem" }}>

          {/* Sidebar */}
          <nav style={{ width: isMobile ? "100%" : "11rem", flexShrink: 0 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.625rem",
                  width: "100%", padding: "0.5rem 0.75rem",
                  fontFamily: FONTS.sans, fontSize: "0.9375rem",
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? COLORS.plum : COLORS.plumMid,
                  background: tab === t.key ? COLORS.butter : "transparent",
                  border: "none",
                  borderRadius: RADIUS.sm,
                  cursor: "pointer", textAlign: "left",
                  marginBottom: "0.125rem",
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {tab === "account"       && <AccountTab profile={profile} setProfile={setProfile} />}
            {tab === "subscription"  && <SubscriptionTab profile={profile} />}
            {tab === "notifications" && (profile?.role === "Contractor" ? <ContractorNotificationsTab /> : <NotificationsTab />)}
            {tab === "privacy"       && (profile?.role === "Contractor" ? <ContractorPrivacyTab />      : <PrivacyTab />)}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ── Account tab ───────────────────────────────────────────────────────────────

function AccountTab({ profile, setProfile }: { profile: any; setProfile: any }) {
  const [email,   setEmail]   = useState(profile?.email ?? "");
  const [phone,   setPhone]   = useState(profile?.phone ?? "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (email && !isValidEmail(email)) { toast.error("Enter a valid email address"); return; }
    if (phone && !isValidPhone(phone)) { toast.error("Enter a valid phone number"); return; }
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
    <div>
      <SectionHeading>Account Details</SectionHeading>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <FieldLabel>Role</FieldLabel>
          <div style={{ paddingTop: "0.125rem" }}>
            <Badge variant="info">{profile?.role ?? "Unknown"}</Badge>
          </div>
        </div>
        <div>
          <FieldLabel>Email Address</FieldLabel>
          <input className="form-input" type="email" placeholder="you@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={email && !isValidEmail(email) ? { borderColor: COLORS.rust } : undefined}
          />
          {email && !isValidEmail(email) && (
            <p style={{ color: COLORS.rust, fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Enter a valid email address</p>
          )}
        </div>
        <div>
          <FieldLabel>Phone Number</FieldLabel>
          <input className="form-input" type="tel" placeholder="+1 (555) 000-0000" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={phone && !isValidPhone(phone) ? { borderColor: COLORS.rust } : undefined}
          />
          {phone && !isValidPhone(phone) && (
            <p style={{ color: COLORS.rust, fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Enter a valid phone number</p>
          )}
        </div>
        <div>
          <Button loading={loading} onClick={handleSave} icon={<CheckCircle size={14} />}>Save Changes</Button>
        </div>
      </div>

      {profile?.role === "Realtor" && (
        <>
          <SectionDivider />
          <AgentBrandingSection />
          <SectionDivider />
          <AgentDashboardLink />
        </>
      )}
    </div>
  );
}

// ── Agent branding ────────────────────────────────────────────────────────────

function AgentBrandingSection() {
  const saved = agentProfileService.load();
  const [name,      setName]      = useState(saved?.name      ?? "");
  const [brokerage, setBrokerage] = useState(saved?.brokerage ?? "");
  const [phone,     setBrandPhone] = useState(saved?.phone    ?? "");
  const [logoUrl,   setLogoUrl]   = useState(saved?.logoUrl   ?? "");

  const handleSave = () => {
    if (phone && !isValidPhone(phone)) { toast.error("Enter a valid phone number"); return; }
    if (logoUrl && !isValidHttpsUrl(logoUrl)) { toast.error("Logo URL must start with https://"); return; }
    agentProfileService.save({ name, brokerage, phone, logoUrl });
    toast.success("Agent branding saved");
  };

  const handleClear = () => {
    agentProfileService.clear();
    setName(""); setBrokerage(""); setBrandPhone(""); setLogoUrl("");
    toast.success("Branding cleared");
  };

  return (
    <div>
      <SectionHeading>Agent Co-Branding</SectionHeading>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, marginBottom: "1.25rem", fontWeight: 300 }}>
        Your branding appears on HomeGentic reports you share with buyers. ICP verification remains intact.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <FieldLabel>Full Name</FieldLabel>
          <input className="form-input" type="text" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Brokerage</FieldLabel>
          <input className="form-input" type="text" placeholder="Keller Williams Austin" value={brokerage} onChange={(e) => setBrokerage(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Phone</FieldLabel>
          <input className="form-input" type="tel" placeholder="+1 (512) 000-0000" value={phone}
            onChange={(e) => setBrandPhone(e.target.value)}
            style={phone && !isValidPhone(phone) ? { borderColor: COLORS.rust } : undefined}
          />
          {phone && !isValidPhone(phone) && (
            <p style={{ color: COLORS.rust, fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Enter a valid phone number</p>
          )}
        </div>
        <div>
          <FieldLabel>
            Logo URL{" "}
            <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid, fontWeight: 400 }}>(optional — https://)</span>
          </FieldLabel>
          <input className="form-input" type="url" placeholder="https://yourbrokerage.com/logo.png" value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            style={logoUrl && !isValidHttpsUrl(logoUrl) ? { borderColor: COLORS.rust } : undefined}
          />
          {logoUrl && !isValidHttpsUrl(logoUrl) && (
            <p style={{ color: COLORS.rust, fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: FONTS.sans }}>Must be a valid https:// URL</p>
          )}
        </div>

        {(name || brokerage) && (
          <div style={{ background: COLORS.butter, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
            {logoUrl && isValidHttpsUrl(logoUrl) && (
              <img src={logoUrl} alt="logo" style={{ height: "2rem", objectFit: "contain", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            <div>
              {name && <p style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "0.875rem", color: COLORS.plum }}>{name}</p>}
              {brokerage && <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid }}>{brokerage}</p>}
              {phone && <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid }}>{phone}</p>}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button onClick={handleSave} icon={<CheckCircle size={14} />}>Save Branding</Button>
          {saved && <Button variant="outline" onClick={handleClear}>Clear</Button>}
        </div>
      </div>
    </div>
  );
}

function AgentDashboardLink() {
  const navigate = useNavigate();
  return (
    <div>
      <SectionHeading>Agent Dashboard</SectionHeading>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, marginBottom: "1rem", fontWeight: 300 }}>
        Track all share links across your client properties — view counts, expiry, and revocation.
      </p>
      <Button onClick={() => navigate("/agent-dashboard")} icon={<LayoutDashboard size={14} />}>
        Open Agent Dashboard
      </Button>
    </div>
  );
}

// ── Subscription tab ──────────────────────────────────────────────────────────

function SubscriptionTab({ profile }: { profile: any }) {
  const navigate = useNavigate();
  const [tier,             setTier]             = useState<PlanTier>(profile?.role === "Contractor" ? "ContractorPro" : "Free");
  const [expiresAt,        setExpiresAt]        = useState<number | null>(null);
  const [cancelledAt,      setCancelledAt]      = useState<number | null>(null);
  const [subLoaded,        setSubLoaded]        = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [cancelStep,       setCancelStep]       = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [pauseState,       setPauseState]       = useState(paymentService.getPauseState());

  useEffect(() => {
    paymentService.getMySubscription().then((sub) => {
      setTier(sub.tier);
      setExpiresAt(sub.expiresAt);
      if (sub.cancelledAt) {
        setCancelledAt(sub.cancelledAt);
        setCancelStep("done");
      }
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

  const handleCancel = async () => {
    setCancelStep("loading");
    try {
      const { expiresAt: accessEndsAt } = await paymentService.cancel();
      paymentService.recordCancellation();
      winBackService.schedule(Date.now());
      setCancelledAt(accessEndsAt);
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
    <div>
      <SectionHeading>Current Plan</SectionHeading>

      {!isPaid ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", color: COLORS.plum }}>Free</span>
              <Badge variant="default" size="sm">Active</Badge>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", padding: "0.55rem 1.25rem", border: "none", background: COLORS.plum, color: COLORS.white, cursor: "pointer", borderRadius: RADIUS.sm }}
            >
              {profile?.role === "Contractor" ? "Upgrade to ContractorPro →" : "Upgrade to Pro →"}
            </button>
          </div>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, marginBottom: "0.75rem" }}>
            Upgrade to unlock:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem 1.5rem" }}>
            {(profile?.role === "Contractor"
              ? ["Contractor profile listing", "Lead notifications", "Job completion certificates", "Trust score display", "Customer reviews", "Earnings dashboard"]
              : ["Score Breakdown", "Warranty Wallet", "Recurring Services", "Market Intelligence", "Insurance Defense Mode", "5-Year Maintenance Calendar"]
            ).map((f) => (
              <span key={f} style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: COLORS.plumMid, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Lock size={10} /> {f}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <Badge variant="info" size="lg">{tier}</Badge>
            <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: expiresAt && expiresAt < Date.now() ? COLORS.rust : cancelledAt ? COLORS.rust : COLORS.plumMid }}>
              {expiresAt && expiresAt < Date.now()
                ? "Expired"
                : cancelledAt
                  ? `Cancelled — access ends ${new Date(expiresAt!).toLocaleDateString()}`
                  : expiresAt
                    ? `Renews ${new Date(expiresAt).toLocaleDateString()}`
                    : "Active subscription"}
            </span>
          </div>
          {expiresAt && expiresAt < Date.now() && (
            <button
              onClick={() => setShowUpgradeModal(true)}
              aria-label={`Renew ${tier}`}
              style={{ background: COLORS.rust, color: COLORS.white, border: "none", padding: "0.45rem 1rem", fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", borderRadius: RADIUS.sm, marginBottom: "0.75rem" }}
            >
              Renew →
            </button>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {currentPlan.features.map((f) => (
              <span key={f} style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumMid, background: COLORS.butter, padding: "0.2rem 0.625rem", borderRadius: RADIUS.sm }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade options */}
      {PLANS.filter((p) => {
        if (p.tier === "Free" || p.tier === tier) return false;
        if (profile?.role === "Contractor") return p.tier === "ContractorPro";
        return p.tier !== "ContractorPro" && p.tier !== "ContractorFree";
      }).length > 0 && (
        <>
          <SectionDivider />
          <SectionHeading>{isPaid ? "Switch Plan" : "Upgrade Plan"}</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {PLANS.filter((p) => {
              if (p.tier === "Free" || p.tier === tier) return false;
              if (profile?.role === "Contractor") return p.tier === "ContractorPro";
              return p.tier !== "ContractorPro";
            }).map((plan) => (
              <div key={plan.tier} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1rem", background: plan.tier === "Pro" ? COLORS.butter : COLORS.white, borderRadius: RADIUS.sm }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                    <span style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: COLORS.plum }}>{plan.tier}</span>
                    {plan.tier === "Pro" && <Badge variant="info" size="sm">Most Popular</Badge>}
                  </div>
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: COLORS.plumMid, fontWeight: 300 }}>{plan.features[0]}, {plan.features[1]}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, marginBottom: "0.5rem", color: COLORS.plum }}>
                    ${plan.price}<span style={{ fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 400, color: COLORS.plumMid }}>/{plan.period}</span>
                  </p>
                  <Button size="sm" variant={plan.tier === "Pro" ? "primary" : "outline"} onClick={() => setShowUpgradeModal(true)}>
                    {isPaid ? "Switch" : "Upgrade"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pause status */}
      {isPaid && pauseState && (
        <>
          <SectionDivider />
          <SectionHeading>Subscription Paused</SectionHeading>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid }}>
              {pauseState.daysLeft} day{pauseState.daysLeft !== 1 ? "s" : ""} remaining — resumes {new Date(pauseState.pausedUntil).toLocaleDateString()}
            </p>
            <button
              onClick={handleResume}
              style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, padding: "0.4rem 1rem", border: `1px solid ${COLORS.rule}`, background: COLORS.white, color: COLORS.plumMid, cursor: "pointer", borderRadius: RADIUS.sm, whiteSpace: "nowrap" }}
            >
              Resume now
            </button>
          </div>
        </>
      )}

      {/* Cancellation */}
      {isPaid && cancelStep !== "done" && (
        <>
          <SectionDivider />
          <SectionHeading>Cancel Subscription</SectionHeading>

          {cancelStep === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, fontWeight: 300, lineHeight: 1.6 }}>
                Not ready to cancel? You can pause your subscription for up to 3 months — your records and score stay active, billing stops.
              </p>
              {!pauseState && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {([1, 2, 3] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => handlePause(m)}
                      style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", padding: "0.4rem 0.875rem", border: `1px solid ${COLORS.rule}`, background: COLORS.butter, color: COLORS.plumMid, cursor: "pointer", borderRadius: RADIUS.sm }}
                    >
                      Pause {m} month{m > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ borderTop: `1px solid ${COLORS.rule}`, paddingTop: "0.875rem" }}>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, fontWeight: 300, lineHeight: 1.6, marginBottom: "0.75rem" }}>
                  You keep full access until the end of your current billing period{expiresAt ? ` (${new Date(expiresAt).toLocaleDateString()})` : ""}. After that, access to the platform is removed.
                </p>
                <button
                  onClick={() => setCancelStep("confirm")}
                  style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, padding: "0.5rem 1.25rem", border: `1px solid ${COLORS.rust}`, background: "none", color: COLORS.rust, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Cancel Plan
                </button>
              </div>
            </div>
          )}

          {cancelStep === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem", background: COLORS.blush, borderRadius: RADIUS.sm }}>
                <p style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", color: COLORS.rust, marginBottom: "0.5rem" }}>
                  You will lose access to:
                </p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {currentPlan.features.filter((f) => !PLANS[0].features.includes(f)).map((f) => (
                    <li key={f} style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: COLORS.plumMid }}>
                      — {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ padding: "0.875rem 1rem", background: COLORS.sageLight, borderRadius: RADIUS.sm }}>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: COLORS.sage, lineHeight: 1.6 }}>
                  <strong>Your ICP records are permanent.</strong> All your maintenance history, verified jobs, and blockchain records remain on the Internet Computer after cancellation.
                </p>
              </div>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid }}>
                Your access continues until{expiresAt ? ` ${new Date(expiresAt).toLocaleDateString()}` : " the end of your billing period"}, then your account is closed. Or pause instead — keeps your account active without billing.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  onClick={handleCancel}
                  style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, padding: "0.5rem 1.25rem", border: "none", background: COLORS.rust, color: COLORS.white, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Confirm Cancellation
                </button>
                {!pauseState && (
                  <button
                    onClick={() => { handlePause(1); setCancelStep("idle"); }}
                    style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", padding: "0.5rem 1.25rem", border: `1px solid ${COLORS.rule}`, background: COLORS.butter, color: COLORS.plumMid, cursor: "pointer", borderRadius: RADIUS.sm }}
                  >
                    Pause 1 month instead
                  </button>
                )}
                <button
                  onClick={() => setCancelStep("idle")}
                  style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", padding: "0.5rem 1.25rem", border: `1px solid ${COLORS.rule}`, background: "none", color: COLORS.plumMid, cursor: "pointer", borderRadius: RADIUS.sm }}
                >
                  Keep Plan
                </button>
              </div>
            </div>
          )}

          {cancelStep === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className="spinner-lg" style={{ width: "1rem", height: "1rem" }} />
              <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid }}>Processing cancellation…</span>
            </div>
          )}
        </>
      )}

      {/* Post-cancellation */}
      {cancelStep === "done" && (
        <>
          <SectionDivider />
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1rem" }}>
            <CheckCircle size={16} color={COLORS.sage} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: COLORS.sage, marginBottom: "0.25rem" }}>
                Subscription cancelled
              </p>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid }}>
                {(cancelledAt ?? expiresAt) && expiresAt
                  ? `You have full access until ${new Date(expiresAt).toLocaleDateString()}. After that, your account will be closed.`
                  : "Your cancellation has been recorded. All your ICP records remain intact."}
              </p>
            </div>
          </div>
        </>
      )}

      <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, desc, value, onChange, last = false }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 0", borderBottom: last ? "none" : `1px solid ${COLORS.rule}` }}>
      <div>
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.9375rem", fontWeight: 500, color: COLORS.plum }}>{label}</p>
        {desc && <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: COLORS.plumMid, marginTop: "0.125rem" }}>{desc}</p>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{ width: "2.5rem", height: "1.25rem", background: value ? COLORS.sage : COLORS.rule, cursor: "pointer", position: "relative", flexShrink: 0, borderRadius: RADIUS.pill }}
      >
        <div style={{ position: "absolute", top: "0.125rem", left: value ? "1.375rem" : "0.125rem", width: "1rem", height: "1rem", background: COLORS.white, transition: "left 0.15s", borderRadius: "50%" }} />
      </div>
    </div>
  );
}

// ── Notifications tabs ────────────────────────────────────────────────────────

function ContractorNotificationsTab() {
  const [newLead,     setNewLead]     = useState(true);
  const [bidAccepted, setBidAccepted] = useState(true);
  const [bidRejected, setBidRejected] = useState(true);
  const [jobToSign,   setJobToSign]   = useState(true);
  const [emailLead,   setEmailLead]   = useState(true);
  const [emailBid,    setEmailBid]    = useState(false);
  const [smsAlerts,   setSmsAlerts]   = useState(false);

  const rows = [
    { label: "New Lead in My Trades",   desc: "Alert when a homeowner posts a request matching your trades", value: newLead,     onChange: setNewLead },
    { label: "Bid Accepted",            desc: "When a homeowner accepts one of your quotes",                 value: bidAccepted, onChange: setBidAccepted },
    { label: "Bid Not Selected",        desc: "When a homeowner accepts another contractor's quote",         value: bidRejected, onChange: setBidRejected },
    { label: "Job Pending Signature",   desc: "When a homeowner marks a job complete and needs your sign-off", value: jobToSign, onChange: setJobToSign },
    { label: "Email: New Lead",         desc: "Email when a matching quote request is posted",              value: emailLead,   onChange: setEmailLead },
    { label: "Email: Bid Outcome",      desc: "Email when a bid is accepted or closed",                     value: emailBid,    onChange: setEmailBid },
    { label: "SMS Alerts",              desc: "Critical alerts via text message",                           value: smsAlerts,   onChange: setSmsAlerts },
  ];

  return (
    <div>
      <SectionHeading>Notifications</SectionHeading>
      {rows.map((r, i) => <ToggleRow key={r.label} {...r} last={i === rows.length - 1} />)}
      <div style={{ marginTop: "1.25rem" }}>
        <Button onClick={() => toast.success("Preferences saved")}>Save Preferences</Button>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [emailVerified, setEmailVerified] = useState(true);
  const [emailQuote,    setEmailQuote]    = useState(true);
  const [emailJob,      setEmailJob]      = useState(false);
  const [smsAlerts,     setSmsAlerts]     = useState(false);
  const [pulseEnabled,  setPulseEnabled]  = useState(() =>
    localStorage.getItem("homegentic_pulse_enabled") !== "false"
  );
  const [scoreAlerts,   setScoreAlerts]   = useState(() =>
    localStorage.getItem("homegentic_score_alerts") !== "false"
  );

  function savePrefs() {
    localStorage.setItem("homegentic_pulse_enabled", pulseEnabled ? "true" : "false");
    localStorage.setItem("homegentic_score_alerts", scoreAlerts ? "true" : "false");
    toast.success("Preferences saved");
  }

  const rows = [
    { label: "Weekly Home Pulse",     desc: "In-app maintenance tips on your dashboard", value: pulseEnabled,  onChange: setPulseEnabled },
    { label: "Score Change Alerts",   desc: "Banner when your HomeGentic Score increases",  value: scoreAlerts,   onChange: setScoreAlerts },
    { label: "Email: Job Verified",   desc: "When a job is verified on-chain",           value: emailVerified, onChange: setEmailVerified },
    { label: "Email: Quote Received", desc: "When a contractor submits a quote",         value: emailQuote,    onChange: setEmailQuote },
    { label: "Email: Job Updates",    desc: "Status changes on your jobs",               value: emailJob,      onChange: setEmailJob },
    { label: "SMS Alerts",            desc: "Critical alerts via text message",          value: smsAlerts,     onChange: setSmsAlerts },
  ];

  return (
    <div>
      <SectionHeading>Notifications</SectionHeading>
      {rows.map((r, i) => <ToggleRow key={r.label} {...r} last={i === rows.length - 1} />)}
      <div style={{ marginTop: "1.25rem" }}>
        <Button onClick={savePrefs}>Save Preferences</Button>
      </div>
    </div>
  );
}

// ── Privacy tabs ──────────────────────────────────────────────────────────────

function ContractorPrivacyTab() {
  const [profileVisible, setProfileVisible] = useState(true);
  const [showTrustScore, setShowTrustScore] = useState(true);
  const [showJobCount,   setShowJobCount]   = useState(true);
  const [analyticsShare, setAnalyticsShare] = useState(false);
  const [exporting,      setExporting]      = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = { exportedAt: new Date().toISOString(), note: "Bid history, credentials, and reviews are permanently stored on the Internet Computer blockchain." };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `homegentic-contractor-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch { toast.error("Export failed"); } finally { setExporting(false); }
  };

  const rows = [
    { label: "Public Profile",      desc: "Appear in homeowner contractor searches and the contractor directory", value: profileVisible, onChange: setProfileVisible },
    { label: "Show Trust Score",    desc: "Display your trust score on your public profile",                     value: showTrustScore, onChange: setShowTrustScore },
    { label: "Show Jobs Completed", desc: "Display your completed job count on your public profile",             value: showJobCount,   onChange: setShowJobCount },
    { label: "Share Analytics",     desc: "Help improve HomeGentic with anonymous usage data",                   value: analyticsShare, onChange: setAnalyticsShare },
  ];

  return (
    <div>
      <SectionHeading>Privacy</SectionHeading>
      {rows.map((r, i) => <ToggleRow key={r.label} {...r} last={i === rows.length - 1} />)}
      <div style={{ marginTop: "1.25rem" }}>
        <Button onClick={() => toast.success("Privacy settings saved")}>Save Privacy Settings</Button>
      </div>

      <SectionDivider />
      <SectionHeading>Export Your Data</SectionHeading>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, fontWeight: 300, lineHeight: 1.6, marginBottom: "1rem" }}>
        Download your contractor record as JSON. Your bids, job credentials, and reviews are also permanently stored on the Internet Computer blockchain — you own them regardless of your subscription status.
      </p>
      <Button loading={exporting} onClick={handleExport} icon={<Download size={13} />} variant="outline">
        Download My Data (JSON)
      </Button>
    </div>
  );
}

function PrivacyTab() {
  const [publicReport,   setPublicReport]   = useState(true);
  const [contractorView, setContractorView] = useState(true);
  const [analyticsShare, setAnalyticsShare] = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        properties: properties.map((p) => ({
          id: String(p.id), address: p.address, city: p.city, state: p.state,
          zipCode: p.zipCode, propertyType: p.propertyType, yearBuilt: String(p.yearBuilt),
          squareFeet: String(p.squareFeet), verificationLevel: p.verificationLevel,
          tier: p.tier, createdAt: new Date(Number(p.createdAt) / 1_000_000).toISOString(),
        })),
        jobs: jobs.map((j) => ({
          id: j.id, propertyId: j.propertyId, serviceType: j.serviceType,
          description: j.description, contractorName: j.contractorName,
          amountUsd: (j.amount / 100).toFixed(2), date: j.date, status: j.status,
          verified: j.verified, isDiy: j.isDiy, permitNumber: j.permitNumber ?? null,
          warrantyMonths: j.warrantyMonths,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `homegentic-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch { toast.error("Export failed"); } finally { setExporting(false); }
  };

  const rows = [
    { label: "Public HomeGentic Report", desc: "Allow anyone with the link to view your property history", value: publicReport,   onChange: setPublicReport },
    { label: "Contractor Visibility",    desc: "Allow contractors to find and view your properties",       value: contractorView, onChange: setContractorView },
    { label: "Share Analytics",          desc: "Help improve HomeGentic with anonymous usage data",        value: analyticsShare, onChange: setAnalyticsShare },
  ];

  return (
    <div>
      <SectionHeading>Privacy</SectionHeading>
      {rows.map((r, i) => <ToggleRow key={r.label} {...r} last={i === rows.length - 1} />)}
      <div style={{ marginTop: "1.25rem" }}>
        <Button onClick={() => toast.success("Privacy settings saved")}>Save Privacy Settings</Button>
      </div>

      <SectionDivider />
      <SectionHeading>Export Your Data</SectionHeading>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, fontWeight: 300, lineHeight: 1.6, marginBottom: "1rem" }}>
        Download all your property and job records as JSON. Your data is yours — no lock-in, no expiration. Records are also permanently stored on the Internet Computer blockchain.
      </p>
      <Button loading={exporting} onClick={handleExport} icon={<Download size={13} />} variant="outline">
        Download My Data (JSON)
      </Button>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: COLORS.plumMid, marginTop: "0.5rem" }}>
        Includes {properties.length} propert{properties.length !== 1 ? "ies" : "y"} and {jobs.length} job record{jobs.length !== 1 ? "s" : ""}.
      </p>
    </div>
  );
}
