export type Platform = "ios" | "android";

export interface TokenRecord {
  token:     string;
  platform:  Platform;
  updatedAt: number;
}

export interface PushPayload {
  title:  string;
  body:   string;
  /** Deep-link route included in notification data, e.g. "jobs/abc123" */
  route?: string;
  data?:  Record<string, string>;
}

export type NotificationKind =
  | "job_awaiting_signature"
  | "job_awaiting_contractor_signature"
  | "job_verified"
  | "sensor_alert"
  | "bid_accepted"
  | "bid_declined"
  | "quote_received"
  | "new_lead"
  | "review_request"
  | "weekly_pulse";

export interface NotificationEvent {
  type:      NotificationKind;
  principal: string;
  payload:   PushPayload;
  /**
   * Whether the recipient's own opt-in allows a push. Only new leads use it
   * (the contractor profile's notifyPush); everything else is true.
   */
  pushOptIn: boolean;
  /**
   * Don't send before this time (ms). Set on new-lead alerts for contractors
   * without ContractorPro, who get them FREE_LEAD_DELAY_MS after Pro.
   */
  notBefore?: number;
}

/** One entry from a canister's push outbox (backend/shared/Notify.mo). */
export interface OutboxEvent {
  seq:       number;
  kind:      string;
  recipient: string | null;
  refId:     string;
  summary:   string;
}

export interface OutboxPage {
  events:    OutboxEvent[];
  latestSeq: number;
}

/** The fields of a quote request that new-lead matching needs. */
export interface QuoteRequestInfo {
  id:               string;
  homeowner:        string;
  serviceType:      string;
  status:           string;
  zipCode:          string | null;
  minTrustScore:    number | null;
  minJobsCompleted: number | null;
}

/** The fields of a contractor profile that new-lead matching needs. */
export interface ContractorInfo {
  principal:     string;
  specialties:   string[];
  serviceZips:   string[];
  alertZips:     string[];
  notifyPush:    boolean;
  trustScore:    number;
  jobsCompleted: number;
  isVerified:    boolean;
}

// ── Weekly Home Pulse ─────────────────────────────────────────────────────────

export interface PulseRecipient {
  principal: string;
  email:     string;
}

export interface PulseProperty {
  id:        string;
  address:   string;
  city:      string;
  state:     string;
  zipCode:   string;
  yearBuilt: number;
}

/** The job fields the weekly email reads. */
export interface PulseJob {
  id:               string;
  propertyId:       string;
  title:            string;
  serviceType:      string;   // display label, e.g. "HVAC"
  contractorName:   string | null;
  amountCents:      number;
  completedAtMs:    number;
  warrantyMonths:   number | null;
  isDiy:            boolean;
  status:           string;   // JobStatus tag
  verified:         boolean;
  homeownerSigned:  boolean;
  contractorSigned: boolean;
}
