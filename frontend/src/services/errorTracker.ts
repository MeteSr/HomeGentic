/**
 * errorTracker — lightweight client-side error tracking (HomeGentic internal).
 *
 * Captures:
 *   - React render errors (via ErrorBoundary calling captureError)
 *   - Unhandled promise rejections (window "unhandledrejection" event)
 *   - Uncaught synchronous exceptions (window "error" event)
 *   - Click breadcrumbs (document-level capture, excludes form fields)
 *   - Console breadcrumbs (console.error / console.warn → ring buffer)
 *   - Navigation breadcrumbs (call trackNavigation on route changes)
 *
 * Every report is enriched with:
 *   - Last ≤25 breadcrumbs so we know what the user was doing before the crash
 *   - ICP principal and subscription tier (from authStore)
 *   - Browser user-agent and current URL
 *   - App release (VITE_APP_VERSION env var if set)
 *
 * Guardrails:
 *   - Rate-limited to 25 errors per browser session (reset on reload)
 *   - Identical errors are deduplicated within a 60-second window
 *   - In development: logs to console.debug only — nothing is sent over the wire
 *   - init() is idempotent — safe to call multiple times
 */

import { useAuthStore } from "@/store/authStore";

const AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";
const RELEASE   = (import.meta as any).env?.VITE_APP_VERSION as string | undefined;

const MAX_BREADCRUMBS  = 25;
const MAX_ERRORS       = 25;   // per session (prevents runaway reporting)
const DEDUP_WINDOW_MS  = 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type BreadcrumbType = "navigation" | "click" | "console" | "custom";
export type ErrorLevel     = "debug" | "info" | "warning" | "error" | "fatal";

export interface Breadcrumb {
  type:    BreadcrumbType;
  message: string;
  data?:   Record<string, unknown>;
  ts:      number; // unix ms
}

interface TrackerContext {
  principal?: string;
  tier?:      string;
}

export interface ErrorReport {
  level:           ErrorLevel;
  message:         string;
  errorType?:      string;
  stack?:          string;
  componentStack?: string;
  url:             string;
  ts:              string;
  principal:       string;
  tier?:           string;
  release?:        string;
  userAgent:       string;
  breadcrumbs:     Breadcrumb[];
  tags?:           Record<string, string>;
}

// ── Tracker ───────────────────────────────────────────────────────────────────

class ErrorTracker {
  private breadcrumbs:   Breadcrumb[]         = [];
  private context:       TrackerContext        = {};
  private errorCount:    number                = 0;
  private recentFprints: Map<string, number>   = new Map(); // fingerprint → last-sent ms
  private initialized = false;

  // ── public API ──────────────────────────────────────────────────────────────

  /**
   * Call once at app startup (main.tsx). Installs global handlers.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this._installGlobalHandlers();
    this._installClickCapture();
    this._installConsoleCapture();
  }

  /**
   * Update the user context. Call whenever auth state changes so every
   * subsequent error report is attributed to the right principal/tier.
   */
  setContext(ctx: Partial<TrackerContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  /**
   * Append a breadcrumb to the ring buffer (capped at MAX_BREADCRUMBS).
   * Use this for manual "user did X" annotations in business-critical paths.
   */
  addBreadcrumb(bc: Omit<Breadcrumb, "ts">): void {
    this.breadcrumbs.push({ ...bc, ts: Date.now() });
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) this.breadcrumbs.shift();
  }

  /**
   * Record a navigation event as a breadcrumb.
   * Call from App.tsx whenever the React Router location changes.
   */
  trackNavigation(pathname: string): void {
    this.addBreadcrumb({ type: "navigation", message: pathname });
  }

