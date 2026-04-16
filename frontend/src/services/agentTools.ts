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
import { maintenanceService } from "./maintenance";
import { propertyService } from "./property";
import { roomService } from "./room";
import { recurringService } from "./recurringService";
import { paymentService, type PlanTier } from "./payment";

// Inline tier→property limit to avoid PLANS import breaking payment mocks in tests
const TIER_PROPERTY_LIMIT: Partial<Record<PlanTier, number>> = {
  Free: 1, Basic: 1, Pro: 5, Premium: 20,
};
import { buildMaintenanceForecast } from "./maintenanceForecast";
import { reportService, jobToInput, propertyToInput } from "./report";
import { getPriceBenchmark } from "./priceBenchmark";
import { proposeJob } from "./contractorJobProposal";

export type ToolName =
  | "classify_home_issue"
  | "create_maintenance_job"
  | "create_quote_request"
  | "draft_work_order"
  | "search_contractors"
  | "sign_job_verification"
  | "submit_contractor_review"
  | "share_report"
  | "revoke_report_link"
  | "list_bids"
  | "accept_bid"
  | "decline_quote"
  | "list_leads"
  | "submit_bid"
  | "get_earnings_summary"
  | "update_job_status"
  | "schedule_maintenance_task"
  | "get_maintenance_forecast"
  | "get_price_benchmark"
  | "propose_job"
  | "confirm_job_proposal"
  | "add_room"
  | "add_recurring_service"
  | "add_property";

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
        lines.push("", "---", "Generated by HomeGentic Voice Agent");

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
        const data: Record<string, unknown> = { jobId, status: job.status, summary };
        // Include contractor context so agent can prompt for a review (16.4.1)
        if (!job.isDiy && job.contractorName) {
          data.contractorName = job.contractorName;
        }
        if (!job.isDiy && job.contractor) {
          data.contractorPrincipal = job.contractor;
        }
        return { success: true, data };
      }

      // ── Submit contractor review ───────────────────────────────────────────
      case "submit_contractor_review": {
        const contractorPrincipal = input.contractor_principal
          ? String(input.contractor_principal)
          : null;
        const rating = input.rating != null ? Number(input.rating) : null;

        if (!contractorPrincipal) {
          return { success: false, error: "contractor_principal is required" };
        }
        if (rating == null || isNaN(rating)) {
          return { success: false, error: "rating is required (1–5)" };
        }

        const jobId   = input.job_id ? String(input.job_id) : "";
        const comment = input.comment ? String(input.comment) : "";

        await contractorService.submitReview(contractorPrincipal, rating, comment, jobId);

        return {
          success: true,
          data: {
            summary: `${rating}-star review submitted. Thank you — this helps other homeowners find quality contractors.`,
          },
        };
      }

      // ── Share report ──────────────────────────────────────────────────────
      case "share_report": {
        const [props, jobs] = await Promise.all([
          propertyService.getMyProperties(),
          jobService.getAll(),
        ]);

        if (props.length === 0) {
          return { success: false, error: "No properties registered yet. Add a property first." };
        }

        // Use provided property_id or default to first property
        const prop = input.property_id
          ? props.find((p) => String(p.id) === String(input.property_id)) ?? props[0]
          : props[0];

        const visibility = (input.visibility === "BuyerOnly" ? "BuyerOnly" : "Public") as "Public" | "BuyerOnly";
        const expiryDays = input.expiry_days ? Number(input.expiry_days) : null;

        const propertyJobs = jobs.filter((j) => j.propertyId === String(prop.id));
        const link = await reportService.generateReport(
          String(prop.id),
          propertyToInput(prop),
          propertyJobs.map(jobToInput),
          [],   // recurring services — not in agent context
          [],   // rooms — not in agent context
          expiryDays,
          visibility,
        );

        const url = reportService.shareUrl(link.token);
        const expiryNote = expiryDays ? ` — expires in ${expiryDays} days` : " — no expiry";
        return {
          success: true,
          data: {
            token:   link.token,
            url,
            summary: `Report shared (${visibility}${expiryNote}). Share this link: ${url}`,
          },
        };
      }

      // ── Revoke report link ─────────────────────────────────────────────────
      case "revoke_report_link": {
        // List mode — agent calls this first to show the user their active links
        if (input.list_links_for_property) {
          const propertyId = String(input.list_links_for_property);
          const links = await reportService.listShareLinks(propertyId);
          const active = links.filter((l) => l.isActive);

          if (active.length === 0) {
            return {
              success: true,
              data: { links: [], summary: "No active share links found for this property." },
            };
          }

          return {
            success: true,
            data: {
              links: active.map((l) => ({
                token:      l.token,
                visibility: l.visibility,
                createdAt:  new Date(l.createdAt).toISOString().split("T")[0],
                expiresAt:  l.expiresAt ? new Date(l.expiresAt).toISOString().split("T")[0] : "never",
              })),
              summary: `Found ${active.length} active link${active.length !== 1 ? "s" : ""}. Confirm which token to revoke.`,
            },
          };
        }

        // Revoke mode — agent calls this with the confirmed token
        if (!input.token) {
          return { success: false, error: "token is required to revoke a link" };
        }

        await reportService.revokeShareLink(String(input.token));
        return {
          success: true,
          data: { summary: `Report link revoked. It can no longer be accessed.` },
        };
      }

      // ── List bids ─────────────────────────────────────────────────────────
      case "list_bids": {
        if (!input.request_id) {
          return { success: false, error: "request_id is required" };
        }
        const requestId = String(input.request_id);
        const quotes = await quoteService.getQuotesForRequest(requestId);

        if (quotes.length === 0) {
          return {
            success: true,
            data: { bids: [], summary: "No bids have been submitted for this request yet." },
          };
        }

        const sorted = [...quotes].sort((a, b) => a.amount - b.amount);
        const top3   = sorted.slice(0, 3);

        // Fetch contractor profiles for the top bids (best-effort)
        const enriched = await Promise.all(
          top3.map(async (q) => {
            const profile = await contractorService.getContractor(q.contractor).catch(() => null);
            return {
              quoteId:        q.id,
              contractorName: profile?.name ?? null,
              trustScore:     profile?.trustScore ?? null,
              amount:         q.amount,
              amountDollars:  q.amount / 100,
              timelineDays:   q.timeline,
            };
          })
        );

        const lowestDollars = (sorted[0].amount / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
        const summary = `${quotes.length} bid${quotes.length !== 1 ? "s" : ""} received. Lowest: $${lowestDollars}. ` +
          enriched
            .map((b, i) => {
              const name = b.contractorName ?? "Unknown contractor";
              return `${i + 1}. ${name} — $${(b.amount / 100).toLocaleString()} in ${b.timelineDays} day${b.timelineDays !== 1 ? "s" : ""}`;
            })
            .join("; ");

        return { success: true, data: { bids: enriched, summary } };
      }

      // ── Accept bid ────────────────────────────────────────────────────────
      case "accept_bid": {
        if (!input.quote_id) {
          return { success: false, error: "quote_id is required" };
        }
        const quoteId = String(input.quote_id);
        await quoteService.accept(quoteId);
        return {
          success: true,
          data: {
            quoteId,
            summary: `Bid ${quoteId} accepted. The contractor will be notified and the quote request is now closed.`,
          },
        };
      }

      // ── Decline quote ─────────────────────────────────────────────────────
      case "decline_quote": {
        if (!input.request_id) {
          return { success: false, error: "request_id is required" };
        }
        const requestId = String(input.request_id);
        await quoteService.close(requestId);
        return {
          success: true,
          data: {
            requestId,
            summary: `Quote request ${requestId} closed. All pending bids have been declined.`,
          },
        };
      }

      // ── List leads (contractor) ───────────────────────────────────────────
      case "list_leads": {
        const profile = await contractorService.getMyProfile();
        if (!profile) {
          return { success: false, error: "No contractor profile found. Register as a contractor first." };
        }

        const openRequests = await quoteService.getOpenRequests();
        const URGENCY_ORDER: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };

        const matched = openRequests
          .filter((r) => profile.specialties.includes(r.serviceType))
          .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9))
          .slice(0, 5)
          .map((r) => ({
            requestId:   r.id,
            serviceType: r.serviceType,
            description: r.description,
            urgency:     r.urgency,
            createdAt:   r.createdAt,
          }));

        if (matched.length === 0) {
          return {
            success: true,
            data: { leads: [], summary: `No leads matching your specialties (${profile.specialties.join(", ")}) right now. Check back soon.` },
          };
        }

        const summary =
          `${matched.length} lead${matched.length !== 1 ? "s" : ""} matching your specialties:\n` +
          matched.map((l, i) =>
            `${i + 1}. [${l.requestId}] ${l.serviceType} (${l.urgency}): "${l.description.slice(0, 60)}"`
          ).join("\n");

        return { success: true, data: { leads: matched, summary } };
      }

      // ── Submit bid (contractor) ───────────────────────────────────────────
      case "submit_bid": {
        if (!input.request_id) return { success: false, error: "request_id is required" };
        if (input.amount_dollars == null) return { success: false, error: "amount_dollars is required" };
        if (input.timeline_days == null) return { success: false, error: "timeline_days is required" };

        const requestId    = String(input.request_id);
        const amountCents  = Math.round(Number(input.amount_dollars) * 100);
        const timelineDays = Number(input.timeline_days);
        const validUntilMs = Date.now() + 30 * 86_400_000;  // 30-day validity default

        const quote = await quoteService.submitQuote(requestId, amountCents, timelineDays, validUntilMs);

        return {
          success: true,
          data: {
            quoteId: quote.id,
            summary: `Bid submitted: $${Number(input.amount_dollars).toLocaleString()} in ${timelineDays} day${timelineDays !== 1 ? "s" : ""}. You'll be notified when the homeowner responds.`,
          },
        };
      }

      // ── Get earnings summary (contractor) ─────────────────────────────────
      case "get_earnings_summary": {
        const profile = await contractorService.getMyProfile();
        if (!profile) {
          return { success: false, error: "No contractor profile found. Register as a contractor first." };
        }

        const allJobs    = await jobService.getAll();
        const myJobs     = allJobs.filter((j) => j.contractor === profile.id);
        const verified   = myJobs.filter((j) => j.status === "verified");
        const pending    = myJobs.filter((j) => j.status === "completed" || j.status === "in_progress");
        const totalCents = verified.reduce((sum, j) => sum + j.amount, 0);

        if (verified.length === 0) {
          return {
            success: true,
            data: {
              jobsCompleted:      0,
              totalEarningsCents: 0,
              pendingCount:       pending.length,
              summary: `No completed verified jobs yet. ${pending.length > 0 ? `${pending.length} job${pending.length !== 1 ? "s" : ""} in progress.` : ""}`.trim(),
            },
          };
        }

        const totalDollars = (totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });

        return {
          success: true,
          data: {
            jobsCompleted:      verified.length,
            totalEarningsCents: totalCents,
            pendingCount:       pending.length,
            summary: `${verified.length} verified job${verified.length !== 1 ? "s" : ""} — $${totalDollars} total earnings.` +
              (pending.length > 0 ? ` ${pending.length} job${pending.length !== 1 ? "s" : ""} in progress.` : ""),
          },
        };
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

      // ── Schedule maintenance task ──────────────────────────────────────────
      case "schedule_maintenance_task": {
        const entry = await maintenanceService.createScheduleEntry(
          String(input.property_id),
          String(input.system_name),
          String(input.task_description),
          Number(input.planned_year),
          input.planned_month ? Number(input.planned_month) : undefined,
          input.estimated_cost_dollars ? Math.round(Number(input.estimated_cost_dollars) * 100) : undefined,
        );
        const monthStr = entry.plannedMonth ? ` (month ${entry.plannedMonth})` : "";
        return {
          success: true,
          data: {
            entryId: entry.id,
            summary: `${entry.systemName} task scheduled for ${entry.plannedYear}${monthStr}: ${entry.taskDescription}`,
          },
        };
      }

      // ── Get maintenance forecast ───────────────────────────────────────────
      case "get_maintenance_forecast": {
        const [props, jobs] = await Promise.all([
          propertyService.getMyProperties(),
          jobService.getAll(),
        ]);
        const forecast = buildMaintenanceForecast(props, jobs);

        if (!forecast) {
          return {
            success: true,
            data: { summary: "No properties registered yet. Add a property first to get maintenance predictions." },
          };
        }

        const systemName = input.system_name ? String(input.system_name) : null;

        if (systemName) {
          const pred = forecast.predictions.find(
            (p) => p.systemName.toLowerCase() === systemName.toLowerCase()
          );
          if (!pred) {
            const available = forecast.predictions.map((p) => p.systemName).join(", ");
            return {
              success: true,
              data: { summary: `No prediction found for "${systemName}". Available systems: ${available}.` },
            };
          }
          return {
            success: true,
            data: {
              systemName:         pred.systemName,
              urgency:            pred.urgency,
              yearsRemaining:     pred.yearsRemaining,
              percentLifeUsed:    pred.percentLifeUsed,
              replacementCostLow: pred.replacementCostLow,
              replacementCostHigh:pred.replacementCostHigh,
              recommendation:     pred.recommendation,
              summary:            pred.recommendation,
            },
          };
        }

        // No specific system — return most urgent items
        const urgent = forecast.predictions
          .filter((p) => p.urgency === "Critical" || p.urgency === "Soon")
          .slice(0, 3);

        if (urgent.length === 0) {
          return {
            success: true,
            data: { summary: "All home systems are in good shape — no urgent replacements needed in the near term." },
          };
        }

        const summary = urgent
          .map((p) =>
            `${p.systemName} (${p.urgency}): ` +
            `${p.yearsRemaining <= 0 ? "past lifespan" : `${p.yearsRemaining} yr${p.yearsRemaining !== 1 ? "s" : ""} remaining`}` +
            `, replacement $${p.replacementCostLow.toLocaleString()}–$${p.replacementCostHigh.toLocaleString()}`
          )
          .join("; ");

        return {
          success: true,
          data: { urgentCount: forecast.urgentCount, systems: urgent, summary },
        };
      }

      // ── Contractor: propose a job on behalf of a homeowner ───────────────
      case "propose_job": {
        const contractorName = input.contractor_name ? String(input.contractor_name) : undefined;
        const result = await proposeJob({
          propertyAddress: String(input.property_address ?? ""),
          serviceType:     String(input.service_type ?? ""),
          description:     String(input.description ?? ""),
          amountCents:     Number(input.amount_cents ?? 0),
          completedDate:   String(input.completed_date ?? ""),
          contractorName,
          permitNumber:    input.permit_number   ? String(input.permit_number)   : undefined,
          warrantyMonths:  input.warranty_months ? Number(input.warranty_months) : undefined,
        });

        if (result.success) {
          return {
            success: true,
            data: {
              proposalId:         result.proposalId,
              propertyId:         result.propertyId,
              homeownerPrincipal: result.homeownerPrincipal,
              // Signal to the VoiceAgent that a confirmation card should be shown
              __pendingProposal: {
                proposalId:      result.proposalId,
                propertyAddress: String(input.property_address ?? ""),
                serviceType:     String(input.service_type ?? ""),
                description:     String(input.description ?? ""),
                amountCents:     Number(input.amount_cents ?? 0),
                completedDate:   String(input.completed_date ?? ""),
                contractorName,
              },
              summary: `Proposal staged. Please confirm the details below before sending to the homeowner.`,
            },
          };
        } else if (result.duplicate) {
          return {
            success: true,
            data: {
              duplicateWarning:   result.duplicate.reason,
              matchedJobId:       result.duplicate.jobId,
              propertyId:         result.propertyId,
              homeownerPrincipal: result.homeownerPrincipal,
              // Still show confirmation card with duplicate warning — homeowner decides
              __pendingProposal: {
                proposalId:      undefined,
                propertyAddress: String(input.property_address ?? ""),
                serviceType:     String(input.service_type ?? ""),
                description:     String(input.description ?? ""),
                amountCents:     Number(input.amount_cents ?? 0),
                completedDate:   String(input.completed_date ?? ""),
                contractorName,
              },
              __duplicateInfo: result.duplicate,
              summary: `Possible duplicate detected (matches ${result.duplicate.jobId}). Confirmation card shown — the homeowner will decide.`,
            },
          };
        } else if (result.candidateProperties && result.candidateProperties.length > 1) {
          const addresses = result.candidateProperties.map((p) => p.address).join("; ");
          return {
            success: false,
            error:   `Multiple properties match that address. Ask the contractor which one: ${addresses}`,
          };
        } else {
          return {
            success: false,
            error:   result.error ?? "Property not found. Verify the address.",
          };
        }
      }

      // ── Contractor: confirm a staged proposal (usually done via the UI card)
      case "confirm_job_proposal": {
        // The confirmation card handles this — if the AI calls it directly, just
        // signal that the contractor should use the card.
        return {
          success: true,
          data: { message: "Please use the confirmation card to send the proposal to the homeowner." },
        };
      }

      // ── Get price benchmark ───────────────────────────────────────────────
      case "get_price_benchmark": {
        const serviceType = String(input.service_type);
        const zipCode     = String(input.zip_code);
        const result = await getPriceBenchmark(serviceType, zipCode);

        if (!result || result.sampleSize < 5) {
          return {
            success: true,
            data: {
              found: false,
              summary: `No benchmark data available for ${serviceType} in ${zipCode} (fewer than 5 closed bids on file).`,
            },
          };
        }

        const fmt = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-US");
        return {
          success: true,
          data: {
            found:       true,
            serviceType: result.serviceType,
            zipCode:     result.zipCode,
            low:         result.low,
            median:      result.median,
            high:        result.high,
            sampleSize:  result.sampleSize,
            lastUpdated: result.lastUpdated,
            summary: `Typical ${serviceType} cost in ${zipCode}: ${fmt(result.low)}–${fmt(result.high)} (median ${fmt(result.median)}) · Based on ${result.sampleSize} closed bids · ${result.lastUpdated}`,
          },
        };
      }

      // ── Add room ──────────────────────────────────────────────────────────────
      case "add_room": {
        const room = await roomService.createRoom({
          propertyId: String(input.property_id),
          name:       String(input.room_name),
          floorType:  input.floor_type   ? String(input.floor_type)   : "",
          paintColor: input.paint_color  ? String(input.paint_color)  : "",
          paintBrand: input.paint_brand  ? String(input.paint_brand)  : "",
          paintCode:  input.paint_code   ? String(input.paint_code)   : "",
          notes:      input.notes        ? String(input.notes)        : "",
        });
        return {
          success: true,
          data: {
            roomId:  room.id,
            summary: `Room "${room.name}" added to the property${room.floorType ? ` — ${room.floorType} floors` : ""}.`,
          },
        };
      }

      // ── Add recurring service ─────────────────────────────────────────────
      case "add_recurring_service": {
        const svc = await recurringService.create({
          propertyId:      String(input.property_id),
          serviceType:     String(input.service_type) as any,
          providerName:    String(input.provider_name),
          providerLicense: input.provider_license  ? String(input.provider_license)  : undefined,
          providerPhone:   input.provider_phone    ? String(input.provider_phone)    : undefined,
          frequency:       String(input.frequency) as any,
          startDate:       String(input.start_date),
          contractEndDate: input.contract_end_date ? String(input.contract_end_date) : undefined,
          notes:           input.notes             ? String(input.notes)             : undefined,
        });
        return {
          success: true,
          data: {
            serviceId: svc.id,
            summary: `${svc.serviceType} recurring service added with ${svc.providerName} — ${svc.frequency} starting ${svc.startDate}.`,
          },
        };
      }

      // ── Add property (with tier limit guard) ──────────────────────────────
      case "add_property": {
        const [sub, existingProps] = await Promise.all([
          paymentService.getMySubscription(),
          propertyService.getMyProperties(),
        ]);
        const limit = TIER_PROPERTY_LIMIT[sub.tier] ?? 0;

        if (existingProps.length >= limit) {
          return {
            success: false,
            error: `Your ${sub.tier} plan allows up to ${limit} propert${limit === 1 ? "y" : "ies"} and you've already reached that limit. Upgrade your plan to add more properties.`,
          };
        }

        const property = await propertyService.registerProperty({
          address:      String(input.address),
          city:         String(input.city),
          state:        String(input.state),
          zipCode:      String(input.zip_code),
          propertyType: String(input.property_type) as any,
          yearBuilt:    Number(input.year_built),
          squareFeet:   Number(input.square_feet),
          tier:         sub.tier as any,
        });

        return {
          success: true,
          data: {
            propertyId: String(property.id),
            address:    property.address,
            summary: `Property added: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}. It starts as Unverified — visit the property page to begin verification.`,
          },
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
    classify_home_issue:       "analyzing issue",
    create_maintenance_job:    "logging maintenance job",
    create_quote_request:      "opening quote request",
    draft_work_order:          "drafting work order",
    search_contractors:        "searching contractors",
    sign_job_verification:     "signing job verification",
    submit_contractor_review:  "submitting contractor review",
    list_bids:                 "fetching bids",
    list_leads:                "fetching leads",
    submit_bid:                "submitting bid",
    get_earnings_summary:      "fetching earnings summary",
    accept_bid:                "accepting bid",
    decline_quote:             "closing quote request",
    share_report:              "generating report share link",
    revoke_report_link:        "revoking report link",
    update_job_status:         "updating job status",
    schedule_maintenance_task: "scheduling maintenance task",
    get_maintenance_forecast:  "checking maintenance forecast",
    get_price_benchmark:       "looking up price benchmark",
    propose_job:               "proposing job to homeowner",
    confirm_job_proposal:      "confirming job proposal",
    add_room:                  "adding room",
    add_recurring_service:     "adding recurring service",
    add_property:              "registering property",
  };
  return labels[name] ?? name;
}
