import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, SectionHeader, hudButtonStyle, hudInputStyle } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { getStoredEstimatedValue } from "@/components/PropertyEstimatedValueInput";
import { errorMessage } from "@/services/candid";
import { mortgageLoanService, validateLoan, EMPTY_LOAN } from "@/services/mortgageLoan";
import { mortgageSummary, type MortgageLoan } from "@homegentic/shared/mortgage";
import { formatIsoDate } from "@/utils/format";
import { DateInput, Problem } from "./HoaTab";

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
const big: React.CSSProperties = { fontFamily: BODY, fontSize: "1.125rem", fontWeight: 700, color: "var(--hg-ink)" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" };

/** $1,896.20, or $279,000 for whole dollars. */
export function money(n: number): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Form {
  lender: string;
  originalAmount: string;
  annualRatePct: string;
  termYears: string;
  firstPaymentDate: string;
  originalValue: string;
  currentValue: string;
  monthlyPmi: string;
  monthlyEscrow: string;
  statementBalance: string;
  statementDate: string;
}

const text = (n: number | null) => (n === null ? "" : String(n));
function toForm(l: MortgageLoan): Form {
  return {
    lender: l.lender,
    originalAmount: l.originalAmount ? String(l.originalAmount) : "",
    annualRatePct: l.annualRatePct || l.originalAmount ? String(l.annualRatePct) : "",
    termYears: String(l.termMonths / 12),
    firstPaymentDate: l.firstPaymentDate,
    originalValue: text(l.originalValue),
    currentValue: text(l.currentValue),
    monthlyPmi: text(l.monthlyPmi),
    monthlyEscrow: text(l.monthlyEscrow),
    statementBalance: text(l.statementBalance),
    statementDate: l.statementDate,
  };
}

/** "300,000" → 300000; "" → null; junk → NaN (validation reports it). */
function num(t: string): number | null {
  const s = t.replace(/[$,%\s]/g, "");
  return s === "" ? null : Number(s);
}
function fromForm(f: Form): MortgageLoan {
  return {
    lender: f.lender.trim(),
    originalAmount: num(f.originalAmount) ?? 0,
    annualRatePct: num(f.annualRatePct) ?? NaN,
    termMonths: Math.round((num(f.termYears) ?? 0) * 12),
    firstPaymentDate: f.firstPaymentDate,
    originalValue: num(f.originalValue),
    currentValue: num(f.currentValue),
    monthlyPmi: num(f.monthlyPmi),
    monthlyEscrow: num(f.monthlyEscrow),
    statementBalance: num(f.statementBalance),
    statementDate: f.statementBalance.trim() === "" && f.statementDate === "" ? "" : f.statementDate,
  };
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={field}>
      <span style={labelText}>{label}</span>
      <input aria-label={label} value={value} inputMode="decimal" maxLength={100} onChange={(e) => onChange(e.target.value)} style={hudInputStyle} />
    </label>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={field}>
      <span style={labelText}>{label}</span>
      <span style={big}>{value}</span>
      {note && <span style={muted}>{note}</span>}
    </div>
  );
}

function Summary({ loan }: { loan: MortgageLoan }) {
  const s = mortgageSummary(loan, Date.now());
  const balanceNote = s.balanceSource === "statement"
    ? `From your statement of ${formatIsoDate(loan.statementDate)}`
    : `On the original schedule after ${s.paymentsMade} payment${s.paymentsMade === 1 ? "" : "s"}; extra payments make it lower`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={grid}>
        <Figure label="Principal and interest" value={money(s.principalAndInterest)} note={`${loan.lender ? `${loan.lender}, ` : ""}${loan.annualRatePct}% for ${loan.termMonths / 12} years`} />
        <Figure
          label="Monthly payment with escrow and PMI"
          value={money(s.monthlyTotal)}
          note={s.escrowShare !== null ? `Escrow is ${pct(s.escrowShare)} of the payment` : undefined}
        />
        <Figure label="Loan balance" value={money(s.balance)} note={balanceNote} />
        {s.equity !== null && s.loanToValue !== null ? (
          <Figure label="Equity estimate" value={money(s.equity)} note={`${pct(s.loanToValue)} loan-to-value, from the home value you entered`} />
        ) : (
          <div style={field}>
            <span style={labelText}>Equity estimate</span>
            <span style={muted}>Add what you think the home is worth to see an equity estimate.</span>
          </div>
        )}
      </div>
      {s.pmi && (
        <div style={{ ...field, gap: "0.375rem" }}>
          <span style={labelText}>PMI</span>
          <span style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
            {s.pmi.reached80
              ? "Your balance is at or under 80% of the original value."
              : `Your original schedule reaches 80% of the original value on ${formatIsoDate(s.pmi.requestDate)}, and 78% on ${formatIsoDate(s.pmi.automaticDate)}.`}
          </span>
          <span style={muted}>
            For many conventional loans you can ask the lender to cancel PMI at 80% if your payments are current, and it
            ends automatically at 78% on the original schedule. FHA and other government loans follow different rules.
            The rule depends on your loan, and your lender decides.
          </span>
        </div>
      )}
      <p style={muted}>Paid off {formatIsoDate(s.payoffDate)} if every payment is made on schedule.</p>
    </div>
  );
}

