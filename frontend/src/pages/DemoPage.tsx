import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

/* ─── Tokens ─────────────────────────────────────────────────────────────── */
const BLUE   = "#2B34FF";
const YELLOW = "#FFD23F";
const CORAL  = "#FF5C39";
const INK    = "#0B0D1A";
const PAPER  = "#FCFCFD";
const MUTED  = "#6B7080";
const MUTED2 = "#9AA0B0";
const BORDER = "#EDEEF2";
const LBLUE  = "#F3F4FF";
const VBADGE = "#E0E2FF";

const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";
const BODY    = "'Hanken Grotesk', sans-serif";
const MONO    = "'JetBrains Mono', monospace";

type Persona = "homeowners" | "contractors" | "realtors" | "property-managers";
const VALID_PERSONAS: Persona[] = ["homeowners", "contractors", "realtors", "property-managers"];
const TRACK_LABELS: Record<Persona, string> = {
  homeowners: "Homeowners", contractors: "Contractors",
  realtors: "Realtors", "property-managers": "Property Managers",
};

/* ─── Block types ────────────────────────────────────────────────────────── */
type RowTone = "blue" | "coral" | "yellow";
type ChipTone = "blue" | "yellow" | "coral";

type Block =
  | { kind: "score"; value: number; label: string; pct: string; rows: { label: string; pct: string; value: number; color: string }[] }
  | { kind: "stats"; stats: { value: string; label: string }[] }
  | { kind: "row"; left: string; sub?: string | null; right?: string | null; tone?: RowTone; strong?: boolean; check?: boolean }
  | { kind: "bar"; left: string; pct: string; right: string }
  | { kind: "bubble"; who: string; text: string; self?: boolean }
  | { kind: "action"; text: string; tone?: "default" | "primary" | "cta" }
  | { kind: "note"; text: string; noteTone?: "blue" | "yellow" }
  | { kind: "upload" };

interface MockDef { title: string; sub: string; chip?: string; chipTone?: ChipTone; blocks: Block[] }
interface Slide { kicker: string; title: string; bullets: string[]; mock: MockDef }
interface Track { kicker: string; title: string; slides: Slide[] }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const r = (left: string, sub?: string | null, right?: string | null, opts?: Partial<{ kind: "row"; left: string; sub: string | null; right: string | null; tone: RowTone; strong: boolean; check: boolean }>): Block =>
  ({ kind: "row", left, sub: sub ?? null, right: right ?? null, ...opts });
const st = (arr: [string, string][]): Block =>
  ({ kind: "stats", stats: arr.map(([value, label]) => ({ value, label })) });
const bu = (who: string, text: string, self?: boolean): Block =>
  ({ kind: "bubble", who, text, self: !!self });
const ac = (text: string, tone: "default" | "primary" | "cta" = "default"): Block =>
  ({ kind: "action", text, tone });
const no = (text: string, noteTone: "blue" | "yellow" = "blue"): Block =>
  ({ kind: "note", text, noteTone });
const sc = (value: number, label: string, pct: string, rows: { label: string; pct: string; value: number; color: string }[]): Block =>
  ({ kind: "score", value, label, pct, rows });
const ba = (left: string, pct: string, right: string): Block =>
  ({ kind: "bar", left, pct, right });

