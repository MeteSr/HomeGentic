import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, Plus, Wrench, MessageSquare, Sparkles, ArrowRight, X,
  Calendar, AlertTriangle, CheckCircle, XCircle, Mic, MicOff,
  Loader2, Volume2, FileText, TrendingUp, ClipboardList, BarChart3,
  Upload, HelpCircle, ChevronRight,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { LogJobModal } from "@/components/LogJobModal";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import { useAuthStore } from "@/store/authStore";
import {
  computeScoreWithDecay, getScoreGrade, scoreDelta, scoreValueDelta, premiumEstimate,
} from "@/services/scoreService";
import { getAllDecayEvents, getAtRiskWarnings, getTotalDecay, type DecayEvent, type AtRiskWarning } from "@/services/scoreDecayService";
import { getWeeklyPulse } from "@/services/pulseService";
import { getRecentScoreEvents, type ScoreEvent } from "@/services/scoreEventService";
import { jobService } from "@/services/job";
import { propertyService } from "@/services/property";
import toast from "react-hot-toast";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { PropertyCard } from "@/components/PropertyCard";
import { BaselinePromptCard } from "@/components/BaselinePromptCard";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import UpgradeModal from "@/components/UpgradeModal";
import RecurringServiceCreateModal from "@/components/RecurringServiceCreateModal";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import { usePropertySummary } from "@/hooks/usePropertySummary";
import { useJobSummary } from "@/hooks/useJobSummary";
import { useQuoteSummary } from "@/hooks/useQuoteSummary";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { useSubscription } from "@/hooks/useSubscription";
import { useScoreTracking } from "@/hooks/useScoreTracking";
import { useDashboardDismissals } from "@/hooks/useDashboardDismissals";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { Badge } from "@/components/Badge";
import { isNewSince, hasQuoteActivity, pendingQuoteCount } from "@/services/notifications";

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:        "#F8F9FA",
  card:      "#FFFFFF",
  border:    "#E5E7EB",
  text:      COLORS.plum,
  muted:     COLORS.plumMid,
  green:     COLORS.sageText,
  greenBg:   COLORS.sageLight,
  greenBdr:  COLORS.sageMid,
  blue:      "#2563EB",
  blueBg:    "#EFF6FF",
  orange:    "#D97706",
  orangeBg:  "#FFFBEB",
  red:       COLORS.errorText,
  redBg:     "#FEF2F2",
  shadow:    "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

// ─── Shared card wrapper ───────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: "0.75rem", boxShadow: C.shadow, ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeader({
  title, action, actionLabel,
}: { title: string; action?: () => void; actionLabel?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
      <h2 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem", color: C.text, margin: 0 }}>
        {title}
      </h2>
      {action && actionLabel && (
        <button
          onClick={action}
          style={{
            fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue,
            background: "none", border: "none", cursor: "pointer", display: "flex",
            alignItems: "center", gap: "0.25rem", fontWeight: 500,
          }}
        >
          {actionLabel} <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Stat cards ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  children: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
}

function StatCard({ icon, iconBg, title, children, action, actionLabel }: StatCardProps) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{
          width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem",
          background: iconBg, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, fontWeight: 400, marginBottom: "0.25rem" }}>
            {title}
          </p>
          {children}
        </div>
      </div>
      {action && actionLabel && (
        <button
          onClick={action}
          style={{
            fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.blue,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: "0.25rem",
          }}
        >
          {actionLabel} <ArrowRight size={12} />
        </button>
      )}
    </Card>
  );
}

// ─── Property Health Score card ────────────────────────────────────────────────

function PropertyHealthScoreCard({
  score, grade, delta, onViewDetails,
}: { score: number; grade: string; delta: number; onViewDetails: () => void }) {
  const r = 28, cx = 36, cy = 36;
  const circ   = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const fill   = arcLen * (score / 100);

  return (
    <StatCard
      icon={<BarChart3 size={16} color={C.green} />}
      iconBg={C.greenBg}
      title="Property Health Score"
      action={onViewDetails}
      actionLabel="View details"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
          <svg viewBox="0 0 72 72" width="72" height="72">
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke={C.border} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${arcLen} ${circ - arcLen}`}
              transform={`rotate(135 ${cx} ${cy})`}
            />
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke={C.green} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${fill} ${circ - fill}`}
              transform={`rotate(135 ${cx} ${cy})`}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            paddingBottom: "6px",
          }}>
            <span style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.25rem", color: C.text, lineHeight: 1 }}>
              {score}
            </span>
          </div>
        </div>
        <div>
          <span style={{
            display: "inline-block",
            fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600,
            color: C.green, background: C.greenBg, border: `1px solid ${C.greenBdr}`,
            borderRadius: "0.375rem", padding: "0.125rem 0.5rem", marginBottom: "0.375rem",
          }}>
            {grade}
          </span>
          {delta !== 0 && (
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: delta > 0 ? C.green : C.red, fontWeight: 500 }}>
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} pts
            </p>
          )}
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>vs last month</p>
        </div>
      </div>
    </StatCard>
  );
}

