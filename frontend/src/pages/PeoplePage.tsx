import React, { useState } from "react";
import { Layout } from "@/components/Layout";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { peopleService, type PersonAccess, type PendingApproval, type AuditRow } from "@/services/people";

const C = V2_COLORS;
const F = V2_FONTS;

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'OWNER':    { bg: '#FFF6DB', color: '#7C5500',  border: '#F2DFA8' },
  'CO-OWNER': { bg: '#E0E2FF', color: '#2B34FF',  border: '#B9BDF5' },
  'MANAGER':  { bg: '#E4F5EC', color: '#166634',  border: '#BFE3CE' },
  'VIEWER':   { bg: '#F0F1F5', color: '#464B56',  border: '#DDDFE6' },
};

function avatarBg(role: PersonAccess['role'], pending: boolean): string {
  if (pending) return '#F0F1F5';
  if (role === 'OWNER') return C.ink;
  if (role === 'CO-OWNER' || role === 'MANAGER') return C.vbadge;
  return '#F0F1F5';
}

function avatarColor(role: PersonAccess['role'], pending: boolean): string {
  if (pending) return C.muted;
  if (role === 'OWNER') return '#FCFCFD';
  if (role === 'CO-OWNER' || role === 'MANAGER') return C.blue;
  return '#464B56';
}

function RoleBadge({ role }: { role: PersonAccess['role'] }) {
  const s = ROLE_STYLE[role];
  return (
    <span style={{
      fontFamily: F.mono,
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: 4,
      padding: '2px 7px',
      lineHeight: 1,
    }}>
      {role}
    </span>
  );
}

function ChipBadge({ chip }: { chip: AuditRow['chip'] }) {
  let bg = '#F0F1F5', color = '#464B56', border = '#DDDFE6';
  if (chip === 'PENDING')      { bg = '#FFF6DB'; color = '#7C5500'; border = '#F2DFA8'; }
  if (chip === 'YOU APPROVED') { bg = '#E4F5EC'; color = '#166634'; border = '#BFE3CE'; }
  return (
    <span style={{
      fontFamily: F.mono,
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      background: bg,
      color,
      border: `1px solid ${border}`,
      borderRadius: 4,
      padding: '2px 7px',
      whiteSpace: 'nowrap',
    }}>
      {chip}
    </span>
  );
}

function Avatar({ initials, bg, color, size = 32 }: { initials: string; bg: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: F.mono,
      fontSize: size === 32 ? '0.65rem' : '0.7rem',
      fontWeight: 700,
      flexShrink: 0,
      letterSpacing: '0.04em',
    }}>
      {initials}
    </div>
  );
}

// ─── People screen ────────────────────────────────────────────────────────────

