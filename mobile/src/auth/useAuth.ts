import { useState, useEffect, useCallback } from "react";
import { AppState } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { DelegationChain, DelegationIdentity } from "@icp-sdk/core/identity";
import { HttpAgent } from "@icp-sdk/core/agent";
import { buildIIAuthUrl, parseAuthCallback, isDelegationExpired, delegationExpiryMs, delegationTargetsKey, REDIRECT_URI } from "./authUtils";
import { saveAuth, loadAuth, clearAuth, StoredAuth } from "./authStorage";
import { authenticateWithBiometrics } from "./biometricService";
import { getProfile, UserProfile } from "../services/authService";
import { clearIcpAgent, setIcpAgent } from "../services/icpAgent";

export type AuthState =
  /** Signed out. `notice` explains why when the app signed the user out itself. */
  | { status: "idle"; notice?: string }
  | { status: "loading" }
  /** A saved session exists but Face ID / fingerprint was cancelled or failed. */
  | { status: "locked" }
  | { status: "authenticated"; principal: string; profile: UserProfile | null; identity: DelegationIdentity; agent: HttpAgent; expiresAt: number }
  | { status: "error"; message: string };

/** Sign out this long before the delegation runs out, so no call fails half-way. */
const EXPIRY_MARGIN_MS = 60_000;
export const SESSION_EXPIRED_NOTICE = "Your session ended. Sign in again to keep going.";

/**
 * Session keypair for the login in progress / the restored session. A fresh
 * key is generated for every login and persisted in SecureStore with the
 * delegation chain (see authStorage), so a restored chain is paired with the
 * key it actually delegates to.
 */
let _sessionIdentity: Ed25519KeyIdentity | null = null;

function newSessionIdentity(): Ed25519KeyIdentity {
  _sessionIdentity = Ed25519KeyIdentity.generate();
  return _sessionIdentity;
}

function sessionPublicKeyHex(identity: Ed25519KeyIdentity): string {
  const raw = identity.getPublicKey().toDer();
  // No Buffer in React Native (Hermes), so hex-encode by hand.
  return Array.from(new Uint8Array(raw), (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildIdentityFromStored(
  sessionIdentity: Ed25519KeyIdentity,
  stored: StoredAuth,
): DelegationIdentity {
  if (!delegationTargetsKey(stored.delegationChainJSON, sessionPublicKeyHex(sessionIdentity))) {
    throw new Error("Delegation does not target this device's session key");
  }
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
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });

  // On mount: try to restore session from secure store
  useEffect(() => {
    restoreSession();
  }, []);

  const expire = useCallback(async () => {
    _sessionIdentity = null;
    clearIcpAgent();
    await clearAuth().catch(() => {});
    setAuthState({ status: "idle", notice: SESSION_EXPIRED_NOTICE });
  }, []);

  // Sign out when the delegation runs out: a timer while the app is open, and
  // a check on return to the foreground (timers don't run in the background).
  useEffect(() => {
    if (authState.status !== "authenticated") return;
    const { expiresAt } = authState;
    const check = () => {
      if (Date.now() >= expiresAt - EXPIRY_MARGIN_MS) expire();
    };
    const timer = setTimeout(check, Math.max(0, Math.min(expiresAt - EXPIRY_MARGIN_MS - Date.now(), 2_147_000_000)));
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [authState, expire]);

  async function restoreSession() {
    setAuthState({ status: "loading" });
    try {
      const stored = await loadAuth();
      if (!stored) {
        setAuthState({ status: "idle" });
        return;
      }
      if (isDelegationExpired(stored.delegationChainJSON, Date.now(), EXPIRY_MARGIN_MS)) {
        await clearAuth().catch(() => {});
        setAuthState({ status: "idle", notice: SESSION_EXPIRED_NOTICE });
        return;
      }

      // 15.2.3 — Biometric gate: prompt Face ID / fingerprint (or the device
      // passcode) before restoring the session. Devices without biometrics
      // enrolled skip the gate.
      const biometric = await authenticateWithBiometrics();
      if (!biometric.success && biometric.reason !== "unavailable") {
        // Keep the stored delegation so "Unlock" can try again without a full sign-in.
        setAuthState({ status: "locked" });
        return;
      }

      await finishSignIn(stored, Ed25519KeyIdentity.fromJSON(stored.sessionKeyJSON));
    } catch {
      setAuthState({ status: "idle" });
    }
  }

  /** Builds the agent for a validated stored session and marks the user signed in. */
  async function finishSignIn(stored: StoredAuth, sessionIdentity: Ed25519KeyIdentity) {
    _sessionIdentity = sessionIdentity;
    const identity = buildIdentityFromStored(sessionIdentity, stored);
    const agent = buildAgent(identity);
    setIcpAgent(agent);
    const principal = identity.getPrincipal().toText();
    const profile = await getProfile(agent).catch(() => null);
    const expiresAt = delegationExpiryMs(stored.delegationChainJSON) ?? Date.now();
    setAuthState({ status: "authenticated", principal, profile, identity, agent, expiresAt });
  }

  /** Retries the biometric prompt for a saved session ("locked" state). */
  const unlock = useCallback(() => restoreSession(), []);

  const login = useCallback(async () => {
    setAuthState({ status: "loading" });
    try {
      const sessionIdentity = newSessionIdentity();
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

      if (!resolved) {
        resolved = true;
        subscription.remove();
        // iOS (ASWebAuthenticationSession) hands the redirect back here rather
        // than as a Linking event.
        if (result.type === "success" && result.url.startsWith(REDIRECT_URI)) {
          await handleCallback(result.url, sessionIdentity);
        } else {
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
        sessionKeyJSON: JSON.stringify(sessionIdentity.toJSON()),
      };
      // Validate (incl. the delegation-target check) before persisting.
      buildIdentityFromStored(sessionIdentity, stored);
      if (isDelegationExpired(stored.delegationChainJSON, Date.now(), EXPIRY_MARGIN_MS)) {
        throw new Error("That sign-in had already expired. Please try again.");
      }
      await saveAuth(stored);
      await finishSignIn(stored, sessionIdentity);
    } catch (err: any) {
      setAuthState({ status: "error", message: err?.message ?? "Failed to restore identity" });
    }
  }

  const logout = useCallback(async () => {
    _sessionIdentity = null;
    clearIcpAgent();
    await clearAuth().catch(() => {});
    setAuthState({ status: "idle" });
  }, []);

  return { authState, login, logout, unlock };
}