// ─── Upcoming Maintenance card ─────────────────────────────────────────────────

function UpcomingMaintenanceStatCard({
  thisWeek, thisMonth, onViewSchedule,
}: { thisWeek: number; thisMonth: number; onViewSchedule: () => void }) {
  return (
    <StatCard
      icon={<Calendar size={16} color={C.blue} />}
      iconBg={C.blueBg}
      title="Upcoming Maintenance"
      action={onViewSchedule}
      actionLabel="View schedule"
    >
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <div>
          <p style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.5rem", color: C.text, lineHeight: 1 }}>
            {thisWeek}
          </p>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>This Week</p>
        </div>
        <div>
          <p style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.5rem", color: C.text, lineHeight: 1 }}>
            {thisMonth}
          </p>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>This Month</p>
        </div>
      </div>
    </StatCard>
  );
}

// ─── Open Tasks card ───────────────────────────────────────────────────────────

function OpenTasksStatCard({
  count, onViewTasks,
}: { count: number; onViewTasks: () => void }) {
  return (
    <StatCard
      icon={<ClipboardList size={16} color="#7C3AED" />}
      iconBg="#F5F3FF"
      title="Open Tasks"
      action={onViewTasks}
      actionLabel="View all tasks"
    >
      <p style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "2rem", color: C.text, lineHeight: 1, marginBottom: "0.25rem" }}>
        {count}
      </p>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>To Do</p>
    </StatCard>
  );
}

// ─── Property Value Impact card ────────────────────────────────────────────────

function PropertyValueImpactCard({
  low, high, onSeeInsights,
}: { low: number; high: number; onSeeInsights: () => void }) {
  const mid = Math.round((low + high) / 2);
  return (
    <StatCard
      icon={<TrendingUp size={16} color={C.blue} />}
      iconBg={C.blueBg}
      title="Property Value Impact"
      action={onSeeInsights}
      actionLabel="See insights"
    >
      <p style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.375rem", color: C.green, lineHeight: 1.1, marginBottom: "0.25rem" }}>
        +${mid.toLocaleString()}
      </p>
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>Potential increase</p>
    </StatCard>
  );
}

// ─── Due-date badge ────────────────────────────────────────────────────────────

function DueBadge({ daysUntil }: { daysUntil: number }) {
  const urgent = daysUntil <= 7;
  const color  = urgent ? C.orange : C.blue;
  const bg     = urgent ? C.orangeBg : C.blueBg;
  return (
    <span style={{
      fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600,
      color, background: bg, borderRadius: "0.375rem",
      padding: "0.125rem 0.5rem", whiteSpace: "nowrap",
    }}>
      Due in {daysUntil} day{daysUntil !== 1 ? "s" : ""}
    </span>
  );
}

// ─── Upcoming Maintenance panel ────────────────────────────────────────────────

interface ScheduledItem {
  id: string;
  label: string;
  dateStr: string;
  frequency: string;
  daysUntil: number;
}

function UpcomingMaintenancePanel({
  items, onViewSchedule,
}: { items: ScheduledItem[]; onViewSchedule: () => void }) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <SectionHeader title="Upcoming Maintenance" action={onViewSchedule} actionLabel="View Schedule" />
      {items.length === 0 ? (
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, textAlign: "center", padding: "1.5rem 0" }}>
          No upcoming maintenance scheduled.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{
                width: "2rem", height: "2rem", borderRadius: "0.5rem",
                background: "#F3F4F6", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0,
              }}>
                <Wrench size={14} color={C.muted} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.text, marginBottom: "0.125rem" }}>
                  {item.label}
                </p>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>
                  {item.dateStr} · {item.frequency}
                </p>
              </div>
              <DueBadge daysUntil={item.daysUntil} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Recent Documents panel ────────────────────────────────────────────────────

interface DocItem {
  id: string;
  title: string;
  dateStr: string;
  size: string;
  type: "PDF" | "IMG";
}

