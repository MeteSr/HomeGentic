import React from "react";
import {
  Wrench, Plus, Home, ArrowRight, ChevronRight,
  Calendar, AlertTriangle, Sparkles, FileText, TrendingUp,
  ClipboardList, BarChart3,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { PropertyCard } from "@/components/PropertyCard";
import { BaselinePromptCard } from "@/components/BaselinePromptCard";
import type { AtRiskWarning } from "@/services/scoreDecayService";
import { useDashboardDismissals } from "@/hooks/useDashboardDismissals";
import { C, FONTS } from "./tokens";

// ─── Card primitives ───────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: "0.75rem", boxShadow: C.shadow, ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionHeader({
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

// ─── Stat card shell ───────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  children: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
}

export function StatCard({ icon, iconBg, title, children, action, actionLabel }: StatCardProps) {
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

// ─── Stat cards ────────────────────────────────────────────────────────────────

export function PropertyHealthScoreCard({
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

export function UpcomingMaintenanceStatCard({
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

export function OpenTasksStatCard({
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

export function PropertyValueImpactCard({
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

export function DueBadge({ daysUntil }: { daysUntil: number }) {
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

export interface ScheduledItem {
  id: string;
  label: string;
  dateStr: string;
  frequency: string;
  daysUntil: number;
}

export function UpcomingMaintenancePanel({
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

export interface DocItem {
  id: string;
  title: string;
  dateStr: string;
  size: string;
  type: "PDF" | "IMG";
}

export function RecentDocumentsPanel({
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

export function PropertyInsightsPanel({
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

export interface ValuePoint { label: string; value: number; }

export function PropertyValueTrackerPanel({
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

export interface QuickAction {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  desc: string;
  onClick: () => void;
}

export function QuickActionsPanel({ actions, isTablet }: { actions: QuickAction[]; isTablet?: boolean }) {
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

// ─── Recent Activity panel ─────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  dateStr: string;
}

export function RecentActivityPanel({
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

// ─── Invite a Neighbor panel ───────────────────────────────────────────────────

export function InviteNeighborPanel({ onInvite }: { onInvite: () => void }) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
        <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", width: 40, height: 40 }}>
          <div style={{ background: "#F59E0B", borderRadius: "3px" }} />
          <div style={{ background: "#3B82F6", borderRadius: "3px" }} />
          <div style={{ background: "#10B981", borderRadius: "3px" }} />
          <div style={{ background: "#F97316", borderRadius: "3px" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "0.9375rem", color: C.text, marginBottom: "0.25rem" }}>
            Invite a Neighbor
          </h3>
          <p style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, lineHeight: 1.4, marginBottom: "0.625rem" }}>
            You get $10 credit.<br />They get $10 off.
          </p>
          <button
            onClick={onInvite}
            style={{
              fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600,
              color: C.blue, background: "none", border: "none",
              cursor: "pointer", padding: 0,
            }}
          >
            Invite Now
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── My Properties panel ───────────────────────────────────────────────────────

export function MyPropertiesPanel({
  properties, loading, navigate, openAddProp, dismissals,
}: {
  properties: any[];
  loading: boolean;
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
