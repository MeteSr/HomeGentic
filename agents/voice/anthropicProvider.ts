/**
 * AnthropicProvider — implements AIProvider using @anthropic-ai/sdk (AI.2)
 *
 * All Anthropic-specific types are confined to this file.
 * Route handlers in server.ts interact only with the AIProvider interface.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  type AIProvider,
  type ToolDefinition,
  type ToolCall,
  type TextChunk,
  type StreamParams,
  type CompleteParams,
  type CompleteWithToolsParams,
  type CompleteWithToolsResult,
} from "./provider";

/** Tokens one model call used, as Anthropic reports them. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache writes (billed 1.25× input) and reads (0.05–0.1× input). */
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/** Which kind of call a request is; picks caching and effort. */
export type RequestKind = "chat" | "complete" | "tools";

/** Shown when the model declines (stop_reason "refusal") and no fallback answered. */
export const REFUSAL_TEXT = "Sorry, I can't help with that one. Try asking about your home a different way.";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const EPHEMERAL = { type: "ephemeral" as const };

/**
 * Sonnet 5.5 rejects `thinking: disabled`; `between_tools` is its lowest
 * setting (no extended thinking, so short max_tokens like chat's 200 stay
 * for the reply). Effort is set explicitly: low for chat and one-shot
 * completions, medium for the tool-use loop. Other models don't accept these.
 */
function isSonnet55(model: string): boolean {
  return model === "claude-sonnet-5-5" || model.startsWith("claude-sonnet-5-5-");
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model:  string;
  /** Called after every model call with its token usage (spend budgets). */
  onUsage: ((usage: TokenUsage) => void) | null = null;

  private report(usage: {
    input_tokens?: number | null; output_tokens?: number | null;
    cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  } | undefined): void {
    if (!this.onUsage || !usage) return;
    try {
      this.onUsage({
        inputTokens:         usage.input_tokens ?? 0,
        outputTokens:        usage.output_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens:     usage.cache_read_input_tokens ?? 0,
      });
    } catch { /* a budget hook must never break the reply */ }
  }

  /** `baseURL` points the client at a stand-in API (the k6 load test's mock); unset in production. */
  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL && { baseURL }) });
    this.model  = model;
  }

  // ── Static pure helpers (testable without a live client) ──────────────────

  /** Convert normalized ToolDefinition[] → Anthropic wire format. */
  static toAnthropicTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
    return tools.map((t) => ({
      name:         t.name,
      description:  t.description,
      input_schema: t.parameters as Anthropic.Messages.Tool["input_schema"],
    }));
  }

  /**
   * The request body for one call. Agent (tool-use) requests mark the last
   * tool and the system prompt for prompt caching: the ~6,700-token tool list
   * is identical for every user, so after the first call it's read from the
   * cache at a fraction of the input price, and the system prompt is reused
   * by the later turns of the same question. Chat and one-shot completions
   * aren't cached: they're mostly single calls, and a cache write costs 1.25×.
   */
  static requestBody(
    model: string,
    kind: RequestKind,
    params: { system?: string; messages: unknown[]; maxTokens: number; tools?: ToolDefinition[] },
  ): Record<string, unknown> {
    const body: Record<string, unknown> = { model, max_tokens: params.maxTokens };
    if (params.system) {
      body.system = kind === "tools"
        ? [{ type: "text", text: params.system, cache_control: EPHEMERAL }]
        : params.system;
    }
    if (params.tools) {
      const tools: Array<Record<string, unknown>> = AnthropicProvider.toAnthropicTools(params.tools).map((t) => ({ ...t }));
      if (tools.length > 0) tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: EPHEMERAL };
      body.tools = tools;
    }
    body.messages = params.messages;
    if (isSonnet55(model)) {
      body.thinking      = { type: "between_tools" };
      body.output_config = { effort: kind === "tools" ? "medium" : "low" };
      body.fallbacks     = "default";
    }
    return body;
  }

  /** Extra headers for `model`: the server-side refusal fallback beta. */
  static requestHeaders(model: string): Record<string, string> {
    return isSonnet55(model) ? { "anthropic-beta": FALLBACK_BETA } : {};
  }

  /** The reply text, or REFUSAL_TEXT when the model (and its fallback) declined. */
  static answerText(content: Anthropic.Messages.ContentBlock[], stopReason: string | null | undefined): string {
    const text = AnthropicProvider.extractText(content);
    return stopReason === "refusal" && !text.trim() ? REFUSAL_TEXT : text;
  }

  /** Extract concatenated text from an Anthropic response content array. */
  static extractText(content: Anthropic.Messages.ContentBlock[]): string {
    return content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  /** Extract ToolCall[] from an Anthropic response content array. */
  static extractToolCalls(content: Anthropic.Messages.ContentBlock[]): ToolCall[] {
    return content
      .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));
  }

  // ── AIProvider implementation ─────────────────────────────────────────────

  async *stream(params: StreamParams): AsyncIterable<TextChunk> {
    const stream = this.client.messages.stream(
      AnthropicProvider.requestBody(this.model, "chat", params) as unknown as Anthropic.Messages.MessageStreamParams,
      { headers: AnthropicProvider.requestHeaders(this.model) },
    );

    let usage: Anthropic.Messages.Usage | undefined;
    let outputTokens = 0;
    let sentText = false;
    let refused = false;
    try {
      for await (const event of stream) {
        if (event.type === "message_start") usage = event.message.usage;
        if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
          if (event.delta.stop_reason === "refusal") refused = true;
        }
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          sentText = true;
          yield { text: event.delta.text };
        }
      }
      if (refused && !sentText) yield { text: REFUSAL_TEXT };
    } finally {
      this.report({ ...usage, output_tokens: outputTokens });
    }
  }

  async complete(params: CompleteParams): Promise<string> {
    const response = await this.client.messages.create(
      AnthropicProvider.requestBody(this.model, "complete", params) as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      { headers: AnthropicProvider.requestHeaders(this.model) },
    );
    this.report(response.usage);
    return AnthropicProvider.answerText(response.content, response.stop_reason);
  }

  async completeWithTools(params: CompleteWithToolsParams): Promise<CompleteWithToolsResult> {
    const response = await this.client.messages.create(
      AnthropicProvider.requestBody(this.model, "tools", params) as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      { headers: AnthropicProvider.requestHeaders(this.model) },
    );
    this.report(response.usage);

    const toolCalls = AnthropicProvider.extractToolCalls(response.content);
    if (toolCalls.length > 0) {
      return {
        type:             "tool_calls",
        assistantMessage: { role: "assistant", content: response.content },
        toolCalls,
      };
    }

    return { type: "answer", text: AnthropicProvider.answerText(response.content, response.stop_reason) };
  }
}

/** Factory: instantiate the provider from env vars. */
export function createAnthropicProvider(): AnthropicProvider {
  const { resolveModel } = require("./provider") as typeof import("./provider");
  return new AnthropicProvider(
    process.env.ANTHROPIC_API_KEY ?? "",
    resolveModel(),
  );
}
