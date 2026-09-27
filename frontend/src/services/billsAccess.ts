/**
 * What the current user may do on a property's bills — mirrors the bills
 * canister's rules so the UI never offers an action the canister will reject.
 *
 *   Owner / CoOwner  add anything (incl. mortgage), edit or remove any record
 *   Manager          add bills and non-mortgage costs, edit or remove their own
 *   Viewer           read only (the mortgage is hidden from them server-side)
 *   null             role unknown (property canister unwired or unreachable):
 *                    the canister shows only the caller's own records, so
 *                    everything visible is theirs to manage
 */

import type { AccessRole } from "./property";

export interface BillsPermissions {
  role:           AccessRole | null;
  canAdd:         boolean;
  canAddMortgage: boolean;
  canModify:      (authorPrincipal: string) => boolean;
}

export function billsPermissions(role: AccessRole | null, me: string | null): BillsPermissions {
  const fullControl = role === null || role === "Owner" || role === "CoOwner";
  return {
    role,
    canAdd:         fullControl || role === "Manager",
    canAddMortgage: fullControl,
    canModify:      (author) => fullControl || (me !== null && author === me),
  };
}

export const FULL_BILLS_PERMISSIONS = billsPermissions(null, null);
