import { useState, useCallback } from "react";
import {
  AgentMessage,
  AgentResponse,
  ToolCall,
  buildAgentMessage,
  callAgent,
} from "../services/agentService";
import { getProperties } from "../services/propertyService";
import { getJobs } from "../services/jobService";

export interface ChatMessage {
  id:      string;
  role:    "user" | "assistant" | "tool";
  text:    string;
  pending?: boolean;
}

export type ChatStatus = "idle" | "thinking" | "error";

let _msgId = 0;
function nextId() { return `msg_${++_msgId}`; }

export function useChatAgent() {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [status, setStatus]       = useState<ChatStatus>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const appendMsg = (msg: ChatMessage) =>
    setMessages((prev) => [...prev, msg]);

  const buildContext = useCallback(async () => {
    const properties = await getProperties().catch(() => []);
    const recentJobs = properties.length
      ? await getJobs(properties[0].id).catch(() => [])
      : [];
    return { properties, recentJobs };
  }, []);

  const handleToolCalls = useCallback(
    async (
      toolCalls: ToolCall[],
      assistantMsg: any,
      history: AgentMessage[],
    ): Promise<void> => {
      appendMsg({
        id:   nextId(),
        role: "tool",
        text: `Working on it… (${toolCalls.map((t) => t.name).join(", ")})`,
      });

      // Stub tool results — real canister calls wired in 15.8
      const toolResults: AgentMessage[] = toolCalls.map((tc) => ({
        role:    "user" as const,
        content: [
          {
            type:        "tool_result",
            tool_use_id: tc.id,
            content:     JSON.stringify({ ok: true, note: "mock result" }),
          },
        ],
      }));

      const nextHistory: AgentMessage[] = [
        ...history,
        assistantMsg,
        ...toolResults,
      ];

      const context  = await buildContext();
      const response = await callAgent(nextHistory, context);
      await handleResponse(response, nextHistory);
    },
    [buildContext],
  );

  const handleResponse = useCallback(
    async (response: AgentResponse, history: AgentMessage[]): Promise<void> => {
      if (response.type === "answer") {
        appendMsg({ id: nextId(), role: "assistant", text: response.text });
        setStatus("idle");
      } else if (response.type === "tool_calls") {
        await handleToolCalls(
          response.toolCalls,
          response.assistantMessage,
          history,
        );
      } else {
        setErrorText(response.message);
        setStatus("error");
      }
    },
    [handleToolCalls],
  );

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;

      const userMsg = buildAgentMessage(text);
      appendMsg({ id: nextId(), role: "user", text: userMsg.content as string });
      setStatus("thinking");
      setErrorText(null);

      const history: AgentMessage[] = [
        ...messages
          .filter((m) => m.role !== "tool")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
        userMsg,
      ];

      const context  = await buildContext();
      const response = await callAgent(history, context);
      await handleResponse(response, history);
    },
    [messages, buildContext, handleResponse],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStatus("idle");
    setErrorText(null);
  }, []);

  return { messages, status, errorText, sendMessage, clearMessages };
}
