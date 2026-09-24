import React, { useEffect, useState } from "react";
import { Copy, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "@/components/Layout";
import { UpgradeGate } from "@/components/UpgradeGate";
import { usePropertyStore } from "@/store/propertyStore";
import { paymentService, type PlanTier } from "@/services/payment";
import { type Property } from "@/services/property";
import {
  peopleService,
  type PersonAccess,
  type PersonRole,
  type PendingApproval,
  type AuditRow,
} from "@/services/people";
import { Panel, Pill, hudInputStyle, type PillTone } from "@/components/hud";

const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const ROLE_TONE: Record<PersonRole, PillTone> = {
  'OWNER':    'warn',
  'CO-OWNER': 'info',
  'MANAGER':  'good',
  'VIEWER':   'neutral',
};

const ROLE_COPY: Record<PersonRole, string> = {
  'OWNER':    'Full control, including selling and closing the account. Cannot be revoked from inside the app.',
  'CO-OWNER': 'Full authority with no spend ceiling. Can approve what a Manager sends up and invite new Viewers and Managers — but cannot remove the original owner.',
  'MANAGER':  'Can book and pay for work, pull quotes, and upload photos and documents, all under their spend limit. Anything above the limit comes to you for approval first.',
  'VIEWER':   'Read-only — can see the score, jobs, photos and documents, and receive the monthly summary. Cannot log work, hire anyone, or upload or delete anything.',
};

function avatarBg(role: PersonRole, pending: boolean): string {
  if (pending) return "var(--hg-fill)";
  if (role === 'OWNER') return "var(--hg-ink)";
  if (role === 'CO-OWNER' || role === 'MANAGER') return "var(--hg-blue-fill)";
  return "var(--hg-fill)";
}

function avatarColor(role: PersonRole, pending: boolean): string {
  if (pending) return "var(--hg-muted)";
  if (role === 'OWNER') return "var(--hg-bg)";
  if (role === 'CO-OWNER' || role === 'MANAGER') return "var(--hg-blue-ink)";
  return "var(--hg-muted)";
}

function relativeTime(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 30) return `${days} DAYS AGO`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function RoleBadge({ role }: { role: PersonRole }) {
  return <Pill tone={ROLE_TONE[role]}>{role}</Pill>;
}

function Avatar({ initials, bg, color, size = 32 }: { initials: string; bg: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: MONO, fontSize: size === 32 ? '0.65rem' : '0.7rem', fontWeight: 700,
      flexShrink: 0, letterSpacing: '0.04em',
    }}>
      {initials}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  fontFamily: BODY, fontSize: '0.8rem', fontWeight: 600, color: "var(--hg-blue-ink)", background: "var(--hg-surface)",
  border: "1px solid var(--hg-line-2)", borderRadius: 100, padding: '7px 14px', cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  fontFamily: BODY, fontSize: '0.8rem', fontWeight: 600, color: "var(--hg-bad)", background: "var(--hg-surface)",
  border: "1px solid rgba(255,92,57,0.4)", borderRadius: 100, padding: '7px 14px', cursor: 'pointer',
};

// ─── People screen ────────────────────────────────────────────────────────────

const SPEND_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Ask me first', value: 0 },
  { label: '$250',   value: 25000 },
  { label: '$500',   value: 50000 },
  { label: '$1,000', value: 100000 },
  { label: 'No limit', value: null },
];

