export type PanelKey =
  | "awaiting" | "score" | "property" | "market" | "maint" | "jobs" | "pros"
  | "sensors" | "safety" | "credits" | "docs" | "rooms" | "spend" | "activity" | "billing"
  | "add" | "listing";

export interface PanelRow {
  id?:        string;
  lead:       string;
  sub:        string;
  right:      string;
  rightSub?:  string;
  tone?:      string;
  hasBar?:    boolean;
  pct?:       string;
  barColor?:  string;
  hasActions?: boolean;
  /** Navigate to another panel on tap. */
  go?:        PanelKey;
  /** Open a wizard/modal on tap. */
  flow?:      FlowKey;
  /** Arbitrary tap handler — takes priority over go/flow. */
  onTap?:     () => void;
  /** Approve/decline actions for rows with hasActions (e.g. Awaiting). */
  approve?:   () => void;
  decline?:   () => void;
}

export interface PanelData {
  chip:  string;
  count: string;
  asked: string;
  title: string;
  sub:   string;
  cta:   string;
  /** ctaFlow overrides the default CTA→flow mapping for this panel. */
  ctaFlow?: FlowKey;
  rows:  PanelRow[];
}

export type FlowKey =
  | "room" | "logJob" | "receipt" | "quote" | "recurring" | "upgrade"
  | "listing" | "bids" | "chase";
