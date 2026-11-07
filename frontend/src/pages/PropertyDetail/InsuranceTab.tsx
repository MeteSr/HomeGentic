import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, Pill, SectionHeader, hudButtonStyle, hudInputStyle, type PillTone } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { ClaimKit } from "./ClaimKit";
import { ContentsInventory } from "./ContentsInventory";
import type { RoomRef } from "@/services/inventory";
import type { Photo } from "@/services/photo";
import { errorMessage } from "@/services/candid";
import { propertyService, type AccessRole } from "@/services/property";
import { canEditDocuments } from "@/services/documentVault";
import { useAuthStore } from "@/store/authStore";
import { formatDollars, formatIsoDate } from "@/utils/format";
import {
  insurancePolicyService,
  hurricaneDeductibleDollars,
  renewalStatus,
  validatePolicy,
  RENEWAL_WINDOW_DAYS,
  type InsurancePolicy,
} from "@/services/insurancePolicy";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const value: React.CSSProperties = { fontFamily: BODY, fontSize: "0.9375rem", color: "var(--hg-ink)", marginTop: 2 };

type DeductibleKind = "none" | "percent" | "amount";
interface Form {
  carrier: string;
  policyNumber: string;
  renewalDate: string;
  coverageA: string;
  deductibleKind: DeductibleKind;
  deductible: string;
}

const EMPTY: Form = {
  carrier: "",
  policyNumber: "",
  renewalDate: "",
  coverageA: "",
  deductibleKind: "none",
  deductible: "",
};

function toForm(p: InsurancePolicy): Form {
  const d = p.hurricaneDeductible;
  return {
    carrier: p.carrier,
    policyNumber: p.policyNumber,
    renewalDate: p.renewalDate,
    coverageA: p.coverageA === null ? "" : String(p.coverageA),
    deductibleKind: d ? d.kind : "none",
    deductible: !d ? "" : d.kind === "percent" ? String(d.percent) : String(d.dollars),
  };
}

/** "350,000" → 350000; "" → null; junk → NaN (validatePolicy reports it). */
function parseAmount(t: string): number | null {
  const s = t.replace(/[$,\s]/g, "");
  return s === "" ? null : Number(s);
}

function fromForm(f: Form): InsurancePolicy {
  const amount = parseAmount(f.deductible) ?? NaN;
  return {
    carrier: f.carrier.trim(),
    policyNumber: f.policyNumber.trim(),
    renewalDate: f.renewalDate,
    coverageA: parseAmount(f.coverageA),
    hurricaneDeductible:
      f.deductibleKind === "none"
        ? null
        : f.deductibleKind === "percent"
          ? { kind: "percent", percent: amount }
          : { kind: "amount", dollars: amount },
  };
}

function renewalPill(p: InsurancePolicy): { tone: PillTone; text: string } | null {
  const s = renewalStatus(p.renewalDate, Date.now());
  if (!s) return null;
  if (s.tone === "passed") return { tone: "bad", text: "Renewal date has passed: update it" };
  const when = s.days === 0 ? "Renews today" : s.days === 1 ? "Renews tomorrow" : `Renews in ${s.days} days`;
  return { tone: s.tone === "soon" ? "warn" : "neutral", text: when };
}

function deductibleText(p: InsurancePolicy): string {
  const d = p.hurricaneDeductible;
  if (!d) return "Not entered";
  if (d.kind === "amount") return formatDollars(d.dollars);
  const dollars = hurricaneDeductibleDollars(p);
  return dollars === null
    ? `${d.percent}% of Coverage A`
    : `${d.percent}% of Coverage A (about ${formatDollars(dollars)})`;
}

/**
 * #711: the home's insurance policy details, kept by the household. Owners,
 * co-owners and managers can edit; viewers only read.
 */
