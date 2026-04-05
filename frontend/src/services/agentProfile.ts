/**
 * Agent (Realtor) branding profile — stored in localStorage until
 * a dedicated `agent` canister is built (backlog 6.4.2).
 *
 * Fields are injected into HomeGentic share links as query params so that
 * the report viewer can render the co-branded header.
 */

export interface AgentProfile {
  name:      string;
  brokerage: string;
  phone:     string;
  logoUrl:   string;
}

function sanitizeAgentProfile(profile: AgentProfile): AgentProfile {
  const name = profile.name?.trim() ?? "";
  const brokerage = profile.brokerage?.trim() ?? "";
  const phone = profile.phone?.trim() ?? "";
  let logoUrl = profile.logoUrl?.trim() ?? "";

  if (logoUrl) {
    try {
      const parsed = new URL(logoUrl, window.location.origin);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol !== "http:" && protocol !== "https:") {
        logoUrl = "";
      } else {
        logoUrl = parsed.toString();
      }
    } catch {
      // Invalid URL; clear it to avoid using an unsafe value.
      logoUrl = "";
    }
  }

  return { name, brokerage, phone, logoUrl };
}

const STORAGE_KEY = "homegentic_agent_profile";

export const agentProfileService = {
  load(): AgentProfile | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AgentProfile;
      return sanitizeAgentProfile(parsed);
    } catch {
      return null;
    }
  },

  save(profile: AgentProfile): void {
    const sanitized = sanitizeAgentProfile(profile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  /**
   * Appends agent branding params to an existing share URL.
   * Only includes non-empty fields.
   */
  appendToUrl(url: string, profile: AgentProfile): string {
    const safeProfile = sanitizeAgentProfile(profile);
    const u = new URL(url, window.location.origin);
    if (safeProfile.name)      u.searchParams.set("an",  safeProfile.name);
    if (safeProfile.brokerage) u.searchParams.set("ab",  safeProfile.brokerage);
    if (safeProfile.phone)     u.searchParams.set("aph", safeProfile.phone);
    if (safeProfile.logoUrl)   u.searchParams.set("al",  safeProfile.logoUrl);
    return u.toString();
  },

  /** Parse agent branding from a report URL's search params. */
  fromParams(params: URLSearchParams): AgentProfile | null {
    const name = params.get("an") ?? "";
    if (!name) return null;
    const profile: AgentProfile = {
      name,
      brokerage: params.get("ab")  ?? "",
      phone:     params.get("aph") ?? "",
      logoUrl:   params.get("al")  ?? "",
    };
    return sanitizeAgentProfile(profile);
  },
};
