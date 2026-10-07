import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { MobileAccountPage } from "@/pages/MobileAccountPage";
import { User, CreditCard, Bell, Lock, CheckCircle, Download } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { authService } from "@/services/auth";
import { PLANS, type PlanTier } from "@/services/planConstants";
import { paymentService } from "@/services/payment";
import { winBackService } from "@/services/winBackService";
import { contractorService } from "@/services/contractor";
import { getPushStatus, enablePush, disablePush, type PushStatus } from "@/services/pushNotifications";
import {
  notificationsConfigured, getNotificationPrefs, setNotificationPrefs, startSmsVerification, confirmSms,
  removeSmsPhone, toE164,
  type NotificationPrefs, type PrefsChanges, type PrefsState, type PushPrefKind, type EmailPrefKey,
} from "@/services/notificationPrefs";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
import toast from "react-hot-toast";
import UpgradeModal from "@/components/UpgradeModal";
import ContractorBillingPanel from "@/components/ContractorBillingPanel";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { isValidEmail, isValidPhone } from "@/utils/validators";

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
    <h3 style={{ fontFamily: V2_FONTS.body, fontWeight: 700, fontSize: "1rem", color: V2_COLORS.ink, margin: "0 0 1rem" }}>
      {children}
    </h3>
  );
}

function SectionDivider() {
  return <div style={{ borderTop: `1px solid ${V2_COLORS.border}`, margin: "1.75rem 0" }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontFamily: V2_FONTS.body, fontWeight: 500, fontSize: "0.875rem", color: V2_COLORS.ink, marginBottom: "0.375rem" }}>
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

  if (isMobile) {
    return (
      <Layout>
        <MobileAccountPage />
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem" }}>

        <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "2rem", color: V2_COLORS.ink, marginBottom: "2rem" }}>
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
                  fontFamily: V2_FONTS.body, fontSize: "0.9375rem",
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? V2_COLORS.ink : V2_COLORS.muted,
                  background: tab === t.key ? V2_COLORS.lblue : "transparent",
                  border: "none",
                  borderRadius: V2_RADIUS.sm,
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
            style={email && !isValidEmail(email) ? { borderColor: V2_COLORS.coral } : undefined}
          />
          {email && !isValidEmail(email) && (
            <p style={{ color: V2_COLORS.coralText, fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: V2_FONTS.body }}>Enter a valid email address</p>
          )}
        </div>
        <div>
          <FieldLabel>Phone Number</FieldLabel>
          <input className="form-input" type="tel" placeholder="+1 (555) 000-0000" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={phone && !isValidPhone(phone) ? { borderColor: V2_COLORS.coral } : undefined}
          />
          {phone && !isValidPhone(phone) && (
            <p style={{ color: V2_COLORS.coralText, fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: V2_FONTS.body }}>Enter a valid phone number</p>
          )}
        </div>
        <div>
          <Button loading={loading} onClick={handleSave} icon={<CheckCircle size={14} />}>Save Changes</Button>
        </div>
      </div>

    </div>
  );
}

// ── Subscription tab ──────────────────────────────────────────────────────────

