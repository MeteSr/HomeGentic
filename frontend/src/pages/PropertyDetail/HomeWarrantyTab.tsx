import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, Pill, SectionHeader, hudButtonStyle, hudInputStyle, type PillTone } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { photoService } from "@/services/photo";
import { errorMessage } from "@/services/candid";
import { propertyService, type AccessRole } from "@/services/property";
import { canEditDocuments, parseDoc } from "@/services/documentVault";
import { renewalStatus } from "@/services/insurancePolicy";
import { useAuthStore } from "@/store/authStore";
import { formatDollars, formatIsoDate } from "@/utils/format";
import {
  homeWarrantyService,
  validatePlan,
  validateClaim,
  claimTotals,
  EMPTY_PLAN,
  EMPTY_CLAIM,
  CLAIM_OUTCOMES,
  CLAIM_OUTCOME_LABELS,
  type HomeWarrantyPlan,
  type WarrantyClaim,
  type ClaimOutcome,
} from "@/services/homeWarranty";
import { ConfirmDelete, DateInput, DocSelect, Problem, type DocRef, type JobRef } from "./HoaTab";

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
const ink: React.CSSProperties = { fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" };
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "1rem",
};
const list: React.CSSProperties = {
  listStyle: "none",
  margin: "0.75rem 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};
const row: React.CSSProperties = {
  borderTop: "1px solid var(--hg-line)",
  paddingTop: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
};

const OUTCOME_TONE: Record<ClaimOutcome, PillTone> = {
  Open: "info",
  Approved: "good",
  PartlyApproved: "warn",
  Denied: "bad",
  Withdrawn: "neutral",
};

/** "1,250.50" → 1250.5; "" → null; junk → NaN (validation reports it). */
function parseAmount(t: string): number | null {
  const s = t.replace(/[$,\s]/g, "");
  return s === "" ? null : Number(s);
}
const amountText = (n: number | null) => (n === null ? "" : String(n));

function TextField({
  label,
  value,
  onChange,
  max,
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  area?: boolean;
}) {
  return (
    <label style={field}>
      <span style={labelText}>{label}</span>
      {area ? (
        <textarea
          aria-label={label}
          rows={3}
          value={value}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...hudInputStyle, resize: "vertical" }}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
          style={hudInputStyle}
        />
      )}
    </label>
  );
}

/**
 * #719: the home warranty plan (service contract) and the claims filed under
 * it. Owners, co-owners and managers edit; viewers read. It's the owner's own
 * record: HomeGentic doesn't sell or rate plans or contact the company.
 */