function RecentDocumentsPanel({
  docs, onViewAll,
}: { docs: DocItem[]; onViewAll: () => void }) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <SectionHeader title="Recent Documents" action={onViewAll} actionLabel="View All" />
      {docs.length === 0 ? (
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, textAlign: "center", padding: "1.5rem 0" }}>
          No documents yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {docs.map((doc) => (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{
                width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem",
                background: doc.type === "PDF" ? "#FEF2F2" : "#EFF6FF",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <FileText size={16} color={doc.type === "PDF" ? "#B91C1C" : C.blue} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.text, marginBottom: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.title}
                </p>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>
                  {doc.dateStr} · {doc.size}
                </p>
              </div>
              <span style={{
                fontFamily: FONTS.sans, fontSize: "0.6875rem", fontWeight: 600,
                color: doc.type === "PDF" ? "#B91C1C" : C.blue,
                background: doc.type === "PDF" ? "#FEF2F2" : C.blueBg,
                borderRadius: "0.25rem", padding: "0.125rem 0.375rem",
              }}>
                {doc.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Property Insights panel ───────────────────────────────────────────────────

function PropertyInsightsPanel({
  insight, warnings, onViewAll,
}: {
  insight: string | null;
  warnings: AtRiskWarning[];
  onViewAll: () => void;
}) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <SectionHeader title="Property Insights" action={onViewAll} actionLabel="View all insights" />
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginBottom: "0.875rem" }}>
        AI-Powered insights about your home
      </p>
      {insight && (
        <div style={{
          background: C.greenBg, border: `1px solid ${C.greenBdr}`,
          borderRadius: "0.5rem", padding: "0.875rem",
        }}>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600, color: C.green, marginBottom: "0.375rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <Sparkles size={13} /> Insight
          </p>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, lineHeight: 1.5 }}>
            {insight}
          </p>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: insight ? "0.875rem" : 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {warnings.map((w) => (
            <div key={w.id} style={{
              background: C.orangeBg, border: `1px solid #FDE68A`,
              borderRadius: "0.5rem", padding: "0.75rem",
              display: "flex", gap: "0.5rem", alignItems: "flex-start",
            }}>
              <AlertTriangle size={14} color={C.orange} style={{ flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: "#92400E" }}>
                <strong>{w.label}</strong> — {w.pts} pts at risk in {w.daysRemaining} day{w.daysRemaining !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
      {!insight && warnings.length === 0 && (
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, textAlign: "center", padding: "1rem 0" }}>
          Log maintenance jobs to unlock AI insights.
        </p>
      )}
    </Card>
  );
}

// ─── Property Value Tracker ────────────────────────────────────────────────────

interface ValuePoint { label: string; value: number; }

function PropertyValueTrackerPanel({
  points, onViewFullReport,
}: { points: ValuePoint[]; onViewFullReport: () => void }) {
  if (points.length < 2) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <SectionHeader title="Property Value Tracker" action={onViewFullReport} actionLabel="View full report" />
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, textAlign: "center", padding: "1.5rem 0" }}>
          Track your home value over time as you log maintenance.
        </p>
      </Card>
    );
  }

  const min   = Math.min(...points.map((p) => p.value));
  const max   = Math.max(...points.map((p) => p.value));
  const range = max - min || 1;
  const w     = 100 / (points.length - 1);

  const xs  = points.map((_, i) => i * w);
  const ys  = points.map((p)    => 100 - ((p.value - min) / range) * 80 - 10);
  const d   = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const area = `${d} L${xs[xs.length - 1]},100 L0,100 Z`;

  const latest   = points[points.length - 1];
  const earliest = points[0];
  const changePct = ((latest.value - earliest.value) / earliest.value) * 100;

  return (
    <Card style={{ padding: "1.25rem" }}>
      <SectionHeader title="Property Value Tracker" action={onViewFullReport} actionLabel="View full report" />
      <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginBottom: "0.25rem" }}>
        Estimated Value
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem" }}>
        <span style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.75rem", color: C.text }}>
          ${latest.value.toLocaleString()}
        </span>
        {changePct !== 0 && (
          <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: changePct > 0 ? C.green : C.red }}>
            {changePct > 0 ? "↑" : "↓"} {Math.abs(changePct).toFixed(1)}%
          </span>
        )}
        <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>vs last 12 months</span>
      </div>
      <div style={{ position: "relative", height: "80px" }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <linearGradient id="vt-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.blue} stopOpacity="0.15" />
              <stop offset="100%" stopColor={C.blue} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#vt-gradient)" />
          <path d={d} fill="none" stroke={C.blue} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle
            cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3"
            fill={C.blue} vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.375rem" }}>
        {[points[0], points[Math.floor(points.length / 4)], points[Math.floor(points.length / 2)], points[Math.floor(points.length * 3 / 4)], points[points.length - 1]].map((p, i) => (
          <span key={i} style={{ fontFamily: FONTS.sans, fontSize: "0.6875rem", color: C.muted }}>{p.label}</span>
        ))}
      </div>
    </Card>
  );
}

// ─── Quick Actions ─────────────────────────────────────────────────────────────

interface QuickAction {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  desc: string;
  onClick: () => void;
}

