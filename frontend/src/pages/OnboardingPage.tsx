import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, ShieldCheck, Wrench, FileText, ArrowRight, CheckCircle } from "lucide-react";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { systemAgesService } from "@/services/systemAges";
import { useAuthStore } from "@/store/authStore";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
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

function buildSteps(properties: Property[], jobs: Job[], firstPropertyId?: bigint): Step[] {
  const hasProperty  = properties.length > 0;
  const verified     = properties.some((p) => p.verificationLevel !== "Unverified" && p.verificationLevel !== "PendingReview");
  const hasJob       = jobs.length > 0;
  const hasSystemAges = hasProperty && firstPropertyId != null && systemAgesService.hasAny(String(firstPropertyId));
  return [
    { id: "add-property",    icon: <Home size={20} />,       title: "Add your first property",          body: "Register your home on-chain and start building its verified maintenance history.",             cta: hasProperty ? "View my property" : "Add property", href: hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}` : "/properties/new", done: hasProperty },
    { id: "verify-ownership", icon: <ShieldCheck size={20} />, title: "Verify ownership",               body: "Upload a utility bill, deed, or tax record to earn a verification badge that buyers trust.",    cta: "Verify now",       href: hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}/verify` : "/properties/new", done: verified },
    { id: "log-job",         icon: <Wrench size={20} />,     title: "Log your first maintenance job",    body: "Every repair, renovation, or upgrade you record adds real value to your HomeFax report.",      cta: "Log a job",        href: "/jobs/new", done: hasJob },
    { id: "system-ages",     icon: <Wrench size={20} />,     title: "Set your system ages",              body: "Tell us when your HVAC, roof, water heater, and other systems were last replaced — so predictions reflect reality, not just your home's build year.", cta: "Set system ages", href: hasProperty && firstPropertyId != null ? `/properties/${firstPropertyId}/systems` : "/dashboard", done: hasSystemAges },
    { id: "get-report",      icon: <FileText size={20} />,   title: "Generate your HomeFax report",      body: "Share a verified, tamper-proof history with buyers, agents, or insurers with one link.",       cta: "Go to dashboard",  href: "/dashboard", done: false },
  ];
}

function StepCard({ step, index, isNext, onClick }: { step: Step; index: number; isNext: boolean; onClick: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "1rem",
      padding: "1.25rem 1.5rem",
      border: `1px solid ${step.done ? S.sage : isNext ? S.rust : S.rule}`,
      background: step.done ? "#F0F6F3" : "#fff",
    }}>
      {/* Icon */}
      <div style={{ width: "2.75rem", height: "2.75rem", border: `1px solid ${step.done ? S.sage : isNext ? S.rust : S.rule}`, color: step.done ? S.sage : isNext ? S.rust : S.inkLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {step.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            Step {index + 1}
          </span>
          {step.done && (
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, border: `1px solid ${S.sage}40`, padding: "0.1rem 0.5rem" }}>
              Done
            </span>
          )}
        </div>
        <h3 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.938rem", color: step.done ? S.inkLight : S.ink, marginBottom: "0.25rem", textDecoration: step.done ? "line-through" : "none" }}>
          {step.title}
        </h3>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.6 }}>{step.body}</p>
      </div>

      {!step.done && (
        <button onClick={onClick} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", border: `1px solid ${isNext ? S.rust : S.rule}`, background: isNext ? S.rust : "#fff", color: isNext ? "#F4F1EB" : S.inkLight, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: isNext ? "pointer" : "default", whiteSpace: "nowrap" }}>
          {step.cta} {isNext && <ArrowRight size={12} />}
        </button>
      )}

      {step.done && <CheckCircle size={20} color={S.sage} style={{ flexShrink: 0 }} />}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate    = useNavigate();
  const { profile } = useAuthStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [loaded, setLoaded]         = useState(false);

  useEffect(() => {
    Promise.all([
      propertyService.getMyProperties().then(setProperties).catch(() => {}),
      jobService.getAll().then(setJobs).catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  const firstPropertyId = properties[0]?.id;
  const steps     = buildSteps(properties, jobs, firstPropertyId);
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep  = steps.find((s) => !s.done);

  const handleStep = (step: Step) => { if (!step.done) navigate(step.href); };

  return (
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", flexDirection: "column", alignItems: "center", padding: "3rem 1.25rem 4rem" }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "3rem", cursor: "pointer" }} onClick={() => navigate("/")}>
        <div style={{ width: "1.5rem", height: "1.5rem", background: S.rust, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Home size={14} color="#F4F1EB" />
        </div>
        <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.125rem", color: S.ink, letterSpacing: "-0.01em" }}>HomeFax</span>
      </div>

      {/* Card */}
      <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "2.5rem", maxWidth: "38rem", width: "100%" }}>

        {/* Welcome header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
            Welcome
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink, marginBottom: "0.5rem" }}>
            Welcome{profile?.email ? `, ${profile.email.split("@")[0]}` : ""}!
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, maxWidth: "26rem", margin: "0 auto" }}>
            You're in. Let's get your first property on-chain in the next few minutes.
          </p>

          {/* Progress */}
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
              <span>Setup progress</span>
              <span style={{ color: doneCount > 0 ? S.rust : S.inkLight }}>{doneCount} / {steps.length} complete</span>
            </div>
            <div style={{ height: "3px", background: S.rule }}>
              <div style={{ height: "3px", width: `${(doneCount / steps.length) * 100}%`, background: S.rust, transition: "width 0.4s ease" }} />
            </div>
          </div>
        </div>

        {/* Steps */}
        {!loaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
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