function SubscriptionTab({ profile }: { profile: any }) {
  const { tier: cachedTier, setTier: setStoreTier } = useAuthStore();
  const [tier,             setTier]             = useState<PlanTier>(cachedTier ?? (profile?.role === "Contractor" ? "ContractorPro" : "Free"));
  const [expiresAt,        setExpiresAt]        = useState<number | null>(null);
  const [cancelledAt,      setCancelledAt]      = useState<number | null>(null);
  const [subLoaded,        setSubLoaded]        = useState(cachedTier !== null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [cancelStep,       setCancelStep]       = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [pauseState,       setPauseState]       = useState(paymentService.getPauseState());

  useEffect(() => {
    paymentService.getMySubscription().then((sub) => {
      setTier(sub.tier);
      setStoreTier(sub.tier);
      setExpiresAt(sub.expiresAt);
      if (sub.cancelledAt) {
        setCancelledAt(sub.cancelledAt);
        setCancelStep("done");
      }
    }).catch((e) => console.error("[SettingsPage] subscription load failed:", e)).finally(() => setSubLoaded(true));
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
  const isPaid      = tier !== "Free" && tier !== "ContractorFree";

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

      {profile?.role === "Contractor" ? (
        <ContractorBillingPanel
          tier={tier === "ContractorPro" ? "ContractorPro" : "ContractorFree"}
          renewDate={expiresAt ? new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null}
          onUpgradeClick={() => setShowUpgradeModal(true)}
          onCancelClick={() => setCancelStep("confirm")}
        />
      ) : !isPaid ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.5rem", color: V2_COLORS.ink }}>Free</span>
              <Badge variant="default" size="sm">Active</Badge>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              style={{ fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.875rem", padding: "0.55rem 1.25rem", border: "none", background: V2_COLORS.blue, color: V2_COLORS.paper, cursor: "pointer", borderRadius: V2_RADIUS.sm }}
            >
              {profile?.role === "Contractor" ? "Upgrade to ContractorPro →" : "Upgrade to Pro →"}
            </button>
          </div>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, marginBottom: "0.75rem" }}>
            Upgrade to unlock:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem 1.5rem" }}>
            {(profile?.role === "Contractor"
              ? ["Contractor profile listing", "Lead notifications", "Job completion certificates", "Trust score display", "Customer reviews", "Earnings dashboard"]
              : ["Score Breakdown", "Insurance Defense Mode", "Resale Ready"]
            ).map((f) => (
              <span key={f} style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Lock size={10} /> {f}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <Badge variant="info" size="lg">{tier}</Badge>
            <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: expiresAt && expiresAt < Date.now() ? V2_COLORS.coral : cancelledAt ? V2_COLORS.coral : V2_COLORS.muted }}>
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
              style={{ background: V2_COLORS.coral, color: V2_COLORS.paper, border: "none", padding: "0.45rem 1rem", fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", borderRadius: V2_RADIUS.sm, marginBottom: "0.75rem" }}
            >
              Renew →
            </button>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {currentPlan.features.map((f) => (
              <span key={f} style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", color: V2_COLORS.muted, background: V2_COLORS.lblue, padding: "0.2rem 0.625rem", borderRadius: V2_RADIUS.sm }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade options — Contractor upgrade/cancel CTAs live inside ContractorBillingPanel above */}
      {profile?.role !== "Contractor" && PLANS.filter((p) => {
        if (p.tier === "Free" || p.tier === tier) return false;
        return p.tier !== "ContractorPro" && p.tier !== "ContractorFree";
      }).length > 0 && (
        <>
          <SectionDivider />
          <SectionHeading>Upgrade Plan</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {PLANS.filter((p) => {
              if (p.tier === "Free" || p.tier === tier) return false;
              return p.tier !== "ContractorPro" && p.tier !== "ContractorFree";
            }).map((plan) => (
              <div key={plan.tier} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1rem", background: plan.tier === "Pro" ? V2_COLORS.lblue : V2_COLORS.paper, borderRadius: V2_RADIUS.sm }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                    <span style={{ fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.9375rem", color: V2_COLORS.ink }}>{plan.tier}</span>
                    {plan.tier === "Pro" && <Badge variant="info" size="sm">Most Popular</Badge>}
                  </div>
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted, fontWeight: 300 }}>{plan.features[0]}, {plan.features[1]}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, marginBottom: "0.5rem", color: V2_COLORS.ink }}>
                    ${plan.price}<span style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", fontWeight: 400, color: V2_COLORS.muted }}>/{plan.period}</span>
                  </p>
                  <Button size="sm" variant={plan.tier === "Pro" ? "primary" : "outline"} onClick={() => setShowUpgradeModal(true)}>
                    Upgrade
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
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted }}>
              {pauseState.daysLeft} day{pauseState.daysLeft !== 1 ? "s" : ""} remaining — resumes {new Date(pauseState.pausedUntil).toLocaleDateString()}
            </p>
            <button
              onClick={handleResume}
              style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 600, padding: "0.4rem 1rem", border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper, color: V2_COLORS.muted, cursor: "pointer", borderRadius: V2_RADIUS.sm, whiteSpace: "nowrap" }}
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
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, fontWeight: 300, lineHeight: 1.6 }}>
                Not ready to cancel? You can pause your subscription for up to 3 months — your records and score stay active, billing stops.
              </p>
              {!pauseState && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {([1, 2, 3] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => handlePause(m)}
                      style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.875rem", border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.lblue, color: V2_COLORS.muted, cursor: "pointer", borderRadius: V2_RADIUS.sm }}
                    >
                      Pause {m} month{m > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ borderTop: `1px solid ${V2_COLORS.border}`, paddingTop: "0.875rem" }}>
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, fontWeight: 300, lineHeight: 1.6, marginBottom: "0.75rem" }}>
                  You keep full access until the end of your current billing period{expiresAt ? ` (${new Date(expiresAt).toLocaleDateString()})` : ""}. After that, access to the platform is removed.
                </p>
                <button
                  onClick={() => setCancelStep("confirm")}
                  style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 600, padding: "0.5rem 1.25rem", border: `1px solid ${V2_COLORS.coral}`, background: "none", color: V2_COLORS.coralText, cursor: "pointer", borderRadius: V2_RADIUS.sm }}
                >
                  Cancel Plan
                </button>
              </div>
            </div>
          )}

          {cancelStep === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem", background: "#FEF2EF", borderRadius: V2_RADIUS.sm }}>
                <p style={{ fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.875rem", color: V2_COLORS.coralText, marginBottom: "0.5rem" }}>
                  You will lose access to:
                </p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {currentPlan.features.filter((f) => !PLANS[0].features.includes(f)).map((f) => (
                    <li key={f} style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted }}>
                      — {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ padding: "0.875rem 1rem", background: V2_COLORS.lblue, borderRadius: V2_RADIUS.sm }}>
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.blue, lineHeight: 1.6 }}>
                  <strong>Your ICP records are permanent.</strong> All your maintenance history, verified jobs, and blockchain records remain on the Internet Computer after cancellation.
                </p>
              </div>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted }}>
                Your access continues until{expiresAt ? ` ${new Date(expiresAt).toLocaleDateString()}` : " the end of your billing period"}, then your account is closed. Or pause instead — keeps your account active without billing.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  onClick={handleCancel}
                  style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 600, padding: "0.5rem 1.25rem", border: "none", background: V2_COLORS.coral, color: V2_COLORS.paper, cursor: "pointer", borderRadius: V2_RADIUS.sm }}
                >
                  Confirm Cancellation
                </button>
                {!pauseState && (
                  <button
                    onClick={() => { handlePause(1); setCancelStep("idle"); }}
                    style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.5rem 1.25rem", border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.lblue, color: V2_COLORS.muted, cursor: "pointer", borderRadius: V2_RADIUS.sm }}
                  >
                    Pause 1 month instead
                  </button>
                )}
                <button
                  onClick={() => setCancelStep("idle")}
                  style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.5rem 1.25rem", border: `1px solid ${V2_COLORS.border}`, background: "none", color: V2_COLORS.muted, cursor: "pointer", borderRadius: V2_RADIUS.sm }}
                >
                  Keep Plan
                </button>
              </div>
            </div>
          )}

          {cancelStep === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className="spinner-lg" style={{ width: "1rem", height: "1rem" }} />
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted }}>Processing cancellation…</span>
            </div>
          )}
        </>
      )}

      {/* Post-cancellation */}
      {cancelStep === "done" && (
        <>
          <SectionDivider />
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1rem" }}>
            <CheckCircle size={16} color={V2_COLORS.blue} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <p style={{ fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.9375rem", color: V2_COLORS.blue, marginBottom: "0.25rem" }}>
                Subscription cancelled
              </p>
              <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted }}>
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

function ToggleRow({ label, desc, value, onChange, last = false, children }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean; children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0.875rem 0", borderBottom: last ? "none" : `1px solid ${V2_COLORS.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.9375rem", fontWeight: 500, color: V2_COLORS.ink }}>{label}</p>
          {desc && <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted, marginTop: "0.125rem" }}>{desc}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          onClick={() => onChange(!value)}
          style={{ width: "2.5rem", height: "1.25rem", background: value ? V2_COLORS.blue : V2_COLORS.border, cursor: "pointer", position: "relative", flexShrink: 0, borderRadius: V2_RADIUS.pill, border: "none", padding: 0 }}
        >
          <span style={{ position: "absolute", top: "0.125rem", left: value ? "1.375rem" : "0.125rem", width: "1rem", height: "1rem", background: V2_COLORS.paper, transition: "left 0.15s", borderRadius: "50%" }} />
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Notifications tabs ────────────────────────────────────────────────────────

