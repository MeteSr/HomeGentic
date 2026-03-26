import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompts";
import { buildMaintenanceSystemPrompt } from "../maintenance/prompts";
import { HOMEFAX_TOOLS } from "./tools";
import type { ChatRequest } from "./types";
import type { MaintenanceContext } from "../maintenance/prompts";

const app = express();
const port = Number(process.env.VOICE_AGENT_PORT) || 3001;
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "64kb" }));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── POST /api/chat ────────────────────────────────────────────────────────────
// Accepts { message, context }, streams Claude's response as SSE.
// Each event: data: {"text":"..."}\n\n
// Terminator: data: [DONE]\n\n
app.post("/api/chat", async (req: Request, res: Response): Promise<void> => {
  const { message, context }: ChatRequest = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 200, // ~150 words — right for voice
      system: buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
      messages: [{ role: "user", content: message.trim() }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ── POST /api/agent ───────────────────────────────────────────────────────────
// Agentic endpoint: runs one turn of the Claude tool-use loop.
// Caller maintains conversation history and executes tool calls in the browser.
//
// Request:  { messages: MessageParam[], context: AgentContext }
// Response: { type: "answer",     text: string }
//         | { type: "tool_calls", assistantMessage, toolCalls: [...] }
app.post("/api/agent", async (req: Request, res: Response): Promise<void> => {
  const { messages, context } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(context ?? { properties: [], recentJobs: [] }),
      tools: HOMEFAX_TOOLS,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length > 0) {
      // Return tool calls to the frontend for execution under the user's identity
      res.json({
        type: "tool_calls",
        assistantMessage: { role: "assistant", content: response.content },
        toolCalls: toolUseBlocks.map((b) => ({
          id: b.id,
          name: b.name,
          input: b.input,
        })),
      });
      return;
    }

    // Final answer — extract text
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    res.json({ type: "answer", text: textBlock?.text ?? "" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/maintenance/chat ────────────────────────────────────────────────
// Streaming chat with the Maintenance Advisor.
// Request:  { message: string, context: MaintenanceContext }
// Response: SSE stream of { text } events, terminated by [DONE]
app.post("/api/maintenance/chat", async (req: Request, res: Response): Promise<void> => {
  const { message, context }: { message: string; context: MaintenanceContext } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: buildMaintenanceSystemPrompt(context ?? { yearBuilt: 2000 }),
      messages: [{ role: "user", content: message.trim() }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: "claude-sonnet-4-6" });
});

app.listen(port, () => {
  console.log(`HomeFax voice agent proxy → http://localhost:${port}`);
  console.log(`Accepting requests from ${allowedOrigin}`);
});
