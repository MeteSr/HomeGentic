import React from "react";
import { useNavigate } from "react-router-dom";
import { propertyService, type Property, type TransferRecord, type PropertyManager, type ManagerRole } from "@/services/property";
import { COLORS, FONTS } from "@/theme";
import toast from "react-hot-toast";

export function SettingsTab({ property, currentPrincipal }: { property: Property; currentPrincipal: string }) {
  const TC = {
    rule:     COLORS.rule,
    inkLight: COLORS.plumMid,
    ink:      COLORS.plum,
    rust:     COLORS.sage,
    sage:     COLORS.sage,
    paper:    COLORS.white,
    serif:    FONTS.serif,
    mono:     FONTS.mono,
  };
  const navigate = useNavigate();

  const [transferStep,   setTransferStep]   = React.useState<"idle" | "loading" | "done">("idle");
  const [transferToken,  setTransferToken]  = React.useState<string | null>(null);
  const [transferExpiry, setTransferExpiry] = React.useState<Date | null>(null);
  const [transferError,  setTransferError]  = React.useState<string | null>(null);
  const [copied,         setCopied]         = React.useState(false);
  const [cancelLoading,  setCancelLoading]  = React.useState(false);

  const [historyRecords, setHistoryRecords] = React.useState<TransferRecord[]>([]);

  const [managers,          setManagers]          = React.useState<PropertyManager[]>([]);
  const [removingManager,   setRemovingManager]   = React.useState<string | null>(null);
  const [inviteDisplayName, setInviteDisplayName] = React.useState("");
  const [inviteRole,        setInviteRole]        = React.useState<ManagerRole>("Viewer");
  const [inviteStep,        setInviteStep]        = React.useState<"idle" | "loading" | "done">("idle");
  const [inviteToken,       setInviteToken]       = React.useState<string | null>(null);
  const [inviteExpiry,      setInviteExpiry]      = React.useState<Date | null>(null);
  const [inviteError,       setInviteError]       = React.useState<string | null>(null);
  const [inviteCopied,      setInviteCopied]      = React.useState(false);

  React.useEffect(() => {
    propertyService.getPendingTransfer(BigInt(property.id)).then((pt) => {
      if (pt && pt.from === currentPrincipal) {
        setTransferToken(pt.token);
        setTransferExpiry(new Date(pt.expiresAt));
        setTransferStep("done");
      }
    }).catch(() => {});
    propertyService.getOwnershipHistory(BigInt(property.id)).then(setHistoryRecords).catch(() => {});
    propertyService.getPropertyManagers(BigInt(property.id)).then(setManagers).catch(() => {});
  }, [property.id, currentPrincipal]);

  const inviteUrl = inviteToken
    ? `${window.location.origin}/manage/claim/${inviteToken}`
    : null;

  const claimUrl = transferToken
    ? `${window.location.origin}/transfer/claim/${transferToken}`
    : null;

  const verificationNext =
    property.verificationLevel === "Unverified"
      ? { label: "Verify Ownership", href: `/properties/${property.id}/verify`, color: TC.rust }
      : property.verificationLevel === "Basic"
      ? { label: "Upgrade to Premium", href: "/pricing", color: TC.ink }
      : null;

  const section = (title: string) => (
    <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${TC.rule}`, background: TC.paper }}>
      <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: TC.inkLight }}>{title}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Property Details */}
      <div style={{ border: `1px solid ${TC.rule}` }}>
        {section("Property Details")}
        {[
          { label: "Address",     value: property.address },
          { label: "City",        value: property.city },
          { label: "State",       value: property.state },
          { label: "ZIP Code",    value: property.zipCode },
          { label: "Type",        value: property.propertyType },
          { label: "Year Built",  value: String(property.yearBuilt) },
          { label: "Square Feet", value: `${Number(property.squareFeet).toLocaleString()} sq ft` },
        ].map((row, i, arr) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1.25rem", borderBottom: i < arr.length - 1 ? `1px solid ${TC.rule}` : "none", background: "#fff" }}>
            <span style={{ fontFamily: TC.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: TC.inkLight }}>{row.label}</span>
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: TC.ink }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Verification & Trust */}
      <div style={{ border: `1px solid ${TC.rule}` }}>
        {section("Verification & Trust")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem",
              color: property.verificationLevel === "Premium" ? TC.sage : property.verificationLevel === "Basic" ? COLORS.plum : property.verificationLevel === "PendingReview" ? COLORS.plumMid : TC.inkLight }}>
              {property.verificationLevel}
            </p>
            <p style={{ fontSize: "0.8rem", color: TC.inkLight, fontWeight: 300, lineHeight: 1.5 }}>
              {property.verificationLevel === "Premium"
                ? "Fully verified — buyers and lenders trust this record."
                : property.verificationLevel === "Basic"
                ? "Basic verification complete. Upgrade for full buyer trust."
                : property.verificationLevel === "PendingReview"
                ? "Your documents are under review. We'll notify you when done."
                : "Not yet verified. Upload ownership documents to unlock report sharing."}
            </p>
          </div>
          {verificationNext && (
            <button
              onClick={() => navigate(verificationNext.href)}
              style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: verificationNext.color, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              {verificationNext.label} →
            </button>
          )}
        </div>
      </div>

      {/* Plan & Limits */}
      <div style={{ border: `1px solid ${TC.rule}` }}>
        {section("Plan & Limits")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: TC.serif, fontWeight: 900, fontSize: "1.1rem", color: TC.ink, marginBottom: "0.25rem" }}>
              {property.tier ?? "Free"}
            </p>
            <p style={{ fontSize: "0.8rem", color: TC.inkLight, fontWeight: 300, lineHeight: 1.5 }}>
              {property.tier === "Pro"
                ? "5 properties · 10 photos per job · 10 open quotes"
                : property.tier === "Premium"
                ? "20 properties · 30 photos per job · full history exports"
                : "1 property · 2 photos per job · 3 open quotes"}
            </p>
          </div>
          {(!property.tier || property.tier === "Free") && (
            <button
              onClick={() => navigate("/pricing")}
              style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: TC.ink, color: TC.paper, border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              Upgrade Plan →
            </button>
          )}
        </div>
      </div>

      {/* On-Chain Identity */}
      <div style={{ border: `1px solid ${TC.rule}` }}>
        {section("On-Chain Identity")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: "Owner Principal", value: property.owner },
            { label: "Property ID",     value: String(property.id) },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, width: "8rem", flexShrink: 0, paddingTop: "0.1rem" }}>{row.label}</span>
              <span style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.ink, wordBreak: "break-all" }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, width: "8rem", flexShrink: 0 }}>ICP Dashboard</span>
            <a
              href={`https://dashboard.internetcomputer.org/account/${property.owner}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.sage, textDecoration: "none", borderBottom: `1px solid ${TC.sage}` }}
            >
              View on ICP Explorer ↗
            </a>
          </div>
        </div>
      </div>

      {/* Transfer Ownership */}
      <div style={{ border: `1px solid ${TC.rust}` }}>
        {section("Transfer Ownership")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", flexDirection: "column", gap: "0.875rem" }}>

          {transferStep === "idle" && (
            <>
              <p style={{ fontSize: "0.8rem", color: TC.inkLight, fontWeight: 300, lineHeight: 1.6 }}>
                Generate a secure link and share it with the buyer. They'll use it to claim this property — all history, photos, and maintenance records transfer to them automatically.
              </p>
              <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.inkLight, lineHeight: 1.5 }}>
                The link expires in <strong>90 days</strong>. Ownership only transfers when the buyer claims it — generating the link doesn't move anything yet.
              </p>
              {transferError && (
                <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.rust }}>{transferError}</p>
              )}
              <button
                onClick={async () => {
                  setTransferStep("loading");
                  setTransferError(null);
                  try {
                    const pt = await propertyService.initiateTransfer(BigInt(property.id));
                    setTransferToken(pt.token);
                    setTransferExpiry(new Date(pt.expiresAt));
                    setTransferStep("done");
                  } catch (e: any) {
                    setTransferError(e.message ?? "Failed to generate transfer link.");
                    setTransferStep("idle");
                  }
                }}
                style={{ alignSelf: "flex-start", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: TC.rust, color: "#fff", border: "none", cursor: "pointer" }}
              >
                Generate Transfer Link →
              </button>
            </>
          )}

          {transferStep === "loading" && (
            <p style={{ fontFamily: TC.mono, fontSize: "0.7rem", color: TC.inkLight }}>Generating link…</p>
          )}

          {transferStep === "done" && claimUrl && (
            <>
              <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.inkLight, lineHeight: 1.5 }}>
                Share this link with the buyer. Ownership transfers the moment they log in and accept.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                <div style={{
                  flex: 1, padding: "0.6rem 0.75rem",
                  border: `1px solid ${TC.rule}`, background: COLORS.sageLight,
                  fontFamily: TC.mono, fontSize: "0.6rem", color: TC.ink,
                  wordBreak: "break-all", lineHeight: 1.5,
                }}>
                  {claimUrl}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(claimUrl).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  style={{
                    fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "0 0.875rem", background: copied ? TC.sage : TC.ink,
                    color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              {transferExpiry && (
                <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", color: TC.inkLight }}>
                  Expires {transferExpiry.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
              <button
                disabled={cancelLoading}
                onClick={async () => {
                  setCancelLoading(true);
                  try {
                    await propertyService.cancelTransfer(BigInt(property.id));
                    setTransferToken(null);
                    setTransferExpiry(null);
                    setTransferStep("idle");
                    toast.success("Transfer link cancelled.");
                  } catch (e: any) {
                    toast.error(e.message ?? "Could not cancel transfer.");
                  } finally {
                    setCancelLoading(false);
                  }
                }}
                style={{ alignSelf: "flex-start", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.375rem 0.75rem", background: "none", border: `1px solid ${TC.rule}`, color: TC.inkLight, cursor: "pointer" }}
              >
                {cancelLoading ? "Cancelling…" : "Cancel Transfer"}
              </button>
            </>
          )}

        </div>
      </div>

      {/* Ownership History */}
      {historyRecords.length > 0 && (
        <div style={{ border: `1px solid ${TC.rule}` }}>
          {section("Ownership History")}
          <div style={{ background: "#fff" }}>
            {historyRecords.map((r, i) => (
              <div
                key={i}
                style={{ padding: "0.875rem 1.25rem", borderBottom: i < historyRecords.length - 1 ? `1px solid ${TC.rule}` : "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight }}>
                    {new Date(r.timestamp).toLocaleDateString()}
                  </span>
                  {r.txHash && (
                    <span style={{ fontFamily: TC.mono, fontSize: "0.55rem", color: TC.inkLight, opacity: 0.7 }}>{r.txHash.slice(0, 16)}…</span>
                  )}
                </div>
                <div style={{ fontFamily: TC.mono, fontSize: "0.6rem", color: TC.ink }}>
                  <span style={{ color: TC.inkLight }}>From </span>{r.from.slice(0, 20)}…
                  <span style={{ color: TC.inkLight }}> → </span>{r.to.slice(0, 20)}…
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Access & Managers */}
      <div style={{ border: `1px solid ${TC.rule}` }}>
        {section("Access & Managers")}
        <div style={{ padding: "1.25rem", background: "#fff", display: "flex", flexDirection: "column", gap: "1rem" }}>

          <p style={{ fontSize: "0.8rem", color: TC.inkLight, fontWeight: 300, lineHeight: 1.6, margin: 0 }}>
            Grant a family member or property manager access to this property. <strong>Viewer</strong> can see all records. <strong>Manager</strong> can also add jobs, photos, and maintenance entries.
          </p>

          {managers.length > 0 && (
            <div style={{ border: `1px solid ${TC.rule}` }}>
              {managers.map((m, i) => (
                <div
                  key={m.principal}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: i < managers.length - 1 ? `1px solid ${TC.rule}` : "none", gap: "0.75rem" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: TC.mono, fontSize: "0.7rem", fontWeight: 600, color: TC.ink, margin: 0, marginBottom: "0.15rem" }}>{m.displayName}</p>
                    <p style={{ fontFamily: TC.mono, fontSize: "0.55rem", color: TC.inkLight, margin: 0, wordBreak: "break-all" }}>{m.principal}</p>
                  </div>
                  <span style={{
                    fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "0.2rem 0.5rem", border: `1px solid ${m.role === "Manager" ? TC.ink : TC.rule}`,
                    color: m.role === "Manager" ? TC.ink : TC.inkLight, flexShrink: 0,
                  }}>
                    {m.role}
                  </span>
                  <button
                    disabled={removingManager === m.principal}
                    onClick={async () => {
                      setRemovingManager(m.principal);
                      try {
                        await propertyService.removeManager(BigInt(property.id), m.principal);
                        setManagers((prev) => prev.filter((x) => x.principal !== m.principal));
                      } catch (e: any) {
                        toast.error(e.message ?? "Could not remove manager.");
                      } finally {
                        setRemovingManager(null);
                      }
                    }}
                    style={{ fontFamily: TC.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${TC.rule}`, color: TC.inkLight, cursor: "pointer", flexShrink: 0 }}
                  >
                    {removingManager === m.principal ? "Removing…" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {inviteStep === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight, marginBottom: "0.35rem" }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={inviteDisplayName}
                    onChange={(e) => setInviteDisplayName(e.target.value)}
                    placeholder="e.g. Sarah (daughter)"
                    style={{ width: "100%", fontFamily: TC.mono, fontSize: "0.7rem", padding: "0.5rem 0.6rem", border: `1px solid ${TC.rule}`, background: "#fff", color: TC.ink, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <label style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: TC.inkLight }}>Role</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {(["Viewer", "Manager"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setInviteRole(r)}
                        style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.4rem 0.75rem", background: inviteRole === r ? TC.ink : "none", color: inviteRole === r ? "#fff" : TC.inkLight, border: `1px solid ${inviteRole === r ? TC.ink : TC.rule}`, cursor: "pointer" }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {inviteError && (
                <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.rust, margin: 0 }}>{inviteError}</p>
              )}
              <button
                disabled={!inviteDisplayName.trim()}
                onClick={async () => {
                  setInviteStep("loading");
                  setInviteError(null);
                  try {
                    const invite = await propertyService.inviteManager(BigInt(property.id), inviteRole, inviteDisplayName.trim());
                    setInviteToken(invite.token);
                    setInviteExpiry(new Date(invite.expiresAt));
                    setInviteStep("done");
                  } catch (e: any) {
                    setInviteError(e.message ?? "Failed to generate invite link.");
                    setInviteStep("idle");
                  }
                }}
                style={{ alignSelf: "flex-start", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", background: inviteDisplayName.trim() ? TC.ink : TC.rule, color: "#fff", border: "none", cursor: inviteDisplayName.trim() ? "pointer" : "default" }}
              >
                Generate Invite Link →
              </button>
            </div>
          )}

          {inviteStep === "loading" && (
            <p style={{ fontFamily: TC.mono, fontSize: "0.7rem", color: TC.inkLight, margin: 0 }}>Generating invite…</p>
          )}

          {inviteStep === "done" && inviteUrl && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontFamily: TC.mono, fontSize: "0.65rem", color: TC.inkLight, margin: 0, lineHeight: 1.5 }}>
                Share this link with <strong>{inviteDisplayName}</strong>. They'll log in and accept the <strong>{inviteRole}</strong> role. The link expires in 90 days.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                <div style={{ flex: 1, padding: "0.6rem 0.75rem", border: `1px solid ${TC.rule}`, background: COLORS.sageLight, fontFamily: TC.mono, fontSize: "0.6rem", color: TC.ink, wordBreak: "break-all", lineHeight: 1.5 }}>
                  {inviteUrl}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl).then(() => {
                      setInviteCopied(true);
                      setTimeout(() => setInviteCopied(false), 2000);
                    });
                  }}
                  style={{ fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 0.875rem", background: inviteCopied ? TC.sage : TC.ink, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}
                >
                  {inviteCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              {inviteExpiry && (
                <p style={{ fontFamily: TC.mono, fontSize: "0.6rem", color: TC.inkLight, margin: 0 }}>
                  Expires {inviteExpiry.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
              <button
                onClick={() => {
                  setInviteStep("idle");
                  setInviteToken(null);
                  setInviteExpiry(null);
                  setInviteDisplayName("");
                  setInviteRole("Viewer");
                }}
                style={{ alignSelf: "flex-start", fontFamily: TC.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.375rem 0.75rem", background: "none", border: `1px solid ${TC.rule}`, color: TC.inkLight, cursor: "pointer" }}
              >
                Invite Another →
              </button>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
