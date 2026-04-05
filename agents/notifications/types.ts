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

export interface NotificationEvent {
  type:      "new_lead" | "job_signed" | "score_change" | "bid_accepted";
  principal: string;
  payload:   PushPayload;
}
