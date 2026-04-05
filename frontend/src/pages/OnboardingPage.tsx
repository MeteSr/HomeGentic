import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, ShieldCheck, Wrench, ArrowRight, CheckCircle, FolderOpen } from "lucide-react";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { photoService } from "@/services/photo";
import { systemAgesService } from "@/services/systemAges";
import { useAuthStore } from "@/store/authStore";

import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href: string;
  done: boolean;
}

function buildSteps(properties: Property[], jobs: Job[], firstPropertyId: bigint | undefined, hasDocs: boolean): Step[] {
  const hasProperty   = properties.length > 0;
  const verified      = properties.some((p) => p.verificationLevel !== "Unverified");
  const hasJob        = jobs.length > 0;
  const hasSystemAges = hasProperty && firstPropertyId != null && systemAgesService.hasAny(String(firstPropertyId));
  const propPath      = hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}` : "/properties/new";
  return [
    { id: "add-property",     icon: <Home size={20} />,       title: "Add your first property",         body: "Register your home on-chain and start building its verified maintenance history.",                                                                                                               cta: hasProperty ? "View my property" : "Add property", href: propPath,                                     done: hasProperty  },
    { id: "verify-ownership", icon: <ShieldCheck size={20} />, title: "Verify ownership",               body: "Upload a utility bill, deed, or tax record to earn a verification badge that buyers trust.",                                                                                                     cta: "Verify now",                                      href: `${propPath}/verify`,                            done: verified     },
    { id: "import-docs",      icon: <FolderOpen size={20} />, title: "Import historical documents",     body: "Bulk-upload existing receipts, permits, inspection reports, and warranties. Duplicates are auto-detected — drag in everything and HomeGentic sorts it out.",                                       cta: "Import documents",                                href: `${propPath}?tab=documents`,                     done: hasDocs      },
    { id: "system-ages",      icon: <Wrench size={20} />,     title: "Set your system ages",            body: "Tell us when your HVAC, roof, water heater, and other systems were last replaced — so predictions reflect reality, not just your home's build year.",                                          cta: "Set system ages",                                 href: hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}/systems` : "/dashboard", done: hasSystemAges },
    { id: "log-job",          icon: <Wrench size={20} />,     title: "Log your first maintenance job",  body: "Every repair, renovation, or upgrade you record adds real value to your HomeGentic report.",                                                                                                       cta: "Log a job",                                       href: "/jobs/new",                                     done: hasJob       },
  ];
}

function StepCard({ step, index, isNext, onClick }: { step: Step; index: number; isNext: boolean; onClick: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "1rem",
      padding: "1.25rem 1.5rem",
      borderRadius: RADIUS.sm,
      border: `1.5px solid ${step.done ? COLORS.sageMid : isNext ? COLORS.sage : COLORS.rule}`,
      background: step.done ? COLORS.sageLight : COLORS.white,
    }}>
      {/* Icon */}
      <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: step.done ? COLORS.sageLight : isNext ? COLORS.sage : COLORS.rule, color: step.done ? COLORS.sage : isNext ? COLORS.white : COLORS.plumMid, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {step.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid }}>
            Step {index + 1}
          </span>
          {step.done && (
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.sage, background: COLORS.sageLight, border: `1px solid ${COLORS.sageMid}`, padding: "0.1rem 0.5rem", borderRadius: 100 }}>
              Done
            </span>
          )}
        </div>
        <h3 style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: "0.938rem", color: step.done ? COLORS.plumMid : COLORS.plum, marginBottom: "0.25rem", textDecoration: step.done ? "line-through" : "none" }}>
          {step.title}
        </h3>
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.85rem", color: COLORS.plumMid, lineHeight: 1.6, fontWeight: 300 }}>{step.body}</p>
      </div>

      {!step.done && (
        <button onClick={onClick} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.25rem", borderRadius: 100, border: `1.5px solid ${isNext ? COLORS.sage : COLORS.rule}`, background: isNext ? COLORS.sage : COLORS.white, color: isNext ? COLORS.white : COLORS.plumMid, fontFamily: FONTS.sans, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {step.cta} {isNext && <ArrowRight size={12} />}
        </button>
      )}

      {step.done && <CheckCircle size={20} color={COLORS.sage} style={{ flexShrink: 0 }} />}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate    = useNavigate();
  const { profile } = useAuthStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [hasDocs, setHasDocs]       = useState(false);
  const [loaded, setLoaded]         = useState(false);

  useEffect(() => {
    Promise.all([
      propertyService.getMyProperties().then(setProperties).catch(() => []),
      jobService.getAll().then(setJobs).catch(() => []),
    ]).then(([props]) => {
      const firstId = (props as Property[])[0]?.id;
      if (firstId) {
        photoService.getByJob(`docs_${String(firstId)}`).then((docs) => setHasDocs(docs.length > 0)).catch(() => {});
      }
    }).finally(() => setLoaded(true));
  }, []);

  const firstPropertyId = properties[0]?.id;
  const steps     = buildSteps(properties, jobs, firstPropertyId, hasDocs);
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep  = steps.find((s) => !s.done);

  const handleStep = (step: Step) => { if (!step.done) navigate(step.href); };

  return (
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", flexDirection: "column", alignItems: "center", padding: "3rem 1.25rem 4rem" }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "3rem", cursor: "pointer" }} onClick={() => navigate("/")}>
        <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.5px", color: COLORS.plum }}>Home<span style={{ color: COLORS.sage }}>Gentic</span></span>
      </div>

      {/* Card */}
      <div style={{ borderRadius: RADIUS.card, border: `1px solid ${COLORS.rule}`, background: COLORS.white, padding: "2.5rem", maxWidth: "38rem", width: "100%", boxShadow: SHADOWS.modal }}>

        {/* Welcome header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: COLORS.butter, color: COLORS.plum, padding: "5px 16px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", border: `1px solid rgba(46,37,64,0.1)` }}>
            Welcome
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink, marginBottom: "0.5rem" }}>
            Welcome{profile?.email ? `, ${profile.email.split("@")[0]}` : ""}!
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, maxWidth: "26rem", margin: "0 auto" }}>
            You're in. Let's get your first property on-chain in the next few minutes.
          </p>

          {/* Progress */}
          {(() => {
            const pct      = Math.round((doneCount / steps.length) * 100);
            const allDone  = doneCount === steps.length;
            const barColor = allDone ? S.sage : S.rust;
            return (
              <div style={{ marginTop: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
                    Setup progress
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
                    <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", lineHeight: 1, color: allDone ? S.sage : S.rust }}>
                      {pct}%
                    </span>
                    <span style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
                      {doneCount}/{steps.length} steps
                    </span>
                  </div>
                </div>
                <div style={{ height: "6px", background: COLORS.rule, borderRadius: 100 }}>
                  <div style={{ height: "6px", width: `${pct}%`, background: barColor, borderRadius: 100, transition: "width 0.5s ease" }} />
                </div>
                {allDone && (
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.sage, marginTop: "0.5rem", textAlign: "center" }}>
                    ✓ Setup complete — your HomeGentic profile is ready.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Steps */}
        {!loaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {steps.map((step, i) => (
              <StepCard key={step.id} step={step} index={i} isNext={step === nextStep} onClick={() => handleStep(step)} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${S.rule}`, display: "flex", justifyContent: "center" }}>
          <button onClick={() => navigate("/dashboard")} style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", color: S.inkLight, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            Skip for now — go to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
