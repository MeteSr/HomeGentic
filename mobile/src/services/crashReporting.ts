/**
 * Crash reporting (Sentry). Off unless the build sets EXPO_PUBLIC_SENTRY_DSN,
 * and always off in development. No PII: Sentry's default user/IP capture is
 * disabled, and bearer tokens in report / invite / claim links are redacted
 * from every event before it leaves the device.
 */
import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function crashReportingEnabled(dsn: string = DSN, dev: boolean = __DEV__): boolean {
  return dsn.length > 0 && !dev;
}

// Path segments that follow these words are credentials (share links,
// contractor invites, transfer claims), so they never go to Sentry.
const TOKEN_PATH = /\b(report|verify|cert|badge|claim|auth)\/[^/?#\s"']+/g;
const TOKEN_QUERY = /([?&](?:token|ticket|code|state|session)=)[^&#\s"']+/gi;

export function redact(text: string): string {
  return text.replace(TOKEN_PATH, "$1/[redacted]").replace(TOKEN_QUERY, "$1[redacted]");
}

function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out as T;
  }
  return value;
}

/** Strips the user and redacts tokens; exported for tests. */
export function scrubEvent<E extends { user?: unknown }>(event: E): E {
  const clean = redactDeep({ ...event });
  delete clean.user;
  return clean;
}

export function initCrashReporting(): void {
  if (!crashReportingEnabled()) return;
  Sentry.init({
    dsn: DSN,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => redactDeep(crumb),
  });
}

/** Records a caught error (e.g. from the ErrorBoundary). No-op when off. */
export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (!crashReportingEnabled()) return;
  Sentry.captureException(error, extra ? { extra: redactDeep(extra) } : undefined);
}

/** Wraps the root component so native crashes and touch breadcrumbs are captured. */
export function withCrashReporting(Root: ComponentType<Record<string, unknown>>): ComponentType<Record<string, unknown>> {
  return crashReportingEnabled() ? Sentry.wrap(Root) : Root;
}
