import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Home, HardHat, Building2, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/Button";
import { authService, UserRole } from "@/services/auth";
import { neighborReferralService } from "@/services/neighborReferral";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";
import { isValidEmail, isValidPhone } from "@/utils/validators";

const ROLES: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: "Homeowner",
    label: "Homeowner",
    icon: <Home size={26} color={V2_COLORS.blue} />,
    desc: "Register properties, log maintenance jobs, and build your verified home history.",
  },
  {
    value: "Contractor",
    label: "Contractor",
    icon: <HardHat size={26} color={V2_COLORS.ink} />,
    desc: "Sign verified job completions, receive leads, and build your reputation on-chain.",
  },
  {
    value: "Realtor",
    label: "Realtor",
    icon: <Building2 size={26} color={V2_COLORS.muted} />,
    desc: "Access verified property histories to streamline transactions and build buyer trust.",
  },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setProfile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSubmit = async () => {
    if (!role) return;
    if (!email) { setEmailError("Email is required"); return; }
    if (!isValidEmail(email)) { setEmailError("Enter a valid email address"); return; }
    if (phone && !isValidPhone(phone)) { setPhoneError("Enter a valid phone number"); return; }
    setLoading(true);
    try {
      const profile = await authService.register({ role, email, phone });
      setProfile(profile);
      const pendingCode = neighborReferralService.getPendingRefCode();
      if (pendingCode) {
        neighborReferralService.clearPendingRefCode();
        void neighborReferralService.useReferralCode(pendingCode);
      }
      toast.success("Welcome to HomeGentic!");
      const pending = sessionStorage.getItem("pendingCheckout");
      if (pending && profile.role !== "Contractor") {
        sessionStorage.removeItem("pendingCheckout");
        const { tier, billing } = JSON.parse(pending);
        navigate(`/checkout?tier=${tier}&billing=${billing}`);
      } else {
        navigate(profile.role === "Contractor" ? "/contractor-dashboard" : "/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const STEP_LABELS = ["Role", "Details", "Confirm"];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: V2_COLORS.lblue,
      padding: "1.5rem",
      fontFamily: V2_FONTS.body,
    }}>
      <div style={{ width: "100%", maxWidth: "34rem" }}>
        {/* Logo */}
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <div style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.5rem", letterSpacing: "-0.5px", color: V2_COLORS.ink }}>
            Home<span style={{ color: V2_COLORS.blue, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </div>
        </div>

        <div style={{
          borderRadius: V2_RADIUS.card,
          background: V2_COLORS.paper,
          boxShadow: V2_SHADOWS.modal,
          border: `1px solid ${V2_COLORS.border}`,
          overflow: "hidden",
        }}>
          {/* Step indicator */}
          <div style={{
            display: "flex",
            borderBottom: `1px solid ${V2_COLORS.border}`,
            padding: "0 1.5rem",
            gap: "0",
          }}>
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const isActive = step === n;
              const isDone = step > n;
              return (
                <div key={n} style={{
                  flex: 1,
                  padding: "0.875rem 0",
                  textAlign: "center",
                  fontFamily: V2_FONTS.body,
                  fontSize: "0.6rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: isActive ? V2_COLORS.blue : isDone ? V2_COLORS.muted : V2_COLORS.muted2,
                  borderBottom: isActive ? `2px solid ${V2_COLORS.blue}` : "2px solid transparent",
                  transition: "color 0.2s, border-color 0.2s",
                  marginBottom: "-1px",
                }}>
                  {isDone ? "✓ " : ""}{label}
                </div>
              );
            })}
          </div>

          <div style={{ padding: "2rem" }}>
            {/* Step 1 — Role */}
            {step === 1 && (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  background: V2_COLORS.attentionBg, color: V2_COLORS.ink,
                  padding: "5px 14px", borderRadius: 100,
                  fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem",
                  border: `1px solid rgba(46,37,64,0.1)`,
                }}>
                  Step 1 of 3
                </div>
                <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.75rem", marginBottom: "0.5rem", color: V2_COLORS.ink }}>I am a…</h2>
                <p style={{ fontWeight: 300, fontSize: "0.9rem", color: V2_COLORS.muted, marginBottom: "1.5rem" }}>
                  Choose your role to get started with HomeGentic.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.5rem" }}>
                  {ROLES.map((r) => {
                    const selected = role === r.value;
                    return (
                      <div
                        key={r.value}
                        onClick={() => setRole(r.value)}
                        style={{
                          padding: "1rem 1.25rem",
                          border: `1.5px solid ${selected ? V2_COLORS.blue : V2_COLORS.border}`,
                          borderRadius: V2_RADIUS.sm,
                          backgroundColor: selected ? V2_COLORS.lblue : V2_COLORS.paper,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        {r.icon}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", fontWeight: 600, color: V2_COLORS.ink, marginBottom: "0.2rem" }}>
                            {r.label}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: V2_COLORS.muted, fontWeight: 300 }}>{r.desc}</div>
                        </div>
                        {selected && <CheckCircle size={18} color={V2_COLORS.blue} />}
                      </div>
                    );
                  })}
                </div>
                <Button size="lg" disabled={!role} onClick={() => setStep(2)} iconRight={<ArrowRight size={16} />} style={{ width: "100%" }}>
                  Continue
                </Button>
              </>
            )}

            {/* Step 2 — Details */}
            {step === 2 && (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  background: V2_COLORS.attentionBg, color: V2_COLORS.ink,
                  padding: "5px 14px", borderRadius: 100,
                  fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem",
                  border: `1px solid rgba(46,37,64,0.1)`,
                }}>
                  Step 2 of 3
                </div>
                <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.75rem", marginBottom: "0.5rem", color: V2_COLORS.ink }}>Your details</h2>
                <p style={{ fontWeight: 300, fontSize: "0.9rem", color: V2_COLORS.muted, marginBottom: "1.5rem" }}>
                  Used for notifications and gift delivery. Never shared.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div>
                    <label className="form-label">Email address *</label>
                    <input
                      type="email" className="form-input" placeholder="you@example.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                      onBlur={() => { if (!isValidEmail(email)) setEmailError(email ? "Enter a valid email address" : "Email is required"); }}
                      style={emailError ? { borderColor: V2_COLORS.coral } : undefined}
                    />
                    {emailError && <p style={{ color: V2_COLORS.coralText, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: V2_FONTS.body }}>{emailError}</p>}
                  </div>
                  <div>
                    <label className="form-label">Phone number (optional)</label>
                    <input
                      type="tel" className="form-input" placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
                      onBlur={() => { if (phone && !isValidPhone(phone)) setPhoneError("Enter a valid phone number"); }}
                      style={phoneError ? { borderColor: V2_COLORS.coral } : undefined}
                    />
                    {phoneError && <p style={{ color: V2_COLORS.coralText, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: V2_FONTS.body }}>{phoneError}</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" onClick={() => setStep(1)} icon={<ArrowLeft size={16} />}>Back</Button>
                  <Button
                    disabled={!email || !isValidEmail(email) || (phone !== "" && !isValidPhone(phone))}
                    onClick={() => setStep(3)}
                    iconRight={<ArrowRight size={16} />}
                    style={{ flex: 1 }}
                  >Review</Button>
                </div>
              </>
            )}

            {/* Step 3 — Confirm */}
            {step === 3 && (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  background: V2_COLORS.attentionBg, color: V2_COLORS.ink,
                  padding: "5px 14px", borderRadius: 100,
                  fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem",
                  border: `1px solid rgba(46,37,64,0.1)`,
                }}>
                  Step 3 of 3
                </div>
                <h2 style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.75rem", marginBottom: "0.5rem", color: V2_COLORS.ink }}>Confirm</h2>
                <p style={{ fontWeight: 300, fontSize: "0.9rem", color: V2_COLORS.muted, marginBottom: "1.5rem" }}>
                  Review and submit to create your HomeGentic account.
                </p>
                <div style={{
                  border: `1.5px solid ${V2_COLORS.border}`,
                  borderRadius: V2_RADIUS.sm,
                  overflow: "hidden",
                  marginBottom: "1.5rem",
                }}>
                  {[
                    { label: "Role",  value: role },
                    { label: "Email", value: email || "Not provided" },
                    { label: "Phone", value: phone || "Not provided" },
                  ].map((row, i) => (
                    <div key={row.label} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      borderBottom: i < 2 ? `1px solid ${V2_COLORS.border}` : "none",
                      background: i % 2 === 0 ? V2_COLORS.paper : V2_COLORS.lblue,
                    }}>
                      <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: V2_COLORS.muted }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: "0.875rem", fontWeight: 500, color: V2_COLORS.ink }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", marginBottom: "1.25rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: "2px", accentColor: V2_COLORS.blue, width: "1rem", height: "1rem", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: "0.8rem", color: V2_COLORS.muted, fontWeight: 300, lineHeight: 1.5 }}>
                    I agree to HomeGentic's{" "}
                    <Link to="/terms" target="_blank" rel="noopener noreferrer" style={{ color: V2_COLORS.blue }}>Terms of Service</Link>
                    {" "}and{" "}
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: V2_COLORS.blue }}>Privacy Policy</Link>
                  </span>
                </label>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" onClick={() => setStep(2)} icon={<ArrowLeft size={16} />}>Back</Button>
                  <Button loading={loading} disabled={!agreedToTerms} onClick={handleSubmit} icon={<CheckCircle size={16} />} style={{ flex: 1 }}>
                    Create Account
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
