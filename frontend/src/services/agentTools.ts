/**
 * Agent tool executor.
 *
 * When Claude calls a tool via /api/agent, the proxy returns the tool call
 * to the browser. This module executes those calls against the real ICP
 * canister services using the authenticated user's identity — the server
 * never touches the user's credentials.
 */

import { jobService } from "./job";
import { quoteService } from "./quote";

export type ToolName =
  | "create_maintenance_job"
  | "create_quote_request"
  | "sign_job_verification"
  | "update_job_status";

export interface ToolCallResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export async function executeTool(
  name: ToolName,
  input: Record<string, unknown>
): Promise<ToolCallResult> {
  try {
    switch (name) {
      // ── Create maintenance job ─────────────────────────────────────────────
      case "create_maintenance_job": {
        const isDiy = Boolean(input.is_diy);
        const contractorName = isDiy
          ? undefined
          : input.contractor_name
          ? String(input.contractor_name)
          : undefined;

        const job = await jobService.create({
          propertyId:    String(input.property_id),
          serviceType:   String(input.service_type),
          description:   String(input.description),
          contractorName,
          amount:        Number(input.amount_cents),
          date:          String(input.completed_date),
          isDiy,
          permitNumber:   input.permit_number  ? String(input.permit_number)  : undefined,
          warrantyMonths: input.warranty_months ? Number(input.warranty_months) : undefined,
        });

        const who    = isDiy ? "DIY" : `by ${contractorName}`;
        const cost   = `$${(Number(input.amount_cents) / 100).toFixed(2)}`;
        const extras = [
          input.permit_number   ? `permit ${input.permit_number}` : null,
          input.warranty_months ? `${input.warranty_months}-month warranty` : null,
        ].filter(Boolean).join(", ");

        return {
          success: true,
          data: {
            jobId: job.id,
            summary: `${job.serviceType} job recorded ${who} for ${cost}${extras ? ` (${extras})` : ""}`,
          },
        };
      }

      // ── Create quote request ───────────────────────────────────────────────
      case "create_quote_request": {
        const request = await quoteService.createRequest({
          propertyId: String(input.property_id),
          serviceType: String(input.service_type),
          description: String(input.description),
          urgency: String(input.urgency).toLowerCase() as "low" | "medium" | "high" | "emergency",
        });
        return {
          success: true,
          data: {
            requestId: request.id,
            summary: `Quote request opened for ${input.service_type} — contractors can now submit bids`,
          },
        };
      }

      // ── Sign job verification ──────────────────────────────────────────────
      case "sign_job_verification": {
        const jobId = String(input.job_id);
        const job = await jobService.verifyJob(jobId);
        const summary = job.status === "verified"
          ? `Job ${jobId} is now fully verified on-chain`
          : `Homeowner signature submitted for ${jobId} — awaiting contractor co-signature`;
        return { success: true, data: { jobId, status: job.status, summary } };
      }

      // ── Update job status ──────────────────────────────────────────────────
      case "update_job_status": {
        const jobId = String(input.job_id);
        const status = String(input.status).toLowerCase() as
          | "pending"
          | "in_progress"
          | "completed"
          | "verified";
        const job = await jobService.updateJobStatus(jobId, status);
        return {
          success: true,
          data: { jobId, status: job.status, summary: `Job ${jobId} marked as ${status}` },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Tool execution failed",
    };
  }
}

/** Returns a short, user-facing label for what the agent is doing. */
export function toolActionLabel(name: ToolName): string {
  const labels: Record<ToolName, string> = {
    create_maintenance_job: "logging maintenance job",
    create_quote_request:   "opening quote request",
    sign_job_verification:  "signing job verification",
    update_job_status:      "updating job status",
  };
  return labels[name] ?? name;
}
