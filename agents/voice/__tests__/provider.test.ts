/**
 * AI Provider Abstraction — unit tests
 *
 * AI.1  AIProvider interface + normalized types (structural)
 * AI.2  AnthropicProvider pure helpers: toAnthropicTools, extractText,
 *        extractToolCalls
 * AI.4  resolveModel: reads AI_MODEL env var with fallback
 * AI.6  Provider-agnostic error message constants
 *
 * No real Anthropic API calls are made — only pure functions are tested here.
 */

import {
  resolveModel,
  PROVIDER_JSON_ERROR,
  type AIProvider,
  type ToolDefinition,
  type ToolCall,
  type TextChunk,
  type MessageParam,
} from "../provider";

import {
  AnthropicProvider,
} from "../anthropicProvider";

// ── AI.1: normalized type shapes ─────────────────────────────────────────────

describe("AI.1 — ToolDefinition shape", () => {
  it("accepts a minimal valid tool definition", () => {
    const tool: ToolDefinition = {
      name: "my_tool",
      description: "Does something",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    };
    expect(tool.name).toBe("my_tool");
    expect(tool.parameters.type).toBe("object");
  });

  it("ToolCall carries id, name, and input", () => {
    const call: ToolCall = { id: "call_1", name: "do_thing", input: { foo: "bar" } };
    expect(call.id).toBe("call_1");
    expect(call.input).toEqual({ foo: "bar" });
  });

  it("TextChunk carries a text string", () => {
    const chunk: TextChunk = { text: "hello" };
    expect(chunk.text).toBe("hello");
  });

  it("MessageParam allows user and assistant roles", () => {
    const u: MessageParam = { role: "user",      content: "hi" };
    const a: MessageParam = { role: "assistant", content: "hello" };
    expect(u.role).toBe("user");
    expect(a.role).toBe("assistant");
  });
});

// ── AI.2: AnthropicProvider.toAnthropicTools ─────────────────────────────────

describe("AI.2 — AnthropicProvider.toAnthropicTools", () => {
  const tool: ToolDefinition = {
    name: "do_thing",
    description: "Does a thing",
    parameters: {
      type: "object",
      properties: {
        widget: { type: "string", description: "The widget name" },
      },
      required: ["widget"],
    },
  };

  it("preserves name and description", () => {
    const [converted] = AnthropicProvider.toAnthropicTools([tool]);
    expect(converted.name).toBe("do_thing");
    expect(converted.description).toBe("Does a thing");
  });

  it("renames parameters → input_schema", () => {
    const [converted] = AnthropicProvider.toAnthropicTools([tool]);
    expect(converted).not.toHaveProperty("parameters");
    expect(converted).toHaveProperty("input_schema");
  });

  it("preserves type, properties, and required inside input_schema", () => {
    const [converted] = AnthropicProvider.toAnthropicTools([tool]);
    const schema = (converted as any).input_schema;
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("widget");
    expect(schema.required).toContain("widget");
  });

  it("handles empty properties and required", () => {
    const empty: ToolDefinition = {
      name: "noop",
      description: "No params",
      parameters: { type: "object", properties: {}, required: [] },
    };
    const [converted] = AnthropicProvider.toAnthropicTools([empty]);
    const schema = (converted as any).input_schema;
    expect(schema.properties).toEqual({});
    expect(schema.required).toEqual([]);
  });

  it("converts all tools in the array", () => {
    const tools: ToolDefinition[] = [
      { name: "a", description: "A", parameters: { type: "object", properties: {}, required: [] } },
      { name: "b", description: "B", parameters: { type: "object", properties: {}, required: [] } },
      { name: "c", description: "C", parameters: { type: "object", properties: {}, required: [] } },
    ];
    expect(AnthropicProvider.toAnthropicTools(tools)).toHaveLength(3);
  });

  it("produces output that matches the Anthropic wire format exactly", () => {
    const [converted] = AnthropicProvider.toAnthropicTools([tool]);
    expect(converted).toEqual({
      name: "do_thing",
      description: "Does a thing",
      input_schema: {
        type: "object",
        properties: {
          widget: { type: "string", description: "The widget name" },
        },
        required: ["widget"],
      },
    });
  });
});

