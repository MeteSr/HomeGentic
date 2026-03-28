import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { jobService, Job } from "@/services/job";
import { propertyService, Property } from "@/services/property";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
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

const amber = COLORS.plumMid;

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;
const NINETY_DAYS  = 90 * 24 * 60 * 60 * 1000;

function warrantyExpiry(job: Job): number {
  return new Date(job.date).getTime() + (job.warrantyMonths ?? 0) * MS_PER_MONTH;
}

type WarrantyStatus = "active" | "expiring" | "expired";

function warrantyStatus(job: Job): WarrantyStatus {
  const expiry = warrantyExpiry(job);
  const now    = Date.now();
  if (expiry <= now)              return "expired";
  if (expiry - now <= NINETY_DAYS) return "expiring";
  return "active";
}

function daysRemaining(job: Job): number {
  return Math.round((warrantyExpiry(job) - Date.now()) / (24 * 60 * 60 * 1000));
}

interface WarrantyJob {
  job:      Job;
  property: Property | undefined;
  status:   WarrantyStatus;
  expiry:   Date;
  daysLeft: number;
}

function StatusBadge({ status }: { status: WarrantyStatus }) {
  const cfg = {
    active:   { label: "Active",        color: S.sage,     bg: COLORS.sageLight, border: `${S.sage}40` },
    expiring: { label: "Expiring Soon", color: amber,      bg: COLORS.butter,    border: `${amber}40`  },
    expired:  { label: "Expired",       color: S.inkLight, bg: S.paper,          border: S.rule        },
  }[status];
  return (
    <span style={{
      fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
      textTransform: "uppercase", color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      padding: "0.15rem 0.5rem",
    }}>
      {cfg.label}
    </span>
  );
}

function WarrantyRow({ item, isLast }: { item: WarrantyJob; isLast: boolean }) {
  const navigate = useNavigate();
  const icon = item.status === "active"
    ? <ShieldCheck size={16} color={S.sage} />
    : item.status === "expiring"
    ? <AlertTriangle size={16} color={amber} />
    : <Clock size={16} color={S.inkLight} />;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "1rem",
      padding: "1rem 1.25rem",
      borderBottom: isLast ? "none" : `1px solid ${S.rule}`,
      background: COLORS.white,
    }}>
      <div style={{ marginTop: "0.1rem", flexShrink: 0 }}>{icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
          <span style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.875rem", color: item.status === "expired" ? S.inkLight : S.ink }}>
            {item.job.serviceType}
          </span>
          <StatusBadge status={item.status} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.5rem" }}>
          {item.property && (
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
              {item.property.address}, {item.property.city}
            </span>
          )}
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            {item.job.isDiy ? "DIY" : item.job.contractorName ?? "—"}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            Job date: {item.job.date}
          </span>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1rem", color: item.status === "expiring" ? amber : item.status === "expired" ? S.inkLight : S.sage, lineHeight: 1, marginBottom: "0.2rem" }}>
          {item.status === "expired"
            ? `Exp. ${item.expiry.toLocaleDateString()}`
            : item.daysLeft === 0
            ? "Expires today"
            : `${item.daysLeft} day${item.daysLeft !== 1 ? "s" : ""}`}
        </div>
        {item.status !== "expired" && (
          <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
            until {item.expiry.toLocaleDateString()}
          </div>
        )}
        <button
          onClick={() => navigate(`/jobs/new`, { state: { editJob: item.job } })}
          style={{ marginTop: "0.5rem", fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, background: "none", border: `1px solid ${S.rule}`, padding: "0.2rem 0.5rem", cursor: "pointer" }}
        >
          View
        </button>
      </div>
    </div>
  );
}

function Section({ title, items, emptyText }: { title: string; items: WarrantyJob[]; emptyText: string }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.75rem" }}>
        {title} <span style={{ color: S.rust }}>({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "1.25rem", border: `1px solid ${S.rule}`, background: COLORS.white, fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ border: `1px solid ${S.rule}` }}>
          {items.map((item, i) => (
            <WarrantyRow key={item.job.id} item={item} isLast={i === items.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WarrantyWalletPage() {
  const navigate = useNavigate();
  const [warrantyJobs, setWarrantyJobs] = useState<WarrantyJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [userTier, setUserTier] = useState<PlanTier>("Free");

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch(() => {});
    Promise.all([
      jobService.getAll(),
      propertyService.getMyProperties(),
    ]).then(([jobs, properties]) => {
      const propMap = Object.fromEntries(properties.map((p) => [String(p.id), p]));
      const withWarranty = jobs
        .filter((j) => j.warrantyMonths && j.warrantyMonths > 0)
        .map((job): WarrantyJob => ({
          job,
          property: propMap[job.propertyId],
          status:   warrantyStatus(job),
          expiry:   new Date(warrantyExpiry(job)),
          daysLeft: Math.max(0, daysRemaining(job)),
        }))
        .sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
      setWarrantyJobs(withWarranty);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const expiring = warrantyJobs.filter((w) => w.status === "expiring");
  const active   = warrantyJobs.filter((w) => w.status === "active");
  const expired  = warrantyJobs.filter((w) => w.status === "expired");

  if (userTier === "Free") {
    return (
      <Layout>
        <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
          <UpgradeGate
            feature="Warranty Wallet"
            description="Track active warranties across all your appliances and systems — and get alerts before they expire."
            icon="🛡️"
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Warranty Wallet
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "0.375rem" }}>
          Your Warranties
        </h1>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, marginBottom: "2rem" }}>
          Warranties logged across all your maintenance jobs.
        </p>

        {!loaded ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <div className="spinner-lg" />
          </div>
        ) : warrantyJobs.length === 0 ? (
          <div style={{ padding: "2rem", border: `1px solid ${S.rule}`, background: COLORS.white, textAlign: "center" }}>
            <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>No warranties logged yet</p>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, marginBottom: "1.25rem" }}>
              When you log a job with a warranty duration, it will appear here.
            </p>
            <button
              onClick={() => navigate("/jobs/new")}
              style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", border: `1px solid ${S.rust}`, background: S.rust, color: S.paper, cursor: "pointer" }}
            >
              Log a Job
            </button>
          </div>
        ) : (
          <>
            <Section title="Expiring Soon" items={expiring} emptyText="No warranties expiring in the next 90 days." />
            <Section title="Active"        items={active}   emptyText="No active warranties." />
            <Section title="Expired"       items={expired}  emptyText="No expired warranties." />
          </>
        )}
      </div>
    </Layout>
  );
}