export function HomeWarrantyTab({ propertyId, jobs = [] }: { propertyId: string; jobs?: JobRef[] }) {
  const principal = useAuthStore((s) => s.principal);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [plan, setPlan] = useState<HomeWarrantyPlan | null>(null);
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [docs, setDocs] = useState<DocRef[]>([]);
  const canEdit = canEditDocuments(role);

  useEffect(() => {
    if (!principal) return;
    propertyService
      .getAccessRole(propertyId, principal)
      .then(setRole)
      .catch(() => setRole(null));
  }, [propertyId, principal]);

  useEffect(() => {
    Promise.all([
      photoService.getByJob(`docs_${propertyId}`).catch(() => []),
      photoService.getByJob(`receipts_${propertyId}`).catch(() => []),
    ]).then(([a, b]) => setDocs([...a, ...b].map((p) => ({ id: p.id, label: parseDoc(p.description).filename }))));
  }, [propertyId]);

  const load = useCallback(() => {
    setState("loading");
    Promise.all([homeWarrantyService.getPlan(propertyId), homeWarrantyService.listClaims(propertyId)])
      .then(([p, c]) => {
        setPlan(p);
        setClaims(c);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId]);
  useEffect(load, [load]);

  if (state === "loading")
    return <p style={{ fontFamily: BODY, color: "var(--hg-muted)" }}>Loading the home warranty…</p>;
  if (state === "error") return <LoadError what="the home warranty" onRetry={load} />;

  const docLabel = (id: string | null) =>
    id ? (docs.find((d) => d.id === id)?.label ?? "A document in Documents") : null;
  const jobLabel = (id: string | null) => (id ? (jobs.find((j) => j.id === id)?.label ?? "A job on this home") : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <p style={muted}>
        Your own record of a home warranty plan (a service contract on the home's systems and appliances) and the claims
        filed under it. HomeGentic doesn't sell or rate home warranty plans and doesn't contact the company. What's
        covered is what you enter here or what the contract says. Product and workmanship warranties from jobs are in
        the Warranty Wallet.
      </p>
      <PlanPanel
        propertyId={propertyId}
        canEdit={canEdit}
        plan={plan}
        setPlan={setPlan}
        docs={docs}
        docLabel={docLabel}
      />
      <ClaimsPanel
        propertyId={propertyId}
        canEdit={canEdit}
        items={claims}
        setItems={setClaims}
        jobs={jobs}
        jobLabel={jobLabel}
      />
    </div>
  );
}

// ─── The plan ───────────────────────────────────────────────────────────────

interface PlanForm extends Omit<HomeWarrantyPlan, "serviceFee"> {
  serviceFee: string;
}

function PlanPanel({
  propertyId,
  canEdit,
  plan,
  setPlan,
  docs,
  docLabel,
}: {
  propertyId: string;
  canEdit: boolean;
  plan: HomeWarrantyPlan | null;
  setPlan: (p: HomeWarrantyPlan | null) => void;
  docs: DocRef[];
  docLabel: (id: string | null) => string | null;
}) {
  const [form, setForm] = useState<PlanForm | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (p: HomeWarrantyPlan) => {
    setForm({ ...p, serviceFee: amountText(p.serviceFee) });
    setProblem(null);
  };

  const save = async (next: HomeWarrantyPlan | null) => {
    setSaving(true);
    try {
      await homeWarrantyService.savePlan(propertyId, next);
      setPlan(next);
      setForm(null);
      toast.success(next ? "Plan saved" : "Plan removed");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the plan"));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const { updatedAt: _u, ...rest } = form;
    const next: HomeWarrantyPlan = {
      ...rest,
      provider: rest.provider.trim(),
      planName: rest.planName.trim(),
      contractNumber: rest.contractNumber.trim(),
      claimContact: rest.claimContact.trim(),
      coverageNotes: rest.coverageNotes.trim(),
      exclusionNotes: rest.exclusionNotes.trim(),
      serviceFee: parseAmount(rest.serviceFee),
    };
    const why = validatePlan(next);
    setProblem(why);
    if (!why) void save(next);
  };

  const f = form;
  const status = plan ? renewalStatus(plan.renewalDate, Date.now()) : null;
  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader title="Home warranty plan" sub="The company, the contract and when it renews." />
      {!plan && !f && <p style={muted}>No home warranty plan recorded.</p>}
      {plan && !f && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ ...ink, fontWeight: 600 }}>
              {[plan.provider, plan.planName].filter(Boolean).join(" · ")}
            </span>
            {status && (
              <Pill tone={status.tone === "passed" ? "bad" : status.tone === "soon" ? "warn" : "neutral"}>
                {status.tone === "passed"
                  ? "Renewal date passed"
                  : status.days === 0
                    ? "Renews today"
                    : `Renews in ${status.days} day${status.days === 1 ? "" : "s"}`}
              </Pill>
            )}
          </div>
          <span style={muted}>
            {[
              `Renews ${formatIsoDate(plan.renewalDate)}`,
              plan.startDate && `Started ${formatIsoDate(plan.startDate)}`,
              plan.contractNumber && `Contract ${plan.contractNumber}`,
              plan.serviceFee !== null && `Service-call fee ${formatDollars(plan.serviceFee)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {plan.claimContact && <span style={ink}>To file a claim: {plan.claimContact}</span>}
          {plan.coverageNotes && (
            <>
              <span style={labelText}>Covers (as you entered it)</span>
              <span style={ink}>{plan.coverageNotes}</span>
            </>
          )}
          {plan.exclusionNotes && (
            <>
              <span style={labelText}>Excludes (as you entered it)</span>
              <span style={ink}>{plan.exclusionNotes}</span>
            </>
          )}
          {plan.contractDocId && (
            <span style={muted}>
              Contract: <span>{docLabel(plan.contractDocId)}</span>
            </span>
          )}
          <p style={muted}>
            Paying for the plan monthly or yearly? Add its price under Housing costs on the Bills tab (category Other)
            so it counts in your home's costs.
          </p>
        </div>
      )}

      {canEdit && !f && (
        <div style={{ marginTop: "1rem" }}>
          <Button onClick={() => open(plan ?? EMPTY_PLAN)} style={hudButtonStyle(plan ? "outline" : "primary")}>
            {plan ? "Edit plan" : "Add your plan"}
          </Button>
        </div>
      )}

      {f && (
        <form
          onSubmit={submit}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
        >
          <div style={grid}>
            <TextField
              label="Home warranty company"
              value={f.provider}
              max={100}
              onChange={(v) => setForm({ ...f, provider: v })}
            />
            <TextField
              label="Plan name"
              value={f.planName}
              max={100}
              onChange={(v) => setForm({ ...f, planName: v })}
            />
            <TextField
              label="Contract number"
              value={f.contractNumber}
              max={60}
              onChange={(v) => setForm({ ...f, contractNumber: v })}
            />
            <TextField
              label="How to file a claim"
              value={f.claimContact}
              max={200}
              onChange={(v) => setForm({ ...f, claimContact: v })}
            />
            <TextField
              label="Service-call fee, $"
              value={f.serviceFee}
              max={12}
              onChange={(v) => setForm({ ...f, serviceFee: v })}
            />
            <DateInput label="Start date" value={f.startDate} onChange={(v) => setForm({ ...f, startDate: v })} />
            <DateInput label="Renewal date" value={f.renewalDate} onChange={(v) => setForm({ ...f, renewalDate: v })} />
            <DocSelect
              label="Contract"
              docs={docs}
              value={f.contractDocId}
              onChange={(v) => setForm({ ...f, contractDocId: v })}
            />
          </div>
          <TextField
            area
            label="What it covers"
            value={f.coverageNotes}
            max={2000}
            onChange={(v) => setForm({ ...f, coverageNotes: v })}
          />
          <TextField
            area
            label="What it excludes"
            value={f.exclusionNotes}
            max={2000}
            onChange={(v) => setForm({ ...f, exclusionNotes: v })}
          />
          <p style={muted}>Copy coverage and exclusions from the contract. HomeGentic doesn't check them.</p>
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save plan"}
            </Button>
            <Button type="button" onClick={() => setForm(null)} style={hudButtonStyle("ghost")}>
              Cancel
            </Button>
            {plan && (
              <Button type="button" disabled={saving} onClick={() => void save(null)} style={hudButtonStyle("danger")}>
                Remove plan
              </Button>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}

// ─── Claims ─────────────────────────────────────────────────────────────────

interface ClaimForm extends Omit<WarrantyClaim, "serviceFeePaid"> {
  serviceFeePaid: string;
}

function ClaimsPanel({
  propertyId,
  canEdit,
  items,
  setItems,
  jobs,
  jobLabel,
}: {
  propertyId: string;
  canEdit: boolean;
  items: WarrantyClaim[];
  setItems: (f: (x: WarrantyClaim[]) => WarrantyClaim[]) => void;
  jobs: JobRef[];
  jobLabel: (id: string | null) => string | null;
}) {
  const [form, setForm] = useState<ClaimForm | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const totals = claimTotals(items);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const { id, createdAt: _c, ...rest } = form;
    const next: WarrantyClaim = {
      ...rest,
      issue: rest.issue.trim(),
      claimNumber: rest.claimNumber.trim(),
      outcomeNotes: rest.outcomeNotes.trim(),
      serviceFeePaid: parseAmount(rest.serviceFeePaid),
    };
    const why = validateClaim(next);
    setProblem(why);
    if (why) return;
    setSaving(true);
    try {
      if (id) {
        const saved = await homeWarrantyService.updateClaim(id, next);
        setItems((xs) => xs.map((x) => (x.id === id ? saved : x)));
      } else {
        const saved = await homeWarrantyService.addClaim(propertyId, next);
        setItems((xs) => [saved, ...xs]);
      }
      setForm(null);
      toast.success("Claim saved");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the claim"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await homeWarrantyService.deleteClaim(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the claim"));
    }
  };

  const open = (c: WarrantyClaim) => {
    setForm({ ...c, serviceFeePaid: amountText(c.serviceFeePaid) });
    setProblem(null);
  };

  const f = form;
  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Claims"
        sub="Service requests filed with the home warranty company, and what came of them."
      />
      {items.length === 0 && !f && <p style={muted}>No claims recorded.</p>}
      {items.length > 0 && (
        <>
          <p style={muted}>
            Service-call fees paid: {formatDollars(totals.feesPaid)} across {totals.count} claim
            {totals.count === 1 ? "" : "s"}
            {totals.open > 0 ? ` · ${totals.open} open` : ""}
          </p>
          <ul style={list}>
            {items.map((c) => (
              <li key={c.id} style={row}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...ink, fontWeight: 600 }}>{c.issue}</span>
                  <Pill tone={OUTCOME_TONE[c.outcome]}>{CLAIM_OUTCOME_LABELS[c.outcome]}</Pill>
                </div>
                <span style={muted}>
                  {[
                    `Filed ${formatIsoDate(c.dateFiled)}`,
                    c.claimNumber && `Claim ${c.claimNumber}`,
                    c.serviceFeePaid !== null && `Fee paid ${formatDollars(c.serviceFeePaid)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {c.outcomeNotes && <span style={ink}>{c.outcomeNotes}</span>}
                {c.jobId && <span style={muted}>Job: {jobLabel(c.jobId)}</span>}
                {canEdit && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <Button onClick={() => open(c)} style={hudButtonStyle("outline")}>
                      Edit
                    </Button>
                    <ConfirmDelete onConfirm={() => void remove(c.id!)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {canEdit && !f && (
        <div style={{ marginTop: "1rem" }}>
          <Button
            onClick={() => open({ ...EMPTY_CLAIM, dateFiled: new Date().toISOString().slice(0, 10) })}
            style={hudButtonStyle("primary")}
          >
            Log a claim
          </Button>
        </div>
      )}

      {f && (
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
        >
          <TextField
            label="What's the claim for?"
            value={f.issue}
            max={120}
            onChange={(v) => setForm({ ...f, issue: v })}
          />
          <div style={grid}>
            <DateInput label="Date filed" value={f.dateFiled} onChange={(v) => setForm({ ...f, dateFiled: v })} />
            <TextField
              label="Claim number"
              value={f.claimNumber}
              max={60}
              onChange={(v) => setForm({ ...f, claimNumber: v })}
            />
            <TextField
              label="Service fee paid, $"
              value={f.serviceFeePaid}
              max={12}
              onChange={(v) => setForm({ ...f, serviceFeePaid: v })}
            />
            <label style={field}>
              <span style={labelText}>Outcome</span>
              <select
                aria-label="Outcome"
                value={f.outcome}
                onChange={(e) => setForm({ ...f, outcome: e.target.value as ClaimOutcome })}
                style={hudInputStyle}
              >
                {CLAIM_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {CLAIM_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
            </label>
            <label style={field}>
              <span style={labelText}>Job</span>
              <select
                aria-label="Job"
                value={f.jobId ?? ""}
                onChange={(e) => setForm({ ...f, jobId: e.target.value || null })}
                style={hudInputStyle}
              >
                <option value="">None</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TextField
            area
            label="What happened"
            value={f.outcomeNotes}
            max={1000}
            onChange={(v) => setForm({ ...f, outcomeNotes: v })}
          />
          <Problem text={problem} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
              {saving ? "Saving…" : "Save claim"}
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
