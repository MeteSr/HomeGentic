/**
 * showingFeedbackService — Epic 10.4.3
 *
 * After a confirmed showing, the seller can send a one-question feedback
 * request to the buyer. Responses are stored in-memory (v1).
 */

export interface FeedbackRequest {
  id:        string;
  showingId: string;
  sentAt:    number;
  response:  string | null;
}

function createShowingFeedbackService() {
  let _store: FeedbackRequest[] = [];

  return {
    async sendRequest(showingId: string): Promise<FeedbackRequest> {
      const existing = _store.find((f) => f.showingId === showingId);
      if (existing) return existing;
      const req: FeedbackRequest = {
        id:        `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        showingId,
        sentAt:    Date.now(),
        response:  null,
      };
      _store = [..._store, req];
      return req;
    },

    async submitResponse(id: string, response: string): Promise<FeedbackRequest> {
      _store = _store.map((f) => f.id === id ? { ...f, response } : f);
      const updated = _store.find((f) => f.id === id);
      if (!updated) throw new Error(`FeedbackRequest ${id} not found`);
      return updated;
    },

    getByShowing(showingId: string): FeedbackRequest | null {
      return _store.find((f) => f.showingId === showingId) ?? null;
    },

    __reset() {
      _store = [];
    },
  };
}

export const showingFeedbackService = createShowingFeedbackService();
