/**
 * Move-in plan (#712): what a new owner does in their first weeks, built from
 * the home's own records (house guide, insurance, appliances and their recall
 * check, system age estimates), plus tasks they choose from the inspection
 * report from their purchase. A buyer who claims a home gets a plan; any owner
 * can start one here.
 *
 * Copy rule: the steps are suggestions and the inspection list is an AI
 * reading of the owner's report. Nothing here says a home is safe or up to
 * code.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { Panel, Pill, type PillTone } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { propertyService, type AccessRole, type Property } from "@/services/property";
import { houseGuideService, type HouseGuide } from "@/services/houseGuide";
import { insurancePolicyService } from "@/services/insurancePolicy";
import { roomService, type Room } from "@/services/room";
import { checkRecalls, recallItems, type RecallMatch } from "@/services/recalls";
import { photoService } from "@/services/photo";
import { systemAgesService } from "@/services/systemAges";
import { estimateSystems } from "@/services/systemAgeEstimator";
import { canEditDocuments, encodeDoc } from "@/services/documentVault";
import { errorMessage } from "@/services/candid";
import {
  moveInPlanService,
  readInspection,
  URGENCY_LABELS,
  type MoveInPlan,
  type MoveInTask,
  type TaskDraft,
  type TaskUrgency,
} from "@/services/moveInPlan";
import { buildMoveInSteps, moveInProgress, quotePrefillFor, type MoveInStep } from "@/services/moveInSteps";
import { useAuthStore } from "@/store/authStore";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";

const URGENCY_TONE: Record<TaskUrgency, PillTone> = { safety: "bad", repair: "warn", monitor: "info" };
const URGENCY_ORDER: Record<TaskUrgency, number> = { safety: 0, repair: 1, monitor: 2 };

const label: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--hg-muted)",
  margin: 0,
};

interface Review {
  file: File;
  findings: TaskDraft[];
  keep: boolean[];
}

export default function MoveInPlanPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);

  const [property, setProperty] = useState<Property | null>(null);
  const [plan, setPlan] = useState<MoveInPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [guide, setGuide] = useState<HouseGuide | null>(null);
  const [carrier, setCarrier] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recalls, setRecalls] = useState<RecallMatch[] | null>(null);

  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [notReport, setNotReport] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [fileReport, setFileReport] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([propertyService.getProperty(id).catch(() => null), moveInPlanService.get(id).catch(() => null)]).then(
      ([p, pl]) => {
        if (!live) return;
        setProperty(p);
        setPlan(pl);
        setLoaded(true);
      },
    );
    houseGuideService
      .get(id)
      .then((g) => live && setGuide(g))
      .catch(() => {});
    insurancePolicyService
      .get(id)
      .then((p) => live && setCarrier(p?.carrier ?? null))
      .catch(() => {});
    roomService
      .getRoomsByProperty(id)
      .then(async (r) => {
        if (!live) return;
        setRooms(r);
        const matches = await checkRecalls(recallItems(r));
        if (live) setRecalls(matches);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!principal) return;
    propertyService
      .getAccessRole(id, principal)
      .then(setRole)
      .catch(() => setRole(null));
  }, [id, principal]);

  const canEdit = canEditDocuments(role);

  const systems = useMemo(
    () => (property ? estimateSystems(Number(property.yearBuilt), property.state, systemAgesService.get(id)) : []),
    [property, id],
  );

  const steps: MoveInStep[] = useMemo(
    () =>
      plan && property
        ? buildMoveInSteps({
            propertyId: id,
            city: property.city,
            state: property.state,
            plan,
            guide,
            insuranceCarrier: carrier,
            rooms,
            recalls,
            systems,
          })
        : [],
    [plan, property, id, guide, carrier, rooms, recalls, systems],
  );
  const progress = plan ? moveInProgress(plan, steps) : { done: 0, total: 0 };
  const tasks = plan ? [...plan.tasks].sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]) : [];
  const doneIds = new Set(plan?.doneSteps ?? []);

  const run = async (fn: () => Promise<MoveInPlan>) => {
    try {
      setPlan(await fn());
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save that change. Please try again."));
    }
  };

  const start = () => run(() => moveInPlanService.start(id));
  const tick = (stepId: string, done: boolean) => run(() => moveInPlanService.setStep(id, stepId, done));
  const removeTask = (t: MoveInTask) => run(() => moveInPlanService.deleteTask(id, t.id));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    setNotReport(false);
    setReview(null);
    setReading(true);
    try {
      const out = await readInspection(file);
      if (!out.isInspectionReport) setNotReport(true);
      else setReview({ file, findings: out.findings, keep: out.findings.map(() => true) });
    } catch (err) {
      setReadError(errorMessage(err, "We couldn't read that report. Please try again."));
    } finally {
      setReading(false);
    }
  };

  const kept = review ? review.findings.filter((_, i) => review.keep[i]) : [];
  const addKept = async () => {
    if (!review || kept.length === 0) return;
    setSaving(true);
    try {
      setPlan(await moveInPlanService.addTasks(id, kept));
      setReview(null);
      toast.success(`Added ${kept.length} ${kept.length === 1 ? "task" : "tasks"}`);
      if (fileReport) {
        // Filed in the background: the tasks are saved either way.
        void photoService
          .upload(review.file, `docs_${id}`, id, "PostConstruction", encodeDoc("Inspection", review.file.name))
          .catch(() => toast.error("The report wasn't saved to documents. Add it in the Documents tab."));
      }
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add those tasks. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const endPlan = async () => {
    try {
      await moveInPlanService.end(id);
      navigate(`/properties/${id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't end the plan. Please try again."));
    }
  };

  const address = property ? `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` : "";
  const day = plan ? Math.max(1, Math.floor((Date.now() - plan.startedAt) / 86_400_000) + 1) : 0;

  return (
    <Layout>
      <div
        className="hg-v3"
        data-theme="light"
        style={{ background: "var(--hg-bg)", minHeight: SHELL_PAGE_MIN_HEIGHT, padding: "28px clamp(16px, 4vw, 32px)" }}
      >
        <div style={{ maxWidth: "52rem", margin: "0 auto" }}>
          <Link
            to={`/properties/${id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: MONO,
              fontSize: "0.65rem",
              letterSpacing: "0.06em",
              color: "var(--hg-muted)",
              textDecoration: "none",
              marginBottom: "1rem",
            }}
          >
            <ArrowLeft size={12} aria-hidden /> Back to property
          </Link>

          <h1
            style={{
              fontFamily: SERIF,
              fontWeight: 800,
              fontSize: "1.75rem",
              color: "var(--hg-ink)",
              margin: "0 0 0.25rem",
            }}
          >
            Move-in plan
          </h1>
          {address && (
            <p style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-muted)", margin: "0 0 1rem" }}>
              {address}
            </p>
          )}

          {!loaded ? (
            <p style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--hg-muted)" }}>Loading…</p>
          ) : !plan ? (
            <Panel style={{ padding: "1.5rem" }}>
              {canEdit ? (
                <>
                  <p
                    style={{
                      fontFamily: BODY,
                      fontSize: "0.9rem",
                      color: "var(--hg-ink-2)",
                      margin: "0 0 1rem",
                      lineHeight: 1.55,
                    }}
                  >
                    Just moved in? A move-in plan lists what to do in the first weeks (locks, shutoffs, insurance,
                    utilities, the homestead exemption, recalls) and turns your purchase inspection into a repair list.
                  </p>
                  <button type="button" onClick={start} style={primaryButton(false)}>
                    Start a move-in plan
                  </button>
                </>
              ) : (
                <p style={{ fontFamily: BODY, fontSize: "0.9rem", color: "var(--hg-muted)", margin: 0 }}>
                  There's no move-in plan on this home.
                </p>
              )}
            </Panel>
          ) : (
            <>
              <Panel style={{ padding: "1rem 1.25rem", marginBottom: "1rem" }}>
                <p style={label}>Day {day}</p>
                <p
                  data-testid="move-in-progress"
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 800,
                    fontSize: "1.5rem",
                    color: "var(--hg-ink)",
                    margin: "0.25rem 0 0.5rem",
                  }}
                >
                  {progress.done} of {progress.total} done
                </p>
                <div
                  aria-hidden
                  style={{ height: 6, borderRadius: 100, background: "var(--hg-fill)", overflow: "hidden" }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                      background: "var(--hg-blue)",
                    }}
                  />
                </div>
                <p
                  style={{
                    fontFamily: BODY,
                    fontSize: "0.8rem",
                    color: "var(--hg-muted)",
                    margin: "0.75rem 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  These are suggestions, not an inspection, built from what's on record for this home. Check anything
                  that worries you with a licensed professional.
                </p>
              </Panel>

              <Panel style={{ padding: "0.25rem 0" }}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {steps.map((s, i) => (
                    <li
                      key={s.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "0.9rem 1.25rem",
                        borderBottom: i < steps.length - 1 ? "1px solid var(--hg-line)" : "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`step-${s.id}`}
                        aria-label={s.title}
                        checked={s.done}
                        disabled={!canEdit || !!s.evidence}
                        onChange={(e) => tick(s.id, e.target.checked)}
                        style={{ width: 18, height: 18, marginTop: 2, flex: "none", accentColor: "var(--hg-blue)" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label
                          htmlFor={`step-${s.id}`}
                          style={{
                            fontFamily: BODY,
                            fontWeight: 600,
                            fontSize: "0.95rem",
                            color: s.done ? "var(--hg-muted)" : "var(--hg-ink)",
                            textDecoration: s.done ? "line-through" : "none",
                          }}
                        >
                          {s.title}
                        </label>
                        {s.urgent && !s.done && (
                          <span style={{ marginLeft: 8 }}>
                            <Pill tone="bad">Check now</Pill>
                          </span>
                        )}
                        <p
                          style={{
                            fontFamily: BODY,
                            fontSize: "0.85rem",
                            color: "var(--hg-ink-2)",
                            margin: "0.25rem 0 0",
                            lineHeight: 1.5,
                          }}
                        >
                          {s.detail}
                        </p>
                        {s.evidence && (
                          <p
                            style={{
                              fontFamily: MONO,
                              fontSize: "0.65rem",
                              color: "var(--hg-good)",
                              margin: "0.35rem 0 0",
                            }}
                          >
                            {s.evidence}
                          </p>
                        )}
                        {s.link &&
                          ("to" in s.link ? (
                            <Link to={s.link.to} style={linkStyle}>
                              {s.link.label}
                            </Link>
                          ) : (
                            <a href={s.link.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                              {s.link.label}
                            </a>
                          ))}
                        {s.id === "inspection" && canEdit && (
                          <div style={{ marginTop: "0.6rem" }}>
                            <label style={{ ...secondaryButton(reading), display: "inline-flex" }}>
                              <Upload size={12} aria-hidden />{" "}
                              {reading ? "Reading the report…" : "Upload inspection report"}
                              <input
                                type="file"
                                aria-label="Inspection report file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                disabled={reading}
                                onChange={(e) => {
                                  void onFile(e.target.files?.[0]);
                                  e.target.value = "";
                                }}
                                style={{ display: "none" }}
                              />
                            </label>
                            <p
                              style={{
                                fontFamily: BODY,
                                fontSize: "0.75rem",
                                color: "var(--hg-muted)",
                                margin: "0.4rem 0 0",
                              }}
                            >
                              A PDF up to 1.5 MB, or a photo of the summary pages. Upload more pages to add more.
                            </p>
                            {readError && (
                              <p
                                role="alert"
                                style={{
                                  fontFamily: BODY,
                                  fontSize: "0.8rem",
                                  color: "var(--hg-bad)",
                                  margin: "0.4rem 0 0",
                                }}
                              >
                                {readError}
                              </p>
                            )}
                            {notReport && (
                              <p
                                style={{
                                  fontFamily: BODY,
                                  fontSize: "0.8rem",
                                  color: "var(--hg-ink-2)",
                                  margin: "0.4rem 0 0",
                                }}
                              >
                                That file doesn't look like an inspection report, so nothing was added.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              {review && (
                <Panel style={{ padding: "1rem 1.25rem", marginTop: "1rem" }}>
                  <div data-testid="inspection-review">
                    <h2
                      style={{
                        fontFamily: SERIF,
                        fontWeight: 700,
                        fontSize: "1rem",
                        color: "var(--hg-ink)",
                        margin: "0 0 0.35rem",
                      }}
                    >
                      From {review.file.name}
                    </h2>
                    <p
                      style={{
                        fontFamily: BODY,
                        fontSize: "0.8rem",
                        color: "var(--hg-muted)",
                        margin: "0 0 0.75rem",
                        lineHeight: 1.5,
                      }}
                    >
                      Read by AI from your report: check each item against the report before you add it. Untick anything
                      you don't want on your list.
                    </p>
                    {review.findings.length === 0 ? (
                      <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: "var(--hg-ink-2)", margin: 0 }}>
                        We didn't find any items the inspector flagged on these pages.
                      </p>
                    ) : (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {review.findings.map((f, i) => (
                          <li
                            key={i}
                            style={{
                              display: "flex",
                              gap: 10,
                              padding: "0.5rem 0",
                              borderTop: i ? "1px solid var(--hg-line)" : "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              aria-label={f.title}
                              checked={review.keep[i]}
                              onChange={(e) =>
                                setReview({
                                  ...review,
                                  keep: review.keep.map((k, j) => (j === i ? e.target.checked : k)),
                                })
                              }
                              style={{
                                width: 16,
                                height: 16,
                                marginTop: 2,
                                flex: "none",
                                accentColor: "var(--hg-blue)",
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span
                                style={{
                                  fontFamily: BODY,
                                  fontWeight: 600,
                                  fontSize: "0.88rem",
                                  color: "var(--hg-ink)",
                                }}
                              >
                                {f.title}
                              </span>{" "}
                              <Pill tone={URGENCY_TONE[f.urgency]}>{URGENCY_LABELS[f.urgency]}</Pill>
                              {(f.area || f.detail) && (
                                <p
                                  style={{
                                    fontFamily: BODY,
                                    fontSize: "0.8rem",
                                    color: "var(--hg-muted)",
                                    margin: "0.2rem 0 0",
                                  }}
                                >
                                  {[f.area, f.detail].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontFamily: BODY,
                        fontSize: "0.8rem",
                        color: "var(--hg-ink-2)",
                        margin: "0.75rem 0",
                      }}
                    >
                      <input type="checkbox" checked={fileReport} onChange={(e) => setFileReport(e.target.checked)} />
                      Also save the report to this home's documents
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={addKept}
                        disabled={saving || kept.length === 0}
                        style={primaryButton(saving || kept.length === 0)}
                      >
                        Add {kept.length} {kept.length === 1 ? "task" : "tasks"}
                      </button>
                      <button type="button" onClick={() => setReview(null)} style={secondaryButton(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </Panel>
              )}

              {tasks.length > 0 && (
                <Panel style={{ padding: "1rem 1.25rem", marginTop: "1rem" }}>
                  <h2
                    style={{
                      fontFamily: SERIF,
                      fontWeight: 700,
                      fontSize: "1rem",
                      color: "var(--hg-ink)",
                      margin: "0 0 0.5rem",
                    }}
                  >
                    From your inspection
                  </h2>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {tasks.map((t, i) => {
                      const done = doneIds.has(t.id);
                      return (
                        <li
                          key={t.id}
                          style={{
                            display: "flex",
                            gap: 10,
                            padding: "0.6rem 0",
                            borderTop: i ? "1px solid var(--hg-line)" : "none",
                            flexWrap: "wrap",
                          }}
                        >
                          <input
                            type="checkbox"
                            aria-label={t.title}
                            checked={done}
                            disabled={!canEdit}
                            onChange={(e) => tick(t.id, e.target.checked)}
                            style={{ width: 18, height: 18, marginTop: 2, flex: "none", accentColor: "var(--hg-blue)" }}
                          />
                          <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
                            <span
                              style={{
                                fontFamily: BODY,
                                fontWeight: 600,
                                fontSize: "0.9rem",
                                color: done ? "var(--hg-muted)" : "var(--hg-ink)",
                                textDecoration: done ? "line-through" : "none",
                              }}
                            >
                              {t.title}
                            </span>{" "}
                            <Pill tone={URGENCY_TONE[t.urgency]}>{URGENCY_LABELS[t.urgency]}</Pill>
                            {(t.area || t.detail) && (
                              <p
                                style={{
                                  fontFamily: BODY,
                                  fontSize: "0.8rem",
                                  color: "var(--hg-muted)",
                                  margin: "0.2rem 0 0",
                                }}
                              >
                                {[t.area, t.detail].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          {canEdit && (
                            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                              {t.urgency !== "monitor" && !done && (
                                <button
                                  type="button"
                                  aria-label={`Get quotes for ${t.title}`}
                                  onClick={() =>
                                    navigate("/quotes/new", { state: { prefill: quotePrefillFor(id, t) } })
                                  }
                                  style={secondaryButton(false)}
                                >
                                  Get quotes
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Delete ${t.title}`}
                                onClick={() => removeTask(t)}
                                style={secondaryButton(false)}
                              >
                                <Trash2 size={12} aria-hidden />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              )}

              {canEdit && (
                <div style={{ marginTop: "1.25rem", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {confirmEnd ? (
                    <>
                      <span style={{ fontFamily: BODY, fontSize: "0.85rem", color: "var(--hg-ink-2)" }}>
                        End the plan? Its ticks and tasks are deleted.
                      </span>
                      <button type="button" onClick={endPlan} style={primaryButton(false)}>
                        Yes, end it
                      </button>
                      <button type="button" onClick={() => setConfirmEnd(false)} style={secondaryButton(false)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmEnd(true)} style={secondaryButton(false)}>
                      End the plan
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

const linkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: "0.35rem",
  fontFamily: MONO,
  fontSize: "0.65rem",
  letterSpacing: "0.04em",
  color: "var(--hg-blue-ink)",
};

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    fontFamily: BODY,
    fontWeight: 600,
    fontSize: "0.85rem",
    padding: "0 1.1rem",
    border: "1.5px solid var(--hg-blue)",
    background: "var(--hg-blue)",
    color: "#FCFCFD",
    borderRadius: 100,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function secondaryButton(disabled: boolean): React.CSSProperties {
  return {
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    fontFamily: MONO,
    fontSize: "0.65rem",
    padding: "0.4rem 0.85rem",
    border: "1px solid var(--hg-line-2)",
    background: "var(--hg-surface)",
    color: "var(--hg-ink)",
    borderRadius: 100,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