// ── AI.2: AnthropicProvider.extractText ──────────────────────────────────────

describe("AI.2 — AnthropicProvider.extractText", () => {
  it("returns empty string when content is empty", () => {
    expect(AnthropicProvider.extractText([])).toBe("");
  });

  it("returns empty string when there are no text blocks", () => {
    const content = [{ type: "tool_use", id: "x", name: "foo", input: {} }];
    expect(AnthropicProvider.extractText(content as any)).toBe("");
  });

  it("returns the text from a single text block", () => {
    const content = [{ type: "text", text: "Hello world" }];
    expect(AnthropicProvider.extractText(content as any)).toBe("Hello world");
  });

  it("concatenates multiple text blocks", () => {
    const content = [
      { type: "text", text: "Hello " },
      { type: "tool_use", id: "x", name: "foo", input: {} },
      { type: "text", text: "world" },
    ];
    expect(AnthropicProvider.extractText(content as any)).toBe("Hello world");
  });
});

// ── AI.2: AnthropicProvider.extractToolCalls ─────────────────────────────────

describe("AI.2 — AnthropicProvider.extractToolCalls", () => {
  it("returns empty array when content is empty", () => {
    expect(AnthropicProvider.extractToolCalls([])).toEqual([]);
  });

  it("returns empty array when there are no tool_use blocks", () => {
    const content = [{ type: "text", text: "Sure!" }];
    expect(AnthropicProvider.extractToolCalls(content as any)).toEqual([]);
  });

  it("maps a single tool_use block to a ToolCall", () => {
    const content = [{
      type: "tool_use",
      id:   "call_abc",
      name: "search_contractors",
      input: { service_type: "Roofing" },
    }];
    const [call] = AnthropicProvider.extractToolCalls(content as any);
    expect(call.id).toBe("call_abc");
    expect(call.name).toBe("search_contractors");
    expect(call.input).toEqual({ service_type: "Roofing" });
  });

  it("maps multiple tool_use blocks", () => {
    const content = [
      { type: "tool_use", id: "c1", name: "tool_a", input: {} },
      { type: "text",     text: "text between" },
      { type: "tool_use", id: "c2", name: "tool_b", input: { x: 1 } },
    ];
    const calls = AnthropicProvider.extractToolCalls(content as any);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe("tool_a");
    expect(calls[1].name).toBe("tool_b");
    expect(calls[1].input).toEqual({ x: 1 });
  });
});

// ── AI.4: resolveModel ────────────────────────────────────────────────────────

describe("AI.4 — resolveModel", () => {
  const originalEnv = process.env.AI_MODEL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = originalEnv;
    }
  });

  it("returns the AI_MODEL env var when set", () => {
    process.env.AI_MODEL = "gpt-4o";
    expect(resolveModel()).toBe("gpt-4o");
  });

  it("trims whitespace from the env value", () => {
    process.env.AI_MODEL = "  claude-opus-4-6  ";
    expect(resolveModel()).toBe("claude-opus-4-6");
  });

  it("returns the default model when AI_MODEL is not set", () => {
    delete process.env.AI_MODEL;
    const model = resolveModel();
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
  });

  it("returns the default model when AI_MODEL is an empty string", () => {
    process.env.AI_MODEL = "";
    const model = resolveModel();
    expect(model.length).toBeGreaterThan(0);
  });

  it("accepts an explicit fallback argument", () => {
    delete process.env.AI_MODEL;
    expect(resolveModel("my-custom-default")).toBe("my-custom-default");
  });
});

// ── AI.6: provider-agnostic error message constants ──────────────────────────

describe("AI.6 — provider-agnostic error messages", () => {
  it("PROVIDER_JSON_ERROR does not mention 'Claude'", () => {
    expect(PROVIDER_JSON_ERROR.toLowerCase()).not.toContain("claude");
  });

  it("PROVIDER_JSON_ERROR mentions JSON", () => {
    expect(PROVIDER_JSON_ERROR.toLowerCase()).toContain("json");
  });
});
