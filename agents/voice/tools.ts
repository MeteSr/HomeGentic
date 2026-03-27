import Anthropic from "@anthropic-ai/sdk";

/**
 * Tool schemas exposed to Claude for agentic HomeFax interactions.
 *
 * Read operations are handled via context injection — Claude doesn't need
 * tools to read data it already has. These tools are write-only and execute
 * in the browser under the authenticated user's ICP identity.
 */
export const HOMEFAX_TOOLS: Anthropic.Messages.Tool[] = [
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

    input_schema: {
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
    input_schema: {
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
    input_schema: {
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
    input_schema: {
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
    input_schema: {
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
    input_schema: {
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
    name: "update_job_status",
    description: `Update the status of an existing maintenance job.
Use this to mark a job as in-progress or completed based on what the user tells you.`,
    input_schema: {
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
];
