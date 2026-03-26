import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, ShieldCheck, Wrench, FileText,
  ArrowRight, CheckCircle, Circle, Sparkles,
} from "lucide-react";
import { propertyService, Property } from "@/services/property";
import { jobService, Job } from "@/services/job";
import { useAuthStore } from "@/store/authStore";

// ─── Palette (matches new landing page) ──────────────────────────────────────
const CREAM  = "#FAFAF7";
const ORANGE = "#E8580C";
const DARK   = "#1A1A1A";
const MUTED  = "#6B6B6B";
const WHITE  = "#FFFFFF";

// ─── Step definition ─────────────────────────────────────────────────────────

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href: string;
  done: boolean;
}

function buildSteps(
  properties: Property[],
  jobs: Job[],
  firstPropertyId?: bigint,
): Step[] {
  const hasProperty   = properties.length > 0;
  const verified      = properties.some((p) => p.verificationLevel !== "Unverified" && p.verificationLevel !== "PendingReview");
  const hasJob        = jobs.length > 0;

  return [
    {
      id: "add-property",
      icon: <Home size={22} />,
      title: "Add your first property",
      body: "Register your home on-chain and start building its verified maintenance history.",
      cta: hasProperty ? "View my property" : "Add property",
      href: hasProperty && firstPropertyId != null
        ? `/properties/${firstPropertyId}`
        : "/properties/new",
      done: hasProperty,
    },
    {
      id: "verify-ownership",
      icon: <ShieldCheck size={22} />,
      title: "Verify ownership",
      body: "Upload a utility bill, deed, or tax record to earn a verification badge that buyers trust.",
      cta: "Verify now",
      href: hasProperty && firstPropertyId != null
        ? `/properties/${firstPropertyId}/verify`
        : "/properties/new",
      done: verified,
    },
    {
      id: "log-job",
      icon: <Wrench size={22} />,
      title: "Log your first maintenance job",
      body: "Every repair, renovation, or upgrade you record adds real value to your HomeFax report.",
      cta: "Log a job",
      href: "/jobs/new",
      done: hasJob,
    },
    {
      id: "get-report",
      icon: <FileText size={22} />,
      title: "Generate your HomeFax report",
      body: "Share a verified, tamper-proof history with buyers, agents, or insurers with one link.",
      cta: "Go to dashboard",
      href: "/dashboard",
      done: false, // triggered by going to dashboard
    },
  ];
}

// ─── Step card ───────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  isNext,
  onClick,
}: {
  step: Step;
  index: number;
  isNext: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  const borderColor = step.done
    ? "#16A34A"
    : isNext
    ? ORANGE
    : "#E5E7EB";

  const bgColor = step.done
    ? "#F0FDF4"
    : isNext
    ? WHITE
    : WHITE;

  const iconBg = step.done
    ? "#DCFCE7"
    : isNext
    ? "#FFF3EE"
    : "#F3F4F6";

  const iconColor = step.done ? "#16A34A" : isNext ? ORANGE : "#9CA3AF";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "1rem",
        padding: "1.25rem 1.5rem",
        borderRadius: "1rem",
        border: `1.5px solid ${borderColor}`,
        backgroundColor: bgColor,
        boxShadow: hover && isNext ? "0 8px 24px rgba(232,88,12,0.12)" : "none",
        transition: "box-shadow 0.15s, transform 0.15s",
        transform: hover && isNext ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Number + icon */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
        <div
          style={{
            width: "2.75rem",
            height: "2.75rem",
            borderRadius: "0.75rem",
            backgroundColor: iconBg,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {step.icon}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            Step {index + 1}
          </span>
          {step.done && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#16A34A",
                backgroundColor: "#DCFCE7",
                padding: "0.1rem 0.5rem",
                borderRadius: "9999px",
              }}
            >
              Done
            </span>
          )}
        </div>

        <h3
          style={{
            fontSize: "0.938rem",
            fontWeight: 700,
            color: step.done ? "#374151" : DARK,
            marginBottom: "0.25rem",
            textDecoration: step.done ? "line-through" : "none",
          }}
        >
          {step.title}
        </h3>
        <p style={{ fontSize: "0.813rem", color: MUTED, lineHeight: 1.55 }}>
          {step.body}
        </p>
      </div>

      {/* CTA */}
      {!step.done && (
        <button
          onClick={onClick}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.5rem 1rem",
            borderRadius: "0.625rem",
            backgroundColor: isNext ? ORANGE : "transparent",
            color: isNext ? WHITE : "#9CA3AF",
            border: isNext ? "none" : "1.5px solid #E5E7EB",
            fontSize: "0.813rem",
            fontWeight: 600,
            cursor: isNext ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          {step.cta} {isNext && <ArrowRight size={14} />}
        </button>
      )}

      {step.done && (
        <CheckCircle size={22} color="#16A34A" style={{ flexShrink: 0 }} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate   = useNavigate();
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
  const steps = buildSteps(properties, jobs, firstPropertyId);
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep  = steps.find((s) => !s.done);

  const handleStep = (step: Step) => {
    if (!step.done) navigate(step.href);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: CREAM,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "3rem 1.25rem 4rem",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "3rem",
          cursor: "pointer",
        }}
        onClick={() => navigate("/")}
      >
        <Home size={20} color={ORANGE} />
        <span style={{ fontWeight: 900, fontSize: "1.125rem", color: DARK, letterSpacing: "-0.01em" }}>
          HomeFax
        </span>
      </div>

      {/* Card */}
      <div
        style={{
          backgroundColor: WHITE,
          borderRadius: "1.5rem",
          padding: "2.5rem",
          maxWidth: "38rem",
          width: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
        }}
      >
        {/* Welcome header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              borderRadius: "1rem",
              backgroundColor: "#FFF3EE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}
          >
            <Sparkles size={22} color={ORANGE} />
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 900,
              color: DARK,
              letterSpacing: "-0.02em",
              marginBottom: "0.5rem",
            }}
          >
            Welcome{profile?.email ? `, ${profile.email.split("@")[0]}` : ""}!
          </h1>
          <p style={{ fontSize: "0.875rem", color: MUTED, maxWidth: "26rem", margin: "0 auto" }}>
            You're in. Let's get your first property on-chain in the next few minutes.
          </p>

          {/* Progress bar */}
          <div style={{ marginTop: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: MUTED,
                marginBottom: "0.5rem",
              }}
            >
              <span>Setup progress</span>
              <span style={{ color: doneCount > 0 ? ORANGE : MUTED }}>
                {doneCount} / {steps.length} complete
              </span>
            </div>
            <div
              style={{
                height: "6px",
                backgroundColor: "#F3F4F6",
                borderRadius: "9999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(doneCount / steps.length) * 100}%`,
                  backgroundColor: ORANGE,
                  borderRadius: "9999px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        {!loaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                isNext={step === nextStep}
                onClick={() => handleStep(step)}
              />
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div
          style={{
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #F3F4F6",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              fontSize: "0.813rem",
              color: MUTED,
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            Skip for now — go to my dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