export function InsuranceTab({
  propertyId,
  photos = [],
  rooms = [],
}: {
  propertyId: string;
  photos?: Photo[];
  rooms?: RoomRef[];
}) {
  const principal = useAuthStore((s) => s.principal);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [policy, setPolicy] = useState<InsurancePolicy | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [form, setForm] = useState<Form | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canEdit = canEditDocuments(role);

  useEffect(() => {
    if (!principal) return;
    propertyService
      .getAccessRole(propertyId, principal)
      .then(setRole)
      .catch(() => setRole(null));
  }, [propertyId, principal]);

  const load = useCallback(() => {
    setState("loading");
    insurancePolicyService
      .get(propertyId)
      .then((p) => {
        setPolicy(p);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId]);

  useEffect(load, [load]);

  const save = async (next: InsurancePolicy | null) => {
    setSaving(true);
    try {
      await insurancePolicyService.save(propertyId, next);
      setPolicy(next);
      setForm(null);
      setConfirmRemove(false);
      toast.success(next ? "Policy saved" : "Policy removed");
    } catch (err) {
      toast.error(errorMessage(err, next ? "Couldn't save the policy" : "Couldn't remove the policy"));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent, current: Form) => {
    e.preventDefault();
    const next = fromForm(current);
    const why = validatePolicy(next);
    setProblem(why);
    if (!why) void save(next);
  };

  if (state === "loading")
    return <p style={{ fontFamily: BODY, color: "var(--hg-muted)" }}>Loading insurance policy…</p>;
  if (state === "error") return <LoadError what="the insurance policy" onRetry={load} />;

  // With nothing saved, editors go straight to the form.
  const editing = form ?? (!policy && canEdit ? EMPTY : null);
  const pill = policy ? renewalPill(policy) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <Panel style={{ padding: "1.5rem" }}>
        <SectionHeader
          title="Home insurance"
          sub="Your own copy of the details on your declarations page. HomeGentic doesn't check these with your insurer or change your policy."
        />

        {!policy && !editing && (
          <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", margin: 0 }}>
            No policy saved yet.
          </p>
        )}

        {policy && !form && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <div>
                <div style={labelText}>Insurance company</div>
                <div style={value}>{policy.carrier}</div>
              </div>
              <div>
                <div style={labelText}>Policy number</div>
                <div style={value}>{policy.policyNumber || "Not entered"}</div>
              </div>
              <div>
                <div style={labelText}>Renewal date</div>
                <div style={value}>{formatIsoDate(policy.renewalDate)}</div>
                {pill && (
                  <div style={{ marginTop: 6 }}>
                    <Pill tone={pill.tone}>{pill.text}</Pill>
                  </div>
                )}
              </div>
              <div>
                <div style={labelText}>Coverage A (dwelling)</div>
                <div style={value}>{policy.coverageA === null ? "Not entered" : formatDollars(policy.coverageA)}</div>
              </div>
              <div>
                <div style={labelText}>Hurricane deductible</div>
                <div style={value}>{deductibleText(policy)}</div>
              </div>
            </div>
            {canEdit && (
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", flexWrap: "wrap", alignItems: "center" }}
              >
                {!confirmRemove ? (
                  <>
                    <Button
                      onClick={() => {
                        setForm(toForm(policy));
                        setProblem(null);
                      }}
                      style={hudButtonStyle("outline")}
                    >
                      Edit
                    </Button>
                    <Button onClick={() => setConfirmRemove(true)} style={hudButtonStyle("ghost")}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
                      Remove these policy details?
                    </span>
                    <Button onClick={() => void save(null)} disabled={saving} style={hudButtonStyle("danger")}>
                      Yes, remove
                    </Button>
                    <Button onClick={() => setConfirmRemove(false)} style={hudButtonStyle("ghost")}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {editing && (
          <form onSubmit={(e) => submit(e, editing)} noValidate>
            {!policy && (
              <p style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-muted)", margin: "0 0 1rem" }}>
                No policy saved yet. Add it from your declarations page.
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <label style={field}>
                <span style={labelText}>Insurance company</span>
                <input
                  aria-label="Insurance company"
                  type="text"
                  value={editing.carrier}
                  maxLength={100}
                  onChange={(e) => setForm({ ...editing, carrier: e.target.value })}
                  style={hudInputStyle}
                />
              </label>
              <label style={field}>
                <span style={labelText}>Policy number</span>
                <input
                  aria-label="Policy number"
                  type="text"
                  value={editing.policyNumber}
                  maxLength={60}
                  onChange={(e) => setForm({ ...editing, policyNumber: e.target.value })}
                  style={hudInputStyle}
                />
              </label>
              <label style={field}>
                <span style={labelText}>Renewal date</span>
                <input
                  aria-label="Renewal date"
                  type="date"
                  value={editing.renewalDate}
                  onChange={(e) => setForm({ ...editing, renewalDate: e.target.value })}
                  style={hudInputStyle}
                />
              </label>
              <label style={field}>
                <span style={labelText}>Coverage A (dwelling), $</span>
                <input
                  aria-label="Coverage A (dwelling), $"
                  type="text"
                  inputMode="numeric"
                  value={editing.coverageA}
                  onChange={(e) => setForm({ ...editing, coverageA: e.target.value })}
                  style={hudInputStyle}
                />
              </label>
              <label style={field}>
                <span style={labelText}>Hurricane deductible</span>
                <select
                  aria-label="Hurricane deductible"
                  value={editing.deductibleKind}
                  onChange={(e) =>
                    setForm({ ...editing, deductibleKind: e.target.value as DeductibleKind, deductible: "" })
                  }
                  style={hudInputStyle}
                >
                  <option value="none">Not entered</option>
                  <option value="percent">Percent of Coverage A</option>
                  <option value="amount">Dollar amount</option>
                </select>
              </label>
              {editing.deductibleKind !== "none" && (
                <label style={field}>
                  <span style={labelText}>
                    {editing.deductibleKind === "percent" ? "Percent of Coverage A" : "Deductible amount, $"}
                  </span>
                  <input
                    aria-label={editing.deductibleKind === "percent" ? "Percent of Coverage A" : "Deductible amount, $"}
                    type="text"
                    inputMode="decimal"
                    value={editing.deductible}
                    onChange={(e) => setForm({ ...editing, deductible: e.target.value })}
                    style={hudInputStyle}
                  />
                </label>
              )}
            </div>
            {problem && (
              <p
                role="alert"
                style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-bad)", margin: "0.75rem 0 0" }}
              >
                {problem}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
              <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
                {saving ? "Saving…" : "Save policy"}
              </Button>
              {form && (
                <Button
                  onClick={() => {
                    setForm(null);
                    setProblem(null);
                  }}
                  style={hudButtonStyle("ghost")}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </Panel>

      <p style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 }}>
        If the weekly Home Pulse email is on, it reminds you in the {RENEWAL_WINDOW_DAYS} days before the renewal date.
        Keep the declarations page itself in Documents.
      </p>

      <ClaimKit propertyId={propertyId} canEdit={canEdit} propertyPhotos={photos} />

      <ContentsInventory propertyId={propertyId} canEdit={canEdit} rooms={rooms} propertyPhotos={photos} />
    </div>
  );
}
