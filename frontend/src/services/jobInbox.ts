import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/job";
import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
import { candidErrorMessage } from "./candid";
import type * as JobTypes from "@homegentic/shared/types/job";

/**
 * The homeowner's forwarding address for invoices (job canister inbox).
 *
 * Mail to h-<token>@<VITE_INBOX_DOMAIN> reaches the voice Worker's email()
 * handler, which reads the invoice and files a draft here. Drafts never
 * become jobs on their own: the homeowner reviews one in the job form or
 * dismisses it.
 *
 * E2E: window.__e2e_inbox = { domain, token, drafts } replaces the canister.
 */

const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";
const INBOX_DOMAIN: string = (import.meta as any).env?.VITE_INBOX_DOMAIN ?? "";

export interface EmailDraft {
  id:             string;
  receivedAt:     number;   // ms
  fromAddress:    string;
  subject:        string;
  title:          string;
  serviceType:    string;   // "" when the reader couldn't tell
  contractorName: string;
  amountCents:    number;
  completedDate:  string;   // YYYY-MM-DD or ""
  warrantyMonths: number;
  description:    string;
}

function e2e(): { domain?: string; token?: string; drafts?: EmailDraft[] } | null {
  return typeof window !== "undefined" ? (window as any).__e2e_inbox ?? null : null;
}

function unwrap<T>(r: any): T {
  if ("ok" in r) return r.ok as T;
  throw new Error(candidErrorMessage(r.err));
}

function fromDraft(d: JobTypes.EmailDraft): EmailDraft {
  return {
    id:             d.id,
    receivedAt:     Number(d.receivedAt) / 1_000_000,
    fromAddress:    d.fromAddress,
    subject:        d.subject,
    title:          d.title,
    serviceType:    d.serviceType,
    contractorName: d.contractorName,
    amountCents:    Number(d.amountCents),
    completedDate:  d.completedDate,
    warrantyMonths: Number(d.warrantyMonths),
    description:    d.description,
  };
}

function createJobInboxService() {
  const getActor = lazyActor<JobCanister>(idlFactory, JOB_CANISTER_ID);
  const address = (domain: string, token: string) => `h-${token}@${domain}`;

  return {
    /** Mail for the address only arrives when the inbox domain is configured. */
    domain(): string {
      return e2e()?.domain ?? INBOX_DOMAIN;
    },

    /** The caller's forwarding address (created on first call). */
    async getAddress(): Promise<string> {
      const m = e2e();
      if (m) return address(this.domain(), m.token ?? "aaaaaaaaaaaaaaaaaaaa");
      const a = await getActor();
      return address(this.domain(), unwrap<string>(await a.getMyInboxToken()));
    },

    /** A new address; mail to the old one is dropped from now on. */
    async resetAddress(): Promise<string> {
      const m = e2e();
      if (m) {
        m.token = "bbbbbbbbbbbbbbbbbbbb";
        return address(this.domain(), m.token);
      }
      const a = await getActor();
      return address(this.domain(), unwrap<string>(await a.resetMyInboxToken()));
    },

    async getDrafts(): Promise<EmailDraft[]> {
      const m = e2e();
      if (m) return m.drafts ?? [];
      if (!JOB_CANISTER_ID) return [];
      const a = await getActor();
      return ((await a.getMyEmailDrafts()) as any[]).map(fromDraft);
    },

    async dismiss(id: string): Promise<void> {
      const m = e2e();
      if (m) { m.drafts = (m.drafts ?? []).filter((d) => d.id !== id); return; }
      const a = await getActor();
      unwrap<null>(await a.dismissEmailDraft(id));
    },

    reset() { getActor.reset(); },
  };
}

export const jobInboxService = createJobInboxService();