/**
 * Push notifications in this browser. Hidden when the browser has no Push API
 * or no notification relay is configured.
 */
function BrowserPushRow() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy,   setBusy]   = useState(false);

  useEffect(() => {
    let live = true;
    getPushStatus().then((s) => { if (live) setStatus(s); }).catch(() => { if (live) setStatus("unavailable"); });
    return () => { live = false; };
  }, []);

  if (status === null || status === "unavailable") return null;

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const s = next ? await enablePush() : await disablePush();
      setStatus(s);
      if (s === "on") toast.success("Notifications are on for this browser");
      else if (s === "denied") toast.error("Notifications are blocked in your browser settings");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change notifications");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToggleRow
      label="Push Notifications in This Browser"
      desc={status === "denied"
        ? "Blocked in your browser settings — allow notifications for this site to turn them on"
        : "Alerts for jobs to sign and quote activity, even when HomeGentic isn't open"}
      value={status === "on"}
      onChange={toggle}
    />
  );
}

/** Deep-merge a change into preferences, for showing it before the relay confirms. */
function withChanges(p: NotificationPrefs, c: PrefsChanges): NotificationPrefs {
  return {
    push:  { ...p.push,  ...c.push },
    email: { ...p.email, ...c.email },
    sms:   c.sms ? { ...p.sms, ...c.sms } : p.sms,
  };
}

