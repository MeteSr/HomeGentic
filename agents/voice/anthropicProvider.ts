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
export interface TokenUsage { inputTokens: number; outputTokens: number }

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model:  string;
  /** Called after every model call with its token usage (spend budgets). */
  onUsage: ((usage: TokenUsage) => void) | null = null;

  private report(usage: { input_tokens?: number | null; output_tokens?: number | null } | undefined): void {
    if (!this.onUsage || !usage) return;
    try {
      this.onUsage({ inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 });
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
    const stream = this.client.messages.stream({
      model:     this.model,
      max_tokens: params.maxTokens,
      system:    params.system,
      messages:  params.messages as Anthropic.Messages.MessageParam[],
    });

    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for await (const event of stream) {
        if (event.type === "message_start") inputTokens = event.message.usage?.input_tokens ?? 0;
        if (event.type === "message_delta") outputTokens = event.usage?.output_tokens ?? outputTokens;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { text: event.delta.text };
        }
      }
    } finally {
      this.report({ input_tokens: inputTokens, output_tokens: outputTokens });
    }
  }

  async complete(params: CompleteParams): Promise<string> {
    const response = await this.client.messages.create({
      model:      this.model,
      max_tokens:  params.maxTokens,
      ...(params.system ? { system: params.system } : {}),
      messages:   params.messages as Anthropic.Messages.MessageParam[],
    });
    this.report(response.usage);
    return AnthropicProvider.extractText(response.content);
  }

  async completeWithTools(params: CompleteWithToolsParams): Promise<CompleteWithToolsResult> {
    const response = await this.client.messages.create({
      model:      this.model,
      max_tokens:  params.maxTokens,
      system:     params.system,
      tools:      AnthropicProvider.toAnthropicTools(params.tools),
      messages:   params.messages as Anthropic.Messages.MessageParam[],
    });
    this.report(response.usage);

    const toolCalls = AnthropicProvider.extractToolCalls(response.content);
    if (toolCalls.length > 0) {
      return {
        type:             "tool_calls",
        assistantMessage: { role: "assistant", content: response.content },
        toolCalls,
      };
    }

    return { type: "answer", text: AnthropicProvider.extractText(response.content) };
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
