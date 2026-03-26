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

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setAuthenticated, setProfile, setLastLoginAt, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    // E2E test bypass: Playwright sets window.__e2e_principal before React boots.
    // Only active in development builds; stripped from production by Vite.
    if (import.meta.env.DEV && (window as any).__e2e_principal) {
      setAuthenticated((window as any).__e2e_principal);
      setProfile({
        principal:    (window as any).__e2e_principal,
        role:         "Homeowner",
        email:        "e2e@test.com",
        phone:        "0000000000",
        createdAt:    BigInt(0),
        updatedAt:    BigInt(0),
        isActive:     true,
        lastLoggedIn: null,
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
          authService.recordLogin().catch(() => {}); // fire-and-forget
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
      authService.recordLogin().catch(() => {});
      if (profile.role === "Contractor") {
        navigate("/contractor-dashboard");
      } else {
        navigate("/dashboard");
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
      authService.recordLogin().catch(() => {});
      if (profile.role === "Contractor") {
        navigate("/contractor-dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch {
      navigate("/register");
    }
  };

  const logout = async () => {
    await iiLogout();
    clearAuth();
    navigate("/");
  };

  return (
    <AuthContext.Provider value={{ login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