  /**
   * Capture an error and ship it to /api/errors.
   * Deduplication and rate-limiting are applied transparently.
   * Never throws — safe to call anywhere, including inside catch blocks.
   */
  captureError(
    error:   Error | string,
    options: {
      level?:          ErrorLevel;
      componentStack?: string;
      source?:         string;
    } = {},
  ): void {
    try {
      const { level = "error", componentStack, source } = options;
      const message   = typeof error === "string" ? error : (error.message || String(error));
      const stack     = typeof error === "string" ? undefined : error.stack;
      const errorType = typeof error === "string" ? "Error" : (error.constructor?.name ?? "Error");

      // ── rate limit ──────────────────────────────────────────────────────────
      if (this.errorCount >= MAX_ERRORS) return;

      // ── deduplication ───────────────────────────────────────────────────────
      const fp       = this._fingerprint(message, stack);
      const lastSent = this.recentFprints.get(fp) ?? 0;
      if (Date.now() - lastSent < DEDUP_WINDOW_MS) return;
      this.recentFprints.set(fp, Date.now());
      this.errorCount++;

      // ── dev: surface locally, don't send ────────────────────────────────────
      if (!import.meta.env.PROD) {
        console.debug(
          `[errorTracker] ${level} (${source ?? "manual"}):`,
          message,
          componentStack ? "\n" + componentStack : "",
        );
        return;
      }

      // ── build report ────────────────────────────────────────────────────────
      const report: ErrorReport = {
        level,
        message,
        errorType,
        stack,
        componentStack,
        url:         window.location.href,
        ts:          new Date().toISOString(),
        principal:   this.context.principal ?? useAuthStore.getState().principal ?? "anon",
        tier:        this.context.tier ?? (useAuthStore.getState().tier ?? undefined),
        release:     RELEASE,
        userAgent:   navigator.userAgent,
        breadcrumbs: [...this.breadcrumbs],
        tags:        { source: source ?? "manual" },
      };

      void this._send(report);
    } catch {
      // The tracker must never crash the app.
    }
  }

  // ── private ─────────────────────────────────────────────────────────────────

  /** Fingerprint = trimmed message + first app-owned stack frame. */
  private _fingerprint(message: string, stack?: string): string {
    const ownFrame = stack?.split("\n").find((l) => l.includes("/src/")) ?? "";
    return `${message.slice(0, 100)}::${ownFrame.trim().slice(0, 100)}`;
  }

  private _installGlobalHandlers(): void {
    // Unhandled promise rejections — the most common silent failure mode.
    window.addEventListener("unhandledrejection", (event) => {
      const reason  = event.reason;
      const asError = reason instanceof Error
        ? reason
        : new Error(String(reason ?? "Unhandled Promise Rejection"));
      this.captureError(asError, { level: "error", source: "unhandledrejection" });
    });

    // Uncaught synchronous exceptions that escape React's boundary.
    // Ignore resource-load errors (img/script onerror) which have event.error = null.
    window.addEventListener("error", (event) => {
      if (!event.error) return;
      this.captureError(event.error as Error, { level: "fatal", source: "window.onerror" });
    });
  }

  private _installClickCapture(): void {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const tag = target.tagName?.toLowerCase() ?? "";
        // Skip form fields — never capture what the user typed.
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        const id   = target.id ? `#${target.id}` : "";
        const role = target.getAttribute?.("role") ?? "";
        const text = target.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "";
        this.addBreadcrumb({
          type:    "click",
          message: `${tag}${id}${role ? `[role=${role}]` : ""}`,
          data:    text ? { text } : undefined,
        });
      },
      { passive: true, capture: true },
    );
  }

  private _installConsoleCapture(): void {
    // Intercept console.error / console.warn to record them as breadcrumbs.
    // The originals are called first so DevTools output is unchanged.
    const origError = console.error.bind(console);
    const origWarn  = console.warn.bind(console);

    console.error = (...args: unknown[]) => {
      origError(...args);
      const msg = args
        .map((a) => typeof a === "string" ? a : a instanceof Error ? a.message : "")
        .filter(Boolean).join(" ").slice(0, 120);
      if (msg) this.addBreadcrumb({ type: "console", message: `[error] ${msg}`, data: { level: "error" } });
    };

    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      const msg = args
        .map((a) => typeof a === "string" ? a : "")
        .filter(Boolean).join(" ").slice(0, 120);
      if (msg) this.addBreadcrumb({ type: "console", message: `[warn] ${msg}`, data: { level: "warn" } });
    };
  }

  private async _send(report: ErrorReport): Promise<void> {
    try {
      const { voiceAgentHeaders } = await import("./voiceAgentHeaders");
      await fetch(`${AGENT_URL}/api/errors`, {
        method:    "POST",
        headers:   voiceAgentHeaders(),
        body:      JSON.stringify(report),
        signal:    AbortSignal.timeout(4_000),
        keepalive: true,
      });
    } catch {
      // Intentionally silent — error reporting must never cause secondary errors.
    }
  }
}

export const errorTracker = new ErrorTracker();