/**
 * #722: the owner's mortgage numbers and what they work out to. Shown only to
 * the owner and co-owners (the canister enforces it too).
 */
export function MortgageSection({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loan, setLoan] = useState<MortgageLoan | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState("loading");
    mortgageLoanService
      .get(propertyId)
      .then((l) => {
        setLoan(l);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId]);
  useEffect(load, [load]);

  const save = async (next: MortgageLoan | null) => {
    setSaving(true);
    try {
      await mortgageLoanService.save(propertyId, next);
      setLoan(next);
      setForm(null);
      toast.success(next ? "Loan saved" : "Loan removed");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the loan"));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const next = fromForm(form);
    const why = validateLoan(next);
    setProblem(why);
    if (!why) void save(next);
  };

  const open = () => {
    setForm(toForm(loan ?? { ...EMPTY_LOAN, currentValue: getStoredEstimatedValue(propertyId) }));
    setProblem(null);
  };

  const f = form;
  return (
    <Panel style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
      <SectionHeader title="Mortgage and equity" sub="Only you and co-owners see this." />
      <p style={{ ...muted, marginBottom: "1rem" }}>
        A calculator that works from the numbers you enter. It gives no lending advice, doesn't predict rates and
        doesn't refer you to lenders, and nothing is sent to your lender.
      </p>
      {state === "loading" && <p style={muted}>Loading your loan…</p>}
      {state === "error" && <LoadError what="your loan" onRetry={load} compact />}
      {state === "ready" && !f && (
        <>
          {loan ? <Summary loan={loan} /> : <p style={muted}>No loan details yet.</p>}
          <div style={{ marginTop: "1rem" }}>
            <Button onClick={open} style={hudButtonStyle(loan ? "outline" : "primary")}>
              {loan ? "Edit loan" : "Add your loan"}
            </Button>
          </div>
        </>
      )}
      {f && (
        <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={grid}>
            <Input label="Lender" value={f.lender} onChange={(v) => setForm({ ...f, lender: v })} />
            <Input label="Amount borrowed, $" value={f.originalAmount} onChange={(v) => setForm({ ...f, originalAmount: v })} />
            <Input label="Interest rate, %" value={f.annualRatePct} onChange={(v) => setForm({ ...f, annualRatePct: v })} />
            <Input label="Term, years" value={f.termYears} onChange={(v) => setForm({ ...f, termYears: v })} />
            <DateInput label="First payment date" value={f.firstPaymentDate} onChange={(v) => setForm({ ...f, firstPaymentDate: v })} />
            <Input label="Home value when you took out the loan, $" value={f.originalValue} onChange={(v) => setForm({ ...f, originalValue: v })} />
            <Input label="Home value now (your estimate), $" value={f.currentValue} onChange={(v) => setForm({ ...f, currentValue: v })} />
            <Input label="Monthly PMI, $" value={f.monthlyPmi} onChange={(v) => setForm({ ...f, monthlyPmi: v })} />
            <Input label="Monthly escrow, $" value={f.monthlyEscrow} onChange={(v) => setForm({ ...f, monthlyEscrow: v })} />
            <Input label="Balance on your latest statement, $" value={f.statementBalance} onChange={(v) => setForm({ ...f, statementBalance: v })} />
            <DateInput label="Statement date" value={f.statementDate} onChange={(v) => setForm({ ...f, statementDate: v })} />
          </div>
          <p style={muted}>
            The home value when you took out the loan is the lower of the purchase price and the appraisal; PMI milestones
            are counted from it. Escrow is the tax and insurance your lender collects with each payment.
          </p>
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save loan"}
            </Button>
            <Button type="button" onClick={() => setForm(null)} style={hudButtonStyle("ghost")}>
              Cancel
            </Button>
            {loan && (
              <Button type="button" disabled={saving} onClick={() => void save(null)} style={hudButtonStyle("danger")}>
                Remove loan
              </Button>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}
