/**
 * One question → one answer, for the assistant sheet.
 *
 * Sends the question with live context (the active property and its jobs, or
 * the contractor's leads) to the voice Worker's /api/agent, identified by the
 * auth canister's session token. The Worker may ask to run tools: the app
 * runs the read-only lookups (records, saved documents, local prices) and
 * says the rest aren't available on mobile rather than pretending they
 * succeeded, so the agent answers from what it has.
 */
import { useCallback, useRef, useState } from "react";
import {
  AgentContext,
  AgentMessage,
  AgentResponse,
  buildAgentMessage,
  callAgent,
} from "../services/agentService";
import { getAgentSessionToken } from "../services/agentSession";
import { runAssistantTool } from "../services/assistantTools";

export type AssistantStatus = "idle" | "thinking" | "answered" | "error";

const MAX_TURNS = 5;

const NOT_ON_MOBILE =
  "This action isn't available from the mobile app yet. Answer from the context you have, or tell the user to finish it on homegentic.app.";

/**
 * One tool round: the read-only lookups run on the phone
 * (services/assistantTools.ts); any other tool is answered as unavailable,
 * so nothing that changes the record runs from here.
 */
export async function toolResults(response: Extract<AgentResponse, { type: "tool_calls" }>): Promise<AgentMessage[]> {
  const content = [];
  for (const tc of response.toolCalls) {
    let result;
    try {
      result = await runAssistantTool(tc.name, tc.input ?? {});
    } catch {
      content.push({ type: "tool_result", tool_use_id: tc.id, is_error: true, content: "Couldn't look that up just now. Say so rather than guessing." });
      continue;
    }
    content.push(
      result === null
        ? { type: "tool_result", tool_use_id: tc.id, is_error: true, content: NOT_ON_MOBILE }
        : { type: "tool_result", tool_use_id: tc.id, content: JSON.stringify(result) },
    );
  }
  return [{ role: "user", content }];
}

export function useAssistant(
  buildContext: () => Promise<AgentContext>,
  /** Called after every attempt — used to refresh the AI-call meter. */
  onSettled?: () => void,
) {
  const [status, setStatus]     = useState<AssistantStatus>("idle");
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer]     = useState<string>("");
  const [error, setError]       = useState<string | null>(null);
  const runId = useRef(0);

  const ask = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const run = ++runId.current;
    setQuestion(text.trim());
    setAnswer("");
    setError(null);
    setStatus("thinking");
    try {
      const [token, context] = await Promise.all([getAgentSessionToken(), buildContext()]);
      let history: AgentMessage[] = [buildAgentMessage(text)];
      let response = await callAgent(history, context, token);
      for (let turn = 1; response.type === "tool_calls" && turn < MAX_TURNS; turn++) {
        history = [...history, response.assistantMessage, ...(await toolResults(response))];
        response = await callAgent(history, context, token);
      }
      if (run !== runId.current) return;
      if (response.type === "answer") {
        setAnswer(response.text);
        setStatus("answered");
      } else {
        setError(response.type === "error" ? response.message : "The assistant couldn't finish that. Try asking another way.");
        setStatus("error");
      }
    } catch {
      if (run !== runId.current) return;
      setError("Couldn't reach the assistant. Check your connection and try again.");
      setStatus("error");
    }
    onSettled?.();
  }, [buildContext, onSettled]);

  const reset = useCallback(() => {
    runId.current++;
    setStatus("idle");
    setQuestion(null);
    setAnswer("");
    setError(null);
  }, []);

  return { status, question, answer, error, ask, reset };
}
