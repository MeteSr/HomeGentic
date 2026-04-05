import { useState, useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { DelegationChain, DelegationIdentity } from "@dfinity/identity";
import { HttpAgent } from "@dfinity/agent";
import { buildIIAuthUrl, parseAuthCallback, isDelegationExpired, REDIRECT_URI } from "./authUtils";
import { saveAuth, loadAuth, clearAuth, StoredAuth } from "./authStorage";
import { getProfile, UserProfile } from "../services/authService";

export type AuthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authenticated"; principal: string; profile: UserProfile | null; identity: DelegationIdentity; agent: HttpAgent }
  | { status: "error"; message: string };

/** Session keypair persisted in memory for the current app lifecycle */
let _sessionIdentity: Ed25519KeyIdentity | null = null;

function getOrCreateSessionIdentity(): Ed25519KeyIdentity {
  if (!_sessionIdentity) {
    _sessionIdentity = Ed25519KeyIdentity.generate();
  }
  return _sessionIdentity;
}

function sessionPublicKeyHex(identity: Ed25519KeyIdentity): string {
  const raw = identity.getPublicKey().toDer();
  return Buffer.from(raw).toString("hex");
}

function buildIdentityFromStored(
  sessionIdentity: Ed25519KeyIdentity,
  stored: StoredAuth,
): DelegationIdentity {
  const chain = DelegationChain.fromJSON(JSON.parse(stored.delegationChainJSON));
  return DelegationIdentity.fromDelegation(sessionIdentity, chain);
}

function buildAgent(identity: DelegationIdentity): HttpAgent {
  return new HttpAgent({
    identity,
    host: process.env.EXPO_PUBLIC_ICP_HOST ?? "https://ic0.app",
  });
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({ status: "idle" });

  // On mount: try to restore session from secure store
  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    setAuthState({ status: "loading" });
    try {
      const stored = await loadAuth();
      if (!stored || isDelegationExpired(stored.delegationChainJSON)) {
        setAuthState({ status: "idle" });
        return;
      }
      const sessionIdentity = getOrCreateSessionIdentity();
      const identity = buildIdentityFromStored(sessionIdentity, stored);
      const agent = buildAgent(identity);
      const principal = identity.getPrincipal().toText();
      const profile = await getProfile(agent).catch(() => null);
      setAuthState({ status: "authenticated", principal, profile, identity, agent });
    } catch {
      setAuthState({ status: "idle" });
    }
  }

  const login = useCallback(async () => {
    setAuthState({ status: "loading" });
    try {
      const sessionIdentity = getOrCreateSessionIdentity();
      const pubkeyHex = sessionPublicKeyHex(sessionIdentity);
      const authUrl = buildIIAuthUrl(pubkeyHex);

      // Set up deep-link listener BEFORE opening the browser
      let resolved = false;
      const subscription = Linking.addEventListener("url", async ({ url }) => {
        if (resolved || !url.startsWith(REDIRECT_URI)) return;
        resolved = true;
        subscription.remove();
        WebBrowser.dismissBrowser();
        handleCallback(url, sessionIdentity);
      });

      const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

      // If the browser was dismissed without a callback (user cancelled)
      if (!resolved) {
        subscription.remove();
        if (result.type === "cancel" || result.type === "dismiss") {
          setAuthState({ status: "idle" });
        }
      }
    } catch (err: any) {
      setAuthState({ status: "error", message: err?.message ?? "Login failed" });
    }
  }, []);

  async function handleCallback(url: string, sessionIdentity: Ed25519KeyIdentity) {
    const parsed = parseAuthCallback(url);
    if (!parsed) {
      setAuthState({ status: "error", message: "Invalid auth callback — please try again" });
      return;
    }
    try {
      const stored: StoredAuth = {
        delegationChainJSON: parsed.delegationChainJSON,
        userPublicKey: parsed.userPublicKey,
      };
      await saveAuth(stored);
      const identity = buildIdentityFromStored(sessionIdentity, stored);
      const agent = buildAgent(identity);
      const principal = identity.getPrincipal().toText();
      const profile = await getProfile(agent).catch(() => null);
      setAuthState({ status: "authenticated", principal, profile, identity, agent });
    } catch (err: any) {
      setAuthState({ status: "error", message: err?.message ?? "Failed to restore identity" });
    }
  }

  const logout = useCallback(async () => {
    _sessionIdentity = null;
    await clearAuth();
    setAuthState({ status: "idle" });
  }, []);

  return { authState, login, logout };
}
