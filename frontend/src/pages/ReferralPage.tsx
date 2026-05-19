import React, { useEffect, useState, useCallback } from "react";
import { Gift, Copy, Check, Users, DollarSign } from "lucide-react";
import { neighborReferralService, type NeighborReferral } from "@/services/neighborReferral";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

export default function ReferralPage() {
  const [code,       setCode]       = useState<string | null>(null);
  const [referrals,  setReferrals]  = useState<NeighborReferral[]>([]);
  const [credits,    setCredits]    = useState(0);
  const [copied,     setCopied]     = useState(false);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, refs, bal] = await Promise.all([
      neighborReferralService.getMyCode(),
      neighborReferralService.getMyReferrals(),
      neighborReferralService.getCreditBalance(),
    ]);
    setCode(c);
    setReferrals(refs);
    setCredits(bal);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const shareUrl = code ? neighborReferralService.buildShareUrl(code) : "";

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const converted  = referrals.filter((r) => r.convertedAt !== null).length;
  const pending    = referrals.length - converted;
  const creditsDollars = (credits / 100).toFixed(2);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`,
          borderRadius: RADIUS.pill, padding: "0.3rem 0.875rem",
          marginBottom: "0.875rem",
        }}>
          <Gift size={13} color={COLORS.sageText} />
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.sageText }}>
            Invite &amp; Earn
          </span>
        </div>
        <h1 style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1.75rem", color: COLORS.plum, margin: 0 }}>
          Invite your neighbors
        </h1>
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.9375rem", color: COLORS.plumMid, marginTop: "0.5rem", lineHeight: 1.55 }}>
          Share your link. When a neighbor signs up and completes their first month, you both get <strong style={{ color: COLORS.plum }}>$10 off</strong>.
        </p>
      </div>

      {/* Share card */}
      <div style={{
        background: COLORS.white, border: `1px solid ${COLORS.rule}`,
        borderRadius: RADIUS.card, padding: "1.5rem",
        boxShadow: SHADOWS.card, marginBottom: "1.5rem",
      }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.625rem" }}>
          Your referral link
        </p>

        {loading ? (
          <div style={{ height: 44, background: COLORS.sageLight, borderRadius: RADIUS.input, animation: "pulse 1.5s ease infinite" }} />
        ) : (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              readOnly
              value={shareUrl}
              style={{
                flex: 1, fontFamily: FONTS.mono, fontSize: "0.8rem",
                color: COLORS.plum, background: COLORS.sageLight,
                border: `1px solid ${COLORS.sageMid}`, borderRadius: RADIUS.input,
                padding: "0.6rem 0.875rem", outline: "none", minWidth: 0,
              }}
            />
            <button
              onClick={handleCopy}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                background: copied ? COLORS.sage : COLORS.plum,
                color: COLORS.white, border: "none",
                borderRadius: RADIUS.input, padding: "0.6rem 1rem",
                fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.2s",
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {/* Pre-written share messages */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          {[
            { label: "Text", href: `sms:?body=${encodeURIComponent(`I use HomeGentic to manage my home — it's genuinely useful. You can get $10 off your first month with my link: ${shareUrl}`)}` },
            { label: "Email", href: `mailto:?subject=${encodeURIComponent("Try HomeGentic — $10 off for you")}&body=${encodeURIComponent(`Hey,\n\nI've been using HomeGentic to track maintenance, contractors, and home value. Thought you might like it too.\n\nUse my link and you'll get $10 off your first month:\n${shareUrl}\n\nLet me know what you think!`)}` },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{
                fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 500,
                color: COLORS.sageText, background: COLORS.sageLight,
                border: `1px solid ${COLORS.sageMid}`, borderRadius: RADIUS.pill,
                padding: "0.35rem 0.875rem", textDecoration: "none",
              }}
            >
              Share via {label}
            </a>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { icon: <Users size={16} color={COLORS.sageText} />, value: referrals.length, label: "Invited" },
          { icon: <Check   size={16} color={COLORS.sageText} />, value: converted,        label: "Converted" },
          { icon: <DollarSign size={16} color={COLORS.sageText} />, value: `$${creditsDollars}`, label: "Credit earned" },
        ].map(({ icon, value, label }) => (
          <div key={label} style={{
            background: COLORS.white, border: `1px solid ${COLORS.rule}`,
            borderRadius: RADIUS.card, padding: "1rem",
            textAlign: "center", boxShadow: SHADOWS.card,
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.375rem" }}>{icon}</div>
            <div style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1.4rem", color: COLORS.plum }}>{value}</div>
            <div style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, marginTop: "0.125rem" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Referral list */}
      {referrals.length > 0 && (
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.card, overflow: "hidden", boxShadow: SHADOWS.card }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${COLORS.rule}` }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, margin: 0 }}>
              Your referrals
            </p>
          </div>
          {referrals.map((r, i) => (
            <div key={r.referee} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.875rem 1.25rem",
              borderBottom: i < referrals.length - 1 ? `1px solid ${COLORS.rule}` : "none",
            }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.78rem", color: COLORS.plum }}>
                {r.referee.slice(0, 12)}…
              </span>
              <span style={{
                fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "0.25rem 0.625rem",
                borderRadius: RADIUS.pill,
                background: r.convertedAt !== null ? COLORS.sageLight : COLORS.butter,
                color:      r.convertedAt !== null ? COLORS.sageText   : "#7A5C1E",
                border: `1px solid ${r.convertedAt !== null ? COLORS.sageMid : "#E8D48A"}`,
              }}>
                {r.convertedAt !== null ? "Converted" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ marginTop: "2rem", padding: "1.25rem", background: COLORS.sageLight, borderRadius: RADIUS.card, border: `1px solid ${COLORS.sageMid}` }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.sageText, marginBottom: "0.75rem" }}>
          How it works
        </p>
        {[
          "Share your link with a neighbor.",
          "They sign up and complete their first paid month.",
          "You each receive $10 credit applied to your next bill.",
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", gap: "0.75rem", marginBottom: i < 2 ? "0.5rem" : 0 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.7rem", color: COLORS.sageText, fontWeight: 700, flexShrink: 0, minWidth: "1rem" }}>{i + 1}.</span>
            <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plum, lineHeight: 1.5 }}>{step}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
