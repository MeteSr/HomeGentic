/**
 * showingRequestService — Epic 10.3.4
 *
 * In-memory store for buyer showing requests submitted on the public FSBO
 * listing page. No canister call required for v1 — requests are logged in
 * the session and the seller sees a notification on their next visit.
 */

export interface ShowingRequest {
  id: string;
  propertyId: string;
  name: string;
  contact: string;
  preferredTime: string;
  createdAt: number;
}

function createShowingRequestService() {
  let _store: ShowingRequest[] = [];

  return {
    create(input: Omit<ShowingRequest, "id" | "createdAt">): ShowingRequest {
      const req: ShowingRequest = {
        ...input,
        id: `sr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
      };
      _store = [..._store, req];
      return req;
    },
    getByProperty(propertyId: string): ShowingRequest[] {
      return _store.filter((r) => r.propertyId === propertyId);
    },
    __reset() {
      _store = [];
    },
  };
}

export const showingRequestService = createShowingRequestService();
