/**
 * reportQAService — Epic 10.4.4
 *
 * Buyers can submit questions against a property's HomeGentic report.
 * Sellers can review them; HomeGentic data may auto-answer common questions.
 */

export interface ReportQA {
  id:         string;
  propertyId: string;
  question:   string;
  askedAt:    number;
  answer:     string | null;
}

function createReportQAService() {
  let _store: ReportQA[] = [];

  return {
    async ask(propertyId: string, question: string): Promise<ReportQA> {
      const qa: ReportQA = {
        id:         `qa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        propertyId,
        question,
        askedAt:    Date.now(),
        answer:     null,
      };
      _store = [..._store, qa];
      return qa;
    },

    getByProperty(propertyId: string): ReportQA[] {
      return _store.filter((q) => q.propertyId === propertyId);
    },

    __reset() {
      _store = [];
    },
  };
}

export const reportQAService = createReportQAService();
