import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, ShieldCheck, User } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { contractorService, ContractorProfile } from "@/services/contractor";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const SPECIALTIES = [
  "HVAC", "Roofing", "Plumbing", "Electrical",
  "Painting", "Flooring", "Windows", "Landscaping",
];

interface FormState {
  name:          string;
  specialty:     string;
  email:         string;
  phone:         string;
  bio:           string;
  licenseNumber: string;
  serviceArea:   string;
}

const EMPTY: FormState = {
  name: "", specialty: "HVAC", email: "", phone: "",
  bio: "", licenseNumber: "", serviceArea: "",
};

function fromProfile(p: ContractorProfile): FormState {
  return {
    name:          p.name,
    specialty:     p.specialty,
    email:         p.email,
    phone:         p.phone,
    bio:           p.bio           ?? "",
    licenseNumber: p.licenseNumber ?? "",
    serviceArea:   p.serviceArea   ?? "",
  };
}

export default function ContractorProfilePage() {
  const navigate = useNavigate();
  const [existing, setExisting] = useState<ContractorProfile | null>(null);
  const [form,     setForm]     = useState<FormState>(EMPTY);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    contractorService.getMyProfile()
      .then((p) => {
        if (p) { setExisting(p); setForm(fromProfile(p)); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isEditing = existing !== null;

  const handleSave = async () => {
    if (!form.name.trim())  { toast.error("Name is required"); return; }
    if (!form.email.trim()) { toast.error("Email is required"); return; }
    if (!form.phone.trim()) { toast.error("Phone is required"); return; }

    setSaving(true);
    try {
      if (isEditing) {
        await contractorService.updateProfile({
          name:          form.name.trim(),
          specialty:     form.specialty,
          email:         form.email.trim(),
          phone:         form.phone.trim(),
          bio:           form.bio.trim()           || null,
          licenseNumber: form.licenseNumber.trim() || null,
          serviceArea:   form.serviceArea.trim()   || null,
        });
        toast.success("Profile updated.");
      } else {
        await contractorService.register({
          name:      form.name.trim(),
          specialty: form.specialty,
          email:     form.email.trim(),
          phone:     form.phone.trim(),
        });
        toast.success("Contractor profile created!");
      }
      navigate("/contractor-dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "38rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate("/contractor-dashboard")}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Contractor
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          {isEditing ? "Edit Profile" : "Set Up Your Profile"}
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "1.75rem" }}>
          {isEditing
            ? "Keep your profile current so homeowners can trust who they're hiring."
            : "Complete your profile to start receiving quote leads from homeowners."}
        </p>

        {/* Profile completeness bar */}
        {(() => {
          const checks = [
            { label: "Name",         done: !!form.name.trim() },
            { label: "Email",        done: !!form.email.trim() },
            { label: "Phone",        done: !!form.phone.trim() },
            { label: "Bio",          done: form.bio.trim().length >= 40 },
            { label: "License #",    done: !!form.licenseNumber.trim() },
            { label: "Service Area", done: !!form.serviceArea.trim() },
          ];
          const doneCount = checks.filter((c) => c.done).length;
          const pct       = Math.round((doneCount / checks.length) * 100);
          const barColor  = pct === 100 ? S.sage : pct >= 67 ? "#D4820E" : S.rust;
          return (
            <div style={{ marginBottom: "1.5rem", border: `1px solid ${S.rule}`, background: "#fff", padding: "1rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
                  Profile Completeness
                </span>
                <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.1rem", lineHeight: 1, color: barColor }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: "4px", background: S.rule, marginBottom: "0.75rem" }}>
                <div style={{ height: "4px", width: `${pct}%`, background: barColor, transition: "width 0.4s ease" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                {checks.map((c) => (
                  <span
                    key={c.label}
                    style={{
                      fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                      padding: "0.15rem 0.5rem",
                      border: `1px solid ${c.done ? S.sage : S.rule}`,
                      color: c.done ? S.sage : S.inkLight,
                      background: c.done ? "#F0F6F3" : "transparent",
                    }}
                  >
                    {c.done ? "✓ " : ""}{c.label}
                  </span>
                ))}
              </div>
              {pct < 100 && (
                <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: S.inkLight, marginTop: "0.625rem", lineHeight: 1.5 }}>
                  Complete profiles receive 20% more bid views. Add a bio, license number, and service area to stand out.
                </p>
              )}
            </div>
          );
        })()}

        {/* Verification badge for existing verified contractors */}
        {existing?.isVerified && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", border: `1px solid ${S.sage}`, background: "#F0F6F3", marginBottom: "1.25rem" }}>
            <ShieldCheck size={14} color={S.sage} />
            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.sage }}>
              Verified contractor
            </span>
          </div>
        )}

        <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Section: Identity */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: `1px solid ${S.rule}` }}>
              <User size={11} /> Basic Info
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Business / Full Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Cool Air Services LLC"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Primary Trade *</label>
                <select
                  className="form-input"
                  value={form.specialty}
                  onChange={(e) => update("specialty", e.target.value)}
                >
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label">Email *</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Phone *</label>
                  <input
                    className="form-input"
                    type="tel"
                    placeholder="(512) 555-0100"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Credentials */}
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: `1px solid ${S.rule}` }}>
              Credentials
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="form-label">License Number</label>
                  <input
                    className="form-input"
                    placeholder="e.g. TX-HVAC-12345"
                    value={form.licenseNumber}
                    onChange={(e) => update("licenseNumber", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Service Area</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Austin, TX (50 mi)"
                    value={form.serviceArea}
                    onChange={(e) => update("serviceArea", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Bio */}
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: `1px solid ${S.rule}` }}>
              About
            </div>
            <div>
              <label className="form-label">Bio</label>
              <textarea
                className="form-input"
                rows={4}
                placeholder="Describe your experience, certifications, and what sets you apart. Homeowners read this before accepting a quote."
                value={form.bio}
                onChange={(e) => update("bio", e.target.value)}
                style={{ resize: "vertical" }}
              />
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.375rem" }}>
                {form.bio.length}/500 characters
              </p>
            </div>
          </div>

          <Button
            loading={saving}
            onClick={handleSave}
            icon={<Save size={14} />}
            size="lg"
            style={{ width: "100%" }}
          >
            {isEditing ? "Save Changes" : "Create Profile"}
          </Button>
        </div>

        {/* Trust score preview for existing profiles */}
        {existing && (
          <div style={{ marginTop: "1.25rem", border: `1px solid ${S.rule}`, background: "#fff", padding: "1.25rem", display: "flex", gap: "1.25rem", alignItems: "center" }}>
            <div style={{ width: "3.5rem", height: "3.5rem", border: `2px solid ${S.rust}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.2rem", lineHeight: 1 }}>{existing.trustScore}</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.5rem", color: S.inkLight }}>/100</span>
            </div>
            <div>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>Trust Score</p>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, lineHeight: 1.5 }}>
                {existing.jobsCompleted} job{existing.jobsCompleted !== 1 ? "s" : ""} completed.
                Score improves as you complete verified HomeFax jobs.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
