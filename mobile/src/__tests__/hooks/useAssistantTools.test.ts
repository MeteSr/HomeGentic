/**
 * @jest-environment node
 */
// The assistant's tool round: read-only lookups run and their results go back
// to the model; everything else still gets the "not on mobile yet" result.
const mockRun = jest.fn();
jest.mock("../../services/assistantTools", () => ({ runAssistantTool: (n: string, i: unknown) => mockRun(n, i) }));
jest.mock("../../services/agentSession", () => ({ getAgentSessionToken: jest.fn() }));
jest.mock("../../services/agentService", () => ({ buildAgentMessage: jest.fn(), callAgent: jest.fn() }));

import { toolResults } from "../../hooks/useAssistant";

const blocks = (out: { content: string | any[] }[]) => out[0].content as any[];
const calls = (toolCalls: { id: string; name: string; input: Record<string, unknown> }[]) => ({
  type: "tool_calls" as const,
  toolCalls,
  assistantMessage: {},
});

beforeEach(() => jest.clearAllMocks());

it("returns a lookup's result as the tool result", async () => {
  mockRun.mockResolvedValue({ success: true, data: { rows: [{ n: 2 }] } });
  const out = await toolResults(calls([{ id: "t1", name: "query_home_records", input: { source: "bills" } }]));
  expect(mockRun).toHaveBeenCalledWith("query_home_records", { source: "bills" });
  expect(out).toEqual([
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "t1",
          content: JSON.stringify({ success: true, data: { rows: [{ n: 2 }] } }),
        },
      ],
    },
  ]);
});

it("tells the model a tool isn't available on mobile when it isn't one of the lookups", async () => {
  mockRun.mockResolvedValue(null);
  const out = await toolResults(calls([{ id: "t1", name: "accept_bid", input: {} }]));
  expect(blocks(out)[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: true });
  expect(blocks(out)[0].content).toMatch(/isn't available from the mobile app yet/);
});

it("answers every call in one message, in order, and survives a lookup that throws", async () => {
  mockRun.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ success: true, data: {} });
  const out = await toolResults(
    calls([
      { id: "a", name: "query_home_records", input: {} },
      { id: "b", name: "get_price_benchmark", input: {} },
    ]),
  );
  expect(out).toHaveLength(1);
  expect(blocks(out).map((c: any) => c.tool_use_id)).toEqual(["a", "b"]);
  expect(blocks(out)[0]).toMatchObject({ is_error: true });
  expect(blocks(out)[0].content).toMatch(/Couldn't look that up/);
  expect(blocks(out)[1].is_error).toBeUndefined();
});
