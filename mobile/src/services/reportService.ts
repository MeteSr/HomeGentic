export const HOMEGENTIC_WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://homegentic.app";

export function buildReportUrl(token: string): string {
  return `${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}/report/${token}`;
}
