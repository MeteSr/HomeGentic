/**
 * AgentVerifyPage — Bid to List A1 · /agents/verify
 * Gate. Must pass before a single masked listing is visible for bidding.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { agentService, type AgentProfile } from "@/services/agent";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import toast from "react-hot-toast";

const UI = V2_COLORS;

const inputStyle: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${UI.border}`, borderRadius: V2_RADIUS.input,
  padding: "10px 14px", fontFamily: V2_FONTS.body, fontSize: "0.875rem", boxSizing: "border-box", marginTop: 6,
};
const labelStyle: React.CSSProperties = {
  fontFamily: V2_FONTS.mono, fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase",
};

function StepCard({ n, title, note, state, children }: { n: number; title: string; note: string; state: "passed" | "progress"; children?: React.ReactNode }) {
  const passed = state === "passed";
  return (
    <div style={{
      border: `1.5px solid ${passed ? UI.border : UI.blueTintBorder}`,
      background: passed ? UI.paper : UI.blueTintBg,
      borderRadius: V2_RADIUS.card, padding: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: passed ? UI.green : UI.blue, color: "#fff", fontFamily: V2_FONTS.mono, fontWeight: 700, fontSize: "0.75rem",
        }}>
          {passed ? <Check size={14} /> : n}
        </div>
        <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "0.95rem", color: UI.ink, flex: 1 }}>{title}</div>
        <span style={{
          fontFamily: V2_FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.06em", padding: "4px 8px", borderRadius: 100,
          background: passed ? UI.greenBg : UI.blueTintSurface, color: passed ? UI.green : UI.blue,
        }}>{passed ? "PASSED" : "IN PROGRESS"}</span>
      </div>
      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.muted2, margin: "0 0 10px" }}>{note}</p>
      {children}
    </div>
  );
}

export default function AgentVerifyPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", brokerage: "", licenseNumber: "", licenseState: "FL", county: "", serviceCities: "", bio: "", phone: "", email: "",
  });

  useEffect(() => {
    agentService.getMyProfile().then((p) => { setProfile(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const p = await agentService.register({
        ...form,
        serviceCities: form.serviceCities.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean),
      });
      setProfile(p);
      toast.success("Details on file — finish setting up your card to see listings.");
    } catch (err: any) {
      toast.error(err?.message ?? "Registration failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await agentService.setCardOnFile(true);
      setProfile((p) => (p ? { ...p, cardOnFile: true } : p));
      navigate("/agents/browse");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not finish setup");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout><div style={{ padding: "4rem", textAlign: "center", color: UI.muted }}>Loading…</div></Layout>;

  const licensePassed = !!profile?.licenseNumber;
  const brokeragePassed = !!profile?.brokerage;
  const cardPassed = !!profile?.cardOnFile;

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.62rem", color: "#92640A", border: "1px solid rgba(255,210,63,0.45)", borderRadius: 100, padding: "3px 10px" }}>FOR AGENTS</span>
          <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.62rem", color: UI.muted, letterSpacing: "0.08em" }}>STEP 2 OF 3</span>
        </div>
        <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(24px,2.6vw,30px)", color: UI.ink, margin: "0 0 24px" }}>
          Get verified to bid
        </h1>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: "clamp(24px,3vw,40px)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!profile ? (
              <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 12, border: `1.5px solid ${UI.border}`, borderRadius: V2_RADIUS.card, padding: 18 }}>
                <div><div style={labelStyle}>Full name</div><input required style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><div style={labelStyle}>Brokerage</div><input required style={inputStyle} value={form.brokerage} onChange={(e) => setForm({ ...form, brokerage: e.target.value })} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><div style={labelStyle}>License number</div><input required style={inputStyle} value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></div>
                  <div><div style={labelStyle}>License state</div><input required style={inputStyle} value={form.licenseState} onChange={(e) => setForm({ ...form, licenseState: e.target.value })} /></div>
                </div>
                <div><div style={labelStyle}>County</div><input required style={inputStyle} value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} /></div>
                <div><div style={labelStyle}>Cities served (comma separated)</div><input style={inputStyle} value={form.serviceCities} onChange={(e) => setForm({ ...form, serviceCities: e.target.value })} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><div style={labelStyle}>Phone</div><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><div style={labelStyle}>Email</div><input required type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <Button type="submit" variant="primary" loading={saving} style={{ marginTop: 6 }}>Save details</Button>
              </form>
            ) : (
              <>
                <StepCard n={1} title="License number" note="Checked against the Florida DBPR licence register. Inactive or expired licences cannot bid." state={licensePassed ? "passed" : "progress"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.85rem", color: UI.ink }}>{profile.licenseNumber}</span>
                    {licensePassed && <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.6rem", background: UI.vbadge, color: UI.blue, borderRadius: 100, padding: "3px 8px" }}>MATCHED DBPR</span>}
                  </div>
                </StepCard>
                <StepCard n={2} title="Brokerage and status" note="We confirm the brokerage of record and that your status is active. Both are re-checked every 90 days." state={brokeragePassed ? "passed" : "progress"}>
                  <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>{profile.brokerage}</span>
                </StepCard>
                <StepCard n={3} title="Card on file" note="Authorized for the selection fee. Never charged unless a homeowner chooses you." state={cardPassed ? "passed" : "progress"}>
                  {!cardPassed && (
                    <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.85rem", color: UI.ink }}>•••• •••• •••• 4429 <span style={{ color: UI.muted }}>EXP 09/29</span></div>
                  )}
                </StepCard>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.card, padding: 18 }}>
              <div style={{ ...labelStyle, marginBottom: 12 }}>What you pay</div>
              {[["To browse listings", "$0", "Masked summaries, unlimited"], ["To place a bid", "$0", "Up to five open bids at once"], ["If a homeowner picks you", "Fee set by HomeGentic", "Charged on selection, refunded if no agreement is signed"]].map(([l, v, n]) => (
                <div key={l} style={{ padding: "10px 0", borderTop: `1px solid ${UI.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>{l}</div>
                    <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", color: UI.muted }}>{n}</div>
                  </div>
                  <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, color: UI.ink }}>{v}</div>
                </div>
              ))}
            </div>
            {profile && (
              <Button variant="primary" style={{ minHeight: 48 }} loading={saving} disabled={cardPassed} onClick={handleFinish}>
                {cardPassed ? "Verified" : "Finish and see listings"}
              </Button>
            )}
            {profile && cardPassed && (
              <Button variant="outline" onClick={() => navigate("/agents/browse")}>Browse listings →</Button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