function QuickActionsPanel({ actions, isTablet }: { actions: QuickAction[]; isTablet?: boolean }) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <h2 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem", color: C.text, marginBottom: "1rem" }}>
        Quick Actions
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: isTablet ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: "0.75rem" }}>
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            style={{
              background: "#F9FAFB", border: `1px solid ${C.border}`,
              borderRadius: "0.625rem", padding: "1rem 0.75rem",
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              gap: "0.5rem", cursor: "pointer", textAlign: "left",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#D1D5DB";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB";
              (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
            }}
          >
            <div style={{
              width: "2rem", height: "2rem", borderRadius: "0.5rem",
              background: a.iconBg, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {a.icon}
            </div>
            <div>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.text, marginBottom: "0.25rem" }}>
                {a.label}
              </p>
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, lineHeight: 1.3 }}>
                {a.desc}
              </p>
            </div>
            <ArrowRight size={14} color={C.muted} style={{ alignSelf: "flex-end" }} />
          </button>
        ))}
      </div>
    </Card>
  );
}

// ─── AI Assistant panel ────────────────────────────────────────────────────────

function AIAssistantPanel() {
  const {
    state, transcript, response, error, isSupported,
    startListening, stopListening, reset, sendChat,
    fallbackNotice, quotaExhausted,
    pendingProposal, confirmProposal, dismissProposal,
  } = useVoiceAgent();
  const [inputText, setInputText] = React.useState("");

  const SUGGESTIONS = [
    "When should I replace my water heater?",
    "What maintenance is due this month?",
    "How can I increase my home value?",
    "Summarize my home maintenance history",
  ];

  const isListening  = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle" || state === "error";
  const hasContent   = !!(transcript || response || error);

  return (
    <Card style={{ overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "0.875rem 1rem",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem",
            background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles size={14} color="#7C3AED" />
          </div>
          <span style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text }}>
            AI Assistant
          </span>
          <span style={{
            fontFamily: FONTS.sans, fontSize: "0.6875rem", fontWeight: 600,
            color: "#7C3AED", background: "#EDE9FE", borderRadius: "0.25rem",
            padding: "0.125rem 0.375rem",
          }}>
            BETA
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "1rem" }}>
        {/* Greeting */}
        {isIdle && !hasContent && (
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginBottom: "0.875rem" }}>
            Hi! I'm here to help with your home.
          </p>
        )}

        {/* Response area */}
        {hasContent && (
          <div style={{
            marginBottom: "0.75rem", background: "#F9FAFB",
            borderRadius: "0.5rem", padding: "0.75rem",
          }}>
            {fallbackNotice && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.6875rem", color: C.muted, marginBottom: "0.375rem" }}>
                ⓘ Agent limit reached — answering via chat
              </p>
            )}
            {transcript && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, fontStyle: "italic", marginBottom: response ? "0.375rem" : 0 }}>
                "{transcript}"
              </p>
            )}
            {isProcessing && !response && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>Thinking…</p>
            )}
            {response && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, lineHeight: 1.5 }}>{response}</p>
            )}
            {error && (
              <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.red }}>{error}</p>
            )}
            <button onClick={reset} style={{ marginTop: "0.375rem", background: "none", border: "none", cursor: "pointer", fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, padding: 0 }}>
              Clear
            </button>
          </div>
        )}

        {/* Suggestion chips */}
        {isIdle && !hasContent && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.875rem" }}>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginBottom: "0.125rem" }}>Try asking me:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendChat(s)}
                style={{
                  fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text,
                  background: "#F9FAFB", border: `1px solid ${C.border}`,
                  borderRadius: "0.5rem", padding: "0.5rem 0.75rem",
                  cursor: "pointer", textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB"; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Proposal strip */}
        {pendingProposal && (
          <div style={{
            marginBottom: "0.75rem", borderRadius: "0.5rem",
            background: C.greenBg, border: `1px solid ${C.greenBdr}`,
            padding: "0.75rem",
          }}>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600, color: C.green, marginBottom: "0.25rem" }}>Proposal</p>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text, marginBottom: "0.5rem" }}>
              {pendingProposal.serviceType} · {pendingProposal.propertyAddress} · ${(pendingProposal.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={confirmProposal} style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", padding: "0.375rem 0.875rem", background: C.green, border: "none", color: "#fff", cursor: "pointer", borderRadius: "0.375rem" }}>Confirm</button>
              <button onClick={dismissProposal} style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", padding: "0.375rem 0.875rem", background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", borderRadius: "0.375rem" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Input row */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          border: `1px solid ${C.border}`, borderRadius: "0.625rem",
          padding: "0.5rem 0.75rem", background: "#FFFFFF",
        }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = inputText.trim();
                if (!t || isProcessing) return;
                setInputText("");
                sendChat(t);
              }
            }}
            placeholder={quotaExhausted ? "Chat mode…" : "Ask me anything about your home…"}
            disabled={isProcessing || isListening}
            style={{
              flex: 1, border: "none", outline: "none",
              fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text,
              background: "transparent",
            }}
          />
          {inputText.trim() ? (
            <button
              onClick={() => { const t = inputText.trim(); if (t) { setInputText(""); sendChat(t); } }}
              disabled={isProcessing}
              aria-label="Send"
              style={{
                width: "1.875rem", height: "1.875rem", borderRadius: "0.375rem",
                background: C.blue, border: "none", cursor: isProcessing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <ArrowRight size={14} color="#fff" />
            </button>
          ) : isSupported ? (
            <button
              onClick={isListening ? stopListening : isIdle ? startListening : undefined}
              disabled={isProcessing || isSpeaking}
              aria-label={isListening ? "Stop listening" : "Use voice mode"}
              style={{
                background: "none", border: "none", padding: "0.125rem",
                cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center",
                color: isListening ? C.red : C.muted,
              }}
            >
              {isListening  && <MicOff size={16} />}
              {isProcessing && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
              {isSpeaking   && <Volume2 size={16} />}
              {isIdle       && <Mic size={16} />}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ─── Recent Activity panel ─────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  dateStr: string;
}

function RecentActivityPanel({
  items, onViewAll,
}: { items: ActivityItem[]; onViewAll: () => void }) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <SectionHeader title="Recent Activity" action={onViewAll} actionLabel="View All" />
      {items.length === 0 ? (
        <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, textAlign: "center", padding: "1rem 0" }}>
          No recent activity.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div style={{
                width: "1.875rem", height: "1.875rem", borderRadius: "0.5rem",
                background: item.iconBg, display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </p>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>{item.dateStr}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Quorum banner ─────────────────────────────────────────────────────────────

function QuorumBanner({ onLearnMore }: { onLearnMore: () => void }) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "0.9375rem", color: C.text, marginBottom: "0.375rem" }}>
            Quorum HOA Members Save 10%
          </h3>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, lineHeight: 1.4, marginBottom: "0.75rem" }}>
            As a Quorum HOA member, you get 10% off all plans.
          </p>
          <button
            onClick={onLearnMore}
            style={{
              fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600,
              color: C.blue, background: "none", border: "none",
              cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "0.25rem",
            }}
          >
            Learn more <ArrowRight size={13} />
          </button>
        </div>
        {/* Quorum hex logo */}
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" stroke="#1E3A5F" strokeWidth="2.5" fill="#EFF6FF" />
          <text x="22" y="27" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="700" fill="#1E3A5F">Q</text>
        </svg>
      </div>
    </Card>
  );
}

