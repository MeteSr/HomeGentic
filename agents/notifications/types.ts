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
  | "bid_accepted"
  | "bid_declined"
  | "new_lead";

export interface NotificationEvent {
  type:      NotificationKind;
  principal: string;
  payload:   PushPayload;
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
