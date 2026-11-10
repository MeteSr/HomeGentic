/**
 * The ChatGPT / Claude connector (DFINITY's ICP MCP) from the app's side: the
 * flag that turns the in-app pointers on, prefilled "Ask in …" links, sample
 * prompts, and a per-browser "I've connected it" mark. See docs/AI_CONNECTORS.md.
 *
 * The connector only reaches mainnet canisters and an IC-served homegentic.app,
 * so everything here stays hidden until VITE_AI_CONNECTORS=1 is set for that
 * build. Questions asked there are paid by the user's own assistant plan.
 */

/** The address the connector opens. Users type it until DFINITY lists HomeGentic by name. */
export const APP_HOST = "homegentic.app";

/** DFINITY's connector endpoint, which Claude users add as a custom connector. */
export const MCP_URL = "https://mcp.internetcomputer.org/mcp";

/** The connector's name in ChatGPT's app directory. */
export const CHATGPT_APP_NAME = "Chat with your ICP apps";

export type AssistantApp = "chatgpt" | "claude";

/** True when the build turns the connector pointers on (or an e2e test does). */
export function connectorsLive(): boolean {
  if (typeof window !== "undefined" && (window as any).__e2e_ai_connectors) return true;
  return import.meta.env.VITE_AI_CONNECTORS === "1";
}

/** Questions people ask about their own records. Reads only. */
export const SAMPLE_PROMPTS: readonly string[] = [
  "What maintenance is due at my house in the next three months?",
  "How much did I spend on utilities last quarter, and was any bill unusual?",
  "When was my water heater last serviced, and by whom?",
  "List the work done on my roof and HVAC, with dates and costs.",
  "Which recurring services do I have, and when is the next visit?",
  "Summarise my latest HomeGentic report for a buyer.",
];

/** The prompt sent to the assistant: names the app so the connector opens it. */
export function connectorPrompt(question: string): string {
  const q = question.trim() || "What should I know about my home right now?";
  return `Using the ICP connector, open ${APP_HOST} and answer from my HomeGentic records: ${q}`;
}

/** A link that opens the assistant with the prompt filled in. */
export function askUrl(app: AssistantApp, question: string): string {
  const q = encodeURIComponent(connectorPrompt(question));
  return app === "chatgpt" ? `https://chatgpt.com/?q=${q}` : `https://claude.ai/new?q=${q}`;
}

const CONNECTED_KEY = "hg.aiConnectorConnected";

/** Whether this browser's user said they've set the connector up. */
export function isConnectorConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setConnectorConnected(connected: boolean): void {
  try {
    if (connected) localStorage.setItem(CONNECTED_KEY, "1");
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    // Storage blocked (private window): the mark just isn't remembered.
  }
}