function EditPersonForm({ person, onSave, onCancel }: { person: PersonAccess; onSave: (role: PersonRole, limitCents: number | null) => void; onCancel: () => void }) {
  const [role, setRole] = useState<PersonRole>(person.role);
  const [limit, setLimit] = useState<number | null>(person.spendLimitCents);
  const isManager = role === 'MANAGER';

  return (
    <Panel style={{ background: "var(--hg-fill)", border: "1px solid var(--hg-line-2)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['VIEWER', 'MANAGER', 'CO-OWNER'] as PersonRole[]).map((r) => (
          <button key={r} onClick={() => setRole(r)} style={{
            fontFamily: BODY, fontSize: '0.78rem', fontWeight: 600,
            color: role === r ? "var(--hg-chip-on)" : "var(--hg-ink)", background: role === r ? "var(--hg-blue)" : "var(--hg-surface)",
            border: `1px solid ${role === r ? "var(--hg-blue)" : "var(--hg-line-2)"}`, borderRadius: 100, padding: '5px 12px', cursor: 'pointer',
          }}>
            {r === 'CO-OWNER' ? 'Co-owner' : r.charAt(0) + r.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {isManager && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {SPEND_OPTIONS.map(({ label, value }) => (
            <button key={label} onClick={() => setLimit(value)} style={{
              fontFamily: BODY, fontSize: '0.76rem', fontWeight: 600,
              color: limit === value ? "var(--hg-chip-on)" : "var(--hg-ink)", background: limit === value ? "var(--hg-blue)" : "var(--hg-surface)",
              border: `1px solid ${limit === value ? "var(--hg-blue)" : "var(--hg-line-2)"}`, borderRadius: 100, padding: '5px 11px', cursor: 'pointer',
            }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(role, isManager ? limit : null)} style={{ ...btnGhost, color: "var(--hg-chip-on)", background: "var(--hg-blue)", border: 'none' }}>
          Save
        </button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </Panel>
  );
}

function PeopleScreen({ propertyId, property, onInvite }: { propertyId: string; property: Property; onInvite: () => void }) {
  const [people, setPeople] = useState<PersonAccess[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = () => {
    peopleService.getPeople(propertyId)
      .then(setPeople)
      .catch((e) => { toast.error(e.message || 'Failed to load people'); setPeople([]); });
  };
  useEffect(load, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (people === null) {
    return <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-muted)" }}>Loading…</p>;
  }

  const rows: PersonAccess[] = [peopleService.ownerRow(property), ...people];

  const revoke = async (person: PersonAccess) => {
    try {
      if (person.isPending && person.inviteToken) {
        await peopleService.cancelInvite(propertyId, person.inviteToken);
        toast.success('Invite cancelled');
      } else {
        await peopleService.revoke(propertyId, person.id);
        toast.success('Access revoked');
      }
      setOpenId(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to revoke access');
    }
  };

  const save = async (person: PersonAccess, role: PersonRole, limitCents: number | null) => {
    try {
      await peopleService.updatePerson(propertyId, person.id, role, limitCents);
      toast.success('Updated');
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    }
  };

  return (
    <div>
      <p style={{ fontFamily: BODY, fontSize: '0.95rem', color: "var(--hg-ink)", fontWeight: 600, margin: '0 0 4px' }}>
        {rows.length} {rows.length === 1 ? 'person can' : 'people can'} see this property
      </p>
      <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-muted)", margin: '0 0 24px', lineHeight: 1.6, maxWidth: 520 }}>
        Access is granted per property, not per account. Everything a Manager or Co-owner does is signed with their name and shows on the record beside yours.
      </p>

      <Panel style={{ overflow: 'hidden' }}>
        {rows.map((person) => {
          const isOpen = openId === person.id;
          const isEditing = editing === person.id;
          const aBg = avatarBg(person.role, person.isPending);
          const aColor = avatarColor(person.role, person.isPending);

          return (
            <div key={person.id} style={{ borderBottom: "1px solid var(--hg-line)" }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                <Avatar initials={person.initials} bg={aBg} color={aColor} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: BODY, fontSize: '0.9rem', fontWeight: 700, color: "var(--hg-ink)" }}>
                      {person.name}
                    </span>
                    <RoleBadge role={person.role} />
                    {person.isPending && (
                      <span style={{ fontFamily: MONO, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: "var(--hg-muted)", background: "var(--hg-fill)", border: "1px solid var(--hg-line-2)", borderRadius: 4, padding: '2px 7px' }}>
                        PENDING
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: '0.78rem', color: "var(--hg-muted)", marginTop: 2 }}>
                    {person.role === 'MANAGER' && person.spendLimitCents !== null && `Up to ${money(person.spendLimitCents)} per action`}
                    {person.role === 'MANAGER' && person.spendLimitCents === null && 'No spend limit'}
                    {person.role !== 'MANAGER' && (person.isPending ? 'Invited ' : 'Added ') + relativeTime(person.addedAt).toLowerCase()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: "var(--hg-muted)", letterSpacing: '0.05em' }}>
                    {person.isPending ? 'PENDING' : relativeTime(person.addedAt)}
                  </span>
                  <button onClick={() => { setOpenId(isOpen ? null : person.id); setEditing(null); }} style={{
                    fontFamily: BODY, fontSize: '0.78rem', fontWeight: 600, color: "var(--hg-blue-ink)", background: "var(--hg-blue-wash)",
                    border: "1px solid var(--hg-line-2)", borderRadius: 100, padding: '5px 12px', cursor: 'pointer',
                  }}>
                    {isOpen ? 'Close' : 'Manage'}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div style={{ background: "var(--hg-fill)", borderTop: "1px solid var(--hg-line)", padding: '16px 20px 20px 60px' }}>
                  <p style={{ fontFamily: BODY, fontSize: '0.82rem', color: "var(--hg-muted)", margin: '0 0 14px', lineHeight: 1.6 }}>
                    {ROLE_COPY[person.role]}
                  </p>

                  {person.role === 'OWNER' ? (
                    <p style={{ fontFamily: MONO, fontSize: '0.72rem', color: "var(--hg-muted)", letterSpacing: '0.04em', margin: 0 }}>
                      NO LIMIT — OWNERSHIP CANNOT BE REVOKED FROM INSIDE THE APP
                    </p>
                  ) : isEditing ? (
                    <EditPersonForm
                      person={person}
                      onSave={(role, limit) => save(person, role, limit)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!person.isPending && (
                        <button onClick={() => setEditing(person.id)} style={btnGhost}>Change role</button>
                      )}
                      <button onClick={() => revoke(person)} style={btnDanger}>
                        {person.isPending ? 'Cancel invite' : 'Revoke access'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Panel>

      <div style={{ marginTop: 20 }}>
        <button onClick={onInvite} style={{
          fontFamily: BODY, fontSize: '0.875rem', fontWeight: 700, color: "var(--hg-chip-on)", background: "var(--hg-blue)",
          border: 'none', borderRadius: 100, padding: '10px 22px', cursor: 'pointer',
        }}>
          + Invite someone
        </button>
      </div>
    </div>
  );
}

// ─── Invite screen ────────────────────────────────────────────────────────────

const ROLE_CARDS: { role: PersonRole; headline: string; body: string }[] = [
  { role: 'VIEWER',   headline: 'Viewer',   body: 'Sees everything, touches nothing.' },
  { role: 'MANAGER',  headline: 'Manager',  body: 'Does the work under a ceiling you set.' },
  { role: 'CO-OWNER', headline: 'Co-owner', body: 'A second set of hands with no ceiling.' },
];

function previewContent(role: PersonRole, limit: number | null) {
  if (role === 'VIEWER') {
    return {
      title: 'What your Viewer will see',
      body: `They'll get read-only access — the health score, all job records, photos, and documents. They cannot log work, upload anything, or approve spending.`,
    };
  }
  if (role === 'CO-OWNER') {
    return {
      title: 'What your Co-owner can do',
      body: `Full authority with no spend ceiling. They can approve anything a Manager sends up, invite new Viewers and Managers, and act on the property just as you would — except removing the original owner.`,
    };
  }
  const limitLabel = limit === null ? 'no ceiling' : limit === 0 ? 'asking you first on every transaction' : `a ${money(limit)} limit`;
  return {
    title: 'What your Manager can do',
    body: `They can book and pay for work, pull quotes, upload photos and documents — all under ${limitLabel}. Anything above the limit comes to you for approval before anything is committed.`,
  };
}

function InviteScreen({ propertyId, onSent }: { propertyId: string; onSent: () => void }) {
  const [role, setRole]           = useState<PersonRole>('VIEWER');
  const [limit, setLimit]         = useState<number | null>(50000);
  const [displayName, setName]    = useState('');
  const [sending, setSending]     = useState(false);
  const [link, setLink]           = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);

  const preview = previewContent(role, limit);
  const isManager = role === 'MANAGER';

  const send = async () => {
    if (!displayName.trim()) return;
    setSending(true);
    try {
      const invite = await peopleService.invite(propertyId, role, displayName.trim(), isManager ? limit : null);
      setLink(`${window.location.origin}/manage/claim/${invite.token}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create invite');
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {link ? (
        <Panel style={{ background: "var(--hg-good-wash)", border: "1px solid var(--hg-good-edge)", borderRadius: 10, padding: '24px 28px' }}>
          <p style={{ fontFamily: BODY, fontSize: '1.05rem', fontWeight: 700, color: "var(--hg-good)", margin: '0 0 8px', textAlign: 'center' }}>
            Invite link ready
          </p>
          <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-good)", margin: '0 0 16px', textAlign: 'center' }}>
            Share this link with {displayName || 'them'} — it can only be claimed by a verified identity, and expires in 90 days.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: "var(--hg-surface)", border: "1px solid var(--hg-good-edge)", borderRadius: 8, padding: '8px 10px' }}>
            <span style={{ flex: 1, fontFamily: MONO, fontSize: '0.78rem', color: "var(--hg-ink)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {link}
            </span>
            <button onClick={copyLink} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: BODY, fontSize: '0.78rem', fontWeight: 600, color: copied ? "var(--hg-good)" : "var(--hg-blue-ink)",
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
            }}>
              {copied ? <CheckCircle size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => { setLink(null); setName(''); setRole('VIEWER'); setLimit(50000); onSent(); }}
            style={{ marginTop: 16, fontFamily: BODY, fontSize: '0.82rem', fontWeight: 600, color: "var(--hg-blue-ink)", background: "var(--hg-surface)", border: "1px solid var(--hg-line-2)", borderRadius: 100, padding: '7px 16px', cursor: 'pointer' }}
          >
            Done
          </button>
        </Panel>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 700, color: "var(--hg-muted)", letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Role
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {ROLE_CARDS.map(({ role: r, headline, body }) => {
                const active = role === r;
                return (
                  <button key={r} onClick={() => setRole(r)} style={{
                    flex: 1, textAlign: 'left', cursor: 'pointer',
                    background: active ? "var(--hg-blue-wash)" : "var(--hg-surface)",
                    border: `1.5px solid ${active ? "var(--hg-blue)" : "var(--hg-line-2)"}`, borderRadius: 8, padding: '14px 14px',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ fontFamily: BODY, fontSize: '0.9rem', fontWeight: 700, color: active ? "var(--hg-blue-ink)" : "var(--hg-ink)", marginBottom: 4 }}>
                      {headline}
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: '0.78rem', color: "var(--hg-muted)", lineHeight: 1.5 }}>
                      {body}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 700, color: "var(--hg-muted)", letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Spend limit
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SPEND_OPTIONS.map(({ label, value }) => {
                const active = isManager && limit === value;
                const disabled = !isManager;
                return (
                  <button key={label} onClick={() => { if (isManager) setLimit(value); }} disabled={disabled} style={{
                    fontFamily: BODY, fontSize: '0.85rem', fontWeight: 600,
                    color: disabled ? "var(--hg-muted)" : active ? "var(--hg-chip-on)" : "var(--hg-ink)",
                    background: disabled ? "var(--hg-fill)" : active ? "var(--hg-blue)" : "var(--hg-surface)",
                    border: `1px solid ${disabled ? "var(--hg-line)" : active ? "var(--hg-blue)" : "var(--hg-line-2)"}`,
                    borderRadius: 100, padding: '7px 16px', cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="invite-name" style={{ display: 'block', fontFamily: MONO, fontSize: '0.68rem', fontWeight: 700, color: "var(--hg-muted)", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Display name
            </label>
            <input
              id="invite-name" type="text" value={displayName} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah - daughter"
              style={{ ...hudInputStyle, width: '100%', boxSizing: 'border-box', padding: '10px 14px' }}
            />
          </div>

          <Panel style={{ background: "var(--hg-fill)", border: "1px solid var(--hg-line-2)", borderRadius: 10, padding: '20px 22px' }}>
            <p style={{ fontFamily: BODY, fontSize: '0.9rem', fontWeight: 700, color: "var(--hg-ink)", margin: '0 0 6px' }}>{preview.title}</p>
            <p style={{ fontFamily: BODY, fontSize: '0.82rem', color: "var(--hg-muted)", lineHeight: 1.6, margin: '0 0 18px' }}>{preview.body}</p>
            <button onClick={send} disabled={!displayName.trim() || sending} style={{
              width: '100%', fontFamily: BODY, fontSize: '0.9rem', fontWeight: 700, color: "var(--hg-chip-on)", background: "var(--hg-blue)",
              border: 'none', borderRadius: 100, padding: '12px', cursor: displayName.trim() ? 'pointer' : 'not-allowed',
              opacity: displayName.trim() && !sending ? 1 : 0.55,
            }}>
              {sending ? 'Generating…' : 'Generate invite link'}
            </button>
            <p style={{ fontFamily: BODY, fontSize: '0.73rem', color: "var(--hg-muted)", textAlign: 'center', margin: '10px 0 0' }}>
              The link expires in 90 days and can only be claimed by a verified identity.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

// ─── Activity screen ──────────────────────────────────────────────────────────

function ApprovalCard({ approval, onRespond }: { approval: PendingApproval; onRespond: (approve: boolean) => void }) {
  const [responded, setResponded] = useState<'approved' | 'declined' | null>(null);

  const respond = (approve: boolean) => {
    setResponded(approve ? 'approved' : 'declined');
    onRespond(approve);
  };

  return (
    <Panel style={{ overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: "1px solid var(--hg-line)", background: "var(--hg-fill)" }}>
        <span style={{ fontFamily: BODY, fontSize: '0.85rem', fontWeight: 700, color: "var(--hg-ink)" }}>{approval.requesterName}</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '0.68rem', color: "var(--hg-muted)", letterSpacing: '0.04em' }}>
          {relativeTime(approval.createdAt)}
        </span>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <p style={{ fontFamily: BODY, fontSize: '0.95rem', fontWeight: 700, color: "var(--hg-ink)", margin: '0 0 8px', lineHeight: 1.4 }}>
          {approval.description}
        </p>
        <p style={{ fontFamily: MONO, fontSize: '1.1rem', fontWeight: 700, color: "var(--hg-ink)", margin: '0 0 16px' }}>
          {money(approval.amountCents)}
        </p>
        {!responded ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => respond(true)} style={{
              fontFamily: BODY, fontSize: '0.85rem', fontWeight: 700, color: "var(--hg-chip-on)", background: "var(--hg-blue)",
              border: 'none', borderRadius: 100, padding: '9px 20px', cursor: 'pointer',
            }}>
              Approve
            </button>
            <button onClick={() => respond(false)} style={{
              fontFamily: BODY, fontSize: '0.85rem', fontWeight: 600, color: "var(--hg-muted)", background: "var(--hg-fill)",
              border: "1px solid var(--hg-line-2)", borderRadius: 100, padding: '9px 20px', cursor: 'pointer',
            }}>
              Decline
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: responded === 'approved' ? "var(--hg-good-wash)" : "rgba(255,92,57,0.08)",
            border: `1px solid ${responded === 'approved' ? "var(--hg-good-edge)" : "rgba(255,92,57,0.4)"}`, borderRadius: 7, padding: '10px 16px',
          }}>
            <span style={{ fontFamily: BODY, fontSize: '0.875rem', fontWeight: 700, color: responded === 'approved' ? "var(--hg-good)" : "var(--hg-bad)" }}>
              {responded === 'approved' ? `✓ Approved — ${approval.requesterName} will be notified.` : `✗ Declined — ${approval.requesterName} has been notified.`}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ActivityScreen({ propertyId, approvalsHint }: { propertyId: string; approvalsHint: PendingApproval[] | null }) {
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(approvalsHint);
  const [audit, setAudit]         = useState<AuditRow[] | null>(null);

  const load = () => {
    peopleService.getApprovals(propertyId).then(setApprovals).catch(() => setApprovals([]));
    peopleService.getAuditLog(propertyId).then(setAudit).catch(() => setAudit([]));
  };
  useEffect(load, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = async (approvalId: number, approve: boolean) => {
    try {
      await peopleService.respondToApproval(propertyId, approvalId, approve);
    } catch (e: any) {
      toast.error(e.message || 'Failed to respond');
    }
  };

  return (
    <div>
      {approvals && approvals.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 700, color: "var(--hg-muted)", letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>
            APPROVALS · {approvals.length} PENDING
          </p>
          {approvals.map((a) => <ApprovalCard key={a.id} approval={a} onRespond={(approve) => respond(a.id, approve)} />)}
        </div>
      )}

      <div>
        <p style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 700, color: "var(--hg-muted)", letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>
          ACTIVITY LOG
        </p>
        {audit === null ? (
          <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-muted)" }}>Loading…</p>
        ) : audit.length === 0 ? (
          <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-muted)" }}>No activity yet — actions a Manager or Co-owner takes will show up here.</p>
        ) : (
          <Panel style={{ overflow: 'hidden' }}>
            {audit.map((row, i) => (
              <div key={row.id} style={{
                display: 'grid', gridTemplateColumns: '80px 36px 1fr', gap: '0 12px', alignItems: 'center',
                padding: '12px 16px', borderBottom: i < audit.length - 1 ? "1px solid var(--hg-line)" : 'none',
              }}>
                <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: "var(--hg-muted)", letterSpacing: '0.04em' }}>
                  {relativeTime(row.when)}
                </span>
                <Avatar initials={row.managerName.slice(0, 2).toUpperCase()} bg="var(--hg-blue-fill)" color="var(--hg-blue-ink)" size={28} />
                <div>
                  <div style={{ fontFamily: BODY, fontSize: '0.83rem', color: "var(--hg-ink)", fontWeight: 500 }}>{row.description}</div>
                  <div style={{ fontFamily: BODY, fontSize: '0.74rem', color: "var(--hg-muted)", marginTop: 1 }}>{row.managerName}</div>
                </div>
              </div>
            ))}
          </Panel>
        )}
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
  const { properties } = usePropertyStore();
  const property = properties[0];
  const propertyId = property ? String(property.id) : "";

  const [screen, setScreen] = useState<Screen>('people');
  const [userTier, setUserTier] = useState<PlanTier>("Free");
  const [tierLoading, setTierLoading] = useState(true);
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    paymentService.getMySubscription()
      .then((s) => setUserTier(s.tier))
      .catch((e) => console.error("[PeoplePage] subscription load failed:", e))
      .finally(() => setTierLoading(false));
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    peopleService.getApprovals(propertyId).then((a) => setApprovalCount(a.length)).catch(() => {});
  }, [propertyId, screen]);

  const allowed = userTier === "Pro" || userTier === "Premium";

  return (
    <Layout>
      <div className="hg-v3" data-theme="dark" style={{ background: "var(--hg-bg)", minHeight: '100dvh', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontFamily: DISPLAY, fontSize: '1.6rem', fontWeight: 700, color: "var(--hg-ink)", margin: 0 }}>
            People
          </h1>
          {allowed && (
            <button onClick={() => setScreen('invite')} style={{
              fontFamily: BODY, fontSize: '0.875rem', fontWeight: 700, color: "var(--hg-chip-on)", background: "var(--hg-blue)",
              border: 'none', borderRadius: 100, padding: '9px 20px', cursor: 'pointer',
            }}>
              + Invite someone
            </button>
          )}
        </div>

        {tierLoading ? (
          <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-muted)" }}>Loading…</p>
        ) : !allowed ? (
          <UpgradeGate
            feature="Shared property access"
            description="Invite family, a caretaker, or a co-owner to help manage this property — with role-based permissions, spend limits, and a full activity log."
            tier="Pro"
          />
        ) : !property ? (
          <p style={{ fontFamily: BODY, fontSize: '0.85rem', color: "var(--hg-muted)" }}>Add a property to invite people to it.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
              {TABS.map(({ key, label }) => {
                const active = screen === key;
                return (
                  <button key={key} onClick={() => setScreen(key)} style={{
                    fontFamily: BODY, fontSize: '0.85rem', fontWeight: 600,
                    color: active ? "var(--hg-chip-on)" : "var(--hg-ink)", background: active ? "var(--hg-blue)" : "var(--hg-surface)",
                    border: `1px solid ${active ? "var(--hg-blue)" : "var(--hg-line-2)"}`, borderRadius: 100, padding: '7px 16px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {label}
                    {key === 'activity' && approvalCount > 0 && (
                      <span style={{
                        fontFamily: MONO, fontSize: '0.65rem', fontWeight: 700,
                        background: active ? 'rgba(255,255,255,0.25)' : "var(--hg-blue)", color: "var(--hg-chip-on)",
                        borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                      }}>
                        {approvalCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {screen === 'people'   && <PeopleScreen propertyId={propertyId} property={property} onInvite={() => setScreen('invite')} />}
            {screen === 'invite'   && <InviteScreen propertyId={propertyId} onSent={() => setScreen('people')} />}
            {screen === 'activity' && <ActivityScreen propertyId={propertyId} approvalsHint={null} />}
          </>
        )}
      </div>
    </Layout>
  );
}
