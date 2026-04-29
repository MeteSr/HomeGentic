import React, { createContext, useContext, useEffect, ReactNode } from "react";
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
  if (!profile.onboardingComplete) return "/onboarding";
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
    try {
      const profile = await authService.getProfile();
      setLastLoginAt(profile.lastLoggedIn);
      setProfile(profile);
      authService.recordLogin().catch((err) => console.error("[AuthContext] recordLogin failed:", err));
      paymentService.getMySubscription().then((sub) => setTier(sub.tier)).catch((e) => console.error("[AuthContext] subscription fetch failed:", e)); // fire-and-forget; tier stays null until resolved
      if (profile.role === "Contractor") {
        navigate("/contractor-dashboard");
      } else {
        // pendingVerification: user paid before logging in — return them to the
        // success page so verification runs with their real principal.
        const pendingVerification = sessionStorage.getItem("pendingVerification");
        if (pendingVerification) {
          sessionStorage.removeItem("pendingVerification");
          navigate(pendingVerification);
          return;
        }
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
      navigate("/register");
    }
  };

  const devLogin = async () => {
    const principal = await loginWithLocalIdentity();
    setAuthenticated(principal);
    try {
      const profile = await authService.getProfile();
      setLastLoginAt(profile.lastLoggedIn);
      setProfile(profile);
      authService.recordLogin().catch((err) => console.error("[AuthContext] recordLogin failed:", err));
      paymentService.getMySubscription().then((sub) => setTier(sub.tier)).catch((e) => console.error("[AuthContext] subscription fetch failed:", e)); // fire-and-forget; tier stays null until resolved
      if (profile.role === "Contractor") {
        navigate("/contractor-dashboard");
      } else {
        // pendingVerification: user paid before logging in — return them to the
        // success page so verification runs with their real principal.
        const pendingVerification = sessionStorage.getItem("pendingVerification");
        if (pendingVerification) {
          sessionStorage.removeItem("pendingVerification");
          navigate(pendingVerification);
          return;
        }
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
      // No profile yet (new user) — send to onboarding to create one
      navigate("/onboarding");
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
