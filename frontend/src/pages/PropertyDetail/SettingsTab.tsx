import React from "react";
import { useNavigate } from "react-router-dom";
import { propertyService, type Property, type TransferRecord, type PropertyManager, type ManagerRole } from "@/services/property";
import { UpgradeGate } from "@/components/UpgradeGate";
import { useSubscription } from "@/hooks/useSubscription";
import toast from "react-hot-toast";
import { Panel, hudInputStyle } from "@/components/hud";

const MONO = "'JetBrains Mono',monospace";

export function SettingsTab({ property, currentPrincipal, onVerifyOwnership }: { property: Property; currentPrincipal: string; onVerifyOwnership?: () => void }) {
  const navigate = useNavigate();
  const { userTier } = useSubscription();
  const canShareAccess = userTier === "Pro" || userTier === "Premium";

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
    propertyService.getPendingTransfer(property.id).then((pt) => {
      if (pt && pt.from === currentPrincipal) {
        setTransferToken(pt.token);
        setTransferExpiry(new Date(pt.expiresAt));
        setTransferStep("done");
      }
    }).catch((e) => console.error("[SettingsTab] pending transfer load failed:", e));
    propertyService.getOwnershipHistory(property.id).then(setHistoryRecords).catch((e) => console.error("[SettingsTab] ownership history load failed:", e));
    propertyService.getPropertyManagers(property.id).then(setManagers).catch((e) => console.error("[SettingsTab] managers load failed:", e));
  }, [property.id, currentPrincipal]);

  const inviteUrl = inviteToken
    ? `${window.location.origin}/manage/claim/${inviteToken}`
    : null;

  const claimUrl = transferToken
    ? `${window.location.origin}/transfer/claim/${transferToken}`
    : null;

  const verificationNext =
    property.verificationLevel === "Unverified"
      ? { label: "Verify Ownership", onClick: onVerifyOwnership ?? (() => navigate(`/properties/${property.id}/verify`)), color: "var(--hg-blue)" }
      : property.verificationLevel === "Basic"
      ? { label: "Upgrade to Premium", onClick: () => navigate("/pricing"), color: "var(--hg-ink)" }
      : null;

  const section = (title: string) => (
    <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--hg-line)", background: "var(--hg-fill)" }}>
      <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-muted)" }}>{title}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Property Details */}
      <Panel style={{ overflow: "hidden" }}>
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
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1.25rem", borderBottom: i < arr.length - 1 ? "1px solid var(--hg-line)" : "none" }}>
            <span style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hg-muted)" }}>{row.label}</span>
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--hg-ink-2)" }}>{row.value}</span>
          </div>
        ))}
      </Panel>

      {/* Verification & Trust */}
      <Panel style={{ overflow: "hidden" }}>
        {section("Verification & Trust")}
        <div style={{ padding: "1.25rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: MONO, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem",
              color: property.verificationLevel === "Premium" ? "var(--hg-good)" : property.verificationLevel === "Basic" ? "var(--hg-ink)" : property.verificationLevel === "PendingReview" ? "var(--hg-yel-ink)" : "var(--hg-muted)" }}>
              {property.verificationLevel}
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--hg-muted)", fontWeight: 300, lineHeight: 1.5 }}>
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
              onClick={verificationNext.onClick}
              style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", borderRadius: 6, background: verificationNext.color, color: "#FCFCFD", border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              {verificationNext.label} →
            </button>
          )}
        </div>
      </Panel>

      {/* On-Chain Identity */}
      <Panel style={{ overflow: "hidden" }}>
        {section("On-Chain Identity")}
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: "Owner Principal", value: property.owner },
            { label: "Property ID",     value: String(property.id) },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", width: "8rem", flexShrink: 0, paddingTop: "0.1rem" }}>{row.label}</span>
              <span style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-ink-2)", wordBreak: "break-all" }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", width: "8rem", flexShrink: 0 }}>ICP Dashboard</span>
            <a
              href={`https://dashboard.internetcomputer.org/account/${property.owner}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-good)", textDecoration: "none", borderBottom: "1px solid var(--hg-good)" }}
            >
              View on ICP Explorer ↗
            </a>
          </div>
        </div>
      </Panel>

      {/* Transfer Ownership */}
      <Panel style={{ border: "1px solid var(--hg-blue-edge)", overflow: "hidden" }}>
        {section("Transfer Ownership")}
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>

          {transferStep === "idle" && (
            <>
              <p style={{ fontSize: "0.8rem", color: "var(--hg-muted)", fontWeight: 300, lineHeight: 1.6 }}>
                Generate a secure link and share it with the buyer. They'll use it to claim this property — all history, photos, and maintenance records transfer to them automatically.
              </p>
              <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-muted)", lineHeight: 1.5 }}>
                The link expires in <strong>90 days</strong>. Ownership only transfers when the buyer claims it — generating the link doesn't move anything yet.
              </p>
              {transferError && (
                <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-bad)" }}>{transferError}</p>
              )}
              <button
                onClick={async () => {
                  setTransferStep("loading");
                  setTransferError(null);
                  try {
                    const pt = await propertyService.initiateTransfer(property.id);
                    setTransferToken(pt.token);
                    setTransferExpiry(new Date(pt.expiresAt));
                    setTransferStep("done");
                  } catch (e: any) {
                    setTransferError(e.message ?? "Failed to generate transfer link.");
                    setTransferStep("idle");
                  }
                }}
                style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", borderRadius: 6, background: "var(--hg-blue)", color: "#FCFCFD", border: "none", cursor: "pointer" }}
              >
                Generate Transfer Link →
              </button>
            </>
          )}

          {transferStep === "loading" && (
            <p style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--hg-muted)" }}>Generating link…</p>
          )}

          {transferStep === "done" && claimUrl && (
            <>
              <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-muted)", lineHeight: 1.5 }}>
                Share this link with the buyer. Ownership transfers the moment they log in and accept.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                <div style={{
                  flex: 1, padding: "0.6rem 0.75rem", borderRadius: 6,
                  border: "1px solid var(--hg-line-2)", background: "var(--hg-blue-wash)",
                  fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-ink-2)",
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
                    fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "0 0.875rem", borderRadius: 6, background: copied ? "var(--hg-good)" : "var(--hg-ink)",
                    color: "#FCFCFD", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              {transferExpiry && (
                <p style={{ fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-muted)" }}>
                  Expires {transferExpiry.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
              <button
                disabled={cancelLoading}
                onClick={async () => {
                  setCancelLoading(true);
                  try {
                    await propertyService.cancelTransfer(property.id);
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
                style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.375rem 0.75rem", borderRadius: 6, background: "none", border: "1px solid var(--hg-line-2)", color: "var(--hg-muted)", cursor: "pointer" }}
              >
                {cancelLoading ? "Cancelling…" : "Cancel Transfer"}
              </button>
            </>
          )}

        </div>
      </Panel>

      {/* Ownership History */}
      {historyRecords.length > 0 && (
        <Panel style={{ overflow: "hidden" }}>
          {section("Ownership History")}
          <div>
            {historyRecords.map((r, i) => (
              <div
                key={i}
                style={{ padding: "0.875rem 1.25rem", borderBottom: i < historyRecords.length - 1 ? "1px solid var(--hg-line)" : "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)" }}>
                    {new Date(r.timestamp).toLocaleDateString()}
                  </span>
                  {r.txHash && (
                    <span style={{ fontFamily: MONO, fontSize: "0.55rem", color: "var(--hg-muted)", opacity: 0.7 }}>{r.txHash.slice(0, 16)}…</span>
                  )}
                </div>
                <div style={{ fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-ink-2)" }}>
                  <span style={{ color: "var(--hg-muted)" }}>From </span>{r.from.slice(0, 20)}…
                  <span style={{ color: "var(--hg-muted)" }}> → </span>{r.to.slice(0, 20)}…
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Access & Managers */}
      <Panel style={{ overflow: "hidden" }}>
        {section("Access & Managers")}
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          <p style={{ fontSize: "0.8rem", color: "var(--hg-muted)", fontWeight: 300, lineHeight: 1.6, margin: 0 }}>
            Grant a family member or property manager access to this property. <strong>Viewer</strong> can see all records. <strong>Manager</strong> can also add jobs, photos, and maintenance entries.
          </p>

          {managers.length > 0 && (
            <div style={{ border: "1px solid var(--hg-line)", borderRadius: 10, overflow: "hidden" }}>
              {managers.map((m, i) => (
                <div
                  key={m.principal}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: i < managers.length - 1 ? "1px solid var(--hg-line)" : "none", gap: "0.75rem" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: MONO, fontSize: "0.7rem", fontWeight: 600, color: "var(--hg-ink-2)", margin: 0, marginBottom: "0.15rem" }}>{m.displayName}</p>
                    <p style={{ fontFamily: MONO, fontSize: "0.55rem", color: "var(--hg-muted)", margin: 0, wordBreak: "break-all" }}>{m.principal}</p>
                  </div>
                  <span style={{
                    fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: 100,
                    padding: "0.2rem 0.5rem", border: `1px solid ${m.role === "Manager" ? "var(--hg-line-2)" : "var(--hg-line)"}`,
                    color: m.role === "Manager" ? "var(--hg-ink-2)" : "var(--hg-muted)", flexShrink: 0,
                  }}>
                    {m.role}
                  </span>
                  <button
                    disabled={removingManager === m.principal}
                    onClick={async () => {
                      setRemovingManager(m.principal);
                      try {
                        await propertyService.removeManager(property.id, m.principal);
                        setManagers((prev) => prev.filter((x) => x.principal !== m.principal));
                      } catch (e: any) {
                        toast.error(e.message ?? "Could not remove manager.");
                      } finally {
                        setRemovingManager(null);
                      }
                    }}
                    style={{ fontFamily: MONO, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.2rem 0.5rem", borderRadius: 6, background: "none", border: "1px solid var(--hg-line-2)", color: "var(--hg-muted)", cursor: "pointer", flexShrink: 0 }}
                  >
                    {removingManager === m.principal ? "Removing…" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {!canShareAccess && (
            <UpgradeGate
              feature="Shared property access"
              description="Invite family, a caretaker, or a co-owner to help manage this property — with role-based permissions and a full activity log."
              tier="Pro"
              style={{ background: "var(--hg-fill)", border: "1.5px solid var(--hg-line-2)", boxShadow: "none" }}
            />
          )}

          {canShareAccess && inviteStep === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)", marginBottom: "0.35rem" }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={inviteDisplayName}
                    onChange={(e) => setInviteDisplayName(e.target.value)}
                    placeholder="e.g. Sarah (daughter)"
                    style={{ ...hudInputStyle, width: "100%", fontSize: "0.7rem", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <label style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--hg-muted)" }}>Role</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {(["Viewer", "Manager"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setInviteRole(r)}
                        style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.4rem 0.75rem", borderRadius: 6, background: inviteRole === r ? "var(--hg-blue)" : "none", color: inviteRole === r ? "#FCFCFD" : "var(--hg-muted)", border: `1px solid ${inviteRole === r ? "var(--hg-blue)" : "var(--hg-line-2)"}`, cursor: "pointer" }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {inviteError && (
                <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-bad)", margin: 0 }}>{inviteError}</p>
              )}
              <button
                disabled={!inviteDisplayName.trim()}
                onClick={async () => {
                  setInviteStep("loading");
                  setInviteError(null);
                  try {
                    const invite = await propertyService.inviteManager(property.id, inviteRole, inviteDisplayName.trim());
                    setInviteToken(invite.token);
                    setInviteExpiry(new Date(invite.expiresAt));
                    setInviteStep("done");
                  } catch (e: any) {
                    setInviteError(e.message ?? "Failed to generate invite link.");
                    setInviteStep("idle");
                  }
                }}
                style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", borderRadius: 6, background: inviteDisplayName.trim() ? "var(--hg-blue)" : "var(--hg-line-2)", color: "#FCFCFD", border: "none", cursor: inviteDisplayName.trim() ? "pointer" : "default" }}
              >
                Generate Invite Link →
              </button>
            </div>
          )}

          {canShareAccess && inviteStep === "loading" && (
            <p style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--hg-muted)", margin: 0 }}>Generating invite…</p>
          )}

          {canShareAccess && inviteStep === "done" && inviteUrl && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: "var(--hg-muted)", margin: 0, lineHeight: 1.5 }}>
                Share this link with <strong>{inviteDisplayName}</strong>. They'll log in and accept the <strong>{inviteRole}</strong> role. The link expires in 90 days.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                <div style={{ flex: 1, padding: "0.6rem 0.75rem", borderRadius: 6, border: "1px solid var(--hg-line-2)", background: "var(--hg-blue-wash)", fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-ink-2)", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {inviteUrl}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl).then(() => {
                      setInviteCopied(true);
                      setTimeout(() => setInviteCopied(false), 2000);
                    });
                  }}
                  style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 0.875rem", borderRadius: 6, background: inviteCopied ? "var(--hg-good)" : "var(--hg-ink)", color: "#FCFCFD", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}
                >
                  {inviteCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              {inviteExpiry && (
                <p style={{ fontFamily: MONO, fontSize: "0.6rem", color: "var(--hg-muted)", margin: 0 }}>
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
                style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.375rem 0.75rem", borderRadius: 6, background: "none", border: "1px solid var(--hg-line-2)", color: "var(--hg-muted)", cursor: "pointer" }}
              >
                Invite Another →
              </button>
            </div>
          )}

        </div>
      </Panel>

    </div>
  );
}
