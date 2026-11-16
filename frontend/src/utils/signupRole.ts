/**
 * The role a sign-up button chose (the landing page's buttons choose
 * Homeowner, For Pros' choose Contractor). Sign-in goes through Internet
 * Identity first, so it's kept in sessionStorage until RegisterPage reads it
 * as the default role. The visitor can still pick another.
 */
import type { UserRole } from "@/services/auth";

const KEY = "signupRole";
const ROLES: readonly UserRole[] = ["Homeowner", "Contractor", "Realtor"];

export function rememberSignupRole(role: UserRole): void {
  try { sessionStorage.setItem(KEY, role); } catch { /* storage blocked: no default */ }
}

export function signupRole(): UserRole | null {
  try {
    const r = sessionStorage.getItem(KEY);
    return ROLES.includes(r as UserRole) ? (r as UserRole) : null;
  } catch {
    return null;
  }
}

export function clearSignupRole(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
