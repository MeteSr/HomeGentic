import { useState, useRef, useCallback, useEffect } from "react";
import { propertyService } from "../services/property";
import { jobService } from "../services/job";
import { quoteService } from "../services/quote";
import { executeTool, toolActionLabel, type ToolName } from "../services/agentTools";
import { useAgentHistory, type AgentAction } from "./useAgentHistory";
import { computeScore, computeBreakdown, getScoreGrade } from "../services/scoreService";
import { getRecentScoreEvents } from "../services/scoreEventService";
import { marketService, jobToSummary } from "../services/market";
import { buildMaintenanceForecast } from "../services/maintenanceForecast";
import { buildScoreTrend } from "../services/scoreTrend";
import { loadHistory } from "../services/scoreService";
import { buildImageUserMessage, fileToBase64, type SupportedImageMimeType } from "../services/imageUtils";

// ── Minimal message types (mirrors Anthropic SDK without importing it) ─────────

type TextBlock       = { type: "text";        text: string };
type ToolUseBlock    = { type: "tool_use";    id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
type ContentBlock    = TextBlock | ToolUseBlock | ToolResultBlock;

interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type VoiceAgentState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface ProactiveAlert {
  type:         "warranty" | "signature" | "quote" | "maintenance";
  message:      string;
  actionLabel?: string;
  href?:        string;
}

export interface UseVoiceAgentReturn {
  state:              VoiceAgentState;
  transcript:         string;
  response:           string;
  error:              string | null;
  isSupported:        boolean;
  alerts:             ProactiveAlert[];
  history:            AgentAction[];
  pendingImage:       { base64: string; mimeType: string } | null;
  clearHistory:       () => void;
  startListening:     () => void;
  stopListening:      () => void;
  reset:              () => void;
  attachImage:        (file: File) => Promise<void>;
  clearImage:         () => void;
  sendImageToAgent:   (userText: string) => void;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const PROXY_URL    = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";
const MAX_TURNS    = 5;
const MS_PER_MONTH  = 30.44 * 24 * 60 * 60 * 1000;
const NINETY_DAYS   = 90 * 24 * 60 * 60 * 1000;
// 14.4.1 — clamp warranty expiry to prevent Number overflow on extreme inputs
const MAX_EXPIRY_MS = new Date("2100-01-01").getTime();

/** Pure helper — exported for testing (14.4.1). */
export function warrantyExpiryMs(startDateStr: string, warrantyMonths: number): number {
  return Math.min(
    new Date(startDateStr).getTime() + warrantyMonths * MS_PER_MONTH,
    MAX_EXPIRY_MS,
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useVoiceAgent(): UseVoiceAgentReturn {
  const [state,      setState]      = useState<VoiceAgentState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response,   setResponse]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [alerts,     setAlerts]     = useState<ProactiveAlert[]>([]);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null);

  const recognitionRef     = useRef<any>(null);
  const finalTranscriptRef = useRef("");

  const { history, addAction, clearHistory } = useAgentHistory();

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  const isSupported = typeof SpeechRecognition !== "undefined";

  // ── Richer context builder ───────────────────────────────────────────────────

  const buildContext = async () => {
    const [propertiesResult, jobsResult, quotesResult] = await Promise.allSettled([
      propertyService.getMyProperties(),
      jobService.getAll(),
      quoteService.getRequests(),
    ]);

    const properties = propertiesResult.status === "fulfilled" ? propertiesResult.value : [];
    const jobs       = jobsResult.status === "fulfilled"       ? jobsResult.value       : [];
    const quotes     = quotesResult.status === "fulfilled"     ? quotesResult.value     : [];

    const now = Date.now();

    // Expiring warranties
    const expiringWarranties = jobs
      .filter((j) => j.warrantyMonths && j.warrantyMonths > 0)
      .map((j) => ({
        job:    j,
        expiry: warrantyExpiryMs(j.date, j.warrantyMonths ?? 0),
      }))
      .filter(({ expiry }) => expiry > now && expiry - now <= NINETY_DAYS)
      .map(({ job, expiry }) => ({
        jobId:         job.id,
        serviceType:   job.serviceType,
        daysRemaining: Math.round((expiry - now) / (24 * 60 * 60 * 1000)),
        expiryDate:    new Date(expiry).toISOString().split("T")[0],
      }));

    // Jobs pending homeowner signature
    const pendingSignatureJobIds = jobs
      .filter((j) => !j.homeownerSigned && !j.isDiy)
      .map((j) => j.id);

    const openQuoteCount = quotes.filter(
      (q) => q.status === "open" || q.status === "quoted"
    ).length;

    // ── Score ──────────────────────────────────────────────────────────────────
    const score     = computeScore(jobs, properties);
    const grade     = getScoreGrade(score);
    const breakdown = computeBreakdown(jobs, properties);
    const events    = getRecentScoreEvents(jobs, properties);

    // Derive plain-English next-action tips from what's missing in the breakdown
    const nextActions: string[] = [];
    if (breakdown.verifiedJobPts < 40) {
      const needed = Math.ceil((40 - breakdown.verifiedJobPts) / 4);
      nextActions.push(`verify ${needed} more job${needed > 1 ? "s" : ""} to gain up to ${40 - breakdown.verifiedJobPts} pts`);
    }
    if (breakdown.diversityPts < 20) {
      const verifiedTypes = new Set(jobs.filter((j) => j.verified || j.status === "verified").map((j) => j.serviceType)).size;
      const needed = Math.ceil((20 - breakdown.diversityPts) / 4);
      if (needed > 0) nextActions.push(`document ${needed} more system type${needed > 1 ? "s" : ""} (e.g. HVAC, Roofing, Plumbing, Electrical) for up to ${20 - breakdown.diversityPts} diversity pts`);
    }
    if (breakdown.valuePts < 20) {
      nextActions.push(`log more job costs — each additional $2,500 documented adds 1 value pt (up to 20 pts)`);
    }
    if (breakdown.verificationPts < 20 && properties.some((p) => p.verificationLevel === "Unverified" || p.verificationLevel === "PendingReview")) {
      nextActions.push(`complete property verification to earn 5–10 verification pts`);
    }

    // ── Value-add recommendations (top 3, first property) ────────────────────
    const topRecommendations = (() => {
      if (properties.length === 0) return [];
      const p = properties[0];
      const profile = {
        yearBuilt:    Number(p.yearBuilt),
        squareFeet:   Number(p.squareFeet),
        propertyType: String(p.propertyType),
        state:        p.state,
        zipCode:      p.zipCode,
      };
      const jobSummaries = jobs.map(jobToSummary);
      return marketService.recommendValueAddingProjects(profile, jobSummaries, 0)
        .slice(0, 3)
        .map((r) => ({
          name:                 r.name,
          estimatedCostDollars: Math.round(r.estimatedCostCents / 100),
          estimatedRoiPercent:  r.estimatedRoiPercent,
          priority:             r.priority,
          rationale:            r.rationale,
        }));
    })();

    return {
      properties: properties.map((p) => ({
        id:                String(p.id),
        address:           p.address,
        city:              p.city,
        state:             p.state,
        zipCode:           p.zipCode,
        propertyType:      p.propertyType,
        yearBuilt:         Number(p.yearBuilt),
        squareFeet:        Number(p.squareFeet),
        verificationLevel: p.verificationLevel,
      })),
      score: {
        score,
        grade,
        breakdown,
        recentEvents: events.slice(0, 5).map((e) => ({ label: e.label, pts: e.pts, category: e.category })),
        nextActions,
      },
      scoreTrend: (() => {
        const history  = loadHistory(properties[0] ? String(properties[0].id) : null);
        const trend    = buildScoreTrend(score, breakdown, jobs, history);
        return {
          delta:             trend.delta,
          trend:             trend.trend,
          previousScore:     trend.previousScore,
          milestoneCoaching: trend.milestoneCoaching,
        };
      })(),
      topRecommendations,
      maintenanceForecast: buildMaintenanceForecast(properties, jobs) ?? undefined,
      recentJobs: jobs.slice(0, 15).map((j) => ({
        id:             j.id,
        serviceType:    j.serviceType,
        description:    j.description,
        contractorName: j.contractorName,
        amount:         j.amount,
        status:         j.status,
        date:           j.date,
        warrantyMonths: j.warrantyMonths,
      })),
      expiringWarranties,
      pendingSignatureJobIds,
      openQuoteCount,
    };
  };

  // ── Proactive alerts (computed once on mount) ────────────────────────────────

  useEffect(() => {
    buildContext().then((ctx) => {
      const newAlerts: ProactiveAlert[] = [];

      if (ctx.expiringWarranties.length > 0) {
        const first = ctx.expiringWarranties[0];
        newAlerts.push({
          type:        "warranty",
          message:     `${first.serviceType} warranty expires in ${first.daysRemaining} day${first.daysRemaining !== 1 ? "s" : ""}`,
          actionLabel: "View warranties",
          href:        "/warranties",
        });
      }

      if (ctx.pendingSignatureJobIds.length > 0) {
        newAlerts.push({
          type:        "signature",
          message:     `${ctx.pendingSignatureJobIds.length} job${ctx.pendingSignatureJobIds.length !== 1 ? "s" : ""} awaiting your signature`,
          actionLabel: "Go to dashboard",
          href:        "/dashboard",
        });
      }

      if (ctx.openQuoteCount > 0) {
        newAlerts.push({
          type:        "quote",
          message:     `${ctx.openQuoteCount} open quote request${ctx.openQuoteCount !== 1 ? "s" : ""}`,
          actionLabel: "View quotes",
          href:        "/dashboard",
        });
      }

      if (ctx.maintenanceForecast && ctx.maintenanceForecast.criticalSystems.length > 0) {
        const names = ctx.maintenanceForecast.criticalSystems.slice(0, 2).join(" & ");
        newAlerts.push({
          type:        "maintenance",
          message:     `${names} past expected lifespan — budget $${ctx.maintenanceForecast.totalBudgetLow.toLocaleString()}–$${ctx.maintenanceForecast.totalBudgetHigh.toLocaleString()}`,
          actionLabel: "View forecast",
          href:        "/maintenance",
        });
      }

      setAlerts(newAlerts);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agentic loop ─────────────────────────────────────────────────────────────

  const runAgentLoop = useCallback(async (userMessage: string, image?: { base64: string; mimeType: string }) => {
    setState("processing");
    setResponse("");

    try {
      const context = await buildContext();

      // If an image is attached, prepend it as an image+text content block (16.6.2)
      const firstMessage: MessageParam = image
        ? buildImageUserMessage(userMessage, image.base64, image.mimeType) as unknown as MessageParam
        : { role: "user", content: userMessage };

      const messages: MessageParam[] = [firstMessage];

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const res = await fetch(`${PROXY_URL}/api/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, context }),
        });

        if (!res.ok) throw new Error(`Proxy error: HTTP ${res.status}`);
        const data = await res.json();

        if (data.type === "answer") {
          setResponse(data.text);
          speak(data.text);
          return;
        }

        if (data.type === "tool_calls") {
          const labels = (data.toolCalls as { name: ToolName }[])
            .map((tc) => toolActionLabel(tc.name))
            .join(", ");
          setResponse(`Working on it: ${labels}…`);

          messages.push(data.assistantMessage as MessageParam);

          const toolResults: ToolResultBlock[] = await Promise.all(
            (data.toolCalls as { id: string; name: ToolName; input: Record<string, unknown> }[])
              .map(async (tc) => {
                const result = await executeTool(tc.name, tc.input);

                // Record to audit log (skip read-only classification step)
                if (tc.name !== "classify_home_issue") {
                  addAction({
                    toolName: tc.name,
                    label:    toolActionLabel(tc.name),
                    summary:  result.success
                      ? (result.data?.summary as string ?? tc.name)
                      : (result.error ?? "Failed"),
                    success:  result.success,
                  });
                }

                return {
                  type:        "tool_result" as const,
                  tool_use_id: tc.id,
                  content:     JSON.stringify(result),
                };
              })
          );

          messages.push({ role: "user", content: toolResults });
          continue;
        }

        throw new Error("Unexpected response from agent");
      }

      const fallback = "I ran into trouble completing that. Please try again.";
      setResponse(fallback);
      speak(fallback);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Could not reach the HomeFax assistant. Please try again.";
      setError(msg);
      setState("error");
    }
  }, [addAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS ───────────────────────────────────────────────────────────────────────

  const speak = (text: string) => {
    setState("speaking");
    window.speechSynthesis.cancel();

    const utterance  = new SpeechSynthesisUtterance(text);
    utterance.rate   = 0.95;
    utterance.pitch  = 1.0;

    const voices    = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Natural") ||
          v.name.includes("Neural") ||
          v.name.includes("Samantha") ||
          v.name.includes("Google"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend   = () => setState("idle");
    utterance.onerror = () => setState("idle");

    window.speechSynthesis.speak(utterance);
  };

  // ── Speech recognition ────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Voice input is not supported in this browser. Try Chrome.");
      setState("error");
      return;
    }

    setTranscript("");
    setResponse("");
    setError(null);
    finalTranscriptRef.current = "";

    const recognition          = new SpeechRecognition();
    recognition.lang            = "en-US";
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.continuous      = false;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalTranscriptRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onend = () => {
      const text = finalTranscriptRef.current.trim();
      if (text) runAgentLoop(text);
      else setState("idle");
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") setState("idle");
      else { setError(`Microphone error: ${event.error}`); setState("error"); }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState("listening");
  }, [isSupported, runAgentLoop]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.abort();
    window.speechSynthesis.cancel();
    setTranscript("");
    setResponse("");
    setError(null);
    setPendingImage(null);
    finalTranscriptRef.current = "";
    setState("idle");
  }, []);

  // ── Image attachment helpers (16.6.1) ─────────────────────────────────────

  const attachImage = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      setPendingImage({ base64, mimeType: file.type as SupportedImageMimeType });
    } catch {
      setError("Could not read the selected image. Please try again.");
    }
  }, []);

  const clearImage = useCallback(() => setPendingImage(null), []);

  /** Sends a text message together with the currently attached image. */
  const sendImageToAgent = useCallback((userText: string) => {
    if (!pendingImage) return;
    setPendingImage(null);
    runAgentLoop(userText, pendingImage);
  }, [pendingImage, runAgentLoop]);

  return {
    state, transcript, response, error, isSupported,
    alerts, history, clearHistory, pendingImage,
    startListening, stopListening, reset,
    attachImage, clearImage, sendImageToAgent,
  };
}
