import React, { useState, useEffect } from "react";
import { Upload, Zap, Trash2, TrendingUp, ExternalLink, PhoneCall } from "lucide-react";
import { Button } from "@/components/Button";
import {
  billService, extractBill, TierLimitReachedError,
  type BillRecord, type BillExtraction, type BillType,
} from "@/services/billService";
import {
  getUsageTrend, analyzeEfficiencyTrend, findRebates, negotiateTelecom,
  type RebateResult, type TelecomNegotiationResult,
} from "@/services/billsIntelligence";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";
import toast from "react-hot-toast";

const BILL_TYPE_LABELS: Record<BillType, string> = {
  Electric: "Electric",
  Gas:      "Gas",
  Water:    "Water",
  Internet: "Internet",
  Telecom:  "Telecom/Cable",
  Other:    "Other",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function BillsTab({ propertyId }: { propertyId: string }) {
  const [bills,         setBills]         = useState<BillRecord[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [extraction,    setExtraction]    = useState<BillExtraction | null>(null);
  const [confirmArgs,   setConfirmArgs]   = useState<Partial<BillRecord> | null>(null);
  const fileInputRef                      = React.useRef<HTMLInputElement>(null);

  const [efficiencyRec,   setEfficiencyRec]   = useState<string | null>(null);
  const [efficiencyWaste, setEfficiencyWaste] = useState<number | null>(null);

  const [rebates,        setRebates]        = useState<RebateResult[] | null>(null);
  const [loadingRebates, setLoadingRebates] = useState(false);

  const [telecomResult,   setTelecomResult]   = useState<TelecomNegotiationResult | null>(null);
  const [telecomBillId,   setTelecomBillId]   = useState<string | null>(null);
  const [loadingTelecom,  setLoadingTelecom]  = useState(false);

  useEffect(() => {
    billService.getBillsForProperty(propertyId)
      .then(async (fetched) => {
        setBills(fetched);

        const elecTrend  = await getUsageTrend(propertyId, "Electric", 12).catch(() => []);
        const waterTrend = await getUsageTrend(propertyId, "Water", 12).catch(() => []);
        const trend = elecTrend.length >= waterTrend.length ? elecTrend : waterTrend;
        if (trend.length >= 3) {
          const analysis = analyzeEfficiencyTrend(trend);
          if (analysis.degradationDetected) {
            setEfficiencyRec(analysis.recommendation ?? null);
            setEfficiencyWaste(analysis.estimatedAnnualWaste ?? null);
          }
        }

        const hasElectric = fetched.some((b) => b.billType === "Electric");
        if (hasElectric) {
          setLoadingRebates(true);
          findRebates({ state: "FL", zipCode: "32801", utilityProvider: fetched.find((b) => b.billType === "Electric")?.provider ?? "Unknown", billType: "Electric" })
            .then(setRebates)
            .catch((e) => console.error("[BillsTab] rebates load failed:", e))
            .finally(() => setLoadingRebates(false));
        }
      })
      .catch((e) => console.error("[BillsTab] bills load failed:", e))
      .finally(() => setLoading(false));
  }, [propertyId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setExtraction(null);
    try {
      const base64Data = await fileToBase64(file);
      const result = await extractBill(file.name, file.type, base64Data);
      setExtraction(result);
      setConfirmArgs({
        billType:    result.billType ?? "Other",
        provider:    result.provider ?? "",
        periodStart: result.periodStart ?? "",
        periodEnd:   result.periodEnd ?? "",
        amountCents: result.amountCents ?? 0,
        usageAmount: result.usageAmount,
        usageUnit:   result.usageUnit,
      });
    } catch {
      toast.error("Could not extract bill data. Please fill in the details manually.");
      setConfirmArgs({ billType: "Other", provider: "", periodStart: "", periodEnd: "", amountCents: 0 });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirmSave() {
    if (!confirmArgs) return;
    try {
      const saved = await billService.addBill({
        propertyId,
        billType:    (confirmArgs.billType as BillType) ?? "Other",
        provider:    confirmArgs.provider ?? "",
        periodStart: confirmArgs.periodStart ?? "",
        periodEnd:   confirmArgs.periodEnd ?? "",
        amountCents: confirmArgs.amountCents ?? 0,
        usageAmount: confirmArgs.usageAmount,
        usageUnit:   confirmArgs.usageUnit,
      });
      setBills((prev) => [saved, ...prev]);
      setConfirmArgs(null);
      setExtraction(null);
      toast.success("Bill saved.");
      if (saved.anomalyFlag) {
        toast(`Anomaly detected: ${saved.anomalyReason}`, { icon: "⚠️", duration: 6000 });
      }
    } catch (err) {
      if (err instanceof TierLimitReachedError) {
        toast.error(err.message, { duration: 8000, icon: "🔒" });
      } else {
        toast.error("Failed to save bill.");
      }
    }
  }

  async function handleDelete(id: string) {
    try {
      await billService.deleteBill(id);
      setBills((prev) => prev.filter((b) => b.id !== id));
      toast.success("Bill removed.");
    } catch {
      toast.error("Failed to remove bill.");
    }
  }

  async function handleNegotiateTelecom(bill: BillRecord) {
    if (!bill.amountCents) return;
    setLoadingTelecom(true);
    setTelecomBillId(bill.id);
    try {
      const result = await negotiateTelecom({
        provider:    bill.provider,
        amountCents: bill.amountCents,
        mbps:        bill.usageAmount ?? 100,
        zipCode:     "32801",
      });
      setTelecomResult(result);
    } catch {
      toast.error("Could not generate negotiation script. Try again later.");
    } finally {
      setLoadingTelecom(false);
    }
  }

  const ink      = V2_COLORS.ink;
  const rule     = V2_COLORS.border;
  const inkLight = V2_COLORS.muted;

  return (
    <div style={{ padding: "2rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h3 style={{ fontFamily: V2_FONTS.display, fontSize: "1.25rem", fontWeight: 700, color: ink, margin: 0 }}>
            Utility Bills
          </h3>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: inkLight, margin: "0.25rem 0 0" }}>
            Upload bills to track usage, detect anomalies, and surface savings opportunities.
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload size={14} style={{ marginRight: "0.4rem" }} />
          {uploading ? "Extracting…" : "Upload Bill"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {confirmArgs && (
        <div style={{ border: `1px solid ${rule}`, background: V2_COLORS.paper, padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h4 style={{ fontFamily: V2_FONTS.display, fontSize: "1rem", fontWeight: 700, color: ink, margin: "0 0 0.25rem" }}>
            Confirm Bill Details
          </h4>
          {extraction && (
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: inkLight, margin: "0 0 1rem" }}>
              {extraction.description} (confidence: {extraction.confidence})
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight }}>Bill Type</span>
              <select
                value={confirmArgs.billType ?? "Other"}
                onChange={(e) => setConfirmArgs((p) => ({ ...p!, billType: e.target.value as BillType }))}
                style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
              >
                {(Object.keys(BILL_TYPE_LABELS) as BillType[]).map((t) => (
                  <option key={t} value={t}>{BILL_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight }}>Provider</span>
              <input
                type="text"
                value={confirmArgs.provider ?? ""}
                onChange={(e) => setConfirmArgs((p) => ({ ...p!, provider: e.target.value }))}
                placeholder="e.g. FPL, TECO"
                style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight }}>Period Start</span>
              <input
                type="date"
                value={confirmArgs.periodStart ?? ""}
                onChange={(e) => setConfirmArgs((p) => ({ ...p!, periodStart: e.target.value }))}
                style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight }}>Period End</span>
              <input
                type="date"
                value={confirmArgs.periodEnd ?? ""}
                onChange={(e) => setConfirmArgs((p) => ({ ...p!, periodEnd: e.target.value }))}
                style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight }}>Amount ($)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={confirmArgs.amountCents != null ? (confirmArgs.amountCents / 100).toFixed(2) : ""}
                onChange={(e) => setConfirmArgs((p) => ({ ...p!, amountCents: Math.round(parseFloat(e.target.value) * 100) || 0 }))}
                placeholder="0.00"
                style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight }}>Usage (optional)</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  min={0}
                  value={confirmArgs.usageAmount ?? ""}
                  onChange={(e) => setConfirmArgs((p) => ({ ...p!, usageAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="842"
                  style={{ flex: 1, fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
                />
                <select
                  value={confirmArgs.usageUnit ?? "kWh"}
                  onChange={(e) => setConfirmArgs((p) => ({ ...p!, usageUnit: e.target.value }))}
                  style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", padding: "0.4rem 0.5rem", border: `1px solid ${rule}`, color: ink, background: V2_COLORS.paper }}
                >
                  <option value="kWh">kWh</option>
                  <option value="gallons">gallons</option>
                  <option value="therms">therms</option>
                  <option value="Mbps">Mbps</option>
                </select>
              </div>
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Button onClick={handleConfirmSave}>Save Bill</Button>
            <Button
              onClick={() => { setConfirmArgs(null); setExtraction(null); }}
              style={{ background: "transparent", border: `1px solid ${rule}`, color: inkLight }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <div className="spinner-lg" />
        </div>
      ) : bills.length === 0 && !confirmArgs ? (
        <div style={{ textAlign: "center", padding: "3rem", color: inkLight, fontFamily: V2_FONTS.body, fontSize: "0.9rem" }}>
          No bills uploaded yet. Upload a utility bill to start tracking.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${rule}` }}>
              {["Type", "Provider", "Period", "Amount", "Usage", ""].map((h) => (
                <th key={h} style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkLight, textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...bills].sort((a, b) => b.uploadedAt - a.uploadedAt).map((bill) => (
              <tr key={bill.id} style={{ borderBottom: `1px solid ${rule}` }}>
                <td style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: ink, padding: "0.75rem" }}>
                  {BILL_TYPE_LABELS[bill.billType]}
                </td>
                <td style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: ink, padding: "0.75rem" }}>
                  {bill.provider}
                </td>
                <td style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: inkLight, padding: "0.75rem", whiteSpace: "nowrap" as const }}>
                  {bill.periodStart} → {bill.periodEnd}
                </td>
                <td style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: ink, padding: "0.75rem", fontWeight: 600 }}>
                  ${(bill.amountCents / 100).toFixed(2)}
                </td>
                <td style={{ fontFamily: V2_FONTS.body, fontSize: "0.8rem", color: inkLight, padding: "0.75rem" }}>
                  {bill.usageAmount != null && bill.usageUnit
                    ? `${bill.usageAmount.toLocaleString()} ${bill.usageUnit}`
                    : "—"}
                </td>
                <td style={{ padding: "0.75rem", whiteSpace: "nowrap" as const }}>
                  {bill.anomalyFlag && (
                    <span
                      title={bill.anomalyReason}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: V2_FONTS.body, fontSize: "0.7rem", color: V2_COLORS.coralText, marginRight: "0.75rem" }}
                    >
                      <Zap size={12} /> Anomaly
                    </span>
                  )}
                  {(bill.billType === "Internet" || bill.billType === "Telecom") && (
                    <button
                      onClick={() => handleNegotiateTelecom(bill)}
                      disabled={loadingTelecom && telecomBillId === bill.id}
                      title="Negotiate your bill"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "none", border: `1px solid ${V2_COLORS.blue}`, borderRadius: "4px", cursor: "pointer", color: V2_COLORS.blue, padding: "0.2rem 0.5rem", fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.06em", marginRight: "0.5rem" }}
                    >
                      <PhoneCall size={10} />
                      {loadingTelecom && telecomBillId === bill.id ? "…" : "Negotiate"}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(bill.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: inkLight, padding: "0.25rem" }}
                    title="Remove bill"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {efficiencyRec && (
        <div style={{ marginTop: "1.5rem", padding: "1.25rem 1.5rem", background: V2_COLORS.attentionBg, border: `1px solid ${V2_COLORS.border}`, borderRadius: V2_RADIUS.card, display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <TrendingUp size={18} color={V2_COLORS.ink} style={{ flexShrink: 0, marginTop: "0.15rem" }} />
          <div>
            <p style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1rem", color: V2_COLORS.ink, margin: "0 0 0.375rem" }}>
              Usage trend detected
            </p>
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", fontWeight: 300, color: V2_COLORS.muted, margin: 0, lineHeight: 1.6 }}>
              {efficiencyRec}
              {efficiencyWaste != null && (
                <> Estimated annual waste: <strong>{efficiencyWaste.toLocaleString(undefined, { maximumFractionDigits: 0 })} units</strong>.</>
              )}
            </p>
          </div>
        </div>
      )}

      {(loadingRebates || (rebates && rebates.length > 0)) && (
        <div style={{ marginTop: "1.5rem" }}>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: V2_COLORS.muted, marginBottom: "0.75rem" }}>
            Available Rebates
          </p>
          {loadingRebates ? (
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: V2_COLORS.muted }}>Loading rebate programs…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {rebates!.map((r) => (
                <div key={r.name} style={{ padding: "1rem 1.25rem", background: V2_COLORS.lblue, border: `1px solid ${V2_COLORS.border}`, borderRadius: V2_RADIUS.sm, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <div>
                    <p style={{ fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.875rem", color: V2_COLORS.ink, margin: "0 0 0.25rem" }}>{r.name}</p>
                    <p style={{ fontFamily: V2_FONTS.body, fontWeight: 300, fontSize: "0.8rem", color: V2_COLORS.muted, margin: 0, lineHeight: 1.55 }}>{r.description}</p>
                    <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.06em", color: V2_COLORS.muted, margin: "0.375rem 0 0" }}>{r.provider}</p>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <p style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1rem", color: V2_COLORS.blue, margin: "0 0 0.25rem" }}>{r.estimatedAmount}</p>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: V2_FONTS.body, fontSize: "0.6rem", color: V2_COLORS.blue, textDecoration: "none" }}>
                        Apply <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {telecomResult && (
        <div style={{ marginTop: "1.5rem", padding: "1.25rem 1.5rem", background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.blue}`, borderRadius: V2_RADIUS.card }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.75rem" }}>
            <PhoneCall size={16} color={V2_COLORS.blue} />
            <p style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1rem", color: V2_COLORS.ink, margin: 0 }}>
              Negotiation Script
            </p>
            <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: "100px", background: telecomResult.verdict === "overpaying" ? V2_COLORS.attentionBg : V2_COLORS.lblue, color: telecomResult.verdict === "overpaying" ? V2_COLORS.coralText : V2_COLORS.blue }}>
              {telecomResult.verdict === "overpaying" ? "Overpaying" : telecomResult.verdict === "fair" ? "Fair rate" : "Good deal"}
            </span>
          </div>
          {telecomResult.savingsOpportunityCents > 0 && (
            <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: V2_COLORS.muted, margin: "0 0 0.75rem" }}>
              You may be paying <strong>${(telecomResult.savingsOpportunityCents / 100).toFixed(0)}/mo</strong> above the median rate of <strong>${(telecomResult.medianCents / 100).toFixed(0)}/mo</strong> for your area.
            </p>
          )}
          <div style={{ padding: "1rem", background: V2_COLORS.lblue, borderRadius: V2_RADIUS.sm, fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
            {telecomResult.negotiationScript}
          </div>
          <button onClick={() => setTelecomResult(null)} style={{ marginTop: "0.75rem", background: "none", border: "none", cursor: "pointer", fontFamily: V2_FONTS.body, fontSize: "0.6rem", color: V2_COLORS.muted, letterSpacing: "0.06em" }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
