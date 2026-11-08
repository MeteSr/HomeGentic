import React, { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, SectionHeader, hudButtonStyle, hudInputStyle } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
import type { IcsEvent } from "@homegentic/shared/ics";
import { floridaTaxEvents } from "@/services/calendarEvents";
import { errorMessage } from "@/services/candid";
import {
  propertyTaxService,
  validateTaxYear,
  assessedChange,
  EMPTY_TAX_YEAR,
  type TaxYear,
} from "@/services/propertyTax";
import {
  FLORIDA_TAX_SOURCES,
  floridaTaxReminders,
  isFloridaState,
  type TaxExemption,
  type TaxReminder,
} from "@homegentic/shared/propertyTax";
import { formatIsoDate } from "@/utils/format";
import { DateInput, Problem } from "./HoaTab";
import { money } from "./MortgageSection";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const muted: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };
const cell: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.875rem",
  color: "var(--hg-ink)",
  padding: "0.5rem 0.75rem",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "1rem",
};
const iconButton: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--hg-muted)",
  padding: "0.25rem",
};

export const EXEMPTION_LABELS: Record<TaxExemption, string> = {
  Unknown: "Not marked",
  NotApplying: "Not applying",
  Applied: "Applied",
  Granted: "Granted",
  Denied: "Denied",
};

interface Form {
  year: string;
  marketValue: string;
  assessedValue: string;
  taxableValue: string;
  exemption: TaxExemption;
  petitionDeadline: string;
  notes: string;
}

const text = (n: number | null) => (n === null ? "" : String(n));
const toForm = (y: TaxYear): Form => ({
  year: String(y.year),
  marketValue: text(y.marketValue),
  assessedValue: text(y.assessedValue),
  taxableValue: text(y.taxableValue),
  exemption: y.exemption,
  petitionDeadline: y.petitionDeadline,
  notes: y.notes,
});
/** "325,000" → 325000; "" → null; junk → NaN (validation reports it). */
function num(t: string): number | null {
  const s = t.replace(/[$,\s]/g, "");
  return s === "" ? null : Number(s);
}
const fromForm = (f: Form): TaxYear => ({
  year: Number(f.year.trim()),
  marketValue: num(f.marketValue),
  assessedValue: num(f.assessedValue),
  taxableValue: num(f.taxableValue),
  exemption: f.exemption,
  petitionDeadline: f.petitionDeadline,
  notes: f.notes.trim(),
});

function Input({
  label,
  value,
  onChange,
  numeric = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <label style={field}>
      <span style={labelText}>{label}</span>
      <input
        aria-label={label}
        value={value}
        inputMode={numeric ? "decimal" : undefined}
        maxLength={numeric ? 20 : 1000}
        onChange={(e) => onChange(e.target.value)}
        style={hudInputStyle}
      />
    </label>
  );
}

function dueNow(r: TaxReminder): string {
  const when = formatIsoDate(r.date);
  switch (r.kind) {
    case "Homestead":
      return `Due now: apply for the homestead exemption by ${when}, if this was your permanent residence on January 1.`;
    case "TrimNotice":
      return "Due now: your TRIM notice is mailed this month. Add this year's values and the petition deadline printed on it.";
    case "PetitionDeadline":
      return `Due now: the petition deadline you saved is ${when}.`;
  }
}

/** #714: Florida's filing dates, from the checked table, with the official sources. */
function FloridaDates({ reminders, calendar }: { reminders: TaxReminder[]; calendar: IcsEvent[] }) {
  const link = (s: { label: string; url: string }) => (
    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--hg-blue)" }}>
      {s.label}
    </a>
  );
  return (
    <section
      aria-label="Florida dates"
      style={{ border: "1px solid var(--hg-line)", borderRadius: 12, padding: "0.875rem 1rem", marginBottom: "1rem" }}
    >
      <div style={{ ...labelText, marginBottom: "0.5rem" }}>Florida dates</div>
      <ul
        style={{
          ...muted,
          color: "var(--hg-ink)",
          paddingLeft: "1.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.375rem",
        }}
      >
        <li>
          Homestead exemption: if the home is your permanent residence on January 1, apply by March 1 with your county
          property appraiser ({link(FLORIDA_TAX_SOURCES.homestead)}).
        </li>
        <li>
          TRIM notice (Notice of Proposed Property Taxes): mailed in August. The deadline to petition the Value
          Adjustment Board is 25 days after it was mailed and is printed on the notice (
          {link(FLORIDA_TAX_SOURCES.petition)}).
        </li>
      </ul>
      {reminders.map((r) => (
        <p key={r.kind} style={{ ...muted, color: "var(--hg-ink)", fontWeight: 600, marginTop: "0.5rem" }}>
          {dueNow(r)}
        </p>
      ))}
      <AddToCalendarButton
        event={calendar}
        filename="florida-tax-dates"
        label="Florida tax dates"
        style={{ marginTop: "0.75rem" }}
      />
    </section>
  );
}

const pctChange = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;

/**
 * #714: the owner's property-tax years (values and exemption status from the
 * TRIM notice or tax bill) and, for Florida homes, the filing dates. Shown to
 * the owner and co-owners only (the canister enforces it too).
 */
