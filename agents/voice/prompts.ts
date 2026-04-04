import type { AgentContext } from "./types";

export function buildSystemPrompt(ctx: AgentContext): string {
  const propertySection =
    ctx.properties.length > 0
      ? "\nThis user's registered properties:\n" +
        ctx.properties
          .map(
            (p) =>
              `- [ID: ${p.id}] ${p.address}, ${p.city}, ${p.state} ${p.zipCode} | ` +
              `${p.propertyType} | built ${p.yearBuilt} | ${p.squareFeet} sq ft | ` +
              `verification: ${p.verificationLevel}`
          )
          .join("\n")
      : "";

  const jobSection =
    ctx.recentJobs.length > 0
      ? "\nRecent maintenance jobs on record:\n" +
        ctx.recentJobs
          .map((j) => {
            const who = j.contractorName ? `by ${j.contractorName}` : "DIY";
            const warranty = j.warrantyMonths ? ` | warranty: ${j.warrantyMonths} mo` : "";
            return `- [ID: ${j.id}] ${j.serviceType}: "${j.description}" ${who}, $${(j.amount / 100).toFixed(2)}, ${j.date}, status: ${j.status}${warranty}`;
          })
          .join("\n")
      : "";

  const warrantySection =
    ctx.expiringWarranties.length > 0
      ? "\nWarranties expiring soon (within 90 days):\n" +
        ctx.expiringWarranties
          .map((w) => `- Job ${w.jobId} (${w.serviceType}): expires ${w.expiryDate} — ${w.daysRemaining} days left`)
          .join("\n")
      : "";

  const pendingSection =
    ctx.pendingSignatureJobIds.length > 0
      ? `\nJobs awaiting homeowner signature: ${ctx.pendingSignatureJobIds.join(", ")}`
      : "";

  const quotesSection =
    ctx.openQuoteCount > 0
      ? `\nOpen quote requests: ${ctx.openQuoteCount} (contractors may be responding)`
      : "";

  const scoreSection = ctx.score
    ? (() => {
        const s = ctx.score;
        const bd = s.breakdown;
        const parts = [
          `\nHomeFax Score: ${s.score}/100 (grade ${s.grade})`,
          `  Breakdown — verified jobs: ${bd.verifiedJobPts}/40 pts, ` +
            `documented value: ${bd.valuePts}/20 pts, ` +
            `property verification: ${bd.verificationPts}/20 pts, ` +
            `job diversity: ${bd.diversityPts}/20 pts`,
        ];
        if (s.recentEvents.length > 0) {
          parts.push(
            "  Recent score events: " +
              s.recentEvents.slice(0, 4).map((e) => `${e.label} (+${e.pts} pts)`).join(", ")
          );
        }
        if (s.nextActions.length > 0) {
          parts.push("  To improve the score: " + s.nextActions.join("; "));
        }
        return parts.join("\n");
      })()
    : "";

  const recsSection =
    ctx.topRecommendations && ctx.topRecommendations.length > 0
      ? "\nTop value-add project recommendations:\n" +
        ctx.topRecommendations
          .map(
            (r) =>
              `- ${r.name} (${r.priority} priority): ~$${r.estimatedCostDollars.toLocaleString()}, ` +
              `${r.estimatedRoiPercent}% ROI — ${r.rationale}`
          )
          .join("\n")
      : "";

  const trendSection = ctx.scoreTrend
    ? (() => {
        const t = ctx.scoreTrend;
        const lines: string[] = [];
        if (t.delta !== 0 && t.previousScore !== null) {
          const dir    = t.delta > 0 ? "up" : "down";
          const sign   = t.delta > 0 ? "+" : "";
          lines.push(
            `\nScore trend: moved ${dir} from ${t.previousScore} → ${ctx.score?.score ?? "?"} (${sign}${t.delta} pts since last week)`
          );
        }
        if (t.milestoneCoaching) {
          const c = t.milestoneCoaching;
          lines.push(
            `Next milestone: ${c.milestoneLabel} (${c.milestone} pts) — ${c.ptsNeeded} pt${c.ptsNeeded > 1 ? "s" : ""} away`,
            `Suggested action: ${c.action}`
          );
        }
        return lines.length > 0 ? lines.join("\n") : "";
      })()
    : "";

  const maintenanceSection = ctx.maintenanceForecast
    ? (() => {
        const f = ctx.maintenanceForecast;
        const urgent = f.predictions.filter(
          (p) => p.urgency === "Critical" || p.urgency === "Soon"
        );
        const lines = [
          `\nMaintenance forecast for ${f.propertyAddress} (climate: ${f.climateZone}):`,
        ];
        if (urgent.length === 0) {
          lines.push("  All systems are within expected lifespan — no urgent replacements.");
        } else {
          lines.push(`  ${urgent.length} system(s) need attention (total budget $${f.totalBudgetLow.toLocaleString()}–$${f.totalBudgetHigh.toLocaleString()}):`);
          for (const p of urgent) {
            const remaining = p.yearsRemaining <= 0
              ? "past lifespan"
              : `${p.yearsRemaining} yr${p.yearsRemaining !== 1 ? "s" : ""} remaining`;
            lines.push(
              `  - ${p.systemName} [${p.urgency}] ${p.percentLifeUsed}% life used, ${remaining}, ` +
              `replacement $${p.replacementCostLow.toLocaleString()}–$${p.replacementCostHigh.toLocaleString()}`
            );
          }
        }
        // Include all Good/Watch systems briefly so agent can answer specific questions
        const stable = f.predictions.filter(
          (p) => p.urgency === "Watch" || p.urgency === "Good"
        );
        if (stable.length > 0) {
          lines.push(
            "  Stable: " +
              stable.map((p) => `${p.systemName} (${p.urgency}, ${p.yearsRemaining} yrs left)`).join(", ")
          );
        }
        return lines.join("\n");
      })()
    : "";

  return `You are the HomeFax Assistant — a knowledgeable, friendly advisor specializing in home maintenance and property value.

Your areas of expertise:
- Maintenance schedules and best practices for all home systems (HVAC, plumbing, electrical, roofing, windows, flooring)
- Home improvement ROI: which upgrades add value and which don't
- Realistic cost ranges for repairs and replacements in the US
- How deferred maintenance affects resale value and buyer confidence
- Contractor selection: what separates quality work from shortcuts
- When to repair vs replace, and typical system lifespans
- Seasonal maintenance checklists and preventive care
- How blockchain-verified maintenance history (like HomeFax records) impacts buyer trust

Stay focused on these topics. If asked about something unrelated to home maintenance, real estate, or property value, politely redirect.

DIY awareness — many homeowners do their own work:
- Never assume a contractor was involved. Ask "did you hire someone or do it yourself?" when logging a job.
- For DIY jobs: don't ask for contractor name, license, or warranty. Do ask about materials cost.
- Permits are optional context, not a requirement. Never make the user feel bad for not having one.
- DIY jobs on HomeFax are verified by the homeowner's signature alone — no contractor co-sign needed.

Issue triage — when a homeowner describes a home problem, ALWAYS call classify_home_issue first:
- Work already done (past tense, "I had...", "I fixed...", "we replaced...") → action: log_job
- Work needed (present/future tense, "it's leaking", "I need...", "can you find...") → action: get_quote
- Immediate safety risk (flooding, gas smell, no heat in winter, live wires) → action: emergency_quote
After classifying, confirm with the user in one sentence before proceeding with the next tool call.

Property IDs for tool calls: when calling create_maintenance_job, create_quote_request, or schedule_maintenance_task, use the [ID: ...] shown in the property list above. If the user says "my house" or "the property" and they have only one property, use that ID automatically without asking.

Post-job review — after sign_job_verification succeeds:
- If the tool result includes a contractorPrincipal (meaning a contractor was involved), ALWAYS follow up with: "Would you like to leave a review for [contractor name]? It helps other homeowners find quality contractors."
- If the user agrees, ask for a 1–5 star rating and an optional comment, then call submit_contractor_review.
- If the user declines or the job is DIY, skip the review prompt entirely.
- Rate-limit error ("RateLimitExceeded"): respond with "You've reached today's review limit — you can add this one tomorrow."

Document and photo guidance — after logging any job, say:
"To make this record stronger, you can add a photo of the work or a receipt on the job details page."
Only mention permits if the service type typically requires one (electrical, roofing, HVAC replacement).

Voice response rules — these are mandatory:
- Responses will be spoken aloud by the browser. Keep answers to 2-3 sentences max unless the user explicitly asks for detail.
- Never use markdown, bullet points, numbered lists, headers, or asterisks.
- Write as you would speak: natural, conversational, clear.
- For cost estimates, give a realistic range (e.g. "typically between eight hundred and twelve hundred dollars") and note that local rates vary.
- If the user's property or job data is relevant to their question, reference it directly.
${propertySection}${jobSection}${warrantySection}${pendingSection}${quotesSection}${scoreSection}${trendSection}${recsSection}${maintenanceSection}`;
}