// ─── My Properties section (kept for navigation) ───────────────────────────────

function MyPropertiesPanel({
  properties, loading, jobs: allJobs, navigate, openAddProp, dismissals,
}: {
  properties: any[];
  loading: boolean;
  jobs: any[];
  navigate: (path: string) => void;
  openAddProp: () => void;
  dismissals: ReturnType<typeof useDashboardDismissals>;
}) {
  const verificationBadge = (level: string) => {
    if (level === "Premium")       return <Badge variant="success">Premium Verified</Badge>;
    if (level === "Basic")         return <Badge variant="info">Basic Verified</Badge>;
    if (level === "PendingReview") return <Badge variant="warning">Pending</Badge>;
    return <Badge variant="default">Unverified</Badge>;
  };

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem", color: C.text, margin: 0 }}>
          My Properties
        </h2>
        <button
          aria-label="Add property"
          onClick={openAddProp}
          style={{
            display: "flex", alignItems: "center", gap: "0.375rem",
            fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 500,
            color: C.blue, background: "none", border: `1px solid ${C.border}`,
            borderRadius: "0.5rem", padding: "0.375rem 0.75rem", cursor: "pointer",
          }}
        >
          <Plus size={14} /> Add Property
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem 0" }}><div className="spinner-lg" /></div>
      ) : properties.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
          <Home size={36} color={C.border} style={{ margin: "0 auto 0.875rem" }} />
          <p style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem", color: C.text, marginBottom: "0.375rem" }}>
            No properties yet
          </p>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, maxWidth: "20rem", margin: "0 auto 1.25rem" }}>
            Add your first property to start building a verified maintenance history.
          </p>
          <Button onClick={openAddProp} icon={<Plus size={14} />}>Add Property</Button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            {properties.map((property) => (
              <PropertyCard
                key={String(property.id)}
                property={property}
                onClick={() => navigate(`/properties/${property.id}`)}
                badge={verificationBadge(property.verificationLevel)}
              />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {properties.map((property) => (
              <BaselinePromptCard
                key={String(property.id)}
                property={property}
                dismissed={dismissals.dismissedBaselinePrompts.has(String(property.id))}
                onDismiss={() => dismissals.dismissBaselinePrompt(String(property.id))}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { isMobile, isTablet } = useBreakpoint();
  const { isOpen: isWizardOpen, open: openAddProp } = useAddPropertyStore();

  // ─── Domain hooks ─────────────────────────────────────────────────────────────
  const {
    properties, managedProperties, ownerNotifs, loading: propLoading,
    dismissAllNotifications,
  } = usePropertySummary();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const propertyInitialized = useRef(false);

  const activePropertyId = selectedPropertyId ?? (properties.length === 1 ? String(properties[0].id) : null);
  const activeProperty   = activePropertyId
    ? properties.find((p) => String(p.id) === activePropertyId) ?? null
    : null;

  const jobSummary   = useJobSummary(properties, propLoading);
  const quoteSummary = useQuoteSummary();
  const { recurringServices, visitLogMap, systemAges } = useMaintenanceSchedule(properties, propLoading, activePropertyId);
  const { userTier } = useSubscription();

  const loading = propLoading || jobSummary.loading;

  const { allJobs, pendingProposals } = jobSummary;
  const { quoteRequests } = quoteSummary;

  const jobs = activePropertyId
    ? allJobs.filter((j) => j.propertyId === activePropertyId)
    : allJobs;

  // ─── Score ────────────────────────────────────────────────────────────────────
  const decayEvents: DecayEvent[] = React.useMemo(
    () => !loading ? getAllDecayEvents(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const atRiskWarnings: AtRiskWarning[] = React.useMemo(
    () => !loading ? getAtRiskWarnings(jobs, systemAges, Date.now()) : [],
    [jobs, systemAges, loading]
  );
  const totalDecay      = getTotalDecay(decayEvents);
  const homegenticScore = activeProperty ? computeScoreWithDecay(jobs, [activeProperty], totalDecay) : 0;
  const scoreGrade      = getScoreGrade(homegenticScore);

  const { scoreHistory } = useScoreTracking(activePropertyId, homegenticScore, loading);
  const delta = scoreDelta(scoreHistory);

  // ─── Dismissals ───────────────────────────────────────────────────────────────
  const d = useDashboardDismissals();

  // ─── Modals ───────────────────────────────────────────────────────────────────
  const [showLogJobModal,  setShowLogJobModal]  = useState(false);
  const [logJobPrefill,    setLogJobPrefill]    = useState<{ serviceType?: string } | undefined>();
  const [showQuoteModal,   setShowQuoteModal]   = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAddService,   setShowAddService]   = useState(false);

  const openLogJob = (prefill?: { serviceType?: string }) => {
    setLogJobPrefill(prefill);
    setShowLogJobModal(true);
  };

  // ─── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!propLoading && properties.length === 1 && !isWizardOpen) {
      navigate(`/properties/${properties[0].id}`, { replace: true });
    }
  }, [propLoading, properties.length, isWizardOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!propLoading && properties.length > 0 && !propertyInitialized.current) {
      propertyInitialized.current = true;
      setSelectedPropertyId(String(properties[0].id));
    }
  }, [propLoading, properties]);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!propLoading && !autoOpenedRef.current && profile && !profile.onboardingComplete && properties.length === 0) {
      autoOpenedRef.current = true;
      openAddProp();
    }
  }, [propLoading, profile, properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived data for new panels ─────────────────────────────────────────────

  // Property value impact
  const est = React.useMemo(() => premiumEstimate(homegenticScore), [homegenticScore]);

  // Open tasks = unverified jobs + pending proposals
  const openTaskCount = React.useMemo(
    () => jobs.filter((j) => !j.verified).length + pendingProposals.length,
    [jobs, pendingProposals]
  );

  const FREQ_DAYS: Record<string, number> = {
    Weekly: 7, BiWeekly: 14, Monthly: 30,
    Quarterly: 91, SemiAnnually: 182, Annually: 365,
  };
  const FREQ_LABELS: Record<string, string> = {
    Weekly: "Every week", BiWeekly: "Every 2 weeks", Monthly: "Every month",
    Quarterly: "Every 3 months", SemiAnnually: "Every 6 months", Annually: "Annually",
  };

  // Maintenance schedule items
  const maintenanceItems: ScheduledItem[] = React.useMemo(() => {
    const now = Date.now();
    return recurringServices
      .slice(0, 3)
      .map((svc) => {
        const logs       = visitLogMap[svc.id] ?? [];
        const lastVisit  = logs.length > 0
          ? new Date(logs[logs.length - 1].visitDate).getTime()
          : new Date(svc.startDate).getTime();
        const freqDays   = FREQ_DAYS[svc.frequency] ?? 365;
        const freqMs     = freqDays * 24 * 60 * 60 * 1000;
        const nextDue    = lastVisit + freqMs;
        const daysUntil  = Math.max(0, Math.round((nextDue - now) / (24 * 60 * 60 * 1000)));
        return {
          id:         svc.id,
          label:      `${svc.serviceType} Service`,
          dateStr:    new Date(nextDue).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          frequency:  FREQ_LABELS[svc.frequency] ?? svc.frequency,
          daysUntil,
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringServices, visitLogMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const maintenanceThisWeek  = maintenanceItems.filter((m) => m.daysUntil <= 7).length;
  const maintenanceThisMonth = maintenanceItems.filter((m) => m.daysUntil <= 30).length;

  // Recent documents = recent verified jobs
  const recentDocs: DocItem[] = React.useMemo(() => {
    return [...jobs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
      .map((job) => ({
        id:      job.id,
        title:   `${job.serviceType} ${job.isDiy ? "Record" : "Receipt"}`,
        dateStr: new Date(job.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        size:    `$${(job.amount / 100).toLocaleString()}`,
        type:    "PDF" as const,
      }));
  }, [jobs]);

  // Property insights
  const pulseTip = React.useMemo(() => getWeeklyPulse(properties, jobs), [properties, jobs]);

  // Property value tracker — map score history to estimated home value
  const valuePoints: ValuePoint[] = React.useMemo(() => {
    if (!activeProperty || scoreHistory.length < 2) return [];
    const baseValue = 350_000;
    return scoreHistory.map((entry) => {
      const est2 = premiumEstimate(entry.score);
      const mid  = est2 ? Math.round((est2.low + est2.high) / 2) : 0;
      return {
        label: new Date(entry.timestamp).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        value: baseValue + mid,
      };
    });
  }, [scoreHistory, activeProperty]);

  // Recent activity
  const scoreEvents: ScoreEvent[] = React.useMemo(
    () => (!loading ? getRecentScoreEvents(jobs, activeProperty ? [activeProperty] : []) : []),
    [jobs, activeProperty, loading]
  );

  const activityItems: ActivityItem[] = React.useMemo(() => {
    return scoreEvents.slice(0, 4).map((ev) => ({
      id:      ev.id,
      icon:    ev.category === "Job"
        ? <CheckCircle size={14} color={C.green} />
        : ev.category === "Property"
        ? <Home size={14} color={C.blue} />
        : <FileText size={14} color={C.muted} />,
      iconBg:  ev.category === "Job"      ? C.greenBg
        : ev.category === "Property"      ? C.blueBg
        : "#F3F4F6",
      label:   ev.label,
      dateStr: new Date(ev.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    }));
  }, [scoreEvents]);

  // ─── Greeting ─────────────────────────────────────────────────────────────────
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.email
    ? profile.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()).split(" ")[0]
    : "";
  const displayName = firstName || "there";

  // ─── Quick actions ────────────────────────────────────────────────────────────
  const quickActions: QuickAction[] = [
    {
      icon:    <Wrench size={16} color={C.green} />,
      iconBg:  C.greenBg,
      label:   "Log Maintenance",
      desc:    "Add a new service or repair record",
      onClick: () => openLogJob(undefined),
    },
    {
      icon:    <Upload size={16} color={C.blue} />,
      iconBg:  C.blueBg,
      label:   "Upload Document",
      desc:    "Store receipts, reports, and more",
      onClick: () => navigate("/documents"),
    },
    {
      icon:    <MessageSquare size={16} color="#7C3AED" />,
      iconBg:  "#EDE9FE",
      label:   "Request Quote",
      desc:    "Get quotes from trusted pros",
      onClick: () => setShowQuoteModal(true),
    },
    {
      icon:    <Sparkles size={16} color="#D97706" />,
      iconBg:  C.orangeBg,
      label:   "AI Assistant",
      desc:    "Ask questions about your home",
      onClick: () => { /* scroll to AI panel */ },
    },
    {
      icon:    <BarChart3 size={16} color={C.blue} />,
      iconBg:  C.blueBg,
      label:   "View Reports",
      desc:    "See insights and property reports",
      onClick: () => navigate("/market"),
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{
        background:  C.bg,
        minHeight:   "100%",
        padding:     isMobile ? "1rem" : "1.5rem",
        display:     "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 320px",
        gap:         "1.5rem",
        alignItems:  "start",
      }}>

        {/* ── Main column ─────────────────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Welcome header */}
          <div>
            <h1 style={{
              fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.625rem",
              color: C.text, margin: "0 0 0.25rem",
            }}>
              {greeting}, {displayName}! 👋
            </h1>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.9375rem", color: C.muted }}>
              Here's what's happening with your home.
            </p>
          </div>

          {/* 4 stat cards */}
          {!loading && properties.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
              gap: "1rem",
            }}>
              <PropertyHealthScoreCard
                score={homegenticScore}
                grade={scoreGrade}
                delta={delta}
                onViewDetails={() => navigate(`/properties/${activePropertyId}`)}
              />
              <UpcomingMaintenanceStatCard
                thisWeek={maintenanceThisWeek}
                thisMonth={maintenanceThisMonth}
                onViewSchedule={() => navigate("/maintenance")}
              />
              <OpenTasksStatCard
                count={openTaskCount}
                onViewTasks={() => navigate(`/properties/${activePropertyId}`)}
              />
              {est ? (
                <PropertyValueImpactCard
                  low={est.low}
                  high={est.high}
                  onSeeInsights={() => navigate("/market")}
                />
              ) : (
                <StatCard
                  icon={<TrendingUp size={16} color={C.blue} />}
                  iconBg={C.blueBg}
                  title="Property Value Impact"
                >
                  <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>
                    Log more jobs to unlock value insights.
                  </p>
                </StatCard>
              )}
            </div>
          )}

          {/* Upcoming Maintenance + Recent Documents */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1.5rem" }}>
            <UpcomingMaintenancePanel
              items={maintenanceItems}
              onViewSchedule={() => navigate("/maintenance")}
            />
            <RecentDocumentsPanel
              docs={recentDocs}
              onViewAll={() => navigate(`/properties/${activePropertyId}`)}
            />
          </div>

          {/* Property Insights + Value Tracker */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1.5rem" }}>
            <PropertyInsightsPanel
              insight={pulseTip?.headline ?? null}
              warnings={atRiskWarnings}
              onViewAll={() => navigate("/market")}
            />
            <PropertyValueTrackerPanel
              points={valuePoints}
              onViewFullReport={() => navigate("/market")}
            />
          </div>

          {/* Quick Actions */}
          {!isMobile && <QuickActionsPanel actions={quickActions} isTablet={isTablet} />}

          {/* My Properties */}
          <MyPropertiesPanel
            properties={properties}
            loading={loading}
            jobs={allJobs}
            navigate={navigate}
            openAddProp={openAddProp}
            dismissals={d}
          />

          {/* Pending Contractor Proposals */}
          {pendingProposals.length > 0 && (
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
                <h2 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem", color: C.text, margin: 0 }}>
                  Pending Contractor Proposals
                </h2>
                <span style={{
                  fontFamily: FONTS.sans, fontSize: "0.75rem", fontWeight: 600,
                  color: "#fff", background: C.green, borderRadius: "1rem", padding: "0.125rem 0.625rem",
                }}>
                  {pendingProposals.length} awaiting review
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {pendingProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    data-testid="pending-proposal-card"
                    style={{
                      border: `1px solid ${C.border}`, borderRadius: "0.625rem",
                      padding: "1rem 1.25rem",
                      display: "flex", flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "flex-start" : "center", gap: "1rem",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.text }}>
                          {proposal.serviceType}
                        </span>
                        {(proposal as any).potentialDuplicateOf && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.red }}>
                            <AlertTriangle size={12} /> Possible duplicate
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>{proposal.description}</p>
                      <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
                        {proposal.contractorName && (
                          <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>By {proposal.contractorName}</span>
                        )}
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>{proposal.date}</span>
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>
                          ${(proposal.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button
                        onClick={() => jobSummary.approveProposal(proposal.id)}
                        data-testid="approve-proposal"
                        style={{
                          display: "flex", alignItems: "center", gap: "0.25rem",
                          fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600,
                          padding: "0.5rem 1rem", background: C.green, color: "#fff",
                          border: "none", cursor: "pointer", borderRadius: "0.5rem",
                        }}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        onClick={() => jobSummary.rejectProposal(proposal.id)}
                        data-testid="reject-proposal"
                        style={{
                          display: "flex", alignItems: "center", gap: "0.25rem",
                          fontFamily: FONTS.sans, fontSize: "0.8125rem",
                          padding: "0.5rem 1rem", background: "none", color: C.muted,
                          border: `1px solid ${C.border}`, cursor: "pointer", borderRadius: "0.5rem",
                        }}
                      >
                        <XCircle size={14} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>

        {/* ── Right panel ──────────────────────────────────────────────────────── */}
        {!isMobile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <AIAssistantPanel />
            <RecentActivityPanel items={activityItems} onViewAll={() => navigate(`/properties/${activePropertyId}`)} />
            <QuorumBanner onLearnMore={() => navigate("/checkout")} />
          </div>
        )}

      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <LogJobModal
        isOpen={showLogJobModal}
        prefill={logJobPrefill}
        onClose={() => setShowLogJobModal(false)}
        onSuccess={() => setShowLogJobModal(false)}
        properties={properties}
      />
      <RequestQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        onSuccess={() => setShowQuoteModal(false)}
        properties={properties}
      />
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
      <RecurringServiceCreateModal
        open={showAddService}
        onClose={() => setShowAddService(false)}
        defaultPropertyId={activePropertyId ?? undefined}
        onSuccess={() => setShowAddService(false)}
      />
    </Layout>
  );
}