/* ─── Track data ─────────────────────────────────────────────────────────── */
const TRACKS: Record<Persona, Track> = {
  homeowners: {
    kicker: "FOR HOMEOWNERS", title: "Your home has a brain. Finally use it.",
    slides: [
      { kicker: "AI-Powered Home Assistant", title: "Describe Any Issue — AI Handles the Rest",
        bullets: ["Speak or type any issue in plain language", "AI reads your home's full history before responding", "Diagnoses the problem, drafts the job, finds contractors — in one conversation"],
        mock: { title: "HomeGentic Assistant", sub: "AI-Powered", blocks: [
          bu("YOU", "My AC is making a loud rattling noise and barely cooling the house. It's a 2018 Carrier unit.", true),
          bu("HOMEGENTIC AI", "I found your HVAC record — a 2018 Carrier 2-ton, now 7 years old and 14 months since last service (overdue). Rattling plus weak cooling typically means a loose fan blade or low refrigerant."),
          ac("Log Job: HVAC Inspection & Repair"),
          ac("Request Quotes — 3 vetted HVAC contractors nearby", "primary"),
          ac("Start Hiring Process", "cta"),
        ] } },
      { kicker: "AI Room & Fixture Tracking", title: "Add Rooms by Just Asking",
        bullets: ["Describe a room in plain language", "Materials, paint colours and fixtures recorded with it", "Rooms link to the jobs and warranties that touch them"],
        mock: { title: "HomeGentic Assistant", sub: "Rooms & fixtures", blocks: [
          bu("YOU", "Add a master bathroom to my property — tile floors, Alabaster white paint by Sherwin-Williams.", true),
          bu("HOMEGENTIC AI", "Done — Master Bathroom has been added to 412 Maple Drive. I have recorded tile floors and Alabaster White (SW 7008) by Sherwin-Williams."),
          ac("Add fixtures to Master Bathroom"),
          ac("Add another room", "primary"),
          ac("View Property Rooms", "cta"),
        ] } },
      { kicker: "The HomeGentic Score", title: "Your Home Has a Credit Score — Know It",
        bullets: ["Score updates after every verified job", "Track maintenance ROI over time", "See how you compare to neighbors"],
        mock: { title: "124 Maple Street", sub: "Homeowner dashboard", chip: "EXCELLENT", chipTone: "blue", blocks: [
          sc(91, "HOMEGENTIC SCORE", "91%", [
            { label: "Maintenance", pct: "94%", value: 94, color: BLUE },
            { label: "Systems",     pct: "88%", value: 88, color: BLUE },
            { label: "Structure",   pct: "96%", value: 96, color: BLUE },
            { label: "Docs",        pct: "82%", value: 82, color: YELLOW },
          ]),
          r("Verified jobs on record", "12 jobs · $41k invested", "+7 pts this year", { tone: "blue" }),
        ] } },
      { kicker: "Predictive Maintenance Engine", title: "Never Miss a Maintenance Deadline Again",
        bullets: ["AI-powered seasonal task calendar", "System lifespan estimates with alerts", "Urgent tasks flagged automatically"],
        mock: { title: "Predictive Maintenance", sub: "4 upcoming tasks", chip: "2 URGENT", chipTone: "coral", blocks: [
          r("HVAC Filter Replacement", null, "Due in 3 days",  { tone: "coral" }),
          r("Water Heater Flush",      null, "Due this month", { tone: "yellow" }),
          r("Gutter Cleaning",         null, "Oct 2025",       { tone: "yellow" }),
          r("Smoke Detector Test",     null, "Completed",      { tone: "blue" }),
        ] } },
      { kicker: "Photo Documentation", title: "Upload a Job Photo — Watch It Get Sealed",
        bullets: ["Drop in a real photo — this demo hashes it in your browser", "SHA-256 fingerprint and timestamp attach to the job", "The contractor countersigns, and the entry can never be edited"],
        mock: { title: "Log Job: Water Heater Replacement", sub: "124 Maple Street · Aug 18",
          blocks: [{ kind: "upload" }] } },
      { kicker: "Immutable Job History", title: "Every Job. Verified. On-Chain.",
        bullets: ["Dual-signature contractor verification", "Photo evidence attached to every job", "Immutable records nobody can edit"],
        mock: { title: "Job History", sub: "Verified records on-chain", chip: "12 VERIFIED", chipTone: "blue", blocks: [
          r("Roof Replacement — GAF Timberline",     "Demetrius & Sons Roofing · Apr 2025 · $14,200", "VERIFIED",    { tone: "blue" }),
          r("HVAC Full Replacement (Carrier 2-ton)", "AirPro HVAC · Jan 2025 · $8,400",               "VERIFIED",    { tone: "blue" }),
          r("Kitchen Remodel — Phase 1",              "Self / DIY · Nov 2024 · $3,100",                "SELF-LOGGED", { tone: "yellow" }),
          r("Plumbing — Water Heater Install",        "Riverdale Plumbing · Aug 2024 · $1,850",        "VERIFIED",    { tone: "blue" }),
        ] } },
      { kicker: "Quote Marketplace", title: "Get Competing Bids from Vetted Contractors",
        bullets: ["Post a request in under 2 minutes", "Contractors compete — you choose", "Review bids, ratings, and warranties"],
        mock: { title: "Quote Request: Deck Refinishing", sub: "3 bids received · Closing in 4 days", blocks: [
          r("ProDeck Solutions",  "4.9 ★ · Insured · 5-yr warranty", "$2,400", { tone: "blue", strong: true }),
          r("Greenfield Outdoor", "4.4 ★ · Insured",                  "$2,890"),
          r("QuickCoat LLC",      "3.6 ★ · 2-yr warranty",            "$1,950"),
          no("Best value flagged by AI: ProDeck holds a 5-year warranty for $490 more than the cheapest bid."),
        ] } },
      { kicker: "Verified Property Report", title: "Prove Your Home's Value at Closing",
        bullets: ["Share a secure link with any buyer", "Score, jobs, and photos in one report", "Increases buyer confidence at closing"],
        mock: { title: "HomeGentic Verified Report", sub: "124 Maple Street · Generated Apr 2025", blocks: [
          st([["91", "SCORE"], ["12", "JOBS"], ["$41k", "INVESTED"]]),
          r("Identity verified",           null, "✓", { check: true }),
          r("Contractor licenses checked", null, "✓", { check: true }),
          r("Permit records matched",       null, "✓", { check: true }),
          r("Photo documentation",          null, "✓", { check: true }),
        ] } },
    ],
  },

  contractors: {
    kicker: "FOR CONTRACTORS", title: "Win more jobs. AI works the leads.",
    slides: [
      { kicker: "Local Quote Requests", title: "Qualified Leads, Delivered to You",
        bullets: ["Filtered by your trade and ZIP code", "Homeowner score shows payment reliability", "No cold calling — inbound only"],
        mock: { title: "Quote Requests Near You", sub: "Plano, TX · 15-mi radius", chip: "7 NEW", chipTone: "yellow", blocks: [
          r("Roof Inspection",  "Allen, TX",    "$300–600", { tone: "coral", strong: true }),
          r("HVAC Tune-Up",     "McKinney, TX", "$150–300"),
          r("Deck Refinishing", "Frisco, TX",   "$2k–4k"),
        ] } },
      { kicker: "AI Lead Matching", title: "AI Finds Your Best Leads — Before You Even Look",
        bullets: ["AI ranks leads by your personal win rate", "Suggested price ranges based on similar jobs you've won", "Spend less time prospecting, more time working"],
        mock: { title: "HomeGentic Assistant", sub: "HVAC · Plano, TX", blocks: [
          bu("HOMEGENTIC AI", "I analyzed this week's quote requests in your area. Based on your trade profile, here are your 3 best-match leads — ranked by your historical win rate."),
          r("HVAC Tune-Up · McKinney, TX", null, "94% match", { tone: "blue" }),
          r("AC Repair · Frisco, TX",       null, "89% match", { tone: "blue" }),
          r("HVAC Replacement · Allen, TX", null, "81% match", { tone: "blue" }),
          no("Your bid win rate on HVAC repairs is 71%. Suggested price range: $380–$520."),
          ac("View Leads & Submit Bids", "cta"),
        ] } },
      { kicker: "Fast Bid Submission", title: "Submit Bids in Under 60 Seconds",
        bullets: ["Pre-filled job details from homeowner", "Set your price and send", "Dual-sign to add to your portfolio"],
        mock: { title: "Submit Bid: Roof Inspection", sub: "124 Maple St · Posted 2h ago", blocks: [
          r("Service type",    null, "Roof Inspection + Report"),
          r("Property size",   null, "2,200 sq ft · 2-story"),
          r("Homeowner score", null, "91 / 100 — Excellent payer", { tone: "blue" }),
          st([["$450", "YOUR BID"], ["71%", "WIN RATE"], ["2h", "RESPONSE"]]),
          ac("Ready to submit", "cta"),
        ] } },
      { kicker: "Verified Contractor Profile", title: "Build a Trust Score That Wins More Work",
        bullets: ["License and insurance verification badge", "Reviews tied to verified jobs only", "Score grows with every completed job"],
        mock: { title: "Demetrius & Sons Roofing", sub: "4.9 ★ · 127 reviews", chip: "VERIFIED", chipTone: "blue", blocks: [
          st([["127", "REVIEWS"], ["4.9", "RATING"], ["$2.1M", "COMPLETED"]]),
          r("License verified",   null, "✓", { check: true }),
          r("Insurance on file",  null, "✓", { check: true }),
          r("Background checked", null, "✓", { check: true }),
          r("Dual-sign jobs",      null, "✓", { check: true }),
        ] } },
      { kicker: "Service Contract Engine", title: "Lock In Predictable Recurring Revenue",
        bullets: ["HVAC, pest, landscaping and more", "Auto-reminders for scheduled visits", "Predictable ARR on top of project work"],
        mock: { title: "Recurring Contracts", sub: "Active service agreements", chip: "8 ACTIVE", chipTone: "blue", blocks: [
          r("HVAC Bi-annual Tune-Up", "3 clients", "$1,350/yr", { tone: "blue" }),
          r("Pest Control Quarterly", "4 clients", "$2,400/yr", { tone: "blue" }),
          r("Landscaping Monthly",    "1 client",  "$1,800/yr", { tone: "blue" }),
          st([["8", "CONTRACTS"], ["$5.5k", "ARR"], ["96%", "RENEWAL"]]),
        ] } },
    ],
  },

  realtors: {
    kicker: "FOR REALTORS", title: "Close higher. AI does the prep work.",
    slides: [
      { kicker: "HomeGentic on Listings", title: "List Properties with a Verified Score Badge",
        bullets: ["Score badge visible on every listing", "Buyers trust verified history over seller claims", "Shorter inspection negotiations"],
        mock: { title: "Listing: 124 Maple Street", sub: "$485,000 · Plano, TX", chip: "SCORE 91", chipTone: "blue", blocks: [
          no("HomeGentic Verified — 12 jobs · $41k invested · all records verified."),
          r("Days on market",      null, "3 days"),
          r("Showings this week",  null, "11"),
          r("Offers received",     null, "3"),
          r("Est. premium vs avg", null, "+$18,400", { tone: "blue" }),
        ] } },
      { kicker: "AI Listing Advisor", title: "AI Turns a Low Score Into a Higher Sale Price",
        bullets: ["AI benchmarks every listing against neighborhood comps", "Prioritized improvement list with real ROI numbers", "Turn a mediocre score into a stronger selling position before day one"],
        mock: { title: "HomeGentic Assistant", sub: "Listing advisor", blocks: [
          bu("YOU", "I have a new listing at 412 Oak Lane. HomeGentic Score is 74.", true),
          bu("HOMEGENTIC AI", "A score of 74 is below the 82 neighborhood average. Three targeted improvements could add an estimated $22,400 to the sale price."),
          r("Garage door replacement", "~$4,500",   "94% ROI", { tone: "blue" }),
          r("Fiber cement siding",     "~$19,000",  "88% ROI", { tone: "blue" }),
          r("Window caulking & seal",  "Quick win, low cost", null),
          ac("Create Seller Improvement Plan", "cta"),
        ] } },
      { kicker: "Agent Marketplace", title: "Get Found by Sellers Who Need an Agent",
        bullets: ["Ranked by HomeGentic transaction count", "Profile synced to the homeowner portal", "Direct leads from sellers in your area"],
        mock: { title: "Agent Marketplace", sub: "Plano, TX · 28 agents", blocks: [
          r("Sarah R.", "142 HomeGentic sales", "4.9 ★", { tone: "blue", strong: true }),
          r("James M.", "98 HomeGentic sales",  "4.8 ★"),
          r("Tanya P.", "76 HomeGentic sales",  "4.7 ★"),
        ] } },
      { kicker: "ROI Market Intelligence", title: "Back Your Price with Data, Not Guesses",
        bullets: ["2024 Remodeling Magazine cost vs value data", "Recommend renovations with real ROI", "Help sellers prioritize before listing"],
        mock: { title: "ROI-Ranked Renovations", sub: "2024 Remodeling Cost vs Value", blocks: [
          ba("Minor Kitchen Remodel", "96%", "96%"),
          ba("Garage Door Replace",    "94%", "94%"),
          ba("Fiber Cement Siding",    "88%", "88%"),
          ba("Window Replacement",     "68%", "68%"),
        ] } },
      { kicker: "FSBO Lead Matching", title: "Connect with FSBO Sellers Before They Sign",
        bullets: ["Be notified when FSBO listings go live", "Score-ranked so you approach the right ones", "Show buyers what they're actually getting"],
        mock: { title: "FSBO Opportunities", sub: "Unrepresented sellers near you", chip: "5 NEW", chipTone: "yellow", blocks: [
          r("270 Lakeview Ct", "Listed today · Score 91",  "$625k", { tone: "blue", strong: true }),
          r("412 Oak Lane",    "Listed 2d ago · Score 87", "$512k"),
          r("88 Birchwood Dr", "Listed 5d ago · Score 74", "$398k"),
        ] } },
    ],
  },

  "property-managers": {
    kicker: "FOR PROPERTY MANAGERS", title: "Care for any home. AI handles the details.",
    slides: [
      { kicker: "Delegated Access", title: "Manage a Parent's Home — No Extra Cost",
        bullets: ["Owner sends an invite link — you claim access", "Choose Viewer or Manager role", "Works for parents, rental units, or estates"],
        mock: { title: "Delegated Access", sub: "124 Maple St · Owner: Patricia H.", chip: "MANAGER", chipTone: "blue", blocks: [
          no("You have Manager access for this property. Your actions are logged and the owner is notified. Access granted Apr 10, 2025."),
          r("Log maintenance jobs",  null, "✓", { check: true }),
          r("Upload photos",         null, "✓", { check: true }),
          r("Request quotes",        null, "✓", { check: true }),
          r("No extra subscription", null, "✓", { check: true }),
        ] } },
      { kicker: "AI Maintenance Concierge", title: "AI Schedules Maintenance — You Just Approve",
        bullets: ["AI monitors the property's maintenance schedule on your behalf", "Drafts service requests and finds contractors — you just review", "Owner stays in control; you do the work without the paperwork"],
        mock: { title: "HomeGentic Assistant", sub: "Patricia's property", blocks: [
          bu("YOU", "Mom's HVAC hasn't been serviced since we moved her in — that was over a year ago.", true),
          bu("HOMEGENTIC AI", "The HVAC is 7 years old and overdue by 2 months. I've drafted a service request under her Pro-tier account — no cost to you."),
          ac("Job drafted: HVAC Bi-annual Tune-Up", "primary"),
          ac("3 contractors pre-qualified in Patricia's area", "primary"),
          ac("Patricia will be notified before anything is hired", "primary"),
          ac("Submit for Owner Approval", "cta"),
        ] } },
      { kicker: "Manager Job Logging", title: "Log Jobs and Services on the Owner's Behalf",
        bullets: ["All jobs logged under the owner's property", "Contractor verification still required", "Owner's Pro/Premium tier applies — free for you"],
        mock: { title: "Log Job — On Behalf of Owner", sub: "124 Maple St · Patricia H.", blocks: [
          r("Service type", null, "Plumbing — Leak Repair"),
          r("Contractor",   null, "Riverdale Plumbing"),
          r("Cost",         null, "$340"),
          r("Signed by",    null, "You + Contractor", { tone: "blue" }),
          no("Owner Patricia will be notified of this job log.", "yellow"),
        ] } },
      { kicker: "On-Chain Photo Records", title: "Document Every Phase with Tamper-Proof Photos",
        bullets: ["SHA-256 hashed and timestamped", "Tagged by construction phase", "Owner sees every upload as it lands"],
        mock: { title: "Photo Documentation", sub: "Framing phase · on behalf of Patricia H.",
          blocks: [{ kind: "upload" }] } },
      { kicker: "Real-Time Activity Feed", title: "Owners Stay Informed — Every Action Notified",
        bullets: ["Every manager action lands in the owner feed", "Owner can revoke access at any time", "Nothing is hired without owner approval"],
        mock: { title: "Owner Activity Feed", sub: "Patricia sees all manager actions", blocks: [
          r("Alex logged a job: Plumbing — Leak Repair ($340)",   "2h ago",    null, { tone: "blue" }),
          r("Alex uploaded 8 framing photos for your property.",    "3h ago",    null, { tone: "blue" }),
          r("Alex requested a quote for Deck Refinishing.",         "Yesterday", null, { tone: "yellow" }),
        ] } },
    ],
  },
};