function PeopleScreen({ onInvite }: { onInvite: () => void }) {
  const people = peopleService.getPeople();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <p style={{ fontFamily: F.body, fontSize: '0.95rem', color: C.ink, fontWeight: 600, margin: '0 0 4px' }}>
        {people.length} people can see this property
      </p>
      <p style={{ fontFamily: F.body, fontSize: '0.85rem', color: C.muted, margin: '0 0 24px', lineHeight: 1.6, maxWidth: 520 }}>
        Access is granted per property, not per account. Everything a Manager or Co-owner does is signed with their name and shows on the record beside yours.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: C.paper }}>
        {people.map((person) => {
          const isOpen = openId === person.id;
          const aBg = avatarBg(person.role, person.pending);
          const aColor = avatarColor(person.role, person.pending);

          return (
            <div key={person.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                <Avatar initials={person.initials} bg={aBg} color={aColor} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: F.body, fontSize: '0.9rem', fontWeight: 700, color: C.ink }}>
                      {person.name}
                    </span>
                    <RoleBadge role={person.role} />
                  </div>
                  <div style={{ fontFamily: F.body, fontSize: '0.78rem', color: C.muted, marginTop: 2 }}>
                    {person.relation !== 'You' && <span>{person.relation} · </span>}
                    <span>{person.email}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{ fontFamily: F.mono, fontSize: '0.7rem', color: C.muted, letterSpacing: '0.05em' }}>
                    {person.lastActive}
                  </span>
                  <button
                    onClick={() => setOpenId(isOpen ? null : person.id)}
                    style={{
                      fontFamily: F.body,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: C.blue,
                      background: C.lblue,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: '5px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    {isOpen ? 'Close' : 'Manage'}
                  </button>
                </div>
              </div>

              {/* Expanded section */}
              {isOpen && (
                <div style={{ background: '#F9F9FC', borderTop: `1px solid ${C.border}`, padding: '16px 20px 20px 60px' }}>
                  <p style={{ fontFamily: F.body, fontSize: '0.82rem', color: C.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
                    {person.grantedNote}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {person.permissions.map((perm, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{
                          fontFamily: F.mono,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: perm.granted ? '#166634' : '#9CA3AF',
                          marginTop: 1,
                          flexShrink: 0,
                        }}>
                          {perm.granted ? '✓' : '✗'}
                        </span>
                        <span style={{
                          fontFamily: F.body,
                          fontSize: '0.82rem',
                          color: perm.granted ? C.ink : C.muted,
                          lineHeight: 1.5,
                        }}>
                          {perm.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {person.role === 'OWNER' ? (
                    <p style={{ fontFamily: F.mono, fontSize: '0.72rem', color: C.muted, letterSpacing: '0.04em', margin: 0 }}>
                      NO LIMIT — OWNERSHIP CANNOT BE REVOKED FROM INSIDE THE APP
                    </p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{
                        fontFamily: F.body, fontSize: '0.8rem', fontWeight: 600,
                        color: C.blue, background: 'white',
                        border: `1px solid ${C.border}`, borderRadius: 6,
                        padding: '7px 14px', cursor: 'pointer',
                      }}>
                        Change role
                      </button>
                      <button style={{
                        fontFamily: F.body, fontSize: '0.8rem', fontWeight: 600,
                        color: '#B91C1C', background: 'white',
                        border: '1px solid #FECACA', borderRadius: 6,
                        padding: '7px 14px', cursor: 'pointer',
                      }}>
                        {person.pending ? 'Cancel invite' : 'Revoke access'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={onInvite}
          style={{
            fontFamily: F.body, fontSize: '0.875rem', fontWeight: 700,
            color: 'white', background: C.blue,
            border: 'none', borderRadius: 8,
            padding: '10px 22px', cursor: 'pointer',
          }}
        >
          + Invite someone
        </button>
      </div>
    </div>
  );
}

// ─── Invite screen ────────────────────────────────────────────────────────────

const RELATIONS = ['Adult child', 'Spouse', 'Tenant', 'Realtor', 'Caretaker'] as const;
type RelationType = typeof RELATIONS[number];

type RoleType = 'VIEWER' | 'MANAGER' | 'CO-OWNER';

const ROLE_CARDS: { role: RoleType; headline: string; body: string }[] = [
  { role: 'VIEWER',   headline: 'Viewer',   body: 'Sees everything, touches nothing.' },
  { role: 'MANAGER',  headline: 'Manager',  body: 'Does the work under a ceiling you set.' },
  { role: 'CO-OWNER', headline: 'Co-owner', body: 'A second set of hands with no ceiling.' },
];

const LIMIT_OPTIONS: { label: string; value: number | null | 0 }[] = [
  { label: 'Ask me first', value: 0 },
  { label: '$250',         value: 250 },
  { label: '$500',         value: 500 },
  { label: '$1,000',       value: 1000 },
  { label: 'No limit',     value: null },
];

function previewContent(role: RoleType, relation: RelationType | null, limit: number | null | 0) {
  if (role === 'VIEWER') {
    return {
      title: 'What your Viewer will see',
      body: `They'll get read-only access — the health score, all job records, photos, and documents. They can receive the monthly summary email. They cannot log work, upload anything, or approve spending.`,
    };
  }
  if (role === 'CO-OWNER') {
    return {
      title: 'What your Co-owner can do',
      body: `Full authority with no spend ceiling. They can approve anything a Manager sends up, invite new Viewers and Managers, and act on the property just as you would — except removing the original owner.`,
    };
  }
  const limitLabel = limit === null ? 'no ceiling' : limit === 0 ? 'asking you first on every transaction' : `a $${limit.toLocaleString()} limit`;
  return {
    title: 'What your Manager can do',
    body: `They can book and pay for work, pull quotes, upload photos and documents — all under ${limitLabel}. Anything above the limit comes to you for approval before anything is committed.`,
  };
}

function InviteScreen() {
  const [relation, setRelation] = useState<RelationType | null>(null);
  const [role, setRole]         = useState<RoleType>('VIEWER');
  const [limit, setLimit]       = useState<number | null | 0>(500);
  const [email, setEmail]       = useState('');
  const [sent, setSent]         = useState(false);

  const preview = previewContent(role, relation, limit);
  const managerSelected = role === 'MANAGER';

  return (
    <div style={{ maxWidth: 600 }}>
      {sent ? (
        <div style={{ background: '#E4F5EC', border: '1px solid #BFE3CE', borderRadius: 10, padding: '24px 28px', textAlign: 'center' }}>
          <p style={{ fontFamily: F.body, fontSize: '1.05rem', fontWeight: 700, color: '#166634', margin: '0 0 8px' }}>
            Invite sent
          </p>
          <p style={{ fontFamily: F.body, fontSize: '0.85rem', color: '#166634', margin: 0 }}>
            The link expires in 7 days and can only be claimed by a verified identity.
          </p>
          <button
            onClick={() => { setSent(false); setEmail(''); setRelation(null); setRole('VIEWER'); setLimit(500); }}
            style={{ marginTop: 16, fontFamily: F.body, fontSize: '0.82rem', fontWeight: 600, color: C.blue, background: 'white', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 16px', cursor: 'pointer' }}
          >
            Invite another person
          </button>
        </div>
      ) : (
        <>
          {/* Section 1: Relationship */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: F.mono, fontSize: '0.68rem', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Relationship
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RELATIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRelation(r)}
                  style={{
                    fontFamily: F.body, fontSize: '0.85rem', fontWeight: 600,
                    color: relation === r ? 'white' : C.ink,
                    background: relation === r ? C.blue : 'white',
                    border: `1px solid ${relation === r ? C.blue : C.border}`,
                    borderRadius: 20, padding: '7px 16px', cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Role cards */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: F.mono, fontSize: '0.68rem', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Role
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {ROLE_CARDS.map(({ role: r, headline, body }) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      flex: 1, textAlign: 'left', cursor: 'pointer',
                      background: active ? '#F7F8FF' : 'white',
                      border: `1.5px solid ${active ? C.blue : C.border}`,
                      borderRadius: 8,
                      padding: '14px 14px',
                      boxShadow: active ? `0 0 0 3px rgba(43,52,255,0.08)` : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontFamily: F.body, fontSize: '0.9rem', fontWeight: 700, color: active ? C.blue : C.ink, marginBottom: 4 }}>
                      {headline}
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: '0.78rem', color: C.muted, lineHeight: 1.5 }}>
                      {body}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Spend limit */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: F.mono, fontSize: '0.68rem', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Spend limit
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LIMIT_OPTIONS.map(({ label, value }) => {
                const active = managerSelected && limit === value;
                const disabled = !managerSelected;
                return (
                  <button
                    key={label}
                    onClick={() => { if (managerSelected) setLimit(value); }}
                    disabled={disabled}
                    style={{
                      fontFamily: F.body, fontSize: '0.85rem', fontWeight: 600,
                      color: disabled ? '#C0C4D0' : active ? 'white' : C.ink,
                      background: disabled ? '#F5F6FA' : active ? C.ink : 'white',
                      border: `1px solid ${disabled ? '#E8E9EF' : active ? C.ink : C.border}`,
                      borderRadius: 20, padding: '7px 16px', cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {managerSelected && (
              <p style={{ fontFamily: F.body, fontSize: '0.78rem', color: C.muted, margin: '10px 0 0', lineHeight: 1.6 }}>
                {limit === 0
                  ? 'Every transaction will pause for your approval, no matter the size.'
                  : limit === null
                  ? 'The manager can approve any amount without your sign-off.'
                  : `Anything up to $${limit?.toLocaleString()} goes through without your sign-off. Bigger jobs come to you first.`}
              </p>
            )}
          </div>

          {/* Section 4: Email input */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="invite-email"
              style={{ display: 'block', fontFamily: F.mono, fontSize: '0.68rem', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}
            >
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={{
                width: '100%', boxSizing: 'border-box',
                fontFamily: F.body, fontSize: '0.9rem', color: C.ink,
                background: 'white', border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '10px 14px',
                outline: 'none',
              }}
            />
          </div>

          {/* Preview card */}
          <div style={{ background: '#F5F6FB', border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 22px' }}>
            <p style={{ fontFamily: F.body, fontSize: '0.9rem', fontWeight: 700, color: C.ink, margin: '0 0 6px' }}>
              {preview.title}
            </p>
            <p style={{ fontFamily: F.body, fontSize: '0.82rem', color: C.muted, lineHeight: 1.6, margin: '0 0 18px' }}>
              {preview.body}
            </p>
            <button
              onClick={() => { if (email.trim()) setSent(true); }}
              style={{
                width: '100%', fontFamily: F.body, fontSize: '0.9rem', fontWeight: 700,
                color: 'white', background: C.blue, border: 'none',
                borderRadius: 8, padding: '12px', cursor: email.trim() ? 'pointer' : 'not-allowed',
                opacity: email.trim() ? 1 : 0.55,
              }}
            >
              Send the invite
            </button>
            <p style={{ fontFamily: F.body, fontSize: '0.73rem', color: C.muted, textAlign: 'center', margin: '10px 0 0' }}>
              The link expires in 7 days and can only be claimed by a verified identity.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Activity screen ──────────────────────────────────────────────────────────

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const [approved, setApproved] = useState(false);
  const [declined, setDeclined] = useState(false);

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: '#F9F9FC' }}>
        <Avatar initials={approval.initials} bg={C.blue} color="white" />
        <span style={{
          fontFamily: F.mono, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#7C5500', background: '#FFF6DB',
          border: '1px solid #F2DFA8', borderRadius: 4, padding: '2px 8px',
        }}>
          {approval.reason}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.04em' }}>
          {approval.when}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px' }}>
        <p style={{ fontFamily: F.body, fontSize: '0.95rem', fontWeight: 700, color: C.ink, margin: '0 0 8px', lineHeight: 1.4 }}>
          {approval.title}
        </p>
        <p style={{ fontFamily: F.body, fontSize: '0.83rem', color: C.muted, lineHeight: 1.6, margin: '0 0 14px' }}>
          {approval.body}
        </p>

        {/* Facts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16 }}>
          {approval.facts.map((fact, i) => (
            <div key={i}>
              <div style={{ fontFamily: F.mono, fontSize: '0.62rem', fontWeight: 700, color: C.muted, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 2 }}>
                {fact.label}
              </div>
              <div style={{ fontFamily: F.body, fontSize: '0.88rem', fontWeight: 700, color: C.ink }}>
                {fact.value}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {!approved && !declined ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setApproved(true)}
              style={{
                fontFamily: F.body, fontSize: '0.85rem', fontWeight: 700,
                color: 'white', background: '#166634', border: 'none',
                borderRadius: 7, padding: '9px 20px', cursor: 'pointer',
              }}
            >
              Approve
            </button>
            <button
              onClick={() => setDeclined(true)}
              style={{
                fontFamily: F.body, fontSize: '0.85rem', fontWeight: 600,
                color: '#B91C1C', background: 'white', border: '1px solid #FECACA',
                borderRadius: 7, padding: '9px 20px', cursor: 'pointer',
              }}
            >
              Decline
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: approved ? '#E4F5EC' : '#FEF2F2',
            border: `1px solid ${approved ? '#BFE3CE' : '#FECACA'}`,
            borderRadius: 7, padding: '10px 16px',
          }}>
            <span style={{ fontFamily: F.body, fontSize: '0.875rem', fontWeight: 700, color: approved ? '#166634' : '#B91C1C' }}>
              {approved ? '✓ Approved — the contractor will be notified.' : '✗ Declined — Alex has been notified.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityScreen() {
  const approvals = peopleService.getApprovals();
  const audit     = peopleService.getAuditLog();

  return (
    <div>
      {approvals.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontFamily: F.mono, fontSize: '0.68rem', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>
            APPROVALS · {approvals.length} PENDING
          </p>
          {approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}
        </div>
      )}

      <div>
        <p style={{ fontFamily: F.mono, fontSize: '0.68rem', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>
          ACTIVITY LOG
        </p>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {audit.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '64px 36px 1fr auto auto',
                gap: '0 12px',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: i < audit.length - 1 ? `1px solid ${C.border}` : 'none',
                background: i % 2 === 0 ? C.paper : '#FAFAFA',
              }}
            >
              <span style={{ fontFamily: F.mono, fontSize: '0.68rem', color: C.muted, letterSpacing: '0.04em' }}>
                {row.when}
              </span>
              <Avatar
                initials={row.initials}
                bg={row.initials === 'AW' ? C.vbadge : row.initials === 'DR' ? '#F0F1F5' : C.ink}
                color={row.initials === 'AW' ? C.blue : row.initials === 'DR' ? '#464B56' : '#FCFCFD'}
                size={28}
              />
              <div>
                <div style={{ fontFamily: F.body, fontSize: '0.83rem', color: C.ink, fontWeight: 500 }}>
                  {row.action}
                </div>
                <div style={{ fontFamily: F.body, fontSize: '0.74rem', color: C.muted, marginTop: 1 }}>
                  {row.attribution}
                </div>
              </div>
              <span style={{ fontFamily: F.mono, fontSize: '0.8rem', color: C.ink, fontWeight: 700, textAlign: 'right' }}>
                {row.amount}
              </span>
              <ChipBadge chip={row.chip} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Screen = 'people' | 'invite' | 'activity';

const TABS: { key: Screen; label: string }[] = [
  { key: 'people',   label: 'People'           },
  { key: 'invite',   label: 'Invite someone'   },
  { key: 'activity', label: 'Approvals and log' },
];

export default function PeoplePage() {
  const [screen, setScreen] = useState<Screen>('people');
  const approvalCount = peopleService.getApprovals().length;

  return (
    <Layout>
      <div style={{ background: C.paper, minHeight: '100%', padding: '28px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontFamily: F.display, fontSize: '1.6rem', fontWeight: 700, color: C.ink, margin: 0 }}>
            People
          </h1>
          <button
            onClick={() => setScreen('invite')}
            style={{
              fontFamily: F.body, fontSize: '0.875rem', fontWeight: 700,
              color: 'white', background: C.blue, border: 'none',
              borderRadius: 8, padding: '9px 20px', cursor: 'pointer',
            }}
          >
            + Invite someone
          </button>
        </div>

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {TABS.map(({ key, label }) => {
            const active = screen === key;
            return (
              <button
                key={key}
                onClick={() => setScreen(key)}
                style={{
                  fontFamily: F.body, fontSize: '0.85rem', fontWeight: 600,
                  color: active ? 'white' : C.ink,
                  background: active ? C.ink : 'white',
                  border: `1px solid ${active ? C.ink : C.border}`,
                  borderRadius: 20, padding: '7px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {label}
                {key === 'activity' && approvalCount > 0 && (
                  <span style={{
                    fontFamily: F.mono, fontSize: '0.65rem', fontWeight: 700,
                    background: active ? 'rgba(255,255,255,0.25)' : C.blue,
                    color: 'white', borderRadius: 10, padding: '1px 6px',
                    minWidth: 18, textAlign: 'center',
                  }}>
                    {approvalCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Screen content */}
        {screen === 'people'   && <PeopleScreen onInvite={() => setScreen('invite')} />}
        {screen === 'invite'   && <InviteScreen />}
        {screen === 'activity' && <ActivityScreen />}
      </div>
    </Layout>
  );
}
