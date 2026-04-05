/**
 * @jest-environment node
 */
import {
  buildAgentMessage,
  parseAgentResponse,
  AgentMessage,
  AgentResponse,
} from "../../services/agentService";

// ── buildAgentMessage ─────────────────────────────────────────────────────────

describe("buildAgentMessage", () => {
  it("returns a user-role message with the provided text", () => {
    const msg = buildAgentMessage("How is my HVAC?");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("How is my HVAC?");
  });

  it("trims leading/trailing whitespace from the text", () => {
    const msg = buildAgentMessage("  hello  ");
    expect(msg.content).toBe("hello");
  });
});

// ── parseAgentResponse ────────────────────────────────────────────────────────

describe("parseAgentResponse", () => {
  it("parses a final answer response", () => {
    const raw = { type: "answer", text: "Your HVAC is 12 years old." };
    const result = parseAgentResponse(raw);
    expect(result.type).toBe("answer");
    expect((result as Extract<AgentResponse, { type: "answer" }>).text).toBe(
      "Your HVAC is 12 years old."
    );
  });

  it("parses a tool_calls response", () => {
    const raw = {
      type: "tool_calls",
      toolCalls: [{ id: "tc1", name: "get_score", input: {} }],
      assistantMessage: { role: "assistant", content: [] },
    };
    const result = parseAgentResponse(raw);
    expect(result.type).toBe("tool_calls");
    const tc = result as Extract<AgentResponse, { type: "tool_calls" }>;
    expect(tc.toolCalls).toHaveLength(1);
    expect(tc.toolCalls[0].name).toBe("get_score");
  });

  it("returns an error response for unrecognised shape", () => {
    const result = parseAgentResponse({ type: "unknown" });
    expect(result.type).toBe("error");
  });

  it("returns an error response for null input", () => {
    const result = parseAgentResponse(null);
    expect(result.type).toBe("error");
  });

  it("answer text defaults to empty string when missing", () => {
    const result = parseAgentResponse({ type: "answer" }) as Extract<AgentResponse, { type: "answer" }>;
    expect(result.text).toBe("");
  });
});