/**
 * The signed-in user's preferences from the notification relay. `state` stays
 * null — and the rows it backs stay hidden — when no relay is configured or it
 * can't be reached. `change` shows a change at once, saves it, and rolls it
 * back if the save fails.
 */
function useRelayPrefs() {
  const [state, setState] = useState<PrefsState | null>(null);

  useEffect(() => {
    if (!notificationsConfigured()) return;
    let live = true;
    getNotificationPrefs().then((s) => { if (live) setState(s); }).catch(() => {});
    return () => { live = false; };
  }, []);

  async function change(changes: PrefsChanges) {
    if (!state) return;
    const before = state;
    setState({ ...before, prefs: withChanges(before.prefs, changes) });
    try {
      setState(await setNotificationPrefs(changes));
    } catch (err) {
      setState(before);
      toast.error(err instanceof Error ? err.message : "Couldn't save notification settings");
    }
  }

  return { state, setState, change };
}

type RelayPrefs = ReturnType<typeof useRelayPrefs>;

/** Email rows backed by the relay; none when email isn't configured. */
function emailRows(relay: RelayPrefs, rows: { key: EmailPrefKey; label: string; desc: string }[]) {
  const { state, change } = relay;
  if (!state?.channels.email) return [];
  return rows.map(({ key, label, desc }) => ({
    label, desc,
    value:    state.prefs.email[key],
    onChange: (v: boolean) => change({ email: { [key]: v } }),
  }));
}

const smallLink: React.CSSProperties = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.blue, textDecoration: "underline",
};

/**
 * "SMS Alerts". Texts only go to a number the user has confirmed: turning the
 * switch on without one opens an inline form that texts a code and checks it.
 * Hidden when the relay can't send texts.
 */
