import { createContext, useContext, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  login as iiLogin,
  logout as iiLogout,
  isAuthenticated,
  getPrincipal,
  loginWithLocalIdentity,
} from "@/services/actor";
import { authService } from "@/services/auth";
import { paymentService } from "@/services/payment";
import { propertyService } from "@/services/property";
import { clearAgentSession } from "@/services/agentSession";
import { takeReturnPath, hasReturnPath } from "@/utils/returnPath";
import { disablePush } from "@/services/pushNotifications";

// Per-user data the app caches in localStorage (AI action history, score
// history, system ages, dismissed prompts, consents...). Cleared on logout so
// the next person on a shared device doesn't see it. Theme preference is kept.
const USER_STORAGE_PREFIXES = ["homegentic_", "hg_", "hf_", "pulse_"];

function clearUserLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (/theme/i.test(k)) continue;
      if (USER_STORAGE_PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    // storage unavailable — nothing to clear
  }
}

interface AuthContextValue {
  login: () => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  login: async () => {},
  devLogin: async () => {},
  logout: async () => {},
});

async function homeownerDestination(profile: import("@/services/auth").UserProfile): Promise<string> {
  if (!profile.onboardingComplete) return "/dashboard";
  try {
    const props = await propertyService.getMyProperties();
    if (props.length === 1) return `/properties/${props[0].id}`;
  } catch { /* fall through to dashboard */ }
  return "/dashboard";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setAuthenticated, setProfile, setLastLoginAt, setTier, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    // E2E test bypass: Playwright sets window.__e2e_principal before React boots.
    // Only active in development builds; stripped from production by Vite.
    if (import.meta.env.DEV && (window as any).__e2e_principal) {
      setAuthenticated((window as any).__e2e_principal);
      const e2eProfile = (window as any).__e2e_profile;
      setProfile({
        principal:    (window as any).__e2e_principal,
        role:         e2eProfile?.role        ?? "Homeowner",
        email:        e2eProfile?.email       ?? "e2e@test.com",
        phone:        e2eProfile?.phone       ?? "0000000000",
        createdAt:    e2eProfile?.createdAt   ?? BigInt(0),
        updatedAt:    e2eProfile?.updatedAt   ?? BigInt(0),
        isActive:           e2eProfile?.isActive            ?? true,
        lastLoggedIn:       e2eProfile?.lastLoggedIn        ?? null,
        onboardingComplete: e2eProfile?.onboardingComplete  ?? false,
      });
      setLastLoginAt(null);
      const e2eSub = (window as any).__e2e_subscription;
      if (e2eSub?.tier) setTier(e2eSub.tier);
      setLoading(false);
      return;
    }

    isAuthenticated().then(async (auth) => {
      if (auth) {
        const principal = await getPrincipal();
        setAuthenticated(principal);
        try {
          const profile = await authService.getProfile();
          setLastLoginAt(profile.lastLoggedIn);   // capture previous session timestamp
          setProfile(profile);
          authService.recordLogin().catch((err) => console.error("[AuthContext] recordLogin failed:", err)); // fire-and-forget
          paymentService.getMySubscription().then((sub) => setTier(sub.tier)).catch((e) => console.error("[AuthContext] subscription fetch failed:", e)); // fire-and-forget; tier stays null until resolved
        } catch {
          // Not registered yet
        }
      }
      setLoading(false);
    });
  }, []);

  const login = async () => {
    try {
      await iiLogin();
    } catch (err) {
      console.error("[auth] II login failed:", err);
      return;
    }
    const principal = await getPrincipal();
    setAuthenticated(principal);
    paymentService.getMySubscription().then((sub) => setTier(sub.tier)).catch((e) => console.error("[AuthContext] subscription fetch failed:", e));
    try {
      const profile = await authService.getProfile();
      setLastLoginAt(profile.lastLoggedIn);
      setProfile(profile);
      authService.recordLogin().catch((err) => console.error("[AuthContext] recordLogin failed:", err));
      // Back to the page they signed in from (a payment success, gift or
      // manager invite), whatever their role.
      const back = takeReturnPath();
      if (back) {
        navigate(back);
        return;
      }
      if (profile.role === "Contractor") {
        navigate("/contractor-dashboard");
      } else {
        const pending = sessionStorage.getItem("pendingCheckout");
        if (pending) {
          sessionStorage.removeItem("pendingCheckout");
          try {
            const { tier, billing } = JSON.parse(pending);
            if (typeof tier === "string" && typeof billing === "string") {
              navigate(`/checkout?tier=${tier}&billing=${billing}`);
              return;
            }
          } catch {
            // Malformed session data — fall through to normal destination
          }
          navigate(await homeownerDestination(profile));
        } else {
          navigate(await homeownerDestination(profile));
        }
      }
    } catch {
      // No profile yet: register first; RegisterPage then returns them to
      // any page they signed in from.
      navigate("/register");
    }
  };

  const devLogin = async () => {
    const principal = await loginWithLocalIdentity();
    setAuthenticated(principal);
    paymentService.getMySubscription().then((sub) => setTier(sub.tier)).catch((e) => console.error("[AuthContext] subscription fetch failed:", e));
    try {
      const profile = await authService.getProfile();
      setLastLoginAt(profile.lastLoggedIn);
      setProfile(profile);
      authService.recordLogin().catch((err) => console.error("[AuthContext] recordLogin failed:", err));
      // Back to the page they signed in from (a payment success, gift or
      // manager invite), whatever their role.
      const back = takeReturnPath();
      if (back) {
        navigate(back);
        return;
      }
      if (profile.role === "Contractor") {
        navigate("/contractor-dashboard");
      } else {
        const pending = sessionStorage.getItem("pendingCheckout");
        if (pending) {
          sessionStorage.removeItem("pendingCheckout");
          try {
            const { tier, billing } = JSON.parse(pending);
            if (typeof tier === "string" && typeof billing === "string") {
              navigate(`/checkout?tier=${tier}&billing=${billing}`);
              return;
            }
          } catch {
            // Malformed session data — fall through to normal destination
          }
          navigate(await homeownerDestination(profile));
        } else {
          navigate(await homeownerDestination(profile));
        }
      }
    } catch {
      // No profile yet (new user). Signing in from a gift or invite link:
      // register first, and RegisterPage returns them to it. Otherwise the
      // dashboard, where the setup modal opens.
      navigate(hasReturnPath() ? "/register" : "/dashboard");
    }
  };

  const logout = async () => {
    try {
      await iiLogout();
    } catch {
      // II logout may fail when the user authenticated via devLogin (bypasses
      // AuthClient) or when the identity provider is unreachable. Clear local
      // state regardless so the button always works.
    } finally {
      navigate("/");   // navigate before clearing so ProtectedRoute doesn't race-redirect to /login
      // Stop this browser receiving the signed-out user's pushes. Best effort.
      void disablePush().catch(() => {});
      clearAgentSession();
      clearUserLocalStorage();
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider value={{ login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
