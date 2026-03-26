import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { quoteService, QuoteRequest, Quote } from "@/services/quote";
import toast from "react-hot-toast";

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<QuoteRequest | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      quoteService.getRequest(id),
      quoteService.getQuotesForRequest(id),
    ]).then(([req, qs]) => {
      setRequest(req ?? null);
      setQuotes(qs);
    }).finally(() => setLoading(false));
  }, [id]);

  const lowestAmount = Math.min(...quotes.map((q) => q.amount));

  const handleAccept = async (quoteId: string) => {
    setAccepting(quoteId);
    try {
      await quoteService.accept(quoteId);
      toast.success("Quote accepted! The contractor will be notified.");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept quote");
    } finally {
      setAccepting(null);
    }
  };

  const urgencyBadge = (urgency: string) => {
    const map: Record<string, "success" | "warning" | "error" | "default"> = {
      low: "success",
      medium: "warning",
      high: "error",
      emergency: "error",
    };
    return <Badge variant={map[urgency] || "default"}>{urgency}</Badge>;
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "48rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            color: "#6b7280",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
            padding: 0,
            marginBottom: "1rem",
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#111827", marginBottom: "1.5rem" }}>
          Quote Responses
        </h1>

        {/* Request summary */}
        {request && (
          <div
            style={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontWeight: 700, color: "#111827", marginBottom: "0.25rem" }}>
                  {request.serviceType}
                </p>
                <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>{request.description}</p>
              </div>
              {urgencyBadge(request.urgency)}
            </div>
          </div>
        )}

        {/* Quotes */}
        {quotes.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "3rem",
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
            }}
          >
            <Clock size={40} color="#d1d5db" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "#6b7280", fontWeight: 600 }}>Waiting for contractor quotes</p>
            <p style={{ fontSize: "0.875rem", color: "#9ca3af", marginTop: "0.5rem" }}>
              Typically receive 2–5 quotes within 24 hours.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
              {quotes.length} quote{quotes.length !== 1 ? "s" : ""} received
            </p>
            {quotes
              .sort((a, b) => a.amount - b.amount)
              .map((quote) => {
                const isLowest = quote.amount === lowestAmount;
                return (
                  <div
                    key={quote.id}
                    style={{
                      backgroundColor: "white",
                      border: isLowest ? "2px solid #10b981" : "1px solid #e5e7eb",
                      borderRadius: "1rem",
                      padding: "1.25rem",
                      position: "relative",
                    }}
                  >
                    {isLowest && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-0.625rem",
                          left: "1rem",
                          backgroundColor: "#10b981",
                          color: "white",
                          fontSize: "0.688rem",
                          fontWeight: 700,
                          padding: "0.125rem 0.625rem",
                          borderRadius: "9999px",
                        }}
                      >
                        Lowest Quote
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div>
                        <p style={{ fontWeight: 700, color: "#111827" }}>
                          {quote.contractor.slice(0, 10)}…
                        </p>
                        <p style={{ fontSize: "0.813rem", color: "#6b7280", marginTop: "0.125rem" }}>
                          <Clock size={12} style={{ display: "inline", marginRight: "0.25rem" }} />
                          {quote.timeline} day{quote.timeline !== 1 ? "s" : ""} to complete
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p
                          style={{
                            fontSize: "1.5rem",
                            fontWeight: 900,
                            color: isLowest ? "#059669" : "#111827",
                          }}
                        >
                          ${quote.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      loading={accepting === quote.id}
                      onClick={() => handleAccept(quote.id)}
                      variant={isLowest ? "primary" : "outline"}
                      icon={<CheckCircle size={16} />}
                      style={{ width: "100%" }}
                    >
                      Accept This Quote
                    </Button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </Layout>
  );
}