function SmsAlertsRow({ relay, desc, last }: { relay: RelayPrefs; desc: string; last?: boolean }) {
  const { state, setState, change } = relay;
  const [setup,  setSetup]  = useState(false);
  const [stage,  setStage]  = useState<"phone" | "code">("phone");
  const [input,  setInput]  = useState("");
  const [phone,  setPhone]  = useState("");
  const [code,   setCode]   = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  if (!state?.channels.sms) return null;
  const { sms } = state.prefs;

  function closeSetup() {
    setSetup(false); setStage("phone"); setCode(""); setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () => run(async () => {
    const e164 = toE164(input);
    if (!e164) throw new Error("Enter a mobile number, with the country code if it's outside the US");
    await startSmsVerification(e164);
    setPhone(e164);
    setStage("code");
  });

  const confirm = () => run(async () => {
    setState(await confirmSms(phone, code.trim()));
    closeSetup();
    toast.success("Text alerts are on");
  });

  const remove = () => run(async () => {
    setState(await removeSmsPhone());
    toast.success("Number removed");
  });

  const onToggle = (next: boolean) => {
    if (sms.phone) change({ sms: { enabled: next } });
    else if (next) setSetup(true);
    else closeSetup();
  };

  const inputLabel: React.CSSProperties = {
    display: "block", fontFamily: V2_FONTS.body, fontWeight: 500, fontSize: "0.875rem", color: V2_COLORS.ink, marginBottom: "0.375rem",
  };

  return (
    <ToggleRow
      label="SMS Alerts"
      desc={sms.phone ? `${desc} Texts go to ${sms.phone}.` : desc}
      value={sms.phone ? sms.enabled : setup}
      onChange={onToggle}
      last={last}
    >
      {sms.phone && (
        <div style={{ marginTop: "0.5rem" }}>
          <button type="button" style={smallLink} onClick={remove} disabled={busy}>Remove this number</button>
        </div>
      )}
      {!sms.phone && setup && (
        <div style={{ marginTop: "0.875rem", maxWidth: "22rem" }}>
          {stage === "phone" ? (
            <>
              <label htmlFor="sms-phone" style={inputLabel}>Mobile number</label>
              <input id="sms-phone" className="form-input" type="tel" autoComplete="tel" placeholder="+1 (512) 555-0142"
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !busy) sendCode(); }} />
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.75rem" }}>
                <Button size="sm" onClick={sendCode} disabled={busy || !input.trim()}>Text me a code</Button>
                <button type="button" style={smallLink} onClick={closeSetup}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="sms-code" style={inputLabel}>Code we texted to {phone}</label>
              <input id="sms-code" className="form-input" inputMode="numeric" autoComplete="one-time-code"
                value={code} onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !busy) confirm(); }} />
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.75rem" }}>
                <Button size="sm" onClick={confirm} disabled={busy || !code.trim()}>Confirm</Button>
                <button type="button" style={smallLink} onClick={() => { setStage("phone"); setCode(""); setError(null); }}>
                  Use a different number
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" style={{ color: V2_COLORS.coralText, fontSize: "0.8125rem", marginTop: "0.5rem", fontFamily: V2_FONTS.body }}>{error}</p>
          )}
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", color: V2_COLORS.muted, marginTop: "0.75rem" }}>
            Message and data rates may apply. Reply STOP to any alert to opt out.
          </p>
        </div>
      )}
    </ToggleRow>
  );
}

