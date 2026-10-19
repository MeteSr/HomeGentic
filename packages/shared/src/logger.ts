/**
 * Structured logger shared by the voice Worker and the IoT gateway.
 *
 * Writes JSON-lines to stdout (info/debug) and stderr (warn/error) so logs
 * can be parsed by Datadog, CloudWatch, or any JSON-line consumer.
 *
 * Level precedence: debug < info < warn < error
 * Set LOG_LEVEL env var to control minimum level (default: "info").
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (raw in LEVEL_ORDER ? raw : "info") as Level;
}

function emit(level: Level, component: string, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const entry = JSON.stringify({
    ts:        new Date().toISOString(),
    level,
    component,
    msg,
    ...meta,
  });

  if (level === "warn" || level === "error") {
    process.stderr.write(entry + "\n");
  } else {
    process.stdout.write(entry + "\n");
  }
}

export const logger = {
  debug: (component: string, msg: string, meta?: Record<string, unknown>) => emit("debug", component, msg, meta),
  info:  (component: string, msg: string, meta?: Record<string, unknown>) => emit("info",  component, msg, meta),
  warn:  (component: string, msg: string, meta?: Record<string, unknown>) => emit("warn",  component, msg, meta),
  error: (component: string, msg: string, meta?: Record<string, unknown>) => emit("error", component, msg, meta),
};
