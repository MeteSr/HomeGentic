import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";
import { getIcpAgent }      from "./icpAgent";
import type { Urgency }     from "./quoteFormService";

export type QuoteRequestStatus = "open" | "quoted" | "accepted" | "closed";

export interface QuoteRequest {
  id:          string;
  propertyId:  string;
  serviceType: string;
  urgency:     Urgency;
  description: string;
  status:      QuoteRequestStatus;
  createdAt:   number;  // ms
}

export interface CreateQuoteInput {
  propertyId:  string;
  serviceType: string;
  urgency:     Urgency;
  description: string;
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const QUOTE_CANISTER_ID = process.env.EXPO_PUBLIC_QUOTE_CANISTER_ID ?? "";

const quoteIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
  } as Record<string, IDL.Type>);
  const UrgencyLevel = I.Variant({
    Low: I.Null, Medium: I.Null, High: I.Null, Emergency: I.Null,
  } as Record<string, IDL.Type>);
  const RequestStatus = I.Variant({
    Open: I.Null, Quoted: I.Null, Accepted: I.Null, Closed: I.Null, Cancelled: I.Null,
  } as Record<string, IDL.Type>);
  const QuoteRequest = I.Record({
    id:          I.Text,
    propertyId:  I.Text,
    homeowner:   I.Principal,
    serviceType: ServiceType,
    description: I.Text,
    urgency:     UrgencyLevel,
    status:      RequestStatus,
    createdAt:   I.Int,
    closeAt:     I.Opt(I.Int),
  });
  const Error = I.Variant({
    NotFound:     I.Null,
    Unauthorized: I.Null,
    InvalidInput: I.Text,
  } as Record<string, IDL.Type>);
  return I.Service({
    getMyQuoteRequests: I.Func([], [I.Vec(QuoteRequest)], ["query"]),
    createQuoteRequest: I.Func(
      [I.Text, ServiceType, I.Text, UrgencyLevel],
      [I.Variant({ ok: QuoteRequest, err: Error })],
      []
    ),
  });
};

// ── Converters ────────────────────────────────────────────────────────────────

const URGENCY_MAP: Record<string, Urgency> = {
  Low: "low", Medium: "medium", High: "high", Emergency: "emergency",
};
const STATUS_MAP: Record<string, QuoteRequestStatus> = {
  Open: "open", Quoted: "quoted", Accepted: "accepted", Closed: "closed", Cancelled: "closed",
};

function fromRaw(raw: any): QuoteRequest {
  return {
    id:          raw.id,
    propertyId:  raw.propertyId,
    serviceType: Object.keys(raw.serviceType)[0],
    urgency:     URGENCY_MAP[Object.keys(raw.urgency)[0]] ?? "medium",
    description: raw.description,
    status:      STATUS_MAP[Object.keys(raw.status)[0]] ?? "open",
    createdAt:   Number(raw.createdAt) / 1_000_000,
  };
}

function unwrap<T>(result: any): T {
  if ("ok" in result) return result.ok as T;
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

function getActor(agent: HttpAgent) {
  return Actor.createActor(quoteIdlFactory as any, {
    agent,
    canisterId: QUOTE_CANISTER_ID,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getMyQuoteRequests(
  _propertyId: string,
  agent?: HttpAgent,
): Promise<QuoteRequest[]> {
  const a = getActor(agent ?? getIcpAgent());
  const raw: any[] = await (a as any).getMyQuoteRequests();
  return raw.map(fromRaw);
}

export async function createQuoteRequest(
  input: CreateQuoteInput,
  agent?: HttpAgent,
): Promise<QuoteRequest> {
  const a = getActor(agent ?? getIcpAgent());
  // Canister urgency variant key is capitalised: "Low", "Medium", "High", "Emergency"
  const urgencyKey = input.urgency.charAt(0).toUpperCase() + input.urgency.slice(1);
  const result = await (a as any).createQuoteRequest(
    input.propertyId,
    { [input.serviceType]: null },
    input.description,
    { [urgencyKey]: null },
  );
  return fromRaw(unwrap(result));
}
