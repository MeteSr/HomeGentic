export interface PersonAccess {
  id:          string;
  name:        string;
  initials:    string;
  email:       string;
  relation:    string;
  role:        'OWNER' | 'CO-OWNER' | 'MANAGER' | 'VIEWER';
  limit:       number | null;
  lastActive:  string;
  pending:     boolean;
  grantedNote: string;
  permissions: { label: string; granted: boolean }[];
}

export interface PendingApproval {
  id:       string;
  initials: string;
  reason:   string;
  when:     string;
  title:    string;
  body:     string;
  facts:    { label: string; value: string }[];
}

export interface AuditRow {
  when:        string;
  initials:    string;
  action:      string;
  attribution: string;
  amount:      string;
  chip:        'UNDER LIMIT' | 'PENDING' | 'READ ONLY' | 'YOU APPROVED';
}

const MOCK_PEOPLE: PersonAccess[] = [
  {
    id: 'p1', name: 'Patricia Hale', initials: 'PH', email: 'patricia.h@gmail.com',
    relation: 'You', role: 'OWNER', limit: null, lastActive: 'TODAY', pending: false,
    grantedNote: 'Ownership verified Mar 4, 2024 by deed and ID. This cannot be revoked from inside the app.',
    permissions: [{ label: 'Everything, including selling and closing the account', granted: true }],
  },
  {
    id: 'p2', name: 'Alex Whitfield', initials: 'AW', email: 'alex.whitfield@gmail.com',
    relation: 'Son', role: 'MANAGER', limit: 500, lastActive: 'AUG 24', pending: false,
    grantedNote: 'Accepted Apr 10, 2025 after an identity check. 31 actions logged since.',
    permissions: [
      { label: 'Book, log and pay for work under the limit', granted: true },
      { label: 'Request quotes and compare bids',            granted: true },
      { label: 'Upload photos and documents',                granted: true },
      { label: 'Accept a bid above the limit',               granted: false },
      { label: 'Invite other people',                        granted: false },
    ],
  },
  {
    id: 'p3', name: 'Dana Reyes', initials: 'DR', email: 'dana.reyes@outlook.com',
    relation: 'Daughter', role: 'VIEWER', limit: 0, lastActive: 'AUG 12', pending: false,
    grantedNote: 'Accepted Jun 2, 2025. Viewers never trigger an approval.',
    permissions: [
      { label: 'See the score, jobs, photos and documents', granted: true },
      { label: 'Receive the monthly summary',               granted: true },
      { label: 'Log work or hire anyone',                   granted: false },
      { label: 'Upload or delete anything',                 granted: false },
    ],
  },
  {
    id: 'p4', name: 'Marcus Hale', initials: 'MH', email: 'invite sent Aug 20, not yet claimed',
    relation: 'Spouse', role: 'CO-OWNER', limit: null, lastActive: 'PENDING', pending: true,
    grantedNote: 'Invite expires Aug 27. Co-owner requires an identity check and your confirmation on claim.',
    permissions: [
      { label: 'Everything a Manager can do, with no spend limit', granted: true },
      { label: 'Approve or decline what a Manager sends up',       granted: true },
      { label: 'Invite Viewers and Managers',                      granted: true },
      { label: 'Remove the original owner',                        granted: false },
    ],
  },
];

const MOCK_APPROVALS: PendingApproval[] = [
  {
    id: 'a1', initials: 'AW', reason: 'OVER THE $500 LIMIT', when: '2 HOURS AGO',
    title: 'Alex wants to accept a $2,340 bid for a water heater replacement',
    body: 'The 2009 unit failed its last inspection. Alex pulled three bids and picked the middle one because Middle TN Plumbing has done four verified jobs on this property.',
    facts: [
      { label: 'BID',         value: '$2,340'              },
      { label: 'CONTRACTOR',  value: 'Middle TN Plumbing'  },
      { label: 'OTHER BIDS',  value: '$2,050 · $3,180'     },
      { label: 'START',       value: 'Fri, Aug 28'         },
    ],
  },
  {
    id: 'a2', initials: 'AW', reason: 'NEW RECURRING CONTRACT', when: 'YESTERDAY',
    title: 'Alex wants to start a weekly lawn contract at $55 a visit',
    body: 'Recurring work needs your sign-off once, not weekly. Approving starts the contract; each visit after that logs on its own.',
    facts: [
      { label: 'PER VISIT',     value: '$55'              },
      { label: 'CADENCE',       value: 'Weekly, Mar–Nov'  },
      { label: 'SEASON TOTAL',  value: '~$1,980'          },
      { label: 'PRO',           value: 'Greenway Lawn Co' },
    ],
  },
];

const MOCK_AUDIT: AuditRow[] = [
  { when: 'AUG 24', initials: 'AW', action: 'Logged gutter cleaning, Bell & Sons',         attribution: 'Alex Whitfield · Manager · on behalf of Patricia Hale', amount: '$180', chip: 'UNDER LIMIT'  },
  { when: 'AUG 20', initials: 'PH', action: 'Invited Marcus Hale as Co-owner',              attribution: 'Patricia Hale · Owner',                                 amount: '—',    chip: 'PENDING'      },
  { when: 'AUG 18', initials: 'AW', action: 'Uploaded 8 photos to the crawlspace record',   attribution: 'Alex Whitfield · Manager · on behalf of Patricia Hale', amount: '—',    chip: 'UNDER LIMIT'  },
  { when: 'AUG 14', initials: 'AW', action: 'Booked HVAC filter service, Ridgeline HVAC',   attribution: 'Alex Whitfield · Manager · on behalf of Patricia Hale', amount: '$95',  chip: 'UNDER LIMIT'  },
  { when: 'AUG 12', initials: 'DR', action: 'Opened the verified property report',           attribution: 'Dana Reyes · Viewer',                                   amount: '—',    chip: 'READ ONLY'    },
  { when: 'AUG 06', initials: 'AW', action: 'Accepted a $940 bid for crawlspace sealing',    attribution: 'Alex Whitfield · Manager · approved by Patricia Hale',  amount: '$940', chip: 'YOU APPROVED' },
];

export const peopleService = {
  getPeople(): PersonAccess[] {
    if (import.meta.env.DEV && (window as any).__e2e_people) return (window as any).__e2e_people;
    return MOCK_PEOPLE;
  },
  getApprovals(): PendingApproval[] {
    if (import.meta.env.DEV && (window as any).__e2e_approvals) return (window as any).__e2e_approvals;
    return MOCK_APPROVALS;
  },
  getAuditLog(): AuditRow[] {
    if (import.meta.env.DEV && (window as any).__e2e_audit) return (window as any).__e2e_audit;
    return MOCK_AUDIT;
  },
};
