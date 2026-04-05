import type { ToolDefinition } from "./provider";

/**
 * Tool schemas exposed to the AI agent for agentic HomeFax interactions.
 *
 * Uses the normalized ToolDefinition type (AI.5). AnthropicProvider.toAnthropicTools()
 * converts these to the Anthropic wire format before sending to the API.
 *
 * Read operations are handled via context injection — the agent doesn't need
 * tools to read data it already has. These tools are write-only and execute
 * in the browser under the authenticated user's ICP identity.
 */
export const HOMEFAX_TOOLS: ToolDefinition[] = [
  {
    name: "create_maintenance_job",
    description: `Record a completed home maintenance or repair job on the blockchain.

Use this when the user wants to log work already done on their property — whether by a hired contractor OR by themselves (DIY).

Before calling this tool, always confirm:
- What work was done
- Whether they hired someone or did it themselves
- The approximate cost (even for DIY, ask about materials)
- When it was completed

For DIY jobs: set is_diy = true and omit contractor_name. Do NOT ask for a contractor name or license.
For contractor jobs: ask for the contractor's name. Optionally ask about a permit and warranty.

Permit guidance — only ask if relevant to the service type:
  - Almost always required: Electrical, structural additions
  - Usually required: Roofing, HVAC replacement, major Plumbing
  - Rarely required: Painting, Flooring, Landscaping, minor repairs
  - Never push the user if they don't have a permit number — it's optional.

After creating the job, always follow up:
"To strengthen this record, you can add photos or a receipt on the job details page. Would you like to do that now?"`,

    parameters: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The ID of the property this job belongs to",
        },
        service_type: {
          type: "string",
          enum: ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"],
          description: "The category of service performed",
        },
        description: {
          type: "string",
          description: "Clear description of the work performed",
        },
        is_diy: {
          type: "boolean",
          description: "True if the homeowner did the work themselves, false if a contractor was hired",
        },
        contractor_name: {
          type: "string",
          description: "Name of the contractor or company. Omit entirely for DIY jobs.",
        },
        amount_cents: {
          type: "number",
          description: "Total cost in cents — materials + labor. e.g. 250000 = $2,500. For DIY, use materials cost only.",
        },
        completed_date: {
          type: "string",
          description: "Date the work was completed, YYYY-MM-DD",
        },
        permit_number: {
          type: "string",
          description: "Building permit number if one was pulled. Omit if not applicable or unknown.",
        },
        warranty_months: {
          type: "number",
          description: "Warranty duration in months if the contractor provided one. Omit for DIY or if no warranty.",
        },
      },
      required: [
        "property_id",
        "service_type",
        "description",
        "is_diy",
        "amount_cents",
        "completed_date",
      ],
    },
  },

  {
    name: "classify_home_issue",
    description: `Classify a homeowner's described problem BEFORE taking action.

Use this tool whenever the user describes a home problem or issue — BEFORE calling create_maintenance_job or create_quote_request.

This step ensures you take the right action:
- If the work is ALREADY DONE → classify as "log_job", then call create_maintenance_job
- If the work HASN'T BEEN DONE yet → classify as "get_quote", then call create_quote_request
- If it's an EMERGENCY (flooding, no heat in winter, gas smell, fire hazard) → classify as "emergency_quote"

After classifying, tell the user what you determined and confirm before acting.
Example: "It sounds like your roof is leaking and you need a contractor — want me to open a quote request for roofing work?"`,
    parameters: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "The homeowner's raw description of the issue or work",
        },
        action: {
          type: "string",
          enum: ["log_job", "get_quote", "emergency_quote"],
          description: "The classified action to take",
        },
        service_type: {
          type: "string",
          enum: ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"],
          description: "The classified service category",
        },
        urgency: {
          type: "string",
          enum: ["Low", "Medium", "High", "Emergency"],
          description: "Urgency level — Emergency only for immediate safety risks",
        },
        reasoning: {
          type: "string",
          description: "One sentence explaining why you classified it this way",
        },
      },
      required: ["description", "action", "service_type", "urgency", "reasoning"],
    },
  },

  {
    name: "create_quote_request",
    description: `Open a quote request so contractors can submit bids for upcoming work.
Use this when the user wants to get price estimates for home maintenance or repairs they haven't done yet.
Always confirm the type of work and urgency before calling this tool.`,
    parameters: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The ID of the property needing work",
        },
        service_type: {
          type: "string",
          enum: ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"],
          description: "The type of service needed",
        },
        description: {
          type: "string",
          description: "Description of the work needed",
        },
        urgency: {
          type: "string",
          enum: ["Low", "Medium", "High", "Emergency"],
          description: "How urgently the work is needed",
        },
      },
      required: ["property_id", "service_type", "description", "urgency"],
    },
  },

  {
    name: "draft_work_order",
    description: `Generate a structured, contractor-ready work order from a homeowner's description.

Use this when the user wants to document work needed before contacting contractors — so they get apples-to-apples bids and don't forget key details.

YOU compose all the work order fields based on the homeowner's description, then call this tool. The tool returns formatted text the user can copy or share with contractors.`,
    parameters: {
      type: "object" as const,
      properties: {
        service_type: {
          type: "string",
          enum: ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"],
          description: "The category of work needed",
        },
        scope_of_work: {
          type: "string",
          description: "Clear, contractor-ready 2–3 sentence description of exactly what needs to be done",
        },
        materials_or_specs: {
          type: "string",
          description: "Specific materials, brands, dimensions, or specs the contractor should match. Omit if not applicable.",
        },
        access_notes: {
          type: "string",
          description: "Access requirements: gate codes, parking, pets, scheduling windows, point of contact",
        },
        questions_for_contractor: {
          type: "string",
          description: "3–5 key questions the homeowner should ask every bidder (licensing, timeline, warranty, permit, cleanup)",
        },
      },
      required: ["service_type", "scope_of_work", "questions_for_contractor"],
    },
  },

  {
    name: "search_contractors",
    description: `Search the HomeFax contractor directory by service type.

Use this when the user wants to find a vetted contractor for upcoming work.
Returns up to 3 contractors sorted by trust score. After showing results, offer to open a quote request.`,
    parameters: {
      type: "object" as const,
      properties: {
        service_type: {
          type: "string",
          enum: ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"],
          description: "The type of service to search for",
        },
      },
      required: ["service_type"],
    },
  },

  {
    name: "sign_job_verification",
    description: `Submit the homeowner's verification signature for a completed job.
DIY jobs are verified by homeowner signature alone.
Contractor jobs require both homeowner AND contractor to sign.
Use this when the user explicitly confirms they want to verify a specific job.`,
    parameters: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to verify, e.g. JOB_1",
        },
      },
      required: ["job_id"],
    },
  },

  {
    name: "schedule_maintenance_task",
    description: `Add a task to the property's maintenance schedule for a future year.

Use this when the user wants to plan ahead for a known upcoming maintenance need — e.g. "remind me to replace the roof in 2026" or "schedule HVAC service for next spring".

Always confirm the system name, year, and property before calling this tool.`,
    parameters: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The ID of the property this task belongs to",
        },
        system_name: {
          type: "string",
          enum: ["HVAC", "Roofing", "Water Heater", "Windows", "Electrical", "Plumbing", "Flooring", "Insulation", "Other"],
          description: "The home system this task relates to",
        },
        task_description: {
          type: "string",
          description: "Clear description of what needs to be done",
        },
        planned_year: {
          type: "number",
          description: "The year this task is planned for, e.g. 2026",
        },
        planned_month: {
          type: "number",
          description: "Optional month (1–12) if a specific month is known",
        },
        estimated_cost_dollars: {
          type: "number",
          description: "Rough cost estimate in dollars (not cents). Omit if unknown.",
        },
      },
      required: ["property_id", "system_name", "task_description", "planned_year"],
    },
  },

  {
    name: "get_maintenance_forecast",
    description: `Look up maintenance predictions for a specific home system, or get the most urgent systems needing attention.

Use this when the user asks about:
- A specific system: "when does my HVAC need replacing?", "how old is my roof?", "is my water heater due soon?"
- An overview: "what systems need attention?", "what should I budget for maintenance?"

This is computed from the property's year built, job history, and local climate zone — give data-driven answers, not generic estimates.

Call with system_name for a focused response. Omit system_name to return the top urgent items.

After returning Critical or Soon predictions, offer to schedule a maintenance task or open a quote request.`,
    parameters: {
      type: "object" as const,
      properties: {
        system_name: {
          type: "string",
          enum: ["HVAC", "Roofing", "Water Heater", "Windows", "Electrical", "Plumbing", "Flooring", "Insulation", "Solar Panels"],
          description: "The specific home system to query. Omit to get all urgent systems.",
        },
      },
      required: [],
    },
  },

  {
    name: "list_bids",
    description: `List the bids (contractor quotes) submitted for an open quote request, sorted by price.

Use this when the user asks "what bids have I received?", "who bid on my HVAC job?", or "show me quotes for my roofing request".
The quote request ID is shown in the open quote requests section of context.

Returns top 3 bids with contractor name, trust score, price, and timeline.
After listing, offer to accept the best bid or close the request.`,
    parameters: {
      type: "object" as const,
      properties: {
        request_id: {
          type: "string",
          description: "The quote request ID to fetch bids for (from context: [ID: ...])",
        },
      },
      required: ["request_id"],
    },
  },

  {
    name: "accept_bid",
    description: `Accept a contractor's bid on a quote request, closing the request to further bidding.

Use this when the user confirms they want to hire a specific contractor from the list_bids results.
ALWAYS confirm with the user before calling: "Just to confirm — you'd like to accept [contractor name]'s bid of $[amount]?"

The quote_id comes from the list_bids result, not the request ID.`,
    parameters: {
      type: "object" as const,
      properties: {
        quote_id: {
          type: "string",
          description: "The ID of the specific bid (quote) to accept",
        },
      },
      required: ["quote_id"],
    },
  },

  {
    name: "decline_quote",
    description: `Close a quote request without accepting any bid.

Use this when the user says "cancel this request", "I don't need this anymore", or "close the quote".
Ask for a brief reason (optional) and confirm before calling.
After closing: "Done — all pending bids have been declined and the request is closed."`,
    parameters: {
      type: "object" as const,
      properties: {
        request_id: {
          type: "string",
          description: "The quote request ID to close",
        },
      },
      required: ["request_id"],
    },
  },

  {
    name: "share_report",
    description: `Generate a HomeFax report share link for a property.

Use this when the user says "share my report", "send my report to my realtor", "create a report link", etc.

Before calling this tool, confirm:
- Visibility: "Public" (anyone with the link can view) or "BuyerOnly" (intended for a specific buyer)
- Expiry: ask "Would you like the link to expire? If so, how many days?" — omit for no expiry

After returning the URL, say: "Here's your share link — copy it and send it directly to your realtor or buyer."`,
    parameters: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property ID to generate the report for. Uses first property if omitted.",
        },
        visibility: {
          type: "string",
          enum: ["Public", "BuyerOnly"],
          description: "Public = anyone with the link; BuyerOnly = intended for a specific buyer",
        },
        expiry_days: {
          type: "number",
          description: "Number of days before the link expires. Omit for no expiry.",
        },
      },
      required: ["visibility"],
    },
  },

  {
    name: "revoke_report_link",
    description: `List or revoke an active HomeFax report share link.

Two modes:
1. LIST — call with list_links_for_property to show the user their active share links before revoking.
2. REVOKE — call with token (after user confirms) to revoke a specific link.

Always list first, then confirm with the user before revoking.
After revoking: "Done — that link can no longer be accessed by anyone."`,
    parameters: {
      type: "object" as const,
      properties: {
        list_links_for_property: {
          type: "string",
          description: "Property ID to list active share links for. Use this first to show options.",
        },
        token: {
          type: "string",
          description: "The share link token to revoke. Only set this after the user confirms.",
        },
      },
      required: [],
    },
  },

  {
    name: "submit_contractor_review",
    description: `Submit a star rating and optional comment for a contractor after a job is signed.

Use this ONLY after sign_job_verification succeeds and the tool result contains a contractorPrincipal.

Prompt pattern (do not skip this — reviews are important for trust):
"Would you like to leave a review for [contractor name]? It takes just a few seconds and helps other homeowners."

If the user agrees:
1. Ask "How would you rate the work from 1 to 5 stars?"
2. Optionally ask "Any comments you'd like to add?"
3. Confirm, then call this tool.

Do NOT call this tool without explicit user consent.
Rate-limit errors (10 reviews/day) should be communicated gracefully: "You've already submitted several reviews today — you can add this one tomorrow."`,
    parameters: {
      type: "object" as const,
      properties: {
        contractor_principal: {
          type: "string",
          description: "The ICP principal of the contractor being reviewed (from sign_job_verification result)",
        },
        job_id: {
          type: "string",
          description: "The job ID this review is for",
        },
        rating: {
          type: "number",
          description: "Star rating from 1 (poor) to 5 (excellent)",
        },
        comment: {
          type: "string",
          description: "Optional written feedback. Omit if the user has nothing to add.",
        },
      },
      required: ["contractor_principal", "job_id", "rating"],
    },
  },

  {
    name: "list_leads",
    description: `List open quote requests matching the contractor's specialties, sorted by urgency.

Use this when the contractor asks "what jobs are available?", "any new leads?", or "show me open requests".
Returns up to 5 matching requests with request IDs, service type, urgency, and description.
After listing, offer to help submit a bid on any of the shown requests.`,
    parameters: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  {
    name: "submit_bid",
    description: `Submit a bid on an open quote request on behalf of the contractor.

Use this when the contractor wants to bid on a job shown in list_leads.
ALWAYS confirm before calling: "Just to confirm — you'd like to bid $[amount] with a [X]-day timeline?"
After success: "Done — your bid has been submitted. I'll let you know when the homeowner responds."`,
    parameters: {
      type: "object" as const,
      properties: {
        request_id: {
          type: "string",
          description: "The quote request ID to bid on (from list_leads)",
        },
        amount_dollars: {
          type: "number",
          description: "Bid amount in dollars (not cents), e.g. 1500 for $1,500",
        },
        timeline_days: {
          type: "number",
          description: "Estimated days to complete the job",
        },
      },
      required: ["request_id", "amount_dollars", "timeline_days"],
    },
  },

  {
    name: "get_earnings_summary",
    description: `Return the contractor's earnings summary: verified job count, total earned, and jobs in progress.

Use this when the contractor asks "how much have I earned?", "how many jobs have I done?", or "what's my income?"`,
    parameters: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  {
    name: "update_job_status",
    description: `Update the status of an existing maintenance job.
Use this to mark a job as in-progress or completed based on what the user tells you.`,
    parameters: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to update",
        },
        status: {
          type: "string",
          enum: ["InProgress", "Completed"],
          description: "The new status",
        },
      },
      required: ["job_id", "status"],
    },
  },

  // ── 15.7.6 ───────────────────────────────────────────────────────────────────
  {
    name: "get_score",
    description: `Return the homeowner's current HomeFax Score, letter grade, and the top 3 factors driving it.

Use this when the user asks "what's my score?", "how am I doing?", "why is my score low?", or anything about their HomeFax rating.

After returning the score, briefly explain the top contributing factor in plain English.
If the score is below 70, suggest one specific action to improve it.`,
    parameters: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property ID to get the score for. Omit to use the first property.",
        },
      },
      required: [],
    },
  },

  // ── 15.7.9 ───────────────────────────────────────────────────────────────────
  {
    name: "upload_photos",
    description: `Return a deep link to the native camera screen so the user can upload photos to a job.

The agent cannot capture photos directly — use this tool to hand off to the camera screen.
After returning the deep link, say: "Tap that link to open the camera and add photos directly to this job."

Use this when the user wants to attach a photo, receipt image, or documentation to a specific job.`,
    parameters: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to upload photos to",
        },
      },
      required: ["job_id"],
    },
  },

  {
    name: "get_price_benchmark",
    description: `Look up the typical price range for a home service in a specific zip code.

Use this when the user asks "how much does roofing cost?", "what's a fair price for HVAC replacement in my area?", or "is this quote reasonable?".

Returns low, median, and high estimates based on closed HomeFax bids in that zip code.
If fewer than 5 bids are on file, tell the user there isn't enough local data yet and fall back to national averages from context.`,
    parameters: {
      type: "object" as const,
      properties: {
        service_type: {
          type: "string",
          enum: ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping", "Foundation", "Other"],
          description: "The type of home service to benchmark",
        },
        zip_code: {
          type: "string",
          description: "The 5-digit US zip code for the property",
        },
      },
      required: ["service_type", "zip_code"],
    },
  },
];
