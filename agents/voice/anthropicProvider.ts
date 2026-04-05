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

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model:  string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
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

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { text: event.delta.text };
      }
    }
  }

  async complete(params: CompleteParams): Promise<string> {
    const response = await this.client.messages.create({
      model:      this.model,
      max_tokens:  params.maxTokens,
      ...(params.system ? { system: params.system } : {}),
      messages:   params.messages as Anthropic.Messages.MessageParam[],
    });
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
