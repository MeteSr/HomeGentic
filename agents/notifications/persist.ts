/**
 * File-backed persistence for the relay's registrations and outbox cursors.
 *
 * Everything lives in one JSON file (NOTIFICATIONS_DATA_FILE). Each store owns
 * a named section; a change rewrites the whole file through a temp file and a
 * rename, so a crash mid-write never leaves a torn file. The data is small
 * (device tokens, browser subscriptions, two cursors), so a synchronous write
 * per change is fine.
 *
 * With NOTIFICATIONS_DATA_FILE unset (tests, local dev) state is memory-only.
 * server.ts refuses to start in production without it.
 */
import fs   from "fs";
import path from "path";

type Sections = Record<string, unknown>;

let cache: Sections | null = null;

function dataFile(): string | null {
  return process.env.NOTIFICATIONS_DATA_FILE || null;
}

function load(): Sections {
  if (cache) return cache;
  const file = dataFile();
  cache = {};
  if (file && fs.existsSync(file)) {
    try {
      cache = JSON.parse(fs.readFileSync(file, "utf8")) as Sections;
    } catch (err) {
      // Keep the unreadable file for inspection rather than overwriting it.
      const aside = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, aside);
      console.error(`[persist] could not parse ${file}; moved it to ${aside}:`, err);
    }
  }
  return cache;
}

export function loadSection<T>(name: string, fallback: T): T {
  const s = load();
  return name in s ? (s[name] as T) : fallback;
}

export function saveSection(name: string, value: unknown): void {
  const s = load();
  s[name] = value;
  const file = dataFile();
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