const CTA_BODIES: Record<Persona, string> = {
  homeowners: "Start a free account — add your first property in under 5 minutes.",
  contractors: "Get qualified leads in your trade area, starting today.",
  realtors: "List your next property with a verified score badge.",
  "property-managers": "Set up delegated access for any property in minutes.",
};
const CTA_LABELS: Record<Persona, string> = {
  homeowners: "Create your free account",
  contractors: "Join as a contractor",
  realtors: "Get started as an agent",
  "property-managers": "Claim manager access",
};

/* ─── Upload state ───────────────────────────────────────────────────────── */
interface UpState { url: string; name: string; size: string; hash: string; stage: 0 | 1 | 2 | 3 }
const BLANK_UP: UpState = { url: "", name: "", size: "", hash: "", stage: 0 };

/* ─── Upload block component ─────────────────────────────────────────────── */
function UploadWidget({ up, onFile }: { up: UpState; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  if (up.stage === 0) {
    return (
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        style={{ border: `2px dashed ${drag ? BLUE : BORDER}`, borderRadius: 16, padding: "36px 20px", textAlign: "center", cursor: "pointer", background: drag ? LBLUE : "transparent", transition: "all .2s" }}
      >
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        <div style={{ font: `700 13px/1 ${MONO}`, color: BLUE, marginBottom: 10 }}>↑ Drop a photo here</div>
        <div style={{ font: `400 13px/1.5 ${BODY}`, color: MUTED }}>or click to upload · SHA-256 fingerprinting runs in your browser</div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
      {up.url && (
        <div style={{ height: 130, background: INK, overflow: "hidden" }}>
          <img src={up.url} alt={up.name} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
        </div>
      )}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ font: `600 13px/1 ${BODY}`, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{up.name}</div>
          <div style={{ font: `400 11px/1 ${MONO}`, color: MUTED, flexShrink: 0 }}>{up.size}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: up.stage >= 2 ? VBADGE : LBLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {up.stage >= 2 ? <Check size={9} color={BLUE} strokeWidth={3} /> : <div style={{ width: 6, height: 6, borderRadius: "50%", background: BLUE, animation: "dm-pulse 0.8s ease infinite" }} />}
            </div>
            <div style={{ font: `400 11.5px/1.3 ${MONO}`, color: up.stage >= 2 ? INK : MUTED }}>
              {up.stage >= 2 ? `SHA-256: ${up.hash}…` : "Computing SHA-256 fingerprint…"}
            </div>
          </div>
          {up.stage >= 2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: up.stage >= 3 ? VBADGE : LBLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {up.stage >= 3 ? <Check size={9} color={BLUE} strokeWidth={3} /> : <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#DDDFE8" }} />}
              </div>
              <div style={{ font: `400 11.5px/1.3 ${MONO}`, color: up.stage >= 3 ? INK : MUTED }}>
                {up.stage >= 3 ? "Contractor countersigned · Aug 20 · 14:23" : "Awaiting contractor countersignature"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Block renderer ─────────────────────────────────────────────────────── */
function renderBlock(block: Block, idx: number, up: UpState, onFile: (f: File) => void) {
  if (block.kind === "upload") {
    return <UploadWidget key={idx} up={up} onFile={onFile} />;
  }

  if (block.kind === "score") {
    return (
      <div key={idx} style={{ background: INK, borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ font: `800 48px/1 ${DISPLAY}`, color: YELLOW, letterSpacing: "-.04em" }}>{block.value}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `700 9px/1 ${MONO}`, letterSpacing: ".14em", color: "rgba(252,252,253,0.55)" }}>{block.label}</div>
            <div style={{ height: 6, background: "rgba(252,252,253,0.16)", borderRadius: 100, marginTop: 9, overflow: "hidden" }}>
              <div style={{ height: 6, borderRadius: 100, background: BLUE, width: block.pct }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18 }}>
          {block.rows.map((rr) => (
            <div key={rr.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flexShrink: 0, width: 82, font: `400 12px/1 ${BODY}`, color: "rgba(252,252,253,0.66)" }}>{rr.label}</div>
              <div style={{ flex: 1, height: 4, background: "rgba(252,252,253,0.14)", borderRadius: 100, overflow: "hidden" }}>
                <div style={{ height: 4, borderRadius: 100, background: rr.color, width: rr.pct }} />
              </div>
              <div style={{ flexShrink: 0, width: 26, textAlign: "right", font: `600 12px/1 ${BODY}`, color: PAPER }}>{rr.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.kind === "stats") {
    return (
      <div key={idx} style={{ display: "flex", gap: 9 }}>
        {block.stats.map((s) => (
          <div key={s.label} style={{ flex: 1, background: LBLUE, borderRadius: 14, padding: 14, textAlign: "center" }}>
            <div style={{ font: `800 24px/1 ${DISPLAY}`, letterSpacing: "-.03em", color: INK }}>{s.value}</div>
            <div style={{ font: `700 9px/1 ${MONO}`, letterSpacing: ".12em", color: MUTED, marginTop: 7 }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (block.kind === "row") {
    const { tone, strong, check } = block;
    const bg = !tone ? "#F7F8FB" : tone === "blue" ? (strong ? "#E8EAFF" : LBLUE) : tone === "coral" ? "rgba(255,92,57,0.06)" : "#FFFBED";
    const border = !tone ? BORDER : tone === "blue" ? (strong ? "rgba(43,52,255,0.3)" : "rgba(43,52,255,0.15)") : tone === "coral" ? "rgba(255,92,57,0.2)" : "rgba(255,210,63,0.35)";
    const rColor = check ? BLUE : !tone ? INK : tone === "blue" ? BLUE : tone === "coral" ? "#C94C2E" : "#7A6300";
    const rBg = check ? VBADGE : !tone ? "transparent" : tone === "blue" ? VBADGE : tone === "coral" ? "#FFDCD3" : "rgba(255,210,63,0.25)";
    return (
      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 14, background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "13px 15px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 13.5px/1.35 ${BODY}`, color: INK }}>{block.left}</div>
          {block.sub && <div style={{ font: `400 11.5px/1.35 ${BODY}`, color: MUTED, marginTop: 4 }}>{block.sub}</div>}
        </div>
        {block.right && (
          <div style={{ flexShrink: 0, font: `700 11px/1 ${MONO}`, letterSpacing: ".06em", color: rColor, background: rBg, borderRadius: 100, padding: rBg !== "transparent" ? "5px 10px" : "0" }}>
            {block.right}
          </div>
        )}
      </div>
    );
  }

  if (block.kind === "bar") {
    return (
      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 2px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ flex: 1, minWidth: 0, font: `500 13px/1.3 ${BODY}`, color: INK }}>{block.left}</div>
        <div style={{ flexShrink: 0, width: 76, height: 5, background: BORDER, borderRadius: 100, overflow: "hidden" }}>
          <div style={{ height: 5, background: BLUE, borderRadius: 100, width: block.pct }} />
        </div>
        <div style={{ flexShrink: 0, width: 36, textAlign: "right", font: `600 12px/1 ${MONO}`, color: MUTED }}>{block.right}</div>
      </div>
    );
  }

  if (block.kind === "bubble") {
    const isUser = !!block.self;
    return (
      <div key={idx}>
        <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".14em", color: isUser ? MUTED2 : BLUE, textAlign: isUser ? "right" : "left", marginBottom: 6 }}>
          {block.who}
        </div>
        <div style={{ maxWidth: "90%", padding: "11px 15px", borderRadius: 14, font: `400 13px/1.55 ${BODY}`, ...(isUser
          ? { background: BLUE, color: "rgba(252,252,253,0.92)", marginLeft: "auto", borderBottomRightRadius: 4 }
          : { background: LBLUE, color: INK, borderBottomLeftRadius: 4 }) }}>
          {block.text}
        </div>
      </div>
    );
  }

  if (block.kind === "action") {
    const tone = block.tone || "default";
    const aStyle: React.CSSProperties = tone === "cta"
      ? { background: BLUE, color: PAPER, border: "none", justifyContent: "center" }
      : tone === "primary"
      ? { background: LBLUE, border: `1px solid rgba(43,52,255,0.25)`, color: BLUE }
      : { background: "rgba(11,13,26,0.04)", border: `1px solid ${BORDER}`, color: INK };
    return (
      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, font: `600 12px/1 ${BODY}`, cursor: "default", ...aStyle }}>
        {block.text}
      </div>
    );
  }

  if (block.kind === "note") {
    const isYellow = block.noteTone === "yellow";
    return (
      <div key={idx} style={{ background: isYellow ? "#FFFBED" : LBLUE, border: `1px solid ${isYellow ? "rgba(255,210,63,0.35)" : "rgba(43,52,255,0.18)"}`, borderRadius: 12, padding: "12px 14px", font: `400 12.5px/1.55 ${BODY}`, color: INK }}>
        {block.text}
      </div>
    );
  }

  return null;
}

/* ─── Mock card ──────────────────────────────────────────────────────────── */
function MockCard({ mock, up, onFile }: { mock: MockDef; up: UpState; onFile: (f: File) => void }) {
  const chipColors: Record<ChipTone, { color: string; bg: string }> = {
    blue:   { color: "#A5AAFF", bg: "rgba(43,52,255,0.3)" },
    yellow: { color: INK,       bg: YELLOW },
    coral:  { color: CORAL,     bg: "rgba(255,92,57,0.22)" },
  };
  const chip = mock.chip && mock.chipTone ? chipColors[mock.chipTone] : null;

  return (
    <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 22, overflow: "hidden", boxShadow: "0 30px 70px rgba(11,13,26,0.12)" }}>
      <div style={{ background: INK, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `700 14px/1.25 ${DISPLAY}`, color: PAPER }}>{mock.title}</div>
          <div style={{ font: `400 11.5px/1.3 ${BODY}`, color: "rgba(252,252,253,0.55)", marginTop: 4 }}>{mock.sub}</div>
        </div>
        {chip && mock.chip && (
          <div style={{ flexShrink: 0, font: `700 9px/1 ${MONO}`, letterSpacing: ".1em", color: chip.color, background: chip.bg, borderRadius: 100, padding: "7px 10px", whiteSpace: "nowrap" }}>
            {mock.chip}
          </div>
        )}
      </div>
      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 9 }}>
        {mock.blocks.map((block, i) => renderBlock(block, i, up, onFile))}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function DemoPage() {
  const { persona: rawPersona } = useParams<{ persona?: string }>();
  const navigate = useNavigate();
  const persona: Persona = (VALID_PERSONAS.includes(rawPersona as Persona) ? rawPersona : "homeowners") as Persona;

  const [step, setStep] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [up, setUp] = useState<UpState>(BLANK_UP);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setStep(0);
    setAnimKey((k) => k + 1);
    if (up.url) URL.revokeObjectURL(up.url);
    setUp(BLANK_UP);
  }, [persona]); // eslint-disable-line react-hooks/exhaustive-deps

  const track = TRACKS[persona];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(Math.min(track.slides.length - 1, step + 1));
      else if (e.key === "ArrowLeft") goTo(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }); // runs every render — intentional so step closure is fresh

  function goTo(s: number) {
    if (s === step) return;
    setStep(s);
    setAnimKey((k) => k + 1);
  }

  async function handleFile(file: File) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (up.url) URL.revokeObjectURL(up.url);
    const kb = file.size > 1048576 ? (file.size / 1048576).toFixed(1) + " MB" : Math.round(file.size / 1024) + " KB";
    setUp({ url: URL.createObjectURL(file), name: file.name.slice(0, 28), size: kb, hash: "", stage: 1 });
    let hex = "";
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { hex = "unavailable"; }
    timers.current.push(setTimeout(() => setUp((s) => ({ ...s, hash: hex.slice(0, 12), stage: 2 })), 650));
    timers.current.push(setTimeout(() => setUp((s) => ({ ...s, stage: 3 })), 1800));
  }

  const slide = track.slides[step];
  const isLast = step === track.slides.length - 1;
  const progress = `${((step + 1) / track.slides.length) * 100}%`;
  const pricingHref = persona === "contractors" ? "/for-pros#contractor-plans"
    : persona === "realtors" ? "/for-pros#realtor-plans" : "/pricing";

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: BODY, minHeight: "100vh" }}>
      <Helmet>
        <title>See HomeGentic in Action — Interactive Demo</title>
        <meta name="description" content="Explore HomeGentic features for homeowners, contractors, realtors, and property managers." />
      </Helmet>
      <style>{`
        @keyframes dm-rise { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes dm-pulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.5); opacity:.6 } }
        .dm-rise { animation: dm-rise .35s ease both; }
        @media (max-width:1100px) { .dm-page-grid { grid-template-columns: 260px minmax(0,1fr) !important; } }
        @media (max-width:860px) {
          .dm-page-grid { grid-template-columns: 1fr !important; }
          .dm-sidebar { display: none !important; }
          .dm-slide-grid { grid-template-columns: 1fr !important; }
          .dm-persona-pills { display: none !important; }
        }
      `}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(252,252,253,0.94)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", height: 72, padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, boxSizing: "border-box" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
              <path d="M14 2.4 25.4 11.2V24a1.8 1.8 0 0 1-1.8 1.8H4.4A1.8 1.8 0 0 1 2.6 24V11.2z" fill={BLUE} />
              <path d="M14 2.4 25.4 11.2H2.6z" fill={YELLOW} />
              <path d="m9.4 17.2 3.4 3.4 6.4-6.6" stroke={PAPER} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ font: `800 18px/1 ${DISPLAY}`, letterSpacing: "-.03em" }}>Home<span style={{ color: BLUE }}>Gentic</span></div>
            <div style={{ font: `700 9px/1 ${MONO}`, letterSpacing: ".14em", color: INK, background: YELLOW, borderRadius: 100, padding: "6px 9px", marginLeft: 2 }}>DEMO</div>
          </div>

          {/* Persona pills */}
          <div className="dm-persona-pills" style={{ display: "flex", alignItems: "center", gap: 4, background: LBLUE, borderRadius: 100, padding: 5, flexShrink: 0 }}>
            {VALID_PERSONAS.map((p) => {
              const active = p === persona;
              return (
                <button key={p} onClick={() => navigate(`/demo/${p}`)} style={{ font: `600 13.5px/1 ${BODY}`, color: active ? PAPER : "#5A5F70", background: active ? BLUE : "transparent", border: "none", borderRadius: 100, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color .18s, color .18s" }}>
                  {TRACK_LABELS[p]}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Link to="/" style={{ font: `600 14px/1 ${BODY}`, color: MUTED2, textDecoration: "none", padding: "12px 6px" }}>Back to site</Link>
            <Link to={pricingHref} style={{ font: `700 14px/1 ${BODY}`, color: INK, background: YELLOW, borderRadius: 100, padding: "13px 24px", textDecoration: "none", whiteSpace: "nowrap" }}>Get started</Link>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 3, background: BORDER }}>
          <div style={{ height: 3, background: BLUE, width: progress, transition: "width .3s ease" }} />
        </div>
      </nav>

      {/* Page grid */}
      <div className="dm-page-grid" style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "312px minmax(0,1fr)", alignItems: "start" }}>

        {/* Sidebar */}
        <div className="dm-sidebar" style={{ position: "sticky", top: 75, borderRight: `1px solid ${BORDER}`, padding: "32px 24px 32px 40px", boxSizing: "border-box", minHeight: "calc(100vh - 75px)", display: "flex", flexDirection: "column" }}>
          <div style={{ font: `700 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: MUTED2 }}>{track.kicker}</div>
          <div style={{ font: `700 20px/1.2 ${DISPLAY}`, letterSpacing: "-.03em", marginTop: 10, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>{track.title}</div>
          <div style={{ display: "inline-flex", alignSelf: "flex-start", font: `700 10.5px/1 ${MONO}`, letterSpacing: ".1em", color: INK, background: YELLOW, borderRadius: 100, padding: "8px 12px", marginTop: 14 }}>
            {step + 1} of {track.slides.length}
          </div>

          {/* Chapter list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 20 }}>
            {track.slides.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <button key={i} onClick={() => goTo(i)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, border: "none", borderLeft: `3px solid ${active ? YELLOW : done ? VBADGE : "transparent"}`, textAlign: "left", background: active ? "#FFF6DA" : "transparent", transition: "background-color .18s", fontFamily: BODY }}>
                  <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: active ? BLUE : done ? "rgba(11,13,26,0.12)" : "transparent", border: `1.5px solid ${active ? BLUE : done ? "rgba(11,13,26,0.12)" : "rgba(11,13,26,0.18)"}`, display: "flex", alignItems: "center", justifyContent: "center", font: `700 10px/1 ${MONO}`, color: active ? PAPER : done ? "rgba(11,13,26,0.55)" : "rgba(11,13,26,0.35)" }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, font: `${active ? 600 : done ? 500 : 400} 13.5px/1.35 ${BODY}`, color: active ? INK : done ? "rgba(11,13,26,0.65)" : "rgba(11,13,26,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.kicker}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, minHeight: 24 }} />
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
            <div style={{ font: `400 12.5px/1.55 ${BODY}`, color: MUTED }}>
              Nothing here is live data. Use{" "}
              <span style={{ font: `700 11px/1 ${MONO}`, color: INK }}>←</span> and{" "}
              <span style={{ font: `700 11px/1 ${MONO}`, color: INK }}>→</span>{" "}
              to move through the tour.
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ minWidth: 0, padding: "44px 40px 72px", boxSizing: "border-box" }}>
          <div key={`${persona}-${animKey}`} className="dm-rise dm-slide-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 452px", gap: 48, alignItems: "start" }}>

            {/* Left: copy + nav */}
            <div style={{ minWidth: 0, paddingTop: 8 }}>
              <div style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".18em", color: CORAL, textTransform: "uppercase" }}>{slide.kicker}</div>
              <h2 style={{ font: `800 42px/1.06 ${DISPLAY}`, letterSpacing: "-.04em", margin: "16px 0 0", textWrap: "pretty" as React.CSSProperties["textWrap"] }}>{slide.title}</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
                {slide.bullets.map((b) => (
                  <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: VBADGE, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                      <Check size={10} color={BLUE} strokeWidth={3} />
                    </div>
                    <div style={{ flex: 1, font: `400 15.5px/1.55 ${BODY}`, color: MUTED2, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>{b}</div>
                  </div>
                ))}
              </div>

              {/* Nav buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 34, flexWrap: "wrap" }}>
                <button onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0} style={{ cursor: step === 0 ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, padding: "15px 22px", borderRadius: 100, border: `1.5px solid ${step === 0 ? "rgba(11,13,26,0.1)" : BORDER}`, font: `600 15px/1 ${BODY}`, color: step === 0 ? "rgba(11,13,26,0.22)" : MUTED, background: "none", transition: "all .18s" }}>
                  <ArrowLeft size={15} /> Back
                </button>
                {isLast ? (
                  <Link to={pricingHref} style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 26px", borderRadius: 100, background: BLUE, font: `700 15px/1 ${BODY}`, color: PAPER, textDecoration: "none" }}>
                    Get Started <ArrowRight size={15} />
                  </Link>
                ) : (
                  <button onClick={() => goTo(step + 1)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "15px 26px", borderRadius: 100, background: BLUE, border: "none", font: `700 15px/1 ${BODY}`, color: PAPER }}>
                    Next <ArrowRight size={15} />
                  </button>
                )}
              </div>

              {/* Last-slide CTA card */}
              {isLast && (
                <div style={{ marginTop: 26, background: YELLOW, borderRadius: 22, padding: "26px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: `700 22px/1.2 ${DISPLAY}`, letterSpacing: "-.03em" }}>You've seen the whole track.</div>
                    <div style={{ font: `400 14.5px/1.55 ${BODY}`, color: "rgba(11,13,26,0.72)", marginTop: 8, textWrap: "pretty" as React.CSSProperties["textWrap"] }}>{CTA_BODIES[persona]}</div>
                  </div>
                  <Link to={pricingHref} style={{ flexShrink: 0, font: `700 15px/1 ${BODY}`, color: PAPER, background: INK, borderRadius: 100, padding: "15px 26px", textDecoration: "none", whiteSpace: "nowrap" }}>
                    {CTA_LABELS[persona]}
                  </Link>
                </div>
              )}
            </div>

            {/* Right: sticky mock card */}
            <div style={{ flexShrink: 0, position: "sticky", top: 116 }}>
              <MockCard mock={slide.mock} up={up} onFile={handleFile} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
