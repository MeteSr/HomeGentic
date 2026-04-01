/**
 * showingRequestService — Epic 10.3.4 / 10.4.1 / 10.4.2
 *
 * In-memory store for buyer showing requests submitted on the public FSBO
 * listing page. No canister call required for v1.
 */

export type ShowingStatus = "Pending" | "Accepted" | "Declined" | "AlternatePending";

export interface ShowingRequest {
  id:            string;
  propertyId:    string;
  name:          string;
  contact:       string;
  preferredTime: string;
  createdAt:     number;
  status:        ShowingStatus;
  alternateTime?: string;
}

function createShowingRequestService() {
  let _store: ShowingRequest[] = [];

  function _find(id: string): ShowingRequest {
    const req = _store.find((r) => r.id === id);
    if (!req) throw new Error(`ShowingRequest ${id} not found`);
    return req;
  }

  function _update(id: string, patch: Partial<ShowingRequest>): ShowingRequest {
    _store = _store.map((r) => r.id === id ? { ...r, ...patch } : r);
    return _find(id);
  }

  return {
    create(input: Omit<ShowingRequest, "id" | "createdAt" | "status">): ShowingRequest {
      const req: ShowingRequest = {
        ...input,
        id:        `sr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
        status:    "Pending",
      };
      _store = [..._store, req];
      return req;
    },

    getByProperty(propertyId: string): ShowingRequest[] {
      return _store.filter((r) => r.propertyId === propertyId);
    },

    accept(id: string): ShowingRequest {
      return _update(id, { status: "Accepted" });
    },

    decline(id: string): ShowingRequest {
      return _update(id, { status: "Declined" });
    },

    proposeAlternate(id: string, alternateTime: string): ShowingRequest {
      return _update(id, { status: "AlternatePending", alternateTime });
    },

    __reset() {
      _store = [];
    },
  };
}

export const showingRequestService = createShowingRequestService();

// ─── iCal export helper (10.4.2) ──────────────────────────────────────────────

export function generateIcal(showings: ShowingRequest[]): string {
  const events = showings.map((s) => {
    const dt = new Date(s.createdAt).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return [
      "BEGIN:VEVENT",
      `UID:${s.id}@homefax`,
      `DTSTART:${dt}`,
      `DTEND:${dt}`,
      `SUMMARY:Showing — ${s.name}`,
      `DESCRIPTION:${s.preferredTime} · ${s.contact}`,
      "END:VEVENT",
    ].join("\r\n");
  }).join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HomeFax//Showings//EN",
    ...(events ? [events] : []),
    "END:VCALENDAR",
  ].join("\r\n");
}