function ContractorNotificationsTab() {
  const [newLead,     setNewLead]     = useState(false);
  const [leadLoaded,  setLeadLoaded]  = useState(false);
  const relay = useRelayPrefs();
  const push = relay.state?.prefs.push;

  useEffect(() => {
    let live = true;
    contractorService.getMyProfile()
      .then((p) => { if (live) { setNewLead(p?.notifyPush ?? false); setLeadLoaded(true); } })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Saved straight to the contractor profile — it decides who the relay
  // sends new-lead pushes to, on every device.
  async function toggleNewLead(next: boolean) {
    if (!leadLoaded) return;
    setNewLead(next);
    try {
      await contractorService.setLeadPushAlerts(next);
    } catch (err) {
      setNewLead(!next);
      toast.error(err instanceof Error ? err.message : "Couldn't save lead alerts");
    }
  }

  const togglePush = (kind: PushPrefKind) => (v: boolean) => relay.change({ push: { [kind]: v } });

  // Everything below saves as it changes; the bid, signature, email and SMS
  // rows are preferences kept by the notification relay.
  const rows = [
    { label: "Push: New Lead in My Trades", desc: "Push alert when a homeowner posts a request in your trades and service area", value: newLead, onChange: toggleNewLead },
    ...(push ? [
      { label: "Push: Bid Accepted",          desc: "When a homeowner accepts one of your quotes",                   value: push.bid_accepted,                      onChange: togglePush("bid_accepted") },
      { label: "Push: Bid Not Selected",      desc: "When a homeowner accepts another contractor's quote",           value: push.bid_declined,                      onChange: togglePush("bid_declined") },
      { label: "Push: Job Pending Signature", desc: "When a homeowner signs off on a job and it needs your signature", value: push.job_awaiting_contractor_signature, onChange: togglePush("job_awaiting_contractor_signature") },
    ] : []),
    ...emailRows(relay, [
      { key: "new_lead",    label: "Email: New Lead",    desc: "Email when a matching quote request is posted" },
      { key: "bid_outcome", label: "Email: Bid Outcome", desc: "Email when a bid is accepted or closed" },
    ]),
  ];
  const hasSms = !!relay.state?.channels.sms;

  return (
    <div>
      <SectionHeading>Notifications</SectionHeading>
      <BrowserPushRow />
      {rows.map((r, i) => <ToggleRow key={r.label} {...r} last={!hasSms && i === rows.length - 1} />)}
      <SmsAlertsRow relay={relay} desc="Texts when a bid is accepted or a job needs your signature." last />
    </div>
  );
}

function NotificationsTab() {
  const relay = useRelayPrefs();
  const [pulseEnabled,  setPulseEnabled]  = useState(() =>
    localStorage.getItem("homegentic_pulse_enabled") !== "false"
  );
  const [scoreAlerts,   setScoreAlerts]   = useState(() =>
    localStorage.getItem("homegentic_score_alerts") !== "false"
  );

  // These two are dashboard features kept in this browser.
  function setLocal(key: string, set: (v: boolean) => void) {
    return (v: boolean) => {
      set(v);
      localStorage.setItem(key, v ? "true" : "false");
    };
  }

  const rows = [
    { label: "Weekly Home Pulse",     desc: "In-app maintenance tips on your dashboard",   value: pulseEnabled, onChange: setLocal("homegentic_pulse_enabled", setPulseEnabled) },
    { label: "Score Change Alerts",   desc: "Banner when your HomeGentic Score increases", value: scoreAlerts,  onChange: setLocal("homegentic_score_alerts", setScoreAlerts) },
    ...emailRows(relay, [
      { key: "job_verified",   label: "Email: Job Verified",   desc: "When a contractor signs off and a job is verified" },
      { key: "quote_received", label: "Email: Quote Received", desc: "When a contractor submits a quote" },
      { key: "job_updates",    label: "Email: Job Updates",    desc: "When a job needs your signature or a sensor opens one" },
    ]),
  ];
  const hasSms = !!relay.state?.channels.sms;

  return (
    <div>
      <SectionHeading>Notifications</SectionHeading>
      <BrowserPushRow />
      {rows.map((r, i) => <ToggleRow key={r.label} {...r} last={!hasSms && i === rows.length - 1} />)}
      <SmsAlertsRow relay={relay} desc="Texts when a job needs your signature or a sensor detects a problem." last />
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
      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, fontWeight: 300, lineHeight: 1.6, marginBottom: "1rem" }}>
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
      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, fontWeight: 300, lineHeight: 1.6, marginBottom: "1rem" }}>
        Download all your property and job records as JSON. Your data is yours — no lock-in, no expiration. Records are also permanently stored on the Internet Computer blockchain.
      </p>
      <Button loading={exporting} onClick={handleExport} icon={<Download size={13} />} variant="outline">
        Download My Data (JSON)
      </Button>
      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted, marginTop: "0.5rem" }}>
        Includes {properties.length} propert{properties.length !== 1 ? "ies" : "y"} and {jobs.length} job record{jobs.length !== 1 ? "s" : ""}.
      </p>
    </div>
  );
}
