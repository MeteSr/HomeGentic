import { create } from "zustand";
import { UserProfile } from "@/services/auth";

interface AuthState {
  isAuthenticated: boolean;
  principal: string | null;
  profile: UserProfile | null;
  isLoading: boolean;
  lastLoginAt: number | null;   // ms timestamp of the *previous* session
  setAuthenticated: (principal: string) => void;
  setProfile: (profile: UserProfile) => void;
  setLastLoginAt: (v: number | null) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  principal: null,
  profile: null,
  isLoading: true,
  lastLoginAt: null,
  setAuthenticated: (principal) => {
    if (!principal) throw new Error("setAuthenticated: principal must be a non-empty string");
    set({ isAuthenticated: true, principal });
  },
  setProfile: (profile) => set({ profile }),
  setLastLoginAt: (lastLoginAt) => set({ lastLoginAt }),
  clearAuth: () => set({ isAuthenticated: false, principal: null, profile: null, lastLoginAt: null }),
  setLoading: (isLoading) => set({ isLoading }),
}));
