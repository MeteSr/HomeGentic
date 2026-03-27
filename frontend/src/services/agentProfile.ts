/**
 * Agent (Realtor) branding profile — stored in localStorage until
 * a dedicated `agent` canister is built (backlog 6.4.2).
 *
 * Fields are injected into HomeFax share links as query params so that
 * the report viewer can render the co-branded header.
 */

export interface AgentProfile {
  name:      string;
  brokerage: string;
  phone:     string;
  logoUrl:   string;
}

const STORAGE_KEY = "homefax_agent_profile";

export const agentProfileService = {
  load(): AgentProfile | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AgentProfile) : null;
    } catch {
      return null;
    }
  },

  save(profile: AgentProfile): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  /**
   * Appends agent branding params to an existing share URL.
   * Only includes non-empty fields.
   */
  appendToUrl(url: string, profile: AgentProfile): string {
    const u = new URL(url, window.location.origin);
    if (profile.name)      u.searchParams.set("an",  profile.name);
    if (profile.brokerage) u.searchParams.set("ab",  profile.brokerage);
    if (profile.phone)     u.searchParams.set("aph", profile.phone);
    if (profile.logoUrl)   u.searchParams.set("al",  profile.logoUrl);
    return u.toString();
  },

  /** Parse agent branding from a report URL's search params. */
  fromParams(params: URLSearchParams): AgentProfile | null {
    const name = params.get("an") ?? "";
    if (!name) return null;
    return {
      name,
      brokerage: params.get("ab")  ?? "",
      phone:     params.get("aph") ?? "",
      logoUrl:   params.get("al")  ?? "",
    };
  },
};
