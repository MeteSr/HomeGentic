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

async function homeownerDestination(): Promise<string> {
  try {
    const props = await propertyService.getMyProperties();
    if (props.length === 1) return `/properties/${props[0].id}`;
  } catch { /* fall through to dashboard */ }
  return "/dashboard";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setAuthenticated, setProfile, setLastLoginAt, clearAuth, setLoading } = useAuthStore();

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
        isActive:     e2eProfile?.isActive    ?? true,
        lastLoggedIn: e2eProfile?.lastLoggedIn ?? null,
      });
      setLastLoginAt(null);
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
        } catch {
          // Not registered yet
        }
      }
      setLoading(false);
    });
  }, []);

  const login = async () => {
    await iiLogin();
    const principal = await getPrincipal();
    setAuthenticated(principal);
    try {
      const profile = await authService.getProfile();
      setLastLoginAt(profile.lastLoggedIn);
      setProfile(profile);
      authService.recordLogin().catch((err) => console.error("[AuthContext] recordLogin failed:", err));
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
          const { tier, billing } = JSON.parse(pending);
          navigate(`/checkout?tier=${tier}&billing=${billing}`);
        } else {
          navigate(await homeownerDestination());
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
          const { tier, billing } = JSON.parse(pending);
          navigate(`/checkout?tier=${tier}&billing=${billing}`);
        } else {
          navigate(await homeownerDestination());
        }
      }
    } catch {
      navigate("/register");
    }
  };

  const logout = async () => {
    await iiLogout();
    navigate("/");   // navigate before clearing so ProtectedRoute doesn't race-redirect to /login
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
