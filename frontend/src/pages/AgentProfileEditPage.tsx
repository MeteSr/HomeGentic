/**
 * Agent Profile Edit — /agent/profile
 *
 * Allows a Realtor to create or update their on-chain agent profile (Epic 9.1.1, 9.1.2).
 */

import React, { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { agentService, CreateAgentProfileInput } from "@/services/agent";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";
import { isValidEmail, isValidPhone } from "@/utils/validators";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

interface FormState {
  name:           string;
  brokerage:      string;
  licenseNumber:  string;
  statesLicensed: string;
  bio:            string;
  phone:          string;
  email:          string;
}

const EMPTY: FormState = {
  name: "", brokerage: "", licenseNumber: "",
  statesLicensed: "", bio: "", phone: "", email: "",
};

export default function AgentProfileEditPage() {
  const [existing, setExisting]   = useState<any>(null);
  const [form,     setForm]       = useState<FormState>(EMPTY);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);

  useEffect(() => {
    agentService.getMyProfile()
      .then((p) => {
        if (p) {
          setExisting(p);
          setForm({
            name:           p.name,
            brokerage:      p.brokerage,
            licenseNumber:  p.licenseNumber,
            statesLicensed: p.statesLicensed.join(", "),
            bio:            p.bio,
            phone:          p.phone,
            email:          p.email,
          });
        }
      })
      .catch((e) => console.error("[AgentProfileEditPage] profile load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim())                                { toast.error("Name is required"); return; }
    if (!form.brokerage.trim())                           { toast.error("Brokerage is required"); return; }
    if (!form.licenseNumber.trim())                       { toast.error("License number is required"); return; }
    if (form.email && !isValidEmail(form.email))          { toast.error("Enter a valid email address"); return; }
    if (form.phone && !isValidPhone(form.phone))          { toast.error("Enter a valid phone number"); return; }

    const input: CreateAgentProfileInput = {
      name:           form.name.trim(),
      brokerage:      form.brokerage.trim(),
      licenseNumber:  form.licenseNumber.trim(),
      statesLicensed: form.statesLicensed.split(",").map((s) => s.trim()).filter(Boolean),
      bio:            form.bio.trim(),
      phone:          form.phone.trim(),
      email:          form.email.trim(),
    };

    setSaving(true);
    try {
      if (existing) {
        await agentService.updateProfile(input);
        toast.success("Profile updated.");
      } else {
        await agentService.createProfile(input);
        toast.success("Profile created!");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <p style={{ fontFamily: UI.mono, color: UI.inkLight }}>Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1 style={{ fontFamily: UI.serif, color: UI.ink, marginBottom: "0.5rem" }}>
          Agent Profile
        </h1>

        {existing?.isVerified ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
            background: "#e6f4ea", border: "1px solid #34a853", borderRadius: 2,
            padding: "4px 10px", marginBottom: "1.5rem" }}>
            <span style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: "#188038" }}>
              HomeGentic Verified
            </span>
          </div>
        ) : existing && (
          <p style={{ fontFamily: UI.mono, fontSize: "0.75rem", color: UI.inkLight,
            marginBottom: "1.5rem" }}>
            Pending verification — your profile is under review.
          </p>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          <label htmlFor="agentName"
            style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>
            NAME
            <input
              id="agentName"
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              style={{ display: "block", width: "100%", padding: "0.5rem",
                border: `1px solid ${UI.rule}`, fontFamily: UI.mono, marginTop: 4 }}
            />
          </label>

          <label style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}
            htmlFor="brokerage">
            BROKERAGE
            <input
              id="brokerage"
              type="text"
              value={form.brokerage}
              onChange={(e) => update("brokerage", e.target.value)}
              style={{ display: "block", width: "100%", padding: "0.5rem",
                border: `1px solid ${UI.rule}`, fontFamily: UI.mono, marginTop: 4 }}
            />
          </label>

          <label style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}
            htmlFor="licenseNumber">
            LICENSE NUMBER
            <input
              id="licenseNumber"
              type="text"
              value={form.licenseNumber}
              onChange={(e) => update("licenseNumber", e.target.value)}
              style={{ display: "block", width: "100%", padding: "0.5rem",
                border: `1px solid ${UI.rule}`, fontFamily: UI.mono, marginTop: 4 }}
            />
          </label>

          <label style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>
            STATES (comma-separated)
            <input
              type="text"
              value={form.statesLicensed}
              onChange={(e) => update("statesLicensed", e.target.value)}
              placeholder="TX, OK, CA"
              style={{ display: "block", width: "100%", padding: "0.5rem",
                border: `1px solid ${UI.rule}`, fontFamily: UI.mono, marginTop: 4 }}
            />
          </label>

          <label style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}
            htmlFor="bio">
            BIO
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={4}
              style={{ display: "block", width: "100%", padding: "0.5rem",
                border: `1px solid ${UI.rule}`, fontFamily: UI.mono, marginTop: 4,
                resize: "vertical" }}
            />
          </label>

          <div style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>
            PHONE
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: 4,
                border: `1px solid ${form.phone && !isValidPhone(form.phone) ? COLORS.rust : UI.rule}`,
                fontFamily: UI.mono }}
            />
            {form.phone && !isValidPhone(form.phone) && (
              <span style={{ color: COLORS.rust, fontSize: "0.65rem", marginTop: "0.2rem", display: "block" }}>Enter a valid phone number</span>
            )}
          </div>

          <div style={{ fontFamily: UI.mono, fontSize: "0.7rem", color: UI.inkLight }}>
            EMAIL
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: 4,
                border: `1px solid ${form.email && !isValidEmail(form.email) ? COLORS.rust : UI.rule}`,
                fontFamily: UI.mono }}
            />
            {form.email && !isValidEmail(form.email) && (
              <span style={{ color: COLORS.rust, fontSize: "0.65rem", marginTop: "0.2rem", display: "block" }}>Enter a valid email address</span>
            )}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
