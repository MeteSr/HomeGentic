import React, { createContext, useContext, ReactNode } from "react";
import { useAuth, AuthState } from "./useAuth";

interface AuthContextValue {
  authState: AuthState;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Retries Face ID / fingerprint for a saved session. */
  unlock: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}
