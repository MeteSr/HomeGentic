import { create } from "zustand";
import { UserProfile } from "@/services/auth";

interface AuthState {
  isAuthenticated: boolean;
  principal: string | null;
  profile: UserProfile | null;
  isLoading: boolean;
  setAuthenticated: (principal: string) => void;
  setProfile: (profile: UserProfile) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  principal: null,
  profile: null,
  isLoading: true,
  setAuthenticated: (principal) => set({ isAuthenticated: true, principal }),
  setProfile: (profile) => set({ profile }),
  clearAuth: () => set({ isAuthenticated: false, principal: null, profile: null }),
  setLoading: (isLoading) => set({ isLoading }),
}));
