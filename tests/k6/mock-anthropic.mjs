// Stand-in for the Anthropic Messages API, so the k6 load tests exercise the
// voice Worker without spending tokens. Point the Worker at it with
// ANTHROPIC_BASE_URL=http://localhost:8788 (see tests/k6/README.md).
//
//   node tests/k6/mock-anthropic.mjs [port]
//
// Answers POST /v1/messages with a short fixed reply, streamed as SSE when the
// request asks for it. MOCK_LATENCY_MS (default 300) simulates model latency.
import http from "node:http";

const PORT = Number(process.argv[2] ?? process.env.MOCK_ANTHROPIC_PORT ?? 8788);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 300);
const REPLY = "Your HVAC was serviced in 2022, so it is in good shape. Plan a tune-up before summer.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function message(model) {
  return {
    id: `msg_mock_${Date.now()}`, type: "message", role: "assistant", model,
    content: [{ type: "text", text: REPLY }],
    stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

async function stream(res, model) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const msg = { ...message(model), content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0 } };
  send("message_start", { type: "message_start", message: msg });
  send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  for (const word of REPLY.split(/(?<= )/)) {
    send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: word } });
    await sleep(LATENCY_MS / 20);
  }
  send("content_block_stop", { type: "content_block_stop", index: 0 });
  send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
  send("message_stop", { type: "message_stop" });
  res.end();
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return void res.end("ok");
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    return void res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "not found" } }));
  }
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", async () => {
    let body = {};
    try { body = JSON.parse(raw); } catch { /* answer anyway */ }
    const model = body.model ?? "mock";
    if (body.stream) return stream(res, model);
    await sleep(LATENCY_MS);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(message(model)));
  });
}).listen(PORT, () => console.log(`[mock-anthropic] listening on :${PORT}`));