export function PropertyTaxSection({ propertyId, state }: { propertyId: string; state: string }) {
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [years, setYears] = useState<TaxYear[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const florida = isFloridaState(state);

  const fetchYears = useCallback(() => {
    setLoad("loading");
    propertyTaxService
      .list(propertyId)
      .then((ys) => {
        setYears(ys);
        setLoad("ready");
      })
      .catch(() => setLoad("error"));
  }, [propertyId]);
  useEffect(fetchYears, [fetchYears]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const next = fromForm(form);
    const why = validateTaxYear(next);
    setProblem(why);
    if (why) return;
    setSaving(true);
    try {
      const saved = await propertyTaxService.save(propertyId, next);
      setYears((prev) => [...prev.filter((y) => y.year !== saved.year), saved].sort((a, b) => b.year - a.year));
      setForm(null);
      toast.success("Tax year saved");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the tax year"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (year: number) => {
    try {
      await propertyTaxService.remove(propertyId, year);
      setYears((prev) => prev.filter((y) => y.year !== year));
      toast.success("Tax year deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the tax year"));
    }
  };

  const open = (y?: TaxYear) => {
    setForm(toForm(y ?? { ...EMPTY_TAX_YEAR, year: new Date().getUTCFullYear() }));
    setProblem(null);
  };

  const reminders = florida && load === "ready" ? floridaTaxReminders(state, years, Date.now()) : [];
  const f = form;
  return (
    <Panel style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
      <SectionHeader title="Property tax record" sub="Only you and co-owners see this." />
      <p style={{ ...muted, marginBottom: "1rem" }}>
        The values and exemption status from your TRIM notice or tax bill, year by year. HomeGentic records what you
        enter: it doesn't check them with the county, doesn't file anything for you and doesn't estimate savings. Not
        tax advice.
      </p>
      {florida && (
        <FloridaDates
          reminders={reminders}
          calendar={load === "ready" ? floridaTaxEvents(propertyId, "", state, years, new Date()) : []}
        />
      )}
      {load === "loading" && <p style={muted}>Loading your tax years…</p>}
      {load === "error" && <LoadError what="your tax years" onRetry={fetchYears} compact />}
      {load === "ready" && !f && (
        <>
          {years.length === 0 ? (
            <p style={muted}>No tax years yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--hg-line)" }}>
                    {[
                      "Year",
                      "Market value",
                      "Assessed value",
                      "Taxable value",
                      "Homestead",
                      "Petition deadline",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{ ...labelText, textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 500 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => {
                    const change = assessedChange(years, y);
                    return (
                      <tr key={y.year} style={{ borderBottom: "1px solid var(--hg-line)" }}>
                        <td style={{ ...cell, fontWeight: 600 }}>{y.year}</td>
                        <td style={cell}>{y.marketValue === null ? "—" : money(y.marketValue)}</td>
                        <td style={cell}>
                          {y.assessedValue === null ? "—" : money(y.assessedValue)}
                          {change !== null && (
                            <div
                              style={{ ...muted, fontSize: "0.75rem" }}
                            >{`${pctChange(change)} vs ${y.year - 1}`}</div>
                          )}
                        </td>
                        <td style={cell}>{y.taxableValue === null ? "—" : money(y.taxableValue)}</td>
                        <td style={cell}>{EXEMPTION_LABELS[y.exemption]}</td>
                        <td style={cell}>{y.petitionDeadline ? formatIsoDate(y.petitionDeadline) : "—"}</td>
                        <td style={{ ...cell, whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            aria-label={`Edit ${y.year}`}
                            title="Edit"
                            onClick={() => open(y)}
                            style={iconButton}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${y.year}`}
                            title="Delete"
                            onClick={() => void remove(y.year)}
                            style={iconButton}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: "1rem" }}>
            <Button onClick={() => open()} style={hudButtonStyle(years.length ? "outline" : "primary")}>
              Add a tax year
            </Button>
          </div>
        </>
      )}
      {f && (
        <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={grid}>
            <Input label="Tax year" value={f.year} onChange={(v) => setForm({ ...f, year: v })} />
            <Input label="Market value, $" value={f.marketValue} onChange={(v) => setForm({ ...f, marketValue: v })} />
            <Input
              label="Assessed value, $"
              value={f.assessedValue}
              onChange={(v) => setForm({ ...f, assessedValue: v })}
            />
            <Input
              label="Taxable value, $"
              value={f.taxableValue}
              onChange={(v) => setForm({ ...f, taxableValue: v })}
            />
            <label style={field}>
              <span style={labelText}>Homestead exemption</span>
              <select
                aria-label="Homestead exemption"
                value={f.exemption}
                onChange={(e) => setForm({ ...f, exemption: e.target.value as TaxExemption })}
                style={hudInputStyle}
              >
                {(Object.keys(EXEMPTION_LABELS) as TaxExemption[]).map((k) => (
                  <option key={k} value={k}>
                    {EXEMPTION_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <DateInput
              label="Petition deadline on the TRIM notice"
              value={f.petitionDeadline}
              onChange={(v) => setForm({ ...f, petitionDeadline: v })}
            />
          </div>
          <Input label="Notes" value={f.notes} numeric={false} onChange={(v) => setForm({ ...f, notes: v })} />
          <p style={muted}>
            Copy the values from the notice or bill; leave any you don't have blank.
            {florida &&
              " Marking the homestead exemption for this year stops the March 1 reminder in your weekly email."}
          </p>
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save year"}
            </Button>
            <Button type="button" onClick={() => setForm(null)} style={hudButtonStyle("ghost")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
