import React, { useEffect, useState } from "react";
import { Home, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, hudInputStyle, hudButtonStyle } from "@/components/hud";
import {
  billService, isActiveOn, monthlyEquivalentCents, TierLimitReachedError,
  type ExpenseCategory, type ExpenseFrequency, type RecurringExpense, type RecurringExpenseFields,
} from "@/services/billService";

const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY    = "'Hanken Grotesk',sans-serif";

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  Mortgage:      "Mortgage",
  PropertyTax:   "Property Tax",
  HOA:           "HOA Dues",
  HomeInsurance: "Home Insurance",
  Other:         "Other",
};

const PROVIDER_LABELS: Record<ExpenseCategory, string> = {
  Mortgage:      "Lender",
  PropertyTax:   "Tax authority",
  HOA:           "Association",
  HomeInsurance: "Insurer",
  Other:         "Payee",
};

const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  Monthly:    "Monthly",
  Quarterly:  "Quarterly",
  SemiAnnual: "Twice a year",
  Annual:     "Yearly",
};

const PER: Record<ExpenseFrequency, string> = {
  Monthly: "mo", Quarterly: "qtr", SemiAnnual: "6 mo", Annual: "yr",
};

const EMPTY_FORM: RecurringExpenseFields = {
  category: "Mortgage", provider: "", amountCents: 0, frequency: "Monthly", startDate: "", endDate: undefined,
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const labelText: React.CSSProperties = {
  fontFamily: BODY, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const cell:  React.CSSProperties = { fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)", padding: "0.75rem" };

export function HousingCostsSection({ propertyId, onExpensesChange }: {
  propertyId: string;
  /** Called with the current list once loaded and after every add, edit or removal. */
  onExpensesChange?: (expenses: RecurringExpense[]) => void;
}) {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState<RecurringExpenseFields | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    billService.getRecurringExpensesForProperty(propertyId)
      .then(setExpenses)
      .catch((e) => console.error("[HousingCosts] load failed:", e))
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => {
    if (!loading) onExpensesChange?.(expenses);
  }, [expenses, loading, onExpensesChange]);

  const today = todayIso();
  const monthlyTotal = expenses
    .filter((e) => isActiveOn(e, today))
    .reduce((sum, e) => sum + monthlyEquivalentCents(e), 0);

  const canSave = !!form && form.provider.trim() !== "" && form.amountCents > 0 && form.startDate !== ""
    && (!form.endDate || form.endDate >= form.startDate);

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(e: RecurringExpense) {
    setEditingId(e.id);
    setForm({
      category: e.category, provider: e.provider, amountCents: e.amountCents,
      frequency: e.frequency, startDate: e.startDate, endDate: e.endDate,
    });
  }

  function close() {
    setForm(null);
    setEditingId(null);
  }

  async function handleSave() {
    if (!form || !canSave) return;
    const fields = { ...form, provider: form.provider.trim(), endDate: form.endDate || undefined };
    setSaving(true);
    try {
      if (editingId) {
        const updated = await billService.updateRecurringExpense(editingId, fields);
        setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        toast.success("Housing cost updated.");
      } else {
        const added = await billService.addRecurringExpense(propertyId, fields);
        setExpenses((prev) => [...prev, added]);
        toast.success("Housing cost added.");
      }
      close();
    } catch (err) {
      if (err instanceof TierLimitReachedError) toast.error(err.message, { duration: 8000, icon: "🔒" });
      else toast.error("Failed to save housing cost.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await billService.deleteRecurringExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) close();
      toast.success("Housing cost removed.");
    } catch {
      toast.error("Failed to remove housing cost.");
    }
  }

  function status(e: RecurringExpense): string {
    if (e.startDate > today) return `Starts ${e.startDate}`;
    if (e.endDate && e.endDate < today) return `Ended ${e.endDate}`;
    return e.endDate ? `Since ${e.startDate} · until ${e.endDate}` : `Since ${e.startDate}`;
  }

  return (
    <section aria-label="Housing costs" style={{ marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontFamily: DISPLAY, fontSize: "1.25rem", fontWeight: 700, color: "var(--hg-ink)", margin: 0 }}>
            Housing Costs
          </h3>
          <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", margin: "0.25rem 0 0" }}>
            Mortgage, property tax, HOA and insurance — enter each once and we'll track it every period.
          </p>
        </div>
        <Button onClick={openAdd} disabled={!!form} style={hudButtonStyle("primary")}>
          <Plus size={14} style={{ marginRight: "0.4rem" }} />
          Add Housing Cost
        </Button>
      </div>

      {form && (
        <Panel style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
          <h4 style={{ fontFamily: DISPLAY, fontSize: "1rem", fontWeight: 700, color: "var(--hg-ink)", margin: "0 0 1rem" }}>
            {editingId ? "Edit Housing Cost" : "New Housing Cost"}
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
            <label style={field}>
              <span style={labelText}>Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                style={hudInputStyle}
              >
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label style={field}>
              <span style={labelText}>{PROVIDER_LABELS[form.category]}</span>
              <input
                type="text"
                value={form.provider}
                maxLength={200}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                style={hudInputStyle}
              />
            </label>
            <label style={field}>
              <span style={labelText}>Amount per payment ($)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.amountCents ? (form.amountCents / 100).toString() : ""}
                onChange={(e) => setForm({ ...form, amountCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                placeholder="0.00"
                style={hudInputStyle}
              />
            </label>
            <label style={field}>
              <span style={labelText}>Frequency</span>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as ExpenseFrequency })}
                style={hudInputStyle}
              >
                {(Object.keys(FREQUENCY_LABELS) as ExpenseFrequency[]).map((f) => (
                  <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                ))}
              </select>
            </label>
            <label style={field}>
              <span style={labelText}>Start date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                style={hudInputStyle}
              />
            </label>
            <label style={field}>
              <span style={labelText}>End date (optional)</span>
              <input
                type="date"
                value={form.endDate ?? ""}
                min={form.startDate || undefined}
                onChange={(e) => setForm({ ...form, endDate: e.target.value || undefined })}
                style={hudInputStyle}
              />
            </label>
          </div>
          {form.amountCents > 0 && form.frequency !== "Monthly" && (
            <p style={{ fontFamily: BODY, fontSize: "0.8rem", color: "var(--hg-muted)", margin: "0.75rem 0 0" }}>
              ≈ {usd(monthlyEquivalentCents(form))} per month
            </p>
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Button onClick={handleSave} disabled={!canSave || saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Cost"}
            </Button>
            <Button
              onClick={close}
              style={{ ...hudButtonStyle("ghost"), background: "transparent", border: "1px solid var(--hg-line)", color: "var(--hg-muted)" }}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {loading ? null : expenses.length === 0 ? (
        !form && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.25rem 1.5rem", border: "1px dashed var(--hg-line)", borderRadius: 16, color: "var(--hg-muted)", fontFamily: BODY, fontSize: "0.875rem" }}>
            <Home size={16} />
            No housing costs yet. Add your mortgage, property tax, HOA or insurance to see your true monthly cost of ownership.
          </div>
        )
      ) : (
        <Panel style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hg-line)" }}>
            <span style={labelText}>Current monthly housing cost</span>
            <span data-testid="housing-monthly-total" style={{ fontFamily: DISPLAY, fontSize: "1.25rem", fontWeight: 700, color: "var(--hg-ink)" }}>
              {usd(monthlyTotal)}<span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--hg-muted)" }}>/mo</span>
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--hg-line)" }}>
                  {["Category", "Paid to", "Amount", "Per month", "Schedule", ""].map((h) => (
                    <th key={h} style={{ ...labelText, textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const active = isActiveOn(e, today);
                  return (
                    <tr key={e.id} style={{ borderBottom: "1px solid var(--hg-line)", opacity: active ? 1 : 0.55 }}>
                      <td style={cell}>{CATEGORY_LABELS[e.category]}</td>
                      <td style={cell}>{e.provider}</td>
                      <td style={{ ...cell, fontWeight: 600, whiteSpace: "nowrap" }}>{usd(e.amountCents)} / {PER[e.frequency]}</td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>{usd(monthlyEquivalentCents(e))}</td>
                      <td style={{ ...cell, fontSize: "0.8rem", color: "var(--hg-muted)", whiteSpace: "nowrap" }}>{status(e)}</td>
                      <td style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => openEdit(e)}
                          aria-label={`Edit ${CATEGORY_LABELS[e.category]}`}
                          title="Edit"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--hg-muted)", padding: "0.25rem" }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          aria-label={`Remove ${CATEGORY_LABELS[e.category]}`}
                          title="Remove"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--hg-muted)", padding: "0.25rem" }}
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
        </Panel>
      )}
    </section>
  );
}
