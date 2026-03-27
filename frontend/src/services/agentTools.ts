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
import { contractorService } from "./contractor";

export type ToolName =
  | "classify_home_issue"
  | "create_maintenance_job"
  | "create_quote_request"
  | "draft_work_order"
  | "search_contractors"
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
      // ── Classify home issue ────────────────────────────────────────────────
      // Pure reasoning step — no side effects. Returns the classification so
      // Claude can confirm with the user before taking further action.
      case "classify_home_issue": {
        const action      = String(input.action);
        const serviceType = String(input.service_type);
        const urgency     = String(input.urgency);
        const reasoning   = String(input.reasoning);
        const actionLabel =
          action === "log_job"        ? "log a completed job"
          : action === "emergency_quote" ? "open an emergency quote request"
          : "open a quote request";
        return {
          success: true,
          data: {
            action,
            serviceType,
            urgency,
            summary: `Classified as: ${actionLabel} for ${serviceType} (${urgency} urgency). ${reasoning}`,
          },
        };
      }

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

      // ── Draft work order ──────────────────────────────────────────────────
      // Pure output tool — formats a contractor-ready work order from fields
      // that Claude generated from the homeowner's natural language description.
      case "draft_work_order": {
        const serviceType        = String(input.service_type);
        const scopeOfWork        = String(input.scope_of_work);
        const materialsOrSpecs   = input.materials_or_specs ? String(input.materials_or_specs) : null;
        const accessNotes        = input.access_notes ? String(input.access_notes) : null;
        const questionsForContractor = String(input.questions_for_contractor);

        const lines: string[] = [
          `WORK ORDER — ${serviceType.toUpperCase()}`,
          "",
          "SCOPE OF WORK",
          scopeOfWork,
        ];
        if (materialsOrSpecs) {
          lines.push("", "MATERIALS / SPECIFICATIONS", materialsOrSpecs);
        }
        if (accessNotes) {
          lines.push("", "ACCESS & SCHEDULING", accessNotes);
        }
        lines.push("", "QUESTIONS TO ASK EACH CONTRACTOR", questionsForContractor);
        lines.push("", "---", "Generated by HomeFax Voice Agent");

        return {
          success: true,
          data: {
            serviceType,
            workOrder: lines.join("\n"),
            summary: `Work order drafted for ${serviceType} — ready to share with contractors`,
          },
        };
      }

      // ── Search contractors ─────────────────────────────────────────────────
      case "search_contractors": {
        const serviceType = String(input.service_type);
        const all = await contractorService.search(serviceType);
        const top3 = all
          .sort((a, b) => b.trustScore - a.trustScore)
          .slice(0, 3);

        if (top3.length === 0) {
          return {
            success: true,
            data: {
              found: 0,
              summary: `No contractors found in the directory for ${serviceType} yet. You can open a quote request and any registered contractor in that specialty will be notified.`,
            },
          };
        }

        const list = top3.map((c, i) =>
          `${i + 1}. ${c.name} — Trust Score ${c.trustScore}/100, ${c.jobsCompleted} jobs completed${c.isVerified ? " ✓ Verified" : ""}${c.serviceArea ? `, ${c.serviceArea}` : ""}`
        ).join("\n");

        return {
          success: true,
          data: {
            found: top3.length,
            contractors: top3.map(c => ({ id: c.id, name: c.name, trustScore: c.trustScore })),
            summary: `Found ${top3.length} ${serviceType} contractor${top3.length > 1 ? "s" : ""}:\n${list}`,
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
    classify_home_issue:    "analyzing issue",
    create_maintenance_job: "logging maintenance job",
    create_quote_request:   "opening quote request",
    draft_work_order:       "drafting work order",
    search_contractors:     "searching contractors",
    sign_job_verification:  "signing job verification",
    update_job_status:      "updating job status",
  };
  return labels[name] ?? name;
}
