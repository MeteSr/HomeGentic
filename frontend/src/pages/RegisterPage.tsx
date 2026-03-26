import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, HardHat, Building2, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/Button";
import { authService, UserRole } from "@/services/auth";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", paperDark: "#EDE9E0",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
  sans:  "'IBM Plex Sans', sans-serif" as const,
};

const ROLES: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: "Homeowner",
    label: "Homeowner",
    icon: <Home size={28} color={S.rust} />,
    desc: "Register properties, log maintenance jobs, and build your verified home history.",
  },
  {
    value: "Contractor",
    label: "Contractor",
    icon: <HardHat size={28} color={S.ink} />,
    desc: "Sign verified job completions, receive leads, and build your reputation on-chain.",
  },
  {
    value: "Realtor",
    label: "Realtor",
    icon: <Building2 size={28} color="#3D6B57" />,
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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!role) return;
    setLoading(true);
    try {
      const profile = await authService.register({ role, email, phone });
      setProfile(profile);
      toast.success("Welcome to HomeFax!");
      navigate(profile.role === "Contractor" ? "/contractor-dashboard" : "/onboarding");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: S.paper, padding: "1.5rem", fontFamily: S.sans,
    }}>
      <div style={{ width: "100%", maxWidth: "34rem" }}>
        {/* Logo */}
        <div style={{ marginBottom: "2.5rem", textAlign: "center" }}>
          <div style={{ fontFamily: S.mono, fontWeight: 500, fontSize: "1rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Home<span style={{ color: S.rust }}>Fax</span>
          </div>
        </div>

        <div style={{ border: `1px solid ${S.rule}`, background: "#fff" }}>
          {/* Step header */}
          <div style={{
            display: "flex", alignItems: "stretch",
            borderBottom: `1px solid ${S.rule}`, height: "3rem",
          }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                borderRight: n < 3 ? `1px solid ${S.rule}` : "none",
                fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: step === n ? S.rust : step > n ? S.inkLight : "#CCC",
                background: step === n ? "#FAF0ED" : "transparent",
              }}>
                {n === 1 ? "Role" : n === 2 ? "Details" : "Confirm"}
              </div>
            ))}
          </div>

          <div style={{ padding: "2rem" }}>
            {/* Step 1 */}
            {step === 1 && (
              <>
                <div style={{
                  fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: S.rust, marginBottom: "1rem",
                  display: "flex", alignItems: "center", gap: "0.625rem",
                }}>
                  <span style={{ display: "block", width: "20px", height: "1px", background: S.rust }} />
                  Step 1 of 3
                </div>
                <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", marginBottom: "0.5rem" }}>I am a…</h2>
                <p style={{ fontWeight: 300, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1.5rem" }}>
                  Choose your role to get started with HomeFax.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.5rem" }}>
                  {ROLES.map((r) => (
                    <div
                      key={r.value}
                      onClick={() => setRole(r.value)}
                      style={{
                        padding: "1rem 1.25rem",
                        border: `1px solid ${role === r.value ? S.rust : S.rule}`,
                        backgroundColor: role === r.value ? "#FAF0ED" : "#fff",
                        cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "1rem",
                        transition: "border-color 0.15s",
                      }}
                    >
                      {r.icon}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                          {r.label}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: S.inkLight, fontWeight: 300 }}>{r.desc}</div>
                      </div>
                      {role === r.value && <CheckCircle size={18} color={S.rust} />}
                    </div>
                  ))}
                </div>
                <Button size="lg" disabled={!role} onClick={() => setStep(2)} iconRight={<ArrowRight size={16} />} style={{ width: "100%" }}>
                  Continue
                </Button>
              </>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <div style={{
                  fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: S.rust, marginBottom: "1rem",
                  display: "flex", alignItems: "center", gap: "0.625rem",
                }}>
                  <span style={{ display: "block", width: "20px", height: "1px", background: S.rust }} />
                  Step 2 of 3
                </div>
                <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", marginBottom: "0.5rem" }}>Your details</h2>
                <p style={{ fontWeight: 300, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1.5rem" }}>
                  Optional — used for notifications only. Never shared.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div>
                    <label className="form-label">Email address (optional)</label>
                    <input type="email" className="form-input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Phone number (optional)</label>
                    <input type="tel" className="form-input" placeholder="+1 (555) 000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" onClick={() => setStep(1)} icon={<ArrowLeft size={16} />}>Back</Button>
                  <Button onClick={() => setStep(3)} iconRight={<ArrowRight size={16} />} style={{ flex: 1 }}>Review</Button>
                </div>
              </>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <>
                <div style={{
                  fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: S.rust, marginBottom: "1rem",
                  display: "flex", alignItems: "center", gap: "0.625rem",
                }}>
                  <span style={{ display: "block", width: "20px", height: "1px", background: S.rust }} />
                  Step 3 of 3
                </div>
                <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", marginBottom: "0.5rem" }}>Confirm</h2>
                <p style={{ fontWeight: 300, fontSize: "0.875rem", color: S.inkLight, marginBottom: "1.5rem" }}>
                  Review and submit to create your HomeFax account.
                </p>
                <div style={{ border: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
                  {[
                    { label: "Role",  value: role },
                    { label: "Email", value: email || "Not provided" },
                    { label: "Phone", value: phone || "Not provided" },
                  ].map((row, i) => (
                    <div key={row.label} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.75rem 1rem",
                      borderBottom: i < 2 ? `1px solid ${S.rule}` : "none",
                    }}>
                      <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" onClick={() => setStep(2)} icon={<ArrowLeft size={16} />}>Back</Button>
                  <Button loading={loading} onClick={handleSubmit} icon={<CheckCircle size={16} />} style={{ flex: 1 }}>
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
