import { Gauge } from "lucide-react";
import { Checkbox } from "@/components/Checkbox";
import { relevantUsageCategories, USAGE_LABELS } from "@/services/quoteUsage";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface ShareUsageToggleProps {
  serviceType: string;
  checked:     boolean;
  onChange:    (checked: boolean) => void;
}

/**
 * Opt-in to share the utility bills relevant to a quote request's service
 * type. Renders nothing for services with no relevant utilities.
 */
export function ShareUsageToggle({ serviceType, checked, onChange }: ShareUsageToggleProps) {
  const categories = relevantUsageCategories(serviceType);
  if (categories.length === 0) return null;
  const names = categories.map((c) => USAGE_LABELS[c].toLowerCase()).join(" and ");

  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.875rem 1rem",
        border: `1px solid ${checked ? V2_COLORS.blue : V2_COLORS.border}`,
        background: checked ? V2_COLORS.lblue : V2_COLORS.paper, cursor: "pointer",
      }}
    >
      <Gauge size={15} color={V2_COLORS.blue} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.875rem", color: V2_COLORS.ink }}>
          Share my {names} usage
        </span>
        <span style={{ display: "block", fontFamily: V2_FONTS.body, fontSize: "0.75rem", lineHeight: 1.45, color: V2_COLORS.muted, marginTop: "0.15rem" }}>
          Contractors who can quote on this request see the last 12 months of {names} costs and usage, to size the job.
          No other bills are shared, and you can stop sharing at any time.
        </span>
      </span>
      <Checkbox checked={checked} onChange={onChange} aria-label={`Share my ${names} usage`} />
    </div>
  );
}
